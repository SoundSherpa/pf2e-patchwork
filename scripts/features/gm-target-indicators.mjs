import { MODULE_ID } from "../constants.mjs";

export const GM_TARGET_SETTING = "hideGMTargetIndicators";

export function registerGMTargetSettings(settings, onChange = () => {}) {
  settings.register(MODULE_ID, GM_TARGET_SETTING, {
    name: "PATCHWORK.Settings.HideGMTargetIndicators.Name",
    hint: "PATCHWORK.Settings.HideGMTargetIndicators.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
    onChange
  });
}

// Public graphics and refresh hooks; no Token methods or target collections are patched.
// Geometry follows the inspected 14.370 pip presentation. See docs/gm-target-indicators.md.
export function suppressGMTargetPips(token, user, uiScale) {
  if (user?.isGM !== false || token?.destroyed || !(token?.targeted instanceof Set)
    || !Number.isFinite(token.w) || token.w < 0 || !Number.isFinite(uiScale) || uiScale <= 0
    || typeof token.renderFlags?.set !== "function") return false;
  const graphics = token.targetPips;
  if (!graphics || graphics.destroyed
    || !["clear", "beginFill", "lineStyle", "drawCircle", "endFill"]
      .every((method) => typeof graphics[method] === "function")) return false;

  const others = [...token.targeted].filter((targeter) => targeter !== user);
  // Unknown user contracts get native rendering, rather than guessing ownership.
  if (others.some((targeter) => typeof targeter?.isGM !== "boolean")
    || !others.some((targeter) => targeter.isGM)) return false;
  const players = others.filter((targeter) => !targeter.isGM);
  graphics.clear();
  const origin = token.w / 2 + (players.length % 2 === 0 ? 8 : 0);
  for (let index = 0; index < players.length; index += 1) {
    const step = Math.ceil(index / 2) * 16 * (index % 2 === 0 ? 1 : -1);
    graphics.beginFill(players[index].color, 1);
    graphics.lineStyle(2 * uiScale, 0);
    graphics.drawCircle(origin + step, 0, 6 * uiScale);
  }
  graphics.endFill();
  return true;
}

export function createGMTargetIndicators({ hooks, getGame, getCanvas = () => globalThis.canvas }) {
  const listeners = [];
  const modified = new Set();
  let running = false;
  let disposed = false;

  function enabled() {
    const game = getGame();
    return running && game.system?.id === "pf2e" && Number(game.release?.generation) === 14
      && game.modules.get(MODULE_ID)?.active !== false && game.user?.isGM === false
      && game.settings.get(MODULE_ID, GM_TARGET_SETTING) === true;
  }

  function requestNativeRefresh(tokens) {
    for (const token of tokens) {
      if (token && !token.destroyed) token.renderFlags?.set?.({ refreshTarget: true });
    }
  }

  function restore() {
    const tokens = [...modified];
    modified.clear();
    requestNativeRefresh(tokens);
  }

  function sync() {
    if (!running || disposed) return;
    if (enabled()) requestNativeRefresh(getCanvas()?.tokens?.placeables ?? []);
    else restore();
  }

  function present(token) {
    if (!enabled()) {
      restore();
      return;
    }
    try {
      if (suppressGMTargetPips(token, getGame().user, getCanvas()?.dimensions?.uiScale)) {
        modified.add(token);
      }
      // Keep references for native restoration on cleanup; teardown/deletion releases them.
    } catch (error) {
      // A graphics failure must not leave a repeating hook or a partially drawn pip set.
      modified.add(token);
      stop();
      throw error;
    }
  }

  function start() {
    if (running || disposed) return;
    running = true;
    try {
      for (const [event, callback] of [
        ["refreshToken", present],
        ["drawToken", present],
        ["targetToken", (_user, token) => { if (enabled()) requestNativeRefresh([token]); }],
        ["canvasReady", sync],
        ["canvasTearDown", () => modified.clear()],
        ["destroyToken", (token) => modified.delete(token)],
        ["userConnected", sync],
        ["updateUser", sync],
        ["deleteUser", sync]
      ]) listeners.push([event, hooks.on(event, callback)]);
      sync();
    } catch (error) {
      stop();
      throw error;
    }
  }

  function stop() {
    running = false;
    for (const [event, id] of listeners.splice(0)) hooks.off(event, id);
    restore();
  }

  function destroy() {
    disposed = true;
    stop();
  }

  return Object.freeze({ start, stop, sync, destroy });
}
