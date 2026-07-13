const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'script.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const context = {
  console,
  window: {},
  document: {
    getElementById: () => ({
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      textContent: '',
      innerHTML: '',
      querySelector: () => ({ textContent: '' }),
      appendChild() {},
      setAttribute() {},
      disabled: false,
      value: ''
    }),
    querySelectorAll: () => []
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
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
assert.deepStrictEqual(referenceSuggestions.old[0], {
  tag: 'ADJ-NINT-AGE',
  category: 'Adjective',
  subcategory: 'Non-intersective',
  type: 'Age'
});
assert.deepStrictEqual(referenceSuggestions.red[0], {
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
vm.runInContext('commitPhrase();', context);
const updatedCount = vm.runInContext('savedAnnotations.length', context);
const updatedPhraseId = vm.runInContext('savedAnnotations[0].phraseId', context);
const updatedPhrase = vm.runInContext('savedAnnotations[0].phrase', context);
const updatedPhraseCounter = vm.runInContext('phraseCounter', context);
assert.strictEqual(updatedCount, 1, 'saving an edited row should update the existing entry instead of creating a new one');
assert.strictEqual(updatedPhraseId, 'PH-00001', 'edited rows should keep the original phrase id');
assert.strictEqual(updatedPhrase, 'red', 'edited rows should update the existing saved phrase payload');
assert.strictEqual(updatedPhraseCounter, 1, 'editing an existing row should not increment the phrase counter');
console.log('session snapshot tests passed');
