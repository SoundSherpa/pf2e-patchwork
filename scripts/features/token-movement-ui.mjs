import { MOVEMENT_ENABLED } from "./token-movement.mjs";
import { MODULE_ID } from "../constants.mjs";

const PALETTE = "pf2e-patchwork-qol-movement";

// Visibility is a HUD-only policy. Use actual embedded combatants, rather than
// TokenDocument.combatant (which PF2e may resolve to a troop representative).
export function hasStartedMovementCombat(game, canvas, doc) {
  try {
    const scene = canvas?.scene;
    if (!canvas.ready || !scene?.id || doc?.parent !== scene || !doc?.id || !doc.object || doc.object.isPreview ||
      scene.tokens.get(doc.id) !== doc || canvas.tokens.get(doc.id) !== doc.object) return false;
    return game.combats?.some(combat => combat.started === true && combat.combatants.some(combatant => {
      if (combatant.parent !== combat) return false;
      const resolved = combatant.token;
      // Encounter.scene may be null or different. Native token resolution uses
      // the combatant's sceneId first. A resolved different token is authoritative.
      return resolved != null ? resolved === doc :
        combatant.sceneId === scene.id && combatant.tokenId === doc.id;
    })) === true;
  } catch { return false; }
}

export function createTokenMovementUI({ hooks, service, getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas, getNotifications = () => globalThis.ui?.notifications } = {}) {
  let record = null, running = false, stopped = false, listening = false;
  const registrations = [];
  const loc = key => getGame().i18n.localize(`PATCHWORK.Movement.${key}`);
  const inCombat = doc => hasStartedMovementCombat(getGame(), getCanvas(), doc);
  const current = item => !stopped && running && record === item && item.root.isConnected && item.app.rendered &&
    item.app.object?.document === item.doc && getCanvas()?.hud?.token === item.app && inCombat(item.doc);

  function position(item) {
    if (!current(item) || item.app.activePalette !== PALETTE) return;
    const { menu, root, button } = item;
    menu.style.left = "0px"; menu.style.top = "0px";
    let bounds = menu.getBoundingClientRect();
    const sx = bounds.width / menu.offsetWidth || 1, sy = bounds.height / menu.offsetHeight || 1;
    const width = root.ownerDocument.documentElement.clientWidth, height = root.ownerDocument.documentElement.clientHeight, margin = 8;
    menu.style.maxWidth = `${Math.max(1, width - margin * 2) / sx}px`;
    menu.style.maxHeight = `${Math.max(1, height - margin * 2) / sy}px`;
    bounds = menu.getBoundingClientRect();
    const columns = [...root.querySelectorAll(":scope > .col")].map(col => col.getBoundingClientRect());
    const edge = { left: Math.min(...columns.map(b => b.left)), right: Math.max(...columns.map(b => b.right)),
      top: Math.min(...columns.map(b => b.top)), bottom: Math.max(...columns.map(b => b.bottom)) };
    const anchor = button.getBoundingClientRect();
    let x = edge.left - bounds.width - margin, y = anchor.top;
    if (x < margin) {
      x = edge.right + margin;
      if (x + bounds.width > width - margin) {
        x = anchor.left;
        y = edge.bottom + margin + bounds.height <= height - margin ? edge.bottom + margin : edge.top - bounds.height - margin;
      }
    }
    x = Math.max(margin, Math.min(x, width - margin - bounds.width));
    y = Math.max(margin, Math.min(y, height - margin - bounds.height));
    // Position only the owned palette, accounting for native HUD/canvas scale.
    // Never reposition the HUD, a token, or another module's palette.
    menu.style.left = `${(x - bounds.left) / sx}px`; menu.style.top = `${(y - bounds.top) / sy}px`;
  }

  function refresh(item = record) {
    if (!item || !current(item)) return;
    const open = item.app.activePalette === PALETTE, busy = service.isBusy(item.doc);
    item.button.setAttribute("aria-expanded", String(open));
    item.button.disabled = busy; item.menu.setAttribute("aria-busy", String(busy));
    for (const button of item.actions) {
      const reason = service.availability(item.doc, button.dataset.patchworkMovementAction);
      button.disabled = busy;
      button.title = reason ? loc(`Errors.${reason}`) : button.dataset.patchworkMovementAction === "reset" ? loc("ResetHint") : loc("UndoHint");
      button.tabIndex = open && !button.disabled && button === item.actions.find(entry => !entry.disabled) ? 0 : -1;
    }
    if (open && !item.open) position(item);
    item.open = open;
  }

  function remove() {
    const item = record; if (!item) return;
    record = null; item.detach();
    if (item.app.activePalette === PALETTE) {
      try { item.app.togglePalette(null); } catch { /* Native HUD may already be torn down. */ }
    }
    item.button.remove(); item.menu.remove();
  }

  async function invoke(action, doc, options) {
    if (!["reset", "undo"].includes(action)) throw Object.assign(new Error("Unsupported movement action"), { code: "unsupported" });
    const promise = action === "reset" ? service.resetTraveledDistance(doc, options) : service.undoRecordedMovement(doc, options);
    refresh();
    try { return await promise; } finally { refresh(); }
  }

  function render(app, html = app.element) {
    if (!running || stopped || app !== getCanvas()?.hud?.token) return;
    const doc = app.object?.document, reason = service.availability(doc);
    if (!inCombat(doc) || reason && reason !== "moving") { remove(); return; }
    const root = html?.querySelector ? html : html?.[0], column = root?.querySelector(":scope > .col.left");
    if (!root?.matches?.("form.placeable-hud") || !column || typeof app.togglePalette !== "function") { remove(); return; }
    if (record?.root === root && record.doc === doc && root.contains(record.button) && root.contains(record.menu)) { refresh(); return; }
    remove();
    const document = root.ownerDocument, button = document.createElement("button"), menu = document.createElement("div");
    button.type = "button"; button.className = "control-icon"; button.dataset.action = "togglePalette";
    button.dataset.palette = PALETTE; button.dataset.patchwork = "movement-history-button";
    button.dataset.tooltip = loc("Title"); button.setAttribute("aria-label", loc("Title"));
    button.setAttribute("aria-haspopup", "menu"); button.setAttribute("aria-expanded", "false");
    const icon = document.createElement("i"); icon.className = "fa-solid fa-clock-rotate-left"; icon.setAttribute("aria-hidden", "true"); button.append(icon);
    menu.className = "palette palette-list"; menu.dataset.palette = PALETTE; menu.dataset.patchwork = "movement-history-menu";
    menu.id = `${PALETTE}-${doc.id}`; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", loc("Title"));
    button.setAttribute("aria-controls", menu.id);
    const actions = ["reset", "undo"].map(action => {
      const entry = document.createElement("button"); entry.type = "button"; entry.className = "palette-list-entry";
      entry.dataset.patchworkMovementAction = action; entry.setAttribute("role", "menuitem"); entry.tabIndex = -1;
      const icon = document.createElement("i"); icon.className = action === "reset" ? "fa-solid fa-ruler-horizontal" : "fa-solid fa-rotate-left";
      icon.setAttribute("aria-hidden", "true"); entry.append(icon, document.createTextNode(loc(action === "reset" ? "Reset" : "Undo"))); return entry;
    });
    menu.append(...actions); column.append(button, menu);
    const item = { app, root, doc, button, menu, actions, open: false }; record = item;
    const defer = callback => document.defaultView.queueMicrotask(() => { if (current(item)) callback(); });
    const focus = index => {
      const enabled = actions.filter(entry => !entry.disabled); if (!enabled.length) return;
      const target = enabled[(index + enabled.length) % enabled.length];
      for (const entry of actions) entry.tabIndex = entry === target ? 0 : -1;
      target.focus();
    };
    // Let ApplicationV2's existing togglePalette action own pointer/Enter/Space
    // activation; keyboard focus is restored after core focuses the canvas.
    const click = event => defer(() => { refresh(item); if (event.detail === 0 && button.contains(event.target) && item.open) focus(0); });
    const key = event => {
      if (!button.contains(event.target) && !menu.contains(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); app.togglePalette(PALETTE, false); refresh(item); button.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        app.togglePalette(PALETTE, true); refresh(item);
        const enabled = actions.filter(entry => !entry.disabled), index = enabled.indexOf(document.activeElement);
        focus(event.key === "Home" ? 0 : event.key === "End" ? -1 : index < 0 ? (event.key === "ArrowUp" ? -1 : 0) : index + (event.key === "ArrowUp" ? -1 : 1));
      }
    };
    const perform = async event => {
      const target = event.target.closest?.("[data-patchwork-movement-action]");
      if (!target || !menu.contains(target) || target.disabled) return;
      event.preventDefault(); event.stopPropagation();
      if (!current(item)) { sync(); return; }
      app.togglePalette(PALETTE, false); refresh(item);
      try {
        const result = await invoke(target.dataset.patchworkMovementAction, doc, { isCurrent: () => current(item) });
        if (current(item)) getNotifications()?.[result.status === "uncertain" ? "warn" : "info"](
          loc(result.status === "uncertain" ? "Errors.uncertain" : `Results.${result.status}`));
      } catch (error) { if (current(item)) getNotifications()?.warn(loc(`Errors.${error.code ?? "native"}`)); }
    };
    const observer = new document.defaultView.MutationObserver(() => refresh(item));
    observer.observe(menu, { attributes: true, attributeFilter: ["class", "hidden"] });
    root.addEventListener("click", click); root.addEventListener("keydown", key); menu.addEventListener("click", perform);
    item.detach = () => { observer.disconnect(); root.removeEventListener("click", click); root.removeEventListener("keydown", key); menu.removeEventListener("click", perform); };
    refresh(item);
  }

  const sync = () => {
    if (stopped || !running) return;
    if (getGame().settings.get(MODULE_ID, MOVEMENT_ENABLED) !== true) { unlisten(); remove(); return; }
    listen();
    const app = getCanvas()?.hud?.token;
    if (app?.rendered && app.element?.isConnected) render(app, app.element);
    else remove();
    if (record?.open) position(record);
  };
  const api = Object.freeze({ resetTraveledDistance: doc => invoke("reset", doc), undoRecordedMovement: doc => invoke("undo", doc) });
  function listen() {
    if (listening) return; listening = true;
    for (const [event, callback] of [
      ["renderTokenHUD", render], ["closeTokenHUD", app => { if (record?.app === app) remove(); }],
      ["canvasTearDown", remove], ["canvasReady", sync], ["tearDownTokenLayer", remove],
      ["deleteToken", doc => { if (record?.doc === doc) remove(); }],
      ["updateToken", doc => { if (getCanvas()?.hud?.token?.object?.document === doc) sync(); }],
      ["updateActor", actor => { if (getCanvas()?.hud?.token?.object?.document?.actor?.id === actor.id) sync(); }],
      ["updateUser", user => { if (user.id === getGame().user?.id) sync(); }],
      ["createCombat", sync], ["deleteCombat", sync],
      ["updateCombat", (_combat, changes) => { if (["round", "scene", "active"].some(key => Object.hasOwn(changes, key))) sync(); }],
      ["createCombatant", sync], ["deleteCombatant", sync],
      ["updateCombatant", (_combatant, changes) => {
        if (["tokenId", "sceneId"].some(key => Object.hasOwn(changes, key))) sync();
      }],
      ["pauseGame", sync], ["controlToken", sync], ["canvasPan", () => { if (record) position(record); }]
    ]) registrations.push([event, hooks.on(event, callback)]);
    globalThis.window?.addEventListener("resize", sync);
  }
  function unlisten() {
    listening = false;
    for (const [event, id] of registrations.splice(0)) hooks.off(event, id);
    globalThis.window?.removeEventListener("resize", sync);
  }
  return { api, sync, start() {
    if (stopped || running) return; running = true; sync();
  }, stop() {
    stopped = true; running = false; service.stop(); remove(); unlisten();
  } };
}
