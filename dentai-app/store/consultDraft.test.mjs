// Dependency-free assertion test for the pure consult-draft logic.
// Run: node store/consultDraft.test.mjs
import assert from 'node:assert/strict';
import {
  emptyDraft,
  blankExtraction,
  normaliseExtraction,
  withField,
  withAddedMedicine,
  withEditedMedicine,
  withRemovedMedicine,
} from './consultDraft.mjs';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

t('emptyDraft starts idle with no extraction', () => {
  const d = emptyDraft();
  assert.equal(d.phase, 'idle');
  assert.equal(d.extraction, null);
  assert.equal(d.transcript, '');
  assert.equal(d.error, null);
});

t('normaliseExtraction(null) is null', () => {
  assert.equal(normaliseExtraction(null), null);
});

t('normaliseExtraction NEVER fabricates medicines', () => {
  // The "AI must never hallucinate medicines" guarantee: absent meds => [].
  const ex = normaliseExtraction({ diagnosis: 'pulpitis' });
  assert.deepEqual(ex.medicines, []);
});

t('normaliseExtraction keeps explicitly extracted medicines', () => {
  const ex = normaliseExtraction({ medicines: [{ name: 'Ibuprofen' }] });
  assert.equal(ex.medicines.length, 1);
  assert.equal(ex.medicines[0].name, 'Ibuprofen');
});

t('blankExtraction is empty + single sitting + no meds', () => {
  const ex = blankExtraction();
  assert.deepEqual(ex.medicines, []);
  assert.equal(ex.totalSittings, 1);
  assert.equal(ex.diagnosis, '');
});

t('withField sets a value immutably', () => {
  const ex = blankExtraction();
  const next = withField(ex, 'estimatedCost', 4500);
  assert.equal(next.estimatedCost, 4500);
  assert.equal(ex.estimatedCost, 0, 'original must be untouched');
});

t('withAddedMedicine appends an empty editable medicine', () => {
  const ex = blankExtraction();
  const next = withAddedMedicine(ex);
  assert.equal(next.medicines.length, 1);
  assert.equal(next.medicines[0].name, '');
  assert.equal(ex.medicines.length, 0, 'original must be untouched');
});

t('withEditedMedicine merges a patch at the index', () => {
  const ex = withAddedMedicine(blankExtraction());
  const next = withEditedMedicine(ex, 0, { name: 'Amoxicillin', dose: '500mg' });
  assert.equal(next.medicines[0].name, 'Amoxicillin');
  assert.equal(next.medicines[0].dose, '500mg');
  assert.equal(ex.medicines[0].name, '', 'original must be untouched');
});

t('withRemovedMedicine drops the medicine at the index', () => {
  let ex = blankExtraction();
  ex = withAddedMedicine(ex);
  ex = withEditedMedicine(ex, 0, { name: 'A' });
  ex = withAddedMedicine(ex);
  ex = withEditedMedicine(ex, 1, { name: 'B' });
  const next = withRemovedMedicine(ex, 0);
  assert.equal(next.medicines.length, 1);
  assert.equal(next.medicines[0].name, 'B');
});

console.log(`\n${passed} assertions passed.`);
