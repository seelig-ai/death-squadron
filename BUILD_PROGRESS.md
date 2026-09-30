# Build progress

STATUS: PARTIAL

Build log for death-squadron v0.1. Kept out of the npm package by the `files` field.

## Decisions

- Two data modes. `--fixture` plays a scripted synthetic fleet in the wire format (snapshot, then diffs), deterministic by elapsed seconds. Live mode (default) discovers sessions from `sessions/*.json` only and maps each file's `status` field to a state. Transcript lanes in live mode wait for the shared core reader, which does not exist yet.
- Phase 5 (Sketchfab models) is skipped: the downloads need a login.
- The bridge viewport shows only the starfield. A passing Star Destroyer would be decoration with no session behind it.

## Phases

