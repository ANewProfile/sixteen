# Learning Progress

## Pending decision
None.

## Implementation step 9: player accounts (approved and implemented 2026-10-15)
Approved with all of Claude's proposed additions. Implemented: migration 0006 (display_name, lowercased username, player_token + created_at, daily_completions); lib/players.ts; lib/player-http.ts (cookie sixteen_player); routes /api/account/{signup,signin,signout,me,username,password,delete,daily}; /api/play/record uses the cookie; recordGame options playerOnly + alsoWrite; lib/play.ts recordPlayed/transferDaily/dailyCompletion; app/play/saved-daily.ts (save helpers + sync); pages /signin, /signup, /profile; AccountBar on / and /play; create-user validates names.
Changed from the proposal: a second device recording an already-finished Daily gets 200 with the stored game rather than 409. Admin-portal password change and supreme resets also clear the player token (signs out every device). isUniqueViolation now reads Drizzle's error causes.
Known behavior: a finished guest Daily in a shared browser moves into whichever account signs in next.
Verified: 143 tests, tsc, lint, build; HTTP flow against a scratch DB (signup, case-insensitive duplicate, shared token/expiry, record + second device gets stored game, password change signs out other device and clears its cookie, rename, delete). UI not clicked through by Claude. Migrations 0003–0006 must be applied to Turso.
Requirements (learner's answers 2026-10-14/15):
1. Several devices; a sign-in lasts 2 months from sign-in, never renewed by activity. A password change or reset signs out all other devices.
2. Admins use the same player sign-in and are treated like players; it doesn't touch their admin token.
3. Usernames: 1–32 ASCII characters, shown exactly as typed; capitalization and symbols don't count when checking for duplicates. 8-character password minimum.
4. A Daily in progress lives in the browser. When finished, the browser keeps the result that day, stats go to Turso, and the account records completion so it can't be replayed elsewhere. Another device shows "already played" with an option to see the score.
5. Profile page: change password and/or username (not email), see stats.
6. Players can always delete their account; global stats stay. Admins can delete theirs; supreme leaders cannot (even if not the last). Deletion needs the password and extensive confirmation.
7. Duplicate check compares letters and digits only, case-insensitive (Theo_Chen = theo chen = theochen); spaces allowed; display name is exactly as the user typed it.
8. A guest's finished Daily stored in the browser transfers to the account on sign-in; an account's finished Daily from another device is copied into the browser on sign-in (so it survives sign-out).
9. Peeking on one device and finishing on another is acceptable (low stakes).
10. "Already played" shows the full finished screen, identical to the device that played.
11. Daily completions: store judged results in a new table (not re-judged from raw guesses).
12. Sync conflict: the account's finished Daily wins over the browser's.
13. A transferred guest result counts toward the player's own stats (global already counted).
14. Usernames revised (supersedes 3 and 7): 2–32 characters from a-z A-Z - _ only; duplicates compared case-insensitively only (Theo = theo; Theo_C ≠ theoc); displayed exactly as typed.
15. Usernames revised again (supersedes 14's charset/length): 2–16 characters from a-z A-Z 0-9 - _, at least one letter; case-insensitive duplicates; displayed as typed. No existing users to migrate (app unpublished).
16. Completions: one row per player per day holding everything needed to recreate the finished screen.
17. Sessions, learner's first proposal: a cookie lasting 2 months; signed in while it exists. Claude flagged (2026-10-15): cookie contents must be unforgeable, and "password change signs out other devices" needs server-side state.
18. Duplicate enforcement: "check on insertion" — Claude asked whether that means a database constraint or a check in code before inserting.
19. Sessions, learner's design: one player token per user, stored in users with its creation time. Sign-in with no valid token generates one (never reusing any value in the table); another device signing in gets the same token with the same expiry (2 months from creation). Sign-out deletes only that device's cookie. Password change replaces the token, signing out other devices; a cookie that doesn't match the database is destroyed on page open.
Claude flagged (2026-10-15): giving new devices the same token needs the raw token stored (admin tokens are stored as SHA-256 hashes); expiry must be checked on the server; this changes requirement 1 (each sign-in lasting 2 months).
20. Token stored plain (learner: a leak exposes no private information). Every device shares the first sign-in's expiry.
21. Usernames: `username` column = lowercase, unique constraint; `display_name` = as typed and what the player sees as their username.
Claude's additions, approved by the learner with the checkpoint: separate player-token columns from the admin token; completion row stores the finished browser game state as JSON; sign-in reuses the IP+username lockout; cookie SameSite=Lax; current password required to change username; deletion confirmation = password + typing the username; stats shown = game counts, points per game, per-category averages.

## Prompt browser, ratings, empty submissions (approved and implemented 2026-10-14)
Learner asked for: current ratings on admin screens, viewing prompts in the portal, submitting no guesses. Learner approved Claude's additions unchanged (all-admin read-only /admin/prompts with search/filter and collapsible answers; ratings under ids on Dailies and remove-prompt; live starting rating on add-prompt; empty submit confirmed with "Submit no answers"; prompt replies still required; share line "no answers").
Changed from the proposal: the share line shows "0", not "+0", matching how zero already displayed.
Also fixed a step-8 bug found while checking: /admin/dailies read new Date() during prerendering (logged an error); now calls io() first.
Verified: 127 tests, tsc, lint, build; HTTP against a scratch DB (all admin pages 200, ratings shown, empty check → 0 points, recording an all-empty Daily works, no server errors). Not clicked through in a browser by Claude.

## Implementation step 8: sets, Dailies, recording, game UI (approved and implemented 2026-10-14)
Approved with Claude's additions; learner added that Infinite games aren't saved in the browser but still count toward stats (they always did). Implemented:
- lib/sets.ts (ratedPrompts counts answers in SQL; drawSet: 3 random, then a uniformly random balancing pair via sort and binary search, at most 5 redraws, then SetError; setProblem; ranges 6.5–9.5 generated and 6–10 admin); lib/dates.ts.
- lib/dailies.ts (todaysDaily uses insert-or-ignore then re-read; addDaily on the earliest empty day with a retry on a race; changeDaily and removeDaily for future days only, supreme and right-hand; upcomingDailies; all logged).
- Migration 0005 (hand-fixed copy of daily_date): log actions daily_added, daily_changed, daily_removed plus a daily_date column.
- lib/play.ts (dailySet, infiniteSet with no answers sent; recordPlayed with sanity checks, accepting yesterday's Daily); lib/play-http.ts (SetError → 503).
- Routes /api/play/{daily,infinite,record}; /api/admin/dailies{,/change,/remove}; /admin/dailies page.
- lib/share.ts (score on the first line).
- UI: / (play as guest), /play, /play/daily, /play/infinite (app/play/game.tsx); the Daily is saved in localStorage after every check reply; recording happens from the "See results" click (not an effect), with a retry; Infinite has a leave confirmation plus beforeunload. The root title is now SIXTEEN; removed the template's page.module.css.
Test-data errors found (not code bugs): a 6-answer prompt has count score 2, not 4; the remove-prompt comments were fixed. 124 tests pass; tsc, lint and build clean; endpoints and pages checked over HTTP against a scratch DB (Daily stable, no answers sent, check, record, old date refused). UI not clicked through by Claude. Migrations 0003–0005 must be applied to Turso.
History of the decision:
Decision: Game UI + recording games + Dailies (Implementation checkpoint) — stage: awaiting implementation approval.
Learner-verified (2026-10-14): prompt removal works. Commit question asked twice, not answered: don't commit unless asked.
Already decided earlier: per prompt, up to 5 editable answers then Submit; prompts shown all at once; nothing revealed until every prompt is resolved; button becomes "Next prompt" / "See results"; prompt ids visible on the question screen; old Dailies may have a missing prompt; honor system for recording; guests count toward prompt and global stats only.
Learner's answers (2026-10-14):
1. After signing in or choosing guest mode, the player picks Daily or Infinite, then plays the whole game (with a back button). The end screen shows their result and a button to copy it to share.
2. A set is 5 random categories with 1 random prompt from each. Dailies are preset by prompt id; if a day has none, one is generated automatically and is that day's Daily for everyone.
3. A game is recorded at the end; the browser sends only what's needed to update the stats.
4. Guests only for now; accounts later.
Second-round answers (2026-10-14):
1. Sets: pick 3 random prompts, then 2 more chosen at random among the eligible prompts that balance the difficulty. A set's difficulty must always be 6.5–9.5.
2. Guests can technically replay the Daily.
3. The clipboard gets only results: mode, categories, correct/incorrect answers, points, difficulties, and the site address.
4. Any admin can add a Daily; it goes to the earliest date without one. Supreme and right-hand admins can override or remove a Daily; lower admins can't.
5. Leaving mid-game records nothing and loses progress, after a confirmation. Daily progress is saved in the browser the moment answers come back, so reloading can't be used to retry.
Third-round answers (2026-10-14):
1. Set difficulty = the average rating. If no balancing pair exists, redraw the first three; after more than 5 failures, return an error (treat the site as down until prompts are fixed).
2. Admin Dailies follow the same rules, but with a 6–10 range.
3. Every player, guests included, has Daily progress saved in the browser; reopening a finished Daily shows its results. (This deliberately changes the earlier "guests store nothing in the browser" decision.)
4. Share text approved, but make the final score more prominent.
Not answered (proposed in the checkpoint): override/remove only future dates; logging Daily changes.
Proposed by Claude (not yet confirmed): see the Implementation checkpoint in chat 2026-10-14: lib/sets.ts, GET /api/play/daily and /api/play/infinite (no answers sent), POST /api/play/record with sanity checks, lib/dailies.ts + /admin/dailies, log actions with a daily_date column (migration 0005), pages / → /play → /play/daily and /play/infinite, localStorage per Daily date saved after every check response, recorded once, share text with the score on the first line.

## Implementation step 7: prompt removal (approved and implemented 2026-10-14)
As approved, with Claude's additions. Migration 0004, edited by hand because drizzle-kit copied the new log columns from the old table: daily rebuilt without foreign keys to prompts; admin_log gains prompt_removed, prompt_id and replacement_id. Tested on existing data with foreign keys ON. lib/prompts.ts currentRating; lib/admin.ts canRemovePrompts, removePrompt (one batch: swap the replacement into future Dailies, delete, log, prune); POST /api/admin/prompts/remove; /admin/remove-prompt page, with links for supreme and right-hand admins only. tests/remove-prompt.test.ts has 9 tests. 100 tests pass; tsc, lint and build clean. Migrations 0003 and 0004 not yet applied to Turso (as far as Claude knows). Not browser-tested by Claude.
History of the decision:
Decision: Prompt removal (Implementation checkpoint) — APPROVED 2026-10-14 with additions; implementation in progress.
Learner-verified (2026-10-14): the guide reads well; changing a password works.
Learner's answers (2026-10-14): supreme and right-hand admins remove a prompt by its id. Ids are shown on the question screen so anyone can see them (game UI requirement for later). Deleting a prompt that is part of a Daily requires the admin to give a replacement prompt id. Removal deletes the prompt but keeps its stats for all users ("don't edit more than you need to"); "hide it from future sets". Removals are logged with the prompt's id.
Claude's reading: player and global stats are per-category totals, not per prompt, so a delete already leaves them untouched; only the prompt's own play_total/play_count go with it.
Second-round answers (2026-10-14):
1. A prompt in today's Daily (UTC) can't be removed, replacement or not. Future Dailies get the replacement. Past Dailies are left as they are, pointing at a removed prompt ("past dailies don't really matter enough").
2. A valid replacement exists, isn't the removed prompt, is in the same category, isn't already in that day's Daily, and has a difficulty within 1 point.
3. Log both ids, but only when a replacement is given.
Proposed by Claude (not yet confirmed): leaving past Dailies pointing at a deleted prompt requires dropping the daily → prompts foreign keys (migration 0004 rebuilds daily, which nothing references); "difficulty" = the current promptRating (live player data once there are 10+ playthroughs); a replacement may only be given when it's needed (400 otherwise); one replacement covers all future Dailies the prompt is in; new log action prompt_removed with prompt_id and replacement_id columns (no foreign key); a "Remove a prompt" panel on a new /admin/remove-prompt page for supreme and right-hand admins, with a confirm dialog; the dashboard shows that card only to them.

## Implementation step 6: answer lines v2, optional email, password resets, guide (approved and implemented 2026-10-14)
Implemented as approved, including Claude's proposed additions. Migration 0003: drizzle-kit output edited by hand (it created and then dropped admin_log_created_at); users.email made nullable in place with libSQL ALTER COLUMN, not a rebuild, so foreign-key cascades can't fire; admin_log rebuilt for the password_reset CHECK. Tested on a DB with existing data and foreign keys ON: all rows kept. Matching: Answer has optional prompts/ask/rejects; rejects use the checker's exact match on the assembled line; accept and prompt forms use the extra-words rule. Assignment: per guess, its top 5 candidates with quality tiers; brute force that maximises hits, then minimises the sum of quality tiers, then alphabetical rank, then entry order. Found during implementation: tie-breaking by entry order would have given "john adams" Samuel Adams after a vaguer earlier "adams", so quality tiers come first. Results: hit / ignored / miss; the prompt round returns {entry, ask?}. Passwords: resetPassword (supreme only, not self; clears the token; logged without the password), changeOwnPassword (needs the current password; 8+ characters); routes /api/admin/users/password and /api/admin/me/password; UI on roles (supreme) and dashboard. Token alert tells non-script users they can ignore it (TokenAlert now wraps SecretAlert). Public guide at /guide/prompts, linked from the dashboard, header, add-prompt and login pages; its example JSON was uploaded and judged in a check. 91 tests pass; tsc, lint and build clean; schema matches migrations. NOT applied to Turso yet (learner must run db:migrate). Not browser-tested by Claude.
History of the decision:
Decision: Answer formatting v2, optional email, password resets, guide (Implementation checkpoint) — stage: awaiting implementation approval. Separate: prompt removal (Build checkpoint, awaiting reasoning).
Learner's answers (2026-10-14):
- Word order: follow qbreader (any order). General principle: "if qbreader does it automatically, don't override it"; force less of our own code on existing solutions.
- Admins can add prompt and reject lines to an answer (e.g. "do not accept or prompt on John Quincy Adams"). Remove the extra-words override; that kind of wrong answer is the question writer's job.
- Emails: don't require or collect them; collect no information we don't need.
- Add a detailed guide page on adding prompts, linked from the admin page, with a short tl;dr checklist at the top.
Facts Claude tested: reject lines are exact-match only (after normalisation): "john quincy adam" (typo) and "the john quincy adams" still get past "do not accept or prompt on John Quincy Adams" on the John Adams line. Prompt lines and directed prompts work ("prompt on Bush by asking "which one?"" returns "which one?").
Second-round answers (2026-10-14):
1. Form: more lists next to aliases (things to prompt on, things to reject); the server assembles the answerline. Admins can optionally write a directed prompt instead of the generic "Prompt:".
2. Bring back "extra words inside the answer are rejected". If one guess is acceptable for two answers, accept only one: the alphabetically first, unless another of the player's guesses uses that answer, in which case move down the list; if no unused answer is left, reject the guess.
3. Emails are allowed (optional), labelled as used only for password resets. Only the supreme leader can reset other players' passwords.
4. The guide is public; only admins can add prompts.
Third-round answers (2026-10-14):
- Aside: the token alert should tell less technical admins they can ignore it if they only add prompts through the website.
1. If no unused answer remains, the guess is ignored, not rejected. Accept as many correct answers as possible: better to give undeserved points than take away deserved ones.
2. Tie-breakers (longest match, then exact over typo) come first; alphabetical only for a complete tie.
3. Accept beats prompt. The player always gets the benefit of the doubt.
4. Password reset: the app generates a temporary password, which stays the real password until the user changes it. Supreme leaders can reset anyone's password, admins included. Resets are logged, but never the password.
NEW: supreme leaders and right-hand admins can also remove prompts.
Proposed by Claude (not yet confirmed): Answer gains optional `prompts` (list) + `ask` (one optional directed prompt per answer) + `rejects` (list); the extra-words rule also applies to prompt forms; reject lines use the checker's exact match on the assembled line; assignment brute-forces each guess's top 5 candidates (maximise hits, then preference); two answers prompting → the alphabetically first answer's ask, or generic; migration 0003 makes email nullable and adds the password_reset log action; a reset also deletes that user's admin token; a supreme can't reset their own password (they use "change my password"); new "change my password" on the dashboard; the reset panel sits on the roles page for supremes; the guide is a public page at /guide/prompts, linked from the dashboard, header, add-prompt and login pages.
Prompt removal questions asked: how admins find a prompt to remove; prompts used in a Daily (foreign key); whether removal is logged; hard delete vs hide.

## Implementation step 5: answer matching (approved and implemented 2026-10-14)
Approved design and additions as recorded below. Implemented: qb-answer-checker pinned to 1.1.9; lib/answers.ts (judgeGuess, judgeEntries; STRICTNESS 7, MAX_ATTEMPTS 3, MAX_GUESS_LENGTH 100; each form is checked on its own as a fully underlined answerline; " or " and ";" are protected with no-break spaces; dashes count as word breaks; runs no longer than the form; ranking by longest match, then exact over typo; true ties prompt); lib/play.ts (checkPrompt, PlayError); POST /api/play/check (public, stateless). 82 tests pass plus 1 todo; tsc, lint and build clean; the endpoint was checked over HTTP against a scratch DB on a production build.
History of the decision:
Decision: Answer matching (Implementation checkpoint) — stage: awaiting implementation approval.
Learner's proposal (2026-10-14): accept exact answers plus typo tolerance; model it closely on qbreader's qb-answer-checker, reusing it instead of reinventing.
Facts Claude checked: npm qb-answer-checker 1.1.9, ISC license, 4 small dependencies, ESM, updated Feb 2026. checkAnswer(answerline, guess, strictness = 7) returns accept/prompt/reject. Typos allowed are about 1 per 7 letters, so short answers get none. Unformatted answerlines accept any word or substring ("river" for "Mississippi River", "mar" for "Mars"); formatted answerlines (<u>) require the underlined part. "john adams" was accepted for "John Quincy Adams".
Learner's answers (2026-10-14):
1. Build an answerline from canonical + aliases, smartly: an alias that is part of the canonical becomes the underlined required part (John <u>Quincy Adams</u>), not a separate [accept]. Strictness slightly less strict than 7, but never "Australia" for "Austria".
2. A guess that matches several answers, or isn't specific enough, gets a prompt (like qbreader). "john adams" with both Adamses on the list → John Adams; Quincy Adams needs more detail. If only JQA is on the list, "john adams" is rejected.
3. Prompts are free; up to 3 attempts at one answer (the guess plus 2 prompts).
4. Checked on the server. Per prompt the player types up to 5 answers, editable, then presses Submit; the server checks them all and the UI shows results, with the button becoming "Next prompt" or "See results". Answers stay hidden until submit.
Claude tested: John <u>Quincy Adams</u> accepts "quincy adams" and "jqa" and rejects "john adams" and "adams"; John <u>Adams</u> also accepts "john quincy adams"; several underlined parts are all required ("da vinci" rejected by <u>Leonardo</u> da <u>Vinci</u>). Strictness table: 6 accepts uranis/Uranus and zambia/Gambia; 5 also accepts parsi/Paris; 4 accepts australia/Austria and iraq/Iran.
Second-round answers (2026-10-14):
- Revised answerline: the canonical answer is fully underlined and every alias is an [accept]; no guessing where the underline goes. Each guess yields exactly one result. With both Adamses on the list, "john quincy adams" counts only as JQA; with only John Adams on it, "john quincy adams" is rejected. A bare "adams" is never enough for either.
- Prompts: the player sees every prompt at once and sees no answers until all prompts are resolved; at most 3 calls, which the learner thinks prevents spamming the server.
- A second guess matching an already-matched answer is ignored.
- Strictness stays at 7 (the default) and can be tuned later; near-name collisions are accepted as a risk, and editable answers make typos rarer.
Claude tested: fully underlined <u>John Adams</u> still ACCEPTS "john quincy adams" and <u>Mississippi River</u> accepts "mississippi river delta" (extra guess words are allowed), so "JQA rejected when only John Adams is listed" needs a rule beyond the checker.
Third-round answers (2026-10-14):
1. Extra words are allowed before or after an answer, but not between its words ("john quincy adams" is not John Adams; "mississippi river delta" is Mississippi River).
2. The 3-call limit isn't enforced; it just follows from at most 2 prompts per answer (honor system).
3. If the 3rd attempt still earns a prompt or a reject, it's a normal miss with negative points; it's accepted only if actually correct.
4. Prompts come after the (up to 5) entries are made and belong to the same entry, so they don't use extra entries.
5. No result is shown until every prompt is resolved.
Proposed by Claude (not yet confirmed): check each form (canonical, each alias) as its own fully underlined answerline instead of one line with [accept …], because "or" and ";" inside an alias get parsed as directives (tested: alias "Either or Or" accepted "either"); the same word order is required; when a guess matches several answers, the longest match wins and true ties prompt; duplicates are judged in entry order; POST /api/play/check is stateless, public to guests, and caps guess length; the final response includes all answers and the prompt score; pin qb-answer-checker 1.1.9; no game UI.

## Implementation step 4 (approved and implemented 2026-10-13)
Admin portal + login lockout, as recorded in project-map.md (step 4). Learner's design: lockout keyed per IP + account; log pruned on write; notifications derived from the log; removed-admin message; revoking other admins' tokens removed; JSON paste fills form rows. Approved additions: lockout key = typed username lower-cased; revoked vs never-admin via log; token shown on a post-login screen; failed rows stay after upload; server-component reads with forms posting to APIs; plain styling. 62 tests pass; tsc/lint/build clean; API and server-rendered pages checked with curl against a scratch DB. Browser interaction not tested by Claude (learner asked to test it themselves).
Bug found by learner (2026-10-13): sign-out showed the token alert again because cacheComponents keeps pages alive with React Activity. Fixed: sign-out does a full page load; shown tokens are cleared when their page is hidden (useForgetWhenHidden in app/admin/token-alert.tsx). Concept explained: Activity state preservation.
Learner-verified in a browser (2026-10-13): sign-in, sign-out after the fix, promoting none→lower. Not yet tried: add-prompt, log, notifications, removal, lockout.
Learner reasoning shown: spotted the stale token after sign-out and identified it as a security issue. Chose prune-on-write over cron and reasoned the log is "never too short"; chose per-IP+account lockout specifically to handle shared school networks.

## Implementation step 3 (approved and implemented 2026-10-12)
Done: migration 0001 (hand-written: admin_log, users.admin_role/token_hash/token_created_at, prompts rebuilt with created_by/created_at), lib/auth.ts (scrypt passwords, SHA-256 tokens), lib/admin.ts (canChangeRole, canRevokeToken, authenticate, login, regenerateOwnToken, revokeToken, changeRole, addPrompts), lib/admin-http.ts, routes /api/admin/{login,logout,prompts,admins/role,admins/token}, scripts/create-user.mts (npm run create-user; .mts so top-level await runs as ESM; min 8-char password), tests/test-db.ts helper, tests/admin.test.ts. 52 tests pass; tsc/lint/build clean. Not applied to Turso yet.
Details Claude chose within scope: admins addressed by username in role/token routes; regenerating another admin's token = revoke (never reveals their token); 200 if any added / 422 if none; cookie is a browser-session cookie (no max age); same error for every login failure.

## Implementation step 2 (approved and implemented 2026-10-12)
Done: lib/categories.ts (digits 0–9 mapped in old category order), lib/schema.ts (6 tables + CHECKs), drizzle.config.ts, drizzle/0000 migration (generated, not applied), lib/prompts.ts (countScore, validatePrompt, generatePromptId), lib/games.ts (recordGame), lib/db.ts now passes schema; scripts db:generate/db:migrate. 30 tests pass; tsc/lint/build clean.
Deviation from approved proposal: recordGame uses one atomic db.batch instead of an interactive transaction (concurrent transactions hit SQLITE_BUSY in tests; batch is one round trip). Prompt/user existence pre-checked with a read before the batch. User UUID generation not implemented (no user creation yet).

## Implementation step 1 (approved and implemented 2026-10-11)
Scope: Next.js (TS, App Router) scaffold at repo root; Drizzle + @libsql/client with server-only db client, no schema; scoring fn 2^(k-1)-2^(m-1) with 5-entry cap; rating fn per confirmed formula taking countScore as input; Vitest tests; env names in .env.example. Excludes schema, API routes, UI, matching, bucket table, set selection, daily keying.
Done: lib/scoring.ts, lib/rating.ts, lib/db.ts, tests/*.test.ts (11 pass), tsc/lint/build clean. Deviation: @types/node bumped ^20→^24 for Vitest peer requirement.

## Prompt management
Confirmed (Design checkpoint, 2026-10-11): platform + rating design as summarized, including Claude's proposed addition that answer-count buckets output expected points (0–16).

Learner proposed (2026-10-06):
- Auto difficulty rating per prompt = 40% from number of accepted answers + 60% from a "question difficulty" score assigned when the prompt is added.
- Daily/infinite sets of 5 should have similar difficulty around a target number, balancing hard prompts with easier ones.
- Reject prompts whose true answer set is too large to list completely (e.g. "name graphic novels"); prefer narrowly scoped prompts.

Learner refinement (2026-10-07):
- Question-difficulty score: author sets 0–16 initially; after 10 iterations, replaced by the average of player scores on that prompt, updated every occurrence.
- Answer-count component: bucketed by ranges (e.g. 5–10 answers → 10).
- Set policy: balanced average (hard prompts offset by easy ones), not narrow spread.
- Scope assumption: all prompts added are correct; correctness/closedness/sense is the author's responsibility, not checked by the system.

Learner decisions (2026-10-07):
- Storage: a free, relational (table-based) database such as Supabase or Turso, not document-based; reason given: future leaderboard and per-user stats (out of scope for now).
- Switch to player average once 10 playthroughs of a prompt complete.
- Difficulty scale is expected points per prompt: 16 = easy (everyone gets all five), 0 = hard; balanced set ≈ mean around the middle.
- Database: Turso, with Drizzle ORM (2026-10-11).
- Submission trust: no validation; honor system. Learner initially believed a score couldn't be faked higher; Claude explained a submission can carry any score (higher or lower) and that bad data would skew ratings for all players. Learner's honor-system choice stands as an accepted risk.
- Rating (clarified 2026-10-11): before 10 playthroughs = 0.4 × answer-count score + 0.6 × author score. After = 0.25 × that pre-switch rating + 0.75 × live player average (= 0.10 count + 0.15 author + 0.75 player).
- Platform: Next.js on Vercel for front end and server routes; reason given: more organized and readable for future maintainers who weren't part of the build.

Introduced (Claude explained): the three old problems are distinct failures (no difficulty field, answer pool size varied, no closed-set check, no editorial check); a missing valid answer gets scored as a miss.

Demonstrated understanding:
- Connected answer-pool size to difficulty, and named a closed answer set as a rule for valid prompts.
- Chose a 0–16 scale matching the per-prompt max score, and proposed correcting author estimates with real player results.

Needs reinforcement:
- Client-submitted data is untrusted (believed scores couldn't be inflated).
- Direction/shape of the count→difficulty mapping; subjectivity of the author-set score; spread vs. mean tradeoff; closedness needs an unambiguous membership criterion, not just a small size; the "didn't make sense" problem has no check yet.

## Scoring / miss penalty
Learner decided (2026-10-11): misses total like hits (score = 2^(k-1) − 2^(m-1)); a prompt's score may go below 0. Confirmed the totals-mirror reading and the 5-entry shared cap after step 1 was implemented.
Introduced (Claude explained): mirror rule makes marginal gain/cost symmetric; changes old 3-right-2-wrong = 0 to +2; without the old 5-entry cap, scores are unbounded below and one playthrough could wreck a prompt's average under the honor system.

## Data model
Learner proposed (2026-10-11):
- users: userId, username, email, password.
- prompts: promptId, prompt text, note, category, author difficulty, acceptable answers, current player average, playthrough count.
- A playthrough only updates the prompt's average and increments its count (no per-playthrough row).
- daily: date + 5 promptIds.
- Answer-count score buckets: 5–7 → 2, 8–10 → 4, 11–15 → 8, 15–20 → 12, 21–25 → 16. Max 25 objectively correct answers per prompt.
- Prompt note rule: never contains an accepted answer; may clarify grey areas / what is excluded.
Introduced (Claude explained): repo vs DB vs hybrid prompt storage tradeoffs; password hashing; lost-update race on read-modify-write; losing per-play records blocks future stats and cleanup of fake data.
Learner decided (2026-10-11, round 2):
- Prompts live in the DB (option B). Reason given: hybrid makes managing prompts across local/Turso difficult; easy to update prompt data (e.g. averages) from the website. (Claude noted averages live in the DB under every option.)
- Passwords hashed. Guests can play; no data saved for guests.
- Prompts must have 5–25 answers. Buckets corrected: 5–7→2, 8–10→4, 11–15→8, 16–20→12, 21–25→16.
- Daily prompts roll over at midnight UTC.
- Per-user stats wanted: points-per-prompt by category vs global averages, points-per-game vs global average, a ranking system, total games played, daily vs infinite counts. Leaderboard still out of scope.
- Still unanswered: per-playthrough records and lost-update safety (#2).
Learner decided (2026-10-11, round 3):
- Per-user stats stored as counters on the users table (no per-playthrough rows; accepted tradeoff after Claude explained lost per-play history).
- Daily vs infinite games-played counters per user.
- Rankings out of scope for now.
- A global table holds current average + games played per category.
- Prompts added by inserting rows; proposed a separate table per category.
- Not yet answered: atomic update / lost-update race; where authoring rules are enforced; guest averages; round vs game.
Introduced (Claude explained): category as a column vs table-per-category; atomic single-statement increments.
Learner decided (2026-10-12, round 4):
- Prompt validity: 5–25 correct answers; invalid prompts are rejected (enforcement location not stated).
- Keep per-user per-category stats and global stats as total points + game count (averages computed only when needed, e.g. frontend).
- No individual game history stored anywhere.
- Guest plays count toward global/prompt averages; guests have no saved data, not even in the browser.
- Prompt id: 8 chars = 1 digit for category + 7 alphanumeric [A-Za-z0-9]; unique across categories. Learner believes suffixes may repeat across categories.
- Chose total + count counters (shows understanding that totals can be incremented and averages derived).
Demonstrated understanding: storing total+count instead of average.
Needs reinforcement: where validation is enforced (described what, not where).
Learner decided (2026-10-12, round 5):
- One prompts table with a category column; id scheme unchanged (digit + 7 alphanumerics).
- Prompts validated in code right after they're submitted, before insert (specific insert path not yet chosen).
- Per-user per-category stats in their own table, one row per user per category.

## Prompt insert path / admin
Learner proposed (2026-10-12): admin page at /admin behind an admin login (username + password); prompts can also be uploaded via an authenticated API endpoint; the admin UI calls that same endpoint, so validation lives in one place.
Demonstrated understanding: routing UI and scripted uploads through one endpoint so validation can't be bypassed by either path.
Introduced (Claude explained): session cookies vs bearer tokens for browser vs script callers; brute-force risk on a public login.
Learner decided (2026-10-12, round 2):
- Admin login at /admin required; browser admin portal sends credentials to the endpoints (credential type unspecified).
- Admin identity lives on users table via an "isAdmin" column with levels: supreme leader (exactly one, full access incl. all admins), right-hand (multiple; can add/remove lower-level admins only), lower-level (everything except managing admins).
- Two endpoints: single-add (one prompt) and multi-add (list of ≥2). Multi-add is partial-success: invalid prompts rejected, valid ones still added. Admin UI picks the endpoint automatically.
- Not yet answered: session vs token, script credentials, revocation, shared player auth, brute force.
Learner decided (2026-10-12, round 3):
- Column renamed adminRole (levels: none / lower / right-hand / supreme).
- First supreme leader inserted manually via Turso website by learner. DB does not enforce a single supreme. Nobody can be promoted to supreme through the app.
- Only the supreme leader can promote admins. You can only demote admins below your own level (right-hand cannot demote self or other right-hands).
- Prompt additions are logged; the log includes prompt ids only if fewer than 20 prompts were added.
- Single endpoint taking a list (length ≥1); server generates prompt ids.
Learner decided (2026-10-12, round 4):
- Permissions: supreme can add/remove/promote/demote any non-supreme admin; right-hand can add/remove lower admins; lower admins can't manage admins. Supreme rows are edited only in Turso. Demote = move down a level or remove.
- First supreme: create an account in the app, then set adminRole in Turso.
- prompts gets created_by (admin) and created_at columns.
- Admin log: per upload, which admin and how many prompts were added (no ids); records failed prompts and role changes. Supreme changes happen in Turso so aren't logged.
- Upload response: valid prompts are added; invalid ones are returned as errors at the end, with a message clearly stating the valid ones were added and should not be re-uploaded. No duplicate check.
- Auth: each admin has their own token; the endpoint requires it; the admin portal always sends it. (Login → token handoff not yet specified.)
Learner decided (2026-10-12, round 5):
- One token per admin at a time; regenerable; invalid once the admin is removed. Browser holds it in an httpOnly cookie.
- Revoking/regenerating another admin's token follows the same rules as managing their privileges.
- Log entry for failures only says the admin tried to upload a failed prompt (no prompt content).
Demonstrated understanding: chose httpOnly cookie to keep token away from page scripts; tied token validity to admin status.
Learner decided (2026-10-12, round 6):
- Option (b): each portal login regenerates the admin's token (effectively a session); old token stops working. Admin page shows an alert that the token was regenerated; keeping scripts easy to update is the admin's responsibility.
- Cookie marked SameSite=Strict (accepted Claude's CSRF suggestion).
Demonstrated understanding: chose regeneration knowingly, accepting script breakage over storing retrievable tokens.
