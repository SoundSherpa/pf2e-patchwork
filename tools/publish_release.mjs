import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULE_ID } from "../scripts/constants.mjs";

export const REPOSITORY_ID = 1457423459;
export const OWNER_ID = 72993376;
const BASE = "https://github.com/SoundSherpa/pf2e-patchwork";
const require = (value, message) => { if (!value) throw new Error(message); };
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function releaseNotes(root, version) {
  const text = readFileSync(join(root,"CHANGELOG.md"),"utf8");
  const section = text.split(/(?=^## )/m).find(s=>s.startsWith(`## v${version}\n`));
  require(section, "Versioned release notes required");
  return section.trim()+"\n";
}

export function validateApproval(context, version, notes) {
  const inputs = context.payload?.inputs ?? {};
  require(context.repo?.owner === "SoundSherpa" && context.repo?.repo === "pf2e-patchwork"
    && String(context.payload?.repository?.id) === String(REPOSITORY_ID), "Wrong repository identity");
  require(context.actor === "SoundSherpa" && context.payload?.sender?.id === OWNER_ID, "Owner dispatch required");
  require(context.eventName === "workflow_dispatch" && context.ref === "refs/heads/main", "Manual main dispatch required");
  require(inputs.publish_release === true || inputs.publish_release === "true", "Explicit publication approval required");
  require(/^[a-f0-9]{40}$/.test(inputs.approved_commit ?? "") && inputs.approved_commit === context.sha,
    "Exact approved public source SHA required");
  require(/^\d+\.\d+\.\d+$/.test(version) && inputs.approved_version === version, "Exact approved stable version required");
  require(/^[a-f0-9]{64}$/.test(inputs.approved_notes_sha256 ?? "") && inputs.approved_notes_sha256 === sha256(notes),
    "Exact release notes approval hash required");
}

export function releasePlan({context, root=process.cwd()}) {
  const source=readFileSync(join(root,"module.json"));
  const manifest=JSON.parse(source);
  const notes=releaseNotes(root,manifest.version);
  validateApproval(context,manifest.version,notes);
  require(manifest.id === MODULE_ID && manifest.license === "LICENSE", "Manifest identity/license mismatch");
  const installer=`${MODULE_ID}-v${manifest.version}.zip`;
  require(manifest.url === BASE && manifest.manifest === `${BASE}/releases/latest/download/module.json`
    && manifest.download === `${BASE}/releases/download/v${manifest.version}/${installer}`, "Release URL mismatch");
  return {source,manifest,notes,installer,version:manifest.version,tag:`v${manifest.version}`};
}

export async function validateRemote({github,context}) {
  const {data:repo}=await github.rest.repos.get(context.repo);
  require(repo.id === REPOSITORY_ID && repo.owner?.id === OWNER_ID && repo.full_name === "SoundSherpa/pf2e-patchwork"
    && repo.default_branch === "main" && repo.fork === false && repo.is_template === false && !repo.mirror_url,
    "Remote stable repository identity mismatch");
  require(repo.private === false, "Public visibility must be approved and established before official publication");
  const {data:ref}=await github.rest.git.getRef({...context.repo,ref:"heads/main"});
  require(ref.object.type === "commit" && ref.object.sha === context.sha, "Approved main source changed");
}

async function absent(request,message) {
  try { await request(); } catch(error) { if (error.status === 404) return; throw error; }
  throw new Error(message);
}

function binary(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  throw new Error("Asset download did not return binary bytes");
}

export async function publishRelease({github,context,root=process.cwd()}) {
  const plan=releasePlan({context,root});
  const directory=join(root,"dist","release");
  const zip=readFileSync(join(directory,plan.installer));
  const checksum=readFileSync(join(directory,plan.installer+".sha256"));
  const manifest=readFileSync(join(directory,"module.json"));
  require(manifest.equals(plan.source), "Artifact manifest differs from approved source");
  require(checksum.toString("utf8") === `${sha256(zip)}  ${plan.installer}\n`, "Installer checksum mismatch");
  await validateRemote({github,context});
  const repo=context.repo;
  await absent(()=>github.rest.git.getRef({...repo,ref:`tags/${plan.tag}`}),"Tag already exists");
  await absent(()=>github.rest.repos.getReleaseByTag({...repo,tag:plan.tag}),"Release already exists");
  const releases=await github.paginate(github.rest.repos.listReleases,{...repo,per_page:100});
  require(!releases.some(r=>r.tag_name === plan.tag), "Existing release or draft must not be overwritten");
  const body=`${plan.notes.trim()}\n\nSource commit: ${context.sha}\n`;
  const {data:draft}=await github.rest.repos.createRelease({...repo,tag_name:plan.tag,target_commitish:context.sha,
    name:`PF2e Patchwork ${plan.tag}`,body,draft:true,prerelease:false,make_latest:"false"});
  require(draft.draft === true && draft.target_commitish === context.sha, "Draft metadata mismatch");
  const assets=[{name:plan.installer,data:zip,type:"application/zip"},
    {name:plan.installer+".sha256",data:checksum,type:"text/plain"},
    {name:"module.json",data:manifest,type:"application/json"}];
  // A failed or uncertain write leaves the draft for inspection. Never auto-retry,
  // overwrite, delete, or replay an upload/publication request.
  for (const asset of assets) {
    const {data:uploaded}=await github.rest.repos.uploadReleaseAsset({...repo,release_id:draft.id,
      name:asset.name,data:asset.data,headers:{"content-type":asset.type}});
    require(uploaded.state === "uploaded" && uploaded.size === asset.data.length, "Incomplete upload");
    asset.id=uploaded.id;
  }
  async function verifyAssets() {
    const entries=await github.paginate(github.rest.repos.listReleaseAssets,{...repo,release_id:draft.id,per_page:100});
    require(entries.length === assets.length && new Set(entries.map(a=>a.name)).size === assets.length, "Unexpected release assets");
    for (const asset of assets) {
      const remote=entries.find(a=>a.id === asset.id && a.name === asset.name);
      require(remote?.state === "uploaded" && remote.size === asset.data.length, "Missing or changed remote asset");
      if (remote.digest) require(remote.digest === `sha256:${sha256(asset.data)}`, "Remote asset digest mismatch");
      const response=await github.rest.repos.getReleaseAsset({...repo,asset_id:asset.id,
        headers:{accept:"application/octet-stream"}});
      require(sha256(binary(response.data)) === sha256(asset.data), "Remote asset read-back mismatch");
    }
  }
  await verifyAssets();
  const {data:checked}=await github.rest.repos.getRelease({...repo,release_id:draft.id});
  require(checked.draft === true && checked.tag_name === plan.tag && checked.target_commitish === context.sha
    && checked.body === body && checked.prerelease === false, "Draft changed before publication");
  await validateRemote({github,context});
  await github.rest.repos.updateRelease({...repo,release_id:draft.id,draft:false,prerelease:false,make_latest:"true"});
  const {data:tag}=await github.rest.git.getRef({...repo,ref:`tags/${plan.tag}`});
  require(tag.object.type === "commit" && tag.object.sha === context.sha, "Published tag source mismatch");
  const {data:release}=await github.rest.repos.getReleaseByTag({...repo,tag:plan.tag});
  require(release.id === draft.id && release.draft === false && release.prerelease === false
    && release.target_commitish === context.sha && release.body === body, "Published release metadata mismatch");
  await verifyAssets();
  return {url:release.html_url,commit:context.sha,tag:plan.tag,sha256:sha256(zip)};
}
