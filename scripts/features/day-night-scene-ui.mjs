import { MODULE_ID } from "../constants.mjs";
import { DAY_NIGHT_FLAG, DAY_NIGHT_SETTING, readDayNightConfig, nativeAudioConflict } from "./day-night-playlists.mjs";

const OWNED = '[data-patchwork="day-night"]';
const MISC_PANEL = '.tab[data-tab="misc"]';
const KEYS = ["enabled", "dayPlaylistId", "nightPlaylistId", "threshold"];
let nextId = 0;

export function createDayNightSceneUI({ hooks, getGame }) {
  const states = new Map();
  const listeners = [];
  const localize = (key) => getGame().i18n.localize(`PATCHWORK.DayNight.${key}`);

  function remove(app) {
    const state = states.get(app);
    if (!state) return;
    state.detach?.();
    state.root?.remove();
    states.delete(app);
  }

  function populate(select, value) {
    const document = select.ownerDocument;
    const option = (id, text) => {
      const node = document.createElement("option"); node.value = id; node.textContent = text; return node;
    };
    const playlists = [...getGame().playlists].sort((a, b) => a.name.localeCompare(b.name));
    const missing = value && !playlists.some((playlist) => playlist.id === value);
    const signature = JSON.stringify([playlists.map((p) => [p.id, p.name]), missing ? value : ""]);
    if (select.dataset.patchworkOptions !== signature) {
      select.replaceChildren(option("", localize("None")),
        ...playlists.map((playlist) => option(playlist.id, playlist.name)));
      if (missing) select.append(option(value, localize("Missing")));
      select.dataset.patchworkOptions = signature;
    }
    select.value = value;
  }

  function values(state) {
    return Object.fromEntries(KEYS.map((key) => {
      const control = state.controls[key];
      return [key, key === "enabled" ? control.checked : key === "threshold" ? Number(control.value) : control.value];
    }));
  }

  function validate(app, state) {
    const config = values(state);
    const game = getGame();
    // Include unsaved native playlist changes, leaving those controls entirely native.
    const nativeAssigned = state.audio.querySelector('[name="playlist"]').value
      || state.audio.querySelector('[name="playlistSound"]').value;
    const conflict = config.enabled && game.settings.get(MODULE_ID, DAY_NIGHT_SETTING)
      && nativeAudioConflict(game, app.document, config, nativeAssigned);
    state.controls.enabled.setCustomValidity(conflict ? localize("Conflict") : "");
    state.warning.hidden = !conflict;
  }

  function render(app, element = app.element) {
    const game = getGame();
    if (!game.user?.isGM || app.isEditable === false
      || !app.document?.canUserModify(game.user, "update")) { remove(app); return; }
    // v14's navigation link has the same data-tab; only the content panel owns fields.
    const misc = element?.matches?.(MISC_PANEL) ? element : element?.querySelector(MISC_PANEL);
    if (!misc) return; // A partial render of another part must not discard audio drafts.
    const audio = misc?.querySelector('[name="playlist"]')?.closest("fieldset");
    if (!audio || !misc.contains(audio) || !audio.querySelector('[name="playlistSound"]')) { remove(app); return; }
    const soundGroup = audio.querySelector('[name="playlistSound"]').closest(".form-group");
    if (!soundGroup || !audio.contains(soundGroup)) { remove(app); return; }
    let state = states.get(app);
    const saved = readDayNightConfig(app.document);
    if (!state) { state = { draft: new Map(), controls: {} }; states.set(app, state); }
    for (const [key, value] of state.draft) {
      if (saved[key] === value || (key === "threshold" && value !== "" && saved[key] === Number(value))) {
        state.draft.delete(key);
      }
    }
    const config = { ...saved, ...Object.fromEntries(state.draft) };

    if (state.root?.parentElement !== soundGroup.parentElement) {
      state.detach?.(); state.root?.remove();
      // Own only one subsection, even if an earlier partial render retained a node.
      for (const old of audio.querySelectorAll(OWNED)) old.remove();
      const document = audio.ownerDocument;
      const root = document.createElement("fieldset");
      root.dataset.patchwork = "day-night";
      const legend = document.createElement("legend"); legend.textContent = localize("Title"); root.append(legend);
      const prefix = `patchwork-day-night-${++nextId}`;
      function field(key, tag, type, labelKey) {
        const group = document.createElement("div"); group.className = "form-group";
        const label = document.createElement("label"); label.textContent = localize(labelKey);
        const fields = document.createElement("div"); fields.className = "form-fields";
        const input = document.createElement(tag);
        if (type) input.type = type;
        input.name = `flags.${MODULE_ID}.${DAY_NIGHT_FLAG}.${key}`;
        input.id = `${prefix}-${key}`; label.htmlFor = input.id;
        fields.append(input); group.append(label, fields); root.append(group);
        state.controls[key] = input;
        return input;
      }
      field("enabled", "input", "checkbox", "Enable");
      field("dayPlaylistId", "select", null, "Day");
      field("nightPlaylistId", "select", null, "Night");
      const threshold = field("threshold", "input", "number", "Threshold");
      threshold.min = "0"; threshold.max = "1"; threshold.step = "0.01"; threshold.required = true;
      threshold.dataset.dtype = "Number";
      const help = document.createElement("p"); help.className = "hint"; help.textContent = localize("Hint");
      const fade = document.createElement("p"); fade.className = "hint"; fade.textContent = localize("NativeFade");
      const warning = document.createElement("p"); warning.className = "hint";
      warning.textContent = localize("Conflict"); warning.id = `${prefix}-conflict`;
      state.controls.enabled.setAttribute("aria-describedby", warning.id);
      root.append(help, fade, warning); soundGroup.after(root);
      state.root = root; state.audio = audio; state.warning = warning;
      const capture = (event) => {
        if (root.contains(event.target)) {
          for (const key of KEYS) if (event.target === state.controls[key]) {
            state.draft.set(key, key === "enabled" ? event.target.checked : event.target.value);
          }
        }
        validate(app, state);
      };
      audio.addEventListener("input", capture); audio.addEventListener("change", capture);
      state.detach = () => {
        audio.removeEventListener("input", capture); audio.removeEventListener("change", capture);
      };
    }
    for (const key of KEYS) {
      const control = state.controls[key];
      if (key === "enabled") control.checked = config[key];
      else if (control.tagName === "SELECT") populate(control, config[key]);
      else if (control.value !== String(config[key])) control.value = config[key];
    }
    validate(app, state);
  }

  function refresh() {
    for (const app of states.keys()) render(app);
  }

  function start() {
    if (listeners.length) return;
    try {
      for (const [event, callback] of [
        ["renderSceneConfig", render], ["closeSceneConfig", remove],
        ["createPlaylist", refresh], ["updatePlaylist", refresh], ["deletePlaylist", refresh],
        ["updateScene", refresh]
      ]) listeners.push([event, hooks.on(event, callback)]);
    } catch (error) { stop(); throw error; }
  }

  function stop() {
    for (const [event, id] of listeners.splice(0)) hooks.off(event, id);
    for (const app of [...states.keys()]) remove(app);
  }

  return Object.freeze({ start, stop, refresh, render });
}
