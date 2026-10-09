import { createState, currentRecording, currentBlocks, pendingChanges, applyChange, undoEdit, snapshotEdit, setModel, compileContext, wordCount, time } from './store.js';
import { renderApp, transport, modal as modalView } from './views.js';
import { LIVE_EXAMPLE, IMPORT_EXAMPLE, SIMULATION, NEW_PRIMER_TOPIC } from '../fixtures/demo-data.js';

let state = createState();
state.inspectorOpen = window.innerWidth >= 980;
const root = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
let toastTimer, lastFocus, importedFileName = '', phraseTick = 0;

function toast(message) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer); el.textContent = message; el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4800);
}

function render({ preserveScroll = true } = {}) {
  const scrolls = preserveScroll ? [...root.querySelectorAll('.document-scroll,.inspector-scroll,.recording-list')].map(el => [el.className, el.scrollTop]) : [];
  root.innerHTML = renderApp(state);
  document.body.classList.toggle('theme-dark', state.settings.theme === 'dark');
  document.body.classList.toggle('text-large', state.settings.fontSize === 'large');
  for (const [name, top] of scrolls) root.querySelector('.' + name.split(' ')[0])?.scrollTo(0, top);
  renderModal();
}

function renderModal() {
  const oldScroll = modalRoot.querySelector('.settings-content')?.scrollTop || 0;
  modalRoot.innerHTML = modalView(state);
  root.inert = Boolean(state.modal);
  modalRoot.querySelector('.settings-content')?.scrollTo(0, oldScroll);
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
  if (state.recording && id !== state.sourceId) { toast('Stop the recording preview before switching sources.'); return; }
  state.playbackRange = null; state.sourceId = id; state.page = 'studio'; state.position = 0; state.playing = false; state.selectedBlockId = null; state.sidebarOpen = false; state.contextRequestId = null;
  state.requestId = state.requests.find(r => r.sourceId === id)?.id || null;
  state.primer = state.primers[id] || state.primer;
  render({ preserveScroll: false });
}
function scrollToBlock(id) { requestAnimationFrame(() => root.querySelector(`[data-block="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }
function setPosition(value) { state.playbackRange = null; const r = currentRecording(state); state.position = Math.max(0, Math.min(r.duration, value)); updateTransport(); }
function updateTransport() {
  const r = currentRecording(state); const duration = Math.max(r.duration, 1);
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
  let r = state.recordings.find(r => r.id === LIVE_EXAMPLE.id);
  if (!r) { r = structuredClone(LIVE_EXAMPLE); delete r.phrases; state.recordings.unshift(r); state.documents[r.id] = []; state.primers[r.id] = { ...structuredClone(state.primer), version: 1, topic: NEW_PRIMER_TOPIC, recentSpeech: '', terms: [] }; }
  state.sourceId = r.id; state.primer = state.primers[r.id]; state.recording = true; state.recordingPaused = false; state.playing = false; phraseTick = 0; state.captureSeconds = r.duration; state.position = r.duration; state.livePhraseIndex = state.documents[r.id].length; state.page = 'studio'; state.inspector = 'recognition'; state.requestId = null; state.sidebarOpen = false;
  render({ preserveScroll: false }); toast('Recording preview started. No microphone is being accessed.');
}
function stopRecording() {
  state.recording = false; state.recordingPaused = false;
  const r = currentRecording(state); r.duration = state.captureSeconds; r.status = 'Ready'; r.blocks = structuredClone(currentBlocks(state));
  if (r.duration > 0) addSimulatedRequest(r, [Math.max(0, r.duration - 30), r.duration]);
  render(); toast('Preview stopped. The simulated take is available in this session.');
}
function addSimulatedRequest(r, input, options = {}) {
  const context = options.context || compileContext(state);
  const id = 'demo-' + String(state.requests.length + 1).padStart(3, '0');
  const request = { id, sourceId: r.id, kind: 'Recognition', model: options.model || state.settings.asrModel, purpose: options.purpose || 'Simulated window', status: 'Complete', input, target: input, duration: `${(input[1] - input[0]).toFixed(1)} s`, latency: SIMULATION.requestLatency, format: SIMULATION.requestFormat, bytes: SIMULATION.requestBytes, created: new Date().toLocaleTimeString([], { hour12: false }), contextVersion: options.contextVersion ?? state.primer.version, prompt: context.prompt, keywords: context.keywords || [], text: options.text || currentBlocks(state).map(b => b.text).join(' ') || SIMULATION.repairedText, params: { model: options.model || state.settings.asrModel, response_format: 'json', stream: true, simulated: true }, events: [{ time: '+0 ms', event: 'Simulated request queued' }, { time: '+42 ms', event: 'Fixture audio associated' }, { time: '+1,620 ms', event: 'Illustrative result stored' }] };
  state.requests.unshift(request); state.requestId = id; return request;
}

function exportData() {
  const content = modalRoot.querySelector('#export-content').value; let format = modalRoot.querySelector('#export-format').value;
  const r = currentRecording(state); const blocks = content === 'source' ? r.blocks : currentBlocks(state);
  let text;
  if (content === 'evidence') { format = 'json'; text = JSON.stringify({ illustrative: true, recording: r.title, requests: state.requests.filter(q => q.sourceId === r.id) }, null, 2); }
  else if (format === 'json') text = JSON.stringify({ illustrative: true, title: r.title, version: state.version, blocks }, null, 2);
  else text = `${format === 'md' ? '# ' : ''}${r.title}\n\n${blocks.map(b => (format === 'md' && b.label ? '## ' + b.label + '\n\n' : '') + b.text).join('\n\n')}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + format; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeModal(); toast('Exported the current sample document.');
}

function action(name, el) {
  const id = el?.dataset.id, value = el?.dataset.value;
  switch (name) {
    case 'page': state.page = value; render({ preserveScroll: false }); break;
    case 'select-source': selectSource(id); break;
    case 'toggle-sidebar': state.sidebarOpen = !state.sidebarOpen; render(); break;
    case 'toggle-inspector': state.inspectorOpen = !state.inspectorOpen; state.focusMode = false; render(); break;
    case 'inspector': showInspector(value); state.contextRequestId = null; render(); break;
    case 'review': showInspector('changes'); state.changeFilter = 'pending'; render(); break;
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
      const sourceId = 'import-' + (state.recordings.length + 1);
      const example = structuredClone(state.recordings.find(r => r.id === 'interview'));
      Object.assign(example, { id: sourceId, title, date: 'Just now', group: 'Today', duration: IMPORT_EXAMPLE.duration, status: 'Queued', tags: ['Imported'], blocks: [] });
      state.recordings.unshift(example); state.documents[sourceId] = []; state.primers[sourceId] = { ...structuredClone(state.primer), version: 1, topic: 'Imported recording: ' + title, terms: [], recentSpeech: '' };
      state.jobs.unshift({ id: 'job-' + (state.jobs.length + 1), title, subtitle: `Recognition · ${plan === 'single' ? 'one audio span' : parts + ' planned parts'}`, sourceId, model: state.settings.asrModel, progress: 0, state: 'Queued', requests: plan === 'single' ? 1 : parts, coverage: '00:00 / 120:00', sent: '00:00', context: state.settings.contextPolicy, result: destination === 'background' ? 'Background evidence' : 'New document' });
      closeModal();
      if (destination === 'document') selectSource(sourceId); else { state.page = 'jobs'; render({ preserveScroll: false }); }
      toast('Created a simulated import job. No file contents were read or uploaded.'); break;
    }
    case 'toggle-job': { const j = state.jobs.find(j => j.id === id); j.state = j.state === 'Running' ? 'Paused' : 'Running'; render(); toast(`${j.state === 'Running' ? 'Resumed' : 'Paused'} the illustrative job.`); break; }
    case 'inspect-job': { const j = state.jobs.find(j => j.id === id); if (state.recording && j.sourceId !== state.sourceId) { toast('Stop the recording preview before inspecting a different source.'); break; } state.sourceId = j.sourceId; state.primer = state.primers[j.sourceId] || state.primer; state.requestId = state.requests.find(r => r.sourceId === j.sourceId)?.id; showInspector('recognition'); render(); break; }
    case 'document-mode': state.documentMode = value; render(); break;
    case 'find': state.findOpen = !state.findOpen; if (!state.findOpen) state.findQuery = ''; render(); if (state.findOpen) root.querySelector('#document-find')?.focus(); break;
    case 'focus': state.focusMode = !state.focusMode; if (state.focusMode) state.inspectorOpen = false; render(); break;
    case 'select-block': { const b = currentBlocks(state).find(b => b.id === id); state.selectedBlockId = id; if (b) state.position = b.start; const change = state.changes.find(c => c.blockId === id && c.state === 'pending'); showInspector(change ? 'changes' : 'recognition'); if (!change && b) state.requestId = state.requests.find(q => q.sourceId === state.sourceId && q.input[0] <= b.start && q.input[1] >= b.start)?.id || state.requestId; render(); scrollToBlock(id); break; }
    case 'accept-change': { const result = applyChange(state, id); render(); toast(result.ok ? 'Correction accepted. The original evidence is preserved.' : result.reason); break; }
    case 'dismiss-change': { snapshotEdit(state); const c = state.changes.find(c => c.id === id); c.state = 'dismissed'; render(); toast('Kept your original wording.'); break; }
    case 'undo': if (undoEdit(state)) { render(); toast('Last document change undone.'); } else toast('No document edits to undo.'); break;
    case 'change-filter': state.changeFilter = value; render(); break;
    case 'evidence': { state.requestId = id; state.requestTab = 'details'; showInspector('recognition'); const r = state.requests.find(q => q.id === id); state.position = r.input[0]; render(); break; }
    case 'request-tab': state.requestTab = value; render(); break;
    case 'request-context': state.contextRequestId = id; showInspector('context'); render(); break;
    case 'current-context': state.contextRequestId = null; render(); break;
    case 'context-tab': state.contextTab = value; render(); break;
    case 'save-topic': state.primer.topic = root.querySelector('#topic-editor').value.trim(); state.primer.version++; render(); toast(`Primer v${state.primer.version} will be used for future requests.`); break;
    case 'add-term': openModal('add-term'); break;
    case 'save-term': { const text = modalRoot.querySelector('#term-name').value.trim(); if (!text) { toast('Enter a term first.'); modalRoot.querySelector('#term-name').focus(); break; } if (state.primer.terms.some(t => t.text.toLowerCase() === text.toLowerCase())) { toast('That term is already in this primer.'); break; } state.primer.terms.push({ id: 'term-' + Date.now(), text, meaning: modalRoot.querySelector('#term-meaning').value.trim(), origin: 'You confirmed', state: 'active' }); state.primer.version++; closeModal(); render(); toast('Term added to this recording’s primer.'); break; }
    case 'approve-term': { const t = state.primer.terms.find(t => t.id === id); t.state = 'active'; t.origin = 'You confirmed'; state.primer.version++; render(); toast('Term confirmed for future recognition and correction.'); break; }
    case 'remove-term': state.primer.terms = state.primer.terms.filter(t => t.id !== id); state.primer.version++; render(); break;
    case 'add-tag': openModal('add-tag'); break;
    case 'save-tag': { const text = modalRoot.querySelector('#tag-name').value.trim(); if (text) { const r = currentRecording(state); if (!r.tags.includes(text)) r.tags.push(text); closeModal(); render(); } break; }
    case 'tag': state.libraryQuery = value; render(); break;
    case 'new-recording': case 'record': beginRecording(); break;
    case 'play': if (state.recording) state.recordingPaused = !state.recordingPaused; else { if (state.position >= currentRecording(state).duration) state.position = 0; state.playing = !state.playing; } render(); if (state.playing) toast('Visual playback preview. No audio is included in the fixtures.'); break;
    case 'skip-back': setPosition(state.position - 5); break;
    case 'skip-forward': setPosition(state.position + 5); break;
    case 'seek': setPosition(Number(el.dataset.time)); break;
    case 'speed': { const speeds = [.75, 1, 1.25, 1.5, 2]; state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length]; render(); break; }
    case 'loop': state.loop = !state.loop; render(); toast(state.loop ? 'Looping the selected passage in the visual preview.' : 'Loop disabled.'); break;
    case 'volume': toast('This is a visual transport mock-up. No audio is played or recorded.'); break;
    case 'marker': { const r = currentRecording(state); const pos = state.recording ? state.captureSeconds : state.position; r.markers.push({ time: pos, label: 'Marker ' + (r.markers.length + 1) }); render(); toast('Marker added at ' + time(pos)); break; }
    case 'play-request': { const r = state.requests.find(q => q.id === id); state.position = r.input[0]; state.playbackRange = [...r.input]; state.playing = true; render(); toast('Previewing the submitted range visually; no sample audio is included.'); break; }
    case 'rerun': state.requestId = id; openModal('rerun'); break;
    case 'confirm-rerun': { const original = state.requests.find(q => q.id === state.requestId); const model = modalRoot.querySelector('#rerun-model').value; const useOriginal = modalRoot.querySelector('#rerun-context').value === 'original'; const context = useOriginal ? model === 'gpt-4o-transcribe' ? { prompt: original.prompt + (original.keywords?.length ? '\n\nRelevant terms: ' + original.keywords.join(', ') : '') } : { prompt: original.prompt, keywords: [...original.keywords] } : compileContext({ ...state, settings: { ...state.settings, asrModel: model } }); addSimulatedRequest(currentRecording(state), [...original.input], { model, context, contextVersion: useOriginal ? original.contextVersion : state.primer.version, text: original.text, purpose: 'Manual comparison · simulated' }); closeModal(); state.requestTab = 'response'; render(); toast('Added an independent simulated result. Earlier evidence is unchanged.'); break; }
    case 'simulate-request': { const r = currentRecording(state); addSimulatedRequest(r, [0, Math.min(r.duration || 30, 30)]); render(); toast('Added an illustrative recognition result.'); break; }
    case 'reset-demo': state = createState(); importedFileName = ''; render({ preserveScroll: false }); toast('Sample workspace reset.'); break;
  }
}

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el) { if (el.dataset.action === 'backdrop') { if (ev.target === el) closeModal(); return; } action(el.dataset.action, el); return; }
  const waveform = ev.target.closest('#waveform');
  if (waveform && !state.recording) { const rect = waveform.getBoundingClientRect(); setPosition((ev.clientX - rect.left) / rect.width * currentRecording(state).duration); }
});

document.addEventListener('focusin', ev => { if (ev.target.matches('[data-edit-block][contenteditable]')) { ev.target.dataset.before = ev.target.textContent; ev.target.dataset.snapshotted = ''; } });
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.id === 'library-search') { const pos = el.selectionStart; state.libraryQuery = el.value; render(); const next = root.querySelector('#library-search'); next.focus(); next.setSelectionRange(pos, pos); }
  else if (el.id === 'document-find') { const pos = el.selectionStart; state.findQuery = el.value; render(); const next = root.querySelector('#document-find'); next.focus(); next.setSelectionRange(pos, pos); }
  else if (el.matches('[data-edit-block][contenteditable]')) {
    const block = currentBlocks(state).find(b => b.id === el.dataset.editBlock); if (!block) return;
    if (!el.dataset.snapshotted) { snapshotEdit(state); el.dataset.snapshotted = 'yes'; }
    block.text = el.textContent; state.editedBlocks.add(block.id); state.version++;
    el.closest('.text-block').classList.add('human-edited');
    root.querySelector('#save-status').textContent = 'Edited locally · protected from machine changes';
    root.querySelector('#word-count').textContent = wordCount(currentBlocks(state)) + ' words';
    const undo = root.querySelector('[data-action=undo]'); if (undo) undo.disabled = false;
  }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'request-select') { state.requestId = el.value; render(); }
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
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'f') { ev.preventDefault(); if (!state.findOpen) action('find'); else root.querySelector('#document-find')?.focus(); return; }
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !editing) { ev.preventDefault(); action('undo'); return; }
  if (editing) return;
  if (ev.target.id === 'waveform' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) { ev.preventDefault(); setPosition(ev.key === 'Home' ? 0 : ev.key === 'End' ? currentRecording(state).duration : state.position + (ev.key === 'ArrowLeft' ? -5 : 5)); return; }
  const shortcuts = { ' ': 'play', r: 'record', m: 'marker', j: 'skip-back', l: 'skip-forward' };
  if (shortcuts[ev.key.toLowerCase()]) { ev.preventDefault(); action(shortcuts[ev.key.toLowerCase()]); }
  else if (ev.key === 'Escape') { state.inspectorOpen = false; state.sidebarOpen = false; render(); }
  else if (ev.key === '/') { ev.preventDefault(); state.sidebarOpen = true; render(); root.querySelector('#library-search')?.focus(); }
});

// Local, explicitly simulated transport. It never reads a device or calls a service.
setInterval(() => {
  if (state.recording && !state.recordingPaused) {
    state.captureSeconds += .5; state.position = state.captureSeconds; currentRecording(state).duration = state.captureSeconds;
    const phrase = LIVE_EXAMPLE.phrases[state.livePhraseIndex % LIVE_EXAMPLE.phrases.length];
    const words = phrase.split(' '); phraseTick++;
    const partial = root.querySelector('#live-partial'); if (partial) partial.textContent = words.slice(0, Math.max(1, phraseTick)).join(' ');
    if (phraseTick === words.length + 5) {
      const blocks = currentBlocks(state); const start = blocks.at(-1)?.end || 0;
      blocks.push({ id: 'live-' + blocks.length, start, end: state.captureSeconds, text: phrase }); state.livePhraseIndex++; phraseTick = 0;
      addSimulatedRequest(currentRecording(state), [Math.max(0, state.captureSeconds - 30), state.captureSeconds], { text: phrase });
      render();
    }
    root.querySelector('.transport').outerHTML = transport(state);
    updateTransport();
  } else if (state.playing) {
    const r = currentRecording(state); state.position += .5 * state.speed;
    if (state.playbackRange && state.position >= state.playbackRange[1]) { state.position = state.playbackRange[1]; state.playing = false; state.playbackRange = null; render(); }
    const selected = currentBlocks(state).find(b => b.id === state.selectedBlockId);
    if (state.loop && selected && state.position >= selected.end) state.position = selected.start;
    if (state.position >= r.duration) { state.position = state.loop ? 0 : r.duration; state.playing = state.loop; render(); }
    updateTransport();
  }
}, 500);

render();
