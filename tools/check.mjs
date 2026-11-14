import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SOURCE_FILES = [
  ".github/workflows/build-stable.yml",
  ".github/workflows/publish-stable.yml",
  ".github/workflows/validate-stable.yml",
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "assets/readme/playlist-creation.png",
  "docs/README.md",
  "docs/guides/getting-started.md",
  "docs/guides/interface-and-presentation.md",
  "docs/guides/scene-audio.md",
  "docs/guides/session-hero-points.md",
  "docs/guides/spellcasting.md",
  "docs/guides/token-movement-history.md",
  "lang/en.json",
  "module.json",
  "package.json",
  "scripts/constants.mjs",
  "scripts/features/about-face-flips.mjs",
  "scripts/features/catalog.mjs",
  "scripts/features/chat-toolbar-appearance.mjs",
  "scripts/features/day-night-playlists.mjs",
  "scripts/features/day-night-scene-ui.mjs",
  "scripts/features/gm-target-indicators.mjs",
  "scripts/features/hero-actions-adapter.mjs",
  "scripts/features/pause-banner-position.mjs",
  "scripts/features/playlist-curation-ui.mjs",
  "scripts/features/playlist-curation.mjs",
  "scripts/features/session-hero-points-reset.mjs",
  "scripts/features/session-hero-points-ui.mjs",
  "scripts/features/session-hero-points.mjs",
  "scripts/features/silent-gm-initiative.mjs",
  "scripts/features/spell-icon-preferences.mjs",
  "scripts/features/spell-information-ui.mjs",
  "scripts/features/spell-information.mjs",
  "scripts/features/spell-surfaces.mjs",
  "scripts/features/spellbook-lock.mjs",
  "scripts/features/token-movement-ui.mjs",
  "scripts/features/token-movement.mjs",
  "scripts/main.mjs",
  "scripts/settings.mjs",
  "styles/patchwork.css",
  "tests/stable-release.test.mjs",
  "tests/test_packaging.py",
  "tools/check.mjs",
  "tools/package_release.py",
  "tools/publish_release.mjs"
];

export function validateSource(root) {
  const actual = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      const path = join(directory, entry.name), name = relative(root,path).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error("Source symlink forbidden");
      if (name === ".git") continue;
      if (entry.isDirectory()) walk(path); else actual.push(name);
    }
  }
  walk(root);
  const outputs = new Set(["dist/module.json", "dist/pf2e-patchwork-qol-v" + JSON.parse(readFileSync(join(root,"module.json"))).version + ".zip",
    "dist/pf2e-patchwork-qol-v" + JSON.parse(readFileSync(join(root,"module.json"))).version + ".zip.sha256"]);
  const source = actual.filter(name=>!outputs.has(name)).sort();
  if (JSON.stringify(source)!==JSON.stringify([...SOURCE_FILES].sort())) throw new Error("Exact public source allowlist mismatch");
  const slug = text=>text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replaceAll(" ","-");
  let links = 0;
  for (const name of source.filter(p=>p.endsWith(".md"))) {
    const text=readFileSync(join(root,name),"utf8");
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const url=match[1]; if (/^https?:/.test(url)) continue;
      if (/^(?:[a-z]+:|[\\/])/i.test(url)) throw new Error("Non-repository document link");
      const [file,anchor]=url.split("#"), target=resolve(dirname(join(root,name)),decodeURIComponent(file||name.split("/").at(-1)));
      const rel=relative(root,target).split(sep).join("/");
      if (!SOURCE_FILES.includes(rel) || !existsSync(target)) throw new Error("Broken public documentation link: "+name+" → "+url);
      if (anchor && target.endsWith(".md")) {
        const headings=[...readFileSync(target,"utf8").matchAll(/^#{1,6} (.+)$/gm)].map(m=>slug(m[1]));
        if (!headings.includes(decodeURIComponent(anchor))) throw new Error("Broken documentation anchor");
      }
      links++;
    }
  }
  const language=JSON.parse(readFileSync(join(root,"lang/en.json"),"utf8"));
  function strings(value) {
    if (typeof value === "string") return;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid localization value");
    for (const child of Object.values(value)) strings(child);
  }
  strings(language);
  return {files:source.length,links};
}

export function check(root) {
  const source=validateSource(root);
  console.log(`PASS: ${source.files} source files; ${source.links} documentation links`);
  let count = 0;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["dist", "node_modules", "__pycache__", "work"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (/\.(mjs|js|cjs)$/.test(entry.name)) {
        const result = spawnSync(process.execPath, ["--check", path], { stdio: "inherit" });
        if (result.error || result.status !== 0) throw new Error(`Syntax check failed: ${path}`);
        count += 1;
      }
    }
  }
  visit(root);
  console.log(`PASS: ${count} JavaScript syntax checks`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check(fileURLToPath(new URL("../", import.meta.url)));
}
