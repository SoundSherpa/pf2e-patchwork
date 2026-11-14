import { MODULE_ID } from "../constants.mjs";
import { createSpellSurfaceLifecycle } from "./spell-surfaces.mjs";
import { spellIconPreferenceKey, spellIconsEnabled, setSpellIconsEnabled } from "./spell-icon-preferences.mjs";

export const SPELLBOOK_LOCK = "spellbookLocked";
export const spellbookLocked = actor => actor?.getFlag(MODULE_ID, SPELLBOOK_LOCK) === true;
export const canControlSpellbookLock = (actor, user) => !!user && actor?.type === "character" &&
  (user?.isGM === true || actor.isOwner === true);

const ACTIONS = new Set(["delete-item", "edit-item", "spellcasting-remove", "spellcasting-edit", "unprepare-spell"]);
const CONTROLS = '[data-action], button[data-tooltip], .prepare > button.decrease, .prepare > .popover-menu button[data-menu-id], li.spell-row > .item-controls > input[type="checkbox"]';

export function protectedSpellControl(control, root, kind, actor, entry) {
  if (!root.contains(control)) return false;
  const preparationButton = kind === "preparation" && !!control.closest("li.spell-row[data-item-id]") &&
    control.matches('button[data-tooltip="PF2E.DeleteItemTitle"], button[data-tooltip="PF2E.EditItemTitle"]');
  // PF2e's Svelte minus button is not a delete-item action. Its rank menu
  // activates on pointerup as well as click, and may already be open at lock.
  const prepare = kind === "preparation" && control.closest("li.spell-row .prepare");
  const unprepareButton = prepare && (control.matches(".prepare > button.decrease") ||
    control.matches(".prepare > .popover-menu button[data-menu-id]") &&
      !!prepare.querySelector(':scope > button.decrease[aria-expanded="true"]'));
  const flexible = kind === "preparation" && entry?.isFlexible === true &&
    control.matches('li.spell-row > .item-controls > input[type="checkbox"]');
  if (!ACTIONS.has(control.dataset.action) && !preparationButton && !unprepareButton && !flexible) return false;
  const row = control.closest("[data-item-id]");
  const spellRow = control.closest("[data-entry-id][data-item-id]");
  const collection = actor.spellcasting?.collections?.get(spellRow?.dataset.entryId);
  // Staff/item spells and matching Unified rows can be collection-owned rather
  // than actor.items. Resolve the same document PF2e casts from, not its icon.
  const item = collection?.get(spellRow?.dataset.itemId) ?? actor.items?.get(row?.dataset.itemId);
  // Flexible preparation's checkbox removes an already-prepared spell. Read
  // the document state: checkbox click pre-activation has already flipped DOM
  // checked before capture listeners run. Adding a preparation stays native.
  if (flexible) return item?.type === "spell" && item.system?.location?.signature === true;
  return item?.type === "spell" || item?.type === "spellcastingEntry";
}

export function createSpellbookLock({ hooks, getGame = () => globalThis.game, getApplications }) {
  const pending = new WeakSet();
  const iconsPending = new Set();
  const lifecycle = createSpellSurfaceLifecycle({ hooks, getGame, getApplications, kinds: ["native", "preparation"],
    install: ({ app, root, kind }) => {
      const actor = app.actor;
      const marked = new Map();
      let controls = null, button = null, iconsButton = null, alive = true;
      const text = (key, fallback, section = "Spellbook") => {
        const path = `PATCHWORK.${section}.${key}`;
        const value = getGame().i18n?.localize(path);
        return value && value !== path ? value : fallback;
      };
      const restore = () => {
        for (const [control, aria] of marked) {
          control.removeAttribute("data-patchwork-spellbook-protected");
          if (aria === null) control.removeAttribute("aria-disabled");
          else control.setAttribute("aria-disabled", aria);
        }
        marked.clear();
      };
      const refresh = () => {
        if (!alive) return;
        restore();
        const canControl = canControlSpellbookLock(actor, getGame().user);
        const host = kind === "native" ? root.querySelector("nav.sub-nav") : root.querySelector(".sheet-header");
        if (!host) { controls?.remove(); controls = button = iconsButton = null; return; }
        if (controls && !root.contains(controls)) controls = button = iconsButton = null;
        if (!controls) {
          controls = root.ownerDocument.createElement("div");
          controls.className = "patchwork-spellcasting-controls";
          controls.setAttribute("role", "group");
          controls.setAttribute("aria-label", text("Controls", "Spellcasting controls", "Spells"));
          const makeButton = (className, toggle) => {
            const control = root.ownerDocument.createElement("button");
            control.type = "button"; control.className = className;
            const icon = root.ownerDocument.createElement("i");
            icon.setAttribute("aria-hidden", "true");
            control.append(icon, root.ownerDocument.createElement("span"));
            control.addEventListener("click", toggle);
            controls.append(control);
            return control;
          };
          button = makeButton("patchwork-spellbook-lock", toggle);
          iconsButton = makeButton("patchwork-spell-icons", toggleIcons);
        }
        if (controls.previousElementSibling !== host) host.after(controls);
        const locked = spellbookLocked(actor);
        const label = locked ? text("Locked", "Spellcasting Locked") : text("Unlocked", "Spellcasting Unlocked");
        button.lastElementChild.textContent = label;
        button.firstElementChild.className = `fa-solid fa-${locked ? "lock" : "lock-open"}`;
        button.dataset.state = locked ? "locked" : "unlocked";
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(locked));
        button.title = `${label}. ${locked ? text("LockedHint", "Manual spell editing and unpreparation are locked. Casting, preparation additions and spell-slot use remain available.") :
          text("UnlockedHint", "Protect this character's spellbook against manual editing, deletion and unpreparation.")}`;
        button.disabled = !canControl || pending.has(actor);
        const enabled = spellIconsEnabled(getGame(), actor);
        const iconsLabel = enabled ? text("Enabled", "Spellcasting Icons Enabled", "Spells") :
          text("Disabled", "Spellcasting Icons Disabled", "Spells");
        iconsButton.lastElementChild.textContent = iconsLabel;
        iconsButton.firstElementChild.className = "fa-solid fa-wand-magic-sparkles";
        iconsButton.dataset.state = enabled ? "enabled" : "disabled";
        iconsButton.setAttribute("aria-label", iconsLabel);
        iconsButton.setAttribute("aria-pressed", String(enabled));
        iconsButton.title = `${iconsLabel}. ${text("ToggleHint", "Show or hide this character's spell information on supported open interfaces for this client only. Other characters, clients and spellbook locks are unchanged.", "Spells")}`;
        iconsButton.disabled = !spellIconPreferenceKey(getGame(), actor) || iconsPending.has(spellIconPreferenceKey(getGame(), actor));
        if (locked && canControl) {
          for (const control of root.querySelectorAll(CONTROLS)) {
            if (!protectedSpellControl(control, root, kind, actor, app.entry)) continue;
            marked.set(control, control.getAttribute("aria-disabled"));
            control.setAttribute("data-patchwork-spellbook-protected", "");
            control.setAttribute("aria-disabled", "true");
          }
        }
      };
      const toggle = async () => {
        if (!alive || pending.has(actor) || !canControlSpellbookLock(actor, getGame().user)) return;
        pending.add(actor); lifecycle.sync(actor.uuid);
        try {
          await actor.setFlag(MODULE_ID, SPELLBOOK_LOCK, !spellbookLocked(actor));
        } catch {
          globalThis.ui?.notifications?.error(text("SaveError", "Unable to save spellbook lock. Reopen the sheet and check permissions."));
        } finally { pending.delete(actor); lifecycle.sync(actor.uuid); }
      };
      const toggleIcons = async () => {
        const game = getGame();
        const key = spellIconPreferenceKey(game, actor), uuid = actor.uuid;
        if (!alive || !key || iconsPending.has(key)) return;
        iconsPending.add(key); lifecycle.sync(uuid);
        try {
          await setSpellIconsEnabled(game, actor, !spellIconsEnabled(game, actor));
        } catch {
          globalThis.ui?.notifications?.error(text("SaveError", "Unable to save spellcasting icon preference. Try again or reopen the sheet.", "Spells"));
        } finally { iconsPending.delete(key); lifecycle.sync(uuid); }
      };
      const guard = event => {
        if (event.type.startsWith("key") && !["Enter", " ", "Spacebar"].includes(event.key)) return;
        if (event.type === "pointerup" && event.button !== 0) return;
        if (!spellbookLocked(actor)) return;
        const control = event.target.closest?.(CONTROLS);
        if (!control || !protectedSpellControl(control, root, kind, actor, app.entry)) return;
        if (control.matches('input[type="checkbox"]')) control.checked = true;
        event.preventDefault(); event.stopImmediatePropagation();
      };
      // Capture before native delegated actions or Svelte target handlers.
      for (const type of ["click", "pointerup", "keydown", "keyup", "change"]) root.addEventListener(type, guard, true);
      return { refresh, destroy() {
        alive = false;
        for (const type of ["click", "pointerup", "keydown", "keyup", "change"]) root.removeEventListener(type, guard, true);
        controls?.remove(); restore();
      } };
    }
  });
  return lifecycle;
}
