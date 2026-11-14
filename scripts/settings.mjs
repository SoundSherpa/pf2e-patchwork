import { MODULE_ID } from "./constants.mjs";

export function registerSettings(settings) {
  settings.register(MODULE_ID, "debug", {
    name: "PATCHWORK.Settings.Debug.Name",
    hint: "PATCHWORK.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}
