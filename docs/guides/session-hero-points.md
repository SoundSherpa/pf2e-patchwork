# Session Hero Points

[Documentation](../README.md) · [Getting Started](getting-started.md)

## Configure starting amounts

1. As GM, open **Configure Settings → PF2e Patchwork → Session Hero Points — Configure…**.
2. Review the current active party. Opening or refreshing rereads membership.
3. Choose **Include in Reset** for each eligible character and set **Starting Hero
   Points** to 0–3, or **Use Default (N)**.
4. Optionally select **Discard Hero Action Cards on Reset**, then **Save Settings**.
5. In the main settings, enable **Session Hero Points — Enable Resets** and choose
   **Session Hero Points — Default Amount** (default 1).

Eligible party PCs are included by default. Companions require explicit inclusion
and a supported native Hero Point resource; NPCs/familiars without that resource
are not reset targets. Saved per-character amounts and inclusion use actor UUIDs,
not names. For a two-point override, select that character's row and choose 2.
Party removals do not erase saved preferences; returning characters retain them.

**Included with 0** means reset that character to zero. **Excluded** means leave
both their points and cards unchanged. The default option displays the current
world default; explicit character amounts take priority. Long rosters scroll.

This window contains settings only. Opening, refreshing, saving, or canceling it
never resets points or changes cards. Save drafts before launching a reset: the
reset uses saved configuration. Reloads and reconnects never reset resources.

## Run a confirmed reset

1. Open the active **Party Sheet** and click **Reset Session Hero Points**.
2. Review the included characters and resulting amounts in the confirmation.
   Cancel if anything is wrong; canceling submits no reset.
3. Confirm once, then review the result and any card-operation warnings.

The Party Sheet button opens confirmation directly, not configuration. A later
intentional reset requires fresh confirmation, without a visible session ID.
Already-correct point totals skip unnecessary actor updates but remain eligible
for optional card discarding. Failed resource updates do not discard that actor's cards.

## Optional PF2e Toolbelt cards

The saved discard checkbox exists only inside Session Hero Points configuration.
With the supported active PF2e Toolbelt Hero Actions contract, each eligible included
character's existing hand is discarded in one awaited provider batch after a
successful or already-correct point reset. Included zero-point characters also
have their existing cards discarded. Disabling the option leaves hands alone.

Patchwork **does not draw replacement cards**. Players draw them through PF2e
Toolbelt's normal controls, using its selected deck and configured card-count mode.
Patchwork neither selects a deck nor assumes a deck name, UUID, or result count.
Discarding does not require deck preflight. Provider messages may appear.

If Toolbelt is absent, disabled, or incompatible, normal Hero Point updates remain
available and hands are skipped. Read [compatibility](getting-started.md#compatibility)
for the supported provider contract. A card failure does not roll back updated
Hero Points. Inspect uncertain hands, including after reload, before retrying.

## Optional macro

Expand **Optional Reset Macro** in configuration and copy the displayed code into
a Script macro on the Macro Hotbar. It calls the same `resetSessionHeroPoints()` API
as the Party Sheet button, with the same GM checks, confirmation and safeguards.
`openSessionHeroPoints()` opens configuration only. Existing user macros are not
edited. Use one reset method per intended operation to avoid resetting twice.

## Interrupted operations

Only the elected active GM executes resets; other GMs can configure settings.
Local duplicate clicks/overlapping requests and stale confirmations are guarded.
These are **not atomic locks across tabs or disconnected clients**. Coordinate
between GMs; do not deliberately run simultaneous resets from multiple clients.

If **Review Interrupted Reset…** becomes available, stop other reset windows and
inspect resources/hands first. The separately confirmed recovery clears the guard
only; it changes no points/cards and does not replay possibly completed operations.
Any subsequent reset needs a new preview and confirmation. Submitted document
requests can finish late; Patchwork never automatically retries uncertain discards.
