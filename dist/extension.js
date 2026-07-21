"use strict";var ht=Object.create;var ce=Object.defineProperty;var wt=Object.getOwnPropertyDescriptor;var bt=Object.getOwnPropertyNames;var St=Object.getPrototypeOf,xt=Object.prototype.hasOwnProperty;var Ct=(t,e)=>{for(var o in e)ce(t,o,{get:e[o],enumerable:!0})},He=(t,e,o,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of bt(e))!xt.call(t,i)&&i!==o&&ce(t,i,{get:()=>e[i],enumerable:!(n=wt(e,i))||n.enumerable});return t};var h=(t,e,o)=>(o=t!=null?ht(St(t)):{},He(e||!t||!t.__esModule?ce(o,"default",{value:t,enumerable:!0}):o,t)),It=t=>He(ce({},"__esModule",{value:!0}),t);var Uo={};Ct(Uo,{activate:()=>qo,deactivate:()=>jo});module.exports=It(Uo);var F=h(require("vscode"));var ze=h(require("child_process")),Ve=h(require("vscode"));var u=class extends Error{constructor(o,n,i){super(o);this.diagnostics=n;this.command=i;this.name="CliError"}};function Oe(t,e){let o=t.trim();if(!o)throw new u("srs produced no output",["Empty stdout"],e);let n;try{n=JSON.parse(o)}catch{throw new u(`srs output is not valid JSON: ${o.slice(0,200)}`,["Non-JSON stdout"],e)}if(typeof n!="object"||n===null||typeof n.ok!="boolean")throw new u("srs envelope missing 'ok' field",["Malformed envelope"],e);return n}function Le(t,e,o){let n=["--repo",t,"--format","json"];return o?.pretty&&n.push("--pretty"),o?.containerId&&n.push("--container",o.containerId),n.push(...e),n}function Fe(t,e){let o=["--format","json"];return e?.pretty&&o.push("--pretty"),o.push(...t),o}var le=class t{constructor(e){this.outputChannel=e}get binaryPath(){return Ve.workspace.getConfiguration("srs").get("cli.path","srs")}get tracing(){return Ve.workspace.getConfiguration("srs").get("trace.cli",!1)}async run(e,o,n){return this._exec(Le(e,o,n),o[0]??"unknown",n)}async runRaw(e,o){return this._exec(Fe(e,o),e[0]??"unknown",o)}async _exec(e,o,n){let i=this.binaryPath;return this.tracing&&this.outputChannel.appendLine(`[srs] ${i} ${e.join(" ")}`),new Promise((r,s)=>{let a;try{a=ze.spawn(i,e,{stdio:["pipe","pipe","pipe"]})}catch(c){s(new u(`Failed to spawn srs binary '${i}'. Check srs.cli.path in settings.`,[`Spawn error: ${String(c)}`],o));return}let l="",d="";a.stdout.on("data",c=>{l+=c.toString()}),a.stderr.on("data",c=>{d+=c.toString()}),n?.stdin&&a.stdin.write(n.stdin),a.stdin.end(),a.on("error",c=>{c.code==="ENOENT"?s(new u(`srs binary not found at '${i}'. Install srs and set srs.cli.path in settings.`,[`Binary not found: ${i}`],o)):s(new u(`srs process error: ${c.message}`,[c.message],o))}),a.on("close",()=>{this.tracing&&l&&this.outputChannel.appendLine(`[srs stdout] ${l.slice(0,2e3)}`),d&&this.outputChannel.appendLine(`[srs stderr] ${d}`);try{r(Oe(l,o))}catch(c){s(c)}})})}async runOk(e,o,n){return t._assertOk(await this.run(e,o,n),o)}async runRawOk(e,o){return t._assertOk(await this.runRaw(e,o),e)}static _assertOk(e,o){if(!e.ok)throw new u(`srs ${o.join(" ")} failed: ${e.diagnostics.join("; ")}`,e.diagnostics,o[0]??"unknown");return e.payload}};var z=h(require("vscode")),pe=class{constructor(e){this.cli=e;this._onDidChangeActive=new z.EventEmitter;this.onDidChangeActive=this._onDidChangeActive.event}get active(){return this._active}async probe(e){try{let o=await this.cli.runOk(e,["repo","map"]);return{rootPath:e,title:o.repoMap.repository.title??o.repoMap.repository.repositoryId??e,repositoryId:o.repoMap.repository.repositoryId??e,counts:o.repoMap.counts}}catch{return}}async discoverAll(){let e=z.workspace.workspaceFolders??[];return(await Promise.all(e.map(n=>this.probe(n.uri.fsPath)))).filter(n=>n!==void 0)}setActive(e){this._active=e,z.commands.executeCommand("setContext","srs.repositoryActive",e!==void 0),z.commands.executeCommand("setContext","srs.activeRepoIsArchive",e?.archivePath!==void 0),this._onDidChangeActive.fire(e)}async refresh(){if(!this._active)return;let e=await this.probe(this._active.rootPath);e&&this.setActive({...e,archivePath:this._active.archivePath})}dispose(){this._onDidChangeActive.dispose()}};var j=h(require("vscode")),ue=class extends j.TreeItem{constructor(o,n,i){super(i>0?`${n} (${i})`:n,j.TreeItemCollapsibleState.Collapsed);this.kind=o;this.contextValue="srsGroup",this.tooltip=`${n} \u2014 ${i} items`}},T=class extends j.TreeItem{constructor(o,n,i,r){super(i,j.TreeItemCollapsibleState.None);this.entityId=o;this.entityKind=n;this.getArgs=r;this.contextValue="srsEntity",this.tooltip=`${n}: ${o}`,this.description=o.slice(0,8),this.command={command:"srs.openEntityDefault",title:"Open",arguments:[this]}}},Pt={note:{listArgs:["note","list"],extractItems:t=>t.notes.map(e=>({id:e.instanceId,label:e.title})),getArgs:t=>["note","get",t]},tag:{listArgs:["tag","list"],extractItems:t=>t.tagDefinitions.map(e=>({id:e.instanceId,label:e.label??e.slug})),getArgs:t=>["tag","get",t]},record:{listArgs:["record","list"],extractItems:t=>t.records.map(e=>({id:e.instanceId,label:`${e.typeNamespace}/${e.typeName}`})),getArgs:t=>["record","get",t]},relation:{listArgs:["relation","list"],extractItems:t=>t.relations.map(e=>({id:e.relationId,label:`${e.relationType}: ${e.sourceId.slice(0,8)}\u2192${e.targetId.slice(0,8)}`})),getArgs:t=>["relation","get",t]},container:{listArgs:["container","list"],extractItems:t=>t.containers.map(e=>({id:e.containerId,label:e.title})),getArgs:t=>["container","get",t]},field:{listArgs:["field","list"],extractItems:t=>t.fields.map(e=>({id:e.id,label:`${e.namespace}/${e.name}`})),getArgs:t=>["field","get",t]},type:{listArgs:["type","list"],extractItems:t=>t.types.map(e=>({id:e.id,label:`${e.namespace}/${e.name}`})),getArgs:t=>["type","get",t]},extension:{listArgs:["extension","list"],extractItems:t=>t.extensions.map(e=>({id:e.instanceId,label:e.extensionId??e.instanceId})),getArgs:t=>["extension","get",t]},protocol:{listArgs:["protocol","list"],extractItems:t=>t.protocols.map(e=>({id:e.instanceId,label:`${e.namespace}/${e.name} v${e.version}`})),getArgs:t=>["protocol","get",t]},blueprint:{listArgs:["blueprint","list"],extractItems:t=>t.blueprints.map(e=>({id:e.blueprintId,label:`${e.namespace}/${e.name} v${e.version}`})),getArgs:t=>["blueprint","get",t]},view:{listArgs:["view","list"],extractItems:t=>t.views.map(e=>({id:e.id,label:`${e.namespace}/${e.name}`})),getArgs:t=>["view","get",t]},"document-view":{listArgs:["document-view","list"],extractItems:t=>t.documentViews.map(e=>({id:e.id,label:`${e.namespace}/${e.name}`})),getArgs:t=>["document-view","get",t]},"relation-type":{listArgs:["relation-type","list"],extractItems:t=>t.relationTypeDefinitions.map(e=>({id:e.id,label:e.label})),getArgs:t=>["relation-type","get",t]}},kt=[["note","Notes"],["record","Records"],["tag","Tags"],["container","Containers"],["relation","Relations"],["type","Types"],["field","Fields"],["extension","Extensions"],["protocol","Protocols"],["blueprint","Blueprints"],["view","Views"],["document-view","Document Views"],["relation-type","Relation Types"]],me=class{constructor(e,o,n){this.cli=e;this.repoProvider=o;this.attention=n;this._onDidChangeTreeData=new j.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._disposables=[];this._disposables.push(o.onDidChangeActive(()=>this.refresh())),n&&this._disposables.push(n.onDidChange(()=>this.refresh()))}refresh(){this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){let o=this.repoProvider.active;return o?e?e instanceof ue?this.loadGroupChildren(e.kind,o.rootPath):[]:kt.map(([n,i])=>{let r=this.countFromRepoMap(n,o.counts);return new ue(n,i,r)}):[]}countFromRepoMap(e,o){return e==="note"?o.notes:e==="record"?o.records:0}async loadGroupChildren(e,o){let n=Pt[e],i=this.attention?.active?.containerId;try{let r=await this.cli.runOk(o,n.listArgs,{containerId:i});return n.extractItems(r).map(a=>new T(a.id,e,a.label,n.getArgs(a.id)))}catch{return[]}}dispose(){this._onDidChangeTreeData.dispose(),this._disposables.forEach(e=>e.dispose())}};var Ke=h(require("vscode")),ge="srs.activeContainer",ve=class{constructor(e,o){this.workspaceState=e;this.cli=o;this._onDidChange=new Ke.EventEmitter;this.onDidChange=this._onDidChange.event}get active(){return this._active}async restore(e){let o=this.workspaceState.get(ge);if(o)try{await this.cli.runOk(e,["container","get",o.containerId]),this._active=o,this._onDidChange.fire(this._active)}catch{await this.workspaceState.update(ge,void 0)}}async set(e,o){await this.cli.runOk(o,["container","get",e.containerId]),this._active=e,await this.workspaceState.update(ge,e),this._onDidChange.fire(this._active)}async clear(){this._active=void 0,await this.workspaceState.update(ge,void 0),this._onDidChange.fire(void 0)}dispose(){this._onDidChange.dispose()}};var fe=h(require("vscode")),ye=class{constructor(e){this.attention=e;this._disposables=[];this._item=fe.window.createStatusBarItem(fe.StatusBarAlignment.Left,100),this._item.command="srs.setActiveContainer",this._item.tooltip="SRS: Click to set active container",this._disposables.push(this._item),this._disposables.push(e.onDidChange(()=>this._update())),this._update()}show(){this._item.show()}hide(){this._item.hide()}_update(){let e=this.attention.active;e?(this._item.text=`$(package) ${e.title}`,this._item.tooltip=`SRS Container: ${e.title}
Click to change`):(this._item.text="$(package) No container",this._item.tooltip="SRS: No active container. Click to set one.")}dispose(){this._disposables.forEach(e=>e.dispose())}};var X=h(require("vscode")),Rt=[{glob:"**/manifest.json",schema:"schemas/2.0/manifest.json"},{glob:"**/records/**/*.json",schema:"schemas/2.0/record.json"},{glob:"**/notes/**/*.json",schema:"schemas/2.0/note.json"},{glob:"**/typed-records/**/*.json",schema:"schemas/2.0/typed-record.json"},{glob:"**/package/fields/*.json",schema:"schemas/2.0/field.json"},{glob:"**/package/types/*.json",schema:"schemas/2.0/type.json"},{glob:"**/package/views/*.json",schema:"schemas/2.0/view.json"},{glob:"**/package/document-views/*.json",schema:"schemas/2.0/document-view.json"},{glob:"**/package/package.json",schema:"schemas/2.0/package-manifest.json"},{glob:"**/relations/relations.json",schema:"schemas/2.0/relations-collection.json"},{glob:"**/containers/*.json",schema:"schemas/2.0/container.json"},{glob:"**/*.meta.json",schema:"schemas/2.0/source-document-meta.json"}],he=class{constructor(e){this.extensionUri=e;this._disposables=[];this._register()}_register(){let e=X.workspace.getConfiguration("json"),o=e.get("schemas")??[],n=Rt.filter(i=>!o.some(r=>r.fileMatch.includes(i.glob))).map(i=>({fileMatch:[i.glob],url:X.Uri.joinPath(this.extensionUri,i.schema).toString()}));n.length!==0&&e.update("schemas",[...o,...n],X.ConfigurationTarget.Workspace)}dispose(){this._disposables.forEach(e=>e.dispose())}};var be=h(require("vscode"));var Be="srs-entity";function Se(t,e,o){return be.Uri.from({scheme:Be,authority:t,path:`/${e}/${o}`})}function $t(t){let e=t.path.replace(/^\//,"").split("/");return{repositoryId:t.authority,kind:e[0]??"",entityId:e[1]??""}}var we=class{constructor(e,o){this.cli=e;this.repoProvider=o;this._onDidChange=new be.EventEmitter;this.onDidChangeEmitter=this._onDidChange;this.onDidChange=this._onDidChange.event}async provideTextDocumentContent(e){let{kind:o,entityId:n}=$t(e),i=this.repoProvider.active;if(!i)return JSON.stringify({error:"No active SRS repository"},null,2);let r=Et(o,n);if(!r)return JSON.stringify({error:`Unknown entity kind: ${o}`},null,2);try{let s=await this.cli.runOk(i.rootPath,r,{pretty:!0});return JSON.stringify(s,null,2)}catch(s){let a=s instanceof u?s.message:String(s);return JSON.stringify({error:a},null,2)}}refresh(e){this._onDidChange.fire(e)}dispose(){this._onDidChange.dispose()}};function Et(t,e){switch(t){case"note":return["note","get",e];case"tag":return["tag","get",e];case"record":return["record","get",e];case"relation":return["relation","get",e];case"container":return["container","get",e];case"field":return["field","get",e];case"type":return["type","get",e];case"extension":return["extension","get",e];case"protocol":return["protocol","get",e];case"view":return["view","get",e];case"document-view":return["document-view","get",e];case"relation-type":return["relation-type","get",e];default:return}}var D=h(require("vscode")),xe=h(require("path")),Tt="SRS",Ce=class{constructor(e,o){this.cli=e;this.repoProvider=o;this._disposables=[];this._collection=D.languages.createDiagnosticCollection("srs"),this._disposables.push(this._collection)}async validate(){let e=this.repoProvider.active;if(!e)return;this._collection.clear();let o=await this.cli.run(e.rootPath,["repo","validate"]);if(!o.ok){let r=D.Uri.file(xe.join(e.rootPath,"manifest.json"));this._collection.set(r,[new D.Diagnostic(new D.Range(0,0,0,0),o.diagnostics.join("; "),D.DiagnosticSeverity.Error)]);return}let{diagnostics:n}=o.payload;if(n.length===0)return;let i=new Map;for(let r of n){let s=r.path?D.Uri.file(xe.join(e.rootPath,r.path)).toString():D.Uri.file(xe.join(e.rootPath,"manifest.json")).toString(),a=Dt(r.severity),l=new D.Diagnostic(new D.Range(0,0,0,0),r.message,a);l.source=Tt,i.has(s)||i.set(s,[]),i.get(s).push(l)}for(let[r,s]of i)this._collection.set(D.Uri.parse(r),s)}clear(){this._collection.clear()}dispose(){this._disposables.forEach(e=>e.dispose())}};function Dt(t){switch(t){case"error":return D.DiagnosticSeverity.Error;case"warning":return D.DiagnosticSeverity.Warning;default:return D.DiagnosticSeverity.Information}}var I=h(require("vscode"));function Je(t,e,o,n,i,r,s){t.subscriptions.push(I.commands.registerCommand("srs.selectRepository",()=>_t(e,o)),I.commands.registerCommand("srs.refreshRepository",()=>At(o,n)),I.commands.registerCommand("srs.validateRepository",()=>Nt(e,o,i,s)),I.commands.registerCommand("srs.openRepositoryMap",()=>Mt(e,o,i)),I.commands.registerCommand("srs.openEntity",a=>Ye(o,r,a)),I.commands.registerCommand("srs.openEntityDefault",a=>Ft(o,r,a)))}async function _t(t,e){let o=await I.window.withProgress({location:I.ProgressLocation.Window,title:"SRS: Scanning workspace for repositories\u2026"},()=>e.discoverAll());if(o.length===0){let r="Open Settings";await I.window.showWarningMessage("No SRS repositories found. Check that srs is installed and srs.cli.path is set correctly.",r)===r&&I.commands.executeCommand("workbench.action.openSettings","srs.cli.path");return}let n=o.map(r=>({label:r.title,description:r.rootPath,detail:`${r.counts.notes} notes \xB7 ${r.counts.records} records \xB7 ${r.counts.totalInstances} total`,repo:r})),i=await I.window.showQuickPick(n,{placeHolder:"Select an SRS repository",matchOnDescription:!0});i&&e.setActive(i.repo)}async function At(t,e){await t.refresh(),e.refresh()}async function Nt(t,e,o,n){let i=e.active;if(!i){I.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");return}o.show(!0),o.appendLine(`
\u2500\u2500 srs repo validate \u2500\u2500 ${i.rootPath}`);try{let r=await t.run(i.rootPath,["repo","validate"]);if(r.ok){let{summary:s,diagnostics:a}=r.payload;if(o.appendLine(`Checked: ${s.checked}  Errors: ${s.errors}  Warnings: ${s.warnings}`),a.length===0)o.appendLine("\u2713 No issues found.");else for(let l of a){let d=(l.severity??"info").toUpperCase().padEnd(7),c=l.path?` [${l.path}]`:"";o.appendLine(`  ${d}${c}: ${l.message}`)}}else{o.appendLine("Validation invocation failed:");for(let s of r.diagnostics)o.appendLine(`  ${s}`)}}catch(r){let s=r instanceof u?r.message:String(r);o.appendLine(`Error: ${s}`),I.window.showErrorMessage(`SRS validation error: ${s}`)}await n.validate()}async function Mt(t,e,o){let n=e.active;if(!n){I.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");return}o.show(!0),o.appendLine(`
\u2500\u2500 srs repo map \u2500\u2500 ${n.rootPath}`);try{let i=await t.run(n.rootPath,["repo","map"],{pretty:!0});o.appendLine(JSON.stringify(i,null,2))}catch(i){let r=i instanceof u?i.message:String(i);o.appendLine(`Error: ${r}`),I.window.showErrorMessage(`SRS: ${r}`)}}var Ot=new Set(["note","record","container"]),Lt=new Set(["note","tag","record"]);async function Ft(t,e,o){if(o instanceof T)return Ot.has(o.entityKind)?I.commands.executeCommand("srs.previewEntity",o):Lt.has(o.entityKind)?I.commands.executeCommand("srs.editEntity",o):Ye(t,e,o)}async function Ye(t,e,o){if(!(o instanceof T))return;let n=t.active;if(n)try{let i=Se(n.repositoryId,o.entityKind,o.entityId),r=await I.workspace.openTextDocument(i);await I.window.showTextDocument(r,{preview:!0,viewColumn:I.ViewColumn.Active,preserveFocus:!1})}catch(i){let r=i instanceof u?i.message:String(i);I.window.showErrorMessage(`SRS: Failed to open entity: ${r}`)}}var R=h(require("vscode"));var ne=h(require("vscode")),K=class t{constructor(e,o,n,i,r){this._id=o;this._panel=ne.window.createWebviewPanel("srsPreview",n,{viewColumn:ne.ViewColumn.Active,preserveFocus:!1},{enableScripts:r?.enableScripts??!1,localResourceRoots:[]}),this._update(i),r?.onMessage&&this._setMessageHandler(r.onMessage),this._panel.onDidDispose(()=>{this._messageDisposable?.dispose(),t._panels.delete(this._id)})}static{this._panels=new Map}static show(e,o,n,i,r){let s=t._panels.get(o);if(s)return s._panel.reveal(ne.ViewColumn.Active),s._panel.title=n,s._update(i),r?.onMessage&&s._setMessageHandler(r.onMessage),s;let a=new t(e,o,n,i,r);return t._panels.set(o,a),a}_setMessageHandler(e){this._messageDisposable?.dispose(),this._messageDisposable=this._panel.webview.onDidReceiveMessage(e)}_update(e){this._panel.webview.html=e}dispose(){this._panel.dispose()}},Vt=`
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
           color: var(--vscode-foreground); background: var(--vscode-editor-background);
           padding: 1.5em 2em; max-width: 900px; line-height: 1.6; }
    h1 { font-size: 1.4em; margin-bottom: 0.25em; }
    h2 { font-size: 1.15em; margin-top: 1.5em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.2em; }
    h3 { font-size: 1em; margin-top: 1em; color: var(--vscode-descriptionForeground); }
    .meta { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 1.5em; }
    .tag { display: inline-block; background: var(--vscode-badge-background);
           color: var(--vscode-badge-foreground); border-radius: 3px;
           padding: 0 6px; font-size: 0.8em; margin: 0 2px; }
    .field-row { display: flex; gap: 1em; margin: 0.4em 0; }
    .field-label { width: 160px; flex-shrink: 0; font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .field-value { flex: 1; word-break: break-word; }
    .repeatable-values { margin: 0; padding-left: 1.2em; }
    .repeatable-values li { margin: 0.1em 0; }
    .section { margin-top: 1.2em; }
    .section-name { font-size: 0.8em; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin-bottom: 0.3em; }
    .member-row { padding: 0.2em 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 0.8em; border-radius: 4px;
          overflow-x: auto; font-size: 0.9em; white-space: pre-wrap; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .relation-row { display: flex; align-items: baseline; gap: 0.6em; padding: 0.3em 0;
                    border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    .rel-arrow { color: var(--vscode-descriptionForeground); font-weight: 600; flex-shrink: 0; }
    .rel-type { color: var(--vscode-badge-foreground); background: var(--vscode-badge-background);
                border-radius: 3px; padding: 0 5px; font-size: 0.8em; flex-shrink: 0; }
    .rel-link { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
    .rel-link:hover { text-decoration: underline; }
    .field-row--text { flex-direction: column; gap: 0.3em; }
    .field-row--text .field-label { width: auto; }
    .markdown-value h3, .markdown-value h4, .markdown-value h5, .markdown-value h6
      { margin: 0.6em 0 0.2em; font-size: 1em; font-weight: 600; }
    .markdown-value p { margin: 0.4em 0; }
    .markdown-value ul, .markdown-value ol { margin: 0.3em 0; padding-left: 1.4em; }
    .markdown-value li { margin: 0.1em 0; }
    .markdown-value code { background: var(--vscode-textCodeBlock-background);
      padding: 0 3px; border-radius: 2px; font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
    .markdown-value pre { background: var(--vscode-textCodeBlock-background);
      padding: 0.6em 0.8em; border-radius: 4px; overflow-x: auto; margin: 0.4em 0; }
    .markdown-value pre code { background: none; padding: 0; }
    .markdown-value hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 0.6em 0; }
    .markdown-value strong { font-weight: 600; }
    .markdown-value em { font-style: italic; }
  </style>
`;function ie(t,e,o){return`<!DOCTYPE html><html><head><meta charset="UTF-8">${o?.enableScripts?`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`:`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`}${Vt}<title>${b(t)}</title></head><body>${e}</body></html>`}function b(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Xe(t,e,o){t.subscriptions.push(R.commands.registerCommand("srs.previewEntity",n=>Bt(t,e,o,n)),R.commands.registerCommand("srs.previewRender",n=>qt(t,e,o,n)))}async function Bt(t,e,o,n){if(!(n instanceof T))return;let i=o.active;if(i)try{switch(n.entityKind){case"note":return await Gt(t,e,i.rootPath,n.entityId);case"record":return await jt(t,e,i.rootPath,n.entityId);case"container":return await Ut(t,e,i.rootPath,n.entityId);case"protocol":return await Wt(t,e,i.rootPath,n.entityId);case"blueprint":return await Ht(t,e,i.rootPath,n.entityId);default:R.window.showInformationMessage(`SRS: No preview available for '${n.entityKind}'. Use Open Entity for raw JSON.`)}}catch(r){let s=r instanceof u?r.message:String(r);R.window.showErrorMessage(`SRS: Preview failed: ${s}`)}}async function qt(t,e,o,n){let i=o.active;if(!i){R.window.showWarningMessage("SRS: No active repository.");return}let r;try{r=(await e.runOk(i.rootPath,["document-view","list"])).documentViews}catch(c){let p=c instanceof u?c.message:String(c);R.window.showErrorMessage(`SRS: Failed to list document views: ${p}`);return}let s,a;if(n instanceof T&&n.entityKind==="document-view")s=n.entityId,a=String(n.label);else{if(r.length===0){R.window.showWarningMessage("SRS: No document views defined in this repository.");return}let c=await R.window.showQuickPick(r.map(p=>({label:`${p.namespace}/${p.name}`,description:p.id,view:p})),{placeHolder:"Select a document view to render"});if(!c)return;s=c.view.id,a=c.label}let l=r.find(c=>c.id===s)?.containerType,d;if(l){let c;try{c=(await e.runOk(i.rootPath,["container","list"])).containers.filter(v=>v.containerType===l)}catch(f){let v=f instanceof u?f.message:String(f);R.window.showErrorMessage(`SRS: Failed to list containers: ${v}`);return}if(c.length===0){R.window.showWarningMessage(`SRS: No containers of type "${l}" found.`);return}let p=await R.window.showQuickPick(c.map(f=>({label:f.title,description:f.containerId,id:f.containerId})),{placeHolder:`Select a ${l} to render`});if(!p)return;d=p.id}try{let c=["render","document-view","--view",s];d&&c.push("--container",d);let p=await e.runOk(i.rootPath,c);await Qe(p.rendered,a??s)}catch(c){let p=c instanceof u?c.message:String(c);R.window.showErrorMessage(`SRS: Render failed: ${p}`)}}async function Gt(t,e,o,n){let i=await e.runOk(o,["note","get",n]),{note:r}=i,s=(r.tags??[]).map(c=>`\`${c}\``).join(" "),a=[r.createdAt?`*${r.createdAt.slice(0,10)}*`:"",s].filter(Boolean).join("  \xB7  "),l=(r.sections??[]).map(c=>`## ${c.label??c.name}

${c.content}`).join(`

---

`),d=[`# ${r.title}`,a,l||"*No sections.*"].filter(Boolean).join(`

`);await Qe(d,r.title)}async function jt(t,e,o,n){let i=await e.runOk(o,["record","get",n]),{record:r}=i,s=new Map,a=new Set,l=new Set,d=[],[c,p,f,v]=await Promise.allSettled([e.runOk(o,["type","get",r.typeId]),e.runOk(o,["relation","list"]),e.runOk(o,["note","list"]),e.runOk(o,["record","list"])]);if(c.status==="fulfilled"){let w=c.value.type.fields;for(let E of w)E.repeatable&&a.add(E.fieldId);let x=await Promise.allSettled(w.map(E=>e.runOk(o,["field","get",E.fieldId])));for(let E=0;E<w.length;E++){let H=w[E],Y=x[E],oe=Y.status==="fulfilled"?Y.value.field.name:void 0;s.set(H.fieldId,H.displayLabel??oe??H.fieldId.slice(0,8)),Y.status==="fulfilled"&&Y.value.field.valueType==="text"&&l.add(Y.value.field.id)}}if(p.status==="fulfilled"){let w=new Map;if(f.status==="fulfilled")for(let x of f.value.notes)w.set(x.instanceId,{label:x.title,kind:"note"});if(v.status==="fulfilled")for(let x of v.value.records)w.set(x.instanceId,{label:x.typeName,kind:"record"});for(let x of p.value.relations)if(x.sourceId===n){let E=w.get(x.targetId);d.push({relationId:x.relationId,relationType:x.relationType,direction:"outgoing",peerId:x.targetId,peerLabel:E?.label??x.targetId.slice(0,8),peerKind:E?.kind??"note"})}else if(x.targetId===n){let E=w.get(x.sourceId);d.push({relationId:x.relationId,relationType:x.relationType,direction:"incoming",peerId:x.sourceId,peerLabel:E?.label??x.sourceId.slice(0,8),peerKind:E?.kind??"note"})}}let S=`${r.typeNamespace}/${r.typeName} v${r.typeVersion}`,y=r.fieldValues.map(w=>{let x=s.get(w.fieldId)??w.fieldId.slice(0,8),E=l.has(w.fieldId),H;if(a.has(w.fieldId)&&w.entries&&w.entries.length>0)H=`<ul class="repeatable-values">${w.entries.map(Me=>{let We=typeof Me.value=="string"?Me.value:JSON.stringify(Me.value);return E?`<li class="markdown-value" data-md="${b(We)}"></li>`:`<li>${b(We)}</li>`}).join("")}</ul>`;else{let oe=typeof w.value=="string"?w.value:JSON.stringify(w.value);H=E?`<div class="markdown-value" data-md="${b(oe)}"></div>`:b(oe)}return`<div class="${E?"field-row field-row--text":"field-row"}">
        <div class="field-label">${b(x)}</div>
        <div class="field-value">${H}</div>
      </div>`}).join(""),k=r.createdAt?`Created: ${b(r.createdAt.slice(0,10))}`:"",$=d.length===0?'<p class="empty">No relations.</p>':d.map(w=>{let x=w.direction==="outgoing"?"\u2192":"\u2190",E=w.direction==="outgoing"?"to":"from";return`<div class="relation-row">
          <span class="rel-arrow">${x}</span>
          <span class="rel-type">${b(w.relationType)}</span>
          <a class="rel-link" href="#" data-id="${b(w.peerId)}" data-kind="${b(w.peerKind)}" title="${b(w.peerId)}">${b(w.peerLabel)}</a>
        </div>`}).join(""),G=ie(S,`
    <h1>${b(S)}</h1>
    <div class="meta">${b(r.instanceId.slice(0,8))}\u2026 &nbsp;\xB7&nbsp; ${k}</div>
    <h2>Fields</h2>
    ${y||'<p class="empty">No field values.</p>'}
    <h2>Relations</h2>
    ${$}
    <script>
      ${zt()}
      document.querySelectorAll('.markdown-value').forEach(function(el) {
        el.innerHTML = renderMarkdown(el.dataset.md || '');
      });
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('.rel-link').forEach(function(el) {
        el.addEventListener('click', function(ev) {
          ev.preventDefault();
          vscode.postMessage({ type: 'openEntity', id: el.dataset.id, kind: el.dataset.kind });
        });
      });
    </script>
  `,{enableScripts:!0});K.show(t,`record:${n}`,S,G,{enableScripts:!0,onMessage:w=>{let x=w;x.type==="openEntity"&&x.id&&x.kind&&R.commands.executeCommand("srs.openEntityById",x.id,x.kind,o)}})}async function Ut(t,e,o,n){let r=(await e.runOk(o,["container","list"])).containers.find(c=>c.containerId===n),s=r?.title??n.slice(0,8),a=[];try{a=(await e.runOk(o,["container","members","list",n])).members}catch{}let l=a.map(c=>`<div class="member-row">${b(c.title??c.instanceId)}</div>`).join(""),d=ie(s,`
    <h1>${b(s)}</h1>
    <div class="meta">${r?.containerType?`Type: ${b(r.containerType)} &nbsp;\xB7&nbsp; `:""}${a.length} members</div>
    <h2>Members</h2>
    ${l||'<p class="empty">No members.</p>'}
  `);K.show(t,`container:${n}`,s,d)}async function Wt(t,e,o,n){let[i,r]=await Promise.allSettled([e.runOk(o,["protocol","get",n]),e.runOk(o,["protocol","stages",n])]),s=i.status==="fulfilled"?i.value.protocol:void 0,a=r.status==="fulfilled"?[...r.value.stages].sort(($,G)=>$.order-G.order):[],l=s?.namespace??"",d=s?.name??n.slice(0,8),c=s?.version??"",p=`${l}/${d} v${c}`,f=s?.description?`<p class="description">${b(s.description)}</p>`:"",v=s?.targetType?`<div class="meta">Target type: ${b(s.targetType)}</div>`:"",S=(s?.tags??[]).length>0?`<div class="meta">Tags: ${s.tags.map($=>`<code>${b($)}</code>`).join(" ")}</div>`:"",y=a.length===0?'<p class="empty">No stages defined.</p>':a.map($=>{let G=$.dependsOn.length>0?`<div class="stage-deps">depends on: ${$.dependsOn.map(w=>b(w)).join(", ")}</div>`:"";return`<div class="stage-row">
          <span class="stage-order">${$.order}</span>
          <div class="stage-body">
            <div class="stage-name">${b($.name)}</div>
            ${G}
          </div>
        </div>`}).join(""),k=ie(p,`
    <h1>${b(p)}</h1>
    <div class="meta">${b(n.slice(0,8))}\u2026</div>
    ${v}
    ${S}
    ${f}
    <h2>Stages (${a.length})</h2>
    ${y}
  `);K.show(t,`protocol:${n}`,p,k)}async function Ht(t,e,o,n){let[i,r]=await Promise.allSettled([e.runOk(o,["blueprint","get",n]),e.runOk(o,["blueprint","structure",n])]),s=i.status==="fulfilled"?i.value.blueprint:void 0,a=r.status==="fulfilled"?r.value.relationSpecs:[],l=s?.namespace??"",d=s?.name??n.slice(0,8),c=s?.version??"",p=`${l}/${d} v${c}`,f=s?.description?`<p class="description">${b(s.description)}</p>`:"",v=a.length===0?'<p class="empty">No relation specs defined.</p>':`<table class="specs-table">
        <thead><tr><th>Relation type</th><th>Source type</th><th>Target type</th><th>Cardinality</th><th>Required</th></tr></thead>
        <tbody>
          ${a.map(y=>`<tr>
            <td>${b(y.relationType)}</td>
            <td><code>${b(y.sourceTypeId.slice(0,8))}\u2026</code></td>
            <td><code>${b(y.targetTypeId.slice(0,8))}\u2026</code></td>
            <td>${y.cardinality?b(y.cardinality):"\u2014"}</td>
            <td>${y.required?"yes":"\u2014"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`,S=ie(p,`
    <h1>${b(p)}</h1>
    <div class="meta">${b(n.slice(0,8))}\u2026</div>
    ${f}
    <h2>Structure (${a.length} relation spec${a.length===1?"":"s"})</h2>
    ${v}
  `);K.show(t,`blueprint:${n}`,p,S)}async function Qe(t,e){let o=await R.workspace.openTextDocument({content:t,language:"markdown"});await R.window.showTextDocument(o,{viewColumn:R.ViewColumn.Active,preview:!0,preserveFocus:!1}),await R.commands.executeCommand("markdown.showPreview",o.uri)}function zt(){return["function renderMarkdown(md) {","  if (!md) return '';","  var h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');","  h = h.replace(/```[\\w]*\\n([\\s\\S]*?)```/g, function(_,c){ return '<pre><code>'+c+'</code></pre>'; });","  h = h.replace(/^#{6}\\s+(.+)$/mg,'<h6>$1</h6>');","  h = h.replace(/^#{5}\\s+(.+)$/mg,'<h5>$1</h5>');","  h = h.replace(/^#{4}\\s+(.+)$/mg,'<h4>$1</h4>');","  h = h.replace(/^#{3}\\s+(.+)$/mg,'<h3>$1</h3>');","  h = h.replace(/^#{2}\\s+(.+)$/mg,'<h4>$1</h4>');","  h = h.replace(/^#\\s+(.+)$/mg,'<h5>$1</h5>');","  h = h.replace(/^---+$/mg,'<hr>');","  h = h.replace(/`([^`]+)`/g,'<code>$1</code>');","  h = h.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g,'<strong><em>$1</em></strong>');","  h = h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');","  h = h.replace(/\\*([^*]+)\\*/g,'<em>$1</em>');","  h = h.replace(/((?:^[*-]\\s+.+$\\n?)+)/mg, function(b){","    return '<ul>'+b.trim().split('\\n').map(function(l){return '<li>'+l.replace(/^[*-]\\s+/,'')+' </li>';}).join('')+'</ul>';","  });","  h = h.replace(/((?:^\\d+\\.\\s+.+$\\n?)+)/mg, function(b){","    return '<ol>'+b.trim().split('\\n').map(function(l){return '<li>'+l.replace(/^\\d+\\.\\s+/,'')+' </li>';}).join('')+'</ol>';","  });","  h = h.replace(/(?:^(?!<)\\S[^\\n]*$\\n?)+/mg, function(b){","    var t=b.trim(); return t ? '<p>'+t.replace(/\\n/g,' ')+'</p>' : '';","  });","  return h;","}"].join(`
`)}var g=h(require("vscode"));var re=h(require("vscode"));var U=class t{constructor(e,o,n,i,r){this._id=o;this._onSave=r,this._panel=re.window.createWebviewPanel("srsEditor",n,{viewColumn:re.ViewColumn.Active,preserveFocus:!1},{enableScripts:!0,localResourceRoots:[]}),this._update(i),this._panel.webview.onDidReceiveMessage(async s=>{if(s.type==="cancel"){this.dispose();return}if(s.type==="save")try{await this._onSave(s.data),this.dispose()}catch(a){let l=a instanceof u?a.diagnostics:[String(a)];this._panel.webview.postMessage({type:"error",messages:l})}}),this._panel.onDidDispose(()=>{t._panels.delete(this._id)})}static{this._panels=new Map}static show(e,o,n,i,r){let s=t._panels.get(o);if(s)return s._panel.reveal(re.ViewColumn.Active),s._panel.title=n,s._onSave=r,s._update(i),s;let a=new t(e,o,n,i,r);return t._panels.set(o,a),a}_update(e){this._panel.webview.html=e}dispose(){this._panel.dispose()}};var Kt=`
  function wireRemoveEntry(btn) {
    btn.addEventListener('click', function() {
      btn.closest('[data-repeat-entry]').remove();
    });
  }
  function addEntry(listId, rows) {
    var list = document.getElementById(listId);
    var entry = document.createElement('div');
    entry.className = 'repeat-entry';
    entry.setAttribute('data-repeat-entry', '');
    entry.innerHTML = '<textarea class="repeat-value" rows="' + (rows || 2) + '"></textarea>' +
      '<button type="button" class="btn-remove-entry" title="Remove">\\u2715</button>';
    list.appendChild(entry);
    entry.querySelector('.repeat-value').focus();
    wireRemoveEntry(entry.querySelector('.btn-remove-entry'));
  }
  document.querySelectorAll('.btn-remove-entry').forEach(wireRemoveEntry);
  document.querySelectorAll('.btn-add-entry[data-target]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      addEntry(btn.getAttribute('data-target'), parseInt(btn.getAttribute('data-rows') || '2', 10));
    });
  });
`;function se(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function _(t){return se(t)}function qe(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;")}var Jt=`
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 1.5em 2em;
      max-width: 800px;
    }
    h1 { font-size: 1.2em; margin-bottom: 1.2em; }
    .field { margin-bottom: 1.2em; }
    label {
      display: block;
      font-size: 0.85em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 0.3em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    label .required-mark { color: var(--vscode-errorForeground); margin-left: 2px; }
    input[type="text"], textarea {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
    }
    input[type="text"]:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    textarea { line-height: 1.5; }
    .section-group {
      border-left: 2px solid var(--vscode-panel-border);
      padding-left: 1em;
      margin-bottom: 1.5em;
    }
    .section-group .field:last-child { margin-bottom: 0; }
    .section-header {
      display: flex;
      gap: 0.5em;
      margin-bottom: 0.4em;
      align-items: center;
    }
    .section-name-input {
      flex: 1;
      font-weight: 600;
    }
    .section-label-input { flex: 1; }
    .btn-remove-section {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
      flex-shrink: 0;
    }
    .btn-remove-section:hover { opacity: 0.7; }
    .repeat-list { display: flex; flex-direction: column; gap: 0.4em; margin-bottom: 0.4em; }
    .repeat-entry { display: flex; gap: 0.5em; align-items: flex-start; }
    .repeat-entry .repeat-value { flex: 1; }
    .btn-remove-entry {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .btn-remove-entry:hover { opacity: 0.7; }
    .btn-add-entry {
      padding: 3px 10px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .btn-add-entry:hover { border-color: var(--vscode-focusBorder); }
    .hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 0.2em; }
    .button-row { display: flex; gap: 0.75em; margin-top: 1.5em; }
    button {
      padding: 5px 16px;
      border: none;
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      cursor: pointer;
    }
    button[type="submit"] {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button[type="submit"]:hover { background: var(--vscode-button-hoverBackground); }
    button[type="button"] {
      background: var(--vscode-button-secondaryBackground, var(--vscode-panel-border));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
    #error-banner {
      display: none;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 0.6em 1em;
      margin-bottom: 1em;
      border-radius: 2px;
      font-size: 0.9em;
    }
    #error-banner.visible { display: block; }
  </style>
`,Yt=`
  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('editor-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const data = collectFormData();
      vscode.postMessage({ type: 'save', data });
    });

    document.getElementById('btn-cancel').addEventListener('click', function() {
      vscode.postMessage({ type: 'cancel' });
    });

    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (msg.type === 'error') {
        const banner = document.getElementById('error-banner');
        banner.textContent = msg.messages.join('\\n');
        banner.classList.add('visible');
      }
    });
  </script>
`,Xt=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">`;function Q(t,e){return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${Xt}
  ${Jt}
  <title>${se(t)}</title>
</head>
<body>
  <h1>${se(t)}</h1>
  <div id="error-banner"></div>
  <form id="editor-form" novalidate>
    ${e}
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" id="btn-cancel">Cancel</button>
    </div>
  </form>
  ${Yt}
</body>
</html>`}function Ze(t){let e=t.sections??[],o=(t.tags??[]).join(", "),n=e.map(r=>`
    <div class="section-group" data-section>
      <div class="field">
        <div class="section-header">
          <input type="text" class="section-name-input" placeholder="Section name (e.g. body)" value="${_(r.name)}" required>
          <input type="text" class="section-label-input" placeholder="Label (optional)" value="${_(r.label??"")}">
          <button type="button" class="btn-remove-section" title="Remove section">\u2715</button>
        </div>
        <textarea class="section-content-input" rows="6">${qe(r.content)}</textarea>
      </div>
    </div>`).join("");return`
    <div class="field">
      <label>Title <span class="required-mark">*</span></label>
      <input type="text" name="title" value="${_(t.title)}" required autofocus>
    </div>
    <div class="field">
      <label>Tags</label>
      <input type="text" name="tags" value="${_(o)}">
      <div class="hint">Comma-separated slugs, e.g. purpose, origin</div>
    </div>
    <div id="sections-container">
      ${n}
    </div>
    <div class="field">
      <button type="button" id="btn-add-section">+ Add Section</button>
    </div>
    <input type="hidden" name="instanceId" value="${_(t.instanceId)}">
    <input type="hidden" name="createdAt" value="${_(t.createdAt??"")}">
    
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const title = form.querySelector('[name="title"]').value;
      const tagsRaw = form.querySelector('[name="tags"]').value;
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      const sections = [];
      form.querySelectorAll('[data-section]').forEach(function(group) {
        const name = group.querySelector('.section-name-input').value.trim();
        const labelRaw = group.querySelector('.section-label-input').value.trim();
        const content = group.querySelector('.section-content-input').value;
        if (name) {
          sections.push({ name, label: labelRaw || undefined, content });
        }
      });
      return { instanceId, title, tags, sections, createdAt };
    }

    function addSection() {
      const container = document.getElementById('sections-container');
      const group = document.createElement('div');
      group.className = 'section-group';
      group.setAttribute('data-section', '');
      group.innerHTML =
        '<div class="field">' +
          '<div class="section-header">' +
            '<input type="text" class="section-name-input" placeholder="Section name (e.g. body)" required>' +
            '<input type="text" class="section-label-input" placeholder="Label (optional)">' +
            '<button type="button" class="btn-remove-section" title="Remove section">\\u2715</button>' +
          '</div>' +
          '<textarea class="section-content-input" rows="6"></textarea>' +
        '</div>';
      container.appendChild(group);
      group.querySelector('.section-name-input').focus();
      wireRemoveButton(group.querySelector('.btn-remove-section'));
    }

    function wireRemoveButton(btn) {
      btn.addEventListener('click', function() {
        btn.closest('[data-section]').remove();
      });
    }

    document.querySelectorAll('.btn-remove-section').forEach(wireRemoveButton);
    document.getElementById('btn-add-section').addEventListener('click', addSection);
  </script>`}function et(t){return`
    <div class="field">
      <label>Slug <span class="required-mark">*</span></label>
      <input type="text" name="slug" value="${_(t.slug)}" required
             pattern="[a-z0-9]+(-[a-z0-9]+)*" autofocus>
      <div class="hint">Kebab-case, e.g. needs-review</div>
    </div>
    <div class="field">
      <label>Display Label</label>
      <input type="text" name="label" value="${_(t.label??"")}">
    </div>
    <input type="hidden" name="instanceId" value="${_(t.instanceId)}">
    <input type="hidden" name="createdAt" value="${_(t.createdAt??"")}">
    
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const slug = form.querySelector('[name="slug"]').value.trim();
      const labelRaw = form.querySelector('[name="label"]').value.trim();
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      return { instanceId, slug, label: labelRaw || undefined, createdAt };
    }
  </script>`}function tt(t,e){let o=[...e].sort((d,c)=>d.order-c.order),n=new Map,i=new Map;for(let d of t.fieldValues)d.entries&&d.entries.length>0?i.set(d.fieldId,d.entries.map(c=>typeof c.value=="string"?c.value:JSON.stringify(c.value))):n.set(d.fieldId,typeof d.value=="string"?d.value:JSON.stringify(d.value));let r=o.map((d,c)=>{let p=d.displayLabel??d.fieldId.slice(0,8),f=d.required?' <span class="required-mark">*</span>':"",v=d.minItems!=null?` min ${d.minItems}`:"",S=d.maxItems!=null?` max ${d.maxItems}`:"",y=v||S?`<div class="hint">Repeatable${v}${S}</div>`:"";if(d.repeatable){let $=(i.get(d.fieldId)??(n.has(d.fieldId)?[n.get(d.fieldId)]:[""])).map(G=>`
        <div class="repeat-entry" data-repeat-entry>
          <textarea class="repeat-value" rows="2">${qe(G)}</textarea>
          <button type="button" class="btn-remove-entry" title="Remove">\u2715</button>
        </div>`).join("");return`
    <div class="field" data-field-index="${c}" data-repeatable>
      <label>${se(p)}${f}</label>
      <div class="repeat-list" id="repeat-list-${c}">${$}</div>
      <button type="button" class="btn-add-entry" data-target="repeat-list-${c}">+ Add value</button>
      ${y}
      <input type="hidden" name="field_id_${c}" value="${_(d.fieldId)}">
    </div>`}else{let k=n.get(d.fieldId)??"",$=d.required?" required":"";return`
    <div class="field" data-field-index="${c}">
      <label>${se(p)}${f}</label>
      <textarea name="field_value_${c}" rows="2"${$}>${qe(k)}</textarea>
      <input type="hidden" name="field_id_${c}" value="${_(d.fieldId)}">
    </div>`}}).join(""),s=o.length,a=o.map((d,c)=>d.repeatable?c:-1).filter(d=>d>=0),l=`
  <script>
    var repeatableIndices = ${JSON.stringify(a)};

    function collectFormData() {
      var form = document.getElementById('editor-form');
      var instanceId = form.querySelector('[name="instanceId"]').value;
      var typeId = form.querySelector('[name="typeId"]').value;
      var typeName = form.querySelector('[name="typeName"]').value;
      var typeNamespace = form.querySelector('[name="typeNamespace"]').value;
      var typeVersion = parseInt(form.querySelector('[name="typeVersion"]').value, 10);
      var createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      var fieldCount = parseInt(form.querySelector('[name="fieldCount"]').value, 10);
      var fieldValues = [];
      for (var i = 0; i < fieldCount; i++) {
        var fieldId = form.querySelector('[name="field_id_' + i + '"]').value;
        if (repeatableIndices.indexOf(i) >= 0) {
          var list = form.querySelector('#repeat-list-' + i);
          var entries = [];
          list.querySelectorAll('[data-repeat-entry] .repeat-value').forEach(function(ta) {
            var v = ta.value.trim();
            if (v) entries.push({ value: v });
          });
          // Always include repeatable fields (even if empty, for min-items validation)
          fieldValues.push({ fieldId: fieldId, value: '', entries: entries });
        } else {
          var value = form.querySelector('[name="field_value_' + i + '"]').value;
          if (value.trim()) {
            fieldValues.push({ fieldId: fieldId, value: value.trim() });
          }
        }
      }
      return { instanceId: instanceId, typeId: typeId, typeName: typeName,
               typeNamespace: typeNamespace, typeVersion: typeVersion,
               createdAt: createdAt, fieldValues: fieldValues };
    }

    ${Kt.trim()}
  </script>`;return`
    ${r}
    <input type="hidden" name="instanceId" value="${_(t.instanceId)}">
    <input type="hidden" name="typeId" value="${_(t.typeId)}">
    <input type="hidden" name="typeName" value="${_(t.typeName)}">
    <input type="hidden" name="typeNamespace" value="${_(t.typeNamespace)}">
    <input type="hidden" name="typeVersion" value="${_(String(t.typeVersion))}">
    <input type="hidden" name="createdAt" value="${_(t.createdAt??"")}">
    <input type="hidden" name="fieldCount" value="${s}">
    ${l}`}function ot(t,e,o,n){t.subscriptions.push(g.commands.registerCommand("srs.editEntity",i=>Qt(t,e,o,n,i)),g.commands.registerCommand("srs.createRelation",()=>oo(e,o,n)),g.commands.registerCommand("srs.createRelationType",()=>no(e,o,n)),g.commands.registerCommand("srs.updateRelationType",()=>io(e,o,n)),g.commands.registerCommand("srs.deleteRelationType",()=>ro(e,o,n)))}async function Qt(t,e,o,n,i){if(!(i instanceof T)){g.window.showWarningMessage("SRS: Select an entity in the SRS tree to edit.");return}let r=o.active;if(r)try{switch(i.entityKind){case"note":await Zt(t,e,r.rootPath,i.entityId,n);break;case"tag":await eo(t,e,r.rootPath,i.entityId,n);break;case"record":await to(t,e,r.rootPath,i.entityId,n);break;default:g.window.showInformationMessage(`SRS: No form editor for '${i.entityKind}'. Open the entity JSON to edit directly.`)}}catch(s){let a=s instanceof u?s.message:String(s);g.window.showErrorMessage(`SRS: Edit failed: ${a}`)}}async function Zt(t,e,o,n,i){let s=(await e.runOk(o,["note","get",n])).note,a={instanceId:s.instanceId,title:s.title,tags:s.tags,createdAt:s.createdAt,sections:s.sections},l=Q(s.title,Ze(a));U.show(t,`note:${n}`,s.title,l,async d=>{let c=d,p=await e.runOk(o,["note","get",n]);p.note.title!==s.title&&await g.window.showWarningMessage(`SRS: Note was modified since you opened it (title changed to "${p.note.title}"). Overwrite?`,{modal:!0},"Overwrite")!=="Overwrite"||(await e.runOk(o,["note","update",n],{stdin:JSON.stringify(c)}),i.refresh())})}async function eo(t,e,o,n,i){let s=(await e.runOk(o,["tag","get",n])).tagDefinition,a={instanceId:s.instanceId,slug:s.slug,label:s.label,createdAt:s.createdAt},l=Q(`Edit Tag: ${s.slug}`,et(a));U.show(t,`tag:${n}`,`Edit Tag: ${s.slug}`,l,async d=>{let c=d;(await e.runOk(o,["tag","get",n])).tagDefinition.slug!==s.slug&&await g.window.showWarningMessage("SRS: Tag was modified since you opened it. Overwrite?",{modal:!0},"Overwrite")!=="Overwrite"||(await e.runOk(o,["tag","update",n],{stdin:JSON.stringify(c)}),i.refresh())})}async function to(t,e,o,n,i){let s=(await e.runOk(o,["record","get",n])).record,l=(await e.runOk(o,["type","get",s.typeId])).type.fields,d=await Promise.allSettled(l.map(S=>e.runOk(o,["field","get",S.fieldId]))),c={instanceId:s.instanceId,typeId:s.typeId,typeName:s.typeName,typeNamespace:s.typeNamespace,typeVersion:s.typeVersion,createdAt:s.createdAt,fieldValues:s.fieldValues},p=l.map((S,y)=>{let k=d[y],$=k.status==="fulfilled"?k.value.field.name:void 0;return{fieldId:S.fieldId,displayLabel:S.displayLabel??$,order:S.order,required:S.required,repeatable:S.repeatable,minItems:S.minItems,maxItems:S.maxItems}}),f=`${s.typeNamespace}/${s.typeName} v${s.typeVersion}`,v=Q(f,tt(c,p));U.show(t,`record:${n}`,f,v,async S=>{let y=S;(await e.runOk(o,["record","get",n])).record.fieldValues.length!==s.fieldValues.length&&await g.window.showWarningMessage("SRS: Record was modified since you opened it. Overwrite?",{modal:!0},"Overwrite")!=="Overwrite"||(await e.runOk(o,["record","update",n],{stdin:JSON.stringify(y)}),i.refresh())})}async function oo(t,e,o){let n=e.active;if(!n){g.window.showWarningMessage("SRS: No active repository.");return}let i=[];try{i=(await t.runOk(n.rootPath,["relation-type","list"])).relationTypeDefinitions}catch{}let r=["contains","depends-on","supersedes","refines","derived-from","evidences","precedes"],s=i.length>0?i.map(v=>({label:v.label,description:v.relationType,value:v.relationType})):r.map(v=>({label:v,description:"",value:v})),a=await g.window.showQuickPick(s,{placeHolder:"Select relation type"});if(!a)return;let l=await so(t,n.rootPath);if(l.length===0){g.window.showWarningMessage("SRS: No instances found to relate. Create some notes or records first.");return}let d=await g.window.showQuickPick(l,{placeHolder:"Select source instance",matchOnDescription:!0});if(!d)return;let c=await g.window.showQuickPick(l.filter(v=>v.id!==d.id),{placeHolder:"Select target instance",matchOnDescription:!0});if(!c)return;let{randomUUID:p}=await import("crypto"),f=JSON.stringify({relationId:p(),relationType:a.value,sourceInstanceId:d.id,targetInstanceId:c.id,createdAt:new Date().toISOString()});try{await t.runOk(n.rootPath,["relation","create"],{stdin:f}),o.refresh(),g.window.showInformationMessage(`SRS: Relation '${a.value}' created.`)}catch(v){let S=v instanceof u?v.message:String(v);g.window.showErrorMessage(`SRS: Failed to create relation: ${S}`)}}async function no(t,e,o){let n=e.active;if(!n){g.window.showWarningMessage("SRS: No active repository.");return}let{randomUUID:i}=await import("crypto"),r=JSON.stringify({id:i(),version:1,relationType:"namespace/name",namespace:"com.example",label:"My relation type",description:"Description of what this relation means.",category:"association",createdAt:new Date().toISOString()},null,2),s=await g.workspace.openTextDocument({content:r,language:"json"});if(await g.window.showTextDocument(s),await g.window.showInformationMessage("SRS: Edit the relation type definition above, then click Create.","Create","Cancel")!=="Create")return;let l=s.getText();try{await t.runOk(n.rootPath,["relation-type","create"],{stdin:l}),o.refresh(),g.window.showInformationMessage("SRS: Relation type created.")}catch(d){let c=d instanceof u?d.message:String(d);g.window.showErrorMessage(`SRS: Failed to create relation type: ${c}`)}}async function io(t,e,o){let n=e.active;if(!n){g.window.showWarningMessage("SRS: No active repository.");return}let i=await nt(t,n.rootPath);if(!i)return;let r=await t.runOk(n.rootPath,["relation-type","get",i.id]),s=await g.workspace.openTextDocument({content:JSON.stringify(r.relationTypeDefinition,null,2),language:"json"});if(await g.window.showTextDocument(s),await g.window.showInformationMessage(`SRS: Edit '${i.label}', then click Update.`,"Update","Cancel")!=="Update")return;let l=s.getText();try{await t.runOk(n.rootPath,["relation-type","update",i.id],{stdin:l}),o.refresh(),g.window.showInformationMessage("SRS: Relation type updated.")}catch(d){let c=d instanceof u?d.message:String(d);g.window.showErrorMessage(`SRS: Failed to update relation type: ${c}`)}}async function ro(t,e,o){let n=e.active;if(!n){g.window.showWarningMessage("SRS: No active repository.");return}let i=await nt(t,n.rootPath);if(!(!i||await g.window.showWarningMessage(`SRS: Delete relation type '${i.label}' (${i.relationType})? This will fail if any stored relations reference it.`,{modal:!0},"Delete")!=="Delete"))try{await t.runOk(n.rootPath,["relation-type","delete",i.id]),o.refresh(),g.window.showInformationMessage("SRS: Relation type deleted.")}catch(s){let a=s instanceof u?s.message:String(s);g.window.showErrorMessage(`SRS: Failed to delete relation type: ${a}`)}}async function nt(t,e){let o=[];try{o=(await t.runOk(e,["relation-type","list"])).relationTypeDefinitions}catch(i){let r=i instanceof u?i.message:String(i);g.window.showErrorMessage(`SRS: Could not load relation types: ${r}`);return}if(o.length===0){g.window.showWarningMessage("SRS: No relation type definitions found in this repository.");return}let n=o.map(i=>({label:i.label,description:i.relationType,id:i.id,relationType:i.relationType}));return g.window.showQuickPick(n,{placeHolder:"Select relation type"})}async function so(t,e){let o=[];try{let n=await t.runOk(e,["note","list"]);for(let i of n.notes)o.push({label:i.title,description:`note \xB7 ${i.instanceId.slice(0,8)}`,id:i.instanceId})}catch{}try{let n=await t.runOk(e,["record","list"]);for(let i of n.records)o.push({label:`${i.typeNamespace}/${i.typeName}`,description:`record \xB7 ${i.instanceId.slice(0,8)}`,id:i.instanceId})}catch{}return o}var A=h(require("vscode"));function it(t,e,o,n,i){t.subscriptions.push(A.commands.registerCommand("srs.setActiveContainer",()=>ao(e,o,n)),A.commands.registerCommand("srs.clearActiveContainer",()=>co(n,i)),A.commands.registerCommand("srs.createContainer",()=>lo(e,o,n,i)))}async function ao(t,e,o){let n=e.active;if(!n){A.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");return}let i;try{i=(await t.runOk(n.rootPath,["container","list"])).containers}catch(l){let d=l instanceof u?l.message:String(l);A.window.showErrorMessage(`SRS: Failed to list containers: ${d}`);return}if(i.length===0){let l="Create Container";await A.window.showInformationMessage("SRS: No containers found in the active repository.",l)===l&&A.commands.executeCommand("srs.createContainer");return}let r=i.map(l=>({label:l.title,description:l.containerType,detail:l.containerId,container:l})),s={label:"$(circle-slash) Clear active container",description:"",detail:"",container:null},a=await A.window.showQuickPick([s,...r],{placeHolder:"Select a container to set as active"});if(a){if(a.container===null){await o.clear();return}try{await o.set({containerId:a.container.containerId,title:a.container.title},n.rootPath)}catch(l){let d=l instanceof u?l.message:String(l);A.window.showErrorMessage(`SRS: Failed to set active container: ${d}`)}}}async function co(t,e){await t.clear(),e.refresh()}async function lo(t,e,o,n){let i=e.active;if(!i){A.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");return}let r=await A.window.showInputBox({title:"SRS: Create Container",prompt:"Container title",placeHolder:"e.g. Sprint 42",validateInput:p=>p.trim()?void 0:"Title is required"});if(!r)return;let s=await A.window.showInputBox({title:"SRS: Create Container",prompt:"Container type (optional)",placeHolder:"e.g. sprint, milestone, epic"}),{randomUUID:a}=await import("crypto"),l=a(),d=new Date().toISOString(),c=JSON.stringify({containerId:l,title:r.trim(),containerType:s?.trim()||void 0,memberInstanceIds:[],rootInstanceIds:[],createdAt:d});try{await t.runOk(i.rootPath,["container","create"],{stdin:c}),n.refresh();let p="Set as Active";await A.window.showInformationMessage(`SRS: Container '${r}' created.`,p)===p&&await o.set({containerId:l,title:r.trim()},i.rootPath)}catch(p){let f=p instanceof u?p.message:String(p);A.window.showErrorMessage(`SRS: Failed to create container: ${f}`)}}var P=h(require("vscode"));function rt(t,e,o,n,i){t.subscriptions.push(P.commands.registerCommand("srs.createNote",()=>po(e,o,n,i)),P.commands.registerCommand("srs.createTag",()=>uo(e,o,i)),P.commands.registerCommand("srs.createRecord",()=>mo(e,o,n,i)),P.commands.registerCommand("srs.deleteEntity",r=>go(e,o,i,r)))}function Ge(t){let e=t.active;if(!e){P.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");return}return e}function st(t){return t.active?.containerId}async function po(t,e,o,n){let i=Ge(e);if(!i)return;let r=await P.window.showInputBox({title:"SRS: Create Note",prompt:"Note title",placeHolder:"e.g. Architecture Decision: Use CLI bridge",validateInput:c=>c.trim()?void 0:"Title is required"});if(!r)return;let{randomUUID:s}=await import("crypto"),a=s(),l=new Date().toISOString(),d=JSON.stringify({instanceId:a,title:r.trim(),sections:[{name:"body",content:"",label:"Body"}],tags:[],createdAt:l});try{let c=st(o);await t.runOk(i.rootPath,["note","create"],{stdin:d,containerId:c}),n.refresh(),P.window.showInformationMessage(`SRS: Note '${r}' created.`)}catch(c){let p=c instanceof u?c.message:String(c);P.window.showErrorMessage(`SRS: Failed to create note: ${p}`)}}async function uo(t,e,o){let n=Ge(e);if(!n)return;let i=await P.window.showInputBox({title:"SRS: Create Tag",prompt:"Tag slug (kebab-case identifier)",placeHolder:"e.g. needs-review",validateInput:c=>/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.trim())?void 0:"Slug must be kebab-case (e.g. my-tag)"});if(!i)return;let r=await P.window.showInputBox({title:"SRS: Create Tag",prompt:"Display label (optional)",placeHolder:"e.g. Needs Review"}),{randomUUID:s}=await import("crypto"),a=s(),l=new Date().toISOString(),d=JSON.stringify({instanceId:a,slug:i.trim(),label:r?.trim()||void 0,createdAt:l});try{await t.runOk(n.rootPath,["tag","create"],{stdin:d}),o.refresh(),P.window.showInformationMessage(`SRS: Tag '${i}' created.`)}catch(c){let p=c instanceof u?c.message:String(c);P.window.showErrorMessage(`SRS: Failed to create tag: ${p}`)}}async function mo(t,e,o,n){let i=Ge(e);if(!i)return;let r;try{r=(await t.runOk(i.rootPath,["type","list"])).types}catch(d){let c=d instanceof u?d.message:String(d);P.window.showErrorMessage(`SRS: Failed to list types: ${c}`);return}if(r.length===0){P.window.showWarningMessage("SRS: No types defined in the active repository.");return}let s=r.map(d=>({label:`${d.namespace}/${d.name}`,description:`v${d.version}`,detail:d.id,type:d})),a=await P.window.showQuickPick(s,{placeHolder:"Select a type for the new record",matchOnDescription:!0,matchOnDetail:!0});if(!a)return;let l=`${a.type.namespace}/${a.type.name}`;try{let d=st(o);await t.runOk(i.rootPath,["record","create","--type",l,"--version",String(a.type.version)],{stdin:JSON.stringify({fieldValues:[]}),containerId:d}),n.refresh(),P.window.showInformationMessage(`SRS: Record of type '${l}' created.`)}catch(d){let c=d instanceof u?d.message:String(d);P.window.showErrorMessage(`SRS: Failed to create record: ${c}`)}}async function go(t,e,o,n){if(!(n instanceof T)){P.window.showWarningMessage("SRS: Select an entity in the SRS tree to delete.");return}let i=e.active;if(!i||await P.window.showWarningMessage(`SRS: Delete ${n.entityKind} '${n.label}'?`,{modal:!0},"Delete")!=="Delete")return;let s=vo(n.entityKind,n.entityId);if(!s){P.window.showErrorMessage(`SRS: Delete not supported for '${n.entityKind}'.`);return}try{await t.runOk(i.rootPath,s),o.refresh(),P.window.showInformationMessage(`SRS: ${n.entityKind} deleted.`)}catch(a){if(a instanceof u&&a.diagnostics.some(l=>l.includes("CannotDeleteInUse")||l.includes("used by")))P.window.showErrorMessage(`SRS: Cannot delete ${n.entityKind} '${n.label}' \u2014 it is referenced by other entities. Remove those references first.

Details: ${a.diagnostics.join(`
`)}`,{modal:!0});else{let l=a instanceof u?a.message:String(a);P.window.showErrorMessage(`SRS: Failed to delete entity: ${l}`)}}}function vo(t,e){switch(t){case"note":return["note","delete",e];case"tag":return["tag","delete",e];case"record":return["record","delete",e];case"relation":return["relation","delete",e];case"container":return["container","delete",e];case"protocol":return["protocol","delete",e];case"blueprint":return["blueprint","delete",e];default:return}}var B=h(require("vscode"));var J=h(require("vscode")),Ie=class t{constructor(e,o,n,i){this._context=e;this._key=o;this._repoPath=i;this._panel=J.window.createWebviewPanel("srsGraph",`Relations: ${n}`,{viewColumn:J.ViewColumn.Active,preserveFocus:!1},{enableScripts:!0,localResourceRoots:[],retainContextWhenHidden:!0}),this._panel.webview.onDidReceiveMessage(r=>{r.type==="openEntity"&&typeof r.id=="string"&&J.commands.executeCommand("srs.openEntityById",r.id,r.kind??"note",this._repoPath)}),this._panel.onDidDispose(()=>{t._panels.delete(this._key)})}static{this._panels=new Map}static async show(e,o,n,i){let r=`graph:${n}`,s=t._panels.get(r);if(s){s._panel.reveal(J.ViewColumn.Active),await s._load(o,n);return}let a=new t(e,r,i,n);t._panels.set(r,a),await a._load(o,n)}async _load(e,o){this._panel.webview.html=yo();try{let[n,i,r]=await Promise.all([e.runOk(o,["relation","list"]),e.runOk(o,["note","list"]).catch(()=>({notes:[]})),e.runOk(o,["record","list"]).catch(()=>({records:[]}))]),s=new Map,a=new Map;for(let p of i.notes)s.set(p.instanceId,p.title),a.set(p.instanceId,"note");for(let p of r.records)s.set(p.instanceId,p.typeName),a.set(p.instanceId,"record");let l=new Set,d=[];for(let p of n.relations)l.add(p.sourceId),l.add(p.targetId),d.push({id:p.relationId,source:p.sourceId,target:p.targetId,label:p.relationType});let c=Array.from(l).map(p=>({id:p,label:s.get(p)??p.slice(0,8),kind:a.get(p)??"note"}));this._panel.webview.html=ho(c,d)}catch(n){this._panel.webview.html=fo(String(n))}}dispose(){this._panel.dispose()}};function yo(){return`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
  font-family:var(--vscode-font-family);color:var(--vscode-foreground);
  background:var(--vscode-editor-background)}</style>
  </head><body><p>Loading relation graph\u2026</p></body></html>`}function fo(t){return`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);
  background:var(--vscode-editor-background);padding:2em}</style>
  </head><body><h2>Failed to load graph</h2><pre>${t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre></body></html>`}function ho(t,e){let o=JSON.stringify(t),n=JSON.stringify(e);return`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; overflow: hidden;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    user-select: none;
  }
  #toolbar {
    position: absolute; top: 8px; left: 8px; z-index: 10;
    display: flex; gap: 6px; align-items: center;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 3px 10px; cursor: pointer; border-radius: 3px;
    font-size: 0.85em;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #info {
    font-size: 0.8em; color: var(--vscode-descriptionForeground); padding: 2px 6px;
  }
  #empty {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: var(--vscode-descriptionForeground); font-style: italic;
    display: none;
  }
  svg { display: block; width: 100vw; height: 100vh; }
  .edge { stroke: var(--vscode-editorWidget-border, #555); stroke-width: 1.5; fill: none; }
  .edge-label {
    font-size: 10px; fill: var(--vscode-descriptionForeground);
    pointer-events: none; text-anchor: middle;
  }
  .node circle {
    fill: var(--vscode-badge-background, #0078d4);
    stroke: var(--vscode-focusBorder, #007acc);
    stroke-width: 1.5; cursor: pointer;
  }
  .node circle:hover { fill: var(--vscode-button-hoverBackground, #005a9e); }
  .node.pinned circle { stroke: var(--vscode-charts-yellow, #f9b700); stroke-width: 2.5; }
  .node text {
    font-size: 11px; fill: var(--vscode-foreground);
    pointer-events: none; dominant-baseline: middle; text-anchor: middle;
  }
  .arrow { fill: var(--vscode-editorWidget-border, #555); }
</style>
</head>
<body>
<div id="toolbar">
  <button id="btnReset">Reset layout</button>
  <span id="info"></span>
</div>
<div id="empty">No relations in this repository.</div>
<svg id="svg">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="14" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" class="arrow"/>
    </marker>
  </defs>
  <g id="root">
    <g id="edgeGroup"></g>
    <g id="nodeGroup"></g>
  </g>
</svg>
<script>
(function() {
  const NODES = ${o};
  const EDGES = ${n};

  const vscode = acquireVsCodeApi();

  const svg = document.getElementById('svg');
  const root = document.getElementById('root');
  const edgeGroup = document.getElementById('edgeGroup');
  const nodeGroup = document.getElementById('nodeGroup');
  const info = document.getElementById('info');

  if (NODES.length === 0) {
    document.getElementById('empty').style.display = 'block';
    return;
  }

  info.textContent = NODES.length + ' nodes \xB7 ' + EDGES.length + ' edges';

  // ---- Layout state ----
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  // Initialise node positions in a circle
  const pos = new Map(); // id -> {x, y, vx, vy, pinned}
  NODES.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / NODES.length;
    const r = Math.min(W(), H()) * 0.32;
    pos.set(n.id, {
      x: W() / 2 + r * Math.cos(angle),
      y: H() / 2 + r * Math.sin(angle),
      vx: 0, vy: 0,
      pinned: false,
    });
  });

  // Build adjacency for edge bundles
  const edgePairs = new Map(); // "a|b" -> count (for multi-edge offset)

  // ---- DOM elements ----
  const edgeEls = EDGES.map((e, i) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('marker-end', 'url(#arrow)');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'edge-label');
    text.textContent = e.label;
    edgeGroup.appendChild(path);
    edgeGroup.appendChild(text);
    return { path, text, edge: e };
  });

  const nodeEls = NODES.map((n) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '20');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const label = n.label.length > 12 ? n.label.slice(0, 11) + '\u2026' : n.label;
    text.textContent = label;
    g.appendChild(circle);
    g.appendChild(text);
    nodeGroup.appendChild(g);

    // Drag
    let dragging = false;
    let dragOx = 0, dragOy = 0;
    circle.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      dragging = true;
      const p = pos.get(n.id);
      const svgPt = svgPoint(ev);
      dragOx = svgPt.x - p.x;
      dragOy = svgPt.y - p.y;
      p.pinned = true;
      p.vx = 0; p.vy = 0;
      g.classList.add('pinned');
    });
    circle.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      const p = pos.get(n.id);
      p.pinned = false;
      g.classList.remove('pinned');
    });
    circle.addEventListener('click', (ev) => {
      if (!dragging) {
        vscode.postMessage({ type: 'openEntity', id: n.id, kind: n.kind });
      }
    });

    svg.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const p = pos.get(n.id);
      const svgPt = svgPoint(ev);
      p.x = svgPt.x - dragOx;
      p.y = svgPt.y - dragOy;
      p.vx = 0; p.vy = 0;
    });
    svg.addEventListener('mouseup', () => { dragging = false; });

    // Tooltip
    g.setAttribute('title', n.id);

    return { g, circle, text, node: n };
  });

  // SVG pan/zoom
  let panX = 0, panY = 0, scale = 1;
  let panning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;

  svg.addEventListener('mousedown', (ev) => {
    if (ev.target === svg || ev.target === root) {
      panning = true;
      panStartX = ev.clientX;
      panStartY = ev.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
    }
  });
  svg.addEventListener('mousemove', (ev) => {
    if (!panning) return;
    panX = panStartPanX + (ev.clientX - panStartX);
    panY = panStartPanY + (ev.clientY - panStartY);
    applyTransform();
  });
  svg.addEventListener('mouseup', () => { panning = false; });
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.1, Math.min(5, scale * delta));
    applyTransform();
  }, { passive: false });

  function applyTransform() {
    root.setAttribute('transform', \`translate(\${panX},\${panY}) scale(\${scale})\`);
  }

  document.getElementById('btnReset').addEventListener('click', () => {
    panX = 0; panY = 0; scale = 1;
    applyTransform();
    NODES.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / NODES.length;
      const r = Math.min(W(), H()) * 0.32;
      const p = pos.get(n.id);
      p.x = W() / 2 + r * Math.cos(angle);
      p.y = H() / 2 + r * Math.sin(angle);
      p.vx = 0; p.vy = 0;
      p.pinned = false;
    });
    nodeEls.forEach(({g}) => g.classList.remove('pinned'));
  });

  // ---- Force simulation ----
  const REPULSION = 4000;
  const SPRING_LEN = 140;
  const SPRING_K = 0.04;
  const DAMPING = 0.85;
  const CENTER_K = 0.008;

  function tick() {
    const nodes = NODES.map(n => pos.get(n.id));

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(dist2);
        const force = REPULSION / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
        if (!b.pinned) { b.vx += fx; b.vy += fy; }
      }
    }

    // Spring (edges)
    for (const e of EDGES) {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const stretch = dist - SPRING_LEN;
      const force = SPRING_K * stretch;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }

    // Weak center pull
    const cx = W() / 2, cy = H() / 2;
    for (const p of nodes) {
      if (!p.pinned) {
        p.vx += (cx - p.x) * CENTER_K;
        p.vy += (cy - p.y) * CENTER_K;
      }
    }

    // Integrate
    for (const p of nodes) {
      if (p.pinned) continue;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }

    // Update DOM
    nodeEls.forEach(({ g, text, node }) => {
      const p = pos.get(node.id);
      g.setAttribute('transform', \`translate(\${p.x},\${p.y})\`);
    });

    edgeEls.forEach(({ path, text, edge }) => {
      const a = pos.get(edge.source), b = pos.get(edge.target);
      if (!a || !b) return;
      // Self-loop
      if (edge.source === edge.target) {
        const lx = a.x + 30, ly = a.y - 30;
        path.setAttribute('d', \`M \${a.x} \${a.y} C \${lx} \${a.y}, \${lx} \${ly}, \${a.x} \${a.y}\`);
        text.setAttribute('x', String(lx));
        text.setAttribute('y', String(ly - 6));
        return;
      }
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Shorten to node radius
      const r = 22;
      const sx = a.x + (dx / dist) * r, sy = a.y + (dy / dist) * r;
      const ex = b.x - (dx / dist) * r, ey = b.y - (dy / dist) * r;
      path.setAttribute('d', \`M \${sx} \${sy} L \${ex} \${ey}\`);
      text.setAttribute('x', String((sx + ex) / 2));
      text.setAttribute('y', String((sy + ey) / 2 - 5));
    });

    requestAnimationFrame(tick);
  }

  tick();

  // ---- Helpers ----
  function svgPoint(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = root.getScreenCTM();
    return pt.matrixTransform(ctm ? ctm.inverse() : undefined);
  }
})();
</script>
</body>
</html>`}function at(t,e,o,n){t.subscriptions.push(B.commands.registerCommand("srs.showRelationGraph",()=>wo(t,e,o)),B.commands.registerCommand("srs.openEntityById",(i,r,s)=>bo(i,r,s,o,n)))}async function wo(t,e,o){let n=o.active;if(!n){B.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");return}try{await Ie.show(t,e,n.rootPath,n.title)}catch(i){let r=i instanceof u?i.message:String(i);B.window.showErrorMessage(`SRS: Failed to open relation graph: ${r}`)}}async function bo(t,e,o,n,i){let r=n.active;if(!r)return;let s=e;try{let a=Se(r.repositoryId,s,t),l=await B.workspace.openTextDocument(a);await B.window.showTextDocument(l,{preview:!0,viewColumn:B.ViewColumn.Beside,preserveFocus:!1})}catch(a){let l=a instanceof u?a.message:String(a);B.window.showErrorMessage(`SRS: Failed to open entity: ${l}`)}}var N=h(require("vscode"));var L=class extends N.TreeItem{constructor(e){super(e,N.TreeItemCollapsibleState.None),this.contextValue="srsNavEmpty"}},ae=class extends N.TreeItem{constructor(o,n,i){super(`${i==="outgoing"?"\u2192":"\u2190"} ${o} (${n.length})`,N.TreeItemCollapsibleState.Collapsed);this.relationType=o;this.peerIds=n;this.direction=i;this.contextValue="srsNavRelGroup",this.tooltip=`${i} ${o} relations`}},Pe=class extends T{constructor(e,o,n,i){super(e,o,n,i),this.collapsibleState=N.TreeItemCollapsibleState.Collapsed}},ke=class extends N.TreeItem{constructor(o,n,i){super(n,N.TreeItemCollapsibleState.Collapsed);this.viewId=o;this.sections=i;this.contextValue="srsNavDocView",this.tooltip=o}},Re=class extends N.TreeItem{constructor(o,n,i){super(n,i?N.TreeItemCollapsibleState.Collapsed:N.TreeItemCollapsibleState.None);this.sectionId=o;this.semanticObjectType=i;this.contextValue="srsNavSection",this.tooltip=i?`Type: ${i}`:o}},$e=class extends N.TreeItem{constructor(o,n,i){super(n,N.TreeItemCollapsibleState.Collapsed);this.containerId=o;this.containerType=i;this.contextValue="srsNavContainer",this.description=i,this.tooltip=o}},Ee=class{constructor(e,o){this.cli=e;this.repoProvider=o;this._onDidChangeTreeData=new N.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._mode="relations";this._disposables=[];this._disposables.push(o.onDidChangeActive(()=>this.refresh()))}get mode(){return this._mode}setMode(e){this._mode=e,this.refresh()}refresh(){this._relations=void 0,this._labelMap=void 0,this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){let o=this.repoProvider.active;return o?e?e instanceof Pe?this._getRelationGroups(e.entityId,o.rootPath):e instanceof ae?e.peerIds.map(n=>new T(n.id,n.kind,n.label,[n.kind==="record"?"record":"note","get",n.id])):e instanceof ke?e.sections.map(n=>new Re(n.sectionId,n.title,n.semanticObjectType)):e instanceof Re?this._getSectionRecords(e.semanticObjectType,o.rootPath):e instanceof $e?this._getContainerMembers(e.containerId,o.rootPath):[]:this._getRoots(o.rootPath):[new L("No active SRS repository")]}async _getRoots(e){switch(this._mode){case"relations":return this._getRelationRoots(e);case"document-views":return this._getDocViewRoots(e);case"containers":return this._getContainerRoots(e)}}async _getRelationRoots(e){let[o,n]=await this._ensureRelationData(e);if(o.length===0)return[new L("No relations in this repository")];let i=new Set(o.map(r=>r.sourceId));return Array.from(i).map(r=>{let s=n.get(r);return new Pe(r,s?.kind??"record",s?.label??r.slice(0,8),[(s?.kind??"record")==="note"?"note":"record","get",r])})}async _getDocViewRoots(e){try{let o=await this.cli.runOk(e,["document-view","list"]);return o.documentViews.length===0?[new L("No document views in this repository")]:await Promise.all(o.documentViews.map(async i=>{let r=await this._fetchDocViewSections(i.id,e);return new ke(i.id,`${i.namespace}/${i.name}`,r)}))}catch{return[new L("Failed to load document views")]}}async _fetchDocViewSections(e,o){try{return(await this.cli.runOk(o,["document-view","get",e])).documentView.sections.map(i=>({sectionId:i.sectionId,title:i.title,semanticObjectType:i.source?.semanticObjectType}))}catch{return[]}}async _getContainerRoots(e){try{let o=await this.cli.runOk(e,["container","list"]);return o.containers.length===0?[new L("No containers in this repository")]:o.containers.map(n=>new $e(n.containerId,n.title,n.containerType))}catch{return[new L("Failed to load containers")]}}async _getRelationGroups(e,o){let[n,i]=await this._ensureRelationData(o),r=new Map,s=new Map;for(let l of n){if(l.sourceId===e){let d=i.get(l.targetId),c={id:l.targetId,kind:d?.kind??"record",label:d?.label??l.targetId.slice(0,8)},p=r.get(l.relationType)??[];p.push(c),r.set(l.relationType,p)}if(l.targetId===e){let d=i.get(l.sourceId),c={id:l.sourceId,kind:d?.kind??"record",label:d?.label??l.sourceId.slice(0,8)},p=s.get(l.relationType)??[];p.push(c),s.set(l.relationType,p)}}let a=[];for(let[l,d]of r)a.push(new ae(l,d,"outgoing"));for(let[l,d]of s)a.push(new ae(l,d,"incoming"));return a.length===0?[new L("No relations")]:a}async _getSectionRecords(e,o){if(!e)return[new L("No type binding for this section")];try{let n=await this.cli.runOk(o,["record","list","--type",e]);return n.records.length===0?[new L("No records")]:n.records.map(i=>new T(i.instanceId,"record",i.typeName,["record","get",i.instanceId]))}catch{return[new L(`Failed to load records for ${e}`)]}}async _getContainerMembers(e,o){try{let n=await this.cli.runOk(o,["container","members","list",e]);if(n.memberInstanceIds.length===0)return[new L("No members")];let i=await this._ensureLabelMap(o);return n.memberInstanceIds.map(r=>{let s=i.get(r);return new T(r,s?.kind??"record",s?.label??r.slice(0,8),[(s?.kind??"record")==="note"?"note":"record","get",r])})}catch{return[new L("Failed to load members")]}}async _ensureRelationData(e){if(!this._relations){let n=await this.cli.runOk(e,["relation","list"]);this._relations=n.relations}let o=await this._ensureLabelMap(e);return[this._relations,o]}async _ensureLabelMap(e){if(this._labelMap)return this._labelMap;let o=new Map,[n,i]=await Promise.allSettled([this.cli.runOk(e,["note","list"]),this.cli.runOk(e,["record","list"])]);if(n.status==="fulfilled")for(let r of n.value.notes)o.set(r.instanceId,{label:r.title,kind:"note"});if(i.status==="fulfilled")for(let r of i.value.records)o.set(r.instanceId,{label:r.typeName,kind:"record"});return this._labelMap=o,o}dispose(){this._onDidChangeTreeData.dispose(),this._disposables.forEach(e=>e.dispose())}};var Z=h(require("vscode"));function dt(t,e){t.subscriptions.push(Z.commands.registerCommand("srs.navigatorRelations",()=>je(e,"relations")),Z.commands.registerCommand("srs.navigatorDocumentViews",()=>je(e,"document-views")),Z.commands.registerCommand("srs.navigatorContainers",()=>je(e,"containers")),Z.commands.registerCommand("srs.navigatorRefresh",()=>e.refresh()))}function je(t,e){t.setMode(e),Z.commands.executeCommand("setContext","srs.navigatorMode",e)}var q=h(require("vscode"));var m={slug:"2e3be0f8-0497-4754-a8b2-62ce6b05493f",title:"e5b359b0-8f8b-4807-bae9-b841adbd6248",subtitle:"9bb3d21d-3a02-4b87-863d-99fdfcdb8a3e",body:"cd97f7d2-29e4-435e-a991-9be8281d6a78",blocks:"dabb80dc-a04e-48e9-afd8-37a6410bd43b",heading:"9629c9b5-3b17-4766-b3d3-b2890902821a",callout:"138e40f4-888b-49ed-9c26-bedc9567e806",listItems:"e5e6ebce-8dfe-446f-a7fd-e329d4f5d67e",outro:"04ce57ec-46bc-4e1e-9238-34bf7247905a",itemTerm:"a02b147b-4319-4cdd-b263-781640c93fcb",itemBody:"6fafae71-f6f1-4e83-b091-19765517ff80",columns:"15d81030-07db-40a7-9885-d23b1d6b39f7",rows:"876daf6a-aefa-421c-80b5-2e3c3a4c6397",subheading:"4523e0e0-f7b6-4c72-9f30-b526ca74799e",tableLabel:"920fd0a2-5fb2-40c4-9362-7c6c86ab8ccd",widths:"8d98614d-f420-4597-90fd-c141e8584b06"},Te={guide:"8f138dd6",sectionText:"4408a98e",sectionList:"76cdc3fb",sectionTable:"d8d09d3b"};function V(t,e){let o=t.fieldValues.find(n=>n.fieldId===e);return o==null?"":typeof o.value=="string"?o.value:""}function So(t,e){let o=new Set(t.filter(r=>[...e.values()].includes(r))),n=[],i=t.find(r=>!o.has(r));for(;i&&n.length<=t.length;)n.push(i),i=e.get(i);for(let r of t)n.includes(r)||n.push(r);return n}function xo(t){let e=t.slice(0,8);if(e===Te.sectionText)return"text";if(e===Te.sectionList)return"list";if(e===Te.sectionTable)return"table";throw new Error(`Unknown section typeId prefix: ${e} (${t})`)}function Co(t){let e=xo(t.typeId),o={instanceId:t.instanceId,typeId:t.typeId,typeVersion:t.typeVersion,type:e,heading:V(t,m.heading),slug:V(t,m.slug)};if(e==="text")o.body=V(t,m.body),o.callout=V(t,m.callout);else if(e==="list")o.body=V(t,m.body),o.listItems=V(t,m.listItems),o.outro=V(t,m.outro);else if(e==="table"){o.body=V(t,m.body);let n=t.groupValues?.find(r=>r.groupId==="tables");o.tables=(n?.entries??[]).map(r=>{let s=S=>r.fieldValues.find(y=>y.fieldId===S)?.value,a=[],l=[],d;try{a=JSON.parse(String(s(m.columns)??"[]"))}catch{a=[]}try{l=JSON.parse(String(s(m.rows)??"[]"))}catch{l=[]}let c=s(m.widths);if(c)try{d=JSON.parse(String(c))}catch{}let p={columns:a,rows:l},f=s(m.subheading),v=s(m.tableLabel);return typeof f=="string"&&f&&(p.subheading=f),typeof v=="string"&&v&&(p.label=v),d&&(p.widths=d),p});let i=t.groupValues?.find(r=>r.groupId==="items");o.items=(i?.entries??[]).map(r=>{let s=r.fieldValues.find(l=>l.fieldId===m.itemTerm)?.value,a=r.fieldValues.find(l=>l.fieldId===m.itemBody)?.value;return{term:typeof s=="string"&&s?s:void 0,body:typeof a=="string"?a:""}}),o.outro=V(t,m.outro)}return o}async function ct(t,e,o){let n=await t.runOk(e,["container","get",o]),{memberInstanceIds:i,rootInstanceIds:r}=n.container,s=r[0],a=await Promise.all(i.map(y=>t.runOk(e,["record","get",y]).then(k=>k.record))),l=await t.runOk(e,["relation","list"]),d=new Map;for(let y of l.relations)y.relationType==="precedes"&&d.set(y.sourceId,y.targetId);let c=a.find(y=>y.instanceId===s);if(!c)throw new Error(`Guide record ${s} not found in container members`);let p=i.filter(y=>y!==s),f=So(p,d),v=new Map(a.map(y=>[y.instanceId,y])),S=f.map(y=>{let k=v.get(y);if(!k)throw new Error(`Section record ${y} missing`);return Co(k)});return{containerId:o,guideInstanceId:s,guideTypeId:c.typeId,guideTypeVersion:c.typeVersion,slug:V(c,m.slug),title:V(c,m.title),subtitle:V(c,m.subtitle),body:V(c,m.body),sections:S}}function lt(t){return t.filter(([,e])=>e!==void 0&&e!=="").map(([e,o])=>({fieldId:e,value:o}))}function Io(t){return{instanceId:t.guideInstanceId,typeId:t.guideTypeId,typeVersion:t.guideTypeVersion,fieldValues:lt([[m.slug,t.slug],[m.title,t.title],[m.subtitle,t.subtitle],[m.body,t.body]])}}function Po(t){let e=[[m.heading,t.heading],[m.slug,t.slug]];t.type==="text"?e.push([m.body,t.body],[m.callout,t.callout]):t.type==="list"?e.push([m.body,t.body],[m.listItems,t.listItems],[m.outro,t.outro]):t.type==="table"&&e.push([m.body,t.body],[m.outro,t.outro]);let o=lt(e),n=[];return t.type==="table"&&(t.items!==void 0&&n.push({groupId:"items",entries:t.items.map(i=>({fieldValues:[...i.term?[{fieldId:m.itemTerm,value:i.term}]:[],{fieldId:m.itemBody,value:i.body}]}))}),t.tables!==void 0&&n.push({groupId:"tables",entries:t.tables.map(i=>({fieldValues:[{fieldId:m.columns,value:JSON.stringify(i.columns??[])},{fieldId:m.rows,value:JSON.stringify(i.rows)},...i.subheading?[{fieldId:m.subheading,value:i.subheading}]:[],...i.label?[{fieldId:m.tableLabel,value:i.label}]:[],...i.widths?[{fieldId:m.widths,value:JSON.stringify(i.widths)}]:[]]}))})),{instanceId:t.instanceId,typeId:t.typeId,typeVersion:t.typeVersion,fieldValues:o,...n.length>0?{groupValues:n}:{}}}async function pt(t,e,o){let n=[{id:o.guideInstanceId,input:Io(o)},...o.sections.map(i=>({id:i.instanceId,input:Po(i)}))];for(let{id:i,input:r}of n)await t.runOk(e,["record","update",i],{stdin:JSON.stringify(r)})}function de(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function M(t){return de(t)}function Ue(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;")}var ko={text:"text",list:"list",table:"table"};function W(t,e,o,n={}){let i=n.required?' <span class="required-mark">*</span>':"",r=n.required?" required":"",s=n.rows??2,a=n.hint?`<div class="hint">${de(n.hint)}</div>`:"";return`
    <div class="field">
      <label>${de(t)}${i}</label>
      <textarea name="${M(e)}" rows="${s}"${r}>${Ue(o)}</textarea>
      ${a}
    </div>`}function De(t,e,o,n={}){let i=n.required?' <span class="required-mark">*</span>':"",r=n.required?" required":"";return`
    <div class="field">
      <label>${de(t)}${i}</label>
      <input type="text" name="${M(e)}" value="${M(o)}"${r}>
    </div>`}function Ro(t,e){return[W("Body",`s_${e}_body`,t.body??"",{required:!0,rows:5}),W("Callout",`s_${e}_callout`,t.callout??"",{rows:2})].join("")}function $o(t,e){return[W("Body",`s_${e}_body`,t.body??"",{rows:3}),W("Items",`s_${e}_listItems`,t.listItems??"",{required:!0,rows:4,hint:"One item per line"}),W("Outro",`s_${e}_outro`,t.outro??"",{rows:2})].join("")}function Eo(t,e){return`
    <div class="section-group" data-item-entry>
      <div class="section-header">
        <span style="flex:1;font-size:0.8em;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.05em">Item</span>
        <button type="button" class="btn-remove-section" title="Remove item">\u2715</button>
      </div>
      <div class="field">
        <label>Term <span style="font-weight:400;text-transform:none">(optional)</span></label>
        <input type="text" class="item-term" placeholder="e.g. Why" value="${M(t)}">
      </div>
      <div class="field">
        <label>Body</label>
        <textarea class="item-body" rows="3">${Ue(e)}</textarea>
      </div>
    </div>`}function To(t,e,o){let n=t.columns??[],i=n.length>0?n.length:t.rows.length>0?t.rows[0].length:2,r=n.length>0?`<thead><tr>${n.map(a=>`<th><input type="text" class="te-col-header" value="${M(a)}" placeholder="Header"></th>`).join("")}<th class="te-action-col"></th></tr></thead>`:"",s=(t.rows??[]).map(a=>`<tr>${a.map(l=>`<td><input type="text" class="te-cell" value="${M(l)}"></td>`).join("")}<td class="te-action-col"><button type="button" class="btn-remove-row" title="Remove row">\u2715</button></td></tr>`).join("");return`
    <div class="table-block" data-table-section="${e}" data-table-idx="${o}" data-col-count="${i}">
      <div class="table-block-meta">
        <div class="field">
          <label>Subheading <span style="font-weight:400;text-transform:none">(optional)</span></label>
          <input type="text" class="te-subheading" value="${M(t.subheading??"")}">
        </div>
        <div class="field">
          <label>Label <span style="font-weight:400;text-transform:none">(optional, shown above the table)</span></label>
          <textarea class="te-label" rows="2">${Ue(t.label??"")}</textarea>
        </div>
      </div>
      <div class="te-table-wrap">
        <table class="te-table">
          ${r}
          <tbody>${s}</tbody>
        </table>
      </div>
      <button type="button" class="btn-add-row">+ Add row</button>
    </div>`}function Do(t,e){let n=(t.tables??[]).map((a,l)=>To(a,e,l)).join(""),r=(t.items??[]).map(a=>Eo(a.term??"",a.body)).join(""),s=`
    <div class="field">
      <label>Items</label>
      <div id="items-list-${e}">${r}</div>
      <button type="button" class="btn-add-entry" data-items-section="${e}">+ Add item</button>
    </div>`;return[W("Body",`s_${e}_body`,t.body??"",{rows:3}),`<div class="field"><label>Tables</label><div class="table-blocks" id="table-blocks-${e}">${n}</div><button type="button" class="btn-add-entry btn-add-table" data-table-section="${e}">+ Add table</button></div>`,s,W("Outro",`s_${e}_outro`,t.outro??"",{rows:2})].join("")}function _o(t,e){let o=ko[t.type],n="";return t.type==="text"?n=Ro(t,e):t.type==="list"?n=$o(t,e):t.type==="table"&&(n=Do(t,e)),`
    <div class="section-block" data-section-index="${e}">
      <div class="section-block-header">
        <span class="section-type-badge">${de(o)}</span>
      </div>
      ${De("Heading",`s_${e}_heading`,t.heading,{required:!0})}
      ${De("Slug (id)",`s_${e}_slug`,t.slug)}
      ${n}
      <input type="hidden" name="s_${e}_instanceId" value="${M(t.instanceId)}">
      <input type="hidden" name="s_${e}_typeId" value="${M(t.typeId)}">
      <input type="hidden" name="s_${e}_typeVersion" value="${M(String(t.typeVersion))}">
      <input type="hidden" name="s_${e}_type" value="${M(t.type)}">
    </div>`}var Ao=`
<script>
function collectFormData() {
  var form = document.getElementById('editor-form');
  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }

  var guide = {
    containerId: val('containerId'),
    guideInstanceId: val('guideInstanceId'),
    guideTypeId: val('guideTypeId'),
    guideTypeVersion: parseInt(val('guideTypeVersion'), 10),
    slug: val('guide_slug'),
    title: val('guide_title'),
    subtitle: val('guide_subtitle'),
    body: val('guide_body'),
    sections: [],
  };

  var sectionCount = parseInt(val('sectionCount'), 10);
  for (var i = 0; i < sectionCount; i++) {
    var type = val('s_' + i + '_type');
    var section = {
      instanceId: val('s_' + i + '_instanceId'),
      typeId: val('s_' + i + '_typeId'),
      typeVersion: parseInt(val('s_' + i + '_typeVersion'), 10),
      type: type,
      heading: val('s_' + i + '_heading'),
      slug: val('s_' + i + '_slug'),
    };
    if (type === 'text') {
      section.body = val('s_' + i + '_body');
      section.callout = val('s_' + i + '_callout');
    } else if (type === 'list') {
      section.body = val('s_' + i + '_body');
      section.listItems = val('s_' + i + '_listItems');
      section.outro = val('s_' + i + '_outro');
    } else if (type === 'table') {
      section.body = val('s_' + i + '_body');
      section.outro = val('s_' + i + '_outro');
      section.tables = [];
      document.querySelectorAll('[data-table-section="' + i + '"]').forEach(function(tb) {
        var subheading = tb.querySelector('.te-subheading').value.trim();
        var label = tb.querySelector('.te-label').value.trim();
        var columns = [];
        tb.querySelectorAll('thead .te-col-header').forEach(function(inp) { columns.push(inp.value); });
        var rows = [];
        tb.querySelectorAll('tbody tr').forEach(function(tr) {
          var row = [];
          tr.querySelectorAll('.te-cell').forEach(function(inp) { row.push(inp.value); });
          rows.push(row);
        });
        var tbl = { columns: columns, rows: rows };
        if (subheading) tbl.subheading = subheading;
        if (label) tbl.label = label;
        section.tables.push(tbl);
      });
      section.items = [];
      var itemsList = document.getElementById('items-list-' + i);
      itemsList.querySelectorAll('[data-item-entry]').forEach(function(entry) {
        var body = entry.querySelector('.item-body').value.trim();
        if (!body) return;
        var term = entry.querySelector('.item-term').value.trim();
        section.items.push({ term: term || undefined, body: body });
      });
    }
    guide.sections.push(section);
  }
  return guide;
}

// Wire existing item remove buttons
document.querySelectorAll('[data-item-entry] .btn-remove-section').forEach(function(btn) {
  btn.addEventListener('click', function() { btn.closest('[data-item-entry]').remove(); });
});

// Wire item add buttons
document.querySelectorAll('.btn-add-entry[data-items-section]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var si = btn.getAttribute('data-items-section');
    var list = document.getElementById('items-list-' + si);
    var div = document.createElement('div');
    div.className = 'section-group';
    div.setAttribute('data-item-entry', '');
    div.innerHTML =
      '<div class="section-header">' +
        '<span style="flex:1;font-size:0.8em;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.05em">Item</span>' +
        '<button type="button" class="btn-remove-section" title="Remove item">\\u2715</button>' +
      '</div>' +
      '<div class="field"><label>Term <span style="font-weight:400;text-transform:none">(optional)</span></label>' +
        '<input type="text" class="item-term" placeholder="e.g. Why"></div>' +
      '<div class="field"><label>Body</label><textarea class="item-body" rows="3"></textarea></div>';
    list.appendChild(div);
    div.querySelector('.item-term').focus();
    div.querySelector('.btn-remove-section').addEventListener('click', function() { div.remove(); });
  });
});

// Table editor \u2014 event delegation handles all table buttons, including on dynamically added rows/tables
document.addEventListener('click', function(e) {
  var btn = e.target;
  if (!btn || btn.tagName !== 'BUTTON') return;
  if (btn.classList.contains('btn-remove-row')) {
    btn.closest('tr').remove();
  } else if (btn.classList.contains('btn-add-row')) {
    var addTb = btn.closest('[data-table-section]');
    var cols = addTb.querySelectorAll('thead .te-col-header').length;
    if (!cols) {
      var fr = addTb.querySelector('tbody tr');
      if (fr) cols = fr.querySelectorAll('.te-cell').length;
    }
    if (!cols) cols = 2;
    var addBody = addTb.querySelector('tbody');
    var newTr = document.createElement('tr');
    for (var c = 0; c < cols; c++) {
      var newTd = document.createElement('td');
      var newInp = document.createElement('input');
      newInp.type = 'text';
      newInp.className = 'te-cell';
      newTd.appendChild(newInp);
      newTr.appendChild(newTd);
    }
    var actTd = document.createElement('td');
    actTd.className = 'te-action-col';
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-remove-row';
    delBtn.title = 'Remove row';
    delBtn.textContent = '\\u2715';
    actTd.appendChild(delBtn);
    newTr.appendChild(actTd);
    addBody.appendChild(newTr);
    newTr.querySelector('.te-cell').focus();
  } else if (btn.classList.contains('btn-add-table')) {
    var tsi = btn.getAttribute('data-table-section');
    var tblContainer = document.getElementById('table-blocks-' + tsi);
    var newTi = tblContainer.querySelectorAll('[data-table-section]').length;
    var newBlock = document.createElement('div');
    newBlock.className = 'table-block';
    newBlock.setAttribute('data-table-section', tsi);
    newBlock.setAttribute('data-table-idx', String(newTi));
    newBlock.setAttribute('data-col-count', '2');
    newBlock.innerHTML =
      '<div class="table-block-meta">' +
        '<div class="field"><label>Subheading <span style="font-weight:400;text-transform:none">(optional)</span></label>' +
          '<input type="text" class="te-subheading"></div>' +
        '<div class="field"><label>Label <span style="font-weight:400;text-transform:none">(optional, shown above the table)</span></label>' +
          '<textarea class="te-label" rows="2"></textarea></div>' +
      '</div>' +
      '<div class="te-table-wrap"><table class="te-table">' +
        '<thead><tr>' +
          '<th><input type="text" class="te-col-header" placeholder="Header"></th>' +
          '<th><input type="text" class="te-col-header" placeholder="Header"></th>' +
          '<th class="te-action-col"></th>' +
        '</tr></thead>' +
        '<tbody><tr>' +
          '<td><input type="text" class="te-cell"></td>' +
          '<td><input type="text" class="te-cell"></td>' +
          '<td class="te-action-col"><button type="button" class="btn-remove-row" title="Remove row">\\u2715</button></td>' +
        '</tr></tbody>' +
      '</table></div>' +
      '<button type="button" class="btn-add-row">+ Add row</button>';
    tblContainer.appendChild(newBlock);
    newBlock.querySelector('.te-col-header').focus();
  }
});


</script>`,No=`
<style>
  .guide-meta { margin-bottom: 2em; }
  .guide-meta h2 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em; }
  .sections-list { display: flex; flex-direction: column; gap: 1.5em; }
  .section-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 1em;
  }
  .section-block-header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.8em;
  }
  .section-type-badge {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    padding: 1px 6px;
  }
  .sections-heading {
    font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em;
  }
  .table-blocks { display: flex; flex-direction: column; gap: 0.8em; }
  .table-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 0.8em;
  }
  .table-block-meta {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0 0.8em;
    margin-bottom: 0.6em;
  }
  .table-block-meta .field { margin-bottom: 0.6em; }
  .te-table-wrap { overflow-x: auto; margin-bottom: 0.5em; }
  .te-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .te-table th, .te-table td {
    border: 1px solid var(--vscode-panel-border);
    padding: 1px;
    vertical-align: middle;
  }
  .te-table th {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.07));
  }
  .te-table .te-col-header,
  .te-table .te-cell {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 3px 6px !important;
    outline: none !important;
    min-width: 80px;
    width: 100%;
  }
  .te-table .te-col-header { font-weight: 600; }
  .te-table .te-col-header:focus,
  .te-table .te-cell:focus {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.1)) !important;
  }
  .te-action-col {
    width: 24px;
    min-width: 24px;
    padding: 0 !important;
    text-align: center;
    border-left: none !important;
  }
  .btn-remove-row {
    background: none;
    border: none;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    padding: 2px 4px;
    opacity: 0.45;
    font-size: 0.75em;
    line-height: 1;
  }
  .btn-remove-row:hover { opacity: 1; }
  .btn-add-row {
    background: none;
    border: 1px dashed var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 3px 10px;
    border-radius: 2px;
    font-size: 0.8em;
    width: 100%;
    text-align: left;
  }
  .btn-add-row:hover {
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-foreground);
  }
</style>`;function ut(t){let e=t.sections.map((n,i)=>_o(n,i)).join(""),o=`
    ${No}
    <div class="guide-meta">
      <h2>Guide</h2>
      ${De("Title","guide_title",t.title,{required:!0})}
      ${De("Subtitle","guide_subtitle",t.subtitle)}
      ${W("Body","guide_body",t.body,{rows:4})}
    </div>
    <p class="sections-heading">Sections (${t.sections.length})</p>
    <div class="sections-list">
      ${e}
    </div>
    <input type="hidden" name="containerId" value="${M(t.containerId)}">
    <input type="hidden" name="guideInstanceId" value="${M(t.guideInstanceId)}">
    <input type="hidden" name="guideTypeId" value="${M(t.guideTypeId)}">
    <input type="hidden" name="guideTypeVersion" value="${M(String(t.guideTypeVersion))}">
    <input type="hidden" name="guide_slug" value="${M(t.slug)}">
    <input type="hidden" name="sectionCount" value="${t.sections.length}">
    ${Ao}`;return Q(t.title,o)}function mt(t,e,o,n){t.subscriptions.push(q.commands.registerCommand("srs.editGuide",()=>Mo(t,e,o,n)))}async function Mo(t,e,o,n){let i=o.active?.rootPath;if(!i){q.window.showWarningMessage("SRS: No repository selected.");return}let r;try{r=(await e.runOk(i,["container","list"])).containers.filter(l=>l.containerType==="guide")}catch(a){q.window.showErrorMessage(`SRS: Could not load containers \u2014 ${String(a)}`);return}if(r.length===0){q.window.showInformationMessage("SRS: No guide containers found in this repository.");return}let s=await q.window.showQuickPick(r.map(a=>({label:a.title,description:a.containerId,id:a.containerId})),{placeHolder:"Select a guide to edit"});s&&await q.window.withProgress({location:q.ProgressLocation.Notification,title:`Loading guide: ${s.label}`},async()=>{let a;try{a=await ct(e,i,s.id)}catch(d){q.window.showErrorMessage(`SRS: Failed to load guide \u2014 ${String(d)}`);return}let l=ut(a);U.show(t,`guide:${s.id}`,a.title,l,async d=>{await pt(e,i,d),n.refresh(),q.window.showInformationMessage(`SRS: Guide "${a.title}" saved.`)})})}var O=h(require("vscode"));var gt=h(require("crypto")),ee=h(require("path"));function vt(t){let e=ee.resolve(t),n=ee.basename(e,ee.extname(e)).replace(/[^A-Za-z0-9._-]/g,"_").slice(0,40)||"archive",i=gt.createHash("sha1").update(e).digest("hex").slice(0,12);return`${n}-${i}`}var _e=class{constructor(e,o,n){this.context=e;this.cli=o;this.repoProvider=n;this._dirty=!1;this._onDidChangeDirty=new O.EventEmitter;this.onDidChangeDirty=this._onDidChangeDirty.event;this._disposables=[this._onDidChangeDirty];this._disposables.push(n.onDidChangeActive(i=>{this._current&&i?.rootPath!==this._current.workdir&&this._teardown()}))}get isDirty(){return this._dirty}get activeArchivePath(){return this._current?.archivePath}async openArchive(e){let o=this._workdirFor(e),n=O.Uri.joinPath(this.context.globalStorageUri,"archives");await O.workspace.fs.createDirectory(n),await this._deleteIfExists(O.Uri.file(o)),await this.cli.runRawOk(["archive","unpack",e,"--target",o]);let i=await this.repoProvider.probe(o);if(!i)throw new u(`Unpacked archive at ${o} did not load as a valid SRS repository.`,["archive unpack produced an unloadable repository"],"archive unpack");this._teardown();let r=this._startWatching(o);this._current={archivePath:e,workdir:o,watcher:r},this._setDirty(!1),this.repoProvider.setActive({...i,archivePath:e})}async saveActive(){let e=this.repoProvider.active;return e?.archivePath?(await this.cli.runOk(e.rootPath,["archive","pack","--output",e.archivePath]),this._setDirty(!1),!0):(O.window.showWarningMessage("SRS: The active repository is not opened from a .srs archive. Use 'SRS: Export Repository to .srs' instead."),!1)}async exportActive(e){let o=this.repoProvider.active;if(!o)throw new u("No active SRS repository to export.",["no active repository"],"archive pack");return this.cli.runOk(o.rootPath,["archive","pack","--output",e])}_workdirFor(e){return O.Uri.joinPath(this.context.globalStorageUri,"archives",vt(e)).fsPath}_startWatching(e){let o=O.workspace.createFileSystemWatcher(new O.RelativePattern(O.Uri.file(e),"**/*")),n=()=>this._setDirty(!0);return o.onDidChange(n),o.onDidCreate(n),o.onDidDelete(n),o}_teardown(){this._current?.watcher.dispose(),this._current=void 0,this._setDirty(!1)}_setDirty(e){this._dirty!==e&&(this._dirty=e,this._onDidChangeDirty.fire())}async _deleteIfExists(e){try{await O.workspace.fs.delete(e,{recursive:!0,useTrash:!1})}catch{}}dispose(){this._current?.watcher.dispose(),this._disposables.forEach(e=>e.dispose())}};var Ne=h(require("vscode")),yt=h(require("path")),Ae=class{constructor(e,o){this.archiveManager=e;this.repoProvider=o;this._disposables=[];this._item=Ne.window.createStatusBarItem(Ne.StatusBarAlignment.Left,99),this._item.command="srs.saveArchive",this._disposables.push(this._item),this._disposables.push(e.onDidChangeDirty(()=>this._update()),o.onDidChangeActive(()=>this._update())),this._update()}_update(){let e=this.repoProvider.active?.archivePath;if(!e){this._item.hide();return}let o=yt.basename(e);this.archiveManager.isDirty?(this._item.text=`$(archive) \u25CF ${o}`,this._item.tooltip=`SRS: ${o} has unsaved changes \u2014 click to save to .srs`):(this._item.text=`$(archive) ${o}`,this._item.tooltip=`SRS: ${o} (saved) \u2014 click to re-pack to .srs`),this._item.show()}dispose(){this._disposables.forEach(e=>e.dispose())}};var C=h(require("vscode")),te=h(require("path"));function ft(t,e,o,n){t.subscriptions.push(C.commands.registerCommand("srs.openArchive",()=>Oo(o,n)),C.commands.registerCommand("srs.saveArchive",()=>Lo(n)),C.commands.registerCommand("srs.exportArchive",()=>Fo(o,n)))}async function Oo(t,e){let o=await C.window.showOpenDialog({canSelectMany:!1,openLabel:"Open SRS Archive",filters:{"SRS Archive":["srs"],"SRS Bundle (legacy)":["srsj"],"All Files":["*"]}});if(!o||o.length===0)return;let n=o[0].fsPath,i=te.basename(n),r=te.extname(n).toLowerCase()===".srsj";try{await C.window.withProgress({location:C.ProgressLocation.Window,title:`SRS: Opening ${i}\u2026`},async()=>{if(r){let s=await t.probe(n);if(!s)throw new u(`${i} did not load as a valid SRS repository.`,["repo map failed on the selected file"],"repo map");t.setActive(s)}else await e.openArchive(n)}),r&&C.window.showInformationMessage(`SRS: Opened legacy bundle ${i}. Use 'SRS: Export Repository to .srs' to save it in the .srs format.`)}catch(s){let a=s instanceof u?s.message:String(s);C.window.showErrorMessage(`SRS: Failed to open ${i}: ${a}`)}}async function Lo(t){let e=t.activeArchivePath?te.basename(t.activeArchivePath):".srs";try{await C.window.withProgress({location:C.ProgressLocation.Window,title:`SRS: Saving ${e}\u2026`},()=>t.saveActive())&&C.window.showInformationMessage(`SRS: Saved ${e}.`)}catch(o){let n=o instanceof u?o.message:String(o);C.window.showErrorMessage(`SRS: Failed to save ${e}: ${n}`)}}async function Fo(t,e){let o=t.active;if(!o){C.window.showWarningMessage("SRS: No active repository. Open or select a repository first.");return}let n=await C.window.showSaveDialog({saveLabel:"Export .srs",filters:{"SRS Archive":["srs"]},defaultUri:Vo(o.archivePath,o.title)});if(!n)return;let i=te.basename(n.fsPath);try{let r=await C.window.withProgress({location:C.ProgressLocation.Window,title:`SRS: Exporting ${i}\u2026`},()=>e.exportActive(n.fsPath));C.window.showInformationMessage(`SRS: Exported ${i} (${Bo(r.fileSizeBytes)}).`)}catch(r){let s=r instanceof u?r.message:String(r);C.window.showErrorMessage(`SRS: Failed to export ${i}: ${s}`)}}function Vo(t,e){if(t)return C.Uri.file(t);let o=e.replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"repository",n=C.workspace.workspaceFolders?.[0];return n?C.Uri.joinPath(n.uri,`${o}.srs`):C.Uri.file(`${o}.srs`)}function Bo(t){return t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}async function qo(t){let e=F.window.createOutputChannel("SRS");t.subscriptions.push(e);let o=new le(e),n=new pe(o),i=new ve(t.workspaceState,o),r=new me(o,n,i),s=new Ee(o,n),a=new ye(i),l=new he(t.extensionUri),d=new we(o,n),c=new Ce(o,n),p=new _e(t,o,n),f=new Ae(p,n);t.subscriptions.push(n,r,s,i,a,l,d,c,p,f,F.workspace.registerTextDocumentContentProvider(Be,d));let v=F.window.createTreeView("srsRepositoryTree",{treeDataProvider:r,showCollapseAll:!0});t.subscriptions.push(v);let S=F.window.createTreeView("srsNavigatorTree",{treeDataProvider:s,showCollapseAll:!0});t.subscriptions.push(S),F.commands.executeCommand("setContext","srs.navigatorMode","relations"),n.onDidChangeActive(k=>{v.title=k?`SRS: ${k.title}`:"SRS Repository",k?a.show():(a.hide(),c.clear())}),t.subscriptions.push(F.workspace.onDidSaveTextDocument(k=>{let $=n.active;!$||!F.workspace.getConfiguration("srs").get("validate.onSave",!0)||k.uri.fsPath.startsWith($.rootPath)&&c.validate()})),Je(t,o,n,r,e,d,c),it(t,o,n,i,r),rt(t,o,n,i,r),Xe(t,o,n),ot(t,o,n,r),at(t,o,n,d),dt(t,s),mt(t,o,n,r),ft(t,o,n,p),await Go(o,n);let y=n.active;y&&(await i.restore(y.rootPath),a.show())}async function Go(t,e){let n=F.workspace.getConfiguration("srs").get("repository.path",null);if(n){let r=await e.probe(n);if(r)e.setActive(r);else{let s="Open Settings";await F.window.showWarningMessage(`SRS: Configured path '${n}' is not a valid SRS repository.`,s)===s&&F.commands.executeCommand("workbench.action.openSettings","srs.repository.path")}return}let i=await e.discoverAll();i.length===1?e.setActive(i[0]):i.length>1&&F.window.showInformationMessage(`SRS: Found ${i.length} repositories in workspace. Use 'SRS: Select Repository' to choose one.`)}function jo(){}0&&(module.exports={activate,deactivate});
