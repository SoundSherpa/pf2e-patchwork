# Interface and Presentation

[Documentation](../README.md) · [Getting Started](getting-started.md)

Find the settings below in **Game Settings → Configure Settings → PF2e Patchwork**.
GM-controlled world features start disabled; client layout defaults preserve Foundry.

## Hide GM Target Indicators

1. As GM, enable **Hide GM Target Indicators**.
2. Target a token as GM and check its presentation from a player client.

Player indicators and native targeting functionality remain unchanged. This hides
covered GM targeting indicators visually; underlying targeting data remains
available to client code. It is not a security boundary. Custom targeting overlays
may require separate compatibility testing.

## Pause Banner Position

Choose **Default (Foundry)**, **Top**, **Center**, or **Bottom** on each client.
This moves the pause banner without changing the game's paused state. Default
restores native/provider positioning.

If another module controls the position, Patchwork can yield to it. Existing Nore
positioning compatibility is retained; choose Default in that provider if you want
Patchwork to position the banner. Additional theme combinations are not guaranteed.

## Chat Toolbar Appearance

1. Choose **Chat Toolbar Layout**: Default, Compact, or Custom.
2. For Custom, set **Chat Toolbar Icon Size (px)** from 16–28 and **Chat Toolbar
   Spacing (px)** from 0–8.
3. Save to apply your client preference. Return to Default to restore native layout.

Compact uses smaller icons and spacing. Only the native chat toolbar is styled;
message cards, editor formatting, and separate language/dice widgets retain their
behavior. Other modules' control visibility is preserved.

## About Face Animation Improvements

1. Install and activate compatible **About Face** and **libWrapper** modules.
2. As GM, enable **About Face Animation Improvements**.
3. Set **Flip Animation Duration (ms)**, 0–2000 in 25 ms steps (default 500).
   Zero gives an instant horizontal flip while native movement keeps its own timing.

Recognized repeated same-direction movement does not restart an owned flip.
About Face still owns facing choices, rotation, vertical flips, and its other modes.
The adapter checks provider queue/update contracts rather than accepting every
version merely because About Face is present. Unknown cases keep native/provider
behavior. See the [provider requirements](getting-started.md#compatibility).

## Silent GM Initiative

As GM, choose which GM-rolled initiative results are shown to players:

| Mode | Visible GM-rolled results |
| --- | --- |
| Disabled | Native Foundry/PF2e presentation. |
| Party Only | Party-alliance actors that are player-owned or in the active party. |
| Party + Friendly | The above, plus other Party-alliance actors. |
| Party + Friendly + Neutral | The above, plus actors with PF2e's neutral alliance. |

Enabled modes hide opposition and unknown-alliance results. Hazards are treated as
opposition. Native hidden/private rolls remain private. A legacy Enabled preference
maps to Party Only; Disabled remains Disabled.

Covered hidden results have their chat cards/placeholders, related notification
presentation and sounds, and Dice So Nice 3D presentation suppressed on player
clients. Player-authored rolls, unrelated dice animations, initiative values, and
Combat Tracker turn order remain native. Custom notification/dice interfaces need
separate verification; this does not remove underlying world data.

## Startup diagnostics

**Log Startup Diagnostics** is a client preference, off by default, at the end of
Patchwork settings. It logs Patchwork/Foundry/PF2e versions and feature status at
startup, without campaign records. It is not telemetry or an automatic bug report.
