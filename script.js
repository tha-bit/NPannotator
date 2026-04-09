<script>
/* ══ DEFAULT CATEGORIES — 3-level: category → subcategory → type ══ */
const DEFAULT_CATS=[
  {id:'NOUN',label:'Noun',subs:[
    {id:'NOUN-ANIM',label:'Animate',types:[]},
    {id:'NOUN-INANIM',label:'Inanimate',types:[
      {id:'NOUN-INANIM-OBJ',label:'Object'},
      {id:'NOUN-INANIM-EVT',label:'Event'}
    ]}
  ]},
  {id:'ADJ',label:'Adjective',subs:[
    {id:'ADJ-INT',label:'Intersective',types:[
      {id:'ADJ-INT-SHAPE',label:'Shape'},
      {id:'ADJ-INT-COLOR',label:'Color'},
      {id:'ADJ-INT-MAT',label:'Material'}
    ]},
    {id:'ADJ-NINT',label:'Non-intersective',types:[
      {id:'ADJ-NINT-SIZE',label:'Size'},
      {id:'ADJ-NINT-AGE',label:'Age'},
      {id:'ADJ-NINT-QUAL',label:'Qualifier'}
    ]}
  ]},
  {id:'ART',label:'Article',subs:[
    {id:'ART-DEF',label:'Definite',types:[]},
    {id:'ART-INDEF',label:'Indefinite',types:[]}
  ]},
  {id:'POSS',label:'Possessive',subs:[
    {id:'POSS-GEN',label:'Genitive',types:[]},
    {id:'POSS-PP-GEN',label:'PP-Genitive',types:[]}
  ]},
  {id:'NUM',label:'Numeral',subs:[
    {id:'NUM-ORD',label:'Ordinal',types:[]},
    {id:'NUM-CARD',label:'Cardinal',types:[]}
  ]},
  {id:'DEM',label:'Demonstrative',subs:[
    {id:'DEM-PROX',label:'Proximal',types:[]},
    {id:'DEM-DIST',label:'Distal',types:[]}
  ]},
  {id:'QUANT',label:'Quantifier',subs:[
    {id:'QUANT-EXIST',label:'Existential',types:[]},
    {id:'QUANT-UNIV',label:'Universal',types:[]}
  ]},
  {id:'RC',label:'Relative Clause',subs:[
    {id:'RC-REST',label:'Restrictive',types:[]},
    {id:'RC-NREST',label:'Non-restrictive',types:[]}
  ]},
  {id:'PP',label:'Prepositional Phrase',subs:[]}
];

/* ══ STATE ══ */
let categories=JSON.parse(JSON.stringify(DEFAULT_CATS));
let tokens=[],selectedIdx=new Set(),currentAnnotations=[],currentGlosses={},currentPhraseTranslation='';
let savedAnnotations=[];
let fileRows=[],fileHeaders=[],activeRowIdx=-1;
let colMap={data:-1,lang:-1,code:-1,context:-1,source:-1};
let session={language:'',code:''};
let phraseCounter=0;
let lexicon={},lexCounter=0;
let pendingAutoTag=null;
/* tagSuggestions: map of joined-token-string -> tagId, built from savedAnnotations */
let tagSuggestions={};
let rawContext=''; // stores the original context text, never overwritten by NP edits

/* ══════════════════════════════════════
   AUTO-SAVE  (localStorage, no external API)
══════════════════════════════════════ */
const LS_KEY='np_annotator_v1';

function autoSave(){
  if(!fileRows.length) return; // nothing to save before a session is open
  try{
    const snap={
      ts: Date.now(),
      session, fileHeaders, fileRows, colMap, categories,
      phraseCounter, lexicon: Object.values(lexicon), lexCounter,
      savedAnnotations, tagSuggestions
    };
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
    updateAutoSaveBar();
  }catch(e){
    // localStorage can throw if storage quota exceeded
    console.warn('Auto-save failed:', e.message);
  }
}

function updateAutoSaveBar(){
  const bar=document.getElementById('autosave-bar');
  if(!bar) return;
  bar.style.display='flex';
  const dot=document.getElementById('as-dot');
  dot.classList.add('saving');
  setTimeout(()=>dot.classList.remove('saving'),600);
  const d=new Date();
  document.getElementById('as-time').textContent=
    'Last saved: '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  document.getElementById('as-count').textContent=
    savedAnnotations.length+' phrase'+(savedAnnotations.length!==1?'s':'')+' · '+
    Object.keys(lexicon).length+' lexicon entries';
}

function checkStorageOnLoad(){
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(!raw) return;
    const snap=JSON.parse(raw);
    if(!snap||!snap.fileRows||!snap.fileRows.length) return;
    // Show restore banner
    const banner=document.getElementById('restore-banner');
    if(banner){
      const d=new Date(snap.ts);
      banner.querySelector('strong').textContent=
        'Saved session found — '+d.toLocaleDateString()+' '+
        d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+
        ' · '+( snap.savedAnnotations||[]).length+' phrases annotated';
      banner.classList.add('visible');
    }
  }catch(e){ console.warn('Storage check failed:', e); }
}

function restoreFromStorage(){
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(!raw) return;
    const snap=JSON.parse(raw);

    // Restore all state
    session        = snap.session        || {language:'',code:''};
    fileHeaders    = snap.fileHeaders    || [];
    fileRows       = snap.fileRows       || [];
    colMap         = snap.colMap         || {data:-1,lang:-1,code:-1,context:-1};
    categories     = snap.categories     || JSON.parse(JSON.stringify(DEFAULT_CATS));
    phraseCounter  = snap.phraseCounter  || 0;
    lexCounter     = snap.lexCounter     || 0;
    savedAnnotations = snap.savedAnnotations || [];
    tagSuggestions   = snap.tagSuggestions   || {};

    // Restore lexicon
    lexicon={};
    (snap.lexicon||[]).forEach(e=>{
      if(e.lexId&&e.wordForm){
        const k=bk(e.wordForm,e.language||'');
        lexicon[k]={...e,senses:(e.senses||[]).map(s=>({...s,phraseIds:s.phraseIds||[]}))};
      }
    });

    // Hide restore banner, boot into annotate view
    dismissRestoreBanner();
    _activateSession();
    document.getElementById('autosave-bar').style.display='flex';
    updateAutoSaveBar();
  }catch(e){
    alert('Could not restore session: '+e.message);
  }
}

function dismissRestoreBanner(){
  const b=document.getElementById('restore-banner');
  if(b) b.classList.remove('visible');
}

/* Shared boot logic used by both startSession and restoreFromStorage */
function _activateSession(){
  document.getElementById('sh-lang').textContent = session.language;
  document.getElementById('sh-code').textContent = session.code;
  document.getElementById('sh-col').textContent  =
    (colMap.context>=0 && fileHeaders[colMap.context]) ? fileHeaders[colMap.context] : '—';
  document.getElementById('session-strip').classList.add('visible');
  document.getElementById('setup-screen').style.display='none';
  ['annotate','data','lexicon','categories'].forEach(id=>
    document.getElementById('nav-'+id).disabled=false
  );
  renderRowList();
  switchTab('annotate');
}

function clearStorage(){
  const count=(savedAnnotations||[]).length;
  const msg=count>0
    ? `This will permanently delete all ${count} saved phrase${count!==1?'s':''} and the lexicon from this browser.\n\nPlease make sure you have exported your data first.\n\nContinue?`
    : 'Clear saved data from browser storage and start fresh?';
  if(!confirm(msg)) return;
  try{ localStorage.removeItem(LS_KEY); }catch(e){}
  location.reload();
}

/* ══ LEXICON (gloss-only, no wordClass) ══ */
function bk(w,l){return(l||'').toLowerCase()+'::'+w.toLowerCase();}
function getLexBase(w,l){
  // Try exact language match first, then fall back to any entry for this word form
  const exact=lexicon[bk(w,l)];
  if(exact) return exact;
  // Fallback: find any entry whose wordForm matches (case-insensitive)
  const wLow=w.toLowerCase();
  return Object.values(lexicon).find(e=>e.wordForm.toLowerCase()===wLow)||null;
}
function ensureLexBase(w,l){
  const k=bk(w,l);
  if(!lexicon[k]){lexCounter++;lexicon[k]={lexId:'LEX-'+String(lexCounter).padStart(4,'0'),wordForm:w,language:l||'',senses:[]};}
  return lexicon[k];
}
function ensureSense(base,gloss,phraseId){
  let s=base.senses.find(x=>x.gloss===gloss);
  if(!s){const n=base.senses.length+1;s={senseId:base.lexId+'-S'+n,gloss:gloss||'',phraseIds:[]};base.senses.push(s);}
  if(phraseId&&!s.phraseIds.includes(phraseId))s.phraseIds.push(phraseId);
  return s;
}

/* ══ TAG SUGGESTIONS (from Data section) ══ */
function rebuildTagSuggestions(){
  tagSuggestions={};
  savedAnnotations.forEach(s=>{
    s.annotations.forEach(a=>{
      // Key: sorted word forms joined, so order-independent
      const key=a.tokens.toLowerCase();
      if(!tagSuggestions[key])tagSuggestions[key]=[];
      if(!tagSuggestions[key].includes(a.tag))tagSuggestions[key].push(a.tag);
    });
  });
}

function getTagSuggestion(indices){
  if(!indices||!indices.length)return[];
  const words=indices.map(i=>tokens[i].word).join(' ').toLowerCase();
  return tagSuggestions[words]||[];
}

/* ══ TAG HELPERS ══ */
function splitTag(id){
  for(const c of categories){
    if(id===c.id) return{category:c.label,subcategory:'',type:''};
    for(const s of c.subs||[]){
      if(id===s.id) return{category:c.label,subcategory:s.label,type:''};
      for(const t of s.types||[])
        if(id===t.id) return{category:c.label,subcategory:s.label,type:t.label};
    }
  }
  const p=id.split('-');return{category:p[0],subcategory:p.slice(1,-1).join('-'),type:p[p.length-1]};
}
function tagLabel(id){
  for(const c of categories){
    if(id===c.id) return c.label;
    for(const s of c.subs||[]){
      if(id===s.id) return s.label;
      for(const t of s.types||[]) if(id===t.id) return t.label;
    }
  }
  return id;
}

/* ══ SETUP ══ */
function handleFile(e){
  const f=e.target.files[0];if(!f)return;
  const ext=f.name.split('.').pop().toLowerCase();
  if(ext==='csv'){const r=new FileReader();r.onload=ev=>initFile(parseCSV(ev.target.result),f.name);r.readAsText(f,'UTF-8');}
  else{const r=new FileReader();r.onload=ev=>{const wb=XLSX.read(ev.target.result,{type:'binary',codepage:65001});const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}).map(r=>r.map(c=>String(c==null?'':c)));initFile(raw,f.name);};r.readAsBinaryString(f);}
}
function parseCSV(text){
  return text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(line=>{
    const cells=[];let cur='';let q=false;
    for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){cells.push(cur);cur='';}else cur+=ch;}
    cells.push(cur);return cells.map(c=>c.trim());
  });
}
function initFile(raw,name){
  raw=raw.filter(r=>r.some(c=>String(c).trim()));
  if(!raw.length){alert('File appears empty.');return;}
  // Detect if first row looks like headers (all non-numeric, no blank)
  const firstRow=raw[0];
  const looksLikeHeader=firstRow.every(c=>isNaN(Number(c))&&String(c).trim().length>0);
  if(looksLikeHeader){
    fileHeaders=firstRow.map((h,i)=>String(h).trim()||`Column ${i+1}`);
    fileRows=raw.slice(1);
  } else {
    // No header row — generate column names, all rows are data
    fileHeaders=firstRow.map((_,i)=>`Column ${i+1}`);
    fileRows=raw;
  }
  document.getElementById('file-note').style.display='';
  document.getElementById('file-note').textContent=`✓  "${name}" — ${fileRows.length} rows · ${fileHeaders.length} columns`;
  // Show the header toggle so user can override detection
  const toggle=document.getElementById('header-toggle-wrap');
  if(toggle){
    toggle.style.display='';
    document.getElementById('has-header-cb').checked=looksLikeHeader;
    document.getElementById('header-toggle-wrap').querySelector('span').textContent=
      looksLikeHeader?'First row treated as header (auto-detected)':'First row treated as data (no headers detected)';
  }
  document.getElementById('sn-1').classList.add('done');
  populateColSelects();renderColTable();unlockStep('sc-2');validateSetup();
}

function toggleHeaderRow(){
  const cb=document.getElementById('has-header-cb');
  const allRaw=[...(cb.checked?[fileHeaders,...fileRows]:[fileHeaders,...fileRows])];
  // Re-read raw from last loaded file — reconstruct from current state
  const raw=[fileHeaders,...fileRows];
  if(cb.checked){
    // treat first data row as header
    fileHeaders=raw[0].map((h,i)=>String(h).trim()||`Column ${i+1}`);
    fileRows=raw.slice(1);
  } else {
    fileHeaders=raw[0].map((_,i)=>`Column ${i+1}`);
    fileRows=raw;
  }
  document.getElementById('has-header-cb').closest('span').nextElementSibling&&null;
  document.getElementById('header-toggle-wrap').querySelector('span').textContent=
    cb.checked?'First row treated as header':'First row treated as data';
  document.getElementById('file-note').textContent=
    document.getElementById('file-note').textContent.replace(/\d+ rows/,fileRows.length+' rows');
  populateColSelects();renderColTable();validateSetup();
}
function importLexicon(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{try{const data=JSON.parse(ev.target.result);let count=0;const entries=Array.isArray(data)?data:Object.values(data);entries.forEach(entry=>{if(entry.lexId&&entry.wordForm){const k=bk(entry.wordForm,entry.language||'');lexicon[k]={...entry,senses:(entry.senses||[]).map(s=>({...s,phraseIds:s.phraseIds||[]}))};const n=parseInt((entry.lexId||'').replace('LEX-',''));if(!isNaN(n)&&n>lexCounter)lexCounter=n;count++;}});document.getElementById('lex-import-note').style.display='';document.getElementById('lex-import-note').textContent=`✓ ${count} entries imported`;}catch{alert('Invalid lexicon JSON.');}};
  r.readAsText(f,'UTF-8');
}


function populateColSelects(){
  ['data','code','context'].forEach(role=>{
    const sel=document.getElementById('sel-'+role);if(!sel)return;
    sel.innerHTML='<option value="">— select —</option>';
    fileHeaders.forEach((h,i)=>{const o=document.createElement('option');o.value=i;o.textContent=h;sel.appendChild(o);});
    const g=autoGuess(role);if(g>=0)sel.value=g;
  });syncColMap();
}
function autoGuess(r){
  const p={
    data:[/\bnp\b/i,/noun.?phrase/i,/phrase/i,/\bdata\b/i],
    code:[/\bcode\b/i,/corpus/i,/dataset/i],
    context:[/context/i,/sentence/i,/\bsent\b/i,/full/i,/example/i,/text/i]
  };
  for(const pat of(p[r]||[])){const i=fileHeaders.findIndex(h=>pat.test(h));if(i>=0)return i;}
  return -1;
}
function syncColMap(){
  colMap.data   = parseInt(document.getElementById('sel-data'   )?.value)||  -1;
  colMap.code   = parseInt(document.getElementById('sel-code'   )?.value)||  -1;
  colMap.context= parseInt(document.getElementById('sel-context')?.value)||  -1;
  colMap.source = -1; // source is now a typed text field, not a column
  colMap.lang   = -1;
}
function onColMapChange(){syncColMap();renderColTable();if(colMap.context>=0){document.getElementById('sn-2').classList.add('done');}validateSetup();}
function renderColTable(){
  const ro={};Object.entries(colMap).forEach(([r,i])=>{if(i>=0)ro[i]=r;});
  const prev=fileRows.slice(0,5);let h='<table class="col-table"><thead><tr>';
  fileHeaders.forEach((col,i)=>{const r=ro[i]||'';h+=`<th class="${r?'role-'+r:''}">${col}${r?` <span style="font-size:9px;opacity:.7">[${r}]</span>`:''}</th>`;});
  h+='</tr></thead><tbody>';
  prev.forEach(row=>{h+='<tr>';fileHeaders.forEach((_,i)=>{const r=ro[i]||'';h+=`<td class="${r?'role-'+r:''}">${row[i]||''}</td>`;});h+='</tr>';});
  h+='</tbody></table>';
  document.getElementById('col-table-wrap').innerHTML=h;
  const clrs={data:'var(--accent)',code:'var(--amber)',context:'var(--purple)',source:'var(--teal)'};
  document.getElementById('col-legend').innerHTML=Object.entries(colMap)
    .filter(([r,i])=>i>=0&&r!=='lang')
    .map(([r,i])=>`<div class="legend-item"><span class="badge-dot" style="background:${clrs[r]||'var(--ink-4)'};width:8px;height:8px;border-radius:50%;flex-shrink:0"></span><span style="color:${clrs[r]||'var(--ink-2)'};font-weight:600">${r}</span><span style="color:var(--ink-3)"> → ${fileHeaders[i]}</span></div>`).join('');
}
function unlockStep(id){document.getElementById(id).classList.remove('locked');}
function onLangChange(){const v=document.getElementById('langSelect').value;document.getElementById('langCustom').style.display=v==='__other__'?'':'none';validateSetup();}
function validateSetup(){
  const hf=fileRows.length>0;
  const hCtx=colMap.context>=0;
  const hData=colMap.data>=0;
  const hColCode=colMap.code>=0;
  const lv=document.getElementById('langSelect').value,lc=document.getElementById('langCustom').value.trim();
  const hl=(lv&&lv!=='__other__')||(lv==='__other__'&&lc.length>0);
  const hSrc=(document.getElementById('sourceNameInput')?.value||'').trim().length>0;
  const hDsCode=document.getElementById('codeInput').value.trim().length>0;
  const ok=hf&&hCtx&&hData&&hColCode&&hl&&hSrc&&hDsCode;
  document.getElementById('start-btn').disabled=!ok;
  const m=[];
  if(!hCtx)    m.push('select context column');
  if(!hData)   m.push('select data column');
  if(!hColCode)m.push('select data code column');
  if(!hl)      m.push('select language');
  if(!hSrc)    m.push('enter source name');
  if(!hDsCode) m.push('enter dataset code');
  document.getElementById('setup-msg').textContent=ok?'':'Still needed: '+m.join(' · ')+'.';
  if(ok) document.getElementById('sn-2').classList.add('done');
}
function startSession(){
  const lv=document.getElementById('langSelect').value;
  session.language=lv==='__other__'?document.getElementById('langCustom').value.trim():lv;
  session.code=document.getElementById('codeInput').value.trim();
  session.sourceName=document.getElementById('sourceNameInput').value.trim();
  _activateSession();
  autoSave();
}
function goHome(){
  if(savedAnnotations.length>0){
    if(!confirm('Go back to the main setup screen? Your annotated data is auto-saved and will be restored next time.'))return;
  }
  // Show setup, hide annotate view, keep all state intact
  document.getElementById('setup-screen').style.display='';
  document.getElementById('session-strip').classList.remove('visible');
  ['annotate','data','lexicon','categories'].forEach(id=>{
    document.getElementById('nav-'+id).disabled=true;
    const p=document.getElementById('tab-'+id);
    p.style.display='none';p.classList.remove('active');
  });
  document.getElementById('nav-annotate').classList.add('active');
}
function resetSession(){
  if(!confirm('Start a new session? Your current auto-saved data will remain in storage until you clear it.'))return;
  location.reload();
}

/* ══ TABS ══ */
function switchTab(t){
  ['annotate','data','lexicon','categories'].forEach(id=>{
    const p=document.getElementById('tab-'+id);const show=id===t;
    p.style.display=show?'flex':'none';p.classList.toggle('active',show);
    document.getElementById('nav-'+id).classList.toggle('active',show);
  });
  if(t==='data')renderSaved();if(t==='lexicon')renderLexicon();if(t==='categories')renderCatManager();
}

/* ══ ROW LIST ══ */
function gv(row,col,fb){if(col>=0&&row[col]!==undefined)return String(row[col]).trim();return fb;}
function renderRowList(){
  document.getElementById('row-list').innerHTML=fileRows.map((row,i)=>{
    const ctx=gv(row,colMap.context,'');const done=savedAnnotations.some(a=>a.rowIndex===i);
    return`<div class="row-item${done?' done':''}" onclick="selectRow(${i})" id="ri-${i}"><span class="row-num">${i+1}</span><span class="row-text">${ctx||'<em style="color:var(--ink-4)">—</em>'}</span>${done?'<span class="done-badge">done</span>':''}</div>`;
  }).join('');updateProgress();
}
function updateProgress(){
  const total=fileRows.length,done=fileRows.filter((_,i)=>savedAnnotations.some(a=>a.rowIndex===i)).length;
  const pct=total?Math.round(done/total*100):0;
  document.getElementById('prog-fill').style.width=pct+'%';
  document.getElementById('prog-label').textContent=`${done} / ${total} annotated (${pct}%)`;
  document.getElementById('file-status').textContent=`${total} rows`;
}
function selectRow(i){
  activeRowIdx=i;document.querySelectorAll('.row-item').forEach((el,idx)=>el.classList.toggle('active',idx===i));
  const row=fileRows[i];
  const ctx=gv(row,colMap.context,'');
  const np=gv(row,colMap.data,'');
  loadPhrase(np,ctx);
}

/* ══ PHRASE ══ */
function rowLang(){return session.language||'';}

function highlightNP(ctx, np){
  if(!np||!ctx) return escHtml(ctx);
  // Strip trailing/leading punctuation from each NP token for a flexible match
  const stripped=np.trim().replace(/[.,!?;:'"()\[\]{}«»]+$/,'').replace(/^[.,!?;:'"()\[\]{}«»]+/,'');
  if(!stripped) return escHtml(ctx);
  const escaped=stripped.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Case-insensitive, punctuation-tolerant: match the NP followed by optional punctuation
  const re=new RegExp('('+escaped+'[.,!?;:\'")\\]]*)', 'gi');
  if(!re.test(ctx)) return escHtml(ctx); // no match — return safely escaped plain text
  return escHtml(ctx).replace(new RegExp('('+escaped.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[.,!?;:\'"\\]\\)]*)', 'gi'),
    '<mark style="background:var(--purple-light);color:var(--purple);border-radius:3px;padding:0 3px;font-weight:600">$1</mark>');
}
function escHtml(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function loadPhrase(npText,ctx){
  // Store raw context — never touch this again
  rawContext=ctx||'';
  const ctxBox=document.getElementById('context-box');
  const ctxEl=document.getElementById('context-text');
  if(rawContext){
    ctxEl.innerHTML=highlightNP(rawContext,npText);
    ctxBox.style.display='';
  } else {
    ctxBox.style.display='none';
  }
  // Set editable NP
  document.getElementById('np-edit-area').style.display='';
  document.getElementById('np-edit-input').value=npText;
  // Tokenise
  tokeniseFromInput(npText);
}

function reloadTokens(){
  const val=document.getElementById('np-edit-input').value.trim();
  // Re-highlight in context using stored raw text — NP edit never changes context
  if(rawContext){
    document.getElementById('context-text').innerHTML=highlightNP(rawContext,val);
  }
  tokeniseFromInput(val);
}

function tokeniseFromInput(text){
  tokens=text.split(/\s+/).filter(Boolean).map((w,i)=>({id:i,word:w}));
  selectedIdx=new Set();currentAnnotations=[];currentGlosses={};currentPhraseTranslation='';
  pendingAutoTag=null;dismissBanner();hideValidation();
  const lang=rowLang();
  // Pre-fill glosses from lexicon
  tokens.forEach(t=>{const base=getLexBase(t.word,lang);if(base&&base.senses.length>0)currentGlosses[t.id]=base.senses[0].gloss;});
  renderPhrase();renderGlossPanel();renderTagOrderStrip();renderTagPickerIdle();updateStatusHint();
}

function renderPhrase(){
  const el=document.getElementById('phrase-stage');
  if(!tokens.length){el.innerHTML='<span class="empty-stage">No tokens — edit and click Reload.</span>';return;}
  const lang=rowLang();
  el.innerHTML=tokens.map(t=>{
    const anno=currentAnnotations.find(a=>a.indices.includes(t.id));
    const sel=selectedIdx.has(t.id);
    const base=getLexBase(t.word,lang);
    const hasSense=base&&base.senses.length>0;
    const cls='word-chip'+(sel?' selected':anno?' tagged':'')+(hasSense?' has-sense':'');
    return`<div class="${cls}" onclick="toggleToken(${t.id})">
      <div class="token">${t.word}</div>
      ${anno?`<div class="tag-lbl">${anno.tag}</div>`:''}
      ${base?`<div class="lex-code">${base.lexId}</div>`:''}
      ${anno?`<div class="ord-num">${anno.order}</div>`:''}
      <div class="sense-dot"></div>
    </div>`;
  }).join('');
}

/* Grammatical gloss feature sets */
const GRAM_GLOSSES=[
  {group:'Plurality', items:['PL','SG']},
  {group:'Gender',    items:['FEM','MASC','NEUT']},
  {group:'Person',    items:['1SG','2SG','3SG','1PL','2PL','3PL']},
  {group:'Case',      items:['GEN','POSS','LOC','REL']}
];

function appendGramGloss(tid, gram){
  const inp=document.getElementById('gi-'+tid);if(!inp)return;
  const cur=inp.value.trim();
  inp.value=cur?(cur+'.'+gram):gram;
  currentGlosses[tid]=inp.value;
}

function renderGlossPanel(){
  const panel=document.getElementById('gloss-panel');
  if(!tokens.length){panel.innerHTML='<div style="color:var(--ink-4);font-size:13px;font-style:italic">Load a phrase to add glosses.</div>';return;}
  const lang=rowLang();

  // Build grammatical chip palette (shared, shown once above token rows)
  let chipPalette=`<div class="gram-palette">`;
  GRAM_GLOSSES.forEach(grp=>{
    chipPalette+=`<div class="gram-group"><span class="gram-group-label">${grp.group}</span>`;
    grp.items.forEach(item=>{
      chipPalette+=`<button class="gram-chip" onclick="appendGramGlossActive('${item}')" title="Append .${item} to selected token gloss">${item}</button>`;
    });
    chipPalette+=`</div>`;
  });
  chipPalette+=`</div>`;

  let html=`<div class="gloss-panel-label">Token glosses</div>
    ${chipPalette}
    <div class="gram-hint">Click a chip to append to the focused gloss field, or type freely.</div>
    <div class="gloss-tokens">`;

  tokens.forEach(t=>{
    const val=(currentGlosses[t.id]||'').replace(/"/g,'&quot;');
    const base=getLexBase(t.word,lang);
    const sc=base?base.senses.length:0;
    const hint=sc>1?`${sc} senses`:sc===1?'from lexicon':'';
    html+=`<div class="gloss-row-item">
      <span class="gloss-word" title="${t.word}">${t.word}</span>
      <input class="gloss-input" id="gi-${t.id}" type="text" value="${val}" placeholder="gloss…"
             oninput="setGloss(${t.id},this.value)"
             onfocus="activeGlossToken=${t.id}"
             title="English or grammatical gloss for '${t.word}'">
      <span class="gloss-suggest">${hint}</span>
    </div>`;
  });

  html+=`</div><div class="phrase-trans-row">
    <span class="phrase-trans-label">Translation</span>
    <input class="phrase-trans-input" id="phrase-trans" type="text" placeholder="Type the translation…" value="${currentPhraseTranslation.replace(/"/g,'&quot;')}">
  </div>`;
  panel.innerHTML=html;
}

let activeGlossToken=null; // tracks which gloss input is focused for chip clicks

function setGloss(tid,val){currentGlosses[tid]=val;}

function appendGramGlossActive(gram){
  // Use the focused token; fall back to the last token if none focused
  const tid = activeGlossToken!==null ? activeGlossToken
    : (tokens.length ? tokens[tokens.length-1].id : null);
  if(tid===null) return;
  const inp=document.getElementById('gi-'+tid);
  if(!inp) return;
  const cur=inp.value.trim();
  inp.value=cur ? cur+'.'+gram : gram;
  currentGlosses[tid]=inp.value;
  inp.focus();
}

function toggleToken(id){
  selectedIdx.has(id)?selectedIdx.delete(id):selectedIdx.add(id);
  renderPhrase();updateStatusHint();checkAutoTag();renderTagPickerActive();
}
function updateStatusHint(){/* status shown via tag picker */}
function clearSelection(){selectedIdx=new Set();renderPhrase();dismissBanner();renderTagPickerIdle();}
function clearAll(){selectedIdx=new Set();currentAnnotations=[];renderPhrase();renderTagOrderStrip();dismissBanner();hideValidation();renderTagPickerIdle();}

/* ══ TAG PICKER (three-step: category → subcategory → type) ══ */
let tagPickerCat=null;
let tagPickerSub=null;

function renderTagPickerIdle(){
  tagPickerCat=null;tagPickerSub=null;
  document.getElementById('tag-picker').innerHTML='<div class="tag-picker-hint">Select token(s) to tag.</div>';
}
function renderTagPickerActive(){
  if(!selectedIdx.size){renderTagPickerIdle();return;}
  tagPickerCat=null;tagPickerSub=null;
  const indices=[...selectedIdx].sort((a,b)=>a-b);
  const sugs=getTagSuggestion(indices);
  const sugCatIds=new Set(sugs.map(t=>t.split('-')[0]));
  let html=`<div class="tag-step-label">Step 1 — Category</div><div class="tag-btn-grid">`;
  categories.forEach(cat=>{
    const isSug=sugCatIds.has(cat.id);
    html+=`<button class="tag-main-btn${isSug?' suggested':''}" onclick="selectCat('${cat.id}')">${cat.label}${isSug?' ●':''}</button>`;
  });
  html+=`</div>`;
  document.getElementById('tag-picker').innerHTML=html;
}

function selectCat(catId){
  tagPickerCat=catId;tagPickerSub=null;
  const cat=categories.find(c=>c.id===catId);if(!cat)return;
  if(!cat.subs||!cat.subs.length){applyTag(cat.id);renderTagPickerIdle();return;}
  const indices=[...selectedIdx].sort((a,b)=>a-b);
  const sugs=getTagSuggestion(indices);
  const sugSubIds=new Set(sugs.map(t=>{const p=t.split('-');return p.slice(0,2).join('-');}));
  let html=`<button class="tag-back-btn" onclick="renderTagPickerActive()">← Back</button>
    <div class="tag-step-label">Step 2 — Subcategory <em style="font-style:normal;font-weight:400;color:var(--ink-3)">(${cat.label})</em></div>
    <div class="tag-btn-grid">`;
  cat.subs.forEach(sub=>{
    const isSug=sugSubIds.has(sub.id)||sugs.includes(sub.id);
    html+=`<button class="tag-main-btn${isSug?' suggested':''}" onclick="selectSub('${catId}','${sub.id}')">${sub.label}${isSug?' ●':''}</button>`;
  });
  html+=`</div>`;
  document.getElementById('tag-picker').innerHTML=html;
}

function selectSub(catId,subId){
  tagPickerSub=subId;
  const cat=categories.find(c=>c.id===catId);if(!cat)return;
  const sub=(cat.subs||[]).find(s=>s.id===subId);if(!sub)return;
  if(!sub.types||!sub.types.length){applyTag(sub.id);renderTagPickerIdle();return;}
  const indices=[...selectedIdx].sort((a,b)=>a-b);
  const sugs=new Set(getTagSuggestion(indices));
  let html=`<button class="tag-back-btn" onclick="selectCat('${catId}')">← Back</button>
    <div class="tag-step-label">Step 3 — Type <em style="font-style:normal;font-weight:400;color:var(--ink-3)">(${sub.label})</em></div>
    <div class="tag-btn-grid">`;
  sub.types.forEach(typ=>{
    const isSug=sugs.has(typ.id);
    html+=`<button class="tag-sub-btn${isSug?' suggested':''}" onclick="applyTag('${typ.id}');renderTagPickerIdle()">${typ.label}${isSug?' ●':''}</button>`;
  });
  html+=`</div>`;
  document.getElementById('tag-picker').innerHTML=html;
}

/* ══ AUTO-TAG (from Data, exact phrase match) ══ */
function checkAutoTag(){
  dismissBanner();if(!selectedIdx.size)return;
  const indices=[...selectedIdx].sort((a,b)=>a-b);
  const sugs=getTagSuggestion(indices);
  if(!sugs.length)return;
  const words=indices.map(i=>tokens[i].word).join(' ');
  if(sugs.length===1){
    pendingAutoTag={indices,tagId:sugs[0]};
    document.getElementById('banner-text').innerHTML=
      `"<strong>${words}</strong>" → <span class="banner-tag">${sugs[0]}</span> (${tagLabel(sugs[0])}) — previously tagged`;
    document.getElementById('autotag-banner').classList.add('visible');
  } else {
    // Multiple suggestions: show each on its own row
    pendingAutoTag=null;
    const rows=sugs.map(t=>
      `<div style="display:flex;align-items:center;gap:6px;padding:3px 0">
        <span class="banner-tag">${t}</span>
        <span style="font-size:12px;color:var(--amber)">${tagLabel(t)}</span>
        <button class="btn btn-sm btn-amber" style="padding:2px 10px;font-size:11px;margin-left:auto"
          onclick="applyTag('${t}');dismissBanner();renderTagPickerIdle()">✓ Confirm</button>
      </div>`
    ).join('');
    document.getElementById('banner-text').innerHTML=
      `<div style="display:flex;flex-direction:column;gap:2px;width:100%">
        <div style="font-size:12px;color:var(--amber);margin-bottom:4px">
          "<strong>${words}</strong>" — ${sugs.length} previous tags:
        </div>
        ${rows}
      </div>`;
    document.getElementById('autotag-banner').classList.add('visible');
  }
}
function confirmAutoTag(){if(!pendingAutoTag)return;applyTag(pendingAutoTag.tagId);dismissBanner();renderTagPickerIdle();}
function dismissBanner(){pendingAutoTag=null;document.getElementById('autotag-banner').classList.remove('visible');}

/* ══ TAGGING ══ */
function applyTag(tagId){
  if(!selectedIdx.size){alert('Select one or more tokens first.');return;}
  dismissBanner();hideValidation();
  const indices=[...selectedIdx].sort((a,b)=>a-b);
  const lang=rowLang();
  const multiSense=indices.filter(i=>{const b=getLexBase(tokens[i].word,lang);return b&&b.senses.length>1;});
  if(multiSense.length>0)showSenseModal(multiSense[0],tagId,indices);
  else applyTagInternal(indices,tagId);
}

function applyTagInternal(indices,tagId){
  const words=indices.map(i=>tokens[i].word).join(' ');
  currentAnnotations=currentAnnotations.filter(a=>!a.indices.some(i=>indices.includes(i)));
  currentAnnotations.push({indices,words,tag:tagId,order:Math.min(...indices)+1});
  recomputeOrders();
  selectedIdx=new Set();renderPhrase();renderTagOrderStrip();renderTagPickerIdle();
}
function recomputeOrders(){[...currentAnnotations].sort((a,b)=>Math.min(...a.indices)-Math.min(...b.indices)).forEach((a,i)=>a.order=i+1);}
function deleteAnno(si){const sorted=[...currentAnnotations].sort((a,b)=>a.order-b.order);currentAnnotations=currentAnnotations.filter(a=>a!==sorted[si]);recomputeOrders();renderPhrase();renderTagOrderStrip();}
function renderTagOrderStrip(){
  const strip=document.getElementById('tag-order-strip');
  const section=document.getElementById('ordering-section');
  const sorted=[...currentAnnotations].sort((a,b)=>a.order-b.order);
  if(!sorted.length){
    if(section)section.style.display='none';
    strip.innerHTML='';
    return;
  }
  if(section)section.style.display='';
  strip.innerHTML=sorted.map((a,i)=>`<span style="font-weight:600">${a.tag}</span>${i<sorted.length-1?'<span class="ord-arrow">→</span>':''}`).join('');
}

/* ══ SENSE MODAL ══ */
let modalCtx={tokenIdx:null,tagId:null,indices:null,selectedSense:null};
function showSenseModal(tokenIdx,tagId,indices){
  const lang=rowLang();const base=getLexBase(tokens[tokenIdx].word,lang);
  modalCtx={tokenIdx,tagId,indices,selectedSense:null};
  document.getElementById('modal-word').textContent=tokens[tokenIdx].word;
  const curGloss=currentGlosses[tokens[tokenIdx].id]||'';
  let html='';
  base.senses.forEach((s,si)=>{
    html+=`<div class="sense-option" onclick="selectModalSense(${si})" id="mso-${si}">
      <span class="sense-option-code">${s.senseId}</span>
      <div class="sense-option-body"><em style="color:var(--ink-3)">${s.gloss||'(no gloss)'}</em>
        <div style="font-size:11px;color:var(--ink-4);margin-top:2px">${s.phraseIds.length>0?'Phrases: '+s.phraseIds.slice(0,4).join(', ')+(s.phraseIds.length>4?'…':''):'Not used yet'}</div>
      </div></div>`;
  });
  html+=`<div class="new-sense-form"><div class="new-sense-label">Create new sense</div>
    <input type="text" id="modal-new-gloss" placeholder="Gloss (English)" value="${curGloss.replace(/"/g,'&quot;')}" style="margin-bottom:4px">
    <button class="btn btn-sm btn-primary" onclick="selectNewSense()" style="align-self:flex-start">Use new sense</button>
  </div>`;
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('sense-modal').classList.add('visible');
}
function selectModalSense(si){document.querySelectorAll('.sense-option').forEach((el,i)=>el.classList.toggle('selected',i===si));const lang=rowLang();const base=getLexBase(tokens[modalCtx.tokenIdx].word,lang);modalCtx.selectedSense=base.senses[si];}
function selectNewSense(){const g=document.getElementById('modal-new-gloss').value.trim();const lang=rowLang();const base=ensureLexBase(tokens[modalCtx.tokenIdx].word,lang);const n=base.senses.length+1;const ns={senseId:base.lexId+'-S'+n,gloss:g,phraseIds:[]};base.senses.push(ns);modalCtx.selectedSense=ns;currentGlosses[tokens[modalCtx.tokenIdx].id]=g;closeModal();applyTagInternal(modalCtx.indices,modalCtx.tagId);}
function confirmSense(){if(!modalCtx.selectedSense){alert('Select a sense first.');return;}currentGlosses[tokens[modalCtx.tokenIdx].id]=modalCtx.selectedSense.gloss||'';closeModal();applyTagInternal(modalCtx.indices,modalCtx.tagId);}
function closeModal(){document.getElementById('sense-modal').classList.remove('visible');renderGlossPanel();}

/* ══ VALIDATION ══ */
function validatePhrase(){
  const errors=[];
  // Sync gloss inputs
  tokens.forEach(t=>{const el=document.getElementById('gi-'+t.id);if(el)currentGlosses[t.id]=el.value;});
  const ptEl=document.getElementById('phrase-trans');currentPhraseTranslation=ptEl?ptEl.value.trim():'';
  // 1. Untagged
  const untagged=tokens.filter(t=>!currentAnnotations.some(a=>a.indices.includes(t.id)));
  if(untagged.length)errors.push(`Untagged: ${untagged.map(t=>'"'+t.word+'"').join(', ')}`);
  // 2. Missing glosses
  const unglossed=tokens.filter(t=>!(currentGlosses[t.id]||'').trim());
  if(unglossed.length)errors.push(`Missing gloss: ${unglossed.map(t=>'"'+t.word+'"').join(', ')}`);
  // 3. Missing translation
  if(!currentPhraseTranslation)errors.push('Phrase translation is required.');
  return errors;
}
function showValidation(errors){
  document.getElementById('val-items').innerHTML=errors.map(e=>`<div class="val-item">• ${e}</div>`).join('');
  document.getElementById('val-banner').classList.add('visible','error');
  // Flash untagged
  renderPhrase(); // re-render applies warn class
  tokens.forEach(t=>{const inp=document.getElementById('gi-'+t.id);if(inp)inp.classList.toggle('missing',!(currentGlosses[t.id]||'').trim());});
  const ptEl=document.getElementById('phrase-trans');if(ptEl)ptEl.classList.toggle('missing',!currentPhraseTranslation);
  // Re-render phrase with warn highlights
  const el=document.getElementById('phrase-stage');
  el.querySelectorAll('.word-chip').forEach((chip,i)=>{
    if(!tokens[i])return;
    const tagged=currentAnnotations.some(a=>a.indices.includes(tokens[i].id));
    chip.classList.toggle('untagged-warn',!tagged);
  });
}
function hideValidation(){document.getElementById('val-banner').classList.remove('visible','error');}

/* ══ COMMIT ══ */
function commitPhrase(){
  if(!currentAnnotations.length){alert('Add at least one annotation first.');return;}
  const errors=validatePhrase();if(errors.length){showValidation(errors);return;}
  hideValidation();

  phraseCounter++;
  const phraseId='PH-'+String(phraseCounter).padStart(5,'0');
  const row=activeRowIdx>=0?fileRows[activeRowIdx]:null;
  const language=session.language;
  const code=row?gv(row,colMap.code,session.code):session.code;
  const source=session.sourceName||'';
  const context=row?gv(row,colMap.context,''):'';
  const phrase=tokens.map(t=>t.word).join(' ');
  const lang=rowLang();

  const tokenRecords=tokens.map((t,pos)=>{
    const gloss=currentGlosses[t.id]||'';
    const base=ensureLexBase(t.word,lang);
    const sense=ensureSense(base,gloss,phraseId);
    return{tokenId:phraseId+'-T'+(pos+1),phraseId,position:pos+1,wordForm:t.word,lexId:base.lexId,senseId:sense.senseId,gloss};
  });
  const sorted=[...currentAnnotations].sort((a,b)=>a.order-b.order);
  const annotations=sorted.map((a,ai)=>{
    const{category,subcategory,type}=splitTag(a.tag);
    return{annotationId:phraseId+'-A'+(ai+1),phraseId,order:a.order,tokens:a.words,
           tokenIds:a.indices.map(i=>phraseId+'-T'+(i+1)),tag:a.tag,category,subcategory,type};
  });

  savedAnnotations.push({phraseId,phrase,language,code,source,dataColumn:colMap.context>=0?fileHeaders[colMap.context]:'',context,phraseTranslation:currentPhraseTranslation,rowIndex:activeRowIdx,tagSequence:sorted.map(a=>a.tag),tokenRecords,annotations,savedAt:new Date().toISOString()});
  rebuildTagSuggestions();
  autoSave();

  currentAnnotations=[];selectedIdx=new Set();currentGlosses={};currentPhraseTranslation='';pendingAutoTag=null;
  dismissBanner();hideValidation();renderPhrase();renderGlossPanel();renderTagOrderStrip();renderTagPickerIdle();renderRowList();

  const btn=document.querySelector('[onclick="commitPhrase()"]');const orig=btn.textContent;
  btn.textContent='Saved ✓';btn.style.cssText='background:var(--green);border-color:var(--green);color:white';
  setTimeout(()=>{btn.textContent=orig;btn.style.cssText='';},1500);
}

/* ══ SAVED ══ */
function renderSaved(){
  const list=document.getElementById('saved-list');
  document.getElementById('saved-count').textContent=savedAnnotations.length?`${savedAnnotations.length} phrase${savedAnnotations.length!==1?'s':''} saved`:'';
  if(!savedAnnotations.length){list.innerHTML='<div class="empty-note">No saved annotations yet.</div>';return;}
  list.innerHTML=savedAnnotations.map((s,i)=>`
    <div class="saved-entry">
      <div class="saved-entry-head"><span class="ph-id-chip">${s.phraseId}</span><span class="saved-phrase">${s.phrase}</span><span class="meta-chip">${s.language}</span><span class="meta-chip">${s.code}</span><button class="btn btn-sm btn-danger" onclick="deleteSaved(${i})">Remove</button></div>
      ${s.context?`<div class="saved-ctx"><em>Context:</em> ${s.context}</div>`:''}
      ${s.phraseTranslation?`<div class="saved-trans">${s.phraseTranslation}</div>`:''}
      <div class="saved-body">${s.annotations.map((a,ai)=>`<span class="saved-tag-pill"><span style="opacity:.6;font-size:10px">${a.order}.</span> ${a.tokens} → ${a.tag}</span>${ai<s.annotations.length-1?'<span style="color:var(--ink-4);font-size:11px">→</span>':''}`).join('')}</div>
      <div style="padding:0 14px 7px;display:flex;align-items:center;gap:6px"><span style="font-size:11px;color:var(--ink-4)">Sequence:</span><span class="ord-seq">${s.tagSequence.join(' → ')}</span></div>
    </div>`).join('');
}
function deleteSaved(i){savedAnnotations.splice(i,1);rebuildTagSuggestions();autoSave();renderSaved();}
function clearSaved(){if(confirm('Clear all saved annotations?')){savedAnnotations=[];rebuildTagSuggestions();autoSave();renderSaved();}}

/* ══ LEXICON ══ */
function hasEmptyGlosses(){return Object.values(lexicon).some(e=>e.senses.some(s=>!s.gloss||!s.gloss.trim()));}
function renderLexicon(){
  const q=(document.getElementById('lex-search').value||'').toLowerCase();
  const entries=Object.values(lexicon).filter(e=>!q||e.wordForm.toLowerCase().includes(q)||e.lexId.toLowerCase().includes(q)||e.senses.some(s=>(s.gloss||'').toLowerCase().includes(q))).sort((a,b)=>a.lexId.localeCompare(b.lexId));
  const ts=Object.values(lexicon).reduce((s,e)=>s+e.senses.length,0);
  document.getElementById('lex-stats').textContent=`${Object.keys(lexicon).length} entries · ${ts} senses`;
  document.getElementById('lex-warn').classList.toggle('visible',hasEmptyGlosses());
  if(!entries.length){document.getElementById('lex-tbody').innerHTML=`<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--ink-4);font-style:italic">${Object.keys(lexicon).length?'No matches.':'Lexicon is empty — entries appear as you annotate.'}</td></tr>`;return;}
  let html='';
  entries.forEach(e=>{
    const k=bk(e.wordForm,e.language);
    html+=`<tr class="lex-base-row"><td><span class="lex-code">${e.lexId}</span></td><td><span class="lex-form">${e.wordForm}</span></td><td>${e.language||'—'}</td><td colspan="2" style="color:var(--ink-3);font-size:12px">${e.senses.length} sense${e.senses.length!==1?'s':''}</td><td><button class="icon-btn" onclick="deleteLexBase('${k}')">×</button></td></tr>`;
    e.senses.forEach((s,si)=>{
      const empty=!s.gloss||!s.gloss.trim();
      html+=`<tr class="lex-sense-row"><td><span class="lex-sense-code">${s.senseId}</span></td><td style="color:var(--ink-3);font-size:12px">↳</td><td></td><td><input class="lex-edit-input${empty?' empty-warn':''}" value="${(s.gloss||'').replace(/"/g,'&quot;')}" placeholder="⚠ fill gloss" onchange="updateSense('${k}',${si},'gloss',this.value);renderLexicon()"></td><td style="max-width:180px">${s.phraseIds.slice(0,5).map(p=>`<span class="ph-pill">${p}</span>`).join('')}${s.phraseIds.length>5?`<span style="font-size:10px;color:var(--ink-4)">+${s.phraseIds.length-5}</span>`:''}</td><td><button class="icon-btn" onclick="deleteSenseRow('${k}',${si})">×</button></td></tr>`;
    });
    html+=`<tr><td colspan="6" style="padding:3px 12px 7px"><button class="btn btn-sm btn-ghost" onclick="addSenseRow('${k}')" style="font-size:12px;padding:3px 10px">+ Add sense</button></td></tr>`;
  });
  document.getElementById('lex-tbody').innerHTML=html;
}
function updateSense(k,si,f,v){if(lexicon[k]&&lexicon[k].senses[si]){lexicon[k].senses[si][f]=v;autoSave();}}
function deleteLexBase(k){if(confirm('Delete this entry and all its senses?')){delete lexicon[k];autoSave();renderLexicon();}}
function deleteSenseRow(k,si){if(confirm('Delete this sense?')){lexicon[k].senses.splice(si,1);autoSave();renderLexicon();}}
function addSenseRow(k){if(!lexicon[k])return;const n=lexicon[k].senses.length+1;lexicon[k].senses.push({senseId:lexicon[k].lexId+'-S'+n,gloss:'',phraseIds:[]});autoSave();renderLexicon();}
function clearLexicon(){if(confirm('Clear entire lexicon?')){lexicon={};lexCounter=0;autoSave();renderLexicon();}}

/* ── Lexicon export with empty-gloss guard ── */
function lexExportGuard(){if(hasEmptyGlosses()){alert('Cannot export: some lexicon entries have empty glosses. Please fill them in first.');return false;}return true;}
function exportLexiconJSON(){if(!lexExportGuard())return;dl(new Blob([JSON.stringify(Object.values(lexicon),null,2)],{type:'application/json;charset=utf-8'}),`lexicon_${san(session.code||'session')}.json`);}
function exportLexiconCSV(){
  if(!lexExportGuard())return;
  const rows=[['lex_id','sense_id','word_form','language','gloss','phrase_ids']];
  Object.values(lexicon).forEach(e=>e.senses.forEach(s=>rows.push([e.lexId,s.senseId,e.wordForm,e.language,s.gloss,s.phraseIds.join('; ')])));
  dl(new Blob([utf8CSV(rows)],{type:'text/csv;charset=utf-8'}),`lexicon_${san(session.code||'session')}.csv`);
}
function exportLexiconXLSX(){
  if(!lexExportGuard())return;
  const data=[];Object.values(lexicon).forEach(e=>e.senses.forEach(s=>data.push({lex_id:e.lexId,sense_id:s.senseId,word_form:e.wordForm,language:e.language,gloss:s.gloss,phrase_ids:s.phraseIds.join('; ')})));
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(data,{header:['lex_id','sense_id','word_form','language','gloss','phrase_ids']});ws['!cols']=[{wch:12},{wch:14},{wch:18},{wch:14},{wch:24},{wch:30}];XLSX.utils.book_append_sheet(wb,ws,'lexicon');
  XLSX.writeFile(wb,`lexicon_${san(session.code||'session')}.xlsx`,{bookType:'xlsx',type:'binary'});
}

/* ══ MAIN EXPORT ══ */
function utf8CSV(rows){return'\uFEFF'+rows.map(r=>r.map(c=>`"${String(c==null?'':c).replace(/"/g,'""')}"`).join(',')).join('\n');}
function san(s){return s.replace(/[^a-zA-Z0-9_\-]/g,'_');}
function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();}
function buildTables(){
  const phrases=savedAnnotations.map(s=>({
    phrase_id:s.phraseId,phrase:s.phrase,phrase_translation:s.phraseTranslation||'',
    language:s.language,code:s.code,context:s.context,
    tag_sequence:s.tagSequence.join(' → '),saved_at:s.savedAt
  }));
  const tokens_tbl=[];
  savedAnnotations.forEach(s=>s.tokenRecords.forEach(t=>tokens_tbl.push(t)));
  const annos_tbl=[];
  savedAnnotations.forEach(s=>s.annotations.forEach(a=>{
    const{category,subcategory,type}=splitTag(a.tag);
    annos_tbl.push({
      annotation_id:a.annotationId,phrase_id:a.phraseId,order:a.order,
      tokens:a.tokens,token_ids:a.tokenIds.join(', '),
      tag:a.tag,category,subcategory,type
    });
  }));
  return{phrases,tokens_tbl,annos_tbl};
}
function exportXLSX(){
  if(!savedAnnotations.length){alert('No annotations saved yet.');return;}
  const{phrases,tokens_tbl,annos_tbl}=buildTables();
  const wb=XLSX.utils.book_new();
  const toSheet=(data,cols)=>{
    const ws=XLSX.utils.json_to_sheet(data,{header:cols});
    const mw={};cols.forEach(c=>{mw[c]=c.length;});
    data.forEach(row=>cols.forEach(c=>{const v=String(row[c]||'');if(v.length>mw[c])mw[c]=Math.min(v.length,60);}));
    ws['!cols']=cols.map(c=>({wch:mw[c]+2}));return ws;
  };
  XLSX.utils.book_append_sheet(wb,toSheet(phrases,
    ['phrase_id','phrase','phrase_translation','language','code','context','tag_sequence','saved_at']),'phrases');
  XLSX.utils.book_append_sheet(wb,toSheet(tokens_tbl,
    ['tokenId','phraseId','position','wordForm','lexId','senseId','gloss']),'tokens');
  XLSX.utils.book_append_sheet(wb,toSheet(annos_tbl,
    ['annotation_id','phrase_id','order','tokens','token_ids','tag','category','subcategory','type']),'annotations');
  XLSX.writeFile(wb,`np_${san(session.code||'annotations')}.xlsx`,{bookType:'xlsx',type:'binary'});
}
function exportJSON(){
  const{phrases,tokens_tbl,annos_tbl}=buildTables();
  const out={
    session:{language:session.language,code:session.code,exportedAt:new Date().toISOString()},
    phrases,tokens:tokens_tbl,annotations:annos_tbl
  };
  dl(new Blob([JSON.stringify(out,null,2)],{type:'application/json;charset=utf-8'}),
     `np_${san(session.code||'annotations')}.json`);
}
function exportCSV(){
  if(!savedAnnotations.length){alert('No annotations saved yet.');return;}
  const{phrases,tokens_tbl,annos_tbl}=buildTables();

  // Table 1: Phrases (one row per phrase — Primary Key: phrase_id)
  const phraseCols=['phrase_id','phrase','phrase_translation','language','code','context','tag_sequence','saved_at'];
  const phraseRows=[phraseCols,...phrases.map(p=>phraseCols.map(c=>p[c]||''))];
  dl(new Blob([utf8CSV(phraseRows)],{type:'text/csv;charset=utf-8'}),
     `np_phrases_${san(session.code||'session')}.csv`);

  // Table 2: Tokens (one row per token — Foreign Key: phrase_id → phrases.phrase_id)
  const tokenCols=['tokenId','phraseId','position','wordForm','lexId','senseId','gloss'];
  const tokenRows=[tokenCols,...tokens_tbl.map(t=>tokenCols.map(c=>t[c]||''))];
  dl(new Blob([utf8CSV(tokenRows)],{type:'text/csv;charset=utf-8'}),
     `np_tokens_${san(session.code||'session')}.csv`);

  // Table 3: Annotations (one row per annotation — Foreign Key: phrase_id)
  const annoCols=['annotation_id','phrase_id','order','tokens','token_ids','tag','category','subcategory','type'];
  const annoRows=[annoCols,...annos_tbl.map(a=>annoCols.map(c=>a[c]||''))];
  dl(new Blob([utf8CSV(annoRows)],{type:'text/csv;charset=utf-8'}),
     `np_annotations_${san(session.code||'session')}.csv`);
}

/* ══ CATEGORY MANAGER ══ */
function renderCatManager(){
  document.getElementById('cat-manager').innerHTML=categories.map((cat,ci)=>`
    <div class="cat-manage-item">
      <div class="cat-manage-head">
        <span class="cat-manage-label">${cat.label}</span>
        <span class="cat-manage-id">${cat.id}</span>
        <button class="btn btn-sm" onclick="addSubCat(${ci})" style="margin-left:auto">+ Subcategory</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCat(${ci})">Delete</button>
      </div>
      ${(cat.subs||[]).length?`<div class="cat-manage-subs">${cat.subs.map((s,si)=>`
        <div class="sub-manage-item" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <span style="flex:1">${s.label}</span>
            <span class="sub-id">${s.id}</span>
            <button class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px" onclick="addType(${ci},${si})">+ Type</button>
            <button class="icon-btn" onclick="deleteSub(${ci},${si})">×</button>
          </div>
          ${(s.types||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:4px;padding-left:12px">${s.types.map((t,ti)=>`
            <div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--radius);background:var(--accent-light);font-size:12px;color:var(--accent)">
              ${t.label} <span style="font-family:monospace;font-size:10px;opacity:.6">${t.id}</span>
              <button class="icon-btn" style="width:14px;height:14px;font-size:12px" onclick="deleteType(${ci},${si},${ti})">×</button>
            </div>`).join('')}</div>`:''}
        </div>`).join('')}</div>`:''}
    </div>`).join('');
}
function addMainCat(){
  const n=document.getElementById('newCatName').value.trim();if(!n)return;
  categories.push({id:n.toUpperCase().replace(/[^A-Z0-9]+/g,'-'),label:n,subs:[]});
  document.getElementById('newCatName').value='';autoSave();renderCatManager();
}
function deleteCat(i){if(!confirm(`Delete "${categories[i].label}"?`))return;categories.splice(i,1);autoSave();renderCatManager();}
function addSubCat(ci){
  const n=prompt(`Subcategory name for "${categories[ci].label}":`);if(!n)return;
  categories[ci].subs.push({id:categories[ci].id+'-'+n.toUpperCase().replace(/[^A-Z0-9]+/g,'-'),label:n,types:[]});
  autoSave();renderCatManager();
}
function deleteSub(ci,si){categories[ci].subs.splice(si,1);autoSave();renderCatManager();}
function addType(ci,si){
  const n=prompt(`Type name for "${categories[ci].subs[si].label}":`);if(!n)return;
  if(!categories[ci].subs[si].types)categories[ci].subs[si].types=[];
  categories[ci].subs[si].types.push({id:categories[ci].subs[si].id+'-'+n.toUpperCase().replace(/[^A-Z0-9]+/g,'-'),label:n});
  autoSave();renderCatManager();
}
function deleteType(ci,si,ti){categories[ci].subs[si].types.splice(ti,1);autoSave();renderCatManager();}

/* ══ PAGE LOAD ══ */
checkStorageOnLoad();
</script>
