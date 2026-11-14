import { createPlaylistCuration, snapshotPlayingTracks, validPlaylistName, isCurationGM } from "./playlist-curation.mjs";

const ENTRY = '[data-patchwork="save-playing-tracks"]';
const PANEL = '[data-patchwork="playlist-curation"]';
let nextId = 0;
const nativePlaylistClass = () => globalThis.foundry?.documents?.Playlist.implementation;
const nativeDialogClass = () => globalThis.foundry?.applications?.api?.DialogV2;
const nativeModes = () => globalThis.foundry?.applications?.sidebar?.tabs?.PlaylistDirectory.PLAYLIST_MODES;

export function createCurationDialog({ getGame, getPlaylistClass = nativePlaylistClass,
  getDialogClass = nativeDialogClass, getModes = nativeModes, document,
  service, isCurrent = () => true, onClose = () => {} }) {
  const game = getGame(), snapshot = snapshotPlayingTracks(game), Playlist = getPlaylistClass();
  const loc = key => game.i18n.localize(`PATCHWORK.Curation.${key}`);
  const format = (key, data) => game.i18n.format(`PATCHWORK.Curation.${key}`, data);
  const destinations = [...game.playlists].filter(p => p.canUserModify?.(game.user, "update") === true)
    .sort((a, b) => a.name.localeCompare(b.name));
  const mayCreate = Playlist?.canUserCreate?.(game.user) === true;
  const draft = { selected: new Set(snapshot.map(t => t.key)), kind: mayCreate ? "new" : "existing",
    name: "", destinationId: "", mode: 2, skipDuplicates: true };
  const state = { busy: false, locked: false, closed: false, notice: "", failed: false, focusResult: false };
  let detach = () => {}, dialog;
  const prefix = `patchwork-curation-${++nextId}`;
  const content = document.createElement("div"); content.dataset.patchwork = "playlist-curation";
  const el = (tag, text, cls) => {
    const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node;
  };
  const help = el("p", loc("SnapshotHint"), "hint"); content.append(help);
  const tracks = el("fieldset"), legend = el("legend", loc("Tracks")); tracks.append(legend);
  const count = el("p"); count.dataset.part = "count"; count.setAttribute("role", "status"); count.setAttribute("aria-live", "polite");
  const commands = el("div", null, "patchwork-curation-selection");
  for (const [action, label] of [["all", "All"], ["none", "None"]]) {
    const b = el("button", loc(label)); b.type = "button"; b.dataset.curate = action; commands.append(b);
  }
  const list = el("div", null, "patchwork-curation-tracks");
  for (const track of snapshot) {
    const label = el("label", null, "patchwork-curation-track"), checkbox = el("input");
    checkbox.type = "checkbox"; checkbox.name = "selected"; checkbox.value = track.key; checkbox.checked = true;
    const text = el("span"), name = el("span", track.name), source = el("small", track.playlistName);
    text.append(name, source); label.append(checkbox, text); list.append(label);
  }
  if (!snapshot.length) list.append(el("p", loc("Empty"), "hint"));
  tracks.append(count, commands, list); content.append(tracks);
  const destination = el("fieldset"); destination.append(el("legend", loc("Destination"))); content.append(destination);
  function field(name, labelText, tag = "input", parent = destination) {
    const group = el("div", null, "form-group"), label = el("label", labelText), fields = el("div", null, "form-fields");
    const input = el(tag); input.name = name; input.id = `${prefix}-${name}`; label.htmlFor = input.id;
    fields.append(input); group.append(label, fields); parent.append(group); return input;
  }
  function option(select, value, text) { const o = el("option", text); o.value = String(value); select.append(o); return o; }
  const kind = field("kind", loc("DestinationKind"), "select");
  option(kind, "new", loc("New")).disabled = !mayCreate; option(kind, "existing", loc("Existing"));
  const newFields = el("div"); newFields.dataset.part = "new"; destination.append(newFields);
  const name = field("name", loc("Name"), "input", newFields); name.type = "text"; name.autocomplete = "off";
  const mode = field("mode", loc("Mode"), "select", newFields);
  for (const [value, metadata] of Object.entries(getModes() ?? {})) {
    option(mode, value, game.i18n.localize(metadata.label));
  }
  const existingFields = el("div"); existingFields.dataset.part = "existing"; destination.append(existingFields);
  const existing = field("destinationId", loc("Existing"), "select", existingFields);
  option(existing, "", loc("Choose")); for (const p of destinations) option(existing, p.id, p.name);
  const duplicates = field("skipDuplicates", loc("Duplicates"), "select");
  option(duplicates, "true", loc("Skip")); option(duplicates, "false", loc("Allow"));
  destination.append(el("p", loc("DuplicateHint"), "hint"), el("p", loc("PlaybackHint"), "hint"));
  const status = el("p"); status.dataset.part = "result"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); content.append(status);

  function mount() {
    detach();
    const root = dialog.element?.querySelector(PANEL); if (!root) return;
    const controls = Object.fromEntries(["kind", "name", "destinationId", "mode", "skipDuplicates"].map(key => [key, root.querySelector(`[name="${key}"]`)]));
    for (const [key, node] of Object.entries(controls)) node.value = String(draft[key]);
    for (const checkbox of root.querySelectorAll('[name="selected"]')) checkbox.checked = draft.selected.has(checkbox.value);
    const save = dialog.element.querySelector('button[data-action="save"]');
    const cancel = dialog.element.querySelector('button[data-action="cancel"]');
    const refresh = () => {
      const valid = draft.selected.size > 0 && (draft.kind === "new"
        ? mayCreate && validPlaylistName(draft.name) : Boolean(draft.destinationId));
      const disabled = !valid || state.busy || state.locked || state.closed || !isCurationGM(getGame()) || !isCurrent();
      if (save && save.disabled !== disabled) save.disabled = disabled;
      for (const node of root.querySelectorAll("input, select, button")) node.disabled = state.busy || state.locked || state.closed;
      root.querySelector('[data-part="new"]').hidden = draft.kind !== "new";
      root.querySelector('[data-part="existing"]').hidden = draft.kind !== "existing";
      root.querySelector('[data-part="count"]').textContent = format("Count", { selected: draft.selected.size, total: snapshot.length });
      const notice = root.querySelector('[data-part="result"]'); notice.textContent = state.notice;
      notice.setAttribute("role", state.failed ? "alert" : "status");
      if (state.locked && cancel) {
        const span = cancel.querySelector("span"); if (span) span.textContent = loc("Close");
        if (state.focusResult && !cancel.disabled) { cancel.focus(); state.focusResult = false; }
      }
    };
    const onChange = event => {
      const target = event.target;
      if (target.name === "selected") {
        if (target.checked) draft.selected.add(target.value); else draft.selected.delete(target.value);
      } else for (const [key, node] of Object.entries(controls)) if (target === node) {
        draft[key] = key === "mode" ? Number(node.value) : key === "skipDuplicates" ? node.value === "true" : node.value;
      }
      refresh();
    };
    const onClick = event => {
      const action = event.target.closest?.("[data-curate]")?.dataset.curate;
      if (!action || state.busy || state.locked) return;
      draft.selected = new Set(action === "all" ? snapshot.map(t => t.key) : []);
      for (const node of root.querySelectorAll('[name="selected"]')) node.checked = draft.selected.has(node.value);
      refresh();
    };
    root.addEventListener("input", onChange); root.addEventListener("change", onChange); root.addEventListener("click", onClick);
    // 14.370 DialogV2 restores pre-submit disabled states after awaiting callbacks.
    // Observe only our Save button so that result/validation locks survive that
    // native restoration, without overriding DialogV2 or using delayed work.
    const Observer = root.ownerDocument.defaultView.MutationObserver;
    const observer = save ? new Observer(refresh) : null;
    if (save) observer.observe(save, { attributes: true, attributeFilter: ["disabled"] });
    state.refresh = refresh;
    detach = () => {
      observer?.disconnect(); root.removeEventListener("input", onChange); root.removeEventListener("change", onChange); root.removeEventListener("click", onClick);
    };
    refresh();
  }
  async function submit() {
    if (state.busy || state.locked || state.closed) return;
    state.busy = true; state.failed = false; state.notice = loc("Saving"); state.refresh?.();
    try {
      const result = await service.save(snapshot, { ...draft, selected: [...draft.selected] }, () => !state.closed && isCurrent());
      state.locked = true; state.focusResult = true; state.failed = result.failed > 0;
      state.notice = format(result.failed ? "Partial" : "Result", result);
    } catch (error) {
      const code = error.code ?? "uncertain";
      state.failed = true; state.locked = code === "uncertain"; state.focusResult = state.locked;
      state.notice = loc(`Errors.${code}`);
    } finally { state.busy = false; if (!state.closed) state.refresh?.(); }
  }
  // 14.370 DialogV2 requires an attribute-free outer div and renders only its
  // innerHTML. Keep our marked panel inside that trusted, disposable wrapper.
  const wrapper = document.createElement("div"); wrapper.append(content);
  const Dialog = getDialogClass();
  dialog = new Dialog({ window: { title: loc("Title") }, position: { width: 560 },
    classes: ["patchwork-playlist-curation"], form: { closeOnSubmit: false }, content: wrapper,
    buttons: [{ action: "save", label: loc("Save"), icon: "fa-solid fa-copy", default: true, disabled: true, callback: submit },
      { action: "cancel", label: loc("Cancel"), type: "button", callback: () => dialog.close() }] });
  const closed = () => { state.closed = true; detach(); dialog.removeEventListener("render", mount); dialog.removeEventListener("close", closed); onClose(); };
  dialog.addEventListener("render", mount); dialog.addEventListener("close", closed);
  return Object.freeze({ dialog, snapshot, async open() { await dialog.render({ force: true }); return dialog; },
    close() { state.closed = true; detach(); return dialog.close(); } });
}

export function createPlaylistCurationUI({ hooks, getGame = () => globalThis.game,
  getDirectory = () => globalThis.ui?.playlists, getPlaylistClass = nativePlaylistClass,
  getDialogClass = nativeDialogClass, getModes = nativeModes } = {}) {
  const states = new Map(), listeners = [];
  const service = createPlaylistCuration({ getGame, getPlaylistClass });
  let running = false, active;
  function remove(app) {
    const state = states.get(app); if (!state) return;
    state.button.removeEventListener("click", state.click); state.button.remove(); states.delete(app);
  }
  async function open(document = getDirectory()?.element?.ownerDocument ?? globalThis.document) {
    if (!running || !isCurationGM(getGame())) return null;
    if (active) { active.dialog.bringToFront(); return active.dialog; }
    const session = createCurationDialog({ getGame, getPlaylistClass, getDialogClass, getModes, document, service,
      isCurrent: () => running, onClose: () => { if (active === session) active = undefined; } });
    active = session;
    try { return await session.open(); } catch (error) {
      try { await session.close(); } finally { if (active === session) active = undefined; }
      throw error;
    }
  }
  function render(app, element = app?.element) {
    if (!app || !running || !isCurationGM(getGame())) { remove(app); return; }
    const header = element?.matches?.("header.directory-header") ? element : element?.querySelector?.("header.directory-header");
    const row = header?.querySelector("div.header-actions.action-buttons");
    if (!row) {
      if (header || element === app.element) remove(app);
      return; // A partial render of another part must leave its action intact.
    }
    const prior = states.get(app); if (prior?.button.parentElement === row) return;
    remove(app); for (const old of row.querySelectorAll(ENTRY)) old.remove();
    const button = row.ownerDocument.createElement("button"); button.type = "button";
    button.dataset.patchwork = "save-playing-tracks"; button.className = "ui-control icon fa-solid fa-layer-group";
    const title = getGame().i18n.localize("PATCHWORK.Curation.Title");
    button.title = title; button.setAttribute("aria-label", title); button.dataset.tooltip = title;
    const click = () => { void open(row.ownerDocument).catch(() => {
      // Startup failure only. Never log native errors with private world data.
      globalThis.ui?.notifications?.error(getGame().i18n.localize("PATCHWORK.Curation.Errors.unavailable"));
    }); };
    button.addEventListener("click", click); row.append(button); states.set(app, { button, click });
  }
  function refreshAccess() {
    for (const app of [...states.keys()]) render(app);
    if (!isCurationGM(getGame())) return active?.close();
  }
  function start() {
    if (running) return;
    running = true;
    for (const [event, callback] of [["renderPlaylistDirectory", render], ["closePlaylistDirectory", remove], ["updateUser", refreshAccess]]) {
      listeners.push([event, hooks.on(event, callback)]);
    }
    const app = getDirectory(); if (app?.rendered) render(app);
  }
  function stop() {
    running = false;
    for (const [event, id] of listeners.splice(0)) hooks.off(event, id);
    for (const app of [...states.keys()]) remove(app);
    return active?.close();
  }
  return Object.freeze({ start, stop, render, open });
}
