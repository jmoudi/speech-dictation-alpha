import { documentState, journal, recordManualRevision } from './document-state.js';
import { buildAssembly, applyAssemblyStep, applyReadyAssembly, createRevision, currentDerived, reviewItems, chooseReviewEvidence } from './revision-store.js';
import { comparisonPair, preferAttempt, gapExecution } from './evidence.js';
import { selectJob, selectSpan, queueAttempt, retryFailed, settleAttempt, cancelJob, toggleJob, createJob, visibleJobs, registerRequest, dispatchReady } from './activity-store.js';
import { createState, currentDictation, currentBlocks, pendingChanges, applyChange, undoEdit, snapshotEdit, setModel, compileContext, wordCount, time } from './store.js';
import { renderApp, transport, modal as modalView } from './views.js';
import { LIVE_EXAMPLE, IMPORT_EXAMPLE, SIMULATION, NEW_PRIMER_TOPIC } from '../fixtures/demo-data.js';

let state = createState();
state.inspectorOpen = window.innerWidth >= 980;
state.activityInspectorOpen = window.innerWidth >= 1200;
const root = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
let toastTimer, lastFocus, importedFileName = '', phraseTick = 0;

function toast(message) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer); el.textContent = message; el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4800);
}

function focusKey(el) {
  if (!el) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const keys = ['action', 'id', 'value', 'setting', 'activitySetting', 'compareSide', 'reviewSetting'];
  const parts = keys.filter(key => el.dataset?.[key] !== undefined).map(key => `[data-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(el.dataset[key])}"]`);
  return parts.length ? el.tagName.toLowerCase() + parts.join('') : null;
}
function render({ preserveScroll = true } = {}) {
  const focus = root.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  const scrolls = preserveScroll ? [...root.querySelectorAll('.document-scroll,.inspector-scroll,.recording-list,.job-detail-scroll,.job-list,.attempt-inspector-body,.review-list,.review-detail-scroll')].map(el => [el.className, el.scrollTop]) : [];
  root.innerHTML = renderApp(state);
  document.body.classList.toggle('theme-dark', state.settings.theme === 'dark');
  document.body.classList.toggle('text-large', state.settings.fontSize === 'large');
  for (const [name, top] of scrolls) root.querySelector('.' + name.split(' ')[0])?.scrollTo(0, top);
  renderModal();
  if (focus && !state.modal) root.querySelector(focus)?.focus({ preventScroll: true });
}

function renderModal() {
  const focus = modalRoot.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  const oldScroll = modalRoot.querySelector('.settings-content,.workflow-modal-body')?.scrollTop || 0;
  modalRoot.innerHTML = modalView(state);
  root.inert = Boolean(state.modal);
  modalRoot.querySelector('.settings-content,.workflow-modal-body')?.scrollTo(0, oldScroll);
  if (focus && state.modal) modalRoot.querySelector(focus)?.focus({ preventScroll: true });
}

function openModal(name, settingsTab) {
  lastFocus = document.activeElement;
  state.modal = name;
  if (settingsTab) state.settingsTab = settingsTab;
  renderModal();
  requestAnimationFrame(() => modalRoot.querySelector('input:not([type=file]),select,button')?.focus());
}

function closeModal() { state.modal = null; renderModal(); if (lastFocus?.isConnected) lastFocus.focus(); else root.querySelector('[data-action=settings]')?.focus(); }
function showInspector(tab) { state.inspector = tab; state.inspectorOpen = true; state.focusMode = false; }
function selectSource(id) {
  if (state.recording && id !== state.dictationId) { toast('Stop the recording preview before switching sources.'); return; }
  state.documentMode = 'working'; state.playbackRange = null; state.dictationId = id; state.page = 'studio'; state.position = 0; state.playing = false; state.selectedBlockId = null; state.sidebarOpen = false; state.contextRequestId = null;
  state.requestId = state.requests.find(r => r.dictationId === id)?.id || null;
  state.primer = state.primers[id] || state.primer; state.selectedDerivedId = documentState(state).derived.at(-1)?.id || null;
  render({ preserveScroll: false });
}
function scrollToBlock(id) { requestAnimationFrame(() => root.querySelector(`[data-block="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }
function setPosition(value) { state.playbackRange = null; const r = currentDictation(state); state.position = Math.max(0, Math.min(r.duration, value)); updateTransport(); }
function updateTransport() {
  const r = currentDictation(state); const duration = Math.max(r.duration, 1);
  const pct = Math.min(100, state.position / duration * 100);
  const waveform = root.querySelector('#waveform');
  if (waveform) { waveform.style.setProperty('--played', pct + '%'); waveform.setAttribute('aria-valuenow', Math.floor(state.position)); waveform.setAttribute('aria-valuetext', time(state.position) + ' of ' + time(duration)); waveform.querySelectorAll('.wave-bars i').forEach((el, i, list) => el.classList.toggle('heard', i / list.length * 100 < pct)); }
  const display = root.querySelector('#time-current'); if (display) display.textContent = time(state.recording ? state.captureSeconds : state.position);
  if (state.playing && state.settings.followPlayback && !document.activeElement?.isContentEditable) {
    const block = currentBlocks(state).find(b => state.position >= b.start && state.position < b.end);
    if (block && block.id !== state.selectedBlockId) { state.selectedBlockId = block.id; root.querySelectorAll('.text-block').forEach(el => el.classList.toggle('selected-block', el.dataset.block === block.id)); }
  }
}

function beginRecording() {
  if (state.recording) { stopRecording(); return; }
  let r = state.dictations.find(r => r.id === LIVE_EXAMPLE.id);
  if (!r) { r = structuredClone(LIVE_EXAMPLE); delete r.phrases; state.dictations.unshift(r); state.documents[r.id] = []; state.primers[r.id] = { ...structuredClone(state.primer), version: 1, topic: NEW_PRIMER_TOPIC, recentSpeech: '', terms: [] }; }
  state.documentMode = 'working'; state.dictationId = r.id; state.primer = state.primers[r.id]; state.recording = true; state.recordingPaused = false; state.playing = false; phraseTick = 0; state.captureSeconds = r.duration; state.position = r.duration; state.livePhraseIndex = state.documents[r.id].length; state.page = 'studio'; state.inspector = 'recognition'; state.requestId = null; state.sidebarOpen = false;
  render({ preserveScroll: false }); toast('Recording preview started. No microphone is being accessed.');
}
function stopRecording() {
  state.recording = false; state.recordingPaused = false;
  const r = currentDictation(state); r.duration = state.captureSeconds; r.status = 'Ready'; r.blocks = structuredClone(currentBlocks(state));
  if (r.duration > 0) addSimulatedRequest(r, [Math.max(0, r.duration - 30), r.duration]);
  render(); toast('Preview stopped. The simulated take is available in this session.');
}
function addSimulatedRequest(r, input, options = {}) {
  const context = options.context || compileContext(state);
  const id = 'demo-' + String(state.requests.length + 1).padStart(3, '0');
  const request = { id, dictationId: r.id, kind: 'Recognition', model: options.model || state.settings.asrModel, purpose: options.purpose || 'Simulated window', status: 'Complete', input, target: input, duration: `${(input[1] - input[0]).toFixed(1)} s`, latency: SIMULATION.requestLatency, format: SIMULATION.requestFormat, bytes: SIMULATION.requestBytes, created: new Date().toLocaleTimeString([], { hour12: false }), contextVersion: options.contextVersion ?? state.primer.version, prompt: context.prompt, keywords: context.keywords || [], text: options.text || currentBlocks(state).map(b => b.text).join(' ') || SIMULATION.repairedText, params: { model: options.model || state.settings.asrModel, response_format: 'json', stream: true, simulated: true }, events: [{ time: '+0 ms', event: 'Simulated request queued' }, { time: '+42 ms', event: 'Fixture audio associated' }, { time: '+1,620 ms', event: 'Illustrative result stored' }] };
  state.requests.unshift(request); registerRequest(state, request); state.requestId = id; return request;
}

function updateRetryPreview() {
  const span = state.spans.find(p => p.id === state.retrySpanId), audio = state.audioAssets.find(a => a.id === span.audioId);
  const custom = modalRoot.querySelector('#attempt-audio').value === 'custom';
  if (custom) { const before = Number(modalRoot.querySelector('#attempt-before').value) || 0, after = Number(modalRoot.querySelector('#attempt-after').value) || 0; const start = Math.max(0, span.target[0] - before), end = Math.min(audio.duration, span.target[1] + after); modalRoot.querySelector('#retry-window-preview').textContent = `New input ${time(start)}–${time(end)} · ${(end - start).toFixed(1)} seconds · target remains ${time(span.target[0])}–${time(span.target[1])}`; }
  else { const previous = state.attempts.filter(a => a.jobId === state.selectedJobId && a.spanId === span.id).at(-1); modalRoot.querySelector('#retry-window-preview').textContent = previous ? `Exact input ${time(previous.input[0])}–${time(previous.input[1])} · ${previous.blobId}` : 'Prepare default input with six seconds of context before and after.'; }
}

function exportData() {
  const content = modalRoot.querySelector('#export-content').value; let format = modalRoot.querySelector('#export-format').value;
  const r = currentDictation(state); const blocks = content === 'source' ? r.blocks : content === 'derived' ? currentDerived(state)?.blocks || [] : currentBlocks(state);
  let text;
  if (content === 'evidence') { format = 'json'; text = JSON.stringify({ illustrative: true, dictation: r.title, document: currentBlocks(state), revisions: documentState(state).history, journal: documentState(state).journal, attempts: state.attempts.filter(a => state.spans.some(p => p.dictationId === r.id && p.id === a.spanId)), requests: state.requests.filter(q => q.dictationId === r.id) }, null, 2); }
  else if (format === 'json') text = JSON.stringify({ illustrative: true, title: r.title, version: content === 'derived' ? currentDerived(state)?.baseVersion : state.version, derived: content === 'derived' ? currentDerived(state)?.id : undefined, blocks }, null, 2);
  else text = `${format === 'md' ? '# ' : ''}${r.title}\n\n${blocks.map(b => (format === 'md' && b.label ? '## ' + b.label + '\n\n' : '') + b.text).join('\n\n')}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (content === 'derived' ? '-editorial-draft' : '') + '.' + format; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeModal(); toast('Exported the current sample document.');
}

function action(name, el) {
  const id = el?.dataset.id, value = el?.dataset.value;
  switch (name) {
    case 'activity-reference': { if (state.modal) closeModal(); const a = state.attempts.find(a => a.id === id); if (a) { selectJob(state, a.jobId); selectSpan(state, a.spanId); state.selectedAttemptId = a.id; state.activityInspectorOpen = true; state.page = 'jobs'; state.jobFilter = 'All'; state.jobDictationFilter = 'all'; state.jobQuery = ''; state.activityTab = 'spans'; render(); } break; }
    case 'toggle-activity-inspector': state.activityInspectorOpen = !state.activityInspectorOpen; render(); break;
    case 'compare-span': selectSpan(state, id); state.activityTab = 'compare'; render(); break;
    case 'prefer-evidence': { const result = preferAttempt(state, id); render(); toast(result.ok ? 'Preferred evidence recorded. Review document edits separately.' : result.reason); break; }
    case 'configure-attempt': state.retrySpanId = id; openModal('retry-attempt'); break;
    case 'confirm-attempt': { const get = id => modalRoot.querySelector('#' + id).value; const custom = get('attempt-audio') === 'custom'; const result = queueAttempt(state, state.selectedJobId, state.retrySpanId, { model: get('attempt-model'), currentContext: get('attempt-context') === 'current', ...(custom ? { before: Number(get('attempt-before')), after: Number(get('attempt-after')) } : {}) }); if (!result.ok) { toast(result.reason); break; } closeModal(); state.activityTab = 'spans'; state.activityInspectorOpen = true; render(); toast('Attempt queued with its own audio input and frozen context.'); break; }
    case 'dispatch-ready': { const result = dispatchReady(state, id); state.activityInspectorOpen = true; render(); toast(`${result.started} attempts dispatched; ${result.queued} newly queued. Concurrency and dependencies enforced.`); break; }
    case 'inspect-gap': { const range = [Number(el.dataset.start), Number(el.dataset.end)]; const result = gapExecution(state, state.dictationId, range); if (result.attempt) { action('activity-reference', { dataset: { id: result.attempt.id } }); } else if (result.span) { const job = state.jobs.find(j => j.spanIds.includes(result.span.id)); selectJob(state, job.id); selectSpan(state, result.span.id); state.page = 'jobs'; state.jobDictationFilter = 'all'; state.jobFilter = 'All'; state.jobQuery = ''; render(); } else { openModal('new-job'); modalRoot.querySelector('#job-dictation').value = state.dictationId; modalRoot.querySelector('#job-start').value = range[0]; modalRoot.querySelector('#job-end').value = range[1]; modalRoot.querySelector('#job-plan').value = 'single'; modalRoot.querySelector('#job-parts').disabled = true; } break; }
    case 'activity-job': selectJob(state, id); render(); break;
    case 'activity-span': selectSpan(state, id); state.activityTab = 'spans'; render(); break;
    case 'activity-attempt': { const a = state.attempts.find(a => a.id === id); state.selectedAttemptId = id; state.selectedSpanId = a.spanId; state.activityInspectorOpen = true; render(); break; }
    case 'activity-tab': state.activityTab = value; render(); break;
    case 'attempt-tab': state.attemptTab = value; render(); break;
    case 'dictation-jobs': state.page = 'jobs'; state.jobDictationFilter = state.dictationId; state.jobFilter = 'All'; state.jobQuery = ''; selectJob(state, state.jobs.find(j => j.dictationId === state.dictationId)?.id); render(); break;
    case 'new-job': openModal('new-job'); break;
    case 'create-job': { const get = id => modalRoot.querySelector('#' + id).value; const result = createJob(state, { dictationId: get('job-dictation'), start: Number(get('job-start')), end: Number(get('job-end')), parts: get('job-plan') === 'single' ? 1 : Number(get('job-parts')), model: get('job-model'), contextPolicy: get('job-context'), output: get('job-output') }); if (!result.ok) { toast(result.reason); break; } state.page = 'jobs'; state.jobFilter = 'All'; state.jobDictationFilter = 'all'; state.jobQuery = ''; closeModal(); render(); toast('Job created. Queue attempts from its audio spans.'); break; }
    case 'queue-attempt': case 'expand-attempt': { const result = queueAttempt(state, state.selectedJobId, id, { expanded: name === 'expand-attempt', currentContext: name === 'expand-attempt' }); render(); toast(result.ok ? 'Attempt queued. Earlier attempts and the document are unchanged.' : result.reason); break; }
    case 'retry-failed': { const count = retryFailed(state, id); render(); toast(`Queued ${count} retry attempt${count === 1 ? '' : 's'}.`); break; }
    case 'attempt-success': case 'attempt-failure': { const result = settleAttempt(state, id, name === 'attempt-success'); render(); toast(result.ok ? 'Simulated response stored as evidence. Document unchanged.' : result.reason); break; }
    case 'activity-toggle-job': toggleJob(state, id); render(); break;
    case 'cancel-job': cancelJob(state, id); render(); toast('Job cancelled. Earlier attempts and evidence retained.'); break;
    case 'export-attempt': { const a = state.attempts.find(a => a.id === id); const payload = { illustrative: true, attempt: a, span: state.spans.find(p => p.id === a.spanId), blob: state.blobs.find(b => b.id === a.blobId), context: state.contextSnapshots.find(c => c.id === a.contextId) }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = id + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break; }
    case 'page': state.page = value; if (['jobs', 'review'].includes(value)) state.playing = false; render({ preserveScroll: false }); break;
    case 'select-source': selectSource(id); break;
    case 'toggle-sidebar': state.sidebarOpen = !state.sidebarOpen; render(); break;
    case 'toggle-inspector': state.inspectorOpen = !state.inspectorOpen; state.focusMode = false; render(); break;
    case 'inspector': showInspector(value); state.contextRequestId = null; render(); break;
    case 'review': state.page = 'review'; state.playing = false; state.reviewScope = state.dictationId; state.reviewFilter = 'Pending'; state.reviewRisk = 'All'; state.reviewSearch = ''; render(); break;
    case 'select-review': state.selectedReviewId = id; render(); break;
    case 'review-choose': { const result = chooseReviewEvidence(state, el.dataset.reviewId, id); if (result.ok) state.selectedReviewId = reviewItems(state).find(i => i.planId === result.plan.id)?.id || el.dataset.reviewId; render(); toast(result.ok ? 'Source selected. Review the proposed document update separately.' : result.reason); break; }
    case 'review-apply-assembly': { const item = reviewItems(state).find(i => i.id === id); const result = item ? applyAssemblyStep(state, item.planId, item.stepId) : { ok: false, reason: 'This proposal is no longer pending.' }; render(); toast(result.ok ? 'Document update applied with attempt provenance.' : result.reason); break; }
    case 'review-audio': { const item = reviewItems(state).find(i => i.id === id); if (!item || state.recording && item.dictationId !== state.dictationId) { toast('Stop the capture preview before switching dictations.'); break; } selectSource(item.dictationId); state.position = item.range[0]; state.playbackRange = [...item.range]; state.playing = true; render(); toast('Target interval selected. Playback is visual; fixtures contain no audio.'); break; }
    case 'assembly': case 'assembly-dictation': { if (state.recording) { toast('Stop the capture preview before building an assembly proposal.'); break; } if (name === 'assembly-dictation' && id !== state.dictationId) selectSource(id); const plan = state.assemblies.find(p => p.id === state.selectedAssemblyId && p.dictationId === state.dictationId) || state.assemblies.filter(p => p.dictationId === state.dictationId).at(-1); if (plan) state.selectedAssemblyId = plan.id; else buildAssembly(state, state.dictationId, { mode: state.assemblyMode }); openModal('assembly'); break; }
    case 'rebuild-assembly': state.assemblyMode = modalRoot.querySelector('#assembly-scope').value; buildAssembly(state, state.dictationId, { mode: state.assemblyMode }); render(); break;
    case 'apply-assembly-step': { const result = applyAssemblyStep(state, state.selectedAssemblyId, id); render(); toast(result.ok ? 'Passage applied. Source evidence retained.' : result.reason); break; }
    case 'apply-ready-assembly': { const result = applyReadyAssembly(state, state.selectedAssemblyId); render(); toast(result.ok ? `Applied ${result.applied} ready passages. Blocked spans remain for review.` : result.reason); break; }
    case 'open-span-review': closeModal(); state.page = 'review'; state.reviewFilter = 'Pending'; state.reviewScope = 'all'; state.reviewRisk = 'All'; state.reviewSearch = ''; state.selectedReviewId = 'span:' + id; render(); break;
    case 'revisions': if (state.recording) { toast('Stop the capture preview before generating document revisions.'); break; } openModal('revisions'); break;
    case 'revision-mode': state.revisionMode = value; renderModal(); break;
    case 'generate-revision': { const result = createRevision(state, state.revisionMode); closeModal(); if (result.draft) { state.documentMode = 'derived'; state.page = 'studio'; render(); toast(`Created a separate editorial draft with ${result.draft.changed} fixture rewrites.`); } else { state.reviewScope = state.dictationId; state.reviewFilter = 'Pending'; state.reviewRisk = 'All'; state.reviewSearch = ''; state.page = 'review'; render(); toast(`${result.proposals} ${result.mode} proposals available for review.`); } break; }
    case 'open-derived': state.selectedDerivedId = id; state.documentMode = 'derived'; state.page = 'studio'; closeModal(); render(); break;
    case 'provenance': state.selectedBlockId = id; openModal('provenance'); break;
    case 'settings': openModal('settings', el.dataset.settingsTab); break;
    case 'settings-tab': state.settingsTab = value; renderModal(); break;
    case 'theme': state.settings.theme = value; render(); modalRoot.querySelector(`[data-action=theme][data-value=${value}]`)?.focus(); break;
    case 'close-modal': closeModal(); break;
    case 'export': openModal('export'); break;
    case 'download': exportData(); break;
    case 'shortcuts': openModal('shortcuts'); break;
    case 'import': importedFileName = ''; openModal('import'); break;
    case 'create-import': {
      const destination = modalRoot.querySelector('#import-destination').value;
      const plan = modalRoot.querySelector('#import-plan').value;
      const parts = Math.max(1, Math.min(100, Number(modalRoot.querySelector('#import-parts').value) || 20));
      const title = importedFileName || IMPORT_EXAMPLE.name;
      const dictationId = 'import-' + (state.dictations.length + 1);
      const example = structuredClone(state.dictations.find(r => r.id === 'interview'));
      Object.assign(example, { id: dictationId, title, date: 'Just now', group: 'Today', duration: IMPORT_EXAMPLE.duration, status: 'Queued', tags: ['Imported'], blocks: [] });
      state.dictations.unshift(example); state.documents[dictationId] = []; state.primers[dictationId] = { ...structuredClone(state.primer), version: 1, topic: 'Imported recording: ' + title, terms: [], recentSpeech: '' };
      createJob(state, { dictationId, start: 0, end: IMPORT_EXAMPLE.duration, parts: plan === 'single' ? 1 : parts, model: state.settings.asrModel === 'gpt-live-transcribe' ? 'gpt-transcribe' : state.settings.asrModel, contextPolicy: state.settings.contextPolicy, output: destination === 'background' ? 'Recognition evidence' : 'Review proposals' });
      state.jobDictationFilter = 'all'; state.jobFilter = 'All'; state.jobQuery = '';
      closeModal();
      if (destination === 'document') selectSource(dictationId); else { state.page = 'jobs'; render({ preserveScroll: false }); }
      toast('Created a simulated import job. No file contents were read or uploaded.'); break;
    }
    case 'document-mode': state.documentMode = value; render(); break;
    case 'find': state.findOpen = !state.findOpen; if (!state.findOpen) state.findQuery = ''; render(); if (state.findOpen) root.querySelector('#document-find')?.focus(); break;
    case 'focus': state.focusMode = !state.focusMode; if (state.focusMode) state.inspectorOpen = false; render(); break;
    case 'select-block': { const b = (state.documentMode === 'derived' ? currentDerived(state)?.blocks || [] : currentBlocks(state)).find(b => b.id === id); state.selectedBlockId = id; if (b) state.position = b.start; const change = state.changes.find(c => c.blockId === id && c.state === 'pending'); showInspector(change ? 'changes' : 'recognition'); if (!change && b) state.requestId = state.requests.find(q => q.dictationId === state.dictationId && q.input[0] <= b.start && q.input[1] >= b.start)?.id || state.requestId; render(); scrollToBlock(id); break; }
    case 'accept-change': { const result = applyChange(state, id); render(); toast(result.ok ? 'Correction accepted. The original evidence is preserved.' : result.reason); break; }
    case 'dismiss-change': { const c = state.changes.find(c => c.id === id); if (!c || c.state !== 'pending') break; snapshotEdit(state, c.dictationId); c.state = 'dismissed'; journal(state, c.dictationId, 'Revision review', 'Kept current text', c.title, { proposalId: id }); render(); toast('Kept your original wording.'); break; }
    case 'undo': if (state.documentMode !== 'working') { toast('Switch to the working document to undo its changes.'); break; } if (undoEdit(state)) { render(); toast('Last document change undone.'); } else toast('No document edits to undo.'); break;
    case 'change-filter': state.changeFilter = value; render(); break;
    case 'evidence': { state.requestId = id; state.requestTab = 'details'; showInspector('recognition'); const r = state.requests.find(q => q.id === id); state.position = r.input[0]; render(); break; }
    case 'request-tab': state.requestTab = value; render(); break;
    case 'request-context': state.contextRequestId = id; showInspector('context'); render(); break;
    case 'current-context': state.contextRequestId = null; render(); break;
    case 'context-tab': state.contextTab = value; render(); break;
    case 'save-topic': state.primer.topic = root.querySelector('#topic-editor').value.trim(); state.primer.version++; render(); toast(`Primer v${state.primer.version} will be used for future requests.`); break;
    case 'add-term': openModal('add-term'); break;
    case 'save-term': { const text = modalRoot.querySelector('#term-name').value.trim(); if (!text) { toast('Enter a term first.'); modalRoot.querySelector('#term-name').focus(); break; } if (state.primer.terms.some(t => t.text.toLowerCase() === text.toLowerCase())) { toast('That term is already in this primer.'); break; } state.primer.terms.push({ id: 'term-' + Date.now(), text, meaning: modalRoot.querySelector('#term-meaning').value.trim(), origin: 'You confirmed', state: 'active' }); state.primer.version++; closeModal(); render(); toast('Term added to this dictation’s primer.'); break; }
    case 'approve-term': { const t = state.primer.terms.find(t => t.id === id); t.state = 'active'; t.origin = 'You confirmed'; state.primer.version++; render(); toast('Term confirmed for future recognition and correction.'); break; }
    case 'remove-term': state.primer.terms = state.primer.terms.filter(t => t.id !== id); state.primer.version++; render(); break;
    case 'add-tag': openModal('add-tag'); break;
    case 'save-tag': { const text = modalRoot.querySelector('#tag-name').value.trim(); if (text) { const r = currentDictation(state); if (!r.tags.includes(text)) r.tags.push(text); closeModal(); render(); } break; }
    case 'tag': state.libraryQuery = value; render(); break;
    case 'new-recording': case 'record': beginRecording(); break;
    case 'play': if (state.recording) state.recordingPaused = !state.recordingPaused; else { if (state.position >= currentDictation(state).duration) state.position = 0; state.playing = !state.playing; } render(); if (state.playing) toast('Visual playback preview. No audio is included in the fixtures.'); break;
    case 'skip-back': setPosition(state.position - 5); break;
    case 'skip-forward': setPosition(state.position + 5); break;
    case 'seek': setPosition(Number(el.dataset.time)); break;
    case 'speed': { const speeds = [.75, 1, 1.25, 1.5, 2]; state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length]; render(); break; }
    case 'loop': state.loop = !state.loop; render(); toast(state.loop ? 'Looping the selected passage in the visual preview.' : 'Loop disabled.'); break;
    case 'volume': toast('This is a visual transport mock-up. No audio is played or recorded.'); break;
    case 'marker': { const r = currentDictation(state); const pos = state.recording ? state.captureSeconds : state.position; r.markers.push({ time: pos, label: 'Marker ' + (r.markers.length + 1) }); render(); toast('Marker added at ' + time(pos)); break; }
    case 'play-request': { const r = state.requests.find(q => q.id === id); state.position = r.input[0]; state.playbackRange = [...r.input]; state.playing = true; render(); toast('Previewing the submitted range visually; no sample audio is included.'); break; }
    case 'rerun': state.requestId = id; openModal('rerun'); break;
    case 'confirm-rerun': { const original = state.requests.find(q => q.id === state.requestId); const model = modalRoot.querySelector('#rerun-model').value; const useOriginal = modalRoot.querySelector('#rerun-context').value === 'original'; const context = useOriginal ? model === 'gpt-4o-transcribe' ? { prompt: original.prompt + (original.keywords?.length ? '\n\nRelevant terms: ' + original.keywords.join(', ') : '') } : { prompt: original.prompt, keywords: [...original.keywords] } : compileContext({ ...state, settings: { ...state.settings, asrModel: model } }); addSimulatedRequest(currentDictation(state), [...original.input], { model, context, contextVersion: useOriginal ? original.contextVersion : state.primer.version, text: original.text, purpose: 'Manual comparison · simulated' }); closeModal(); state.requestTab = 'response'; render(); toast('Added an independent simulated result. Earlier evidence is unchanged.'); break; }
    case 'simulate-request': { const r = currentDictation(state); addSimulatedRequest(r, [0, Math.min(r.duration || 30, 30)]); render(); toast('Added an illustrative recognition result.'); break; }
    case 'reset-demo': state = createState(); importedFileName = ''; render({ preserveScroll: false }); toast('Sample workspace reset.'); break;
  }
}

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el) { if (el.dataset.action === 'backdrop') { if (ev.target === el) closeModal(); return; } action(el.dataset.action, el); return; }
  const waveform = ev.target.closest('#waveform');
  if (waveform && !state.recording) { const rect = waveform.getBoundingClientRect(); setPosition((ev.clientX - rect.left) / rect.width * currentDictation(state).duration); }
});

document.addEventListener('focusin', ev => { if (ev.target.matches('[data-edit-block][contenteditable]')) { ev.target.dataset.before = ev.target.textContent; ev.target.dataset.snapshotted = ''; } });
document.addEventListener('focusout', ev => { const el = ev.target; if (el.matches('[data-edit-block][contenteditable]') && el.dataset.snapshotted && el.dataset.before !== el.textContent) { if (state.documentMode === 'derived') journal(state, state.dictationId, 'Derived draft edit', 'Applied', `Edited ${el.dataset.editBlock} in ${currentDerived(state)?.name}.`); else recordManualRevision(state, state.dictationId, el.dataset.editBlock); el.dataset.snapshotted = ''; } });
document.addEventListener('input', ev => {
  const el = ev.target;
  if (['attempt-before', 'attempt-after'].includes(el.id)) { updateRetryPreview(); }
  else if (el.id === 'job-search') { const pos = el.selectionStart; state.jobQuery = el.value; const jobs = visibleJobs(state); if (!jobs.some(j => j.id === state.selectedJobId)) selectJob(state, jobs[0]?.id); render(); const next = root.querySelector('#job-search'); next.focus(); next.setSelectionRange(pos, pos); }
  else if (el.id === 'review-search') { const pos = el.selectionStart; state.reviewSearch = el.value; render(); const next = root.querySelector('#review-search'); next.focus(); next.setSelectionRange(pos, pos); }
  else if (el.id === 'library-search') { const pos = el.selectionStart; state.libraryQuery = el.value; render(); const next = root.querySelector('#library-search'); next.focus(); next.setSelectionRange(pos, pos); }
  else if (el.id === 'document-find') { const pos = el.selectionStart; state.findQuery = el.value; render(); const next = root.querySelector('#document-find'); next.focus(); next.setSelectionRange(pos, pos); }
  else if (el.matches('[data-edit-block][contenteditable]')) {
    const derived = state.documentMode === 'derived' ? currentDerived(state) : null;
    const blocks = derived ? derived.blocks : currentBlocks(state), block = blocks.find(b => b.id === el.dataset.editBlock); if (!block) return;
    if (!el.dataset.snapshotted) { if (!derived) snapshotEdit(state); el.dataset.snapshotted = 'yes'; }
    block.text = el.textContent;
    if (derived) { block.provenance = { ...block.provenance, kind: 'Editorial draft · human edit' }; derived.edited = true; }
    else { state.editedBlocks.add(block.id); state.version++; const version = root.querySelector('.paper-footer span:nth-child(2)'); if (version) version.textContent = 'Version ' + state.version; el.closest('.text-block').classList.add('human-edited'); }
    root.querySelector('#save-status').textContent = derived ? 'Derived draft edited locally' : 'Edited locally · protected from machine changes';
    root.querySelector('#word-count').textContent = wordCount(blocks) + ' words';
    const undo = root.querySelector('[data-action=undo]'); if (undo && !derived) undo.disabled = false;
  }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.compareSide) { const spanId = el.dataset.span; const pair = comparisonPair(state, spanId).map(a => a?.id || ''); const side = el.dataset.compareSide === 'left' ? 0 : 1; if (pair[1 - side] === el.value) pair[1 - side] = pair[side]; pair[side] = el.value; state.comparisons[spanId] = pair; render(); }
  else if (el.id === 'comparison-span') { selectSpan(state, el.value); state.activityTab = 'compare'; render(); }
  else if (el.id === 'attempt-audio') { modalRoot.querySelector('#attempt-padding').hidden = el.value !== 'custom'; updateRetryPreview(); }
  else if (el.dataset.reviewSetting) { state[el.dataset.reviewSetting] = el.value; render(); }
  else if (el.id === 'assembly-scope') { state.assemblyMode = el.value; }
  else if (el.dataset.activitySetting) { state[el.dataset.activitySetting] = el.value; if (['jobFilter', 'jobDictationFilter'].includes(el.dataset.activitySetting)) { const jobs = visibleJobs(state); if (!jobs.some(j => j.id === state.selectedJobId)) selectJob(state, jobs[0]?.id); } render(); }
  else if (el.id === 'job-dictation') { modalRoot.querySelector('#job-end').value = state.dictations.find(d => d.id === el.value).duration; }
  else if (el.id === 'job-plan') { modalRoot.querySelector('#job-parts').disabled = el.value === 'single'; }
  else if (el.id === 'request-select') { state.requestId = el.value; render(); }
  else if (el.id === 'audio-file') { const f = el.files[0]; if (f) { importedFileName = f.name; modalRoot.querySelector('#import-name').textContent = f.name; modalRoot.querySelector('#import-meta').textContent = `${(f.size / 1e6).toFixed(1)} MB · metadata only · duration remains illustrative`; } }
  else if (el.dataset.setting) {
    const key = el.dataset.setting;
    if (key === 'asrModel') setModel(state, el.value);
    else state.settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(Number(el.min) || 0, Math.min(Number(el.max) || Infinity, Number(el.value))) : el.value;
    render();
  }
});

document.addEventListener('keydown', ev => {
  if (state.modal) {
    if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); }
    if (ev.key === 'Tab') { const items = [...modalRoot.querySelectorAll('button:not(:disabled),input,select,textarea,[tabindex="0"]')].filter(el => el.getClientRects().length); const first = items[0], last = items[items.length - 1]; if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last?.focus(); } else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first?.focus(); } }
    return;
  }
  const editing = ev.target.matches('input,textarea,select,[contenteditable]');
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'f') { ev.preventDefault(); if (['jobs', 'review'].includes(state.page)) root.querySelector(state.page === 'jobs' ? '#job-search' : '#review-search')?.focus(); else if (!state.findOpen) action('find'); else root.querySelector('#document-find')?.focus(); return; }
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !editing && state.page === 'studio') { ev.preventDefault(); action('undo'); return; }
  if (editing) return;
  if (ev.target.id === 'waveform' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) { ev.preventDefault(); setPosition(ev.key === 'Home' ? 0 : ev.key === 'End' ? currentDictation(state).duration : state.position + (ev.key === 'ArrowLeft' ? -5 : 5)); return; }
  if (['jobs', 'review'].includes(state.page)) { if (ev.key === 'Escape') { state.activityInspectorOpen = false; render(); } return; }
  const shortcuts = { ' ': 'play', r: 'record', m: 'marker', j: 'skip-back', l: 'skip-forward' };
  if (shortcuts[ev.key.toLowerCase()]) { ev.preventDefault(); action(shortcuts[ev.key.toLowerCase()]); }
  else if (ev.key === 'Escape') { state.activityInspectorOpen = false; state.inspectorOpen = false; state.sidebarOpen = false; render(); }
  else if (ev.key === '/') { ev.preventDefault(); state.sidebarOpen = true; render(); root.querySelector('#library-search')?.focus(); }
});

// Local, explicitly simulated transport. It never reads a device or calls a service.
setInterval(() => {
  if (state.recording && !state.recordingPaused) {
    state.captureSeconds += .5; state.position = state.captureSeconds; currentDictation(state).duration = state.captureSeconds;
    const phrase = LIVE_EXAMPLE.phrases[state.livePhraseIndex % LIVE_EXAMPLE.phrases.length];
    const words = phrase.split(' '); phraseTick++;
    const partial = root.querySelector('#live-partial'); if (partial) partial.textContent = words.slice(0, Math.max(1, phraseTick)).join(' ');
    if (phraseTick === words.length + 5) {
      const blocks = currentBlocks(state); const start = blocks.at(-1)?.end || 0;
      blocks.push({ id: 'live-' + blocks.length, start, end: state.captureSeconds, text: phrase }); state.livePhraseIndex++; phraseTick = 0;
      addSimulatedRequest(currentDictation(state), [Math.max(0, state.captureSeconds - 30), state.captureSeconds], { text: phrase });
      render();
    }
    if (root.querySelector('.transport')) root.querySelector('.transport').outerHTML = transport(state);
    updateTransport();
  } else if (state.playing) {
    const r = currentDictation(state); state.position += .5 * state.speed;
    if (state.playbackRange && state.position >= state.playbackRange[1]) { state.position = state.playbackRange[1]; state.playing = false; state.playbackRange = null; render(); }
    const selected = currentBlocks(state).find(b => b.id === state.selectedBlockId);
    if (state.loop && selected && state.position >= selected.end) state.position = selected.start;
    if (state.position >= r.duration) { state.position = state.loop ? 0 : r.duration; state.playing = state.loop; render(); }
    updateTransport();
  }
}, 500);

render();
