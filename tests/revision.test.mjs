import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyChange, undoEdit, compileContext } from '../dist/src/store.js';
import { documentState, snapshotEdit, commitDocument } from '../dist/src/document-state.js';
import { buildAssembly, applyAssemblyStep, applyReadyAssembly, targetText, semanticRisk, createRevision, reviewItems, chooseReviewEvidence } from '../dist/src/revision-store.js';
import { renderApp, modal } from '../dist/src/views.js';
const briefing = s => { s.dictationId = 'assembly-demo'; s.primer = s.primers[s.dictationId]; return s; };

test('assembly orders target text by audio time and excludes overlapping input context', () => {
  const s = briefing(createState()), evidence = structuredClone(s.attempts), original = structuredClone(s.dictations);
  const plan = buildAssembly(s);
  assert.deepEqual(plan.steps.map(x => x.operation), ['Unchanged', 'Insert', 'Conflict']);
  const raw = s.attempts.find(a => a.id === 'att-brief-2');
  assert.match(raw.resultText, /Um, the briefing/); assert.match(raw.resultText, /minister confirmed/);
  assert.ok(raw.completedOrder < s.attempts.find(a => a.id === 'att-brief-1').completedOrder);
  assert.equal(applyReadyAssembly(s, plan.id).applied, 1);
  assert.deepEqual(s.documents[s.dictationId].map(b => [b.start, b.end]), [[0, 30], [30, 60]]);
  assert.doesNotMatch(s.documents[s.dictationId][1].text, /briefing|minister/);
  assert.deepEqual(s.documents[s.dictationId][1].provenance.attemptIds, ['att-brief-2']);
  assert.deepEqual(s.attempts, evidence); assert.deepEqual(s.dictations, original);
});

test('a disagreement source choice proposes an update and applying it is a separate action', () => {
  const s = briefing(createState()), before = structuredClone(s.documents[s.dictationId]);
  const item = reviewItems(s).find(i => i.spanId === 'span-brief-3');
  assert.equal(item.risk.level, 'High'); for (const tag of ['Negation', 'Attribution', 'Numbers', 'Date']) assert.ok(item.risk.tags.includes(tag));
  const choice = chooseReviewEvidence(s, item.id, 'att-brief-4'); assert.equal(choice.ok, true);
  assert.deepEqual(s.documents[s.dictationId], before);
  assert.equal(reviewItems(s).find(i => i.id === item.id).state, 'Resolved');
  assert.equal(choice.plan.steps[0].operation, 'Insert');
  assert.equal(applyAssemblyStep(s, choice.plan.id, choice.plan.steps[0].id).ok, true);
  assert.match(s.documents[s.dictationId][1].text, /denied.*2.3.*16 May/);
  assert.equal(reviewItems(s).find(i => i.planId === choice.plan.id).state, 'Resolved');
});

test('unmapped, incomplete and overlapping target text cannot be silently inserted', () => {
  const s = briefing(createState()), a = s.attempts.find(a => a.id === 'att-brief-2'), span = s.spans.find(p => p.id === a.spanId);
  delete a.targetSegments; assert.equal(targetText(a, span), null);
  assert.equal(buildAssembly(s).steps.find(x => x.spanId === span.id).operation, 'Mapping required');
  a.targetSegments = [{ range: [30, 45], text: 'Partial text' }]; assert.equal(targetText(a, span), null);
  a.targetSegments = [{ range: [30, 60], text: 'Mapped text' }];
  s.documents[s.dictationId].push({ id: 'partial', start: 35, end: 50, text: 'Existing partial passage' });
  assert.equal(buildAssembly(s).steps.find(x => x.spanId === span.id).operation, 'Overlapping document');
  s.documents[s.dictationId].pop();
  s.spans.push({ ...span, id: 'overlap', target: [40, 60] });
  s.attempts.push({ ...a, id: 'overlap-result', spanId: 'overlap', targetSegments: [{ range: [40, 60], text: 'Overlap' }] });
  assert.equal(buildAssembly(s).steps.find(x => x.spanId === 'overlap').operation, 'Overlapping target');
});

test('assembly rejects document changes, human edits, and changed evidence choices', () => {
  const s = briefing(createState()), plan = buildAssembly(s), step = plan.steps[1];
  s.version++; assert.equal(applyAssemblyStep(s, plan.id, step.id).ok, false);
  const fresh = buildAssembly(s); s.preferredEvidence[step.spanId] = 'att-brief-2';
  assert.equal(applyAssemblyStep(s, fresh.id, fresh.steps[1].id).ok, false);
  const ready = buildAssembly(s); const result = { ...structuredClone(s.attempts.find(a => a.id === 'att-brief-2')), id: 'new-recognition' }; s.attempts.push(result);
  assert.equal(applyAssemblyStep(s, ready.id, ready.steps[1].id).ok, false);
  s.editedBlocks.add('brief-1'); assert.equal(buildAssembly(s, s.dictationId, { mode: 'refresh' }).steps[0].operation, 'Protected');
});

test('new evidence reopens a resolved disagreement and prevents reuse of its old decision', () => {
  const s = briefing(createState()), id = 'span:span-brief-3';
  chooseReviewEvidence(s, id, 'att-brief-3');
  const a = structuredClone(s.attempts.find(a => a.id === 'att-brief-3')); a.id = 'new-conflicting-evidence'; a.targetSegments[0].text = 'The minister never approved a budget.'; s.attempts.push(a);
  assert.equal(reviewItems(s).find(i => i.id === id).state, 'Pending');
  assert.equal(buildAssembly(s).steps.find(x => x.spanId === a.spanId).operation, 'Conflict');
});

test('semantic priority checks all hypotheses and treats bounded long text as requiring review', () => {
  const s = briefing(createState()), a = structuredClone(s.attempts.find(a => a.id === 'att-brief-2'));
  s.attempts.push({ ...a, id: 'minor-difference', targetSegments: [{ range: [30, 60], text: a.targetSegments[0].text + ' Also.' }] });
  s.attempts.push({ ...a, id: 'critical-difference', targetSegments: [{ range: [30, 60], text: 'The negotiating position is not provisional.' }] });
  assert.ok(reviewItems(s).find(i => i.spanId === a.spanId).risk.tags.includes('Negation'));
  assert.equal(semanticRisk('We will approve.', "We won't approve.").level, 'High');
  assert.ok(semanticRisk('The date is 14 May.', 'The date is 16 May.').tags.includes('Date'));
  assert.equal(semanticRisk('word '.repeat(701), 'Changed').level, 'High');
});

test('undo and document versions are independent for each dictation', () => {
  const s = createState(); applyChange(s, 'change-1'); assert.equal(documentState(s, 'architecture').version, 13);
  briefing(s); const p = buildAssembly(s); applyReadyAssembly(s, p.id); const architecture = structuredClone(s.documents.architecture);
  assert.equal(s.version, 2); assert.equal(undoEdit(s), true); assert.equal(s.version, 3);
  assert.equal(s.documents[s.dictationId].length, 1); assert.deepEqual(s.documents.architecture, architecture);
  s.dictationId = 'architecture'; assert.equal(undoEdit(s), true); assert.equal(s.version, 14);
  assert.match(s.documents.architecture[1].text, /front end/); assert.equal(documentState(s, 'assembly-demo').version, 3);
  assert.equal(new Set(documentState(s).history.map(v => v.id)).size, documentState(s).history.length);
});

test('all corrector modes create suggestions and preserve documents, evidence and primer inputs', () => {
  const s = briefing(createState()), original = structuredClone(s.documents[s.dictationId]), source = structuredClone(s.dictations), evidence = structuredClone(s.attempts), context = structuredClone(compileContext(s));
  const cleanup = createRevision(s, 'cleanup'); assert.equal(cleanup.proposals, 1); assert.deepEqual(s.documents[s.dictationId], original);
  const c = s.changes.find(c => c.mode === 'cleanup'); assert.equal(reviewItems(s).find(i => i.changeId === c.id).risk.level, 'Low');
  const editorial = createRevision(s, 'editorial'); assert.equal(editorial.proposals, 1); assert.equal(documentState(s).derived.length, 0);
  const proposal = s.changes.find(c => c.mode === 'editorial'); assert.equal(proposal.inputContext.output, 'Review proposals');
  assert.deepEqual(s.documents[s.dictationId], original); assert.deepEqual(s.dictations, source); assert.deepEqual(s.attempts, evidence); assert.deepEqual(compileContext(s), context);
  s.primer.topic = 'Changed after request'; assert.notEqual(proposal.inputContext.topic, s.primer.topic);
  assert.equal(applyChange(s, c.id).ok, true); assert.doesNotMatch(s.documents[s.dictationId][0].text, /Um,|Uh,/);
  assert.equal(s.documents[s.dictationId][0].provenance.kind, 'Cleanup'); assert.equal(s.documents[s.dictationId][0].provenance.acceptedBy, 'Human');
  assert.equal(applyChange(s, proposal.id).ok, false);
});

test('manual edits prevent cleanup and editorial proposals for protected passages', () => {
  const s = briefing(createState()); snapshotEdit(s); s.editedBlocks.add('brief-1'); s.documents[s.dictationId][0].text = 'Human-authored wording'; commitDocument(s, s.dictationId, 'Manual edit', 'Test edit');
  assert.equal(createRevision(s, 'cleanup').proposals, 0); assert.equal(createRevision(s, 'editorial').proposals, 0);
  assert.equal(s.documents[s.dictationId][0].text, 'Human-authored wording');
});

test('review, assembly, correction and provenance panels render with escaped content', () => {
  const s = briefing(createState()); buildAssembly(s); s.page = 'review';
  assert.match(renderApp(s), /Semantic review/); assert.match(renderApp(s), /Choose source & propose update/);
  createRevision(s, 'editorial'); s.changes.find(c => c.mode === 'editorial').after = '<script>unsafe</script>';
  s.reviewScope = s.dictationId; s.selectedReviewId = 'change:' + s.changes.find(c => c.mode === 'editorial').id;
  assert.match(renderApp(s), /&lt;script&gt;/); assert.ok(!renderApp(s).includes('<script>unsafe'));
  for (const dialog of ['assembly', 'revisions', 'provenance']) { s.modal = dialog; s.selectedBlockId = 'brief-1'; assert.match(modal(s), /role="dialog"/); }
});
