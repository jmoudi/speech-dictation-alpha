/** Illustrative revision inputs and outputs. No text-generation service is connected. */
export const INITIAL_DOCUMENT_VERSIONS = { architecture: 12, political: 8, interview: 3, planning: 2, 'assembly-demo': 1 };
const briefing = [
  'Um, the briefing has three sections. Uh, record the negotiating position, the budget timetable, and the review procedure.',
  'The negotiating position is provisional. The review clause allows the commitments to be reconsidered after the first budget cycle.',
  'The minister confirmed a budget of 3.2 billion euros on 14 May. This statement should be attributed to the minister rather than presented as an independently verified fact.'
];
export const REVISION_TEMPLATES = [
  { dictationId: 'assembly-demo', mode: 'cleanup', before: briefing[0], after: 'The briefing has three sections. Record the negotiating position, the budget timetable, and the review procedure.', explanation: 'Remove the two spoken fillers; preserve the substantive wording.' },
  { dictationId: 'assembly-demo', mode: 'editorial', before: briefing[0], after: 'Scope: negotiating position, budget timetable, and review procedure.', explanation: 'Convert the opening into a concise section summary.' },
  { dictationId: 'assembly-demo', mode: 'editorial', before: briefing[1], after: 'The negotiating position remains provisional. A review clause permits reconsideration after the first budget cycle.', explanation: 'Condense the paragraph while retaining its qualification.' },
  { dictationId: 'architecture', mode: 'editorial', before: 'The best dictation tool should get out of the way. I want to think out loud, see my ideas take shape, and understand what happened when a word doesn’t look right.', after: 'The dictation interface should support uninterrupted composition and provide traceable evidence for recognition errors.', explanation: 'Rephrase the introduction in technical language.' },
  { dictationId: 'political', mode: 'editorial', before: 'This report separates the public negotiating positions from the commitments that appear in the draft agreement. The distinction matters when assessing whether the coalition can sustain a common legislative programme.', after: 'Assess coalition stability by distinguishing public negotiating positions from commitments in the draft agreement.', explanation: 'Condense the opening into a report objective.' }
];
export function addRevisionFixtures(data) {
  const dictation = { id: 'assembly-demo', title: 'Briefing · assembly example', date: 'Today, 18:22', group: 'Today', duration: 90, type: 'Imported audio', language: 'English', tags: ['Assembly', 'Review'], status: 'Evidence ready', waveform: Array.from({ length: 190 }, (_, i) => Math.round(7 + Math.abs(Math.sin(i * .43) * Math.cos(i * .17)) * 42)), markers: [{ time: 60, label: 'Attribution disagreement' }], blocks: [{ id: 'brief-1', start: 0, end: 30, label: 'BRIEFING', text: briefing[0] }] };
  data.dictations.unshift(dictation);
  data.primers[dictation.id] = { version: 3, topic: 'A briefing about negotiating positions, budget timing, and attribution of ministerial statements.', scope: 'This dictation', languages: ['English'], recentSpeech: briefing[0], terms: [] };
  data.audioAssets.push({ id: 'audio-brief', dictationId: dictation.id, name: 'briefing.wav', duration: 90, sampleRate: 48000, channels: 1, stored: true });
  const ids = ['span-brief-1', 'span-brief-2', 'span-brief-3'];
  ids.forEach((id, i) => data.spans.push({ id, dictationId: dictation.id, audioId: 'audio-brief', ordinal: i + 1, target: [i * 30, (i + 1) * 30], dependsOn: [] }));
  data.contextSnapshots.push({ id: 'ctx-brief-3', version: 3, topic: data.primers[dictation.id].topic, prompt: data.primers[dictation.id].topic, keywords: [], policy: 'Fixed snapshot', created: '18:22:00' });
  data.jobs.push({ id: 'job-brief-1', contextId: 'ctx-brief-3', dictationId: dictation.id, title: 'Briefing · overlapping windows', kind: 'ASR', plan: 'Partitioned audio', model: 'gpt-transcribe', state: 'Complete', spanIds: ids, created: '18:22:00', priority: 'Normal', concurrency: 3, contextPolicy: 'Fixed snapshot', output: 'Recognition evidence', dependsOnJobs: [], notes: 'Raw hypotheses repeat context. Fixture target segments explicitly identify which text belongs to each target; no word timestamps are claimed.' });
  data.jobs.push({ id: 'job-brief-2', contextId: 'ctx-brief-3', dictationId: dictation.id, title: 'Briefing · attribution comparison', kind: 'ASR', plan: 'Selected span', model: 'gpt-4o-transcribe', state: 'Complete', spanIds: [ids[2]], created: '18:22:01', priority: 'High', concurrency: 1, contextPolicy: 'Fixed snapshot', output: 'Comparison evidence', dependsOnJobs: [], notes: 'Competing attribution, amount, and date are illustrative disagreements requiring human review.' });
  const texts = [...briefing, 'The minister denied a budget of 2.3 billion euros on 16 May. This statement should be attributed to the minister rather than presented as an independently verified fact.'];
  const windows = [[0, 36], [24, 66], [54, 90], [54, 90]];
  texts.forEach((text, i) => {
    const spanId = ids[Math.min(i, 2)], target = data.spans.find(p => p.id === spanId).target, attemptId = 'att-brief-' + (i + 1), blobId = i === 3 ? 'blob-brief-3' : 'blob-brief-' + (i + 1);
    if (i < 3) data.blobs.push({ id: blobId, audioId: 'audio-brief', input: windows[i], bytes: (windows[i][1] - windows[i][0]) * 48000, format: 'PCM16 · mono · 24 kHz', digest: 'fixture:' + blobId, stored: true });
    const raw = i === 1 ? briefing[0] + ' ' + text + ' ' + briefing[2] : text;
    data.attempts.push({ id: attemptId, jobId: i === 3 ? 'job-brief-2' : 'job-brief-1', spanId, number: 1, state: 'Succeeded', submittedOrder: 20 + i, completedOrder: [22, 21, 23, 24][i], started: '18:22:0' + i, ended: '18:22:1' + i, elapsedMs: 1630, input: windows[i], blobId, contextId: 'ctx-brief-3', model: i === 3 ? 'gpt-4o-transcribe' : 'gpt-transcribe', error: null, resultText: raw, targetSegments: [{ range: [...target], text, mapping: 'Illustrative target segment; no word timestamps' }], retryOf: null, transmitted: true, params: { response_format: 'json', stream: true, simulated: true }, resultDisposition: 'Evidence stored; document application is separate' });
  });
  // Existing successful fixtures explicitly represent their target range, except the
  // interview excerpt, which cannot safely be mapped to its entire submitted interval.
  for (const a of data.attempts) if (a.state === 'Succeeded' && !a.targetSegments && a.spanId !== 'span-req-031') {
    const span = data.spans.find(p => p.id === a.spanId);
    a.targetSegments = [{ range: [...span.target], text: a.resultText, mapping: 'Illustrative target segment; no word timestamps' }];
  }
  data.revisionTemplates = structuredClone(REVISION_TEMPLATES);
}
