import { spellIndicators, addSpellIndicators } from "./spell-information.mjs";
import { spellIconsEnabled } from "./spell-icon-preferences.mjs";
import { createSpellSurfaceLifecycle, spellRows, rowSpell } from "./spell-surfaces.mjs";

export function createSpellInformationUI({ hooks, getGame = () => globalThis.game, getApplications }) {
  return createSpellSurfaceLifecycle({ hooks, getGame, getApplications, install: ({ app, root, kind }) => {
    const badges = new Map();
    const clear = () => { for (const { group } of badges.values()) group.remove(); badges.clear(); };
    return {
      refresh() {
        const game = getGame();
        if (!spellIconsEnabled(game, app.actor)) { clear(); return; }
        const rows = new Set(spellRows(root, kind, game));
        for (const [row, { group }] of badges) {
          if (!rows.has(row)) { group.remove(); badges.delete(row); }
        }
        const localize = (key, fallback) => {
          const path = `PATCHWORK.Spells.${key}`;
          const text = game.i18n?.localize(path);
          return text && text !== path ? text : fallback;
        };
        for (const row of rows) {
          const native = kind === "native" && !row.closest("ol.unified-spell-list");
          const layout = kind === "hud" ? "hud" : kind === "native" ? native ? "native" : "unified" : "inline";
          const host = kind === "hud" ? row.querySelector(".details > .extras") :
            kind === "preparation" ? row.querySelector(":scope > .item-name") : row.querySelector(":scope > .item-name > h4.name");
          const actions = kind === "hud" ? host?.querySelector(":scope > .actions") : null;
          const supported = host && (kind !== "hud" || actions &&
            host.querySelector(':scope > [data-section="category"], :scope > .cast'));
          const spell = rowSpell(app, row, kind);
          const indicators = (supported ? spellIndicators(spell, { castRank: Number(row.dataset.castRank),
            entryId: row.dataset.entryId }, localize) : []).filter(indicator =>
              !native || !["range", "touch"].includes(indicator.kind)).map(indicator => {
            // Unified/preparation retain their existing range information.
            // HUD retains numeric labels; native rows omit range/touch entirely.
            const rangeText = row.querySelector(":scope > .range")?.textContent.trim().toLowerCase();
            return indicator.sourceRange && rangeText === indicator.sourceRange ? { ...indicator, text: "" } : indicator;
          });
          const key = JSON.stringify([layout, indicators]);
          const previous = badges.get(row);
          if (previous?.key === key && previous.group.parentElement === host) continue;
          previous?.group.remove(); badges.delete(row);
          const group = addSpellIndicators(host, indicators);
          if (group) {
            group.dataset.layout = layout;
            if (actions) actions.before(group);
            badges.set(row, { key, group });
          }
        }
      },
      destroy: clear
    };
  } });
}
