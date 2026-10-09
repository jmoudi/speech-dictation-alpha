import { escapeHtml as e, time } from './store.js';
import { dictationCoverage } from './evidence.js';
import { documentState } from './document-state.js';
import { reviewItems, targetText } from './revision-store.js';
export function pipelineStages(s, id) {
  const coverage = dictationCoverage(s, id), jobs = coverage.jobs, recognition = jobs.filter(j => j.kind === 'ASR'), correction = jobs.filter(j => j.kind === 'Text correction');
  const review = reviewItems(s).filter(i => i.dictationId === id), conflicts = review.filter(i => i.kind === 'Disagreement' && i.state === 'Pending');
  const mapped = s.spans.filter(p => p.dictationId === id && s.attempts.some(a => a.spanId === p.id && a.state === 'Succeeded' && targetText(a, p) !== null));
  const pending = s.changes.filter(c => c.dictationId === id && c.state === 'pending'), ds = documentState(s, id);
  return [
    { name: 'Audio source', state: coverage.duration ? 'Available' : 'Awaiting audio', detail: time(coverage.duration) + ' · retained audio reference', tone: coverage.duration ? 'complete' : 'queued' },
    { name: 'Recognition', state: recognition.some(j => j.state === 'Running') ? 'Running' : recognition.some(j => j.state === 'Failed') ? 'Needs attention' : recognition.length ? 'Evidence stored' : 'Not started', detail: recognition.length + ' jobs · ' + time(coverage.evidence) + ' target coverage', tone: recognition.some(j => j.state === 'Failed') ? 'failed' : recognition.some(j => j.state === 'Running') ? 'running' : recognition.length ? 'complete' : 'queued' },
    { name: 'Text assembly', state: conflicts.length ? 'Source conflicts' : coverage.documentGaps.length ? 'Document gaps' : 'Represented', detail: mapped.length + ' mapped targets · ' + coverage.documentGaps.length + ' gaps', tone: conflicts.length ? 'failed' : coverage.documentGaps.length ? 'blocked' : 'complete' },
    { name: 'Correction suggestions', state: pending.length ? 'Proposals ready' : correction.some(j => j.state === 'Blocked') ? 'Waiting for input' : 'No pending proposals', detail: correction.length + ' jobs · ' + pending.length + ' suggestions', tone: pending.length ? 'queued' : 'blocked' },
    { name: 'Human review / document', state: review.some(i => i.state === 'Pending') ? 'Review pending' : 'Current', detail: 'Document v' + ds.version + ' · ' + review.filter(i => i.state === 'Pending').length + ' review items', tone: review.some(i => i.state === 'Pending') ? 'blocked' : 'complete' }
  ];
}
export function pipelineStrip(s, id) {
  return `<div class="pipeline-strip" aria-label="Dictation pipeline">${pipelineStages(s, id).map((p, i) => `<div class="pipeline-stage stage-${p.tone}"><div><span class="pipeline-stage-number">${i + 1}</span><strong>${e(p.name)}</strong></div><span class="pipeline-stage-state">${e(p.state)}</span><small>${e(p.detail)}</small></div>`).join('')}</div><div class="pipeline-context-note"><span>Topic primer</span> Versioned context feeds recognition and correction. Document edits enter through human action.</div>`;
}
function jobRow(s, j, action) {
  const attempts = s.attempts.filter(a => a.jobId === j.id), name = j.profileSnapshot?.name;
  return `<button class="pipeline-job-row" data-action="${action}" data-id="${e(j.id)}"><div><strong>${e(j.title)}</strong><small>${e(j.id)} · ${name ? e(name) + ' v' + j.profileSnapshot.version : e(j.model) + ' · historical snapshot'}</small>${j.dependsOnJobs.length ? `<small class="pipeline-dependency">Requires ${j.dependsOnJobs.map(e).join(', ')}</small>` : ''}</div><span class="status-label status-${j.state.toLowerCase()}"><i></i>${e(j.state)}</span><span>${j.kind === 'ASR' ? attempts.length + ' attempts' : e(j.output)}</span></button>`;
}
export function pipelineDetails(s, id, action = 'activity-job') {
  const jobs = s.jobs.filter(j => j.dictationId === id), ds = documentState(s, id);
  const recognition = jobs.filter(j => j.kind === 'ASR'), correction = jobs.filter(j => j.kind === 'Text correction'), context = jobs.filter(j => j.kind === 'Context');
  return `<section class="pipeline-details"><div class="pipeline-column"><div class="section-heading"><h3>Recognition executions</h3><span>${recognition.length} independent jobs</span></div><p class="technical-note">One recognition can process many target spans. Each span retains all attempts and surrounding input windows.</p>${recognition.map(j => jobRow(s, j, action)).join('') || '<div class="technical-empty">No recognition runs yet. Start recognition in the Dictation view.</div>'}</div><div class="pipeline-column"><div class="section-heading"><h3>Text processing & context</h3><span>Separate inputs and outputs</span></div>${correction.map(j => jobRow(s, j, action)).join('') || '<p class="technical-note">No corrector executions yet. Correctors produce proposals only.</p>'}${context.length ? `<h4>Primer analysis</h4>${context.map(j => jobRow(s, j, action)).join('')}` : ''}<h4>Document application journal</h4><div class="pipeline-journal">${ds.journal.slice(-5).reverse().map(j => `<div><span>${e(j.time)}</span><strong>${e(j.action)} · ${e(j.outcome)}</strong><p>${e(j.detail)}</p></div>`).join('') || '<p class="technical-note">No document application events in this session.</p>'}</div></div></section>`;
}
