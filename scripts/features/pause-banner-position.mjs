import { MODULE_ID } from "../constants.mjs";

export const PAUSE_POSITION = "pauseBannerPosition";
const ATTRIBUTE = "data-patchwork-pause-position";
const VARIABLES = ["--patchwork-pause-left", "--patchwork-pause-right", "--patchwork-pause-top"];
const POSITIONS = new Set(["top", "center", "bottom"]);

export function registerPausePositionSetting(settings, onChange) {
  settings.register(MODULE_ID, PAUSE_POSITION, {
    name: "PATCHWORK.Pause.Name", hint: "PATCHWORK.Pause.Hint",
    scope: "client", config: true, type: String, default: "default",
    choices: Object.fromEntries(["default", "top", "center", "bottom"].map(value =>
      [value, `PATCHWORK.Pause.${value}`])),
    requiresReload: false, onChange
  });
}

// GamePause is unpositioned in v14: use its render hook, not setPosition or a
// replacement renderer. Only this attribute and these custom properties are ours.
export function createPauseBannerPosition({ hooks, getGame = () => globalThis.game,
  getDocument = () => globalThis.document, getWindow = () => globalThis.window } = {}) {
  let started = false, watching = false, banner, observer, bodyObserver;
  const subscriptions = [], events = [];
  let observed = [];
  const removePosition = () => {
    if (!banner) return;
    banner.removeAttribute(ATTRIBUTE);
    for (const variable of VARIABLES) banner.style.removeProperty(variable);
  };
  const disconnect = () => {
    observer?.disconnect(); bodyObserver?.disconnect();
    observer = bodyObserver = undefined; watching = false; observed = [];
    for (const [target, event, callback] of events.splice(0)) target.removeEventListener(event, callback);
  };
  const release = () => { disconnect(); removePosition(); banner = undefined; };
  const sync = () => {
    if (!started) return;
    const doc = getDocument(), win = getWindow();
    const element = doc?.getElementById("pause");
    const position = getGame()?.settings.get(MODULE_ID, PAUSE_POSITION);
    if (!POSITIONS.has(position) || !win || element?.tagName !== "FIGURE"
      || element.parentElement !== doc.body || !element.querySelector("figcaption")
      || !element.querySelector("img, video")) { release(); return; }
    if (banner !== element) {
      release(); banner = element;
    }
    if (!watching) {
      watching = true;
      observer = win.ResizeObserver ? new win.ResizeObserver(sync) : undefined;
      bodyObserver = win.MutationObserver ? new win.MutationObserver(sync) : undefined;
      bodyObserver?.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
      const listen = (target, event) => {
        if (!target) return;
        target.addEventListener(event, sync); events.push([target, event, sync]);
      };
      listen(win, "resize"); listen(doc, "fullscreenchange");
      listen(win.visualViewport, "resize"); listen(win.visualViewport, "scroll");
    }
    const targets = [banner, doc.getElementById("interface"), doc.getElementById("ui-middle"),
      doc.getElementById("sidebar")].filter(Boolean);
    if (targets.length !== observed.length || targets.some((target, index) => target !== observed[index])) {
      observer?.disconnect();
      for (const target of targets) observer?.observe(target);
      observed = targets;
    }
    // Nore's inspected contract: these classes install competing !important
    // placement/transform rules. Never clear its classes or escalate specificity.
    if (["nie-pause-top", "nie-pause-bottom", "nie-lower-pause"].some(name => doc.body.classList.contains(name))) {
      removePosition();
      // Keep the class observer so returning Nore's setting to Default resumes us.
      return;
    }
    const viewport = win.visualViewport;
    let left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    let right = left + (viewport?.width ?? win.innerWidth), bottom = top + (viewport?.height ?? win.innerHeight);
    const bounds = doc.getElementById("interface")?.getBoundingClientRect();
    if (bounds?.width > 0 && bounds.height > 0) {
      left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
      top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
    }
    // The native middle column excludes bottom UI, while the docked sidebar
    // supplies the actual horizontal obstruction (including collapsed width).
    const middle = doc.getElementById("ui-middle")?.getBoundingClientRect();
    if (middle?.height > 0) { top = Math.max(top, middle.top); bottom = Math.min(bottom, middle.bottom); }
    const sidebar = doc.getElementById("sidebar");
    const side = sidebar?.getBoundingClientRect();
    if (side?.width > 0 && side.height > 0 && win.getComputedStyle(sidebar).visibility !== "hidden"
      && side.right >= right - 1 && side.left > left && side.left < right && side.top < bottom && side.bottom > top) right = side.left;
    if (right <= left || bottom <= top) { removePosition(); return; }
    const set = (key, value) => {
      const formatted = `${value}px`;
      if (banner.style.getPropertyValue(key) !== formatted) banner.style.setProperty(key, formatted);
    };
    banner.setAttribute(ATTRIBUTE, position);
    set(VARIABLES[0], left); set(VARIABLES[1], win.innerWidth - right);
    // offsetHeight excludes the native pulse transform; never cancel animation.
    const height = banner.offsetHeight;
    const margin = Math.min(24, Math.max(0, (bottom - top - height) / 2));
    const available = Math.max(0, bottom - top - height - margin * 2);
    set(VARIABLES[2], top + margin + available * ({top: 0, center: 0.5, bottom: 1}[position]));
  };
  const start = () => {
    if (started) return;
    started = true;
    const on = (event, fn) => subscriptions.push([event, hooks.on(event, fn)]);
    on("renderApplicationV2", (_app, element) => { if (element?.id === "pause") sync(); });
    on("closeApplicationV2", (_app, element) => { if (element === banner) release(); });
    for (const event of ["canvasReady", "collapseSidebar", "renderSidebar"]) on(event, sync);
    sync();
  };
  const stop = () => {
    started = false;
    for (const [event, id] of subscriptions.splice(0)) hooks.off(event, id);
    release();
  };
  return Object.freeze({ start, stop, sync });
}
