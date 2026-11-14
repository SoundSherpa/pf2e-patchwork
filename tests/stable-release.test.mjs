import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,readdirSync,symlinkSync } from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {releaseNotes,releasePlan,validateApproval,publishRelease,sha256,REPOSITORY_ID,OWNER_ID} from "../tools/publish_release.mjs";
import {validateSource,SOURCE_FILES} from "../tools/check.mjs";
import {MODULE_ID,VERSION} from "../scripts/constants.mjs";
const source=new URL("../",import.meta.url);
function fixture(t,options={}) {
 const root=mkdtempSync(join(tmpdir(),"patchwork-stable-test-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,"dist/release"),{recursive:true});
 const manifest=readFileSync(new URL("module.json",source));
 writeFileSync(join(root,"module.json"),manifest);writeFileSync(join(root,"CHANGELOG.md"),readFileSync(new URL("CHANGELOG.md",source)));
 const notes=releaseNotes(root,VERSION),installer=`${MODULE_ID}-v${VERSION}.zip`,zip=Buffer.from("packaging-job-validated-bytes");
 for(const [name,data] of [[installer,zip],[installer+".sha256",`${sha256(zip)}  ${installer}\n`],["module.json",manifest]])writeFileSync(join(root,"dist/release",name),data);
 const context={actor:"SoundSherpa",repo:{owner:"SoundSherpa",repo:"pf2e-patchwork"},eventName:"workflow_dispatch",ref:"refs/heads/main",sha:"a".repeat(40),
  payload:{sender:{id:OWNER_ID},repository:{id:REPOSITORY_ID},inputs:{publish_release:"true",approved_commit:"a".repeat(40),approved_version:VERSION,approved_notes_sha256:sha256(notes)}}};
 const state={writes:0,published:0,assets:[],calls:[],mainChecks:0,
  tag:options.existingTag?{type:"commit",sha:options.conflictingTag?"b".repeat(40):context.sha}:undefined};
 const missing=()=>{throw Object.assign(Error("missing"),{status:404});};
 const github={rest:{git:{getRef:async({ref})=>{
  if(ref==="heads/main"){state.mainChecks++;return {data:{object:{type:"commit",sha:options.moveMain && state.mainChecks>1?"b".repeat(40):context.sha}}};}
  state.calls.push("verify-tag");
  if(options.tagReadFailure && state.tag)throw Error("tag read uncertain");
  return state.tag?{data:{object:state.tag}}:missing();
 },createRef:async data=>{
  state.writes++;state.calls.push("create-tag");
  assert.equal(data.ref,`refs/tags/v${VERSION}`);assert.equal(data.sha,context.sha);
  if(options.competingTag)state.tag={type:"commit",sha:options.competingSameSHA?context.sha:"b".repeat(40)};
  if(state.tag)throw Object.assign(Error("Reference already exists"),{status:422});
  state.tag={type:options.annotatedTag?"tag":"commit",sha:options.wrongCreatedTag?"b".repeat(40):data.sha};
  if(options.tagCreateFailure)throw Error("tag creation uncertain");
  return {data:{object:state.tag}};
 }},repos:{
  get:async()=>({data:{id:options.wrongId?REPOSITORY_ID+1:REPOSITORY_ID,owner:{id:OWNER_ID},full_name:"SoundSherpa/pf2e-patchwork",private:!!options.privateRepo,default_branch:"main",fork:false,is_template:false,mirror_url:null}}),
  getReleaseByTag:async()=>state.published?{data:{...state.draft,draft:false,html_url:"https://github.com/SoundSherpa/pf2e-patchwork/releases/tag/v"+VERSION}}:options.existingRelease?{data:{id:99}}:missing(),
  listReleases:async()=>({data:options.existingDraft?[{id:99,tag_name:"v"+VERSION,draft:true}]:[]}),
  createRelease:async data=>{state.writes++;state.calls.push("draft");
   // Reproduce GitHub ignoring target_commitish when a competing tag exists.
   if(options.competingTag && !state.tag)state.tag={type:"commit",sha:options.competingSameSHA?context.sha:"b".repeat(40)};
   state.draft={...data,id:1};if(options.draftCreateFailure)throw Error("draft creation uncertain");return {data:state.draft};},
  uploadReleaseAsset:async data=>{state.writes++;state.calls.push("upload");if(options.uploadFailure)throw Error("upload failed");
   const asset={id:state.assets.length+10,name:data.name,state:"uploaded",size:data.data.length,digest:options.noDigest?undefined:`sha256:${sha256(data.data)}`,bytes:data.data};state.assets.push(asset);return {data:asset};},
  listReleaseAssets:async()=>({data:options.extraAsset?[...state.assets,{id:99,name:"unexpected"}]:state.assets}),
  getReleaseAsset:async({asset_id})=>{state.calls.push("read-back");const data=state.assets.find(a=>a.id===asset_id).bytes;return {data:options.metadataDownload?{}:options.corruptReadBack?Buffer.from("wrong"):data};},
  getRelease:async()=>{
   if(options.changedTag)state.tag={type:"commit",sha:"b".repeat(40)};
   if(options.deletedTag)state.tag=undefined;
   return {data:{...state.draft,body:options.changedDraft?"changed":state.draft.body}};
  },
  updateRelease:async()=>{state.writes++;state.calls.push("publish");state.published++;
   if(options.publishFailure)throw Error("publication response uncertain");return {data:{}};}
 }},paginate:async(fn,args)=>(await fn(args)).data};
 return {root,github,context,state,options,triggeringActor:"SoundSherpa"};
}

test("public source exactly matches the 47-file allowlist and documentation links",()=>{
 const result=validateSource(fileURLToPath(source));assert.equal(result.files,47);assert.ok(result.links>50);
 assert.equal(SOURCE_FILES.length,new Set(SOURCE_FILES).size);
});
for(const scenario of ["unexpected-file","symlink","encoded-path"])test(`source validation handles ${scenario}`,t=>{
 const temporary=mkdtempSync(join(tmpdir(),"patchwork-source-test-"));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
 const root=join(temporary,"source with spaces # é");mkdirSync(root);
 for(const name of SOURCE_FILES){mkdirSync(dirname(join(root,name)),{recursive:true});cpSync(new URL(name,source),join(root,name));}
 if(scenario==="unexpected-file")writeFileSync(join(root,"extra.txt"),"extra");
 else if(scenario==="symlink") {
  // Windows junctions exercise the real linked-directory rejection without
  // requiring Developer Mode or the file-symlink privilege.
  const target=join(temporary,"external-docs");cpSync(join(root,"docs"),target,{recursive:true});
  rmSync(join(root,"docs"),{recursive:true});symlinkSync(target,join(root,"docs"),process.platform==="win32"?"junction":"dir");
  assert.throws(()=>validateSource(root),/symlink/);return;
 } else {
  assert.equal(validateSource(fileURLToPath(pathToFileURL(root))).files,47);return;
 }
 assert.throws(()=>validateSource(root),/allowlist/);
});

test("synchronized stable metadata, original screenshot, MIT and public AI disclosure",()=>{
 const m=JSON.parse(readFileSync(new URL("module.json",source)));const p=JSON.parse(readFileSync(new URL("package.json",source)));
 assert.equal(m.id,MODULE_ID);assert.equal(m.version,VERSION);assert.equal(p.version,VERSION);assert.equal(VERSION,"1.0.0");
 assert.equal(p.license,"MIT");assert.equal(m.license,"LICENSE");assert.match(readFileSync(new URL("LICENSE",source),"utf8"),/Copyright \(c\) 2026 SoundSherpa/);
 assert.equal(sha256(readFileSync(new URL("assets/readme/playlist-creation.png",source))),"3358ccbff446eb8affcbdf2b95eeb3b1e6627cc2fe243d1ec3ace0e4a14a3c0b");
 assert.match(readFileSync(new URL("README.md",source),"utf8"),/AI-Assisted Development/);
});

test("release plan requires exact public SHA, version, notes and manual main approval",t=>{
 const f=fixture(t);assert.equal(releasePlan(f).version,VERSION);
 for(const change of [{actor:"other"},{eventName:"push"},{ref:"refs/heads/other"},{sha:"b".repeat(40)},
  {repo:{owner:"other",repo:"pf2e-patchwork"}},{payload:{repository:{id:REPOSITORY_ID+1},inputs:f.context.payload.inputs}}])
  assert.throws(()=>releasePlan({...f,context:{...f.context,...change}}));
 for(const change of [{publish_release:"false"},{approved_version:"9.0.0"},{approved_commit:"a".repeat(39)},
  {approved_notes_sha256:"f".repeat(64)},{approved_notes_sha256:undefined}])
  assert.throws(()=>releasePlan({...f,context:{...f.context,payload:{...f.context.payload,inputs:{...f.context.payload.inputs,...change}}}}));
 assert.equal(f.state.writes,0);
});

test("changed release notes invalidate approval before network writes",async t=>{
 const f=fixture(t);writeFileSync(join(f.root,"CHANGELOG.md"),`# Changelog\n\n## v${VERSION}\n\nChanged notes.\n`);
 await assert.rejects(()=>publishRelease(f),/notes approval/);assert.equal(f.state.writes,0);
});
for(const option of ["wrongId","privateRepo","existingTag","existingRelease","existingDraft"])test(`publication rejects ${option} without writes`,async t=>{
 const f=fixture(t,{[option]:true});await assert.rejects(()=>publishRelease(f));assert.equal(f.state.writes,0);
});
for(const option of ["uploadFailure","corruptReadBack","metadataDownload","changedDraft","moveMain","extraAsset","changedTag","deletedTag"])test(`uncertain ${option} leaves draft unpublished without retries`,async t=>{
 const f=fixture(t,{[option]:true});await assert.rejects(()=>publishRelease(f));assert.equal(f.state.published,0);assert.equal(f.state.draft.draft,true);
 if(option==="uploadFailure")assert.equal(f.state.calls.filter(c=>c==="upload").length,1);
});
for(const noDigest of [false,true])test(`draft publishes only after byte read-back (provider digest ${!noDigest})`,async t=>{
 const f=fixture(t,{noDigest});const result=await publishRelease(f);assert.equal(result.commit,f.context.sha);assert.equal(f.state.published,1);
 const n=f.state.calls.indexOf("publish");assert.equal(f.state.calls.slice(0,n).filter(c=>c==="read-back").length,3);
 assert.ok(f.state.calls.indexOf("create-tag")<f.state.calls.indexOf("draft"));
 assert.equal(f.state.calls[f.state.calls.indexOf("draft")-1],"verify-tag");
 assert.equal(f.state.calls[n-1],"verify-tag");assert.equal(f.state.tag.sha,f.context.sha);
 assert.equal(f.state.calls.filter(c=>c==="read-back").length,6);
 await assert.rejects(()=>publishRelease(f),/already exists/);assert.equal(f.state.published,1);
});

for(const competingSameSHA of [false,true])test(`competing tag at creation blocks publication (same SHA ${competingSameSHA})`,async t=>{
 const f=fixture(t,{competingTag:true,competingSameSHA});
 let failure;try {await publishRelease(f);}catch(error){failure=error;}
 assert.equal(f.state.published,0,"competing tag must be detected before publication");
 assert.match(failure?.message??"",/already exists/);assert.equal(f.state.draft,undefined);
 assert.equal(f.state.calls.filter(c=>c==="create-tag").length,1);
 assert.equal(f.state.tag.sha,competingSameSHA?f.context.sha:"b".repeat(40));
});

test("existing conflicting tag is never adopted or moved",async t=>{
 const f=fixture(t,{existingTag:true,conflictingTag:true});await assert.rejects(()=>publishRelease(f),/Tag already exists/);
 assert.equal(f.state.writes,0);assert.equal(f.state.tag.sha,"b".repeat(40));
});

for(const option of ["tagCreateFailure","tagReadFailure","wrongCreatedTag","annotatedTag","draftCreateFailure","publishFailure"])
 test(`uncertain ${option} stops without replay or cleanup`,async t=>{
 const f=fixture(t,{[option]:true});await assert.rejects(()=>publishRelease(f));
 for(const call of ["create-tag","draft","publish"])assert.ok(f.state.calls.filter(c=>c===call).length<=1);
 assert.ok(f.state.tag);assert.equal(f.state.published,option==="publishFailure"?1:0);
 const writes=f.state.writes;await assert.rejects(()=>publishRelease(f),option==="tagReadFailure"?/tag read uncertain/:/already exists/);
 assert.equal(f.state.writes,writes);
});

for(const triggeringActor of ["other","",undefined])test(`workflow initiator ${JSON.stringify(triggeringActor)} cannot publish`,async t=>{
 const f=fixture(t);f.triggeringActor=triggeringActor;
 // Explicit undefined exercises the runner-env path, with the env absent.
 const previous=process.env.GITHUB_TRIGGERING_ACTOR;delete process.env.GITHUB_TRIGGERING_ACTOR;
 t.after(()=>{if(previous===undefined)delete process.env.GITHUB_TRIGGERING_ACTOR;else process.env.GITHUB_TRIGGERING_ACTOR=previous;});
 await assert.rejects(()=>publishRelease(f),/Owner workflow initiator/);
 assert.equal(f.state.writes,0);assert.equal(f.state.calls.length,0);
});

test("owner rerun still requires original owner dispatch and sender ID",async t=>{
 for(const original of [{actor:"other"},{payload:{sender:{id:OWNER_ID+1}}}]) {
  const f=fixture(t);f.context={...f.context,...original,payload:{...f.context.payload,...original.payload}};
  await assert.rejects(()=>publishRelease(f),/Owner dispatch/);assert.equal(f.state.writes,0);
 }
});

test("runner initiator environment authorizes owner dispatch and rejects non-owner rerun",async t=>{
 const f=fixture(t);delete f.triggeringActor;
 const previous=process.env.GITHUB_TRIGGERING_ACTOR;
 t.after(()=>{if(previous===undefined)delete process.env.GITHUB_TRIGGERING_ACTOR;else process.env.GITHUB_TRIGGERING_ACTOR=previous;});
 process.env.GITHUB_TRIGGERING_ACTOR="other";
 await assert.rejects(()=>publishRelease(f),/Owner workflow initiator/);assert.equal(f.state.writes,0);
 process.env.GITHUB_TRIGGERING_ACTOR="SoundSherpa";
 assert.equal((await publishRelease(f)).commit,f.context.sha);assert.equal(f.state.published,1);
});

test("changed local artifact fails before remote writes",async t=>{
 const f=fixture(t);writeFileSync(join(f.root,"dist/release/module.json"),"{}");await assert.rejects(()=>publishRelease(f),/differs/);assert.equal(f.state.writes,0);
});

test("public workflows separate validation/build from manual protected publication",()=>{
 const validation=readFileSync(new URL(".github/workflows/validate-stable.yml",source),"utf8");
 const publication=readFileSync(new URL(".github/workflows/publish-stable.yml",source),"utf8");
 const build=readFileSync(new URL(".github/workflows/build-stable.yml",source),"utf8");
 assert.match(validation,/contents: read/);assert.doesNotMatch(validation,/contents: write|publishRelease\(/);
 assert.match(publication,/workflow_dispatch:/);assert.doesNotMatch(publication,/^  (push|pull_request|schedule|repository_dispatch):/m);
 for(const key of ["approved_commit","approved_version","approved_notes_sha256","publish_release"])assert.match(publication,new RegExp(key+":"));
 assert.match(publication,/environment: stable-release/);assert.match(publication,/artifact-ids:/);assert.match(publication,/validate_archive/);
 assert.match(publication,/cancel-in-progress: false/);assert.match(publication,/contents: write/);
 assert.match(publication,/uses: \.\/\.github\/workflows\/build-stable\.yml/);
 // Routine validation cannot reach an upload through a reusable build job.
 assert.doesNotMatch(validation,/upload-artifact|uses:.*\.github\/workflows\//);
 for(const trigger of ["push","pull_request"])assert.match(validation,new RegExp(`^  ${trigger}:`,"m"));
 assert.match(validation,/node --test/);assert.match(validation,/unittest discover/);
 assert.match(build,/workflow_call:/);assert.match(build,/workflow_dispatch:/);
 assert.doesNotMatch(build,/^  (push|pull_request|schedule|repository_dispatch):/m);
 assert.match(build,/if: github.event_name == 'workflow_dispatch' && github.repository_id == '1457423459'/);
 assert.match(build,/if: github.event_name == 'workflow_dispatch'\n\s+uses: actions\/upload-artifact/);
 assert.match(build,/sha256sum --check/);assert.match(build,/unzip -t/);
 assert.doesNotMatch(build,/contents: write|publishRelease\(|git tag|createRelease/);
 const guards=[...publication.matchAll(/^    if: (.+)$/gm)];assert.equal(guards.length,3);
 for(const [,guard] of guards)for(const condition of ["github.event_name == 'workflow_dispatch'","github.actor == 'SoundSherpa'",
  "github.triggering_actor == 'SoundSherpa'","github.repository_id == '1457423459'","github.ref == 'refs/heads/main'","inputs.publish_release"])
  assert.ok(guard.includes(condition),condition);
 assert.equal([...publication.matchAll(/retries: 0/g)].length,2);
 for(const workflow of [validation,publication,readFileSync(new URL(".github/workflows/build-stable.yml",source),"utf8")])for(const use of workflow.matchAll(/uses: ([^\n]+)/g))assert.match(use[1],/^(?:actions\/[\w-]+@[a-f0-9]{40}|\.\/\.github\/workflows\/build-stable\.yml)$/);
});

const root = new URL("../", import.meta.url);
const language = JSON.parse(readFileSync(new URL("lang/en.json", root), "utf8"));
const lookup = key => key.split(".").reduce((value, part) => value?.[part], language);
const sources = readdirSync(new URL("scripts/", root), { recursive: true })
  .filter(path => path.endsWith(".mjs"))
  .map(path => [path, readFileSync(new URL(`scripts/${path}`, root), "utf8")]);

test("literal localization references and feature helper keys resolve to English strings", () => {
  for (const [path, source] of sources) {
    for (const match of source.matchAll(/["'`](PATCHWORK\.[\w.-]+)["'`]/g))
      assert.equal(typeof lookup(match[1]), "string", `${path}: ${match[1]}`);
    const prefix = /localize\(`(PATCHWORK\.[\w.]+)\$\{key\}`\)/.exec(source)?.[1];
    if (!prefix) continue;
    for (const match of source.matchAll(/(?<![\w.])(?:loc|localize|format)\(\s*["']([\w.-]+)["']/g))
      assert.equal(typeof lookup(prefix + match[1]), "string", `${path}: ${prefix + match[1]}`);
  }
});

test("formatted status and safety messages retain their argument contracts", () => {
  const contracts = {
    "PATCHWORK.Curation.Count": ["selected", "total"],
    "PATCHWORK.Curation.Result": ["copied", "skipped"],
    "PATCHWORK.Curation.Partial": ["copied", "skipped", "failed"],
    "PATCHWORK.HeroPoints.Result": ["updated", "unchanged", "failed", "excluded"],
    "PATCHWORK.HeroPoints.DeckResult": ["completed", "empty", "other"],
    "PATCHWORK.HeroPoints.DiscardObservation": ["before", "after", "removed"]
  };
  for (const [key, expected] of Object.entries(contracts))
    assert.deepEqual([...lookup(key).matchAll(/\{(\w+)\}/g)].map(match => match[1]), expected, key);
});

test("dead top-level Hero translations do not remove active stale-error or recovery messages", () => {
  for (const key of ["Ready", "AuthorityHint", "ReviewHint", "SaveFirst", "Stale", "RecoveryTitle"])
    assert.equal(lookup(`PATCHWORK.HeroPoints.${key}`), undefined);
  for (const key of ["Errors.stale", "ConfigConflict", "Recover", "RecoveryHint", "Recovered", "PreviousWarning"])
    assert.equal(typeof lookup(`PATCHWORK.HeroPoints.${key}`), "string");
});
