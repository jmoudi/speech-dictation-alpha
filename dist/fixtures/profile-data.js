/** Illustrative reusable processing profiles. Model IDs are design fixtures. */
export const PROFILE_FIXTURES = [
  { id: 'recognizer-main', kind: 'recognizer', name: 'Recognizer Main', model: 'gpt-transcribe', version: 4, prompt: 'Transcribe the spoken wording faithfully. Preserve negation, qualifications, names, amounts and dates. Use the supplied topic and confirmed terminology as context.', includePrimer: true, mode: null },
  { id: 'recognizer-special', kind: 'recognizer', name: 'Recognizer Special Case', model: 'gpt-4o-transcribe', version: 2, prompt: 'Transcribe this difficult passage as spoken. Use surrounding audio to resolve word boundaries. Retain uncertainty rather than inventing missing statements.', includePrimer: true, mode: null },
  { id: 'recognizer-live', kind: 'recognizer', name: 'Recognizer Live', model: 'gpt-live-transcribe', version: 1, prompt: 'Transcribe incoming speech faithfully. Keep revisions attributable to the received audio and preserve substantive wording.', includePrimer: true, mode: null },
  { id: 'corrector-main', kind: 'corrector', name: 'Corrector Main', model: 'gpt-4.1-mini', version: 3, prompt: 'Suggest corrections for recognition errors. Cite recognition evidence where available. Preserve meaning, negation and attribution. Return before/after proposals with reasons; never mutate the document.', includePrimer: true, mode: 'repair' },
  { id: 'corrector-cleanup', kind: 'corrector', name: 'Corrector Cleanup', model: 'gpt-4.1-mini', version: 2, prompt: 'Suggest removal of spoken fillers and formatting changes. Preserve substantive wording. Return review proposals; do not apply changes.', includePrimer: true, mode: 'cleanup' },
  { id: 'corrector-editorial', kind: 'corrector', name: 'Corrector Editorial', model: 'gpt-4.1', version: 1, prompt: 'Suggest clearer phrasing and organization. Retain substantive facts, qualifications and attribution. Present each rewrite as a proposal requiring human acceptance.', includePrimer: true, mode: 'editorial' }
];
export const PROFILE_MODEL_OPTIONS = { recognizer: ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-live-transcribe'], corrector: ['gpt-4.1-mini', 'gpt-4.1'] };

export function addProfileFixtures(data) {
  const profile = structuredClone(PROFILE_FIXTURES.find(p => p.id === 'corrector-main'));
  const changes = data.changes.filter(c => c.dictationId === 'architecture'), primer = data.primers.architecture;
  const inputContext = { profile_id: profile.id, profile_name: profile.name, profile_version: profile.version, primer_version: primer.version, model: profile.model, prompt: profile.prompt + '\n\nTopic: ' + primer.topic, topic: primer.topic, output: 'Review proposals', manual_edits: 'protected', policy: 'Suggestions only; human acceptance required.' };
  for (const c of changes) { c.profileSnapshot = structuredClone(profile); c.inputContext = structuredClone(inputContext); c.jobId = 'job-repair-architecture'; }
  data.repairTemplates = structuredClone(changes);
  data.jobs.push({ id: 'job-repair-architecture', dictationId: 'architecture', title: 'Correction suggestions · Corrector Main', kind: 'Text correction', plan: 'Recognition repair', model: profile.model, state: 'Complete', spanIds: [], created: '18:34:00', priority: 'Normal', concurrency: 1, contextPolicy: 'Frozen profile and primer', output: changes.length + ' review proposals', dependsOnJobs: [], profileSnapshot: profile, textTask: { input: 'Working document v12', baseVersion: 12, scope: 'Recognition-repair fixture passages', guard: 'Suggestions only; human acceptance required', result: changes.length + ' proposals', inputContext }, initiatedFrom: 'Dictation', notes: 'Illustrative completed corrector execution. Suggestions remain pending until human review.' });
}
