import { MODULE_ID } from "../constants.mjs";
import { SPELL_INFORMATION } from "./spell-information.mjs";

export const SPELL_ICON_PREFERENCES = "spellcastingIconPreferences";
const writes = new WeakMap();
const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 512;
const actorUuid = value => identifier(value) && /^(?:Actor\.[^.]+|Compendium\.[^.]+\.[^.]+\.Actor\.[^.]+|Scene\.[^.]+\.Token\.[^.]+\.Actor\.[^.]+)$/.test(value);

function parseKey(key) {
  try {
    const parts = JSON.parse(key);
    return Array.isArray(parts) && parts.length === 3 && parts.every(identifier) && actorUuid(parts[2]) ? parts : null;
  } catch { return null; } // Malformed client entries are not preference identities.
}

export function spellIconPreferenceKey(game, actor) {
  return actor?.type === "character" && identifier(game?.world?.id) && identifier(game?.user?.id) && actorUuid(actor.uuid) ?
    JSON.stringify([game.world.id, game.user.id, actor.uuid]) : null;
}

function readSetting(game, key) {
  try { return game.settings.get(MODULE_ID, key); }
  catch { return undefined; } // Malformed/unreadable local storage must not break sheets.
}

export function sanitizeSpellIconPreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, enabled]) => parseKey(key) && typeof enabled === "boolean"));
}

export function spellIconsEnabled(game, actor) {
  const key = spellIconPreferenceKey(game, actor);
  const preferences = readSetting(game, SPELL_ICON_PREFERENCES);
  const value = key && preferences && typeof preferences === "object" && !Array.isArray(preferences) &&
    Object.hasOwn(preferences, key) ? preferences[key] : undefined;
  return typeof value === "boolean" ? value : readSetting(game, SPELL_INFORMATION) === true;
}

export function registerSpellIconPreferences(game, onChange) {
  let previous = {};
  game.settings.register(MODULE_ID, SPELL_ICON_PREFERENCES, {
    scope: "client", config: false, type: Object, default: {}, requiresReload: false,
    onChange(value) {
      const next = sanitizeSpellIconPreferences(value), actors = new Set();
      for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        const parts = parseKey(key);
        if (previous[key] !== next[key] && parts[0] === game.world?.id && parts[1] === game.user?.id) actors.add(parts[2]);
      }
      previous = next;
      if (actors.size) onChange?.(actors);
    }
  });
  previous = sanitizeSpellIconPreferences(readSetting(game, SPELL_ICON_PREFERENCES));
}

export function setSpellIconsEnabled(game, actor, enabled) {
  const key = spellIconPreferenceKey(game, actor);
  if (!key || typeof enabled !== "boolean") return Promise.reject(new Error("A stable character identity and Boolean preference are required."));
  // Serialize this client's map writes and re-read at execution, preserving
  // concurrent changes for other characters/users/worlds. A failed caller still
  // receives its rejection; the queue remains usable for the next operation.
  const operation = (writes.get(game) ?? Promise.resolve()).then(async () => {
    const next = sanitizeSpellIconPreferences(readSetting(game, SPELL_ICON_PREFERENCES));
    if (next[key] === enabled) return enabled;
    next[key] = enabled;
    await game.settings.set(MODULE_ID, SPELL_ICON_PREFERENCES, next);
    return enabled;
  });
  writes.set(game, operation.then(() => undefined, () => undefined));
  return operation;
}
