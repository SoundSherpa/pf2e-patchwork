import { MODULE_ID } from "../constants.mjs";

export const SILENT_INITIATIVE = "silentGMInitiative";
export const SILENT_INITIATIVE_FLAG = "silentInitiative";
export const INITIATIVE_MODES = Object.freeze(["disabled", "party", "party-friendly", "party-friendly-neutral"]);

// String settings cast legacy stored booleans to "true"/"false" in Foundry.
export function initiativeMode(value) {
  if (value === true || value === "true") return "party";
  if (value === false || value === "false") return "disabled";
  return INITIATIVE_MODES.includes(value) ? value : "disabled";
}

/** PF2e has party/opposition/null; Friendly is the non-party-owned allied subset. */
export function initiativeAlliance(actor, game) {
  if (!actor) return "unknown";
  const alliance = actor.alliance;
  // PF2e encounter analysis treats hazards as opposition even with null alliance.
  if (alliance === "opposition" || actor.type === "hazard") return "opposition";
  if (alliance === null) return "neutral";
  if (alliance !== "party") return "unknown";
  const member = game.actors?.party?.members?.some(a => a === actor || typeof actor.uuid === "string" && a.uuid === actor.uuid);
  return actor.hasPlayerOwner === true || member ? "party" : "friendly";
}

export function initiativeAllowed(actor, game, mode) {
  if (!INITIATIVE_MODES.includes(mode) || mode === "disabled") return false;
  const group = initiativeAlliance(actor, game);
  return group === "party" || group === "friendly" && mode !== "party" ||
    group === "neutral" && mode === "party-friendly-neutral";
}

export async function migrateInitiativeSetting(game) {
  // One active GM writes the idempotent conversion. Others still read legacy
  // values safely, including while no GM is online or a write is rejected.
  const gm = [...(game.users ?? [])].filter(u => u.active && u.isGM).map(u => u.id).sort()[0];
  if (!game.user?.isGM || gm !== game.user.id || typeof game.settings.set !== "function") return false;
  const value = game.settings.get(MODULE_ID, SILENT_INITIATIVE);
  if (![true, false, "true", "false"].includes(value)) return false;
  await game.settings.set(MODULE_ID, SILENT_INITIATIVE, initiativeMode(value));
  return true;
}

export function registerSilentInitiativeSetting(settings) {
  settings.register(MODULE_ID, SILENT_INITIATIVE, {
    name: "PATCHWORK.Initiative.Name", hint: "PATCHWORK.Initiative.Hint",
    scope: "world", restricted: true, config: true, type: String, default: "disabled",
    choices: Object.fromEntries(INITIATIVE_MODES.map(mode => [mode, `PATCHWORK.Initiative.Modes.${mode}`])),
    requiresReload: false
  });
}

export function silenceInitiative(message, game, userId) {
  if (game.system?.id !== "pf2e" || Number(game.release?.generation) !== 14 ||
      !game.user?.isGM || userId !== game.user.id || message.author?.id !== userId ||
      message.flags?.core?.initiativeRoll !== true) return false;
  const mode = initiativeMode(game.settings.get(MODULE_ID, SILENT_INITIATIVE));
  if (mode === "disabled") return false;
  const nativePrivate = message.blind === true || message.whisper?.length > 0 &&
    message.whisper.every(id => [...game.users].some(u => u.id === id && u.isGM));
  if (initiativeAllowed(message.speakerActor, game, mode) && !nativePrivate) return false;
  // v14's supported message mode API sets recipients before persistence. Leave
  // rolls, speakers, combatants and the PF2e initiative callback untouched.
  if (typeof message.applyMode !== "function") return false;
  // Do not broaden an already-private native self/GM/blind audience.
  if (!nativePrivate) message.applyMode("gm");
  message.updateSource({
    [`flags.${MODULE_ID}.${SILENT_INITIATIVE_FLAG}`]: true,
    // Rerolls reconstruct PF2e context, rather than copying module flags.
    "flags.pf2e.context.messageMode": nativePrivate ? message.flags?.pf2e?.context?.messageMode ??
      (message.blind ? "blind" : "gm") : "gm",
    sound: null,
    "flags.dice-so-nice.skip": true,
    "flags.dice-so-nice.interactive": false
  });
  return true;
}

export function isSilentInitiative(message) {
  return message?.author?.isGM === true && message.flags?.core?.initiativeRoll === true &&
    message.flags?.[MODULE_ID]?.[SILENT_INITIATIVE_FLAG] === true;
}

export function createSilentGMInitiative({ hooks, getGame = () => globalThis.game,
  getChat = () => globalThis.ui?.chat, logger = console }) {
  let registrations = [];
  let notification = null, migration = null;
  const attachNotifications = () => {
    const chat = getChat();
    if (!chat || typeof chat.notify !== "function" || notification?.chat === chat && chat.notify === notification.wrapper) return;
    detachNotifications();
    const original = chat.notify;
    const state = { chat, original, active: true, wrapper: null };
    state.wrapper = function(message, ...args) {
      if (state.active && !getGame().user?.isGM && isSilentInitiative(message)) return;
      return original.call(this, message, ...args);
    };
    notification = state; chat.notify = state.wrapper;
  };
  const detachNotifications = () => {
    if (!notification) return;
    notification.active = false;
    if (notification.chat.notify === notification.wrapper) notification.chat.notify = notification.original;
    notification = null;
  };
  const migrate = () => {
    if (migration) return migration;
    migration = migrateInitiativeSetting(getGame()).catch(() => {
      logger.warn("PF2e Patchwork | Initiative preference conversion could not be saved; the legacy policy remains effective.");
    }).finally(() => { migration = null; });
    return migration;
  };
  const start = () => {
    if (registrations.length) return;
    registrations = [
      ["preCreateChatMessage", hooks.on("preCreateChatMessage", (message, _data, _options, userId) => {
        silenceInitiative(message, getGame(), userId);
      })],
      ["renderChatMessageHTML", hooks.on("renderChatMessageHTML", (message, html) => {
        // Core can render hidden roll placeholders. Mark the detached element
        // before ChatLog inserts it; never delete a persisted message. The flag
        // keeps historical private messages private after the setting is off.
        if (!getGame().user?.isGM && isSilentInitiative(message)) {
          html.setAttribute("data-patchwork-silent-initiative", "");
          html.hidden = true;
        }
      })],
      ["diceSoNiceMessagePreProcess", hooks.on("diceSoNiceMessagePreProcess", (id, interception) => {
        if (isSilentInitiative(getGame().messages?.get(id))) interception.willTrigger3DRoll = false;
      })],
      ["renderChatLog", hooks.on("renderChatLog", attachNotifications)],
      ["updateUser", hooks.on("updateUser", migrate)]
    ];
    attachNotifications();
    return migrate();
  };
  const stop = () => {
    for (const [name, id] of registrations) hooks.off(name, id);
    registrations = [];
    detachNotifications();
  };
  return { start, stop };
}
