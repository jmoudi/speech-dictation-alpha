import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../dist/src/store.js';
import { unionSeconds, jobMetrics, spanStatus, queueAttempt, settleAttempt, retryFailed, cancelJob, toggleJob, createJob, selectJob } from '../dist/src/activity-store.js';
import { activityView, newJobForm } from '../dist/src/activity-view.js';

test('fixture graph has valid references, transmitted windows contain targets, and shared spans are real', () => {
  const s = createState();
  for (const a of s.attempts) {
    const j = s.jobs.find(j => j.id === a.jobId), p = s.spans.find(p => p.id === a.spanId), b = s.blobs.find(b => b.id === a.blobId);
    assert.ok(j.spanIds.includes(p.id)); assert.equal(j.dictationId, p.dictationId);
    assert.ok(s.contextSnapshots.some(c => c.id === a.contextId)); assert.equal(b.audioId, p.audioId);
    assert.ok(a.input[0] <= p.target[0] && a.input[1] >= p.target[1]);
    assert.ok(a.input[1] <= s.audioAssets.find(q => q.id === p.audioId).duration);
  }
  assert.ok(s.jobs.find(j => j.id === 'job-104').spanIds.includes('span-p04'));
  assert.ok(s.jobs.find(j => j.id === 'job-105').spanIds.includes('span-p04'));
});

test('coverage measures union of successful targets, not uploaded duration or attempt count', () => {
  const s = createState(); const m = jobMetrics(s, 'job-104');
  assert.equal(m.covered, 120); assert.equal(m.total, 240); assert.equal(m.progress, 50);
  assert.equal(m.transmitted, 384); assert.equal(m.failedSpans, 1); assert.equal(m.failedAttempts, 4);
  assert.equal(unionSeconds([[0, 30], [20, 40], [0, 30], [50, 60]]), 50);
  assert.equal(jobMetrics(s, 'job-105').covered, 0);
});

test('retry adds an independent attempt, reuses frozen context/blob, and preserves the document', () => {
  const s = createState(), docs = structuredClone(s.documents), previous = structuredClone(s.attempts), context = structuredClone(s.contextSnapshots);
  s.primers.political.topic = 'A later topic';
  const result = queueAttempt(s, 'job-104', 'span-p04'); assert.equal(result.ok, true);
  assert.equal(result.attempt.retryOf, 'att-409'); assert.equal(result.attempt.blobId, 'blob-att-404'); assert.equal(result.attempt.contextId, 'ctx-p12');
  assert.deepEqual(s.attempts.slice(0, previous.length), previous); assert.deepEqual(s.contextSnapshots, context);
  assert.equal(queueAttempt(s, 'job-104', 'span-p04').ok, false);
  assert.equal(settleAttempt(s, result.attempt.id, true).ok, true);
  assert.equal(spanStatus(s, 'job-104', 'span-p04'), 'Recovered'); assert.equal(jobMetrics(s, 'job-104').covered, 150);
  assert.equal(jobMetrics(s, 'job-105').covered, 0); assert.deepEqual(s.documents, docs);
});

test('expanded-context retry stores another blob and snapshot instead of altering evidence', () => {
  const s = createState(); const old = structuredClone(s.blobs.find(b => b.id === 'blob-att-404'));
  const { attempt } = queueAttempt(s, 'job-104', 'span-p04', { expanded: true, currentContext: true });
  assert.notEqual(attempt.blobId, old.id); assert.deepEqual(attempt.input, [78, 132]);
  assert.notEqual(attempt.contextId, 'ctx-p12'); assert.deepEqual(s.blobs.find(b => b.id === old.id), old);
});

test('out-of-order results are valid and explicit dependencies block dispatch', () => {
  const s = createState(); assert.equal(spanStatus(s, 'job-104', 'span-p06'), 'Succeeded'); assert.equal(spanStatus(s, 'job-104', 'span-p05'), 'Running');
  const { attempt } = queueAttempt(s, 'job-104', 'span-p07');
  assert.equal(spanStatus(s, 'job-104', 'span-p07'), 'Blocked'); assert.equal(settleAttempt(s, attempt.id, true).ok, false);
  settleAttempt(s, 'att-407', true); assert.equal(settleAttempt(s, attempt.id, true).ok, true);
});

test('pause stops new dispatch; cancellation retains completed evidence', () => {
  const s = createState(); const completed = structuredClone(s.attempts.find(a => a.id === 'att-401'));
  const { attempt } = queueAttempt(s, 'job-104', 'span-p08'); toggleJob(s, 'job-104');
  assert.equal(settleAttempt(s, attempt.id, true).ok, false); assert.equal(settleAttempt(s, 'att-407', true).ok, true);
  assert.equal(cancelJob(s, 'job-104'), true); assert.equal(attempt.state, 'Cancelled'); assert.equal(spanStatus(s, 'job-104', 'span-p07'), 'Cancelled');
  assert.deepEqual(s.attempts.find(a => a.id === completed.id), completed);
  assert.equal(queueAttempt(s, 'job-104', 'span-p04').ok, false);
});

test('new jobs reference existing dictations and snapshot context without creating documents', () => {
  const s = createState(), docs = structuredClone(s.documents), count = s.dictations.length;
  const created = createJob(s, { dictationId: 'political', start: 0, end: 60, parts: 2, model: 'gpt-transcribe', contextPolicy: 'Fixed snapshot', output: 'Comparison evidence' });
  assert.equal(created.ok, true); assert.equal(s.dictations.length, count); assert.deepEqual(s.documents, docs);
  assert.deepEqual(created.job.spanIds, ['span-p01', 'span-p02']);
  const frozen = structuredClone(s.contextSnapshots.find(c => c.id === created.job.contextId)); s.primers.political.topic = 'Changed';
  const { attempt } = queueAttempt(s, created.job.id, 'span-p01');
  assert.equal(attempt.contextId, frozen.id); assert.deepEqual(s.contextSnapshots.find(c => c.id === frozen.id), frozen);
  assert.equal(createJob(s, { dictationId: 'political', start: 10, end: 300 }).ok, false);
});

test('bulk retry targets failed spans only and is idempotent while retries are pending', () => {
  const s = createState(); assert.equal(retryFailed(s, 'job-104'), 1); assert.equal(retryFailed(s, 'job-104'), 0);
  assert.equal(s.attempts.filter(a => a.spanId === 'span-p02' && a.jobId === 'job-104').length, 2);
});

test('all activity states render, with escaped identifiers and no editorial headings', () => {
  const s = createState();
  for (const job of s.jobs) { selectJob(s, job.id); for (const tab of ['spans', 'attempts', 'events', 'config']) for (const detail of ['details', 'context', 'response', 'raw']) { s.activityTab = tab; s.attemptTab = detail; assert.match(activityView(s), /Activity/); } }
  assert.match(newJobForm(s), /existing dictation/);
  s.jobs[0].title = '<script>test</script>'; assert.ok(!activityView(s).includes('<script>test'));
});
