# Spellcasting

[Documentation](../README.md) · [Getting Started](getting-started.md)

## Spellcasting Information Icons

1. Open a supported character sheet's **Spellcasting** tab or preparation window.
2. Click **Spellcasting Icons Disabled** to enable icons for that character on this
   client. The label becomes **Spellcasting Icons Enabled** with a green indicator.
3. Click again to disable them; the indicator becomes red. Hover/focus for tooltips.

Preferences are independent **per character and per client**, separated by world,
user, and actor UUID. Read-only viewers can change their own icon preference.
Opening a character does not save a preference. Other supported open interfaces
for that character update immediately; other characters and clients are unaffected.
The former global icon preference remains hidden and supplies the fallback for
characters without an explicit choice; it is not a visible Configure Settings option.

Indicators use structured spell data: attack, basic/non-basic Fortitude/Reflex/Will
save, supported area, reliable Self/Touch/range, duration, Sustain, and Incapacitation.
They do not infer mechanics from names or descriptions. Unknown details are omitted;
unselected casting modes may show an options indicator. Shield remains unclassified
as Self when its structured data does not reliably establish that targeting.

## Spellcasting Lock

1. As GM or character owner, click **Spellcasting Unlocked** (green open lock).
2. **Spellcasting Locked** (red closed lock) disables supported manual spell and
   spellcasting-entry editing/deletion and prepared-spell removal controls.
3. Unlock to restore manual controls immediately.

This is a saved actor-specific lock shared by its viewers, not a client preference.
Unauthorized viewers cannot change it. Protected controls include supported native
unprepare trashcans, preparation decrement/menu actions, and removal through
flexible-preparation checkboxes. Mouse, keyboard, and nested-icon activation are
covered for those controls.

Casting, preparation additions, slots, expenditure, consumption, and legitimate
PF2e Dailies/Leveler document automation remain available. There is no blanket
spell-document edit/delete restriction. Other interfaces, macros, and direct
updates may still modify spells; the lock is a convenience guard, not document
security. The paired lock/icon buttons remain compact and single-line, with full
tooltips when labels truncate on very narrow sheets.

## Supported interfaces and limits

| Surface | Icons | Lock |
| --- | --- | --- |
| Native PF2e character Spellcasting tab | Dedicated line beneath spell names; redundant numeric/Touch range badges omitted because the native range column remains. | Supported manual spell/entry edit, delete, and unprepare controls. |
| Native preparation window | Matching supported preparation spell rows. | Supported edit/delete, decrement/menu unprepare, and flexible-preparation removal controls. |
| Unified Spellbook | Matching Unified View rows within the native character sheet; icons beneath names, existing range/uses columns retained. | Matching supported native-action controls only. |
| PF2e HUD | Matching spell sidebar's existing secondary line alongside action costs; numeric range retained. | No Patchwork HUD lock button or general HUD editing guard. |

Unified Spellbook/PF2e HUD are optional. The source-inspected interfaces are noted in
[compatibility](getting-started.md#compatibility); this is partial interface coverage,
not full support for every provider window. Alternate sheets, HUD shortcuts/radial
menus, detached editors, and unsupported popups are not guaranteed. Open a supported
character/preparation interface to change icons if you normally use only the HUD.

After a provider update, test row layout, tooltips, casting, preparation and lock
behavior together, including Dailies, Leveler and Combat Conductor. Unsupported
structures should not be assumed protected merely because a lock icon is visible
somewhere else.
