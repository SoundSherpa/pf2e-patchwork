# Token Movement History

[Documentation](../README.md) · [Getting Started](getting-started.md)

## Enable the controls

1. As GM, enable **Token Movement History** in Patchwork settings.
2. Set **Movement History Access** to **GM Only** or **GM and Authorized Players**.
   The latter is the default access policy; the feature itself starts disabled.
3. Start an encounter containing the token, view its scene, and open the token's
   right-click HUD. Choose **Movement History** in the **left HUD column**.

The compact submenu contains two separate actions. Native HUD controls remain in
place, and mouse/keyboard activation is supported. No separate combat-visibility
or Allow Undo setting exists.

The button appears only for an authorized current-canvas token genuinely represented
by a combatant in a **started** encounter. Scene-linked and scene-independent
encounters work; an encounter need not have its own scene assigned. A different
scene's unrelated token does not qualify merely because its ID matches. Visibility
updates as encounters start/end, membership changes, scenes change, and the HUD
rerenders. Ineligible open submenus are removed.

## Reset Traveled Distance

Select **Reset Traveled Distance** to clear native recorded movement distance
without changing position. New movement starts from the token's current position.
This uses Foundry's `TokenDocument.clearMovementHistory()`; it does not change speed,
terrain costs, or PF2e movement mechanics.

## Undo Recorded Movement

Select **Undo Recorded Movement** to immediately return to where the native
recording began. **There is no confirmation.** It uses
`TokenDocument.revertRecordedMovement()` without a movement ID, reverting the
**entire recording**, not just the most recent step. Foundry also controls restored
elevation, dimensions/shape and the rollback's animation behavior.

An empty history is handled without a position change. Normal movement must finish
or stop before these actions; paused/pending moves and active animations can block
them. A failed or uncertain native result is reported without automatically retrying.

## Macro API outside combat

Combat-only visibility applies to the HUD, not the shared API. An authorized user
can operate on native history outside combat through the same guarded methods:

```javascript
const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("Select a token first.");
const api = game.modules.get("pf2e-patchwork-qol")?.api?.tokenMovement;
if (!api) return ui.notifications.warn("Enable PF2e Patchwork first.");
await api.resetTraveledDistance(token.document);
```

For immediate whole-recording Undo, replace the last line with:
`await api.undoRecordedMovement(token.document);`
Native failures/permission errors reject the call; inspect an error before retrying.
These examples do not alter or replace any existing user macro.

## Permissions and limits

Feature/access policy and native token update, control and drag permissions are
rechecked at execution. Actor ownership alone does not override native restrictions;
players cannot use these actions to manipulate unauthorized tokens. Scene changes,
removed tokens and duplicate local operations are guarded.

Overlap protection is local, not an atomic cross-client token lock. Coordinate
simultaneous actions between users. Recording availability follows native Foundry
rules (normally participating tokens in started combat); the outside-combat API
does not invent missing history.

Patchwork preserves native movement rules/ruler costs and About Face/Combat
Conductor behavior; unusual module combinations still need table-specific testing.
Wall-aware routing and pathfinding are not included. The maintainer uses Wayfinder
as a separate module.
