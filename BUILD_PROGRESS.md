# Build progress

STATUS: COMPLETE

Build log for death-squadron v0.1. Kept out of the npm package by the `files` field.

## Decisions

- Two data modes. `--fixture` plays a scripted synthetic fleet in the wire format (snapshot, then diffs), deterministic by elapsed seconds. Live mode (default) discovers sessions from `sessions/*.json`, then reads each transcript through the vendored core reader. A session without a transcript keeps the status-file mapping.
- Phase 5 (Sketchfab models) is skipped: the downloads need a login.
- The bridge viewport shows only the starfield. A passing Star Destroyer would be decoration with no session behind it.

## Phases

### Phase 0, scaffold (commit 9668631)

MIT licence, THIRD_PARTY_NOTICES with the MIT notices of azorkai/claude-code-office and Kostakurta8/roundtable, the font and crest credits. Fonts bundled locally (Aurebesh, Michroma and Rajdhani subset to Latin, about 140 KB together). `scripts/guard.js` runs from `.githooks/pre-commit` and `pre-push` and on `prepack`: work identifiers, user paths, UUID-shaped strings outside `test/fixtures`, and any non-localhost URL in `dist/`. Seen: the pre-commit hook printed `guard: clean` on the first commit, author is the noreply address.

### Phase 1, core and server (commit ce43610)

`core/fsguard.js` refuses any extension but `.json` and `.jsonl`. `core/discover.js` reads `sessions/*.json`, `process.kill(pid, 0)` for liveness. `core/live.js` maps `busy` to working, a finished turn to "your turn" for 10 minutes then idle, a dead pid to ended. `core/fixture.js` scripts a 90 second loop with every legend state. `core/server.js` binds 127.0.0.1, walks 7777 to 7799, skips 3001, answers 403 to foreign Host headers, streams a snapshot then diffs over SSE, ticks only while a tab is open, never sends the full working directory. Seen: 20 of 20 tests green, type check green.

### Phases 2 and 3, fleet, bridge, plain skin, lanes and HUD

Vite client in `web/`, one WebGLRenderer shared by both 3D skins, a skin switch that disposes the scene and keeps the flagship. The render loop runs at 30 fps, 60 only while dragging, and stops when the tab is hidden or scrolled out of view. The page closes its event stream while hidden, so the server stops reading. Every mark maps to a state:

| State | Fleet | Bridge | Lanes |
|---|---|---|---|
| working | engines flicker bright, spine lights on the flagship | console screen flickers white, Vader's cape sways | open span with a pulsing end |
| thinking | engines pulse dim | screen pulses pale blue | thinking span |
| waiting on you | red beacon plus expanding ring, red HUD tile, YOUR TURN timer | red flashing screen and lamp | bright red span |
| gate | pulsing red bracket, CLEARANCE timer | slow red pulse on screen and lamp | red hatched span |
| idle | hull dark, drifts back a row | trooper at 40 percent | nothing new |
| ended | hyperspace stretch and flash | trooper turns and walks off, console dark | span closes |
| subagent | TIE launches, patrols, docks | drone circles the station | nested row |
| message in flight | bolt between ships for 3 s | bolt between stations | none |
| compaction | shield flash | screen flashes blue | dashed tick with token count |

Seen in headless Chromium (SwiftShader) at 1280 and 390: no console errors, no horizontal scroll, fleet about 25 draw calls and 6k triangles, bridge about 20 draw calls and 18k triangles. The dist guard caught a paper URL inside a three.js shader comment, a build plugin strips URL-bearing comment lines.

### Phase 4, core reader and release prep

The shared live-core reader is vendored at commit c342154, after its own 62 tests passed. `scripts/vendor-core.js` compiles eight of its TypeScript files to plain JS in `core/vendor/live-core/`. `core/transcripts.js` is the thin adapter. It finds each transcript by encoded working directory, falling back to a shallow walk of `projects/`, then maps the core's summaries to states, lanes, compaction and error marks, subagents and flights. An open tool means working, a running generation means thinking, and a finished turn means your turn for 10 minutes, then idle. The gate state stays unused because no prompt reader exists. The new tests spy on the fs module itself: only `.json` and `.jsonl` are opened, the synthetic `.key` files in `sessions/`, the project folder and `subagents/` are never touched, and reads change nothing on disk. 26 of 26 tests green, type check green.

Seen:
- A live smoke run against real sessions (read-only, nothing kept in the repo) found 8 sessions, every one with lanes and compaction marks, 13 subagents and no working directory in the public frame. The first read took about 2.2 s while backfilling, then about 18 ms per tick.
- Idle cost with the tab hidden: the render loop stops (0 frames in 19 s), the event stream closes, the server stops ticking and reading, and the server process used 32 ms of CPU in 19 s. It resumes on show.
- Reduced motion: the media query is honoured and no errors are thrown. Timers and lanes still update because they carry state.
- `npm pack` gives 34 files, 273.4 kB packed and 891.2 kB unpacked: bin, core with the vendored reader, dist, README, LICENSE and notices. Tests, fixtures, docs and this file stay out.
- `npx` run from the tarball with `--fixture` served the snapshot and the bundle, and a foreign Host header got 403.
- The README carries the safety line from spec section 5 word for word, the fan-project notice, the takedown line and the maintainer publish steps. The screenshots in `docs/` come from the synthetic fixture.

Not verified: rendering on a real GPU, browser auto-open on macOS and Linux, and the looping GIF the spec lists for the README (left out).

