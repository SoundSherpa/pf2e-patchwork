// Implementation status is distinct from live compatibility verification.
export const FEATURES = Object.freeze([
  { id: "gm-target-indicators", scope: "world", priority: "P1", status: "implemented" },
  { id: "day-night-playlists", scope: "world", priority: "P1", status: "implemented" },
  { id: "pause-banner-position", scope: "client", priority: "P1", status: "implemented" },
  { id: "chat-toolbar-size", scope: "client", priority: "P1", status: "implemented" },
  { id: "playlist-curation", scope: "world", priority: "P1", status: "implemented" },
  { id: "about-face-flips", scope: "world", priority: "P1", status: "implemented" },
  { id: "silent-gm-initiative", scope: "world", priority: "P2", status: "implemented" },
  { id: "interactive-dice-selection", scope: "client", priority: "P2", status: "deferred" },
  { id: "spellcasting-information", scope: "client", priority: "P2", status: "partially-supported" },
  { id: "spellbook-lock", scope: "actor", priority: "P2", status: "partially-supported" },
  { id: "day-night-crossfade", scope: "scene", priority: "P2", status: "deferred" },
  { id: "session-hero-points", scope: "world", priority: "P2", status: "implemented" },
  { id: "token-movement-reset", scope: "world", priority: "P2", status: "implemented" }
].map((feature) => Object.freeze(feature)));
