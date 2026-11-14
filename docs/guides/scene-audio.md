# Scene Audio

[Documentation](../README.md) · [Getting Started](getting-started.md)

## Automatic Day/Night Playlists

1. As GM, enable **Automatic Day/Night Playlists** in Patchwork settings.
2. Open **Scene Configuration → Miscellaneous → Audio** and find
   **Patchwork — Day/Night Playlists**.
3. Select **Enable Automatic Day/Night Playlists**, then choose **Daytime Playlist**
   and **Nighttime Playlist**, or None.
4. Set **Nighttime Darkness Threshold** (default 0.50). Night begins at or above
   that darkness value. Save the scene configuration.
5. Enter/activate the scene and test a darkness transition as GM.

Leave that scene's normal **Scene Playlist** at **None**. Do not reuse the same
playlists in native Scene Playlist assignments on this or other scenes: competing
owners can cause conflicting playback. Configuration validation detects supported
conflicts; it does not coordinate every third-party audio system.

The elected active GM manages explicitly assigned playlists using native playback
operations. Music switches on entering/activating the scene or crossing the
threshold. Manually stopped music and natural completion are respected until the
next transition; reloads are not an instruction to restart it. Players do not
perform authoritative playlist writes.

### Native fades

Patchwork uses existing playlist and track fade settings, playback modes, and
Repeat. It does **not** implement a custom crossfade or a separate fade duration.
The requested configurable 0–180-second crossfade remains deferred because safe
interruption and multiplayer synchronization have not been established.

## Save Playing Tracks

1. As GM, open the **Playlists** sidebar and choose **Save Playing Tracks…** beside
   the native playlist creation controls.
2. Select the currently playing tracks you want to copy.
3. Choose a new playlist (and name/mode) or a permitted existing destination.
4. Choose **Skip duplicate audio files** or **Allow duplicates**, then Save.

The list is a snapshot from when the dialog opens. Close and reopen to refresh it.
It covers eligible native playlist tracks, not ambient sounds or transient effects.
Skip treats matching audio references as duplicates even if track settings differ.
Allow duplicates preserves intentional multiple copies.

Copies start stopped; existing playback is not interrupted. Track metadata,
including relevant inherited channel/fade values, is preserved in copies. Existing
destination playlist settings remain unchanged. A sequential/shuffle destination
can still reach appended tracks later through its normal playback behavior.

If a save is partial or uncertain, inspect the destination before another attempt.
Closing cannot recall an already-submitted document write, and no automatic retry
is made. No external music catalog, audio-generation service, or audio files are
provided by Patchwork.

![Save Playing Tracks button highlighted beside Create Playlist and Create Folder](../../assets/readme/playlist-creation.png)

*Save Playing Tracks, highlighted at the top of the Playlists sidebar.*
