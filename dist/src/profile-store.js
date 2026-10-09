import { PROFILE_FIXTURES, PROFILE_MODEL_OPTIONS } from '../fixtures/profile-data.js';
import { createJob, queueAttempt, dispatchReady, syncRequestProjection } from './activity-store.js';
export function initializeProfiles(s) {
  s.profiles = structuredClone(PROFILE_FIXTURES); s.dictationProfiles = {};
  for (const d of s.dictations) s.dictationProfiles[d.id] = { recognizerId: 'recognizer-main', correctorId: 'corrector-main' };
  s.profileEditorId = 'recognizer-main'; s.profileDraft = null; s.dictationTab = 'overview'; s.runScope = 'whole';
}
export function selections(s, id = s.dictationId) { return s.dictationProfiles[id] ||= { recognizerId: 'recognizer-main', correctorId: 'corrector-main' }; }
export function selectedProfile(s, kind, id = s.dictationId) { return s.profiles.find(p => p.id === selections(s, id)[kind + 'Id']); }
export function assignProfile(s, kind, profileId, id = s.dictationId) {
  const p = s.profiles.find(p => p.id === profileId && p.kind === kind); if (!p) return false;
  selections(s, id)[kind + 'Id'] = p.id;
  if (id === s.dictationId) { if (kind === 'recognizer') { s.settings.asrModel = p.model; if (p.model === 'gpt-live-transcribe') s.settings.strategy = 'native'; else if (s.settings.strategy === 'native') s.settings.strategy = 'growing'; } else { s.settings.correctorModel = p.model; s.revisionMode = p.mode; } }
  return true;
}
export function profileContext(s, profile, id = s.dictationId) {
  const primer = s.primers[id], active = profile.includePrimer ? primer.terms.filter(t => t.state === 'active') : [];
  const topic = profile.includePrimer ? primer.topic : '', recent = profile.includePrimer ? primer.recentSpeech : '';
  const prompt = [profile.prompt, topic && 'Topic: ' + topic, recent && 'Previous recognition: ' + recent].filter(Boolean).join('\n\n');
  const metadata = { profile_id: profile.id, profile_name: profile.name, profile_version: profile.version, primer_version: profile.includePrimer ? primer.version : null, model: profile.model };
  if (profile.kind === 'corrector') return { ...metadata, prompt, topic, terminology: active.map(({ text, meaning, origin }) => ({ text, meaning, origin })), recent_speech: recent, revision_mode: profile.mode, policy: 'Suggestions only; human acceptance required. Preserve manually edited passages.', output: 'Review proposals', manual_edits: 'protected', input: 'Working document snapshot plus linked recognition evidence' };
  const terms = active.map(t => t.text);
  if (profile.model === 'gpt-4o-transcribe') return { ...metadata, prompt: prompt + (terms.length ? '\n\nRelevant terms: ' + terms.join(', ') + '.' : ''), language: 'en' };
  return { ...metadata, prompt, keywords: terms, languages: ['en'], transport: profile.model === 'gpt-live-transcribe' ? 'Native live session' : 'Bounded audio requests' };
}
export function editProfile(s, id) { const p = s.profiles.find(p => p.id === id); if (!p) return false; s.profileEditorId = id; s.profileDraft = structuredClone(p); return true; }
export function saveProfile(s, values) {
  const p = s.profiles.find(p => p.id === values.id); if (!p) return { ok: false, reason: 'Profile not found.' };
  if (p.kind === 'corrector' && !['repair', 'cleanup', 'editorial'].includes(values.mode)) return { ok: false, reason: 'Select a suggestion policy.' };
  if (!values.name.trim() || !values.prompt.trim()) return { ok: false, reason: 'Enter a profile name and a context prompt.' };
  if (!PROFILE_MODEL_OPTIONS[p.kind].includes(values.model)) return { ok: false, reason: 'Select a model supported by this profile type.' };
  Object.assign(p, { name: values.name.trim(), model: values.model, prompt: values.prompt.trim(), includePrimer: Boolean(values.includePrimer), mode: p.kind === 'corrector' ? values.mode : null, version: p.version + 1 });
  s.profileDraft = structuredClone(p);
  if (selectedProfile(s, p.kind)?.id === p.id) assignProfile(s, p.kind, p.id);
  return { ok: true, profile: p };
}
export function cloneProfile(s, id) { const p = s.profiles.find(p => p.id === id); if (!p) return null; let n = s.profiles.length + 1; while (s.profiles.some(p => p.id === 'profile-' + n)) n++; const clone = { ...structuredClone(p), id: 'profile-' + n, name: p.name + ' copy', version: 1 }; s.profiles.push(clone); editProfile(s, clone.id); return clone; }
export function startRecognition(s, options = {}) {
  const p = s.profiles.find(p => p.id === (options.profileId || selections(s).recognizerId) && p.kind === 'recognizer');
  if (!p) return { ok: false, reason: 'Select a recognizer profile.' };
  if (p.model === 'gpt-live-transcribe') return { ok: false, reason: 'This profile uses a native live session. Use live capture, or select a bounded recognizer for recorded audio.' };
  if ([options.before ?? 6, options.after ?? 6].some(n => !Number.isFinite(n) || n < 0 || n > 120)) return { ok: false, reason: 'Evidence padding must be between 0 and 120 seconds.' };
  const d = s.dictations.find(d => d.id === s.dictationId), start = options.start ?? 0, end = options.end ?? d.duration;
  const result = createJob(s, { dictationId: d.id, start, end, parts: options.parts || 1, model: p.model, contextPolicy: 'Fixed snapshot', output: 'Recognition evidence' });
  if (!result.ok) return result;
  const frozen = structuredClone(p), input = profileContext(s, frozen), ctx = s.contextSnapshots.find(c => c.id === result.job.contextId);
  Object.assign(ctx, { prompt: input.prompt, keywords: input.keywords || [], profileSnapshot: frozen, compiledInput: structuredClone(input) });
  Object.assign(result.job, { title: (options.section ? 'Section re-recognition' : 'Recognition') + ' · ' + p.name, plan: options.plan === 'growing' ? 'Growing windows' : result.job.plan, profileSnapshot: frozen, initiatedFrom: 'Dictation', concurrency: s.settings.concurrency, notes: 'Simulated Dictation action. Frozen recognizer profile and primer input; results are evidence. Document changes remain review operations.' });
  for (const spanId of result.job.spanIds) { const queued = queueAttempt(s, result.job.id, spanId, { before: options.before ?? 6, after: options.after ?? 6 }); if (queued.ok) queued.attempt.profileSnapshot = structuredClone(frozen); }
  dispatchReady(s, result.job.id); return result;
}
export function retryRecognition(s, jobId, spanId, options = {}) {
  const job = s.jobs.find(j => j.id === jobId), previous = s.attempts.filter(a => a.jobId === jobId && a.spanId === spanId).at(-1);
  if (!job || job.dictationId !== s.dictationId) return { ok: false, reason: 'Open this job’s dictation before changing recognition input.' };
  const original = options.useOriginal !== false, p = s.profiles.find(p => p.id === options.profileId && p.kind === 'recognizer');
  if (!original && (!p || p.model === 'gpt-live-transcribe')) return { ok: false, reason: 'Select a bounded recognizer profile for this audio section.' };
  const result = queueAttempt(s, jobId, spanId, { ...(options.custom ? { before: options.before, after: options.after } : {}), model: original ? previous?.model || job.model : p.model, currentContext: !original });
  if (!result.ok) return result;
  if (!original) { const snapshot = structuredClone(p), input = profileContext(s, snapshot); const ctx = s.contextSnapshots.find(c => c.id === result.attempt.contextId); Object.assign(ctx, { prompt: input.prompt, keywords: input.keywords || [], profileSnapshot: snapshot, compiledInput: structuredClone(input) }); result.attempt.profileSnapshot = snapshot; }
  else if (previous?.profileSnapshot || job.profileSnapshot) result.attempt.profileSnapshot = structuredClone(previous?.profileSnapshot || job.profileSnapshot);
  syncRequestProjection(s, result.attempt); return result;
}
