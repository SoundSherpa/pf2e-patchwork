import { heroRoster, heroPreview, heroOperation, isHeroPointGM } from "./session-hero-points.mjs";

export function createSessionHeroPointReset({ getGame, service, getDialogClass, getDocument } = {}) {
  let active = null, pending = null, stopped = false;
  const loc = key => getGame().i18n.localize(`PATCHWORK.HeroPoints.${key}`);
  const error = code => Object.assign(new Error(`PF2e Patchwork: ${code}`), { code });

  function reset(options = {}) {
    if (stopped || !isHeroPointGM(getGame())) return Promise.reject(error("authority"));
    if (options.partyUuid && options.partyUuid !== getGame().actors?.party?.uuid) return Promise.reject(error("party"));
    if (pending) { active?.bringToFront?.(); return pending; }
    pending = launch().finally(() => { pending = null; });
    return pending;
  }

  async function launch() {
    await active?.close();
    const Dialog = getDialogClass(), document = getDocument();
    if (typeof Dialog !== "function") throw error("unavailable");
    const node = (tag, text) => { const el = document.createElement(tag); if (text) el.textContent = text; return el; };
    const wrapper = node("div"), panel = node("div"); panel.dataset.patchwork = "session-hero-reset"; wrapper.append(panel);
    const status = node("div"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); panel.append(status);
    let preview, excluded = [], phase = "confirm", recovery = null, closed = false, observer;
    try {
      const roster = heroRoster(getGame());
      excluded = roster.rows.filter(row => row.reason).map(row => row.uuid);
      preview = heroPreview(getGame(), roster.rows.filter(row => !row.reason).map(row => row.uuid));
      status.append(node("p", loc("ConfirmHint")));
      const list = node("ul"); list.dataset.part = "review";
      for (const row of preview.rows) list.append(node("li", `${row.name}: ${row.to} ${loc("Points")}`));
      status.append(list);
      if (preview.deck) {
        status.append(node("p", loc(preview.deck.available ? "DeckConfirm" : "DeckUnavailable")));
        if (!preview.deck.available) status.append(node("p", loc(`DeckReasons.${preview.deck.reason}`)));
      }
      if (preview.previousUncertain) status.append(node("p", loc("PreviousWarning")));
    } catch (cause) {
      phase = "blocked"; status.append(node("p", loc(`Errors.${cause.code ?? "configuration"}`)));
      if (cause.code === "busy") {
        const operation = heroOperation(getGame());
        if (operation?.status === "running" && service.canRecover(operation.token)) recovery = operation.token;
      }
    }
    if (stopped) return { cancelled: true };
    let resolve, settled = false;
    const resultPromise = new Promise(done => { resolve = done; });
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const busy = () => phase === "processing";
    let dialog;
    const refresh = () => {
      if (!dialog?.element || closed) return;
      const yes = dialog.element.querySelector('[data-action="yes"]'), recover = dialog.element.querySelector('[data-action="recover"]');
      if (yes) { yes.hidden = !["confirm", "recover-confirm"].includes(phase); if (yes.disabled !== busy()) yes.disabled = busy();
        yes.querySelector("span").textContent = loc(phase === "recover-confirm" ? "Recover" : "Reset"); }
      if (recover) { recover.hidden = phase !== "blocked" || !recovery || !service.canRecover(recovery); if (recover.disabled !== busy()) recover.disabled = busy(); }
      const no = dialog.element.querySelector('[data-action="no"]');
      if (no) { if (no.disabled) no.disabled = false; no.querySelector("span").textContent = loc(phase === "result" ? "Close" : "Cancel"); }
    };
    const showResult = result => {
      phase = "result"; status.replaceChildren();
      const names = new Map(preview.rows.map(row => [row.uuid, row.name]));
      status.append(node("p", getGame().i18n.format("PATCHWORK.HeroPoints.Result", {
        updated: result.updated.length, unchanged: result.unchanged.length,
        failed: result.failed.length + result.stopped.length, excluded: excluded.length
      })));
      if (result.failed.length || result.stopped.length) status.append(node("p", `${loc("Failures")}: ${[...result.failed.map(row => row.uuid), ...result.stopped].map(uuid => names.get(uuid) ?? uuid).join(", ")}`));
      if (result.deck.length) status.append(node("p", getGame().i18n.format("PATCHWORK.HeroPoints.DeckResult", {
        completed: result.deck.filter(row => row.status === "completed" && !row.alreadyEmpty).length,
        empty: result.deck.filter(row => row.status === "completed" && row.alreadyEmpty).length,
        other: result.deck.filter(row => row.status !== "completed").length
      })));
      if (result.deck.length && result.deck.every(row => row.status === "completed") && !result.ledgerFailed && !result.failed.length && !result.stopped.length) status.append(node("p", loc("DeckManualReady")));
      for (const row of result.deck.filter(row => row.status !== "completed")) status.append(node("p", `${names.get(row.uuid) ?? row.uuid}: ${loc(`DeckReasons.${row.reason ?? "provider-contract"}`)}`));
      for (const row of result.deck.filter(row => row.status !== "completed" && row.after !== undefined)) status.append(node("p", `${names.get(row.uuid) ?? row.uuid}: ${getGame().i18n.format("PATCHWORK.HeroPoints.DiscardObservation", { before: row.before, after: row.after ?? loc("Unknown"), removed: row.removed ?? loc("Unknown") })}`));
      if (result.ledgerFailed || result.failed.length || result.stopped.length || result.deck.some(row => ["failed", "uncertain"].includes(row.status))) status.append(node("p", loc("Uncertain")));
    };
    const execute = async recovering => {
      if (busy() || closed) return;
      phase = "processing"; status.replaceChildren(node("p", loc("Processing"))); refresh();
      try {
        if (recovering) {
          await service.recover(recovery, { confirmed: true, isCurrent: () => !closed && !stopped });
          if (!closed) { phase = "result"; status.replaceChildren(node("p", loc("Recovered"))); }
          finish({ recovered: true });
        } else {
          const result = await service.reset(preview, { confirmed: true, isCurrent: () => !closed && !stopped });
          if (!closed) showResult(result);
          finish({ ...result, excluded });
        }
      } catch (cause) {
        if (!closed) { phase = "result"; status.replaceChildren(node("p", loc(`Errors.${cause.code ?? "uncertain"}`))); }
        finish({ failed: true, reason: cause.code ?? "uncertain" });
      } finally { refresh(); }
    };
    dialog = new Dialog({ window: { title: loc("ConfirmTitle") }, position: { width: 540 },
      classes: ["patchwork-session-hero-points", "patchwork-hero-reset"], content: wrapper,
      form: { closeOnSubmit: false }, buttons: [
        { action: "yes", label: loc("Reset"), callback: () => { if (["confirm", "recover-confirm"].includes(phase)) void execute(phase === "recover-confirm"); } },
        { action: "recover", label: loc("Recover"), type: "button", callback: () => {
          if (phase !== "blocked" || !service.canRecover(recovery)) return;
          phase = "recover-confirm"; status.replaceChildren(node("p", loc("RecoveryHint"))); refresh();
        } },
        { action: "no", label: loc("Cancel"), type: "button", default: true, callback: () => dialog.close() }
      ] });
    active = dialog;
    const mount = () => {
      const root = dialog.element.querySelector('[data-patchwork="session-hero-reset"]');
      if (root && !root.contains(status)) root.replaceChildren(status);
      observer?.disconnect(); observer = new document.defaultView.MutationObserver(refresh);
      const footer = dialog.element.querySelector("footer");
      if (footer) observer.observe(footer, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
      refresh();
    };
    dialog.addEventListener("render", mount);
    dialog.addEventListener("close", () => {
      closed = true; observer?.disconnect(); dialog.removeEventListener("render", mount);
      if (busy()) service.cancel(); else finish({ cancelled: true });
      if (active === dialog) active = null;
    }, { once: true });
    await dialog.render({ force: true });
    return resultPromise;
  }
  return { reset, async stop() { stopped = true; service.cancel(); await active?.close(); } };
}
