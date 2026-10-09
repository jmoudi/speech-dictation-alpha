import { INITIAL_DOCUMENT_VERSIONS } from '../fixtures/revision-data.js';
const clock = () => new Date().toLocaleTimeString([], { hour12: false });
export function documentState(s, id = s.dictationId) {
  return s.documentStates[id] ||= { version: 0, undo: [], history: [], journal: [], derived: [] };
}
export function initializeDocuments(s) {
  s.documentStates = {};
  for (const d of s.dictations) {
    const ds = documentState(s, d.id); ds.version = INITIAL_DOCUMENT_VERSIONS[d.id] || 1;
    for (const b of s.documents[d.id]) {
      const span = s.spans.find(p => p.dictationId === d.id && p.target[0] === b.start && p.target[1] === b.end);
      const attempt = span && s.attempts.find(a => a.spanId === span.id && a.state === 'Succeeded' && (a.targetSegments?.[0]?.text || a.resultText) === b.text);
      b.provenance = { kind: 'Recognition', attemptIds: attempt ? [attempt.id] : [], spanId: span?.id || null, source: 'Initial fixture transcript' };
    }
    ds.history.push({ id: `${d.id}-v${ds.version}`, version: ds.version, type: 'Initial transcript', time: 'Initial', blocks: structuredClone(s.documents[d.id]) });
  }
  Object.defineProperties(s, { version: { enumerable: true, get() { return documentState(this).version; }, set(v) { documentState(this).version = v; } }, undoStack: { enumerable: true, get() { return documentState(this).undo; } } });
}
export function journal(s, id, action, outcome, detail, provenance = {}) {
  const ds = documentState(s, id); ds.journal.push({ id: `${id}-event-${ds.journal.length + 1}`, time: clock(), version: ds.version, action, outcome, detail, ...provenance });
}
export function snapshotEdit(s, id = s.dictationId) {
  const ds = documentState(s, id), blockIds = new Set((s.documents[id] || []).map(b => b.id));
  ds.undo.push({ blocks: structuredClone(s.documents[id] || []), protected: [...s.editedBlocks].filter(key => blockIds.has(key)), changes: structuredClone(s.changes.filter(c => c.dictationId === id)), assemblyStates: s.assemblies.filter(p => p.dictationId === id).map(p => ({ id: p.id, steps: structuredClone(p.steps) })) });
}
export function commitDocument(s, id, type, detail, provenance = {}) {
  const ds = documentState(s, id); ds.version++;
  ds.history.push({ id: `${id}-v${ds.version}`, version: ds.version, type, time: clock(), blocks: structuredClone(s.documents[id] || []), ...provenance });
  journal(s, id, type, 'Applied', detail, provenance); return ds.version;
}
export function undoEdit(s) {
  const ds = documentState(s), old = ds.undo.pop(); if (!old) return false;
  const ids = new Set([...(s.documents[s.dictationId] || []), ...old.blocks].map(b => b.id));
  s.documents[s.dictationId] = old.blocks;
  for (const id of ids) s.editedBlocks.delete(id); for (const id of old.protected) s.editedBlocks.add(id);
  s.changes = [...s.changes.filter(c => c.dictationId !== s.dictationId), ...old.changes];
  for (const state of old.assemblyStates) { const plan = s.assemblies.find(p => p.id === state.id); if (plan) { plan.steps = state.steps; plan.expectedVersion = ds.version + 1; } }
  commitDocument(s, s.dictationId, 'Undo', 'Restored the preceding document state. Evidence and other dictations retained.'); return true;
}
export function applyChange(s, id) {
  const c = s.changes.find(c => c.id === id); if (!c || c.state !== 'pending') return { ok: false, reason: 'This change is no longer pending.' };
  const b = s.documents[c.dictationId]?.find(b => b.id === c.blockId);
  if (!b || !b.text.includes(c.before) || c.baseText && b.text !== c.baseText || s.editedBlocks.has(b.id)) { journal(s, c.dictationId, 'Revision proposal', 'Blocked', 'Base text changed or the passage has a manual edit.', { proposalId: id }); return { ok: false, reason: 'This passage was edited. Your text is protected; rebuild the proposal.' }; }
  snapshotEdit(s, c.dictationId); b.text = b.text.replace(c.before, c.after); b.revised = true;
  const ids = c.evidence.map(key => s.requests.find(r => r.id === key)?.attemptId || key).filter(key => s.attempts.some(a => a.id === key));
  b.provenance = { ...b.provenance, kind: c.mode === 'cleanup' ? 'Cleanup' : 'Recognition repair', proposalId: id, model: c.model, attemptIds: [...new Set([...(b.provenance?.attemptIds || []), ...ids])] };
  c.state = 'accepted'; commitDocument(s, c.dictationId, c.mode === 'cleanup' ? 'Cleanup' : 'Recognition repair', c.title, { proposalId: id, attemptIds: ids }); return { ok: true };
}
export function recordManualRevision(s, dictationId, blockId) {
  const ds = documentState(s, dictationId), b = s.documents[dictationId]?.find(b => b.id === blockId); if (!b) return;
  b.provenance = { ...b.provenance, kind: 'Human edit', protected: true };
  ds.history.push({ id: `${dictationId}-v${ds.version}`, version: ds.version, type: 'Manual edit', time: clock(), blocks: structuredClone(s.documents[dictationId]) });
  journal(s, dictationId, 'Manual edit', 'Applied', `Protected passage ${blockId}.`, { blockId });
}
