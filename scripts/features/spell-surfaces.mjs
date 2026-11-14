// Narrow, inspected application contracts. No document-wide spell selectors.
export const SPELL_SURFACES = [
  ["ActorSheetPF2e", "native"], ["SpellPreparationApp", "preparation"], ["SpellsSidebarPF2eHUD", "hud"]
];

export function surfaceRoot(app, html, kind, game) {
  const element = html?.querySelector ? html : html?.[0];
  if (!element?.querySelector || app.actor?.type !== "character") return null;
  if (kind === "native") return element.querySelector('.tab.spellcasting[data-tab="spellcasting"]');
  if (kind === "preparation" && app.entry?.actor === app.actor &&
      element.querySelector(".sheet-header") && element.querySelector("section.content")) return element;
  if (kind === "hud" && game.modules?.get("pf2e-hud")?.active === true && app.name === "spells" &&
      typeof app.getSidebarItemFromElement === "function" && element.id === "pf2e-hud-sidebar") return element;
  return null;
}

export function spellRows(root, kind, game) {
  if (kind === "preparation") return [...root.querySelectorAll("li.spell-row[data-item-id][data-cast-rank]")];
  return [...root.querySelectorAll('[data-item-type="spell"][data-item-id][data-cast-rank], [data-item-type="spell-slot-group"][data-item-id][data-cast-rank]')]
    .filter(row => {
      if (kind === "hud") return row.matches(".item") && !!row.querySelector(".details > .name");
      const unified = row.closest("ol.unified-spell-list");
      if (unified && game.modules?.get("pf2e-unified-spellbook")?.active !== true) return false;
      return row.matches("li.spell") && !!row.querySelector(":scope > .item-name > h4.name");
    });
}

export function rowSpell(app, row, kind) {
  if (kind === "hud") {
    try {
      const item = app.getSidebarItemFromElement(row);
      return item?.spell?.id === row.dataset.itemId && item.entryId === row.dataset.entryId &&
        item.castRank === Number(row.dataset.castRank) ? item.spell : null;
    } catch {
      // A changed optional provider lookup must not interrupt other surfaces.
      return null;
    }
  }
  const collection = app.actor.spellcasting?.collections?.get(row.dataset.entryId);
  // Ephemeral staff/item spells live in collections, not necessarily actor.items.
  return collection?.get(row.dataset.itemId) ?? app.actor.items?.get(row.dataset.itemId) ?? null;
}

/** Own hooks, observers and each application's cleanup without retaining closed sheets. */
export function createSpellSurfaceLifecycle({ hooks, getGame, install, kinds = ["native", "preparation", "hud"],
  getApplications = () => [...Object.values(globalThis.ui?.windows ?? {}),
    ...Array.from(globalThis.foundry?.applications?.instances?.values?.() ?? [])] }) {
  const surfaces = new Map();
  let registrations = [], active = false;
  const remove = app => {
    const record = surfaces.get(app);
    if (!record) return;
    record.observer?.disconnect(); record.owned.destroy(); surfaces.delete(app);
  };
  const render = (app, html, kind) => {
    if (!active) return;
    const root = surfaceRoot(app, html, kind, getGame());
    if (!root) { remove(app); return; }
    const previous = surfaces.get(app);
    if (previous?.root === root && previous.actor === app.actor && previous.uuid === app.actor.uuid) { previous.owned.refresh(); return; }
    remove(app);
    const owned = install({ app, root, kind });
    const Observer = root.ownerDocument?.defaultView?.MutationObserver;
    const observer = Observer ? new Observer(changes => {
      // Ignore our badges and controls so decorating never schedules itself.
      const relevant = changes.some(change => change.type === "attributes" ||
        [...change.addedNodes, ...change.removedNodes].some(node =>
          node.nodeType === 1 && !node.matches?.(".patchwork-spell-information, .patchwork-spellcasting-controls, .patchwork-spellbook-lock, .patchwork-spell-icons")));
      if (active && relevant) owned.refresh();
    }) : null;
    observer?.observe(root, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["data-cast-rank", "data-entry-id", "data-item-id", "aria-expanded"] });
    surfaces.set(app, { root, owned, observer, actor: app.actor, uuid: app.actor.uuid, kind });
    owned.refresh();
  };
  const sync = uuid => {
    if (!active) return;
    for (const [app, record] of surfaces) {
      if (uuid && record.uuid !== uuid && app.actor?.uuid !== uuid) continue;
      if (!record.root.isConnected) remove(app);
      else if (record.actor !== app.actor || record.uuid !== app.actor?.uuid) render(app, app.element, record.kind);
      else record.owned.refresh();
    }
  };
  const start = () => {
    if (active) return;
    active = true;
    for (const [name, kind] of SPELL_SURFACES.filter(([, kind]) => kinds.includes(kind))) {
      registrations.push([`render${name}`, hooks.on(`render${name}`, (app, html) => render(app, html, kind))],
        [`close${name}`, hooks.on(`close${name}`, remove)]);
    }
    registrations.push(["updateActor", hooks.on("updateActor", actor => sync(actor?.uuid))],
      ["updateUser", hooks.on("updateUser", () => sync())],
      ["deleteActor", hooks.on("deleteActor", actor => {
        for (const [app, record] of surfaces) if (record.actor === actor || record.uuid === actor.uuid) remove(app);
      })]);
    for (const app of getApplications()) {
      const kind = app.name === "spells" ? "hud" : app.entry ? "preparation" : "native";
      if (kinds.includes(kind)) render(app, app.element, kind);
    }
  };
  const stop = () => {
    active = false;
    for (const [name, id] of registrations) hooks.off(name, id);
    registrations = [];
    for (const app of surfaces.keys()) remove(app);
  };
  return { start, sync, stop };
}
