# Spec: Live Leaderboard for Options Strategy Trainer

## Goal
Add a shared, cross-player leaderboard so every intern who plays can see each other's scores, with each game ranked by both a "Perfect" (flawless-run) board and an "Overall" (best-score) board. Admin management of boards is done entirely from the Supabase dashboard (no admin code in the public site).

## Decisions locked (interview 2026-07-02)
- **Backend:** Supabase (managed Postgres + auto REST/RPC). Free tier.
- **Identity:** Remembered nickname, no login. Unique nicknames enforced via a browser-held claim token.
- **Board scope:** Per-game boards, two categories each — **Perfect** (100% accuracy runs) and **Overall** (best score any accuracy).
- **Games with boards (9):** Box Pricing, Option Value, Moneyness Flash, Break-even, Greeks: Identify, Greeks: Predict P&L, Outlook → Strategy, Match, Memory. (Test excluded.)
- **Liveness:** Fetch on tab open + manual Refresh button. No websockets/polling.
- **Time window:** All-time only. Resetting a board = an admin action in Supabase.
- **Posting:** Opt-in. Results screen shows the score + a "Post to leaderboard" button.
- **Admin:** All removals/clears done in the Supabase dashboard (table editor or SQL). No admin UI, no secret in the site.
- **Anti-abuse:** Light guardrails — writes go through one vetted DB function; range checks; length limits; rate limiting; no client update/delete.
- **Name clash:** Enforce unique nicknames (claim model).
- **Placement:** New top-nav "Leaderboard" tab, inserted right after Drills.
- **Board size:** Top 10, plus a pinned "your rank" row if the current player is outside the top 10.
- **Row content:** rank, nickname, score, accuracy detail (e.g. `21/21`), date, 🥇🥈🥉 medals on top 3.
- **Nickname rules:** length limit only (2–16 chars, letters/numbers/spaces/`_`/`-`). No profanity filter; clean up via dashboard.

## Behavior

### Posting a score (opt-in)
1. Player finishes a game. Results screen renders as today, plus a **Post to leaderboard** button.
2. First time posting from this browser: prompt for a nickname (2–16 chars). The nickname is **claimed** — bound to a random `owner_token` (UUIDv4) generated once and stored in `localStorage`. On later posts the saved nickname + token are reused (no re-prompt).
3. If the chosen nickname is already claimed by a different token, submission is rejected with "That name's taken — pick another," and the player picks a new one.
4. On submit, the app calls the `submit_score` RPC with `{ game, nickname, token, score, correct, attempted }`. The function:
   - validates ranges and name rules,
   - verifies the nickname belongs to this token (claims it if unclaimed; rejects on mismatch),
   - computes `perfect = (attempted > 0 && correct === attempted)`,
   - **upserts the Overall row** for `(game, owner_token)` keeping the max score,
   - if the run is perfect, also **upserts the Perfect row** for `(game, owner_token)` keeping the max perfect score.
5. UI confirms "Posted!" and offers to jump to the Leaderboard tab for that game.

A single finished run can update **both** boards (e.g. a 15/15 updates Overall and Perfect; a 23/25 updates only Overall). This is the "keep both" behavior the user asked for.

### Viewing leaderboards
- New **Leaderboard** top-nav tab. Page has: a **game picker** (9 games) and a **Perfect / Overall** toggle.
- On open (and on Refresh press) it fetches the top 10 rows for the selected `(game, category)`, ordered by score desc, tie-break accuracy desc then earliest `created_at`.
- Each row: rank (medals for 1–3), nickname, score, accuracy detail (`correct/attempted`), date.
- If the current player (by token) has a row outside the top 10, show their rank in a pinned row beneath the table. Highlight the current player's row wherever it appears.
- Empty board → friendly "No scores yet — be the first."
- Fetch failure / offline → non-blocking message: "Leaderboard unavailable right now." The rest of the app is unaffected (leaderboard is purely additive).

## Technical Scope

### New files
- `js/leaderboard.js` — Supabase client wrapper + submit/fetch helpers + nickname/token management (`global.Leaderboard`). Loaded before mode scripts in `index.html`.
- `js/modes/leaderboard.js` — the Leaderboard tab (registerMode), game picker + Perfect/Overall toggle + table render.
- `supabase/schema.sql` — table, constraints, RLS policies, and the `submit_score` function (kept in-repo for reproducibility; contains no secrets).

### Touched files
- `index.html` — add Supabase JS (self-hosted/vendored, see Constraints), `js/leaderboard.js`, and `js/modes/leaderboard.js` in load order so the tab lands right after Drills. Bump `?v=N`.
- `js/modes/drills.js` — on each game's results screen, add the **Post to leaderboard** button wired to `Leaderboard.postScore(game, {score, correct, attempted})`. Drills already track `correct`/`attempted` (sprints and until-10 quizzes) and `score`.
- `js/modes/match.js`, `js/modes/memory.js` — surface a `correct`/`attempted` (or mistakes → derived) metric at finish so Perfect classification + accuracy detail work; add the Post button. **Build note:** confirm what each currently tracks; add a mistakes/attempts counter if missing.
- `js/app.js` — no core change expected; nav order is script-load order.
- `README.md` — document the leaderboard + Supabase dependency + the "reset a board = dashboard action" note.
- Config: a small `js/config.js` (or top of `leaderboard.js`) holding the **public** Supabase URL + anon key. These are public by design; do not commit the service_role key.

### Patterns to follow
- Vanilla global-namespace IIFE modules `(function(global){ ... })(window)`, same as existing files. No ES modules, no build step (`file://`-compatible).
- `App.registerMode({ id, label, minStrategies:0, blurb, init })` for the new tab; `App.h(...)` DOM helper.
- `Store` (localStorage) stays the source for personal stats; the leaderboard is a separate, additive concern. Nickname + token live in localStorage under new keys (e.g. `ost:nickname`, `ost:token`).
- Cache-bust `?v=N` on all asset URLs; deploy via the GitHub Actions Pages workflow.

## Data

### Supabase table `scores`
| column | type | notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `game` | text not null | enum-checked against the 9 game ids |
| `category` | text not null | `'overall'` or `'perfect'` |
| `nickname` | text not null | 2–16 chars, charset-checked |
| `owner_token` | uuid not null | client-held identity |
| `score` | int not null | range-checked per game |
| `correct` | int not null | ≥ 0 |
| `attempted` | int not null | ≥ correct |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

- **Unique:** `(game, category, owner_token)` — one row per player per board (upsert keeps max score).
- **Name claim:** enforce that a given `nickname` maps to exactly one `owner_token`. Implemented inside `submit_score` (reject on mismatch); optionally a `players(nickname unique, owner_token)` table for a clean claim ledger.

### Access model (light guardrails)
- **RLS on `scores`:** `SELECT` allowed to anon (read boards). No direct `INSERT/UPDATE/DELETE` for anon.
- **All writes go through `submit_score`** — a `SECURITY DEFINER` Postgres function the anon role may `EXECUTE`. It validates and upserts. This means the client cannot write arbitrary rows even though the anon key is public.
- **Validation in the function:** score within `[0, max_for_game]`; `attempted ≥ correct ≥ 0`; nickname length/charset; basic rate limit (e.g. reject > N submissions/minute per token or IP via a timestamp check).
- **Admin:** service_role via the Supabase dashboard can delete any rows — clear one game (`delete where game=...`), delete a single row, or `truncate scores`. This is the "remove a leaderboard" capability. No app code involved.

### Inputs / outputs
- Input to backend: `submit_score(game, nickname, token, score, correct, attempted)`.
- Output to app: array of top rows `{ rank, nickname, score, correct, attempted, created_at, isMe }` per `(game, category)`.

## Edge Cases
- **Name taken by another token** → reject, prompt for a new nickname; don't lose the score attempt (let them retry).
- **Player clears localStorage** → loses token; their old nickname is now unclaimable by them and could be re-claimed by someone else. Accepted tradeoff for a no-login tool; document it.
- **Same player, better run** → upsert keeps the max; a worse run never lowers a standing best.
- **Perfect but low volume** (e.g. 3/3) → appears on Perfect ranked by score; naturally sits below higher flawless runs. Correct behavior.
- **Non-perfect run** → updates Overall only; never appears on Perfect.
- **Supabase down / offline** → posting shows "Couldn't post, try again"; viewing shows "unavailable"; core app unaffected.
- **Impossible score** (spoof attempt) → rejected by range check in `submit_score`. Plausible-but-fake scores can still get through (documented limit); remove via dashboard.
- **Match/Memory with no natural accuracy** → define Perfect = zero incorrect attempts; if the game can't produce a mistakes count, add one before wiring the Post button.
- **Duplicate rapid submits** (double-click) → function is idempotent via upsert; also disable the button after first click.

## Constraints
- No backend server to run and no build step — Supabase is the only new dependency. Keep the app `file://`-openable except for the network calls (which simply fail gracefully offline).
- **Supabase JS client must be vendored/self-hosted**, not loaded from a CDN — the site may later move behind a strict CSP / private host, and the earlier design bans external CDN dependencies. Pin a specific version file in the repo.
- Never commit the `service_role` key. Only the public URL + anon key appear in client code.
- Match the existing dark trading-desk theme, monospace numbers, mobile-friendly layout.
- Leaderboard is strictly **additive** — it must not change or block any existing game/scoring behavior. If Supabase is unreachable, the app behaves exactly as it does today.

## Security
- **Public anon key + RLS:** the anon key is shipped in client JS by design; protection comes from RLS + the `SECURITY DEFINER` `submit_score` function being the only write path. Verify anon has `EXECUTE` on the function and **no** direct table write grants.
- **Spoofing:** a determined user can still submit a plausible fake score (no server-side game verification). Accepted per "light guardrails." Mitigations: range checks, rate limiting, one-row-per-token upsert, dashboard cleanup. If this becomes a problem, escalate to the Edge Function + start-token validation path (out of scope for v1).
- **PII:** nicknames only — instruct users (and note in UI copy) not to enter real names or personal info. No emails, no accounts, no PII stored. Keeps the tool clear of Reg S-P / 17a-4 concerns.
- **Injection/XSS:** render nicknames as text (never innerHTML); enforce charset server-side too. Scores/counts are integers.
- **Abuse cleanup:** offensive nickname or bogus row → delete via Supabase dashboard (documented one-liner in `README.md`).
- **This spec ships in the public repo** — it intentionally contains no secrets.

## Success Criteria
- A new **Leaderboard** tab appears after Drills; game picker + Perfect/Overall toggle work.
- Finishing any of the 9 games shows a **Post to leaderboard** button; posting from two different browsers with different nicknames produces two distinct rows visible to both.
- A 100% run lands on both Perfect and Overall; a non-100% run lands on Overall only; beating a prior best updates in place (no duplicate rows).
- Enforced unique nicknames: a second browser can't claim a name already held by another token.
- Top 10 renders with medals, accuracy detail, and date; the current player's row is highlighted, and their rank shows pinned below when outside the top 10.
- Deleting a game's rows in the Supabase dashboard empties that board on next refresh; `truncate` clears all boards.
- With Supabase unreachable, every existing game still plays and scores exactly as before; leaderboard shows a graceful "unavailable" message.
- Impossible scores are rejected by the backend; clients cannot insert/update/delete rows directly (verified by attempting a raw insert with the anon key and getting denied).