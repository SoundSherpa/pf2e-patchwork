import { MODULE_ID } from "../constants.mjs";

export const MOVEMENT_ENABLED = "tokenMovementReset";
export const MOVEMENT_ACCESS = "tokenMovementAccess";

export function registerTokenMovementSettings(settings, onChange) {
  const common = { scope: "world", config: true, restricted: true, onChange };
  settings.register(MODULE_ID, MOVEMENT_ENABLED, { ...common, name: "PATCHWORK.Movement.Enable",
    hint: "PATCHWORK.Movement.EnableHint", type: Boolean, default: false });
  settings.register(MODULE_ID, MOVEMENT_ACCESS, { ...common, name: "PATCHWORK.Movement.Access",
    hint: "PATCHWORK.Movement.AccessHint", type: String, default: "authorized",
    choices: { gm: "PATCHWORK.Movement.GMOnly", authorized: "PATCHWORK.Movement.Authorized" } });
}

const fail = code => Object.assign(new Error(`PF2e Patchwork movement: ${code}`), { code });
const history = doc => {
  const value = doc.movementHistory;
  if (!Array.isArray(value)) throw fail("unsupported");
  return value;
};
export function createTokenMovement({ getGame = () => globalThis.game, getCanvas = () => globalThis.canvas } = {}) {
  let stopped = false;
  const pending = new Set();
  function availability(doc, action = "reset") {
    try {
      const game = getGame(), canvas = getCanvas();
      if (stopped || game?.system?.id !== "pf2e" || Number(game.release?.generation) !== 14 ||
        game.modules.get(MODULE_ID)?.active === false || game.settings.get(MODULE_ID, MOVEMENT_ENABLED) !== true) return "disabled";
      if (!["reset", "undo"].includes(action)) return "unsupported";
      if (!canvas?.ready || !doc?.id || !doc.uuid || !doc.object || doc.object.isPreview ||
        doc.parent !== canvas.scene || canvas.scene?.tokens?.get(doc.id) !== doc ||
        canvas.tokens?.get(doc.id) !== doc.object) return "token";
      const user = game.user, policy = game.settings.get(MODULE_ID, MOVEMENT_ACCESS);
      if (!["gm", "authorized"].includes(policy)) return "unsupported";
      if (user?.isGM !== true && policy !== "authorized") return "policy";
      if (!user?.active || doc.canUserModify?.(user, "update") !== true) return "permission";
      // Use native functional checks, including provider wrappers and PF2e's
      // control restriction. Actor ownership alone does not authorize a token.
      if (!user.isGM && (game.paused || doc.object.can?.(user, "control") !== true ||
        doc.object.can?.(user, "drag") !== true)) return "permission";
      if (typeof doc.clearMovementHistory !== "function" || typeof doc.revertRecordedMovement !== "function" ||
        !["completed", "stopped", "pending", "paused"].includes(doc.movement?.state)) return "unsupported";
      if (["pending", "paused"].includes(doc.movement.state) ||
        doc.object.animationContexts?.has(doc.object.movementAnimationName)) return "moving";
      history(doc);
      return null;
    } catch { return "unsupported"; }
  }

  async function execute(action, doc, { isCurrent = () => true } = {}) {
    const reason = availability(doc, action); if (reason) throw fail(reason);
    if (pending.has(doc.uuid)) throw fail("busy");
    const key = doc.uuid; pending.add(key);
    const scene = getCanvas().scene;
    const check = () => {
      if (!isCurrent() || getCanvas()?.scene !== scene) throw fail("stale");
      const reason = availability(doc, action); if (reason) throw fail(reason);
    };
    try {
      check();
      const hadHistory = history(doc).length > 0;
      let result;
      try {
        // No arguments: preserve core's whole-recording rollback, native update
        // permission checks, displacement semantics and animate:false behavior.
        result = action === "reset" ? await doc.clearMovementHistory() : await doc.revertRecordedMovement();
      } catch { throw fail("native"); }
      // HUD closure/scene changes cannot recall an accepted request or turn a
      // native-confirmed rollback into a failure. The UI suppresses late notices.
      let contextChanged = stopped;
      try { contextChanged ||= !isCurrent() || getCanvas()?.scene !== scene || scene.tokens.get(doc.id) !== doc; }
      catch { contextChanged = true; }
      let outcome;
      if (action === "undo") outcome = result === true ? { status: "undone" } :
        result === false && !hadHistory ? { status: "empty" } : { status: "uncertain", reason: "not-undone" };
      else {
        try { outcome = history(doc).length === 0 ? { status: hadHistory ? "reset" : "empty" } : { status: "uncertain", reason: "not-cleared" }; }
        catch { outcome = { status: "uncertain", reason: "not-cleared" }; }
      }
      return contextChanged ? { ...outcome, contextChanged: true } : outcome;
    } finally { pending.delete(key); }
  }
  return { availability, isBusy: doc => pending.has(doc?.uuid),
    resetTraveledDistance: (doc, options) => execute("reset", doc, options),
    undoRecordedMovement: (doc, options) => execute("undo", doc, options),
    stop() { stopped = true; } };
}
