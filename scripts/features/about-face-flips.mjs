import { MODULE_ID } from "../constants.mjs";

export const ABOUT_FACE_ENABLED = "aboutFaceAnimationImprovements";
export const ABOUT_FACE_DURATION = "aboutFaceFlipDuration";
export const ABOUT_FACE_ANIMATE_PATH = "foundry.canvas.placeables.Token.prototype.animate";
export const ABOUT_FACE_QUEUE_PATH = "game.aboutFace.applyDelayedFlip";
const PROVIDER = "about-face";
const read = (object, path) => Object.hasOwn(object, path) ? object[path]
  : path.split(".").reduce((value, part) => value?.[part], object);
const keys = object => object && typeof object === "object" && !Array.isArray(object) ? Object.keys(object) : null;

export function registerAboutFaceSettings(settings, onChange = () => {}) {
  const common = { scope: "world", restricted: true, config: true, onChange };
  settings.register(MODULE_ID, ABOUT_FACE_ENABLED, { ...common,
    name: "PATCHWORK.AboutFace.Enable.Name", hint: "PATCHWORK.AboutFace.Enable.Hint", type: Boolean, default: false });
  settings.register(MODULE_ID, ABOUT_FACE_DURATION, { ...common,
    name: "PATCHWORK.AboutFace.Duration.Name", hint: "PATCHWORK.AboutFace.Duration.Hint", type: Number,
    default: 500, range: { min: 0, max: 2000, step: 25 } });
}

export function aboutFaceDuration(settings) {
  const value = settings.get(MODULE_ID, ABOUT_FACE_DURATION);
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(2000, Math.round(value / 25) * 25)) : 500;
}

// Match the audited provider's movement markers and effective facing policy.
// Document texture is animated in v14; authoritative magnitude comes from source.
function facingPolicy(game, doc) {
  try {
    if (!game.modules.get(PROVIDER)?.active || typeof doc?.getFlag !== "function") return null;
    let mode = doc.getFlag(PROVIDER, "flipOrRotate") || "global";
    if (mode === "global") mode = game.settings.get(PROVIDER, "flip-or-rotate");
    let facing = doc.getFlag(PROVIDER, "facingDirection") || "global";
    if (facing === "global") facing = game.settings.get(PROVIDER, "facing-direction");
    return mode === "flip-h" && ["left", "right"].includes(facing)
      && game.settings.get(PROVIDER, "lockArrowToFace") === false ? facing : null;
  } catch { return null; }
}
export function aboutFaceIntent(game, doc, changes) {
  const facing = facingPolicy(game, doc);
  if (!facing || doc.isOwner === false || !keys(changes)
    || (changes.level && changes.level !== doc.level)
    || ![doc.x, doc.y, changes.x, changes.y].every(Number.isFinite)
    || (changes.rotation !== undefined && changes.rotation !== doc.rotation)) return null;
  const dx = changes.x - doc.x, dy = changes.y - doc.y;
  if (!dx && !dy) return null;
  const previous = read(changes, `flags.${PROVIDER}.prevPos`);
  const direction = changes.rotation === undefined ? Math.atan2(dy, dx) * 180 / Math.PI : doc.rotation + 90;
  if (previous?.x !== doc.x || previous?.y !== doc.y || read(changes, `flags.${PROVIDER}.direction`) !== direction) return null;
  const saved = doc._source?.texture?.scaleX, rendered = doc.texture?.scaleX;
  if (!Number.isFinite(saved) || !saved || !Number.isFinite(rendered)) return null;
  const mirror = dx ? (dx > 0) === (facing === "left") : saved < 0;
  return { saved, rendered, mirror, horizontal: dx !== 0, target: Math.abs(saved) * (mirror ? -1 : 1) };
}

function scalePlan(changes, intent, queued) {
  const requested = read(changes, "texture.scaleX");
  if (!intent.horizontal) return requested === undefined ? () => {} : null;
  const providerWouldFlip = (intent.rendered < 0 && !intent.mirror) || (intent.rendered > 0 && intent.mirror);
  if (queued ? requested !== undefined : (providerWouldFlip ? requested !== -intent.saved : requested !== undefined)) return null;
  const flat = Object.getOwnPropertyDescriptor(changes, "texture.scaleX");
  const texture = changes.texture;
  if (texture !== undefined && !keys(texture)) return null;
  const nested = texture && Object.getOwnPropertyDescriptor(texture, "scaleX");
  if (flat && nested && changes["texture.scaleX"] !== texture.scaleX) return null;
  const remove = intent.target === intent.saved && requested !== undefined;
  const insert = intent.target !== intent.saved && requested !== intent.target;
  if (remove && (flat?.configurable === false || nested?.configurable === false
    || (nested && Object.keys(texture).length === 1 && Object.getOwnPropertyDescriptor(changes, "texture")?.configurable === false))) return null;
  if (insert && !Object.isExtensible(changes)) return null;
  return () => {
    if (remove) {
      delete changes["texture.scaleX"];
      if (nested) { delete texture.scaleX; if (!Object.keys(texture).length) delete changes.texture; }
    }
    if (insert) changes["texture.scaleX"] = intent.target;
  };
}

const nativeQueue = provider => provider?.pendingFlips instanceof Map
  && provider.pendingFlips.get === Map.prototype.get && provider.pendingFlips.delete === Map.prototype.delete;
const noMirror = entry => entry && Object.hasOwn(entry, "mirrorKey") && Object.hasOwn(entry, "mirrorVal")
  && entry.mirrorKey === undefined && entry.mirrorVal === undefined;
const queueEntry = (provider, doc, entry) => nativeQueue(provider) && entry?.tokenDocument === doc && doc.object?.visible === true
  && ((entry.mirrorKey === "scaleX" && typeof entry.mirrorVal === "boolean") || noMirror(entry))
  // Provider queue durations are its audited contract, not Patchwork's slider
  // range. Owned flips receive their configured duration only in animate().
  && Number.isFinite(entry.duration) && entry.duration >= 125 && entry.duration <= 500 && Number.isFinite(entry.timestamp)
  && provider.pendingFlips.get(doc.id) === entry;
const visualKind = to => {
  const top = keys(to); if (!top) return null;
  if (!top.length) return "empty";
  const texture = keys(to.texture);
  return top.length === 1 && top[0] === "texture" && texture?.length === 1 && texture[0] === "scaleX"
    && Number.isFinite(to.texture.scaleX) ? "flip" : null;
};

function animationTag(options, id) {
  if (!keys(options) || typeof id !== "string" || !id || (options.animation != null && !keys(options.animation))) return null;
  const animation = options.animation ?? {}, previous = animation[MODULE_ID];
  if (previous !== undefined && (!keys(previous) || Object.values(previous).some(value => value !== true))) return null;
  const descriptor = Object.getOwnPropertyDescriptor(options, "animation");
  const writable = descriptor ? descriptor.writable === true : Object.isExtensible(options);
  if (!writable && options.animate !== false) return null;
  const scoped = { ...previous };
  // Native batch options are shared, and callers may reuse an options object.
  // Remove this document's previous tag before deciding whether this update owns it.
  if (Object.hasOwn(scoped, id) && writable) {
    delete scoped[id];
    const cleaned = { ...animation };
    if (Object.keys(scoped).length) cleaned[MODULE_ID] = scoped; else delete cleaned[MODULE_ID];
    options.animation = cleaned;
  }
  return () => {
    if (options.animate !== false) options.animation = { ...options.animation, [MODULE_ID]: { ...scoped, [id]: true } };
  };
}

export function createAboutFaceImprovements({ hooks, getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas, getLibWrapper = () => globalThis.libWrapper,
  getTokenClass = () => globalThis.foundry?.canvas?.placeables?.Token } = {}) {
  const listeners = [], registrations = [];
  let running = false, attached = false, library, provider;
  let handoffs = new WeakMap(), transitions = new WeakMap();
  function enabled() {
    try {
      const game = getGame();
      return running && attached && game.system?.id === "pf2e" && Number(game.release?.generation) === 14
        && game.modules.get(MODULE_ID)?.active !== false && game.modules.get(PROVIDER)?.active === true
        && game.aboutFace === provider && game.settings.get(MODULE_ID, ABOUT_FACE_ENABLED) === true;
    } catch { return false; }
  }
  function clear() { handoffs = new WeakMap(); transitions = new WeakMap(); }
  function detach() {
    attached = false; clear();
    const failed = [];
    for (const id of registrations.splice(0).reverse()) {
      try { library.unregister(MODULE_ID, id, false); } catch { failed.push(id); }
    }
    registrations.push(...failed);
    if (!failed.length) { library = undefined; provider = undefined; }
    return failed.length === 0;
  }
  function queued(wrapped, doc, axis, mirror, duration, ...rest) {
    // Always preserve the original queue call. No later movement hook means
    // native queue behavior remains intact, including other modules' callers.
    let before;
    try { before = nativeQueue(this) ? this.pendingFlips.get(doc?.id) : undefined; } catch { /* Preserve the original call. */ }
    const result = wrapped(doc, axis, mirror, duration, ...rest);
    try {
      if (enabled() && this === provider && doc && typeof doc === "object"
        && ((axis === "scaleX" && typeof mirror === "boolean") || (axis === undefined && mirror === undefined))) {
        const entry = this.pendingFlips.get(doc.id);
        if (entry !== before && queueEntry(this, doc, entry) && entry.mirrorVal === mirror && entry.duration === duration) {
          handoffs.set(doc, entry);
          queueMicrotask(() => { if (handoffs.get(doc) === entry) handoffs.delete(doc); });
        }
      }
    } catch { /* Unsupported queue observations do not change the original call. */ }
    return result;
  }
  function update(doc, changes, options = {}) {
    if (!enabled()) return;
    try {
      const entry = handoffs.get(doc); handoffs.delete(doc);
      const tag = animationTag(options, doc.id); if (!tag) return;
      const intent = aboutFaceIntent(getGame(), doc, changes);
      if (!intent) return;
      const multiple = (getCanvas()?.tokens?.controlled?.length ?? 0) > 1;
      const transfer = entry && queueEntry(provider, doc, entry)
        && (intent.horizontal ? entry.mirrorKey === "scaleX" && entry.mirrorVal === intent.mirror : noMirror(entry));
      if (multiple && provider.fasterAnimations === true && !transfer) return;
      const apply = scalePlan(changes, intent, Boolean(transfer));
      if (!apply) return;
      apply();
      // Scope the marker to the IDs already participating in this native update.
      // It carries no targets, positions or media; no custom socket is used.
      tag();
      if (transfer) provider.pendingFlips.delete(doc.id);
    } catch {
      // Unknown provider/update contracts retain native behavior; no private logs.
    }
  }
  function animate(wrapped, to, options = {}) {
    const id = this.document?.id, scope = options[MODULE_ID];
    if (!enabled() || typeof id !== "string" || !scope || !Object.hasOwn(scope, id) || scope[id] !== true
      || options.chain || options.ontick !== undefined
      || (options.name !== undefined && options.name !== this.animationName)) return wrapped(to, options);
    if (!facingPolicy(getGame(), this.document)) return wrapped(to, options);
    const kind = visualKind(to), own = transitions.get(this);
    const current = this.animationContexts?.get?.(this.animationName);
    if (current && visualKind(current.to) === null) { transitions.delete(this); return wrapped(to, options); }
    if (own && own.context === current && current.chain?.length === 0
      && (kind === "empty" || (kind === "flip" && to.texture.scaleX === own.target))) {
      return own.promise;
    }
    transitions.delete(this);
    if (kind !== "flip") return wrapped(to, options);
    const result = wrapped(to, { ...options, duration: aboutFaceDuration(getGame().settings) });
    const context = this.animationContexts?.get?.(this.animationName);
    if (visualKind(context?.to) === "flip" && context.to.texture.scaleX === to.texture.scaleX && context.promise?.then && result?.then) {
      const entry = { context, promise: result, target: to.texture.scaleX };
      transitions.set(this, entry);
      const done = () => { if (transitions.get(this) === entry) transitions.delete(this); };
      context.promise.then(done, done);
    }
    return result;
  }
  function sync() {
    let nextLibrary, nextProvider, wanted = false;
    try {
      const game = getGame(); nextLibrary = getLibWrapper(); nextProvider = game.aboutFace;
      wanted = running && game.system?.id === "pf2e" && Number(game.release?.generation) === 14
        && game.modules.get(MODULE_ID)?.active !== false && game.modules.get(PROVIDER)?.active === true
        && game.modules.get("lib-wrapper")?.active === true && game.settings.get(MODULE_ID, ABOUT_FACE_ENABLED) === true
        && typeof nextLibrary?.register === "function" && typeof nextLibrary?.unregister === "function"
        && typeof getTokenClass()?.prototype?.animate === "function" && nativeQueue(nextProvider)
        && typeof nextProvider.applyDelayedFlip === "function" && typeof nextProvider.applyPendingFlips === "function"
        && typeof nextProvider.fasterAnimations === "boolean";
    } catch { /* Unsupported optional-provider inspection disables this integration. */ }
    if (wanted && attached && provider === nextProvider && library === nextLibrary) return true;
    if (registrations.length && !detach()) return false;
    if (!wanted) return false;
    library = nextLibrary; provider = nextProvider;
    try {
      for (const [path, wrapper, type] of [[ABOUT_FACE_ANIMATE_PATH, animate, "MIXED"], [ABOUT_FACE_QUEUE_PATH, queued, "WRAPPER"]]) {
        const id = library.register(MODULE_ID, path, wrapper, type);
        registrations.push(Number.isInteger(id) ? id : path);
        if (!Number.isInteger(id)) throw new Error("Unsupported wrapper registration contract");
      }
      attached = true;
    } catch { detach(); }
    return attached;
  }
  function start() {
    if (running) return attached;
    running = true;
    try {
      for (const [event, fn] of [["preUpdateToken", update], ["canvasTearDown", clear],
        ["deleteToken", doc => { handoffs.delete(doc); if (doc.object) transitions.delete(doc.object); }],
        ["destroyToken", token => { transitions.delete(token); handoffs.delete(token.document); }]]) {
        listeners.push([event, hooks.on(event, fn)]);
      }
      return sync();
    } catch { stop(); return false; }
  }
  function stop() {
    running = false;
    for (const [event, id] of listeners.splice(0)) hooks.off(event, id);
    return detach();
  }
  return Object.freeze({ start, stop, sync });
}
