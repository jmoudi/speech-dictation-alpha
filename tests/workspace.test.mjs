import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyChange, undoEdit, compileContext, setModel, snapshotEdit, escapeHtml } from '../dist/src/store.js';
import { renderApp, modal } from '../dist/src/views.js';

test('accepting a correction preserves recognition evidence and supports undo', () => {
  const s = createState(); const original = structuredClone(s.dictations); const evidence = structuredClone(s.requests);
  assert.equal(applyChange(s, 'change-1').ok, true);
  assert.match(s.documents.architecture[1].text, /frontend/);
  assert.deepEqual(s.dictations, original); assert.deepEqual(s.requests, evidence);
  assert.equal(applyChange(s, 'change-1').ok, false);
  assert.equal(undoEdit(s), true); assert.match(s.documents.architecture[1].text, /front end/);
  assert.equal(s.changes[0].state, 'pending'); assert.equal(s.version, 14);
});

test('manual edits and stale passages cannot be overwritten by proposals', () => {
  const s = createState(); snapshotEdit(s); s.editedBlocks.add('a2');
  const text = s.documents.architecture[1].text;
  assert.equal(applyChange(s, 'change-1').ok, false); assert.equal(s.documents.architecture[1].text, text);
  undoEdit(s); s.documents.architecture[1].text = 'An independently rewritten paragraph.';
  assert.equal(applyChange(s, 'change-1').ok, false);
});

test('primer inputs adapt to the consumer and exclude unconfirmed terms', () => {
  const s = createState(); const req = structuredClone(s.requests[0]);
  const compiled = compileContext(s); assert.ok(compiled.keywords.includes('frontend'));
  assert.ok(!compiled.keywords.includes('rolling window'));
  s.primer.topic = 'A different topic'; s.primer.terms[0].text = 'Changed';
  assert.ok(compiled.keywords.includes('frontend')); assert.deepEqual(s.requests[0], req);
  setModel(s, 'gpt-4o-transcribe'); const compatible = compileContext(s);
  assert.equal('keywords' in compatible, false); assert.match(compatible.prompt, /Relevant terms/);
  assert.equal(compileContext(s, 'corrector').manual_edits, 'protected');
});

test('dictations and fresh demo sessions have independent primers and documents', () => {
  const s = createState(); const fresh = createState();
  assert.equal(s.primer, s.primers.architecture);
  s.primer.topic = 'Changed'; assert.notEqual(s.primers.interview.topic, 'Changed'); assert.notEqual(fresh.primer.topic, 'Changed');
  s.documents.architecture[0].text = 'Edited'; assert.notEqual(fresh.documents.architecture[0].text, 'Edited');
});

test('execution settings remain compatible when switching ASR models', () => {
  const s = createState(); setModel(s, 'gpt-live-transcribe'); assert.equal(s.settings.strategy, 'native');
  setModel(s, 'gpt-transcribe'); assert.equal(s.settings.strategy, 'growing');
  setModel(s, 'invalid'); assert.equal(s.settings.asrModel, 'gpt-transcribe');
});

test('every inspector, document, settings, and dialog state renders', () => {
  const s = createState(); s.page = 'studio';
  for (const source of s.dictations) for (const panel of ['changes', 'recognition', 'context', 'models']) {
    s.dictationId = source.id; s.primer = s.primers[source.id]; s.requestId = s.requests.find(r => r.dictationId === source.id)?.id; s.inspector = panel;
    for (const tab of ['primer', 'asr', 'corrector']) { s.contextTab = tab; assert.match(renderApp(s), /Speech Dictation/); }
  }
  s.dictationId = 'architecture'; s.requestId = 'req-018'; s.primer = s.primers.architecture;
  for (const tab of ['details', 'context', 'response']) { s.inspector = 'recognition'; s.requestTab = tab; assert.ok(renderApp(s).length > 1000); }
  for (const dialog of ['settings', 'export', 'import', 'add-term', 'add-tag', 'rerun', 'shortcuts']) {
    s.modal = dialog;
    for (const tab of ['models', 'audio', 'editor', 'appearance']) { s.settingsTab = tab; assert.match(modal(s), /role="dialog"/); }
  }
  s.page = 'jobs'; assert.match(renderApp(s), /Activity/);
});

test('user-entered content is escaped in rendered views', () => {
  const s = createState(); s.page = 'studio'; s.documents.architecture[0].text = '<script>alert("x")</script>';
  assert.ok(!renderApp(s).includes('<script>alert')); assert.match(renderApp(s), /&lt;script&gt;/);
  assert.equal(escapeHtml('"<&'), '&quot;&lt;&amp;');
});
