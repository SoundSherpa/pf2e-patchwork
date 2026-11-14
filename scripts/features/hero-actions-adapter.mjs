// Inspected Toolbelt 3.61.3 public discard contract: one awaited actor hand
// update for an array of UUIDs. Discarding does not resolve or modify a deck.
function readHand(api, actor) {
  const actions = api.getHeroActions(actor);
  if (!Array.isArray(actions) || actions.some(action => typeof action?.uuid !== "string" || !action.uuid)) throw new Error("Invalid Hero Action hand");
  return actions.map(action => action.uuid);
}

export function heroHandPreview(game, rows) {
  const module = game.modules.get("pf2e-toolbelt"), api = game.toolbelt?.api?.heroActions;
  if (!module?.active) return { available: false, reason: "provider-missing" };
  if (module.version !== "3.61.3" || typeof game.toolbelt?.getToolSetting !== "function" ||
    !["getHeroActions", "discardHeroActions"].every(key => typeof api?.[key] === "function")) return { available: false, reason: "provider-contract" };
  try {
    if (game.toolbelt.getToolSetting("heroActions", "enabled") !== true) return { available: false, reason: "provider-disabled" };
    return { available: true, hands: Object.fromEntries(rows.map(row => [row.uuid, readHand(api, game.actors.get(row.id))])) };
  } catch { return { available: false, reason: "hand" }; }
}

export async function discardHeroHand({ game, actor, row, preview, current }) {
  const snapshot = heroHandPreview(game, [row]);
  if (!snapshot.available || JSON.stringify(snapshot.hands[row.uuid]) !== JSON.stringify(preview.hands[row.uuid])) {
    return { status: "skipped", reason: snapshot.reason ?? "hand-changed" };
  }
  if (!current()) return { status: "skipped", reason: "authority" };
  const before = snapshot.hands[row.uuid], api = game.toolbelt.api.heroActions;
  if (!before.length) return { status: "completed", reason: null, before: 0, after: 0, removed: 0, alreadyEmpty: true };
  let rejected = false;
  try {
    // Preserve duplicate UUIDs: Toolbelt removes one matching occurrence per UUID.
    // Never mutate the saved preview or bypass the provider's flag/message path.
    await api.discardHeroActions(actor, [...before]);
  } catch { rejected = true; }
  let after;
  try { after = readHand(api, actor); }
  catch { return { status: "uncertain", reason: "hand-unreadable", before: before.length, after: null, removed: null }; }
  const remaining = new Map();
  for (const uuid of after) remaining.set(uuid, (remaining.get(uuid) ?? 0) + 1);
  const removed = before.filter(uuid => {
    const count = remaining.get(uuid) ?? 0;
    if (!count) return true;
    remaining.set(uuid, count - 1); return false;
  }).length;
  // A rejected promise can follow an accepted document write. Report the empty
  // observation separately; do not call it confirmed persistence or retry it.
  return { status: rejected ? "uncertain" : after.length ? "failed" : "completed",
    reason: rejected ? "discard-error" : after.length ? "discard-incomplete" : null,
    before: before.length, after: after.length, removed, alreadyEmpty: false };
}
