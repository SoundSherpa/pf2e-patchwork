import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,readdirSync } from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
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
 const state={writes:0,published:0,assets:[],calls:[],mainChecks:0};
 const missing=()=>{throw Object.assign(Error("missing"),{status:404});};
 const github={rest:{git:{getRef:async({ref})=>{
  if(ref==="heads/main"){state.mainChecks++;return {data:{object:{type:"commit",sha:options.moveMain && state.mainChecks>1?"b".repeat(40):context.sha}}};}
  return options.existingTag||state.published?{data:{object:{type:"commit",sha:context.sha}}}:missing();
 }},repos:{
  get:async()=>({data:{id:options.wrongId?REPOSITORY_ID+1:REPOSITORY_ID,owner:{id:OWNER_ID},full_name:"SoundSherpa/pf2e-patchwork",private:!!options.privateRepo,default_branch:"main",fork:false,is_template:false,mirror_url:null}}),
  getReleaseByTag:async()=>state.published?{data:{...state.draft,draft:false,html_url:"https://github.com/SoundSherpa/pf2e-patchwork/releases/tag/v"+VERSION}}:options.existingRelease?{data:{id:99}}:missing(),
  listReleases:async()=>({data:options.existingDraft?[{id:99,tag_name:"v"+VERSION,draft:true}]:[]}),
  createRelease:async data=>{state.writes++;state.calls.push("draft");state.draft={...data,id:1};return {data:state.draft};},
  uploadReleaseAsset:async data=>{state.writes++;state.calls.push("upload");if(options.uploadFailure)throw Error("upload failed");
   const asset={id:state.assets.length+10,name:data.name,state:"uploaded",size:data.data.length,digest:options.noDigest?undefined:`sha256:${sha256(data.data)}`,bytes:data.data};state.assets.push(asset);return {data:asset};},
  listReleaseAssets:async()=>({data:options.extraAsset?[...state.assets,{id:99,name:"unexpected"}]:state.assets}),
  getReleaseAsset:async({asset_id})=>{state.calls.push("read-back");const data=state.assets.find(a=>a.id===asset_id).bytes;return {data:options.metadataDownload?{}:options.corruptReadBack?Buffer.from("wrong"):data};},
  getRelease:async()=>({data:{...state.draft,body:options.changedDraft?"changed":state.draft.body}}),
  updateRelease:async()=>{state.writes++;state.calls.push("publish");state.published++;return {data:{}};}
 }},paginate:async(fn,args)=>(await fn(args)).data};
 return {root,github,context,state,options};
}

test("public source exactly matches the 47-file allowlist and documentation links",()=>{
 const result=validateSource(new URL("../",import.meta.url).pathname);assert.equal(result.files,47);assert.ok(result.links>50);
 assert.equal(SOURCE_FILES.length,new Set(SOURCE_FILES).size);
});
for(const scenario of ["unexpected-file","symlink"])test(`source validation rejects ${scenario}`,t=>{
 const root=mkdtempSync(join(tmpdir(),"patchwork-source-test-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const name of SOURCE_FILES){mkdirSync(join(root,name,".."),{recursive:true});cpSync(new URL(name,source),join(root,name));}
 if(scenario==="unexpected-file")writeFileSync(join(root,"extra.txt"),"extra");
 else { /* An explicitly rejected symbolic source is not copied implicitly. */
  const p=join(root,"README.md");rmSync(p);return import("node:fs").then(({symlinkSync})=>{symlinkSync(join(root,"LICENSE"),p);assert.throws(()=>validateSource(root),/symlink/);});
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
for(const option of ["uploadFailure","corruptReadBack","metadataDownload","changedDraft","moveMain","extraAsset"])test(`uncertain ${option} leaves draft unpublished without retries`,async t=>{
 const f=fixture(t,{[option]:true});await assert.rejects(()=>publishRelease(f));assert.equal(f.state.published,0);assert.equal(f.state.draft.draft,true);
 if(option==="uploadFailure")assert.equal(f.state.calls.filter(c=>c==="upload").length,1);
});
for(const noDigest of [false,true])test(`draft publishes only after byte read-back (provider digest ${!noDigest})`,async t=>{
 const f=fixture(t,{noDigest});const result=await publishRelease(f);assert.equal(result.commit,f.context.sha);assert.equal(f.state.published,1);
 const n=f.state.calls.indexOf("publish");assert.equal(f.state.calls.slice(0,n).filter(c=>c==="read-back").length,3);
 assert.equal(f.state.calls.filter(c=>c==="read-back").length,6);
 await assert.rejects(()=>publishRelease(f),/already exists/);assert.equal(f.state.published,1);
});

test("changed local artifact fails before remote writes",async t=>{
 const f=fixture(t);writeFileSync(join(f.root,"dist/release/module.json"),"{}");await assert.rejects(()=>publishRelease(f),/differs/);assert.equal(f.state.writes,0);
});

test("public workflows separate validation/build from manual protected publication",()=>{
 const validation=readFileSync(new URL(".github/workflows/validate-stable.yml",source),"utf8");
 const publication=readFileSync(new URL(".github/workflows/publish-stable.yml",source),"utf8");
 assert.match(validation,/contents: read/);assert.doesNotMatch(validation,/contents: write|publishRelease\(/);
 assert.match(publication,/workflow_dispatch:/);assert.doesNotMatch(publication,/^  (push|pull_request|schedule|repository_dispatch):/m);
 for(const key of ["approved_commit","approved_version","approved_notes_sha256","publish_release"])assert.match(publication,new RegExp(key+":"));
 assert.match(publication,/environment: stable-release/);assert.match(publication,/artifact-ids:/);assert.match(publication,/validate_archive/);
 assert.match(publication,/cancel-in-progress: false/);assert.match(publication,/contents: write/);
 assert.match(publication,/uses: \.\/\.github\/workflows\/build-stable\.yml/);
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
