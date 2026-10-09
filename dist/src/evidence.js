import { unionSeconds } from './activity-store.js';

export const spanAttempts = (state, spanId) => state.attempts.filter(a => a.spanId === spanId);
export function comparisonPair(state, spanId) {
  const candidates = spanAttempts(state, spanId);
  const saved = state.comparisons[spanId] || [];
  const successful = candidates.filter(a => a.state === 'Succeeded');
  const left = candidates.find(a => a.id === saved[0]) || successful[0] || candidates[0];
  const right = candidates.find(a => a.id === saved[1] && a.id !== left?.id) || successful.find(a => a.id !== left?.id) || candidates.find(a => a.id !== left?.id);
  return [left, right];
}
export function preferAttempt(state, id) {
  const attempt = state.attempts.find(a => a.id === id);
  if (!attempt || attempt.state !== 'Succeeded') return { ok: false, reason: 'Only successful recognition results can be preferred evidence.' };
  state.preferredEvidence[attempt.spanId] = id;
  return { ok: true };
}
export function missingRanges(ranges, duration) {
  let end = 0; const gaps = [];
  for (const [a, b] of ranges.map(r => [Math.max(0, r[0]), Math.min(duration, r[1])]).filter(r => r[1] > r[0]).sort((a, b) => a[0] - b[0])) {
    if (a > end) gaps.push([end, a]); end = Math.max(end, b);
  }
  if (end < duration) gaps.push([end, duration]); return gaps;
}
export function dictationCoverage(state, id) {
  const d = state.dictations.find(d => d.id === id), spans = state.spans.filter(p => p.dictationId === id);
  const evidenceRanges = spans.filter(p => state.attempts.some(a => a.spanId === p.id && a.state === 'Succeeded')).map(p => p.target);
  const documentRanges = (state.documents[id] || []).map(b => [b.start, b.end]);
  const documentGaps = missingRanges(documentRanges, d.duration);
  const boundaries = [...new Set(spans.flatMap(p => p.target))];
  const gaps = documentGaps.flatMap(([start, end]) => { const cuts = [start, ...boundaries.filter(x => x > start && x < end).sort((a, b) => a - b), end]; return cuts.slice(0, -1).map((a, i) => [a, cuts[i + 1]]); });
  return { evidence: unionSeconds(evidenceRanges), document: unionSeconds(documentRanges), duration: d.duration, missingEvidence: missingRanges(evidenceRanges, d.duration), documentGaps: gaps, jobs: state.jobs.filter(j => j.dictationId === id) };
}
export function gapExecution(state, id, range) {
  const spans = state.spans.filter(p => p.dictationId === id && p.target[0] < range[1] && p.target[1] > range[0]);
  const attempts = state.attempts.filter(a => spans.some(p => p.id === a.spanId));
  const success = attempts.find(a => a.state === 'Succeeded');
  const candidate = success || attempts.find(a => a.state === 'Running') || attempts.at(-1);
  return { state: success ? 'Evidence ready' : attempts.some(a => a.state === 'Running') ? 'Recognition running' : attempts.some(a => a.state === 'Failed') ? 'Recognition failed' : 'No recognition result', attempt: candidate, span: spans[0] };
}
// Word-level LCS. Bound work for imported transcripts; the UI exposes full raw text separately.
export function diffWords(left = '', right = '') {
  const a = left.match(/\S+\s*/g) || [], b = right.match(/\S+\s*/g) || [];
  if (a.length > 700 || b.length > 700) return { bounded: true, left: [{ text: left, changed: false }], right: [{ text: right, changed: false }], removed: 0, added: 0 };
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i].trim() === b[j].trim() ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const leftTokens = [], rightTokens = []; let i = 0, j = 0, removed = 0, added = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].trim() === b[j].trim()) { leftTokens.push({ text: a[i++], changed: false }); rightTokens.push({ text: b[j++], changed: false }); }
    else if (i < a.length && (j >= b.length || rows[i + 1][j] >= rows[i][j + 1])) { leftTokens.push({ text: a[i++], changed: true }); removed++; }
    else { rightTokens.push({ text: b[j++], changed: true }); added++; }
  }
  return { bounded: false, left: leftTokens, right: rightTokens, removed, added };
}
