import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../dist/src/store.js';
import { comparisonPair, preferAttempt, dictationCoverage, missingRanges, diffWords } from '../dist/src/evidence.js';
import { comparisonView, retryForm } from '../dist/src/comparison-view.js';
import { dispatchReady, queueAttempt, startAttempt, settleAttempt, toggleJob, jobAttempts } from '../dist/src/activity-store.js';
import { documentView, modal } from '../dist/src/views.js';

test('comparison selects successful hypotheses across jobs for one shared span', () => {
  const s = createState(), [a, b] = comparisonPair(s, 'span-p02');
  assert.equal(a.id, 'att-405'); assert.equal(b.id, 'att-411'); assert.notEqual(a.jobId, b.jobId); assert.equal(a.blobId, b.blobId);
  assert.equal(a.spanId, b.spanId); assert.equal(a.contextId, b.contextId);
  s.selectedSpanId = 'span-p02'; assert.match(comparisonView(s, s.jobs[0]), /diff-added/); assert.match(comparisonView(s, s.jobs[0]), /not /);
});

test('preferred evidence can only be successful and never mutates documents or stored responses', () => {
  const s = createState(), docs = structuredClone(s.documents), attempts = structuredClone(s.attempts);
  assert.equal(preferAttempt(s, 'att-402').ok, false); assert.equal(preferAttempt(s, 'att-411').ok, true);
  assert.equal(s.preferredEvidence['span-p02'], 'att-411'); assert.deepEqual(s.documents, docs); assert.deepEqual(s.attempts, attempts);
});

test('word differences identify a missing negation and preserve each source string', () => {
  const d = diffWords('They should proceed.', 'They should not proceed.');
  assert.equal(d.added, 1); assert.equal(d.removed, 0); assert.equal(d.right.find(t => t.changed).text, 'not ');
  assert.equal(d.left.map(t => t.text).join(''), 'They should proceed.'); assert.equal(d.right.map(t => t.text).join(''), 'They should not proceed.');
  assert.equal(diffWords('same text', 'same text').added, 0);
  assert.equal(diffWords('word '.repeat(701), '').bounded, true);
});

test('dictation coverage deduplicates evidence across jobs and remains distinct from document coverage', () => {
  const s = createState(), before = dictationCoverage(s, 'political');
  assert.equal(before.evidence, 120); assert.equal(before.document, 120); assert.equal(before.jobs.length, 5);
  const { attempt } = queueAttempt(s, 'job-104', 'span-p04'); settleAttempt(s, attempt.id, true);
  const after = dictationCoverage(s, 'political'); assert.equal(after.evidence, 150); assert.equal(after.document, 120);
  assert.deepEqual(after.documentGaps, [[90, 120], [120, 150], [180, 210], [210, 240]]);
  assert.deepEqual(missingRanges([[10, 20], [15, 25], [40, 80]], 60), [[0, 10], [25, 40]]);
});

test('document placeholders distinguish failed, running, and ready evidence without inserting result text', () => {
  const s = createState(); s.dictationId = 'political'; s.primer = s.primers.political;
  assert.match(documentView(s), /Recognition failed/); assert.match(documentView(s), /Recognition running/);
  const { attempt } = queueAttempt(s, 'job-104', 'span-p04'); settleAttempt(s, attempt.id, true);
  assert.match(documentView(s), /Evidence ready/); assert.ok(!documentView(s).includes(attempt.resultText));
});

test('dispatch respects concurrency and explicit predecessor dependencies', () => {
  const s = createState(); const { attempt } = queueAttempt(s, 'job-104', 'span-p04');
  const result = dispatchReady(s, 'job-104'); assert.equal(result.started, 2);
  assert.equal(jobAttempts(s, 'job-104').filter(a => a.state === 'Running').length, 3); assert.equal(attempt.state, 'Running');
  assert.ok(!jobAttempts(s, 'job-104').some(a => a.spanId === 'span-p07'));
  const blocked = queueAttempt(s, 'job-104', 'span-p07').attempt; assert.equal(startAttempt(s, blocked.id).ok, false);
  settleAttempt(s, 'att-407', true); assert.equal(startAttempt(s, blocked.id).ok, true);
});

test('paused jobs cannot dispatch queued attempts but allow in-flight completion', () => {
  const s = createState(); const { attempt } = queueAttempt(s, 'job-104', 'span-p04'); toggleJob(s, 'job-104');
  assert.equal(dispatchReady(s, 'job-104').started, 0); assert.equal(startAttempt(s, attempt.id).ok, false);
  assert.equal(settleAttempt(s, 'att-407', true).ok, true); assert.equal(s.jobs[0].state, 'Paused');
});

test('custom evidence padding clips to the audio asset and validates values before mutation', () => {
  const s = createState(), count = s.blobs.length;
  assert.equal(queueAttempt(s, 'job-104', 'span-p04', { before: -1, after: 4 }).ok, false); assert.equal(s.blobs.length, count);
  const { attempt } = queueAttempt(s, 'job-104', 'span-p01', { before: 120, after: 10, model: 'gpt-4o-transcribe' });
  assert.deepEqual(attempt.input, [0, 40]); assert.equal(attempt.model, 'gpt-4o-transcribe'); assert.notEqual(attempt.blobId, 'blob-att-401');
});

test('comparison escapes result text and retry dialog renders without modifying evidence', () => {
  const s = createState(); s.selectedSpanId = 'span-p02'; s.retrySpanId = 'span-p02';
  s.attempts.find(a => a.id === 'att-405').resultText = '<img src=x onerror=alert(1)>';
  const rendered = comparisonView(s, s.jobs[0]); assert.ok(!rendered.includes('<img')); assert.match(rendered, /&lt;img/);
  assert.match(retryForm(s), /Reuse exact blob/); s.modal = 'retry-attempt'; assert.match(modal(s), /Queue attempt/);
});
