/** Illustrative domain records. No service responses, credentials, or real audio. */
export const POLITICAL_DICTATION = {
  id: 'political', title: 'Political report · coalition negotiations', date: 'Today, 18:10', group: 'Today', duration: 240,
  type: 'Microphone', language: 'English', tags: ['Report', 'Politics'], status: 'Processing gaps',
  waveform: Array.from({ length: 190 }, (_, i) => Math.round(8 + Math.abs(Math.sin(i * .7) * Math.cos(i * .21)) * 47)),
  markers: [{ time: 90, label: 'Unresolved passage' }, { time: 150, label: 'Fiscal policy' }],
  blocks: [
    { id: 'pol1', start: 0, end: 30, label: 'COALITION NEGOTIATIONS', text: 'This report separates the public negotiating positions from the commitments that appear in the draft agreement. The distinction matters when assessing whether the coalition can sustain a common legislative programme.' },
    { id: 'pol2', start: 30, end: 60, text: 'The smaller party has asked for a review clause. That would allow the fiscal commitments to be reconsidered after the first budget cycle, rather than treating the initial agreement as unconditional.' },
    { id: 'pol3', start: 60, end: 90, text: 'The published timetable leaves little room for consultation. The report should distinguish a procedural deadline from a substantive agreement on the underlying policy.' },
    { id: 'pol6', start: 150, end: 180, label: 'FISCAL POLICY', text: 'The fiscal chapter contains a spending ceiling but does not yet specify which programmes would absorb a shortfall. That uncertainty should remain explicit in the final assessment.' }
  ]
};
export const POLITICAL_PRIMER = { version: 12, topic: 'Political report on coalition negotiations, a review clause, and fiscal policy. Preserve distinctions between public statements and draft commitments.', scope: 'This dictation · current topic', languages: ['English'], recentSpeech: POLITICAL_DICTATION.blocks[2].text, terms: [{ id: 'pol-term-1', text: 'review clause', meaning: 'Provision to revisit coalition commitments', origin: 'You confirmed', state: 'active' }, { id: 'pol-term-2', text: 'fiscal ceiling', meaning: 'Upper limit for planned expenditure', origin: 'Primer model', state: 'proposed' }] };
export const ATTEMPT_SIMULATION = { elapsedMs: 1630, error: { code: 'HTTP_503', message: 'Provider unavailable after audio upload.', retryable: true }, text: 'The review clause does not constitute an unconditional commitment. The final report should preserve that qualification.', bytesPerSecond: 48000 };

export function createActivityFixtures(data) {
  const audioAssets = data.dictations.map(d => ({ id: 'audio-' + d.id, dictationId: d.id, name: d.title + '.wav', duration: d.duration, sampleRate: 48000, channels: 1, stored: true }));
  const spans = Array.from({ length: 8 }, (_, i) => ({ id: 'span-p' + (i + 1).toString().padStart(2, '0'), dictationId: 'political', audioId: 'audio-political', ordinal: i + 1, target: [i * 30, (i + 1) * 30], dependsOn: i === 6 ? ['span-p05'] : [] }));
  const contextSnapshots = [{ id: 'ctx-p12', version: 12, topic: POLITICAL_PRIMER.topic, prompt: POLITICAL_PRIMER.topic + '\nPrevious speech: ' + POLITICAL_PRIMER.recentSpeech, keywords: ['review clause'], policy: 'Fixed snapshot', created: '18:10:04' }, { id: 'ctx-p11', version: 11, topic: 'Coalition negotiations and fiscal policy.', prompt: 'Coalition negotiations and fiscal policy. Preserve qualifications.', keywords: ['review clause'], policy: 'Fixed snapshot', created: '18:09:52' }];
  const jobs = [
    { id: 'job-104', contextId: 'ctx-p12', dictationId: 'political', title: 'Primary transcription', kind: 'ASR', plan: 'Partitioned audio', model: 'gpt-transcribe', state: 'Running', spanIds: spans.map(s => s.id), created: '18:10:04', priority: 'Normal', concurrency: 3, contextPolicy: 'Fixed snapshot', output: 'Recognition evidence', dependsOnJobs: [], notes: 'Independent spans can complete out of audio order. Span 07 explicitly waits for span 05.' },
    { id: 'job-105', contextId: 'ctx-p12', dictationId: 'political', title: 'Compare unresolved passage', kind: 'ASR', plan: 'Selected span', model: 'gpt-4o-transcribe', state: 'Failed', spanIds: ['span-p04'], created: '18:10:12', priority: 'High', concurrency: 1, contextPolicy: 'Fixed snapshot', output: 'Comparison evidence', dependsOnJobs: [], notes: 'References the same target span as job-104. Failure is retained independently.' },
    { id: 'job-106', dictationId: 'political', title: 'Recognition repair', kind: 'Text correction', plan: 'Text revision', model: 'gpt-4.1-mini', state: 'Blocked', spanIds: [], created: '18:10:13', priority: 'Normal', concurrency: 1, contextPolicy: 'Primer v12', output: 'Review proposals', dependsOnJobs: ['job-104'], textTask: { input: 'Recognition transcript revision 8', baseVersion: 'Document v8', scope: '00:00–04:00', guard: 'Block until recognition coverage is complete; preserve manual edits.', result: null }, notes: 'Blocked by incomplete recognition coverage. No audio is transmitted by this job.' },
    { id: 'job-103', dictationId: 'political', title: 'Update topic primer', kind: 'Context', plan: 'Text analysis', model: 'gpt-4.1-mini', state: 'Complete', spanIds: [], created: '18:10:02', priority: 'Low', concurrency: 1, contextPolicy: 'Recognition only', output: 'Primer v12 · 1 proposed term', dependsOnJobs: [], textTask: { input: 'Recognition transcript revision 7', baseVersion: 'Primer v11', scope: 'Current topic', guard: 'Proposed terms require confirmation.', result: 'Primer v12 saved. “fiscal ceiling” proposed; not active.' }, notes: 'Document rewrites are excluded from primer input.' }
  ];
  const attempts = [], blobs = [];
  function add(id, spanId, state, submittedOrder, completedOrder, input, options = {}) {
    const span = spans.find(s => s.id === spanId);
    const blobId = options.blobId || 'blob-' + id;
    if (!blobs.some(b => b.id === blobId)) blobs.push({ id: blobId, audioId: span.audioId, input, bytes: (input[1] - input[0]) * 48000, format: 'PCM16 · mono · 24 kHz', digest: 'fixture:' + blobId, stored: true });
    const jobId = options.jobId || 'job-104';
    attempts.push({ id, jobId, spanId, number: attempts.filter(a => a.jobId === jobId && a.spanId === spanId).length + 1, state, submittedOrder, completedOrder, started: '18:10:' + String(4 + submittedOrder).padStart(2, '0'), ended: completedOrder ? '18:10:' + String(20 + completedOrder).padStart(2, '0') : null, elapsedMs: state === 'Running' ? null : 900 + submittedOrder * 170, input, blobId, contextId: options.contextId || 'ctx-p12', model: options.model || 'gpt-transcribe', error: state === 'Failed' ? options.error || { code: 'HTTP_503', message: 'Provider unavailable after audio upload.', retryable: true } : null, resultText: state === 'Succeeded' ? options.text || POLITICAL_DICTATION.blocks.find(b => b.start === span.target[0])?.text || ATTEMPT_SIMULATION.text : null, retryOf: options.retryOf || null, transmitted: true, params: { response_format: 'json', stream: true, temperature: 0 }, resultDisposition: state === 'Succeeded' ? 'Evidence stored; document application is separate' : 'No usable result' });
  }
  add('att-401', 'span-p01', 'Succeeded', 1, 1, [0, 36]);
  add('att-402', 'span-p02', 'Failed', 2, 2, [24, 66], { error: { code: 'HTTP_429', message: 'Rate limit exceeded. Retry-After: 2 seconds.', retryable: true } });
  add('att-403', 'span-p03', 'Succeeded', 3, 3, [54, 96]);
  add('att-404', 'span-p04', 'Failed', 4, 4, [84, 126]);
  add('att-405', 'span-p02', 'Succeeded', 5, 5, [24, 66], { retryOf: 'att-402', blobId: 'blob-att-402' });
  add('att-406', 'span-p04', 'Failed', 6, 6, [78, 132], { retryOf: 'att-404', contextId: 'ctx-p11', error: { code: 'TIMEOUT', message: 'No final response within the configured 30 s timeout.', retryable: true } });
  add('att-407', 'span-p05', 'Running', 7, null, [114, 156]);
  add('att-408', 'span-p06', 'Succeeded', 8, 7, [144, 186]);
  add('att-409', 'span-p04', 'Failed', 9, 8, [84, 126], { retryOf: 'att-406', blobId: 'blob-att-404' });
  add('att-410', 'span-p04', 'Failed', 10, 9, [80, 130], { jobId: 'job-105', model: 'gpt-4o-transcribe', error: { code: 'HTTP_502', message: 'Gateway returned an invalid upstream response.', retryable: true } });
  const mappings = [{ id: 'job-101', dictationId: 'architecture', title: 'Architecture · recognition', requestIds: ['req-017', 'req-018', 'req-023'] }, { id: 'job-102', dictationId: 'interview', title: 'Interview · selected range', requestIds: ['req-031'] }];
  for (const mapping of mappings) {
    const ids = [];
    for (const req of data.requests.filter(r => mapping.requestIds.includes(r.id))) {
      const spanId = 'span-' + req.id, blobId = 'blob-' + req.id, contextId = 'ctx-' + req.id;
      spans.push({ id: spanId, dictationId: mapping.dictationId, audioId: 'audio-' + mapping.dictationId, ordinal: ids.length + 1, target: [...req.target], dependsOn: [] }); ids.push(spanId);
      blobs.push({ id: blobId, audioId: 'audio-' + mapping.dictationId, input: [...req.input], bytes: (req.input[1] - req.input[0]) * 48000, format: req.format, digest: 'fixture:' + blobId, stored: true });
      contextSnapshots.push({ id: contextId, version: req.contextVersion, topic: data.primers[mapping.dictationId].topic, prompt: req.prompt, keywords: [...req.keywords], policy: 'Frozen request snapshot', created: req.created });
      attempts.push({ id: 'att-' + req.id, jobId: mapping.id, spanId, number: 1, state: 'Succeeded', submittedOrder: attempts.length + 1, completedOrder: attempts.length + 1, started: req.created, ended: req.created, elapsedMs: 1620, input: [...req.input], blobId, contextId, model: req.model, error: null, resultText: req.text, retryOf: null, transmitted: true, params: structuredClone(req.params), legacyRequestId: req.id, resultDisposition: 'Evidence stored' });
      req.jobId = mapping.id; req.spanId = spanId; req.attemptId = 'att-' + req.id;
    }
    jobs.push({ id: mapping.id, dictationId: mapping.dictationId, title: mapping.title, kind: 'ASR', plan: 'Selected windows', model: 'gpt-transcribe', state: 'Complete', spanIds: ids, created: '17:42:00', priority: 'Normal', concurrency: 3, contextPolicy: 'Latest available', output: 'Recognition evidence', dependsOnJobs: [], notes: 'Coverage is measured against this job’s target spans, not the full dictation.' });
  }
  for (const a of attempts.filter(a => a.jobId.startsWith('job-10') && a.spanId.startsWith('span-p'))) {
    const span = spans.find(p => p.id === a.spanId), blob = blobs.find(b => b.id === a.blobId), ctx = contextSnapshots.find(c => c.id === a.contextId);
    data.requests.push({ id: a.id, dictationId: span.dictationId, jobId: a.jobId, spanId: span.id, attemptId: a.id, kind: 'Recognition', model: a.model, purpose: span.id + ' · attempt ' + a.number, status: a.state === 'Succeeded' ? 'Complete' : a.state, input: [...a.input], target: [...span.target], duration: (a.input[1] - a.input[0]) + ' s', latency: a.elapsedMs ? (a.elapsedMs / 1000).toFixed(2) + ' s' : 'Pending', format: blob.format, bytes: (blob.bytes / 1e6).toFixed(2) + ' MB', created: a.started, contextVersion: ctx.version, prompt: ctx.prompt, keywords: [...ctx.keywords], text: a.resultText || (a.error ? a.error.code + ': ' + a.error.message : 'No final result.'), params: structuredClone(a.params), events: [{ time: a.started, event: a.state }] });
  }
  return { audioAssets, spans, jobs, attempts, blobs, contextSnapshots };
}
