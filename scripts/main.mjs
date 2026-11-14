import { MODULE_ID, VERSION } from "./constants.mjs";
import { FEATURES } from "./features/catalog.mjs";
import { registerSettings } from "./settings.mjs";
import { createGMTargetIndicators, registerGMTargetSettings } from "./features/gm-target-indicators.mjs";
import { createDayNightPlaylists, registerDayNightSettings } from "./features/day-night-playlists.mjs";
import { createPauseBannerPosition, registerPausePositionSetting } from "./features/pause-banner-position.mjs";
import { createChatToolbarAppearance, registerChatToolbarSettings } from "./features/chat-toolbar-appearance.mjs";
import { createPlaylistCurationUI } from "./features/playlist-curation-ui.mjs";
import { createDayNightSceneUI } from "./features/day-night-scene-ui.mjs";
import { createAboutFaceImprovements, registerAboutFaceSettings } from "./features/about-face-flips.mjs";
import { createSilentGMInitiative, registerSilentInitiativeSetting } from "./features/silent-gm-initiative.mjs";
import { registerSpellInformationSetting } from "./features/spell-information.mjs";
import { createSpellInformationUI } from "./features/spell-information-ui.mjs";
import { createSpellbookLock } from "./features/spellbook-lock.mjs";
import { registerSpellIconPreferences } from "./features/spell-icon-preferences.mjs";
import { createSessionHeroPoints, registerHeroPointSettings } from "./features/session-hero-points.mjs";
import { createSessionHeroPointUI } from "./features/session-hero-points-ui.mjs";
import { createTokenMovement, registerTokenMovementSettings } from "./features/token-movement.mjs";
import { createTokenMovementUI } from "./features/token-movement-ui.mjs";

export function initialize(game, logger = console, onTargetSettingChange, onDayNightChange,
  onPausePositionChange, onChatToolbarChange, onAboutFaceChange, onSpellInformationChange, onSpellIconPreferencesChange, heroUI, movementUI) {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  const generation = Number(game.release?.generation);
  if (game.system?.id !== "pf2e" || generation !== 14) {
    logger.warn("PF2e Patchwork | Requires Foundry v14 and Pathfinder 2e; initialization skipped.");
    return false;
  }
  // Native settings menus render first; put Hero Point fields directly after them.
  registerHeroPointSettings(game.settings, heroUI?.getMenuType());
  registerGMTargetSettings(game.settings, onTargetSettingChange);
  registerDayNightSettings(game.settings, onDayNightChange);
  registerPausePositionSetting(game.settings, onPausePositionChange);
  registerChatToolbarSettings(game.settings, onChatToolbarChange);
  registerAboutFaceSettings(game.settings, onAboutFaceChange);
  registerSilentInitiativeSetting(game.settings);
  registerSpellInformationSetting(game.settings, onSpellInformationChange);
  registerSpellIconPreferences(game, onSpellIconPreferencesChange);
  registerTokenMovementSettings(game.settings, movementUI?.sync);
  // Register every feature above this line so diagnostics stay last in the
  // native settings list. Registration does not change stored preferences.
  registerSettings(game.settings);
  module.api = Object.freeze({
    id: MODULE_ID,
    version: VERSION,
    features: FEATURES,
    ...(heroUI ? { openSessionHeroPoints: heroUI.open, resetSessionHeroPoints: heroUI.reset } : {}),
    ...(movementUI ? { tokenMovement: movementUI.api } : {}),
    getDiagnostics: () => Object.freeze({
      id: MODULE_ID,
      version: VERSION,
      foundry: game.version ?? null,
      pf2e: game.system.version ?? null,
      // No target, user, token, playlist, chat, or world data in diagnostics.
      features: FEATURES
    })
  });
  return true;
}

const lifecycles = new WeakMap();

export function registerLifecycle(hooks, getGame = () => globalThis.game, logger = console,
  getCanvas = () => globalThis.canvas) {
  if (lifecycles.has(hooks)) return lifecycles.get(hooks);
  const targets = createGMTargetIndicators({ hooks, getGame, getCanvas });
  const music = createDayNightPlaylists({ hooks, getGame });
  const sceneUI = createDayNightSceneUI({ hooks, getGame });
  const pause = createPauseBannerPosition({ hooks, getGame });
  const chatToolbar = createChatToolbarAppearance({ hooks, getGame });
  const curation = createPlaylistCurationUI({ hooks, getGame });
  const facing = createAboutFaceImprovements({ hooks, getGame, getCanvas });
  const initiative = createSilentGMInitiative({ hooks, getGame });
  const spellInformation = createSpellInformationUI({ hooks, getGame });
  const spellbook = createSpellbookLock({ hooks, getGame });
  const heroes = createSessionHeroPoints({ hooks, getGame });
  const heroUI = createSessionHeroPointUI({ hooks, getGame, service: heroes });
  const movement = createTokenMovement({ getGame, getCanvas });
  const movementUI = createTokenMovementUI({ hooks, getGame, getCanvas, service: movement });
  let cleaned = false;
  const init = hooks.once("init", () => initialize(getGame(), logger, targets.sync, () => {
    sceneUI.refresh();
    return music.sync();
  }, pause.sync, chatToolbar.sync, facing.sync, () => {
    spellInformation.sync(); spellbook.sync();
  }, actors => {
    for (const uuid of actors) { spellInformation.sync(uuid); spellbook.sync(uuid); }
  }, heroUI, movementUI));
  const ready = hooks.once("ready", () => {
    const game = getGame();
    const api = game.modules.get(MODULE_ID)?.api;
    if (api) {
      targets.start(); sceneUI.start(); pause.start(); chatToolbar.start(); curation.start(); facing.start();
      spellInformation.start(); spellbook.start();
      heroUI.start();
      movementUI.start();
    }
    if (api && game.settings.get(MODULE_ID, "debug")) {
      logger.debug("PF2e Patchwork |", api.getDiagnostics());
    }
    if (api) return Promise.all([initiative.start(), music.start()]);
  });
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    hooks.off("init", init);
    hooks.off("ready", ready);
    targets.destroy();
    sceneUI.stop();
    pause.stop();
    chatToolbar.stop();
    facing.stop();
    initiative.stop();
    spellInformation.stop();
    spellbook.stop();
    movementUI.stop();
    lifecycles.delete(hooks);
    return Promise.all([music.destroy(), curation.stop(), heroUI.stop()]);
  };
  lifecycles.set(hooks, cleanup);
  return cleanup;
}

if (globalThis.Hooks) registerLifecycle(globalThis.Hooks);
