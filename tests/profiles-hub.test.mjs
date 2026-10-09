import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../dist/src/store.js';
import { selectedProfile, assignProfile, saveProfile, cloneProfile, profileContext, startRecognition, retryRecognition } from '../dist/src/profile-store.js';
import { renderApp, modal } from '../dist/src/views.js';
import { activityView } from '../dist/src/activity-view.js';
import { selectJob } from '../dist/src/activity-store.js';
import { createRevision } from '../dist/src/revision-store.js';
import { pipelineStages } from '../dist/src/pipeline-view.js';

test('profiles are reusable model/prompt definitions with dictation-specific selections', () => {
  const s = createState(); assert.equal(selectedProfile(s, 'recognizer').name, 'Recognizer Main');
  const primer = structuredClone(s.primers);
  assert.equal(assignProfile(s, 'recognizer', 'recognizer-special', 'political'), true);
  assert.equal(selectedProfile(s, 'recognizer', 'political').name, 'Recognizer Special Case');
  assert.equal(selectedProfile(s, 'recognizer', 'architecture').name, 'Recognizer Main');
  assert.equal(assignProfile(s, 'corrector', 'recognizer-main'), false); assert.deepEqual(s.primers, primer);
  const clone = cloneProfile(s, 'corrector-main'); assert.notEqual(clone.id, 'corrector-main'); assert.equal(clone.version, 1);
  const result = saveProfile(s, { ...clone, name: 'Corrector Special Case', prompt: 'Suggest fixes; keep names as spoken.' }); assert.equal(result.ok, true);
  assert.equal(s.profiles.find(p => p.id === 'corrector-main').version, 3);
});

test('recognition freezes profile and compiled primer input, and keeps existing documents intact', () => {
  const s = createState(), documents = structuredClone(s.documents), count = s.dictations.length;
  const result = startRecognition(s, { start: 0, end: 60, parts: 2, profileId: 'recognizer-special' }); assert.equal(result.ok, true);
  assert.equal(result.job.initiatedFrom, 'Dictation'); assert.equal(result.job.model, 'gpt-4o-transcribe');
  const snapshot = structuredClone(result.job.profileSnapshot), ctx = structuredClone(s.contextSnapshots.find(c => c.id === result.job.contextId));
  assert.match(ctx.prompt, /difficult passage/); assert.match(ctx.prompt, /Relevant terms/); assert.equal(result.job.spanIds.length, 2);
  assert.ok(s.attempts.filter(a => a.jobId === result.job.id).every(a => a.profileSnapshot.id === snapshot.id));
  saveProfile(s, { ...s.profiles.find(p => p.id === snapshot.id), prompt: 'Future prompt only', model: 'gpt-transcribe' });
  s.primers.architecture.topic = 'Future topic';
  assert.deepEqual(result.job.profileSnapshot, snapshot); assert.deepEqual(s.contextSnapshots.find(c => c.id === ctx.id), ctx);
  assert.equal(s.dictations.length, count); assert.deepEqual(s.documents, documents);
});

test('section recognition preserves old attempts and rejects incompatible live profiles or invalid windows before mutation', () => {
  const s = createState(), attempts = structuredClone(s.attempts), document = structuredClone(s.documents), jobs = s.jobs.length;
  assert.equal(startRecognition(s, { profileId: 'recognizer-live' }).ok, false);
  assert.equal(startRecognition(s, { start: 50, end: 20 }).ok, false);
  assert.equal(startRecognition(s, { before: -1 }).ok, false); assert.equal(s.jobs.length, jobs);
  const result = startRecognition(s, { start: 42, end: 64, section: true, parts: 1, before: 10, after: 5 });
  assert.equal(result.ok, true); assert.match(result.job.title, /Section re-recognition/);
  const a = s.attempts.find(a => a.jobId === result.job.id); assert.deepEqual(a.input, [32, 69]);
  assert.deepEqual(s.attempts.slice(0, attempts.length), attempts); assert.deepEqual(s.documents, document);
});

test('retry selects a complete frozen run configuration or freezes a current profile', () => {
  const s = createState(); s.dictationId = 'political'; s.primer = s.primers.political;
  const old = retryRecognition(s, 'job-104', 'span-p04', { useOriginal: true }); assert.equal(old.ok, true); assert.equal(old.attempt.contextId, 'ctx-p12'); assert.equal(old.attempt.model, 'gpt-transcribe');
  old.attempt.state = 'Failed';
  const fresh = retryRecognition(s, 'job-104', 'span-p04', { useOriginal: false, profileId: 'recognizer-special', custom: true, before: 12, after: 12 });
  assert.equal(fresh.ok, true); assert.equal(fresh.attempt.model, 'gpt-4o-transcribe'); assert.equal(fresh.attempt.profileSnapshot.name, 'Recognizer Special Case');
  const ctx = s.contextSnapshots.find(c => c.id === fresh.attempt.contextId); assert.match(ctx.prompt, /difficult passage/);
  assert.match(s.requests.find(r => r.attemptId === fresh.attempt.id).prompt, /difficult passage/);
  assert.equal(retryRecognition(s, 'job-brief-1', 'span-brief-1').ok, false);
});

test('corrector runs are proposals with frozen inputs and never write an editorial draft or working text', () => {
  const s = createState(); s.dictationId = 'assembly-demo'; s.primer = s.primers[s.dictationId]; assignProfile(s, 'corrector', 'corrector-editorial');
  const docs = structuredClone(s.documents), evidence = structuredClone(s.attempts), primer = structuredClone(s.primer);
  const result = createRevision(s, 'editorial'); assert.equal(result.proposals, 1);
  const c = s.changes.find(c => c.mode === 'editorial'); assert.equal(c.profileSnapshot.name, 'Corrector Editorial'); assert.equal(c.inputContext.output, 'Review proposals');
  assert.equal(s.jobs.find(j => j.id === c.jobId).kind, 'Text correction'); assert.equal(c.state, 'pending');
  assert.deepEqual(s.documents, docs); assert.deepEqual(s.attempts, evidence); assert.deepEqual(s.primer, primer);
  const frozen = structuredClone(c.inputContext); saveProfile(s, { ...selectedProfile(s, 'corrector'), prompt: 'A future prompt' }); assert.deepEqual(c.inputContext, frozen);
  assert.equal(profileContext(s, selectedProfile(s, 'corrector')).manual_edits, 'protected');
});

test('Activity shows pipeline stages and inspections without recognition initiation or execution controls', () => {
  const s = createState(); s.page = 'jobs'; selectJob(s, 'job-104');
  for (const tab of ['pipeline', 'spans', 'attempts', 'compare', 'events', 'config']) { s.activityTab = tab; const html = activityView(s); assert.match(html, /Text assembly/); assert.match(html, /Correction suggestions/); for (const action of ['new-job', 'configure-attempt', 'dispatch-ready', 'retry-failed', 'attempt-success', 'attempt-failure', 'cancel-job', 'activity-toggle-job']) assert.ok(!html.includes(`data-action="${action}"`)); }
  const stages = pipelineStages(s, 'political'); assert.equal(stages.length, 5); assert.match(stages[2].state, /conflict|gaps/i);
});

test('the full-screen Dictation view renders all dedicated panels and hides rare tools behind disclosure', () => {
  const s = createState();
  for (const d of s.dictations) { s.dictationId = d.id; s.primer = s.primers[d.id]; s.page = 'dictation'; for (const tab of ['overview', 'audio', 'documents', 'profiles', 'advanced']) { s.dictationTab = tab; const html = renderApp(s); assert.match(html, /dictation-hub/); assert.ok(!html.includes('class="sidebar ')); } }
  s.dictationTab = 'advanced'; const advanced = renderApp(s); assert.match(advanced, /<details class="hub-card section-rerun">/);
  s.dictationTab = 'overview'; assert.ok(!renderApp(s).includes('section-start'));
  s.modal = 'recognition-run'; assert.match(modal(s), /recognition-owner/); assert.ok(!modal(s).includes('id="job-dictation"'));
  s.modal = 'settings'; s.settingsTab = 'profiles'; assert.match(modal(s), /Recognition context prompt/);
  s.settingsTab = 'editor'; assert.ok(!modal(s).includes('autoApply')); assert.match(modal(s), /Correctors suggest/);
  s.settingsTab = 'profiles'; s.profileDraft = { ...selectedProfile(s, 'corrector'), name: '<script>name</script>', prompt: '<img onerror="alert(1)">' };
  assert.ok(!modal(s).includes('<script>name')); assert.match(modal(s), /&lt;img/);
});
