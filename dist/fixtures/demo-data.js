import { addRevisionFixtures } from './revision-data.js';
import { createActivityFixtures, POLITICAL_DICTATION, POLITICAL_PRIMER } from './activity-data.js';
/**
 * ILLUSTRATIVE DATA ONLY. No value in this file comes from an ASR/model service.
 * Keep dictations, text, waveforms, requests, usage, and simulated responses here.
 * UI modules consume this fixture through createDemoData(); fixtures are never mutated.
 */
const waveform = (seed, count = 190) => Array.from({ length: count }, (_, i) => {
  const envelope = Math.abs(Math.sin(i * .127 + seed)) * .66 + .2;
  return Math.round(5 + Math.abs(Math.sin(i * 2.71 + seed) * Math.cos(i * .37)) * 58 * envelope);
});

const dictations = [
  {
    id: 'architecture', title: 'A better dictation workspace', date: 'Today, 16:42', group: 'Today', duration: 272,
    type: 'Microphone', language: 'English', tags: ['Product', 'Architecture'], status: '2 to review',
    waveform: waveform(2), markers: [{ time: 42, label: 'Context is the key' }, { time: 178, label: 'Next steps' }],
    blocks: [
      { id: 'a1', start: 0, end: 24, label: 'THE BIG IDEA', text: 'The best dictation tool should get out of the way. I want to think out loud, see my ideas take shape, and understand what happened when a word doesn’t look right.' },
      { id: 'a2', start: 24, end: 65, text: 'With the front end, we have another problem: the interface needs to feel simple while the system underneath stays completely inspectable. A clean page for the words. An audio bar that feels like an instrument. Everything else, one click away.', highlight: 'front end' },
      { id: 'a3', start: 65, end: 105, text: 'Context should travel with the recording. The topic primer can tell the recognizer that we’re discussing a React application, while a vocabulary entry keeps the spelling of AudioWorklet consistent. The corrector can use that same context without turning it into an instruction to rewrite what I meant.' },
      { id: 'a4', start: 105, end: 150, label: 'KEEP THE INTENT', text: 'We should automatically replace a passage that I’ve already edited. Every machine suggestion needs to know which version it was based on, and every manual change needs to remain mine.', highlight: 'should automatically', flag: 'Possible missing negation' },
      { id: 'a5', start: 150, end: 198, text: 'Requests can overlap. Results can arrive out of order. Neither of those things should rearrange the document under my cursor. The recognition history is evidence; the document is where I work.' },
      { id: 'a6', start: 198, end: 244, label: 'NEXT STEPS', text: 'Start with the audio timeline, request history, and a proper editor. Add a shared primer, then a conservative correction pass. Keep the model and processing strategy separate so we can compare them on the same recording.' },
      { id: 'a7', start: 244, end: 272, text: 'The goal is a calm writing experience with an honest view into the machinery. Nothing mysterious, and nothing fighting for attention.' }
    ]
  },
  {
    id: 'interview', title: 'Customer interview · onboarding', date: 'Today, 11:08', group: 'Today', duration: 1086,
    type: 'Imported audio', language: 'English', tags: ['Research', 'Interview'], status: 'Ready', waveform: waveform(8),
    markers: [{ time: 65, label: 'First impression' }],
    blocks: [
      { id: 'i1', start: 0, end: 65, label: 'FIRST IMPRESSIONS', speaker: 'Maya', text: 'When I opened the workspace, I knew where to start. The recording button was easy to find, and I liked being able to see my notes beside the audio.' },
      { id: 'i2', start: 65, end: 142, speaker: 'Daniel', text: 'What happened when you wanted to correct a word? Did you feel confident changing the text while the rest of the recording was still processing?' },
      { id: 'i3', start: 142, end: 268, speaker: 'Maya', text: 'I wanted to hear that sentence again first. Being able to jump from the text to the right part of the recording made the difference. I didn’t need a confidence score; I needed the evidence.' },
      { id: 'i4', start: 268, end: 395, label: 'A CLEARER REVIEW FLOW', speaker: 'Daniel', text: 'Keep review optional and make changes easy to undo. The document should be comfortable to read, with the detailed history available when someone needs it.' }
    ]
  },
  {
    id: 'planning', title: 'Notes for the week ahead', date: 'Yesterday, 09:15', group: 'Yesterday', duration: 495,
    type: 'Microphone', language: 'English', tags: ['Personal'], status: 'Edited', waveform: waveform(4), markers: [],
    blocks: [
      { id: 'p1', start: 0, end: 73, label: 'MONDAY', text: 'Leave the first hour for focused work. Finish the interaction prototype before opening up the implementation questions again.' },
      { id: 'p2', start: 73, end: 165, label: 'THIS WEEK', text: 'Review the language samples, compare the recognition strategies, and document the decisions that still need real-world testing.' },
      { id: 'p3', start: 165, end: 240, text: 'Keep the scope small enough that the next version feels coherent. A few interactions that work well will teach us more than another page of settings.' }
    ]
  }
];

const primer = {
  version: 7,
  topic: 'Designing the React frontend and audio pipeline of a speech dictation application.',
  scope: 'This recording · current topic', languages: ['English'],
  recentSpeech: 'The best dictation tool should get out of the way. I want to think out loud, see my ideas take shape, and understand what happened when a word doesn’t look right.',
  terms: [
    { id: 't1', text: 'frontend', origin: 'You confirmed', state: 'active', meaning: 'The application’s user interface' },
    { id: 't2', text: 'AudioWorklet', origin: 'Product vocabulary', state: 'active', meaning: 'Browser audio processing API' },
    { id: 't3', text: 'React', origin: 'Product vocabulary', state: 'active', meaning: 'The UI library' },
    { id: 't4', text: 'rolling window', origin: 'Primer model', state: 'proposed', meaning: 'Suggested from this session; not yet an active keyword' }
  ]
};

const requests = [
  { id: 'req-018', dictationId: 'architecture', kind: 'Recognition', model: 'gpt-transcribe', purpose: 'Expanded window', status: 'Complete', input: [18, 65], target: [24, 65], duration: '47.0 s', latency: '1.84 s', format: 'WAV · PCM16 · mono · 24 kHz', bytes: '2.26 MB', created: '16:43:07', contextVersion: 7, prompt: 'A technical discussion about the React frontend and audio pipeline of a speech dictation application. The preceding speech describes a simple, inspectable writing interface.', keywords: ['frontend', 'AudioWorklet', 'React'], text: 'With the frontend, we have another problem: the interface needs to feel simple while the system underneath stays completely inspectable. A clean page for the words. An audio bar that feels like an instrument. Everything else, one click away.', params: { model: 'gpt-transcribe', response_format: 'json', stream: true, languages: ['en'] }, events: [{ time: '+0 ms', event: 'Request queued' }, { time: '+42 ms', event: 'Audio submitted' }, { time: '+680 ms', event: 'First text received' }, { time: '+1,840 ms', event: 'Result stored' }] },
  { id: 'req-017', dictationId: 'architecture', kind: 'Recognition', model: 'gpt-transcribe', purpose: 'Initial window', status: 'Complete', input: [24, 38], target: [24, 38], duration: '14.0 s', latency: '0.92 s', format: 'WAV · PCM16 · mono · 24 kHz', bytes: '672 KB', created: '16:42:40', contextVersion: 6, prompt: 'A discussion about building a speech dictation application.', keywords: ['React'], text: 'With the front end, we have another problem: the interface needs to feel simple while the system underneath stays completely inspectable.', params: { model: 'gpt-transcribe', response_format: 'json', stream: true, languages: ['en'] }, events: [{ time: '+0 ms', event: 'Request queued' }, { time: '+34 ms', event: 'Audio submitted' }, { time: '+390 ms', event: 'First text received' }, { time: '+920 ms', event: 'Result stored' }] },
  { id: 'req-023', dictationId: 'architecture', kind: 'Recognition', model: 'gpt-4o-transcribe', purpose: 'Second listening', status: 'Complete', input: [98, 156], target: [105, 150], duration: '58.0 s', latency: '2.31 s', format: 'WAV · PCM16 · mono · 24 kHz', bytes: '2.78 MB', created: '16:44:41', contextVersion: 7, prompt: 'A software architecture discussion. Preserve the speaker’s wording, including negations and self-corrections. The current subject is protection of manual edits.', keywords: [], text: 'We should not automatically replace a passage that I’ve already edited. Every machine suggestion needs to know which version it was based on, and every manual change needs to remain mine.', params: { model: 'gpt-4o-transcribe', response_format: 'json', stream: true, include: ['logprobs'] }, events: [{ time: '+0 ms', event: 'Request queued' }, { time: '+51 ms', event: 'Audio submitted' }, { time: '+860 ms', event: 'First text received' }, { time: '+2,310 ms', event: 'Result stored' }] },
  { id: 'req-031', dictationId: 'interview', kind: 'Recognition', model: 'gpt-transcribe', purpose: 'Partitioned import', status: 'Complete', input: [0, 395], target: [0, 395], duration: '6 min 35 s', latency: '9.62 s', format: 'WebM · Opus · mono', bytes: '3.16 MB', created: '11:08:14', contextVersion: 2, prompt: 'A customer research interview about onboarding and reviewing dictated text.', keywords: [], text: 'When I opened the workspace, I knew where to start. The recording button was easy to find.', params: { model: 'gpt-transcribe', stream: false, languages: ['en'] }, events: [{ time: '+0 ms', event: 'Request queued' }, { time: '+220 ms', event: 'Audio submitted' }, { time: '+9,620 ms', event: 'Result stored' }] }
];

const changes = [
  { id: 'change-1', dictationId: 'architecture', blockId: 'a2', type: 'Terminology', title: 'Terminology correction', before: 'front end', after: 'frontend', explanation: 'The expanded audio window and your confirmed terminology both refer to the application’s user interface.', evidence: ['req-017', 'req-018'], time: [24, 65], state: 'pending', model: 'gpt-4.1-mini', baseVersion: 'v12' },
  { id: 'change-2', dictationId: 'architecture', blockId: 'a4', type: 'Meaning', title: 'Possible missing negation', before: 'should automatically', after: 'should not automatically', explanation: 'The second listening includes “not”. Compare the request evidence before accepting this change.', evidence: ['req-023'], time: [105, 150], state: 'pending', model: 'gpt-4.1-mini', baseVersion: 'v12' }
];

const models = [
  { role: 'Speech recognition', name: 'gpt-transcribe', purpose: 'Bounded audio requests', icon: 'wave', note: 'Growing windows · streamed response', details: { endpoint: '/v1/audio/transcriptions', response: 'Streamed text + final result', context: 'Prompt, keywords, languages', alignment: 'Input-window ranges; no word timestamps' } },
  { role: 'Recognition repair', name: 'gpt-4.1-mini', purpose: 'Conservative text proposals', icon: 'sparkles', note: 'Meaning-preserving · review first', details: { input: 'Transcript, alternatives, primer', output: 'Version-checked edit proposals', trigger: 'Completed passage', protection: 'Manual edits stay protected' } },
  { role: 'Topic primer', name: 'gpt-4.1-mini', purpose: 'Local topic + proposed terms', icon: 'compass', note: 'Background refresh · never blocks ASR', details: { input: 'Recognition transcript + confirmed terms', output: 'Versioned topic and term proposals', scope: 'Current recording and topic', learning: 'Explicit confirmation for new terms' } }
];

export const DEMO_SETTINGS = { asrModel: 'gpt-transcribe', strategy: 'growing', correctorModel: 'gpt-4.1-mini', primerModel: 'gpt-4.1-mini', profile: 'Light cleanup', contextPolicy: 'Latest available', targetSeconds: 8, windowSeconds: 30, concurrency: 3, autoApply: false, showAnnotations: true, followPlayback: true, theme: 'light', fontSize: 'comfortable', device: 'MacBook Pro Microphone', noiseSuppression: true, echoCancellation: true };

export const LIVE_EXAMPLE = { id: 'live-demo', title: 'Untitled recording', date: 'Just now', group: 'Today', duration: 0, type: 'Microphone', language: 'English', tags: [], status: 'Recording', waveform: waveform(12), markers: [], blocks: [], phrases: ['Let’s start with the experience.', 'The document should feel calm, even while several recognition requests are running in the background.', 'I want the details to be available when I need them, without making the writing surface feel like a dashboard.'] };
export const IMPORT_EXAMPLE = { name: 'Product strategy workshop.m4a', duration: 7200, size: '86.4 MB', format: 'M4A', parts: 20 };
export const SIMULATION = { requestLatency: '1.62 s', requestBytes: '1.44 MB', requestFormat: 'WAV · PCM16 · mono · 24 kHz', repairedText: 'The interface needs to feel simple while the system underneath stays completely inspectable.', audioDeviceLevel: -18.4 };
export const NEW_PRIMER_TOPIC = 'A new dictation about a calm, inspectable writing experience.';
export function createDemoData() {
  const data = structuredClone({ dictations, primer, requests, changes, models });
  data.primers = {
    architecture: data.primer,
    interview: { version: 2, topic: 'Customer research about onboarding and the first recording experience.', scope: 'This recording · current topic', languages: ['English'], recentSpeech: dictations[1].blocks[0].text, terms: [] },
    planning: { version: 1, topic: 'Planning the next product milestone and reviewing design priorities.', scope: 'This recording · current topic', languages: ['English'], recentSpeech: dictations[2].blocks[0].text, terms: [] }
  };
  data.dictations.unshift(structuredClone(POLITICAL_DICTATION));
  data.primers.political = structuredClone(POLITICAL_PRIMER);
  Object.assign(data, createActivityFixtures(data));
  addRevisionFixtures(data);
  return data;
}

export const WORKSPACE_AVATAR = 'JM';
export const AUDIO_INPUT_OPTIONS = ['MacBook Pro Microphone', 'External USB microphone', 'System audio'];
