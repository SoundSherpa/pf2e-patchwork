import { MODULE_ID } from "../constants.mjs";

export const DAY_NIGHT_SETTING = "automaticDayNightPlaylists";
export const DAY_NIGHT_LEDGER = "dayNightPlayback";
export const DAY_NIGHT_FLAG = "dayNight";

export function registerDayNightSettings(settings, onChange = () => {}) {
  settings.register(MODULE_ID, DAY_NIGHT_SETTING, {
    name: "PATCHWORK.DayNight.World.Name", hint: "PATCHWORK.DayNight.World.Hint",
    scope: "world", config: true, restricted: true, type: Boolean, default: false, onChange
  });
  // Command provenance only: survives leader handoff/reload without copying native playback state.
  settings.register(MODULE_ID, DAY_NIGHT_LEDGER, {
    scope: "world", config: false, restricted: true, type: Object, default: {}
  });
}

export function readDayNightConfig(scene) {
  const value = scene?.getFlag(MODULE_ID, DAY_NIGHT_FLAG) ?? {};
  const id = (value) => typeof value === "string" ? value : "";
  return {
    enabled: value.enabled === true,
    dayPlaylistId: id(value.dayPlaylistId), nightPlaylistId: id(value.nightPlaylistId),
    threshold: typeof value.threshold === "number" && Number.isFinite(value.threshold)
      && value.threshold >= 0 && value.threshold <= 1 ? value.threshold : 0.5
  };
}

export function electedGM(game) {
  return [...game.users].filter((user) => user.active && user.isGM)
    .map((user) => user.id).sort()[0] ?? null;
}

export function nativeAudioConflict(game, scene, config = readDayNightConfig(scene),
  nativeAssignment = scene?.playlist || scene?.playlistSound) {
  if (nativeAssignment) return true;
  const assigned = new Set([config.dayPlaylistId, config.nightPlaylistId].filter(Boolean));
  if (!assigned.size) return false;
  // Core stops the prior scene's native playlist asynchronously on activation.
  // Keep the two assignment systems disjoint so that stop cannot race our start.
  return [...game.scenes].some((other) => {
    if (other.id === scene?.id) return false;
    const native = other.playlist;
    return assigned.has(typeof native === "string" ? native : native?.id);
  });
}

export function dayNightPlan(game) {
  const scene = game.scenes.active;
  const config = readDayNightConfig(scene);
  const darkness = scene?.environment?.darknessLevel;
  if (!game.settings.get(MODULE_ID, DAY_NIGHT_SETTING) || !config.enabled
    || !scene || nativeAudioConflict(game, scene, config)
    || typeof darkness !== "number" || !Number.isFinite(darkness)) return null;
  const state = darkness >= config.threshold ? "night" : "day";
  const playlistId = config[`${state}PlaylistId`];
  return { sceneId: scene.id, state, playlistId, key: JSON.stringify([scene.id, state, playlistId]) };
}

function anySoundPlaying(playlist) {
  return Boolean(playlist?.sounds?.some((sound) => sound.playing));
}

function readLedger(settings) {
  const value = settings.get(MODULE_ID, DAY_NIGHT_LEDGER) ?? {};
  return {
    key: typeof value.key === "string" ? value.key : "",
    managedPlaylistId: typeof value.managedPlaylistId === "string" ? value.managedPlaylistId : "",
    pending: value.pending === true
  };
}

export function createDayNightPlaylists({ hooks, getGame }) {
  const listeners = [];
  let running = false;
  let disposed = false;
  let revision = 0;
  let tail = Promise.resolve();

  function authorized() {
    const game = getGame();
    return running && !disposed && game.system?.id === "pf2e"
      && Number(game.release?.generation) === 14 && game.user?.isGM === true
      && game.user.active && game.modules.get(MODULE_ID)?.active !== false
      && electedGM(game) === game.user.id;
  }

  function current(version, key) {
    return authorized() && version === revision && (dayNightPlan(getGame())?.key ?? "") === key;
  }

  async function reconcile(version) {
    if (!authorized() || version !== revision) return;
    const game = getGame();
    const plan = dayNightPlan(game);
    const key = plan?.key ?? "";
    const ledger = readLedger(game.settings);
    if (ledger.key === key && !ledger.pending) return;
    const desired = plan?.playlistId ? game.playlists.get(plan.playlistId) : null;
    const prior = game.playlists.get(ledger.managedPlaylistId);

    async function record(managedPlaylistId, pending) {
      if (!current(version, key)) return false;
      await game.settings.set(MODULE_ID, DAY_NIGHT_LEDGER, { key, managedPlaylistId, pending });
      return current(version, key);
    }

    function requirePermission(playlist, method) {
      if (typeof playlist?.[method] !== "function" || typeof playlist.canUserModify !== "function"
        || !playlist.canUserModify(game.user, "update")) {
        throw new Error("PF2e Patchwork: playlist operation unavailable or not permitted.");
      }
    }

    async function playback(playlist, method) {
      if (!current(version, key)) return false;
      requirePermission(playlist, method);
      await playlist[method]();
      return current(version, key);
    }

    if (!await record(ledger.managedPlaylistId, true)) return;
    // Native Scene Playlist owns its assignment, even if it was previously managed by Patchwork.
    const nativePlaylist = game.scenes.active?.playlist;
    const nativeId = typeof nativePlaylist === "string" ? nativePlaylist : nativePlaylist?.id;
    if (prior && prior !== desired && prior.id !== nativeId
      && (prior.playing || anySoundPlaying(prior)) && !await playback(prior, "stopAll")) return;

    let managedId = desired?.id === ledger.managedPlaylistId ? desired.id : "";
    if (desired && !anySoundPlaying(desired) && desired.sounds.size > 0) {
      requirePermission(desired, "playAll");
      // Record intent before the native write, so a new GM can reconcile an interrupted start.
      if (!await record(desired.id, true) || !await playback(desired, "playAll")) return;
      managedId = anySoundPlaying(desired) ? desired.id : "";
    }
    // An already-playing playlist is not claimed unless this feature already owned it.
    await record(managedId, false);
  }

  function sync() {
    if (!running || disposed) return Promise.resolve();
    const version = ++revision;
    const operation = tail.then(() => reconcile(version));
    // Keep the queue usable after failure; return the original rejection to the caller.
    tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function start() {
    if (running || disposed) return tail;
    running = true;
    try {
      for (const [event, callback] of [
        ["updateScene", (scene, changes) => {
          if ("active" in changes || "playlist" in changes || "playlistSound" in changes
            || scene === getGame().scenes.active) return sync();
        }],
        ["deleteScene", sync], ["deletePlaylist", sync],
        ["userConnected", sync], ["updateUser", sync], ["deleteUser", sync]
      ]) listeners.push([event, hooks.on(event, callback)]);
      return sync();
    } catch (error) {
      stop();
      throw error;
    }
  }

  function stop() {
    running = false;
    revision++;
    for (const [event, id] of listeners.splice(0)) hooks.off(event, id);
    // Native playback and provenance survive client teardown for a successor GM.
    return tail;
  }

  function destroy() { disposed = true; return stop(); }
  return Object.freeze({ start, stop, sync, destroy });
}
