import { createDemoData, DEMO_SETTINGS } from '../fixtures/demo-data.js';

export const MODEL_OPTIONS = ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-live-transcribe'];
export const STRATEGIES = { single: 'One audio span', partitioned: 'Partitioned audio', growing: 'Growing windows', native: 'Native live session' };
export function createState() {
  const data = createDemoData();
  return { ...data, settings: { ...DEMO_SETTINGS }, sourceId: 'architecture', page: 'studio', inspector: 'changes', inspectorOpen: true, sidebarOpen: false, requestId: 'req-018', requestTab: 'details', contextTab: 'primer', contextRequestId: null, documentMode: 'working', libraryQuery: '', findQuery: '', findOpen: false, selectedBlockId: 'a2', playing: false, position: 42, speed: 1, loop: false, recording: false, recordingPaused: false, captureSeconds: 0, livePhraseIndex: 0, settingsTab: 'models', modal: null, changeFilter: 'pending', documents: Object.fromEntries(data.recordings.map(r => [r.id, structuredClone(r.blocks)])), editedBlocks: new Set(), undoStack: [], version: 12, focusMode: false, zoom: 1 };
}
export function currentRecording(state) { return state.recordings.find(r => r.id === state.sourceId); }
export function currentBlocks(state) { return state.documents[state.sourceId] || []; }
export function pendingChanges(state) { return state.changes.filter(c => c.sourceId === state.sourceId && c.state === 'pending'); }
export function snapshotEdit(state) { state.undoStack.push({ documents: structuredClone(state.documents), changes: structuredClone(state.changes), editedBlocks: new Set(state.editedBlocks), version: state.version }); }
export function applyChange(state, id) {
  const change = state.changes.find(c => c.id === id);
  if (!change || change.state !== 'pending') return { ok: false, reason: 'This change is no longer pending.' };
  const block = state.documents[change.sourceId]?.find(b => b.id === change.blockId);
  if (!block || !block.text.includes(change.before) || state.editedBlocks.has(block.id)) return { ok: false, reason: 'This passage was edited. Your text is protected; the suggestion remains available.' };
  snapshotEdit(state);
  block.text = block.text.replace(change.before, change.after);
  block.revised = true;
  change.state = 'accepted';
  state.version++;
  return { ok: true };
}
export function undoEdit(state) { const old = state.undoStack.pop(); if (!old) return false; Object.assign(state, old); return true; }
export function setModel(state, model) {
  if (!MODEL_OPTIONS.includes(model)) return;
  state.settings.asrModel = model;
  if (model === 'gpt-live-transcribe') state.settings.strategy = 'native';
  else if (state.settings.strategy === 'native') state.settings.strategy = 'growing';
}
export function compileContext(state, consumer = 'asr') {
  const p = state.primer;
  const terms = p.terms.filter(t => t.state === 'active').map(t => t.text);
  if (consumer === 'corrector') return { primer_version: p.version, topic: p.topic, terminology: p.terms.filter(t => t.state === 'active').map(({ text, meaning, origin }) => ({ text, meaning, origin })), recent_speech: p.recentSpeech, policy: state.settings.profile, manual_edits: 'protected' };
  const result = { model: state.settings.asrModel, prompt: p.topic + (p.recentSpeech ? '\n\nPrevious speech: ' + p.recentSpeech : '') };
  if (state.settings.asrModel === 'gpt-4o-transcribe') { result.prompt += terms.length ? '\n\nRelevant terms: ' + terms.join(', ') + '.' : ''; result.language = 'en'; }
  else { result.keywords = terms; result.languages = ['en']; }
  return result;
}
export function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function time(value) { const sec = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`; }
export function wordCount(blocks) { return blocks.reduce((n, b) => n + (b.text.trim().match(/\S+/g)?.length || 0), 0); }
