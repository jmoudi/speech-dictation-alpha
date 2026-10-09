# Speech Dictation — Studio

An interactive, browser-local GUI mock-up for an inspectable dictation workspace. The central surface is the editable document; a dictation library, audio timeline, and collapsible inspector keep supporting information nearby. Settings live in the top-right corner.

## Run

Requires Node.js 20 or newer. No dependencies or build step.

```sh
npm start
```

Open http://localhost:4173. Serve `dist/` with any static web server for deployment. ES modules require HTTP; opening the HTML directly with `file://` is unsupported.

## Domain model

- **Dictation**: the human work item, document, audio references, and primer. It is not a job.
- **Job**: an independent scheduled operation referencing a dictation. Several ASR, correction, and primer jobs may reference the same dictation.
- **Audio span**: a target interval on an audio asset. Multiple jobs may reference the same span.
- **Attempt**: one execution for a job/span, with its own status, model, blob, frozen context, response, error, and execution order.
- **Blob**: prepared audio input. The window can include evidence before and after the target and overlap other windows. A retry can reuse a blob or prepare a wider one.

Activity opens by default. The political-report fixture has four jobs, including independent comparison and text-processing jobs. The main ASR job demonstrates out-of-order completion, a recovered retry, three failed attempts on one span, an in-flight attempt, a dependency-blocked span, and unattempted work. A comparison job references the same failed span with a different model.

Target coverage uses the union of successful target intervals within the selected job. Transmitted duration sums submitted attempt windows, including context overlap and retries. Success stores evidence; it does not apply text to the document.

## Explore

- Filter jobs by dictation/status or search by ID; inspect spans, attempts, execution events, and configuration.
- Inspect the overlap diagram and each attempt’s blob, frozen context, serialized ASR input, response/error, and raw JSON.
- Create additional jobs for existing dictations; retry failed spans, expand context, pause dispatch, cancel jobs, and explicitly simulate success/failure. Cancellation preserves completed evidence.
- Open the associated dictation or jump from a workspace recognition request to its job/span/attempt.
- Edit the document, find text, compare the source transcript, and export TXT, Markdown, or JSON.
- Review two sample corrections; accept, dismiss, undo, and inspect their supporting requests. A manually edited passage is protected against automatic replacement.
- Inspect input windows, target spans, parameters, frozen context, alternatives, and request events.
- Edit a dictation-specific topic primer, confirm proposed terms, and compare its ASR and corrector inputs. Changing the primer does not mutate earlier request snapshots.
- Inspect recognition, repair, and primer model configuration. Switch between bounded audio planning policies and a native live-session configuration in Settings.
- Preview recording/playback, add markers, loop a passage, browse dictations, and inspect illustrative background jobs.
- Use light/dark appearance, larger document text, and a collapsible inspector. Narrow layouts use drawer panels.

The interface marks itself as a mock-up. Recording, playback, import processing, job progress, model responses, timing, and coverage are illustrative. There is no microphone access, audio decoding, API connection, authentication, or persistence. Choosing a file reads its name only. Refreshing resets the workspace. Text exports are real local downloads. Model IDs and capability displays are design fixtures, not a production provider contract.

## Separation of code and illustrative data

```text
dist/
  fixtures/demo-data.js  # Sample dictations, transcripts, waveforms, model cards
  fixtures/activity-data.js # Job/span/attempt/blob/context fixtures and responses
  src/activity-store.js # Job lifecycle, retries, union coverage, frozen context
  src/activity-view.js  # Job browser, span/attempt tables, evidence inspector
  src/store.js          # State transitions, guarded proposals, context compilation
  src/views.js          # UI rendering, no embedded sample transcripts
  src/app.js            # DOM events and explicitly simulated transport
  src/styles.css        # Responsive light/dark visual system
  src/icons.js          # Local SVG icon primitives
  index.html
  favicon.svg
scripts/                # Dependency-free local server and source checks
tests/                  # State invariants and rendered-state smoke tests
```

`createDemoData()` returns a fresh copy. Recognition evidence and the working document are separate; correction acceptance edits the working document only. Ordinary editing does not become primer input. Future production adapters should replace the fixture/simulation boundary, retain request/context provenance, and revalidate capability metadata against the selected provider.

## Verify

```sh
npm run check
npm test
```

Tests cover domain references, shared spans, overlap-safe coverage, independent retries, frozen context, dependency blocking, cancellation, job creation, evidence preservation, undo, protection of human edits, stale proposals, per-dictation context isolation, context compilation, model/strategy compatibility, HTML escaping, and rendering across inspector/dialog states. This implementation was checked without an interactive browser QA pass.
