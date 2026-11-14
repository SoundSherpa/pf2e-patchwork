# PF2e Patchwork

A modular collection of lightweight quality-of-life improvements for Pathfinder 2e
on Foundry VTT. Patchwork focuses on convenience, interface customization, and
reducing repetitive manual tasks. Choose the features that suit your table.

[Features](#features) · [Requirements](#requirements-and-compatibility) ·
[Installation](#installation) · [Configuration](#configuration) ·
[Documentation](#documentation) · [Support](#support-and-issues) ·
[AI Use](#ai-assisted-development) · [License](#license)

## Features

| Feature | What it does |
| --- | --- |
| [Hide GM Target Indicators](docs/guides/interface-and-presentation.md#hide-gm-target-indicators) | Hides the GM's targeting indicators from players while preserving native targeting and player indicators. This is visual suppression, not removal of targeting data. |
| [Automatic Day/Night Playlists](docs/guides/scene-audio.md#automatic-daynight-playlists) | Switches scene-assigned daytime and nighttime music when darkness crosses a configured threshold. Uses native playlist and track fades. |
| [Save Playing Tracks](docs/guides/scene-audio.md#save-playing-tracks) | Copies selected playing playlist tracks into a new or existing playlist without interrupting playback. |
| [Pause Banner Position](docs/guides/interface-and-presentation.md#pause-banner-position) | Lets each client choose Default, Top, Center, or Bottom positioning. |
| [Chat Toolbar Appearance](docs/guides/interface-and-presentation.md#chat-toolbar-appearance) | Offers Default, Compact, or Custom chat toolbar layout, icon size, and spacing. |
| [About Face Animation Improvements](docs/guides/interface-and-presentation.md#about-face-animation-improvements) | Improves supported horizontal token flips when About Face and libWrapper are installed. |
| [Silent GM Initiative](docs/guides/interface-and-presentation.md#silent-gm-initiative) | Controls covered GM-rolled initiative chat cards, Dice So Nice presentation, and related notifications without changing initiative values or turn order. |
| [Spellcasting Information Icons](docs/guides/spellcasting.md#spellcasting-information-icons) | Adds spell indicators on supported interfaces, with an independent preference for each character on each client. |
| [Spellcasting Lock](docs/guides/spellcasting.md#spellcasting-lock) | Protects supported manual spell editing, deletion, and unpreparation controls while preserving normal casting and automation. |
| [Session Hero Point Resets](docs/guides/session-hero-points.md) | Gives included party characters their configured starting points after explicit GM confirmation, with optional Hero Action card discarding. |
| [Token Movement History](docs/guides/token-movement-history.md) | Adds left-side combat Token HUD controls to reset recorded distance or immediately undo the entire recorded movement. |

## Requirements and Compatibility

- **Required:** Foundry VTT generation 14 and the Pathfinder 2e system. No other module
  is required for Patchwork's core features.
- **Optional:** About Face with libWrapper for flip improvements; Dice So Nice for
  covered 3D initiative presentation; Unified Spellbook and PF2e HUD for supported
  spell displays; PF2e Toolbelt for Hero Action discarding.
- Integrations use specific provider APIs and interface structures. Spell interface
  coverage is partial. Hero Action discarding currently requires the inspected
  PF2e Toolbelt **3.61.3** API contract and enabled Hero Actions. Unknown or missing
  providers leave unrelated features available.

See [Getting Started](docs/guides/getting-started.md#compatibility) and the feature
guides for provider requirements and limitations. Wall-aware pathfinding is not
part of Patchwork; the maintainer uses Wayfinder separately.

## Installation

Install from an official GitHub Release using Foundry's **Add-on Modules → Install
Module → Manifest URL** field:

```text
https://github.com/SoundSherpa/pf2e-patchwork/releases/latest/download/module.json
```

Enable **PF2e Patchwork** through **Manage Modules** in a PF2e world. If it is
available in Foundry's package browser, you can also search for **PF2e Patchwork**.
See [Getting Started](docs/guides/getting-started.md#installation) for manual ZIP
installation and updates. GitHub source archives are not Foundry module installers.

## Configuration

Open **Game Settings → Configure Settings → PF2e Patchwork**. A GM controls world
features and access policies; client settings apply to the current browser/client.
Enable the features you want to use; opt-in world features start disabled.

- **Session Hero Points — Configure…** opens saved character settings. The Party
  Sheet button runs a separate, confirmed reset.
- Configure day/night music under **Scene Configuration → Miscellaneous → Audio**.
- Use the paired **Spellcasting Locked/Unlocked** and **Spellcasting Icons
  Enabled/Disabled** buttons on supported character/preparation interfaces.
- Find **Movement History** in the **left column of a token's right-click HUD**
  during a started encounter in which that token participates.

## Documentation

Start with the [documentation index](docs/README.md), or go directly to a guide:

- [Getting Started](docs/guides/getting-started.md)
- [Interface and Presentation](docs/guides/interface-and-presentation.md)
- [Scene Audio](docs/guides/scene-audio.md)
- [Spellcasting](docs/guides/spellcasting.md)
- [Session Hero Points](docs/guides/session-hero-points.md)
- [Token Movement History](docs/guides/token-movement-history.md)

See the [changelog](CHANGELOG.md) for release notes.

## Support and Issues

Report bugs through [GitHub Issues](https://github.com/SoundSherpa/pf2e-patchwork/issues). Include:

- Foundry, PF2e, and Patchwork versions, plus relevant optional-module versions.
- What you expected, what happened, and clear steps to reproduce it.
- Whether it happens as GM or player, and the affected sheet/interface and settings.
- Relevant errors or a screenshot with private information removed.

Do not post full world exports, credentials, private chat, player names, token
positions, media paths, or card contents. For interrupted resets or uncertain
writes, inspect the result before trying again; Patchwork does not retry them
automatically. See [troubleshooting](docs/guides/getting-started.md#troubleshooting).

## AI-Assisted Development

PF2e Patchwork is developed with assistance from AI tools, including ChatGPT and
OpenAI Codex. These tools help with development planning, code implementation,
debugging, and automated testing.

The project's features, priorities, and design decisions are directed by the
maintainer. Changes are tested and evaluated before release, and responsibility
for the functionality, quality, and ongoing maintenance of Patchwork remains with
the maintainer.

AI assistance is part of the development process, not a substitute for testing,
review, or accountability. See the official [Foundry AI Content Policy](https://foundryvtt.com/article/ai-policy/).

Patchwork does not use generative AI during gameplay or transmit campaign data to
AI services. AI assistance is used for development, not runtime gameplay. This
statement covers Patchwork's own audited runtime code, not ordinary Foundry
networking or the independent behavior of other installed modules.

## License

PF2e Patchwork is licensed under the [MIT License](LICENSE).
