const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'script.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const elements = new Map();
const storage = new Map();
function makeElement() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    textContent: '',
    innerHTML: '',
    value: '',
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    appendChild() {},
    setAttribute() {},
    disabled: false
  };
}
function getElement(id) {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
}

const context = {
  console,
  window: {},
  document: {
    getElementById: getElement,
    createElement: makeElement,
    querySelector: getElement,
    querySelectorAll: () => []
  },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  },
  alert: () => {},
  confirm: () => true,
  setTimeout: (fn) => fn(),
  URL: { createObjectURL: () => 'blob:' },
  Blob: class Blob {},
  FileReader: class {},
  location: { reload() {} },
  navigator: {},
  XLSX: { utils: { book_new() { return {}; }, json_to_sheet() { return {}; }, book_append_sheet() {} }, writeFile() {} }
};

vm.createContext(context);
vm.runInContext(script, context);

function buildSnapshot() {
  return context.buildSessionSnapshot ? context.buildSessionSnapshot() : null;
}

function restore(snapshot) {
  return context.restoreSessionSnapshot ? context.restoreSessionSnapshot(snapshot) : null;
}

const snapshot = buildSnapshot();
assert(snapshot, 'snapshot should be built');
assert.strictEqual(snapshot.version, 1);
assert(snapshot.session);
assert(Array.isArray(snapshot.fileRows));
assert(Array.isArray(snapshot.savedAnnotations));
assert(Array.isArray(snapshot.lexicon));

const restored = restore(snapshot);
assert(restored, 'snapshot should restore');
assert.strictEqual(restored.session.language, snapshot.session.language);
assert.strictEqual(restored.fileRows.length, snapshot.fileRows.length);
assert.strictEqual(restored.savedAnnotations.length, snapshot.savedAnnotations.length);

const referenceRows = [
  ['word', 'tag', 'category', 'subcategory', 'type'],
  ['old', 'ADJ-NINT-AGE', 'Adjective', 'Non-intersective', 'Age'],
  ['red', 'ADJ-INT-COLOR', 'Adjective', 'Intersective', 'Color']
];
const referenceSuggestions = context.buildReferenceTagSuggestionsFromRows
  ? context.buildReferenceTagSuggestionsFromRows(referenceRows)
  : null;
assert(referenceSuggestions, 'reference suggestions should be built from rows');
assert.deepStrictEqual(JSON.parse(JSON.stringify(referenceSuggestions.old[0])), {
  tag: 'ADJ-NINT-AGE',
  category: 'Adjective',
  subcategory: 'Non-intersective',
  type: 'Age'
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(referenceSuggestions.red[0])), {
  tag: 'ADJ-INT-COLOR',
  category: 'Adjective',
  subcategory: 'Intersective',
  type: 'Color'
});
assert.strictEqual(snapshot.referenceDataset, undefined, 'reference datasets should not be serialized into session snapshots');

vm.runInContext(`
  activeRowIdx = 0;
  fileRows = [['Context','NP','Code']];
  colMap = {data:1,lang:-1,code:2,context:0,source:-1};
  session = {language:'English',code:'EN-01',sourceName:'Test source'};
  tokens = [{id:0,word:'red'}];
  currentAnnotations = [{indices:[0],words:'red',tag:'ADJ-INT-COLOR',category:'Adjective',subcategory:'Intersective',type:'Color',order:1}];
  currentGlosses = {0:'red'};
  currentPhraseTranslation = 'red';
  savedAnnotations = [{phraseId:'PH-00001',phrase:'red',language:'English',code:'EN-01',source:'Test source',dataColumn:'Context',context:'The red book',phraseTranslation:'rojo',rowIndex:0,tagSequence:['ADJ-INT-COLOR'],tokenRecords:[],annotations:[],savedAt:'old'}];
  phraseCounter = 1;
`, context);
getElement('gi-0').value = 'red';
getElement('phrase-trans').value = 'red';
getElement('np-edit-input').value = 'edited red';
vm.runInContext(`
  tokens = [{id:0,word:'edited'},{id:1,word:'red'}];
  currentAnnotations = [{indices:[0,1],words:'edited red',tag:'ADJ-INT-COLOR',category:'Adjective',subcategory:'Intersective',type:'Color',order:1}];
  currentGlosses = {0:'edit',1:'red'};
`, context);
getElement('gi-0').value = 'edit';
getElement('gi-1').value = 'red';
vm.runInContext('commitPhrase();', context);
const updatedCount = vm.runInContext('savedAnnotations.length', context);
const updatedPhraseId = vm.runInContext('savedAnnotations[0].phraseId', context);
const updatedPhrase = vm.runInContext('savedAnnotations[0].phrase', context);
const updatedPhraseCounter = vm.runInContext('phraseCounter', context);
assert.strictEqual(updatedCount, 1, 'saving an edited row should update the existing entry instead of creating a new one');
assert.strictEqual(updatedPhraseId, 'PH-00001', 'edited rows should keep the original phrase id');
assert.strictEqual(updatedPhrase, 'edited red', 'edited rows should update the existing saved phrase payload');
assert.strictEqual(updatedPhraseCounter, 1, 'editing an existing row should not increment the phrase counter');
assert.strictEqual(vm.runInContext('fileRows[0][colMap.data]', context), 'edited red', 'saving should update the phrase in the main dataset array');

const autoSavedSnapshot = JSON.parse(storage.get('np_annotator_v1'));
assert.strictEqual(autoSavedSnapshot.fileRows[0][1], 'edited red', 'auto-save should persist the edited main dataset value');
assert.strictEqual(autoSavedSnapshot.savedAnnotations[0].phrase, 'edited red', 'auto-save should persist the edited saved annotation');

vm.runInContext('selectRow(0);', context);
const reselectedInput = getElement('np-edit-input').value;
const reselectedTokens = vm.runInContext('tokens.map(t => t.word)', context);
const reselectedTags = vm.runInContext('currentAnnotations.map(a => a.tag)', context);
const reselectedGloss = vm.runInContext('currentGlosses[0]', context);
assert.strictEqual(reselectedInput, 'edited red', 're-selecting a saved row should show its edited phrase, not the uploaded value');
assert.deepStrictEqual([...reselectedTokens], ['edited', 'red'], 'tag selection should tokenize the edited saved phrase');
assert.deepStrictEqual([...reselectedTags], ['ADJ-INT-COLOR'], 'tag selection should restore annotations for the edited phrase');
assert.strictEqual(reselectedGloss, 'edit', 'glosses should restore against the edited phrase tokens');

vm.runInContext(`
  restoreSessionSnapshot(JSON.parse(localStorage.getItem('np_annotator_v1')));
  selectRow(0);
`, context);
assert.strictEqual(getElement('np-edit-input').value, 'edited red', 'a localStorage restore should reload the edited phrase');
assert.strictEqual(vm.runInContext('fileRows[0][colMap.data]', context), 'edited red', 'a localStorage restore should retain the edited main dataset value');
console.log('session snapshot tests passed');
