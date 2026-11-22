# Fault Lines

A daily earthquake-epicenter puzzle that runs inside a Reddit post. Each UTC day has one shared fictional earthquake. Three or four seismograph stations show noisy S-P delays. You place a pin where you think the epicenter is, lock in, and see one result card: the truth, your error, your score, your stars, the crowd pin cloud, the crowd median, your percentile, your streak and a spoiler-free share button. One minute of play, one guess per day, max two sentences of instructions.

Built with Devvit Web, Express, TypeScript and Canvas 2D. No React components, no external assets, no map tiles.

## How to play

1. Open the daily post. The seismographs are already read and the delays are on the stations.
2. Click or tap the map to place your pin. Far stations shake later, so the delay pattern tells you how far away the quake was.
3. Press Lock in. The result card shows how far off you were.

## Commands

```text
npm install          install locked dependencies
npm test             fast test suite
npm run verify       typecheck, lint, headers, FILEMAP freshness, secret scan, tests with coverage, production audit, Vite build
npm run verify:full  verify plus the 500-seed calibration sweep
npm run build        Vite build of the two client documents and the CommonJS server bundle
npm run dev          Devvit playtest (needs devvit login)
npm run deploy       verify, then devvit upload (needs devvit login)
npm run filemap      regenerate docs/FILEMAP.md
```

Node 24.18.0 or newer is documented. The local machine ran 24.16.0 through P6 and everything passed; see `docs/DECISIONS.md` D-012 and D-024.

## Deploy

The daily post is created by the `daily-puzzle` scheduler task at 00:00 UTC, and by the moderator menu item `Create today's Fault Lines post` as a recovery path. If the scheduler fails or the post is missing, any moderator opens the subreddit menu, taps `Create today's Fault Lines post`, and the post is created on the spot. The task and the menu action are idempotent: running either twice reports `exists` instead of duplicating the post.

## Architecture in 10 lines

1. `src/shared/` is pure TypeScript: constants, dates, geometry, the seeded generator, the fairness gate and the Levenberg-Marquardt solver; no I/O, no clock, no global randomness.
2. `src/server/` is Express built by `createApp(deps)`: security headers, `/api/*` routes, `/internal/*` routes, a generic 404 and one error handler.
3. `src/server/core/` holds the business logic against ports (`Store`, `Clock`, `EntropySource`, `Tracker`, `PostPublisher`, `Identity`, `Logger`), so tests run on fakes.
4. `src/server/adapters/` is the only place that talks to Devvit: Redis, context, Reddit, system clock, entropy.
5. The puzzle seed comes from `EntropySource` only and lives inside the `puz` record; `/api/puzzle` never emits truth, seed or solver fit.
6. One guess per user per day is committed with `hSetNX` on `gs:{dateKey}`; the server computes score, stars, streak and the crowd counters.
7. `src/client/` is plain TypeScript and Canvas 2D: `splash.html` (inline entry) and `game.html` (expanded entry), a tokenized theme, a runtime-validated API client and a small state machine.
8. The result card is DOM with `textContent` only; the map and seismograms are Canvas 2D.
9. Tests use Vitest fakes; meta tests scan the source, the built bundle and `devvit.json`.
10. Every Redis key is built in one module with validated tokens, and each day's keys carry a TTL via sentinel fields.

See `docs/FILEMAP.md` for the generated file map.

## Development playtest

The app is installed in the private `r/fault_lines_game_dev` playtest subreddit as `fault-lines-game`. Local commands (`npm run dev`, `npm run deploy`) need `devvit login` first.

## Privacy

Only the Reddit user id is stored (to enforce one guess per day and to keep the streak). Results are anonymous: no ids, names or timestamps are returned by any API. The streak record (`st:{userId}`) has no expiry, so the user id is stored indefinitely; there is no other personal data and no third-party service. Journey telemetry (when enabled) carries no user id, coordinates or timestamps.

## Repository hygiene

The repository is public. Never commit tokens, `.env` files or Devvit auth state (`.devvit-token` is git-ignored). Tests use fake ids like `t2_test1`. See `docs/SECURITY_EVIDENCE.md` for the S1-S19 control evidence and `docs/DECISIONS.md` for the residual risks.

## Status

Code complete through P6. The runtime gates (playtest on a phone, the scheduler firing at midnight UTC, the one-guess rule in the real webview, the P5 Journey events) are deferred to the developer's playtest and tracked in `docs/PROGRESS.md` and `docs/DECISIONS.md` (D-026, D-027, D-028).
