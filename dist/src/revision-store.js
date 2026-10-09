import { selectedProfile, profileContext } from './profile-store.js';
import { diffWords } from './evidence.js';
import { documentState, snapshotEdit, commitDocument, journal } from './document-state.js';
export function targetText(attempt, span) {
  const segments = span && attempt?.targetSegments?.filter(x => x.range[0] >= span.target[0] && x.range[1] <= span.target[1]).sort((a, b) => a.range[0] - b.range[0]);
  if (!span || !segments?.length || segments[0].range[0] !== span.target[0] || segments.at(-1).range[1] !== span.target[1] || segments.some((x, i) => typeof x.text !== 'string' || x.range[1] <= x.range[0] || i && segments[i - 1].range[1] !== x.range[0])) return null;
  return segments.map(x => x.text).join(' ');
}
export function semanticRisk(before, after) {
  const diff = diffWords(before, after);
  if (diff.bounded) return { tags: ['Long text · manual review'], score: 80, level: 'High' };
  const changes = [...diff.left, ...diff.right].filter(t => t.changed).map(t => t.text.trim()), changed = changes.join(' '), tags = [];
  const has = re => re.test(changed);
  if (has(/\b(not|no|never|without|cannot|can['’]t|won['’]t|wouldn['’]t|shouldn['’]t|didn['’]t|isn['’]t|doesn['’]t|don['’]t|denied|refused)\b/i)) tags.push({ name: 'Negation', score: 100 });
  if (has(/\b(confirmed|denied|claimed|alleged|announced|reported|said|according)\b/i)) tags.push({ name: 'Attribution', score: 95 });
  if (has(/\d/)) tags.push({ name: 'Numbers', score: 85 });
  if (has(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\d{1,4}[\/.-]\d{1,2}/i) || /\d/.test(changed) && /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(before + ' ' + after)) tags.push({ name: 'Date', score: 85 });
  if (has(/\b(may|might|could|provisional|conditional|unconditional|unless|only|approximately)\b/i)) tags.push({ name: 'Qualification', score: 80 });
  const common = new Set(['The', 'This', 'That', 'A', 'An', 'We', 'I', 'They', 'It', 'With']);
  if (changes.some(word => /^[A-Z][a-z]{2,}/.test(word) && !common.has(word.replace(/[^A-Za-z]/g, '')))) tags.push({ name: 'Name / entity', score: 70 });
  if (!tags.length) tags.push({ name: diff.added || diff.removed ? 'Wording' : 'Formatting', score: diff.added || diff.removed ? 40 : 10 });
  return { tags: tags.map(t => t.name), score: Math.max(...tags.map(t => t.score)), level: Math.max(...tags.map(t => t.score)) >= 80 ? 'High' : Math.max(...tags.map(t => t.score)) >= 40 ? 'Medium' : 'Low' };
}
const evidenceFingerprint = (attempts, span) => attempts.map(a => a.id + ':' + (targetText(a, span) ?? a.resultText)).sort().join('|');
const normalized = text => text.trim().replace(/\s+/g, ' ');
export function buildAssembly(s, dictationId = s.dictationId, options = {}) {
  const ds = documentState(s, dictationId), blocks = s.documents[dictationId] || [];
  const spans = s.spans.filter(p => p.dictationId === dictationId && (!options.spanIds || options.spanIds.includes(p.id))).sort((a, b) => a.target[0] - b.target[0] || b.target[1] - a.target[1]);
  const steps = [], acceptedRanges = [];
  for (const span of spans) {
    const candidates = s.attempts.filter(a => a.spanId === span.id && a.state === 'Succeeded');
    if (!candidates.length) continue;
    const preferred = candidates.find(a => a.id === s.preferredEvidence[span.id]);
    const texts = [...new Set(candidates.map(a => targetText(a, span)).filter(x => x !== null).map(normalized))];
    const attempt = preferred || (texts.length === 1 ? candidates.find(a => targetText(a, span) !== null) : null);
    const existing = blocks.find(b => b.start === span.target[0] && b.end === span.target[1]);
    const base = { id: 'step-' + (steps.length + 1), spanId: span.id, target: [...span.target], candidateIds: candidates.map(a => a.id), selectionFingerprint: evidenceFingerprint(candidates, span), preferredAtBuild: s.preferredEvidence[span.id] || null, attemptId: attempt?.id || null, before: existing?.text || '', after: attempt ? targetText(attempt, span) : null, blockId: existing?.id || null, state: 'pending' };
    const decision = s.reviewDecisions[span.id], fingerprint = candidates.filter(a => targetText(a, span) !== null).map(a => a.id + ':' + targetText(a, span)).sort().join('|');
    if (texts.length > 1 && (!preferred || decision && decision.fingerprint !== fingerprint)) { steps.push({ ...base, operation: 'Conflict', reason: 'Competing target hypotheses require an explicit source choice.', risk: disagreementRisk(texts) }); continue; }
    if (!attempt || base.after === null) { steps.push({ ...base, operation: 'Mapping required', reason: 'Raw window text has no complete mapping to this target interval.' }); continue; }
    if (acceptedRanges.some(([a, b]) => a < span.target[1] && b > span.target[0])) { steps.push({ ...base, operation: 'Overlapping target', reason: 'Another selected target covers this interval. Split or resolve target boundaries before insertion.' }); continue; }
    if (existing && s.editedBlocks.has(existing.id)) { steps.push({ ...base, operation: 'Protected', reason: 'This passage contains a manual edit.' }); acceptedRanges.push(span.target); continue; }
    if (existing && normalized(existing.text) === normalized(base.after)) { steps.push({ ...base, operation: 'Unchanged', state: 'unchanged', reason: 'Document already contains this target hypothesis.' }); acceptedRanges.push(span.target); continue; }
    if (existing && options.mode !== 'refresh') { steps.push({ ...base, operation: 'Existing text', reason: 'Fill-gaps mode preserves existing passages. Use refresh to propose replacements.' }); acceptedRanges.push(span.target); continue; }
    if (!existing && blocks.some(b => b.start < span.target[1] && b.end > span.target[0])) { steps.push({ ...base, operation: 'Overlapping document', reason: 'Target intersects existing text without matching its full interval.' }); continue; }
    steps.push({ ...base, operation: existing ? 'Replace' : 'Insert', reason: existing ? 'Refresh from explicitly selected recognition evidence.' : 'Insert mapped target text into a document gap.', risk: existing ? semanticRisk(base.before, base.after) : { tags: ['Insertion'], score: 20, level: 'Low' } });
    acceptedRanges.push(span.target);
  }
  const plan = { id: 'assembly-' + (s.assemblies.length + 1), dictationId, baseVersion: ds.version, expectedVersion: ds.version, mode: options.mode || 'gaps', created: new Date().toLocaleTimeString([], { hour12: false }), steps };
  const spanIds = new Set(steps.map(x => x.spanId));
  for (const previous of s.assemblies.filter(p => p.dictationId === dictationId)) for (const old of previous.steps) if (old.state === 'pending' && spanIds.has(old.spanId)) old.state = 'superseded';
  s.assemblies.push(plan); s.selectedAssemblyId = plan.id;
  journal(s, dictationId, 'Assembly preview', 'Proposed', `${steps.filter(x => ['Insert', 'Replace'].includes(x.operation)).length} actionable passages.`, { planId: plan.id }); return plan;
}
export function applyAssemblyStep(s, planId, stepId) {
  const plan = s.assemblies.find(p => p.id === planId), step = plan?.steps.find(x => x.id === stepId);
  if (!step || !['Insert', 'Replace'].includes(step.operation) || step.state !== 'pending') return { ok: false, reason: 'This assembly step is not actionable.' };
  const ds = documentState(s, plan.dictationId), blocks = s.documents[plan.dictationId];
  if (ds.version !== plan.expectedVersion) { journal(s, plan.dictationId, 'Assembly', 'Blocked', 'Document version changed; rebuild the preview.', { planId, stepId }); return { ok: false, reason: 'Document changed after this preview. Rebuild assembly before applying.' }; }
  const span = s.spans.find(p => p.id === step.spanId), candidates = s.attempts.filter(a => a.spanId === step.spanId && a.state === 'Succeeded');
  if (step.selectionFingerprint !== evidenceFingerprint(candidates, span) || step.preferredAtBuild !== (s.preferredEvidence[step.spanId] || null)) { journal(s, plan.dictationId, 'Assembly', 'Blocked', 'Recognition evidence or source choice changed; rebuild the preview.', { planId, stepId }); return { ok: false, reason: 'Evidence or preferred source changed. Rebuild this assembly preview.' }; }
  const block = step.blockId && blocks.find(b => b.id === step.blockId);
  if (step.operation === 'Replace' && (!block || block.text !== step.before || s.editedBlocks.has(block.id)) || step.operation === 'Insert' && blocks.some(b => b.start < step.target[1] && b.end > step.target[0])) { journal(s, plan.dictationId, 'Assembly', 'Blocked', 'Target passage changed, overlaps text, or is protected.', { planId, stepId }); return { ok: false, reason: 'The target passage changed or is protected. Rebuild the preview.' }; }
  snapshotEdit(s, plan.dictationId);
  const provenance = { kind: 'Assembly', attemptIds: [step.attemptId], spanId: step.spanId, planId, target: [...step.target], mapping: 'Explicit target segments; input-window context excluded' };
  if (block) { block.text = step.after; block.revised = true; block.provenance = provenance; }
  else blocks.push({ id: `${plan.dictationId}-${plan.id}-${step.id}`, start: step.target[0], end: step.target[1], text: step.after, revised: true, provenance });
  blocks.sort((a, b) => a.start - b.start); step.state = 'applied'; plan.expectedVersion = commitDocument(s, plan.dictationId, 'Assembly', `${step.operation}: ${step.spanId}`, { planId, stepId, attemptIds: [step.attemptId] }); return { ok: true };
}
export function applyReadyAssembly(s, planId) { const p = s.assemblies.find(p => p.id === planId); let applied = 0; for (const step of p?.steps || []) if (step.state === 'pending' && ['Insert', 'Replace'].includes(step.operation)) { const result = applyAssemblyStep(s, planId, step.id); if (!result.ok) return { ok: false, applied, reason: result.reason }; applied++; } return { ok: true, applied }; }
export function createRevision(s, mode, dictationId = s.dictationId) {
  const ds = documentState(s, dictationId), blocks = s.documents[dictationId], selected = selectedProfile(s, 'corrector', dictationId);
  const profile = structuredClone(selected), inputContext = { ...profileContext(s, profile, dictationId), revision_mode: mode };
  
  const matches = blocks.map(b => ({ block: b, template: mode === 'repair' ? s.repairTemplates.find(t => t.dictationId === dictationId && t.blockId === b.id && b.text.includes(t.before)) : s.revisionTemplates.find(t => t.dictationId === dictationId && t.mode === mode && t.before === b.text) })).filter(x => x.template && !s.editedBlocks.has(x.block.id));
  const jobId = 'correction-' + (s.jobs.filter(j => j.id.startsWith('correction-')).length + 1);
  let count = 0;
  for (const { block: b, template: t } of matches) {
    if (s.changes.some(c => c.dictationId === dictationId && c.blockId === b.id && c.mode === mode && c.state === 'pending' && c.profileSnapshot?.id === profile.id && c.profileSnapshot?.version === profile.version)) continue;
    s.changes.push({ id: 'revision-' + (s.changes.length + 1), dictationId, blockId: b.id, mode, type: mode === 'cleanup' ? 'Cleanup' : mode === 'repair' ? t.type : 'Editorial', title: mode === 'cleanup' ? 'Remove spoken fillers' : mode === 'repair' ? t.title : 'Suggested editorial rewrite', before: mode === 'repair' ? t.before : b.text, after: t.after, baseText: b.text, baseVersion: 'v' + ds.version, explanation: t.explanation, evidence: [...(b.provenance?.attemptIds || [])], time: [b.start, b.end], state: 'pending', model: profile.model, profileSnapshot: structuredClone(profile), inputContext: structuredClone(inputContext), jobId }); count++;
  }
  if (count) s.jobs.unshift({ id: jobId, dictationId, title: 'Correction suggestions · ' + profile.name, kind: 'Text correction', plan: mode, model: profile.model, state: 'Complete', spanIds: [], created: new Date().toLocaleTimeString([], { hour12: false }), priority: 'Normal', concurrency: 1, contextPolicy: 'Frozen profile and primer', output: count + ' review proposals', dependsOnJobs: [], profileSnapshot: structuredClone(profile), textTask: { input: 'Working document v' + ds.version, baseVersion: ds.version, scope: 'Unprotected passages with matching fixtures', guard: 'Suggestions only; human acceptance required', result: count + ' proposals', inputContext: structuredClone(inputContext) }, initiatedFrom: 'Dictation', notes: 'Illustrative corrector output. No document text was modified.' });
  journal(s, dictationId, 'Corrector · ' + mode, 'Proposed', `${count} fixture proposals; working document retained.`, { jobId: count ? jobId : null, profileId: profile.id, profileVersion: profile.version }); return { mode, proposals: s.changes.filter(c => c.dictationId === dictationId && c.mode === mode && c.state === 'pending' && c.profileSnapshot?.id === profile.id && c.profileSnapshot?.version === profile.version).length, created: count };
}
export const currentDerived = s => documentState(s).derived.find(d => d.id === s.selectedDerivedId) || documentState(s).derived.at(-1);
function disagreementRisk(texts) {
  const risks = texts.slice(1).map(text => semanticRisk(texts[0], text)), highest = risks.reduce((a, b) => a.score >= b.score ? a : b);
  return { ...highest, tags: [...new Set(risks.flatMap(r => r.tags))] };
}
export function reviewItems(s) {
  const items = [];
  for (const c of s.changes) items.push({ id: 'change:' + c.id, kind: 'Revision', dictationId: c.dictationId, title: c.title, before: c.before, after: c.after, range: c.time, risk: c.mode === 'cleanup' ? { tags: ['Cleanup'], score: 10, level: 'Low' } : c.type === 'Terminology' ? { tags: ['Terminology'], score: 25, level: 'Low' } : semanticRisk(c.before, c.after), state: c.state === 'pending' ? 'Pending' : 'Resolved', changeId: c.id, explanation: c.explanation, evidence: c.evidence, model: c.model, mode: c.mode, profileSnapshot: c.profileSnapshot, inputContext: c.inputContext });
  for (const span of s.spans) {
    const a = s.attempts.filter(a => a.spanId === span.id && a.state === 'Succeeded' && targetText(a, span) !== null), texts = [...new Set(a.map(x => normalized(targetText(x, span))))];
    if (texts.length < 2) continue;
    const fingerprint = a.map(x => x.id + ':' + targetText(x, span)).sort().join('|'), decision = s.reviewDecisions[span.id];
    items.push({ id: 'span:' + span.id, kind: 'Disagreement', dictationId: span.dictationId, title: 'Competing recognition hypotheses', before: texts[0], after: texts[1], range: span.target, risk: disagreementRisk(texts), state: decision?.fingerprint === fingerprint ? 'Resolved' : 'Pending', spanId: span.id, fingerprint, candidates: a.map(x => x.id), explanation: 'Different successful attempts disagree. Choose evidence after reviewing the target and surrounding audio.' });
  }
  for (const p of s.assemblies) for (const step of p.steps) if (['Insert', 'Replace'].includes(step.operation) && ['pending', 'applied'].includes(step.state)) items.push({ id: `${p.id}:${step.id}`, kind: 'Assembly', dictationId: p.dictationId, title: step.operation + ' target text', before: step.before, after: step.after, range: step.target, risk: step.risk, state: step.state === 'applied' ? 'Resolved' : 'Pending', planId: p.id, stepId: step.id, explanation: step.reason, candidates: [step.attemptId] });
  return items.sort((a, b) => b.risk.score - a.risk.score || a.range[0] - b.range[0]);
}
export function chooseReviewEvidence(s, itemId, attemptId) {
  const item = reviewItems(s).find(i => i.id === itemId), attempt = s.attempts.find(a => a.id === attemptId);
  if (!item || item.kind !== 'Disagreement' || !item.candidates.includes(attemptId)) return { ok: false, reason: 'Attempt is not a candidate for this disagreement.' };
  s.preferredEvidence[item.spanId] = attemptId;
  s.reviewDecisions[item.spanId] = { fingerprint: item.fingerprint, attemptId, outcome: 'Source selected' };
  journal(s, item.dictationId, 'Semantic review', 'Source selected', item.risk.tags.join(', '), { spanId: item.spanId, attemptIds: [attemptId] });
  const plan = buildAssembly(s, item.dictationId, { mode: 'refresh', spanIds: [item.spanId] });
  return { ok: true, plan, attempt };
}
