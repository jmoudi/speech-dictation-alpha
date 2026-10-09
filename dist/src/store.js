import { initializeDocuments } from './document-state.js';
export { snapshotEdit, undoEdit, applyChange, documentState } from './document-state.js';
import { activityInitialState } from './activity-store.js';
import { createDemoData, DEMO_SETTINGS } from '../fixtures/demo-data.js';

export const MODEL_OPTIONS = ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-live-transcribe'];
export const STRATEGIES = { single: 'One audio span', partitioned: 'Partitioned audio', growing: 'Growing windows', native: 'Native live session' };
export function createState() {
  const data = createDemoData();
  const state = { ...data, ...activityInitialState(), settings: { ...DEMO_SETTINGS }, dictationId: 'architecture', page: 'review', inspector: 'changes', inspectorOpen: true, sidebarOpen: false, requestId: 'req-018', requestTab: 'details', contextTab: 'primer', contextRequestId: null, documentMode: 'working', libraryQuery: '', findQuery: '', findOpen: false, selectedBlockId: 'a2', playing: false, position: 42, speed: 1, loop: false, recording: false, recordingPaused: false, captureSeconds: 0, livePhraseIndex: 0, settingsTab: 'models', modal: null, changeFilter: 'pending', documents: Object.fromEntries(data.dictations.map(r => [r.id, structuredClone(r.blocks)])), editedBlocks: new Set(), assemblies: [], selectedAssemblyId: null, assemblyMode: 'gaps', revisionMode: 'repair', selectedDerivedId: null, reviewDecisions: {}, reviewFilter: 'Pending', reviewScope: 'all', reviewRisk: 'All', selectedReviewId: null, reviewSearch: '', focusMode: false, zoom: 1 };
  for (const c of state.changes) { c.mode = 'repair'; c.baseText = state.documents[c.dictationId]?.find(b => b.id === c.blockId)?.text; }
  initializeDocuments(state); return state;
}
export function currentDictation(state) { return state.dictations.find(r => r.id === state.dictationId); }
export function currentBlocks(state) { return state.documents[state.dictationId] || []; }
export function pendingChanges(state) { return state.changes.filter(c => c.dictationId === state.dictationId && c.state === 'pending'); }
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
