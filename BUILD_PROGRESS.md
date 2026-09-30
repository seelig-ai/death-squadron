# Build progress

STATUS: PARTIAL

Build log for death-squadron v0.1. Kept out of the npm package by the `files` field.

## Decisions

- Two data modes. `--fixture` plays a scripted synthetic fleet in the wire format (snapshot, then diffs), deterministic by elapsed seconds. Live mode (default) discovers sessions from `sessions/*.json` only and maps each file's `status` field to a state. Transcript lanes in live mode wait for the shared core reader, which does not exist yet.
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

