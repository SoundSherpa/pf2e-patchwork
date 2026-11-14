import { MODULE_ID } from "../constants.mjs";

export const PLAYLIST_MODES = Object.freeze([-1, 0, 1, 2]);
export class CurationError extends Error {
  constructor(code) { super(`Patchwork playlist curation: ${code}`); this.code = code; }
}
const fail = code => { throw new CurationError(code); };
export const isCurationGM = game => game?.user?.isGM === true
  && game.modules?.get(MODULE_ID)?.active !== false;
const OBSERVER = 2; // CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER in Foundry v14.
const readable = (playlist, sound, user) => playlist?.testUserPermission?.(user, OBSERVER) === true
  && sound?.testUserPermission?.(user, OBSERVER) === true;

// Conservative equality only. Keep case, query order/values and media fragments.
// Never rewrite the actual source reference sent to Foundry.
export function audioReferenceKey(path) {
  if (typeof path !== "string" || !path.trim()) return null;
  if (/^https?:\/\//i.test(path)) {
    try { return new URL(path).href; } catch { return path; }
  }
  while (path.startsWith("./")) path = path.slice(2);
  return path;
}

function copyMetadata(playlist, sound) {
  const data = {
    name: sound.name, description: sound.description ?? "", path: sound.path,
    volume: sound.volume, repeat: sound.repeat,
    // Freeze inherited configuration, not duration-clamped runtime fades.
    fade: sound.fade ?? playlist.fade ?? 0,
    channel: sound.channel || playlist.channel,
    playing: false, pausedTime: null
  };
  if (typeof data.name !== "string" || !data.name.trim() || typeof data.description !== "string"
    || !audioReferenceKey(data.path) || typeof data.volume !== "number" || !Number.isFinite(data.volume)
    || data.volume < 0 || data.volume > 1 || typeof data.repeat !== "boolean"
    || !Number.isSafeInteger(data.fade) || data.fade < 0
    || typeof data.channel !== "string" || !data.channel) fail("metadata");
  return Object.freeze(data);
}

export function snapshotPlayingTracks(game) {
  if (!isCurationGM(game)) fail("permission");
  const tracks = [];
  for (const playlist of game.playlists) for (const sound of playlist.sounds) {
    if (!sound.playing || !readable(playlist, sound, game.user)) continue;
    try {
      tracks.push(Object.freeze({ key: String(tracks.length), playlistId: playlist.id, soundId: sound.id,
        playlistName: playlist.name, name: sound.name, data: copyMetadata(playlist, sound) }));
    } catch (error) {
      if (!(error instanceof CurationError)) throw error;
      // Invalid native records cannot be copied. Do not log names or file paths.
    }
  }
  return Object.freeze(tracks);
}

export function validPlaylistName(name) {
  return typeof name === "string" && name.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(name);
}

export function createPlaylistCuration({ getGame, getPlaylistClass }) {
  let busy = false;
  async function save(snapshot, request, isCurrent = () => true) {
    if (busy) fail("busy");
    busy = true;
    let submitted = false;
    try {
      const game = getGame(), Playlist = getPlaylistClass();
      const authorize = () => {
        if (!isCurrent() || !isCurationGM(getGame()) || getGame().user !== game.user) fail("permission");
      };
      authorize();
      if (!Array.isArray(request.selected) || !request.selected.length) fail("selection");
      const keys = new Set(request.selected);
      const selected = snapshot.filter(track => keys.has(track.key));
      if (selected.length !== keys.size) fail("selection");
      const checkSources = () => {
        for (const track of selected) {
          const playlist = game.playlists.get(track.playlistId), sound = playlist?.sounds.get(track.soundId);
          if (!sound) fail("source");
          if (!readable(playlist, sound, game.user)) fail("permission");
        }
      };
      checkSources();
      if (!["new", "existing"].includes(request.kind) || typeof request.skipDuplicates !== "boolean") fail("destination");
      let destination;
      if (request.kind === "new") {
        if (!validPlaylistName(request.name)) fail("name");
        if (!PLAYLIST_MODES.includes(request.mode)) fail("mode");
        if (typeof Playlist?.create !== "function" || Playlist.canUserCreate?.(game.user) !== true) fail("permission");
      } else {
        destination = game.playlists.get(request.destinationId);
        if (!destination || !request.destinationId) fail("destination");
        if (destination.canUserModify?.(game.user, "update") !== true
          || typeof destination.createEmbeddedDocuments !== "function") fail("permission");
      }
      const existing = destination ? [...destination.sounds] : [];
      const seen = new Set(existing.map(sound => audioReferenceKey(sound.path)).filter(Boolean));
      const copies = [];
      let skipped = 0;
      let sort = existing.reduce((highest, sound) => Number.isSafeInteger(sound.sort) ? Math.max(highest, sound.sort) : highest, 0);
      for (const track of selected) {
        const key = audioReferenceKey(track.data.path);
        if (request.skipDuplicates && seen.has(key)) { skipped++; continue; }
        seen.add(key);
        if (!Number.isSafeInteger(++sort)) fail("metadata");
        copies.push({ ...track.data, sort });
      }
      // No placeholder playlist or empty embedded-document call.
      if (!copies.length) return { copied: 0, skipped, failed: 0, playlistId: destination?.id ?? null };
      authorize(); checkSources();
      if (destination) {
        if (game.playlists.get(destination.id) !== destination) fail("destination");
        if (destination.canUserModify(game.user, "update") !== true) fail("permission");
      } else if (Playlist.canUserCreate(game.user) !== true) fail("permission");
      submitted = true;
      let documents;
      if (destination) documents = await destination.createEmbeddedDocuments("PlaylistSound", copies);
      else {
        destination = await Playlist.create({ name: request.name.trim(), mode: request.mode, playing: false, sounds: copies });
        if (!destination) return { copied: 0, skipped, failed: copies.length, playlistId: null };
        documents = [...destination.sounds];
      }
      if (!Array.isArray(documents) || documents.length > copies.length) fail("uncertain");
      return { copied: documents.length, skipped, failed: copies.length - documents.length, playlistId: destination.id };
    } catch (error) {
      // Do not echo native rejection messages: they may contain private paths.
      if (error instanceof CurationError) throw error;
      throw new CurationError(submitted ? "uncertain" : "unavailable");
    } finally { busy = false; }
  }
  return Object.freeze({ save });
}
