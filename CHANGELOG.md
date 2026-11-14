# Changelog

## v1.0.0

Initial stable release of PF2e Patchwork for Foundry VTT v14 and Pathfinder 2e.

- Hide GM target indicators from players while preserving native targeting and player indicators.
- Automate scene-assigned day/night playlists using native fades; copy selected playing tracks without interrupting playback.
- Customize client pause-banner position and chat toolbar layout, icon size, and spacing.
- Improve supported About Face horizontal flip animations through its optional integration.
- Control covered GM initiative presentation with four alliance-visibility modes while preserving native initiative calculations and player rolls.
- Show structured spell information on supported native PF2e, Unified Spellbook, and PF2e HUD surfaces, with per-character/client icon preferences.
- Protect supported manual spell edit, delete, and unprepare controls using actor-specific spellcasting locks; preserve casting and legitimate document automation.
- Reset configured party Hero Point amounts after explicit GM preview and confirmation, with optional PF2e Toolbelt batch card discarding. Players draw replacement cards themselves.
- Reset native traveled distance or immediately undo recorded movement from the left combat Token HUD; retain authorized macro access outside combat.
- Include compact accessible controls, six user guides, the playlist screenshot, MIT licensing, and AI-assisted development disclosure.

### Scope and limitations

- Optional provider contracts and spell interface coverage are partial; unsupported interfaces are documented in the guides.
- Hero Point and movement overlap guards are not atomic cross-client locks. Inspect uncertain operations before another attempt.
- Configurable audio crossfades, interactive dice selection, and wall-aware pathfinding are not included.
