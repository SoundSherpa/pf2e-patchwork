import { MODULE_ID } from "../constants.mjs";
import { electedGM } from "./day-night-playlists.mjs";
import { heroHandPreview, discardHeroHand } from "./hero-actions-adapter.mjs";

export const HERO_ENABLED = "sessionHeroPointAutomation";
export const HERO_DEFAULT = "defaultSessionHeroPoints";
export const HERO_OVERRIDES = "sessionHeroPointOverrides";
export const HERO_RUNS = "sessionHeroPointRuns";
export const HERO_DECK = "sessionHeroActionRefresh";
const amount = value => Number.isInteger(value) && value >= 0 && value <= 3;
const worldUuid = value => typeof value === "string" && /^Actor\.[A-Za-z0-9_-]+$/.test(value);
const fail = code => Object.assign(new Error(`PF2e Patchwork: ${code}`), { code });

export function registerHeroPointSettings(settings, menuType) {
  settings.register(MODULE_ID, HERO_ENABLED, {
    name: "PATCHWORK.HeroPoints.Enable", hint: "PATCHWORK.HeroPoints.EnableHint",
    scope: "world", config: true, restricted: true, type: Boolean, default: false
  });
  settings.register(MODULE_ID, HERO_DEFAULT, {
    name: "PATCHWORK.HeroPoints.Default", hint: "PATCHWORK.HeroPoints.DefaultHint",
    scope: "world", config: true, restricted: true, type: Number, default: 1,
    range: { min: 0, max: 3, step: 1 }
  });
  settings.register(MODULE_ID, HERO_DECK, {
    name: "PATCHWORK.HeroPoints.Deck", hint: "PATCHWORK.HeroPoints.DeckHint",
    scope: "world", config: false, restricted: true, type: Boolean, default: false
  });
  for (const key of [HERO_OVERRIDES, HERO_RUNS]) settings.register(MODULE_ID, key, {
    scope: "world", config: false, restricted: true, type: Object, default: {}
  });
  if (menuType && typeof settings.registerMenu === "function") settings.registerMenu(MODULE_ID, "sessionHeroPoints", {
    name: "PATCHWORK.HeroPoints.Title", label: "PATCHWORK.HeroPoints.Open",
    hint: "PATCHWORK.HeroPoints.MenuHint", icon: "fa-solid fa-medal", restricted: true, type: menuType
  });
}

export function heroOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([uuid, rule]) => worldUuid(uuid) && rule &&
    typeof rule === "object" && !Array.isArray(rule) && (rule.points === undefined || amount(rule.points)) &&
    (rule.excluded === undefined || typeof rule.excluded === "boolean"))
    .map(([uuid, rule]) => [uuid, { ...(amount(rule.points) ? { points: rule.points } : {}),
      ...(typeof rule.excluded === "boolean" ? { excluded: rule.excluded } : {}) }]));
}

export function hasNativeHeroPoints(actor) {
  const resource = actor?.system?.resources?.heroPoints;
  return actor?.type === "character" && !!resource && Number.isInteger(resource.max) && resource.max > 0 &&
    Number.isInteger(resource.value) && resource.value >= 0 && resource.value <= resource.max;
}

export function heroConfiguration(game) {
  const points = game.settings.get(MODULE_ID, HERO_DEFAULT);
  if (!amount(points)) throw fail("configuration");
  return { points, overrides: heroOverrides(game.settings.get(MODULE_ID, HERO_OVERRIDES)), deck: game.settings.get(MODULE_ID, HERO_DECK) === true };
}

export function heroEligibility(game, actor, overrides = {}) {
  if (!actor || actor.type !== "character") return "not-character";
  if (!worldUuid(actor.uuid) || game.actors?.get(actor.id) !== actor || actor.uuid !== `Actor.${actor.id}`) return "not-world";
  if (!Array.isArray(game.actors.party?.members) || !game.actors.party.members.includes(actor)) return "not-party";
  // Same companion distinction used by PF2e's isReallyPC/party resource UI.
  const traits = actor.system?.traits?.value;
  if (!Array.isArray(traits)) return "unknown-character";
  if (overrides[actor.uuid]?.excluded === true) return "excluded";
  if (traits.some(trait => ["minion", "eidolon", "companion", "familiar"].includes(trait)) &&
      overrides[actor.uuid]?.excluded !== false) return "companion";
  if (!hasNativeHeroPoints(actor)) return "no-hero-points";
  if (typeof actor.update !== "function" || actor.canUserModify?.(game.user, "update") !== true) return "permission";
  return null;
}

export function heroRoster(game) {
  const config = heroConfiguration(game), party = game.actors?.party;
  if (!party || party.type !== "party" || !Array.isArray(party.members)) return { party: null, config, rows: [] };
  const rows = [...new Set(party.members)].filter(hasNativeHeroPoints).map(actor => ({
    id: actor.id, uuid: actor.uuid, name: actor.name ?? "", reason: heroEligibility(game, actor, config.overrides),
    from: actor.system?.resources?.heroPoints?.value,
    to: Math.min(config.overrides[actor.uuid]?.points ?? config.points, actor.system?.resources?.heroPoints?.max ?? 0, 3)
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { party: party.uuid, config, rows };
}

export function isHeroPointGM(game) {
  return game.user?.isGM === true && game.user.active === true && game.system?.id === "pf2e" &&
    Number(game.release?.generation) === 14 && game.modules.get(MODULE_ID)?.active !== false;
}

export function canResetHeroPoints(game) {
  return isHeroPointGM(game) && game.settings.get(MODULE_ID, HERO_ENABLED) === true && electedGM(game) === game.user.id;
}

function readRuns(game) {
  const runs = game.settings.get(MODULE_ID, HERO_RUNS);
  if (!runs || typeof runs !== "object" || Array.isArray(runs)) throw fail("history");
  return runs;
}

export function heroOperation(game) {
  const operation = readRuns(game).operation;
  if (operation === undefined) return null; // Keep legacy session history untouched.
  if (!operation || typeof operation !== "object" || Array.isArray(operation) ||
    typeof operation.token !== "string" || !operation.token || typeof operation.owner !== "string" || !operation.owner ||
    !["running", "completed", "partial", "uncertain"].includes(operation.status)) throw fail("history");
  return operation;
}

export function heroPreview(game, selected) {
  if (!canResetHeroPoints(game)) throw fail("authority");
  const operation = heroOperation(game);
  if (operation?.status === "running") throw fail("busy");
  const roster = heroRoster(game), wanted = new Set(selected);
  const rows = roster.rows.filter(row => !row.reason && wanted.has(row.uuid));
  if (!roster.party || rows.length === 0 || rows.length !== wanted.size) throw fail("selection");
  return { revision: operation?.token ?? null, previousUncertain: !!operation && operation.status !== "completed",
    party: roster.party, config: JSON.stringify(roster.config),
    deck: roster.config.deck ? heroHandPreview(game, rows) : null,
    rows: rows.map(({ id, uuid, name, from, to }) => ({ id, uuid, name, from, to })) };
}

export function createSessionHeroPoints({ getGame = () => globalThis.game,
  newToken = () => globalThis.foundry?.utils?.randomID?.(24) ?? globalThis.crypto.randomUUID() } = {}) {
  let busy = false, stopped = false, generation = 0;
  const current = isCurrent => !stopped && isCurrent() && canResetHeroPoints(getGame());
  const canRecover = expected => {
    if (busy || !current(() => true)) return false;
    try {
      const game = getGame(), operation = heroOperation(game);
      const owner = [...game.users].find(user => user.id === operation?.owner);
      return operation?.status === "running" && operation.token === expected &&
        (operation.owner === game.user.id || !owner?.active || !owner.isGM);
    } catch { return false; }
  };
  return {
    canRecover,
    async recover(expected, { confirmed = false, isCurrent = () => true } = {}) {
      if (!confirmed) throw fail("confirmation");
      if (!isCurrent() || !canRecover(expected)) throw fail("authority");
      const game = getGame(); busy = true;
      try {
        // Explicit recovery clears only the guard, never actors or provider hands.
        await game.settings.set(MODULE_ID, HERO_RUNS, { ...readRuns(game), operation: {
          token: newToken(), owner: game.user.id, status: "uncertain" } });
      } finally { busy = false; }
    },
    async saveOverrides(changes, expected, { deck, expectedDeck } = {}) {
      const game = getGame();
      if (stopped || busy || !isHeroPointGM(game)) throw fail("authority");
      const previous = heroOverrides(game.settings.get(MODULE_ID, HERO_OVERRIDES));
      if (JSON.stringify(previous) !== expected) throw fail("stale");
      if (deck !== undefined && (typeof deck !== "boolean" || typeof expectedDeck !== "boolean")) throw fail("configuration");
      if (deck !== undefined && game.settings.get(MODULE_ID, HERO_DECK) !== expectedDeck) throw fail("stale");
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw fail("configuration");
      const valid = heroOverrides(changes);
      if (Object.keys(valid).length !== Object.keys(changes).length) throw fail("configuration");
      const next = { ...previous };
      for (const [uuid, rule] of Object.entries(valid)) {
        if (!Object.keys(rule).length) delete next[uuid]; else next[uuid] = rule;
      }
      busy = true;
      try {
        await game.settings.set(MODULE_ID, HERO_OVERRIDES, next);
        if (deck !== undefined && deck !== expectedDeck) {
          if (stopped || !isHeroPointGM(game)) throw fail("authority");
          if (game.settings.get(MODULE_ID, HERO_DECK) !== expectedDeck) throw fail("stale");
          await game.settings.set(MODULE_ID, HERO_DECK, deck);
        }
      }
      finally { busy = false; }
    },
    async reset(preview, { confirmed = false, isCurrent = () => true } = {}) {
      const game = getGame();
      if (!confirmed) throw fail("confirmation");
      if (busy || !current(isCurrent)) throw fail("authority");
      const fresh = heroPreview(game, preview.rows.map(row => row.uuid));
      if (fresh.revision !== preview.revision || fresh.party !== preview.party || fresh.config !== preview.config || JSON.stringify(fresh.rows) !== JSON.stringify(preview.rows) ||
        JSON.stringify(fresh.deck) !== JSON.stringify(preview.deck)) throw fail("stale");
      busy = true;
      const epoch = ++generation, active = () => epoch === generation && current(isCurrent);
      const token = newToken();
      const owns = () => heroOperation(game)?.token === token;
      const result = { updated: [], unchanged: [], failed: [], stopped: [], ledgerFailed: false, deck: [] };
      try {
        if (!active()) throw fail("authority");
        if ((heroOperation(game)?.token ?? null) !== preview.revision) throw fail("stale");
        // One bounded operation record fences old confirmations without identifying
        // sessions. Native settings writes do not provide atomic compare-and-set.
        await game.settings.set(MODULE_ID, HERO_RUNS, { ...readRuns(game), operation: { token, owner: game.user.id, status: "running" } });
        if (!active() || !owns()) throw fail("authority");
        let deckStopped = false;
        for (const row of preview.rows) {
          if (!active() || !owns()) { result.stopped.push(row.uuid); continue; }
          let roster;
          try { roster = heroRoster(game); } catch { result.failed.push({ uuid: row.uuid, reason: "stale" }); continue; }
          const actor = game.actors.get(row.id);
          const live = roster.rows.find(candidate => candidate.uuid === row.uuid);
          if (roster.party !== preview.party || JSON.stringify(roster.config) !== preview.config || !live || live.reason ||
            live.to !== row.to || (live.from !== row.from && live.from !== row.to)) { result.failed.push({ uuid: row.uuid, reason: "stale" }); continue; }
          if (live.from === live.to) result.unchanged.push(row.uuid);
          else try {
            // Only the native Hero Point value changes; no max, ownership or flags.
            await actor.update({ "system.resources.heroPoints.value": row.to });
            result.updated.push(row.uuid);
          } catch { result.failed.push({ uuid: row.uuid, reason: "update" }); continue; }
          if (preview.deck) {
            const allowed = () => {
              try { return active() && owns() &&
                !heroEligibility(game, actor, heroConfiguration(game).overrides) && actor.system.resources.heroPoints.value === row.to; }
              catch { return false; }
            };
            const card = preview.deck.available && !deckStopped && allowed() ? await discardHeroHand({ game, actor, row, preview: preview.deck,
              current: allowed }) : { status: "skipped", reason: deckStopped ? "previous-uncertain" : preview.deck.reason ?? "authority" };
            if (["uncertain", "failed"].includes(card.status)) deckStopped = true;
            result.deck.push({ uuid: row.uuid, ...card });
          }
        }
        // Finish an owned guard even after closing/disabling or a normal authority
        // handoff. Disconnected clients may fail; recovery remains explicit.
        if (isHeroPointGM(game) && owns()) {
          try {
            await game.settings.set(MODULE_ID, HERO_RUNS, { ...readRuns(game), operation: { token, owner: game.user.id,
              status: result.failed.length || result.stopped.length || result.deck.some(entry => entry.status !== "completed") ? "partial" : "completed",
              updated: result.updated.length, unchanged: result.unchanged.length, failed: result.failed.length + result.stopped.length } });
          } catch { result.ledgerFailed = true; }
        } else result.ledgerFailed = true;
        return result;
      } finally { busy = false; }
    },
    cancel() { generation++; },
    stop() { stopped = true; generation++; },
    get busy() { return busy; }
  };
}
