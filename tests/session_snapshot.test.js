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
  ['token', 'tag'],
  ['old', 'ADJ-NINT-AGE'],
  ['red', 'ADJ-INT-COLOR']
];
const referenceSuggestions = context.buildReferenceTagSuggestionsFromRows
  ? context.buildReferenceTagSuggestionsFromRows(referenceRows)
  : null;
assert(referenceSuggestions, 'reference suggestions should be built from rows');
assert.deepStrictEqual(referenceSuggestions.old, ['ADJ-NINT-AGE']);
assert.deepStrictEqual(referenceSuggestions.red, ['ADJ-INT-COLOR']);
assert.strictEqual(snapshot.referenceDataset, undefined, 'reference datasets should not be serialized into session snapshots');
console.log('session snapshot tests passed');
