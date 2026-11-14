import { MODULE_ID } from "../constants.mjs";

export const CHAT_LAYOUT = "chatToolbarLayout";
export const CHAT_ICON_SIZE = "chatToolbarIconSize";
export const CHAT_SPACING = "chatToolbarSpacing";
const ROOT = "data-patchwork-chat-toolbar";
const GROUP = "data-patchwork-chat-group";
const CONTROL = "data-patchwork-chat-control";
const ICON = "data-patchwork-chat-icon";
const VARIABLES = ["--patchwork-chat-icon-size", "--patchwork-chat-spacing"];
const ICON_SELECTOR = ".fa-solid, .fa-regular, .fa-light, .fa-thin, .fa-duotone, .fa-brands, .fas, .far, .fal, .fat, .fad, .fab";
const isControl = element => element.matches("button, a[role='button'], a.chat-control-icon");
const groupsIn = root => Array.from(root.children).filter(child => child.matches("div#message-modes, div.control-buttons"));
const validRoot = root => root?.matches?.("div#chat-controls")
  && !root.closest(".chat-log, .chat-message, [data-message-id]") && groupsIn(root).length > 0;

export function registerChatToolbarSettings(settings, onChange) {
  const common = { scope: "client", config: true, requiresReload: false, onChange };
  settings.register(MODULE_ID, CHAT_LAYOUT, {
    ...common, name: "PATCHWORK.Chat.Layout.Name", hint: "PATCHWORK.Chat.Layout.Hint",
    type: String, default: "default",
    choices: Object.fromEntries(["default", "compact", "custom"].map(value => [value, `PATCHWORK.Chat.${value}`]))
  });
  settings.register(MODULE_ID, CHAT_ICON_SIZE, {
    ...common, name: "PATCHWORK.Chat.IconSize.Name", hint: "PATCHWORK.Chat.IconSize.Hint",
    type: Number, range: { min: 16, max: 28, step: 1 }, default: 16
  });
  settings.register(MODULE_ID, CHAT_SPACING, {
    ...common, name: "PATCHWORK.Chat.Spacing.Name", hint: "PATCHWORK.Chat.Spacing.Hint",
    type: Number, range: { min: 0, max: 8, step: 1 }, default: 2
  });
}

const bounded = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value)
  ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
export function chatToolbarConfig(settings) {
  const layout = settings.get(MODULE_ID, CHAT_LAYOUT);
  if (!["compact", "custom"].includes(layout)) return null;
  return { layout,
    iconSize: layout === "compact" ? 16 : bounded(settings.get(MODULE_ID, CHAT_ICON_SIZE), 16, 28, 16),
    spacing: layout === "compact" ? 2 : bounded(settings.get(MODULE_ID, CHAT_SPACING), 0, 8, 2)
  };
}

export function createChatToolbarAppearance({ hooks, getGame = () => globalThis.game,
  getDocument = () => globalThis.document } = {}) {
  let started = false, root, observer;
  const subscriptions = [], owned = new Map();
  const mark = (element, attribute, value = "") => {
    if (!owned.has(element)) owned.set(element, new Set());
    owned.get(element).add(attribute);
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  };
  const release = () => {
    observer?.disconnect(); observer = undefined;
    for (const [element, attributes] of owned) for (const attribute of attributes) element.removeAttribute(attribute);
    owned.clear();
    if (root) for (const variable of VARIABLES) root.style.removeProperty(variable);
    root = undefined;
  };
  const decorate = () => {
    // Scan only this small toolbar, never the chat log or the surrounding form.
    const current = new Map();
    const add = (element, attribute, value) => {
      if (!current.has(element)) current.set(element, new Set());
      current.get(element).add(attribute); mark(element, attribute, value);
    };
    add(root, ROOT, "");
    const groups = groupsIn(root);
    for (const group of groups) add(group, GROUP, "");
    for (const parent of [root, ...groups]) for (const control of Array.from(parent.children).filter(isControl)) {
      const icons = Array.from(control.querySelectorAll(ICON_SELECTOR)).filter(icon => icon.matches("i, span"));
      const iconOnly = !control.textContent.trim() && (control.matches(ICON_SELECTOR) || icons.length > 0);
      add(control, CONTROL, iconOnly ? "icon" : "label");
      for (const icon of icons) add(icon, ICON, "");
    }
    for (const [element, attributes] of owned) for (const attribute of attributes) {
      if (!current.get(element)?.has(attribute)) element.removeAttribute(attribute);
    }
    owned.clear(); for (const [element, attributes] of current) owned.set(element, attributes);
  };
  const sync = (candidate) => {
    if (!started) return;
    const config = chatToolbarConfig(getGame().settings);
    if (!config) { release(); return; }
    const found = validRoot(candidate) ? candidate : getDocument()?.getElementById("chat-controls");
    const next = found ?? (root?.isConnected ? root : undefined);
    if (!validRoot(next)) { release(); return; }
    if (root !== next) {
      release(); root = next;
      const Observer = root.ownerDocument.defaultView?.MutationObserver;
      if (Observer) {
        observer = new Observer(() => sync());
        observer.observe(root, { childList: true, subtree: true, characterData: true });
      }
    }
    for (const [index, value] of [config.iconSize, config.spacing].entries()) {
      const formatted = `${value}px`;
      if (root.style.getPropertyValue(VARIABLES[index]) !== formatted) root.style.setProperty(VARIABLES[index], formatted);
    }
    decorate();
  };
  const start = () => {
    if (started) return;
    started = true;
    const on = (event, callback) => subscriptions.push([event, hooks.on(event, callback)]);
    on("renderChatInput", (_app, elements) => {
      const candidates = Object.values(elements ?? {}).flatMap(element =>
        [element, element?.querySelector?.("#chat-controls")]);
      sync(candidates.find(validRoot));
    });
    on("renderChatLog", () => sync());
    on("closeChatLog", () => sync());
    sync();
  };
  const stop = () => {
    started = false;
    for (const [event, id] of subscriptions.splice(0)) hooks.off(event, id);
    release();
  };
  return Object.freeze({ start, stop, sync });
}
