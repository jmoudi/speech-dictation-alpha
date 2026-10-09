import { ATTEMPT_SIMULATION } from '../fixtures/activity-data.js';

export const activityInitialState = () => ({ selectedJobId: 'job-104', selectedSpanId: 'span-p02', selectedAttemptId: 'att-405', activityTab: 'pipeline', attemptTab: 'details', jobFilter: 'All', jobDictationFilter: 'all', jobQuery: '', spanFilter: 'All', attemptFilter: 'All', attemptSort: 'submitted', activityEvents: [], comparisons: {}, preferredEvidence: {}, activityInspectorOpen: true, retrySpanId: null });
export const jobAttempts = (s, id) => s.attempts.filter(a => a.jobId === id);
export const jobSpans = (s, id) => { const j = s.jobs.find(j => j.id === id); return (j?.spanIds || []).map(id => s.spans.find(p => p.id === id)).filter(Boolean); };
export function unionSeconds(ranges) {
  const sorted = ranges.filter(r => r[1] > r[0]).map(r => [...r]).sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity;
  for (const [start, stop] of sorted) { total += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop); }
  return total;
}
export function spanStatus(s, jobId, spanId) {
  const attempts = jobAttempts(s, jobId).filter(a => a.spanId === spanId);
  if (attempts.some(a => a.state === 'Succeeded')) return attempts.some(a => a.state === 'Failed') ? 'Recovered' : 'Succeeded';
  if (attempts.some(a => a.state === 'Running')) return 'Running';
  if (s.jobs.find(j => j.id === jobId)?.state === 'Cancelled' && (!attempts.length || attempts.at(-1).state === 'Cancelled')) return 'Cancelled';
  const pendingSpan = s.spans.find(p => p.id === spanId);
  if (pendingSpan?.dependsOn.some(id => !jobAttempts(s, jobId).some(a => a.spanId === id && a.state === 'Succeeded'))) return 'Blocked';
  if (attempts.some(a => a.state === 'Queued')) return 'Queued';
  if (attempts.length) return attempts.at(-1).state;
  const j = s.jobs.find(j => j.id === jobId), span = s.spans.find(p => p.id === spanId);
  if (j?.state === 'Cancelled') return 'Cancelled';
  if (span?.dependsOn.some(id => !jobAttempts(s, jobId).some(a => a.spanId === id && a.state === 'Succeeded'))) return 'Blocked';
  return 'Queued';
}
export function jobMetrics(s, id) {
  const spans = jobSpans(s, id), attempts = jobAttempts(s, id);
  const ok = spans.filter(p => attempts.some(a => a.spanId === p.id && a.state === 'Succeeded'));
  const total = unionSeconds(spans.map(p => p.target)), covered = unionSeconds(ok.map(p => p.target));
  return { total, covered, progress: total ? covered / total * 100 : null, succeeded: ok.length, spanCount: spans.length, attempts: attempts.length, failedAttempts: attempts.filter(a => a.state === 'Failed').length, failedSpans: spans.filter(p => spanStatus(s, id, p.id) === 'Failed').length, transmitted: attempts.filter(a => a.transmitted).reduce((n, a) => n + a.input[1] - a.input[0], 0), active: attempts.filter(a => a.state === 'Running').length, retries: attempts.filter(a => a.retryOf).length };
}
export function selectJob(s, id) {
  const job = s.jobs.find(j => j.id === id); if (!job) { s.selectedJobId = null; s.selectedSpanId = null; s.selectedAttemptId = null; return; }
  s.selectedJobId = id; s.selectedSpanId = job.spanIds[0] || null; s.selectedAttemptId = jobAttempts(s, id).find(a => a.spanId === s.selectedSpanId)?.id || null;
  s.spanFilter = 'All'; s.attemptFilter = 'All'; s.attemptTab = 'details';
}
export function selectSpan(s, id) { s.selectedSpanId = id; s.selectedAttemptId = jobAttempts(s, s.selectedJobId).filter(a => a.spanId === id).at(-1)?.id || null; s.attemptTab = 'details'; }
export function visibleJobs(s) { return s.jobs.filter(j => (s.jobFilter === 'All' || j.state === s.jobFilter || s.jobFilter === 'Needs attention' && ['Failed', 'Blocked'].includes(j.state)) && (s.jobDictationFilter === 'all' || j.dictationId === s.jobDictationFilter) && (j.id + ' ' + j.title + ' ' + s.dictations.find(d => d.id === j.dictationId)?.title).toLowerCase().includes(s.jobQuery.toLowerCase())); }
function log(s, jobId, kind, message) { s.activityEvents.push({ id: 'event-' + s.activityEvents.length, jobId, kind, message, time: new Date().toLocaleTimeString([], { hour12: false }) }); }
function nextId(list, prefix) { let n = list.length + 1; while (list.some(x => x.id === prefix + n)) n++; return prefix + n; }
export function queueAttempt(s, jobId, spanId, options = {}) {
  const job = s.jobs.find(j => j.id === jobId), span = s.spans.find(p => p.id === spanId);
  if (!job || !span || !job.spanIds.includes(spanId)) return { ok: false, reason: 'Job or span not found.' };
  if (job.state === 'Cancelled') return { ok: false, reason: 'Cancelled jobs are immutable. Create another job.' };
  const previous = jobAttempts(s, jobId).filter(a => a.spanId === spanId);
  if (previous.some(a => ['Queued', 'Running'].includes(a.state))) return { ok: false, reason: 'An attempt is already queued or running for this span.' };
  const last = previous.at(-1), asset = s.audioAssets.find(a => a.id === span.audioId);
  let blob = last && s.blobs.find(b => b.id === last.blobId);
  if (!asset) return { ok: false, reason: 'Audio asset not found.' };
  const custom = options.before !== undefined || options.after !== undefined;
  const before = custom ? Number(options.before || 0) : options.expanded ? 12 : 6;
  const after = custom ? Number(options.after || 0) : options.expanded ? 12 : 6;
  if (![before, after].every(n => Number.isFinite(n) && n >= 0 && n <= 120)) return { ok: false, reason: 'Evidence padding must be between 0 and 120 seconds.' };
  if (!blob || options.expanded || custom) {
    const input = [Math.max(0, span.target[0] - before), Math.min(asset.duration, span.target[1] + after)];
    blob = { id: nextId(s.blobs, 'blob-local-'), audioId: span.audioId, input, bytes: (input[1] - input[0]) * ATTEMPT_SIMULATION.bytesPerSecond, format: 'PCM16 · mono · 24 kHz', digest: 'fixture:local-preparation', stored: true }; s.blobs.push(blob);
  }
  let contextId = last?.contextId || job.contextId;
  if (!contextId || options.currentContext || job.contextPolicy === 'Latest available' && !last) {
    const p = s.primers[job.dictationId]; contextId = nextId(s.contextSnapshots, 'ctx-local-');
    s.contextSnapshots.push({ id: contextId, version: p.version, topic: p.topic, prompt: p.topic + (p.recentSpeech ? '\nPrevious speech: ' + p.recentSpeech : ''), keywords: p.terms.filter(t => t.state === 'active').map(t => t.text), policy: job.contextPolicy, created: new Date().toLocaleTimeString() });
  }
  const attempt = { id: nextId(s.attempts, 'att-local-'), jobId, spanId, number: previous.length + 1, state: 'Queued', submittedOrder: null, completedOrder: null, started: null, ended: null, elapsedMs: null, input: [...blob.input], blobId: blob.id, contextId, model: options.model || job.model, error: null, resultText: null, retryOf: last?.id || null, transmitted: false, params: { response_format: 'json', stream: true, simulated: true }, resultDisposition: 'No result yet' };
  s.attempts.push(attempt); syncRequestProjection(s, attempt); if (job.state !== 'Paused') job.state = 'Running';
  log(s, jobId, 'queued', `${attempt.id} queued for ${spanId}${last ? '; prior attempt ' + last.id + ' retained' : ''}.`);
  s.selectedAttemptId = attempt.id; s.selectedSpanId = spanId; return { ok: true, attempt };
}
export function retryFailed(s, jobId) { let count = 0; for (const span of jobSpans(s, jobId)) if (spanStatus(s, jobId, span.id) === 'Failed' && queueAttempt(s, jobId, span.id).ok) count++; return count; }
export function startAttempt(s, id) {
  const a = s.attempts.find(a => a.id === id); if (!a || a.state !== 'Queued') return { ok: false, reason: 'Only queued attempts can be dispatched.' };
  const j = s.jobs.find(j => j.id === a.jobId), p = s.spans.find(p => p.id === a.spanId);
  if (['Paused', 'Cancelled', 'Blocked'].includes(j.state)) return { ok: false, reason: 'Job dispatch is ' + j.state.toLowerCase() + '.' };
  if (p.dependsOn.some(id => !jobAttempts(s, j.id).some(a => a.spanId === id && a.state === 'Succeeded'))) return { ok: false, reason: 'Required preceding span has no successful result.' };
  if (jobAttempts(s, j.id).filter(a => a.state === 'Running').length >= j.concurrency) return { ok: false, reason: 'All concurrency slots are occupied.' };
  a.state = 'Running'; a.transmitted = true; a.started = new Date().toLocaleTimeString([], { hour12: false }); a.submittedOrder = Math.max(0, ...s.attempts.map(a => a.submittedOrder || 0)) + 1;
  j.state = 'Running'; syncRequestProjection(s, a); log(s, j.id, 'dispatched', a.id + ' started for ' + p.id + '.'); return { ok: true };
}
export function dispatchReady(s, jobId) {
  const j = s.jobs.find(j => j.id === jobId); if (!j || j.kind !== 'ASR' || ['Paused', 'Cancelled', 'Blocked'].includes(j.state)) return { started: 0, queued: 0 };
  let queued = 0, started = 0;
  for (const p of jobSpans(s, jobId)) {
    const attempts = jobAttempts(s, jobId).filter(a => a.spanId === p.id);
    if (!attempts.length && spanStatus(s, jobId, p.id) === 'Queued') { if (queueAttempt(s, jobId, p.id).ok) queued++; }
  }
  for (const a of jobAttempts(s, jobId).filter(a => a.state === 'Queued')) if (startAttempt(s, a.id).ok) started++;
  return { started, queued };
}
export function settleAttempt(s, id, success) {
  const a = s.attempts.find(a => a.id === id); if (!a || !['Queued', 'Running'].includes(a.state)) return { ok: false, reason: 'Only pending attempts can be simulated.' };
  const j = s.jobs.find(j => j.id === a.jobId), span = s.spans.find(p => p.id === a.spanId);
  if (j.state === 'Paused' && a.state === 'Queued') return { ok: false, reason: 'Resume dispatch before running a queued attempt.' };
  if (span.dependsOn.some(id => !jobAttempts(s, j.id).some(a => a.spanId === id && a.state === 'Succeeded'))) return { ok: false, reason: 'Required preceding span has no successful result.' };
  if (a.state === 'Queued') { const started = startAttempt(s, id); if (!started.ok) return started; }
  a.submittedOrder ??= Math.max(0, ...s.attempts.map(a => a.submittedOrder || 0)) + 1;
  a.completedOrder = Math.max(0, ...s.attempts.map(a => a.completedOrder || 0)) + 1;
  a.started ||= new Date().toLocaleTimeString([], { hour12: false }); a.ended = new Date().toLocaleTimeString([], { hour12: false }); a.transmitted = true; a.elapsedMs = ATTEMPT_SIMULATION.elapsedMs;
  a.state = success ? 'Succeeded' : 'Failed'; a.error = success ? null : structuredClone(ATTEMPT_SIMULATION.error); a.resultText = success ? ATTEMPT_SIMULATION.text : null; a.resultDisposition = success ? 'Evidence stored; not applied to the document' : 'No usable result';
  syncRequestProjection(s, a);
  log(s, j.id, success ? 'succeeded' : 'failed', `${a.id}: ${a.state.toLowerCase()}.`);
  const metrics = jobMetrics(s, j.id);
  if (metrics.succeeded === metrics.spanCount && !jobAttempts(s, j.id).some(a => ['Queued', 'Running'].includes(a.state))) j.state = 'Complete';
  else if (j.state !== 'Paused') j.state = jobSpans(s, j.id).every(p => ['Succeeded', 'Recovered', 'Failed', 'Cancelled'].includes(spanStatus(s, j.id, p.id))) ? 'Failed' : 'Running';
  for (const dependent of s.jobs.filter(q => q.state === 'Blocked' && q.dependsOnJobs?.includes(j.id))) if (dependent.dependsOnJobs.every(id => s.jobs.find(q => q.id === id)?.state === 'Complete')) dependent.state = 'Queued';
  return { ok: true };
}
export function cancelJob(s, id) { const j = s.jobs.find(j => j.id === id); if (!j || ['Complete', 'Cancelled'].includes(j.state)) return false; j.state = 'Cancelled'; for (const a of jobAttempts(s, id)) if (['Queued', 'Running'].includes(a.state)) { a.state = 'Cancelled'; a.ended = new Date().toLocaleTimeString(); a.resultDisposition = 'Cancelled; partial result not applied'; syncRequestProjection(s, a); } log(s, id, 'cancelled', 'Dispatch cancelled. Completed attempts and failures retained.'); return true; }
export function toggleJob(s, id) { const j = s.jobs.find(j => j.id === id); if (!j || !['Running', 'Paused', 'Queued'].includes(j.state)) return false; j.state = j.state === 'Paused' ? 'Running' : 'Paused'; log(s, id, 'scheduler', j.state === 'Paused' ? 'Dispatch paused; in-flight attempts may finish.' : 'Dispatch resumed.'); return true; }
export function createJob(s, { dictationId, start, end, parts = 1, model, contextPolicy, output }) {
  const dictation = s.dictations.find(d => d.id === dictationId);
  if (!dictation || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > dictation.duration || end <= start) return { ok: false, reason: 'Enter a target range within the dictation’s audio duration.' };
  const count = Math.max(1, Math.min(100, Math.floor(parts) || 1));
  const audioId = 'audio-' + dictationId;
  if (!s.audioAssets.some(a => a.id === audioId)) s.audioAssets.push({ id: audioId, dictationId, duration: dictation.duration, name: dictation.title, sampleRate: 48000, channels: 1, stored: true });
  const ids = [];
  for (let i = 0; i < count; i++) {
    const target = [start + (end - start) * i / count, start + (end - start) * (i + 1) / count];
    let span = s.spans.find(p => p.audioId === audioId && p.target[0] === target[0] && p.target[1] === target[1] && !p.dependsOn.length);
    if (!span) { span = { id: nextId(s.spans, 'span-local-'), dictationId, audioId, ordinal: i + 1, target, dependsOn: [] }; s.spans.push(span); }
    ids.push(span.id);
  }
  const primer = s.primers[dictationId], contextId = nextId(s.contextSnapshots, 'ctx-local-');
  s.contextSnapshots.push({ id: contextId, version: primer.version, topic: primer.topic, prompt: primer.topic + (primer.recentSpeech ? '\nPrevious speech: ' + primer.recentSpeech : ''), keywords: primer.terms.filter(t => t.state === 'active').map(t => t.text), policy: contextPolicy, created: new Date().toLocaleTimeString() });
  const job = { id: nextId(s.jobs, 'job-local-'), contextId, dictationId, title: 'Recognition · ' + (count === 1 ? 'selected span' : count + ' target spans'), kind: 'ASR', plan: count === 1 ? 'One audio span' : 'Partitioned audio', model, contextPolicy, output, state: 'Queued', spanIds: ids, created: new Date().toLocaleTimeString([], { hour12: false }), priority: 'Normal', concurrency: 3, dependsOnJobs: [], notes: 'Created in this mock-up. Each attempt is simulated explicitly; the dictation document remains unchanged.' };
  s.jobs.unshift(job); log(s, job.id, 'created', `Job created for ${dictationId}; ${ids.length} target spans.`); selectJob(s, job.id); return { ok: true, job };
}

// Compatibility projection for the workspace's request inspector. Activity owns
// normalized job/span/attempt records; the original request text is retained.
export function registerRequest(s, request) {
  if (request.attemptId) return;
  const d = s.dictations.find(d => d.id === request.dictationId), audioId = 'audio-' + d.id;
  if (!s.audioAssets.some(a => a.id === audioId)) s.audioAssets.push({ id: audioId, dictationId: d.id, duration: d.duration, name: d.title, stored: true, sampleRate: 48000, channels: 1 });
  else s.audioAssets.find(a => a.id === audioId).duration = d.duration;
  const spanId = nextId(s.spans, 'span-local-'), blobId = nextId(s.blobs, 'blob-local-'), contextId = nextId(s.contextSnapshots, 'ctx-local-'), jobId = nextId(s.jobs, 'job-local-'), attemptId = nextId(s.attempts, 'att-local-');
  s.spans.push({ id: spanId, dictationId: d.id, audioId, target: [...request.target], ordinal: 1, dependsOn: [] });
  s.blobs.push({ id: blobId, audioId, input: [...request.input], bytes: (request.input[1] - request.input[0]) * ATTEMPT_SIMULATION.bytesPerSecond, format: request.format, stored: true, digest: 'fixture:simulated-capture' });
  s.contextSnapshots.push({ id: contextId, version: request.contextVersion, topic: s.primers[d.id].topic, prompt: request.prompt, keywords: [...request.keywords], policy: 'Frozen request snapshot', profileSnapshot: structuredClone(request.profileSnapshot), created: request.created });
  s.jobs.unshift({ id: jobId, dictationId: d.id, title: request.purpose, profileSnapshot: structuredClone(request.profileSnapshot), kind: 'ASR', plan: 'Selected window', model: request.model, state: 'Complete', spanIds: [spanId], contextId, created: request.created, priority: 'Normal', concurrency: 1, contextPolicy: 'Frozen request snapshot', output: 'Recognition evidence', dependsOnJobs: [], notes: 'Simulated request from the workspace. The job is tracked independently of the dictation.' });
  s.attempts.push({ id: attemptId, jobId, spanId, number: 1, state: 'Succeeded', submittedOrder: Math.max(0, ...s.attempts.map(a => a.submittedOrder || 0)) + 1, completedOrder: Math.max(0, ...s.attempts.map(a => a.completedOrder || 0)) + 1, started: request.created, ended: request.created, elapsedMs: ATTEMPT_SIMULATION.elapsedMs, input: [...request.input], blobId, contextId, model: request.model, error: null, resultText: request.text, retryOf: null, transmitted: true, params: structuredClone(request.params), resultDisposition: 'Simulated evidence stored', legacyRequestId: request.id, profileSnapshot: structuredClone(request.profileSnapshot) });
  Object.assign(request, { jobId, spanId, attemptId });
}

export function syncRequestProjection(s, a) {
  const span = s.spans.find(p => p.id === a.spanId), blob = s.blobs.find(b => b.id === a.blobId), ctx = s.contextSnapshots.find(c => c.id === a.contextId);
  if (!span || !blob || !ctx) return;
  const value = { id: a.legacyRequestId || a.id, dictationId: span.dictationId, jobId: a.jobId, spanId: span.id, attemptId: a.id, kind: 'Recognition', model: a.model, purpose: span.id + ' · attempt ' + a.number, status: a.state === 'Succeeded' ? 'Complete' : a.state, input: [...a.input], target: [...span.target], duration: (a.input[1] - a.input[0]) + ' s', latency: a.elapsedMs ? (a.elapsedMs / 1000).toFixed(2) + ' s' : 'Pending', format: blob.format, bytes: (blob.bytes / 1e6).toFixed(2) + ' MB', created: a.started || 'Not dispatched', contextVersion: ctx.version, prompt: ctx.prompt, keywords: a.model === 'gpt-4o-transcribe' ? [] : [...ctx.keywords], text: a.resultText || (a.error ? a.error.code + ': ' + a.error.message : 'No final result.'), params: structuredClone(a.params), events: [{ time: a.started || 'Pending', event: a.state }] };
  if (a.model === 'gpt-4o-transcribe') value.prompt += '\nRelevant terms: ' + ctx.keywords.join(', ');
  const previous = s.requests.find(r => r.id === value.id); if (previous) Object.assign(previous, value); else s.requests.unshift(value);
}
