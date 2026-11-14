# Getting Started

[Documentation](../README.md) · [Project README](../../README.md)

## Installation

Install using the manifest URL in the [project README](../../README.md#installation),
then enable **PF2e Patchwork** through **Manage Modules** in a PF2e world.

### Manual ZIP installation and updates

1. Back up the world and existing installation; stop the world before replacing files.
2. Download `pf2e-patchwork-qol-vVERSION.zip` and its `.sha256` file from the same
   [official release](https://github.com/SoundSherpa/pf2e-patchwork/releases).
3. Verify the ZIP's SHA-256 against that checksum. Do not install a GitHub source archive.
4. Extract it into Foundry's `Data/modules` directory. The final path must be
   `Data/modules/pf2e-patchwork-qol/module.json`, without an extra nested module folder.
5. Restart Foundry and hard-refresh connected browsers after updating. Confirm
   installed and runtime versions agree using the read-only checks below.

The module ID is `pf2e-patchwork-qol`. Preserve that folder name and its settings namespace.

## Compatibility

Required: **Foundry VTT generation 14** and **Pathfinder 2e**. Optional integrations
below have specific provider contracts and partial interface coverage.

| Optional module | Integration boundary |
| --- | --- |
| About Face + libWrapper | Only recognized horizontal-flip policies, animation/update markers, and delayed-flip queue APIs. Unknown contracts retain native/provider behavior; rotation and unsupported modes remain provider-owned. |
| Dice So Nice | Covered GM initiative presentation uses skip flags and the message-preprocessing hook. Other animations are unaffected; custom overlays need separate verification. |
| Unified Spellbook | Matching native character-sheet Unified View rows. Source inspection used 1.0.0; it is not a guarantee for every interface or later version. |
| PF2e HUD | Matching spell sidebar rows and resolver API. Source inspection used 2.57.0; shortcuts, radial menus, and arbitrary popups are not covered. |
| PF2e Toolbelt | Optional discard-only Hero Actions integration checks the inspected 3.61.3 API, enabled Hero Actions, and readable hands. Other versions/contracts skip discarding while normal Hero Point resets remain usable. |

The provider inspection versions above identify evidence, not recommended latest
versions. Patchwork has no mandatory third-party module dependency. Missing optional
modules do not disable unrelated features. Theme/provider updates can change UI
structures; use the matching feature guide before relying on coverage.

## Finding settings

1. Open **Game Settings → Configure Settings → PF2e Patchwork**.
2. As GM, use **Session Hero Points — Configure…** at the top; **Enable Resets** and
   **Default Amount** follow it. Configure is settings-only.
3. Enable only the world features you want. Client pause/chat preferences apply
   independently on each browser/client. **Log Startup Diagnostics** is last.
4. Save settings, then use the feature's normal interface. Special locations are
   linked from the [documentation index](../README.md).

Spell icons use a character/client button rather than a visible module-setting
checkbox. Spellcasting locks belong to the actor. Playlist curation is a GM action
in the Playlists sidebar. None of these requires a new global setting.

## Troubleshooting

- **Updated files, old behavior:** restart Foundry and hard-refresh each browser.
  Compare `game.modules.get("pf2e-patchwork-qol")?.version` with
  `game.modules.get("pf2e-patchwork-qol")?.api?.version` in the Console. These reads
  change nothing.
- **Missing controls:** confirm the feature is enabled, the user has native
  permission, and the interface matches a documented supported surface. Movement
  History also requires a participating token in a started encounter.
- **Missing optional integration:** check its module is active and its version/API
  matches the documented contract. Normal Hero Point updates do not require Toolbelt.
- **Unexpected playlist playback:** check native Scene Playlist assignments and
  the [audio conflict guidance](scene-audio.md#automatic-daynight-playlists).
- **Interrupted or uncertain reset:** inspect Hero Points and Toolbelt hands before
  another attempt. Recovery clears a guard, not resources; it never replays work.
- **Reporting a bug:** follow the [support instructions](../../README.md#support-and-issues).
  Startup diagnostics are optional and report versions/feature status; inspect any
  other console output before sharing it. Do not publish campaign data.

For safe compatibility testing, use a backed-up test world and change one relevant
setting/module at a time. Existing multi-GM and cross-client limits are described
in the [Hero Points](session-hero-points.md#interrupted-operations) and
[movement](token-movement-history.md#permissions-and-limits) guides.
