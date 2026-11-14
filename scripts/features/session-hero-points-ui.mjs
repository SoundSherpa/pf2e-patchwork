import { MODULE_ID } from "../constants.mjs";
import { HERO_ENABLED, HERO_DEFAULT, HERO_DECK, HERO_OVERRIDES, heroRoster, isHeroPointGM } from "./session-hero-points.mjs";
import { createSessionHeroPointReset } from "./session-hero-points-reset.mjs";

export const SESSION_HERO_MACRO = `if (!game.user.isGM) return ui.notifications.warn("Only the GM can start a session reset.");
const api = game.modules.get("pf2e-patchwork-qol")?.api;
if (!api?.resetSessionHeroPoints) return ui.notifications.error("Enable PF2e Patchwork to use this launcher.");
await api.resetSessionHeroPoints();`;

export function createSessionHeroPointUI({ hooks, getGame = () => globalThis.game, service,
  getDialogClass = () => globalThis.foundry?.applications?.api?.DialogV2,
  getDocument = () => globalThis.document } = {}) {
  let active = null, menuType = null, stopped = false, running = false;
  const parties = new Map(), registrations = [];
  const resetUI = createSessionHeroPointReset({ getGame, service, getDialogClass, getDocument });
  const loc = key => getGame().i18n.localize(`PATCHWORK.HeroPoints.${key}`);
  function getMenuType() {
    if (menuType) return menuType;
    const Dialog = getDialogClass();
    if (typeof Dialog !== "function") return null;
    menuType = class SessionHeroPointMenu extends Dialog {
      constructor() {
        if (stopped || !isHeroPointGM(getGame())) throw new Error("GM permissions required.");
        if (active) { active.refreshRoster(); return active; }
        const document = getDocument(), panel = document.createElement("div"), wrapper = document.createElement("div");
        panel.dataset.patchwork = "session-hero-points"; wrapper.append(panel);
        const state = { closed: false, busy: false, dirty: false, expected: "", detach: () => {}, hooks: [] };
        const node = (tag, text) => { const element = document.createElement(tag); if (text) element.textContent = text; return element; };
        let dialog;
        const status = node("p"); status.dataset.part = "status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
        const rosterArea = node("div"); rosterArea.dataset.part = "roster"; rosterArea.tabIndex = 0; rosterArea.setAttribute("role", "region"); rosterArea.setAttribute("aria-label", loc("CharacterList"));
        const rememberScroll = () => { state.scroll = rosterArea.scrollTop; };
        rosterArea.addEventListener("scroll", rememberScroll);
        const empty = node("p"); empty.dataset.part = "empty";
        const deckChoice = node("input"); deckChoice.type = "checkbox"; deckChoice.name = "refreshActions";
        const deckLabel = node("label", loc("DeckChoice")); deckLabel.prepend(deckChoice);
        const deckHint = node("p", loc("DeckHint"));
        const macro = node("textarea"); macro.readOnly = true; macro.rows = 5; macro.value = SESSION_HERO_MACRO;
        macro.setAttribute("aria-label", loc("LaunchMacro"));
        const macroBox = node("details"), summary = node("summary", loc("LaunchMacro")); macroBox.append(summary, node("p", loc("MacroHint")), macro);
        const contents = [node("p", loc("PolicyHint")), rosterArea,
          deckLabel, deckHint, empty, status, macroBox];
        panel.append(...contents);

        function refreshButtons() {
          const root = dialog?.element?.querySelector('[data-patchwork="session-hero-points"]');
          if (!root || state.closed) return;
          const gm = isHeroPointGM(getGame());
          for (const control of root.querySelectorAll("input, select, button")) {
            const disabled = state.busy || !gm || control.dataset.ineligible === "true";
            if (control.disabled !== disabled) control.disabled = disabled;
          }
          for (const action of ["saveOverrides", "refresh"]) {
            const button = dialog.element.querySelector(`button[data-action="${action}"]`);
            const disabled = state.busy || !gm;
            if (button && button.disabled !== disabled) button.disabled = disabled;
          }
        }

        function buildRoster(preserve = false) {
          const scroll = rosterArea.isConnected ? rosterArea.scrollTop : state.scroll ?? 0, drafts = new Map();
          const focused = document.activeElement, focusRow = focused?.closest?.('[data-actor-uuid]');
          const focus = focusRow ? [focusRow.dataset.actorUuid, focused.name] : null;
          if (preserve && state.dirty) for (const row of rosterArea.querySelectorAll('[data-actor-uuid]')) drafts.set(row.dataset.actorUuid, {
            points: row.querySelector('[name=points]')?.value, included: row.querySelector('[name=included]')?.checked
          });
          rosterArea.replaceChildren(); empty.textContent = "";
          try {
            const roster = heroRoster(getGame());
            if (!preserve || !state.dirty) {
              deckChoice.checked = roster.config.deck;
              state.expectedDeck = roster.config.deck;
              state.expected = JSON.stringify(roster.config.overrides);
              state.dirty = false;
            }
            state.party = roster.party;
            if (!roster.party) empty.textContent = loc("NoParty");
            else if (!roster.rows.length) empty.textContent = loc("NoCharacters");
            for (const row of roster.rows) {
              const item = node("fieldset"); item.className = "patchwork-hero-character"; item.dataset.actorUuid = row.uuid ?? "";
              item.append(node("legend", row.name));
              const included = node("input"); included.type = "checkbox"; included.name = "included";
              included.checked = !row.reason;
              included.dataset.ineligible = String(!!row.reason && !["excluded", "companion"].includes(row.reason));
              if (row.reason) { included.title = loc(`Reasons.${row.reason}`); included.setAttribute("aria-description", included.title); }
              const inclusion = node("label", loc("Include")); inclusion.prepend(included); item.append(inclusion);
              const rule = roster.config.overrides[row.uuid] ?? {};
              if (/^Actor\.[A-Za-z0-9_-]+$/.test(row.uuid) && getGame().actors.get(row.id)?.type === "character") {
                const select = node("select"); select.name = "points";
                const fallback = node("option", `${loc("UseDefault")} (${roster.config.points})`); fallback.value = ""; select.append(fallback);
                for (let points = 0; points <= 3; points++) { const option = node("option", String(points)); option.value = String(points); select.append(option); }
                select.value = rule.points === undefined ? "" : String(rule.points);
                const override = node("label", loc("Override")); override.append(select); item.append(override);
              }
              const draft = drafts.get(row.uuid);
              if (draft) {
                const select = item.querySelector('[name=points]'); if (select && draft.points !== undefined) select.value = draft.points;
                if (included.dataset.ineligible !== "true") included.checked = draft.included;
              }
              rosterArea.append(item);
            }
            status.textContent = getGame().settings.get(MODULE_ID, HERO_ENABLED) !== true ? loc("Disabled") :
              loc(state.dirty ? "Unsaved" : "ConfigReady");
          } catch { status.textContent = loc("Errors.configuration"); }
          rosterArea.scrollTop = scroll;
          state.scroll = rosterArea.scrollTop;
          if (focus) for (const row of rosterArea.querySelectorAll('[data-actor-uuid]')) {
            if (row.dataset.actorUuid === focus[0]) row.querySelector(`[name="${focus[1]}"]`)?.focus({ preventScroll: true });
          }
          refreshButtons();
        }

        function mount() {
          state.detach();
          const root = dialog.element.querySelector('[data-patchwork="session-hero-points"]');
          if (!root) return;
          // DialogV2 renders the content wrapper's innerHTML. Adopt the live nodes
          // once so drafts, delegated events and resource rows use that DOM.
          const scroll = state.scroll ?? 0;
          if (!root.contains(rosterArea)) root.replaceChildren(...contents);
          rosterArea.scrollTop = scroll;
          const change = event => {
            state.dirty = true; status.textContent = loc("Unsaved"); refreshButtons();
          };
          root.addEventListener("input", change); root.addEventListener("change", change);
          const Observer = document.defaultView.MutationObserver, footer = dialog.element.querySelector("footer");
          const observer = new Observer(refreshButtons); if (footer) observer.observe(footer, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
          state.detach = () => { observer.disconnect(); root.removeEventListener("input", change); root.removeEventListener("change", change); };
          refreshButtons();
        }

        async function saveOverrides() {
          if (state.busy || state.closed) return;
          const changes = {};
          for (const row of rosterArea.querySelectorAll("[data-actor-uuid]")) {
            const select = row.querySelector('select[name="points"]'), included = row.querySelector('input[name="included"]');
            if (select && included.dataset.ineligible !== "true") changes[row.dataset.actorUuid] = {
              ...(select.value === "" ? {} : { points: Number(select.value) }), excluded: !included.checked };
          }
          state.busy = true; refreshButtons();
          try {
            await service.saveOverrides(changes, state.expected, { deck: deckChoice.checked, expectedDeck: state.expectedDeck });
            if (!state.closed) {
              buildRoster(); status.textContent = loc("Saved");
            }
          }
          catch (error) { if (!state.closed) status.textContent = error.code === "stale" ? loc("ConfigConflict") : loc(`Errors.${error.code ?? "save"}`); }
          finally { state.busy = false; refreshButtons(); }
        }

        super({ window: { title: loc("Title") }, position: { width: 680 }, classes: ["patchwork-session-hero-points", "patchwork-hero-config"],
          content: wrapper, form: { closeOnSubmit: false }, buttons: [
            { action: "saveOverrides", label: loc("Save"), callback: saveOverrides },
            { action: "refresh", label: loc("Refresh"), callback: () => dialog.refreshRoster() },
            { action: "cancel", label: loc("Cancel"), type: "button", callback: () => dialog.close() }
          ] });
        dialog = this; active = this;
        this.refreshRoster = () => { if (!state.busy && !state.closed) buildRoster(true); };
        this.addEventListener("render", mount);
        const updateActor = actor => {
          if (!state.busy && !state.closed && (actor.uuid === state.party || getGame().actors?.party?.members?.includes(actor))) buildRoster(true);
        };
        const setting = setting => {
          if (!state.busy && !state.closed && ([HERO_ENABLED, HERO_DEFAULT, HERO_DECK, HERO_OVERRIDES].some(key => setting.key === `${MODULE_ID}.${key}`) || setting.key === 'pf2e.activeParty')) buildRoster(true);
        };
        for (const [event, callback] of [["updateActor", updateActor], ["deleteActor", () => { if (!state.busy && !state.closed) buildRoster(true); }],
          ["updateUser", () => { if (!state.busy && !state.closed) buildRoster(true); }], ["updateSetting", setting]]) state.hooks.push([event, hooks.on(event, callback)]);
        const close = () => {
          state.closed = true; state.detach(); rosterArea.removeEventListener("scroll", rememberScroll);
          for (const [event, id] of state.hooks) hooks.off(event, id);
          this.removeEventListener("render", mount); active = null;
        };
        this.addEventListener("close", close, { once: true });
        buildRoster();
      }
    };
    return menuType;
  }
  const open = async (options = {}) => {
    if (stopped || !isHeroPointGM(getGame())) throw Object.assign(new Error("GM permissions required."), { code: "authority" });
    if (options.partyUuid && options.partyUuid !== getGame().actors?.party?.uuid) throw Object.assign(new Error("Party changed."), { code: "party" });
    const Type = getMenuType(); if (!Type) throw new Error("DialogV2 unavailable.");
    const dialog = new Type(); await dialog.render({ force: true }); return dialog;
  };
  const removeParty = app => { const record = parties.get(app); record?.button.remove(); parties.delete(app); };
  const renderParty = (app, html = app.element) => {
    if (!running || app.actor?.type !== "party" || !isHeroPointGM(getGame())) { removeParty(app); return; }
    const root = html?.querySelector ? html : html?.[0];
    const nav = root?.querySelector("form > nav.sub-nav") ?? (root?.matches?.("form") ? root.querySelector(":scope > nav.sub-nav") : null);
    if (!nav) return; // A partial overview render must not remove the existing control.
    let record = parties.get(app);
    if (record && !root.contains(record.button)) { removeParty(app); record = null; }
    if (!record) {
      const button = nav.ownerDocument.createElement("button"); button.type = "button";
      button.dataset.patchwork = "session-hero-points-launch";
      const icon = nav.ownerDocument.createElement("i"); icon.className = "fa-solid fa-medal"; icon.setAttribute("aria-hidden", "true");
      button.append(icon, nav.ownerDocument.createTextNode(` ${loc("Reset")}`));
      button.addEventListener("click", async () => {
        try { await resetUI.reset({ partyUuid: app.actor.uuid }); }
        catch (error) { globalThis.ui?.notifications?.error(loc(`Errors.${error.code ?? "uncertain"}`)); }
      });
      record = { button }; parties.set(app, record); nav.after(button);
    }
    record.button.disabled = app.actor !== getGame().actors.party;
    record.button.title = record.button.disabled ? loc("Errors.party") : loc("ResetHint");
  };
  return { getMenuType, open, reset: resetUI.reset, start() {
    if (running || stopped) return; running = true;
    for (const [event, callback] of [["renderPartySheetPF2e", renderParty], ["closePartySheetPF2e", removeParty],
      ["updateUser", () => { for (const app of parties.keys()) renderParty(app); }],
      ["deleteActor", actor => { for (const app of parties.keys()) if (app.actor === actor) removeParty(app); }]]) registrations.push([event, hooks.on(event, callback)]);
    for (const app of Object.values(globalThis.ui?.windows ?? {})) if (app.actor?.type === "party") renderParty(app);
  }, stop() {
    stopped = true; running = false; service.stop();
    for (const [event, id] of registrations) hooks.off(event, id);
    for (const app of parties.keys()) removeParty(app);
    return Promise.all([active?.close(), resetUI.stop()]);
  } };
}
