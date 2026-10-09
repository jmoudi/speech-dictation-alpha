# Speech Dictation — Studio

A browser-local UI mock-up for technical dictation work. The dedicated full-screen Dictation view owns recognition, processing profiles, document state, and exceptional tools. Workspace is the editor. Activity inspects pipeline progress and independent job/span/attempt records; it has no recognition-start or execution controls.

## Run

Requires Node.js 20 or newer. No dependencies or build step.

```sh
npm start
```

Open http://localhost:4173. Serve `dist/` for static hosting. ES modules require HTTP.

## Domain model

- **Dictation** is the human work item: audio references, working document, recognition evidence, primer, profile selections and revision history. Many independent jobs can reference it.
- **Recognizer profile** is a reusable name, model, editable context prompt and primer-inclusion policy. Main, Special Case and Live are illustrative profiles.
- **Corrector profile** is a reusable name, model, editable instruction prompt and suggestion policy. Repair, cleanup and editorial profiles all return proposals. A corrector never directly writes document text or generates an automatically applied editorial document.
- **Run configuration** freezes a profile version and the compiled dictation context. Profile or primer changes affect future runs; prior inputs remain inspectable.
- **Job** is an independent execution of recognition, text correction or primer analysis. Recognition jobs own target spans; text jobs have document/context inputs and no audio blobs.
- **Audio span** is a target interval on an audio asset. Multiple jobs can refer to the same span.
- **Attempt** is one execution for a job/span, with its own model, frozen context, response/error, blob, submission order and completion order.
- **Blob** is prepared input audio. Evidence before/after can overlap other windows. Retries preserve earlier attempts and either reuse input or prepare another window.

Whole-target, partitioned and growing-window plans share the bounded audio request executor. Native live recognition uses a session transport. Planning belongs to the run, separately from a reusable model/prompt profile. The retained-audio preview rejects native live profiles rather than treating a session as a file request.

## Explore

Dictation opens by default. Its five dedicated panels are:

1. **Overview:** pipeline stages, source/document coverage, retained evidence, human-edit protection and selected processing profiles.
2. **Audio & recognition:** retained source references, a visual timeline and recognition initiation scoped to this dictation.
3. **Documents & review:** editor/review links, assembly preview, correction proposals, exports, history and application journal.
4. **Profiles & context:** profile selection, editable dictation primer, reusable prompt editing and compiled recognizer/corrector inputs.
5. **Advanced:** collapsed section re-recognition, retry configuration, dispatch/cancellation controls and explicit fixture response simulation.

Settings remain top-right. Processing profiles can be duplicated, renamed, assigned a different model, and given an editable prompt. Saving creates a new version and preserves run snapshots. Confirmed terminology is compiled into keywords where supported or into prompt text otherwise; ordinary document editing does not silently become ASR context.

Activity presents the audio → recognition → assembly → correction suggestions → human review/document relationship. Each stage can contain independent jobs and parallel comparisons. Inspect targets, attempts, overlapping input windows, dependencies, out-of-order completion, frozen inputs, responses and raw records. Activity contains no job creation, dispatch, retry or response-simulation controls.

The political-report fixture demonstrates a recovered retry, wholly failed target, in-flight attempt, dependency-blocked work, parallel comparison and independent text/primer jobs. The briefing fixture demonstrates out-of-order completion, overlapping windows with explicit target-text mappings, document gaps and conflicting attribution/amount/date hypotheses.

Assembly uses mapped target text in audio order and excludes surrounding input-window context. Unmapped results, overlapping targets, competing hypotheses and protected passages remain explicit. Preview gap filling or replacement; applying a passage is a human action with source provenance.

All corrector modes generate guarded before/after proposals. Review prioritizes negation, attribution, numbers, dates and qualifications heuristically and exposes the frozen corrector input. Choosing recognition evidence proposes a separate document update. Human typing is accepted directly; applying a suggestion requires explicit acceptance and a matching base passage. Undo is per dictation and version numbers remain monotonic.

## Simulation boundary

This is a UI mock-up, with no microphone access, audio decoding, provider calls, authentication or persistence. Profiles, model IDs/capabilities, sample documents, responses, coverage and timing are illustrative. Choosing a file reads its name and metadata only. Text/JSON exports are real local downloads. Refresh resets local preview state. Recognition and corrector actions only demonstrate local state transitions.

## Separation of code and illustrative data

- `dist/fixtures/demo-data.js`: dictations, transcripts, waveforms, model cards and settings fixtures.
- `dist/fixtures/activity-data.js`: jobs, spans, attempts, blobs, frozen contexts and simulated responses.
- `dist/fixtures/revision-data.js`: target mappings and mode-specific sample revision text.
- `dist/fixtures/profile-data.js`: reusable profile prompts and initial correction-run fixtures.
- `dist/src/profile-store.js` and `profile-view.js`: profile editing, selection, frozen inputs and configuration panels.
- `dist/src/dictation-hub-view.js`: dedicated Dictation view and recognition form.
- `dist/src/pipeline-view.js`: pipeline stages and execution relationships.
- `dist/src/activity-store.js`, `activity-view.js` and `comparison-view.js`: execution records and inspectors.
- `dist/src/document-state.js`, `revision-store.js` and `revision-view.js`: document revisions, guarded proposals, assembly and semantic review.
- `dist/src/app.js`: DOM interactions and explicitly simulated transport.
- `dist/src/views.js`, `dictation-view.js`, `styles.css` and `icons.js`: editor, shared UI and visual system.

Future adapters should preserve immutable run inputs, independent jobs and attempts, explicit target mappings, and the human document-write boundary. Capability metadata must be verified against the chosen provider before production use.

## Verify

```sh
npm run check
npm test
```

Tests cover profile/run separation, frozen prompts, per-dictation selections, bounded/live compatibility, section-recognition guards, retry configuration, suggestion-only correction, pipeline inspection controls, domain references, overlap-safe coverage/assembly, dependencies, concurrency, cancellation, semantic priority, guarded human acceptance, isolated undo and rendering/escaping. Browser QA was unavailable in the managed environment.
