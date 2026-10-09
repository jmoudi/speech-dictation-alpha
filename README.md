# Speech Dictation — Studio

An interactive, browser-local GUI mock-up for an inspectable dictation workspace. The central surface is the editable document; a recording library, audio timeline, and collapsible inspector keep supporting information nearby. Settings live in the top-right corner.

## Run

Requires Node.js 20 or newer. No dependencies or build step.

```sh
npm start
```

Open http://localhost:4173. Serve `dist/` with any static web server for deployment. ES modules require HTTP; opening the HTML directly with `file://` is unsupported.

## Explore

- Edit the document, find text, compare the source transcript, and export TXT, Markdown, or JSON.
- Review two sample corrections; accept, dismiss, undo, and inspect their supporting requests. A manually edited passage is protected against automatic replacement.
- Inspect input windows, target spans, parameters, frozen context, alternatives, and request events.
- Edit a recording-specific topic primer, confirm proposed terms, and compare its ASR and corrector inputs. Changing the primer does not mutate earlier request snapshots.
- Inspect recognition, repair, and primer model configuration. Switch between bounded audio planning policies and a native live-session configuration in Settings.
- Preview recording/playback, add markers, loop a passage, browse recordings, and inspect illustrative background jobs.
- Use light/dark appearance, larger document text, and a collapsible inspector. Narrow layouts use drawer panels.

The interface marks itself as a mock-up. Recording, playback, import processing, job progress, model responses, timing, and coverage are illustrative. There is no microphone access, audio decoding, API connection, authentication, or persistence. Choosing a file reads its name only. Refreshing resets the workspace. Text exports are real local downloads. Model IDs and capability displays are design fixtures, not a production provider contract.

## Separation of code and illustrative data

```text
dist/
  fixtures/demo-data.js  # All sample recordings, transcripts, waveforms, requests,
                        # model cards, context, suggestions, and simulation values
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

Tests cover evidence preservation, undo, protection of human edits, stale proposals, per-recording context isolation, context compilation, model/strategy compatibility, HTML escaping, and rendering across inspector/dialog states. This implementation was checked without an interactive browser QA pass.
