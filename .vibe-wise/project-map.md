# Project Map

## Purpose
A fresh rebuild of SIXTEEN, a daily quiz-bowl game (learner: "make it better and also just a complete rebuild mostly"). On branch `remake`; the previous SIXTEEN app's files are deleted from the working tree (still in git history).

## Requirements
Stated by learner (2026-10-06):
- Keep Daily mode and Infinite mode.
- Keep doubling scoring (1, 2, 4, 8, 16 per correct answer).
- Change the miss penalty (old: -2 per miss). New value/shape: not decided.
- Improve the system for managing prompts. Problems observed in the old version:
  - difficulty was inconsistent (some prompts far too easy, some far too hard);
  - some prompts didn't make sense;
  - some prompts were too open-ended, so the answer list couldn't cover every valid response.
- Learner is unsure of the root cause ("it just didn't feel right").

Old version (git history, commit 8984340), for reference only: static no-build site; prompts in `assets/data.js` as {id, category, prompt, note?, answers: ["Canonical|alias|..."]}; no difficulty field; answer-list length varied per prompt; daily schedule as hand-listed id arrays in DAILY_SETS.

## Components
Confirmed design, not implemented (2026-10-11):
- Next.js app on Vercel: game pages (Daily, Infinite) + API routes.
- API route(s): receive playthrough results, write via Drizzle to Turso. No validation (honor system).
- Turso DB: prompts, playthroughs (schema undecided).
- Implemented 2026-10-11: `lib/scoring.ts` (promptScore(k,m) = 2^(k-1) − 2^(m-1), MAX_ENTRIES 5 — confirmed by learner), `lib/rating.ts` (priorRating, promptRating), `lib/db.ts` (server-only Drizzle/libSQL client, no schema). Tests in `tests/`.
- Prompt rating: expected points 0–16 (higher = easier). <10 playthroughs: 0.4·countScore + 0.6·authorScore. ≥10: 0.25·(that) + 0.75·livePlayerAvg. countScore = bucket table on answer count, in expected points (table undecided).
- Set builder: 5 prompts whose ratings balance to a target average (algorithm undecided).
- Authoring rule: closed, complete answer sets of 5–25 canonical answers; prompts assumed correct; note never contains an accepted answer.
- Answer-count buckets (decided): 5–7→2, 8–10→4, 11–15→8, 16–20→12, 21–25→16.
- Prompts stored in Turso. Schema implemented in `lib/schema.ts` (prompts, users, user_category_stats, global_category_stats, global_game_stats, daily); migration `drizzle/0000` applied to the learner's Turso DB `sixteen` (verified 2026-10-12). `lib/prompts.ts` validates prompts; `lib/games.ts` recordGame writes all counters in one atomic batch. Daily rolls over at midnight UTC. Guests play without saving; accounts (hashed passwords) save stats.

- Admin back end implemented 2026-10-12: `lib/auth.ts`, `lib/admin.ts`, `lib/admin-http.ts`, routes under `app/api/admin/`. Roles in users.admin_role (none/lower/right_hand/supreme). One token per admin (SHA-256 hash stored), rotated on every login, sent as httpOnly SameSite=Strict cookie or `Authorization: Bearer`. admin_log records prompts_added (count), prompt_failed, role_changed.
- Step 8 (2026-10-14): game. `/` → `/play` → `/play/daily` and `/play/infinite` (`app/play/game.tsx`); sets from `lib/sets.ts`; Dailies in `lib/dailies.ts` (+ `/admin/dailies`); `GET /api/play/daily` and `/api/play/infinite`, `POST /api/play/check` and `/api/play/record` (guest-only for now); Daily progress in localStorage `sixteen:daily:<date>`; share text in `lib/share.ts`.
- Prompt browser + ratings (2026-10-14): `/admin/prompts` (all admins; `listPrompts` in lib/admin.ts; client-side search and category filter in `prompt-browser.tsx`). `app/admin/(portal)/prompt-hint.tsx` shows category + current rating under id inputs on `/admin/dailies` (plus live set average) and `/admin/remove-prompt`; add-prompt shows a live starting rating. Set ranges are passed to client components as props so lib/sets (drizzle) stays off the client. Players may submit no guesses (0 entries → 0 points; confirmed in the UI; share line says "no answers"). `/admin/dailies` calls `io()` before reading the date.
- Step 7 (2026-10-14): prompt removal by id (supreme and right-hand) at `/admin/remove-prompt`; prompts in today's Daily can't be removed; future Dailies need a replacement (same category, not already in that day's Daily, current rating within 1); past Dailies keep the removed id, since daily has no foreign keys (migration 0004); logged with both ids.
- Step 6 (2026-10-14): answers gain prompts/ask/rejects; assignment that maximises credited guesses; optional email (migration 0003); supreme-only password resets (logged) and change-my-password; public guide at `/guide/prompts`. Open: prompt removal design.
- Answer matching implemented 2026-10-14 (step 5): `lib/answers.ts` (judgeGuess/judgeEntries built on qb-answer-checker 1.1.9, strictness 7), `lib/play.ts` + `POST /api/play/check` (public, stateless; returns only which entries need a prompt until every prompt is resolved, then results, score and answers). Open: word order, and prompts for partial guesses.
- Admin portal implemented 2026-10-13 (step 4): migration 0002 (`login_failures`, index on admin_log.created_at); `lib/lockout.ts` (5 failures per IP+username → 15-min lock; reset on expiry or success; counted for nonexistent usernames too); every log write prunes entries >30 days (no cron); notifications = log role changes targeting the admin (not stored); removed admins with the correct password get "your admin access has been revoked"; revoking other admins' tokens removed (own regenerate kept). Pages: `/admin/login`, `/admin` (dashboard + regenerate own token), `/admin/add-prompt` (form rows + JSON paste fills rows), `/admin/roles` (right-hand/supreme), `/admin/log` (all admins), `/admin/notifications`. Session read via `lib/admin-session.ts` inside Suspense (cacheComponents is on). Client IP from x-forwarded-for (`ipFrom`).

- Player accounts (2026-10-15, step 9): `lib/players.ts`, `lib/player-http.ts`, `/api/account/*`, pages `/signin` `/signup` `/profile`. users.username is lowercase + unique; users.display_name is what's shown. One plain player token per user (player_token), 60-day expiry checked on the server, shared by all devices; password change replaces it. `daily_completions` (user, date) holds the finished browser game JSON; `app/play/saved-daily.ts` syncs browser ↔ account (account wins). Migration 0006.

## Main Flow
Unknown.

## Data and Trust Boundaries
Chosen (not implemented): Turso (libSQL/SQLite) with Drizzle ORM storing playthrough results, so per-prompt difficulty can switch from the author's 0–16 estimate to the player average after 10 playthroughs. Leaderboard/individual stats planned later, out of current scope.
Submissions: honor system, no validation (learner's accepted risk; bad or fake scores would skew ratings).
Turso's token can't ship to the browser, so writes go through Next.js server routes on Vercel (chosen, not implemented).

## Build and Deployment
Verified: `npm test` (Vitest), `npm run lint`, `npm run build`, `npx tsc --noEmit` (after a build, which generates Next's global types). Env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` in `.env.local` (template `.env.example`). `npm run db:generate` / `npm run db:migrate` / `npm run create-user` (drizzle-kit; reads .env.local). Not yet deployed. Migrations 0003–0006 not yet applied to Turso.
Chosen (not implemented): Next.js app deployed on Vercel; Turso database accessed via Drizzle from server routes.
Repo contains only `.gitignore`, `.nojekyll`, `LICENSE.md` (MIT).

## Unknowns
Data model/schema; count bucket table; set-selection algorithm; Daily date keying; how difficulty is represented; prompt validation/authoring workflow; new miss penalty.
