# Options Strategy Trainer: Project Summary

## What it is
An interactive, browser-based practice tool that helps interns reinforce options-strategy concepts they've learned from a textbook (not a from-scratch teaching app). Built for Puma Capital interns. It drills recognition and mental math across 34 options strategies.

## Links & hosting
- **Live:** https://miperlmutter.github.io/options-strategy-trainer/
- **Repo:** github.com/miperlmutter/options-strategy-trainer (public; GitHub Pages, `main` branch, root)
- **Local folder:** InternTasks/OptionsStrategyTrainer/

## Tech stack
- Vanilla HTML/CSS/JS — no framework, no build step. The core app needs no backend and runs from `file://` or any static host; an optional Supabase backend powers the leaderboard (and degrades gracefully when unreachable).
- Dark "trading-desk" theme; SVG payoff diagrams; scores/streaks/best-times persisted in localStorage.
- Modes self-register with the app shell; nav order = script load order in index.html.

## Content
- 34 strategies (js/strategies.js): singles, vertical spreads, volatility, advanced/synthetic, and time-based (calendar/diagonal/double + put variants). Defined by generalized legs around a $100 notional spot on a $5 grid.
- Premium model: deterministic, whole-dollar — time value is $5 (near) / $8 (far) at-the-money, dropping $1 per $5 of moneyness (floored at $1), plus intrinsic when ITM. Not Black-Scholes. Greeks are conceptual signs only.

## Modes (top nav: Home · Flashcards · Match · Memory · Drills · Leaderboard · Build-a-payoff · Sandbox · Test)
- **Flashcards** — name ⇄ graph/outlook/legs/Greeks/"why"; the reference surface.
- **Match** — drag-to-pair tiles across any two facets; timer, streak, pause/reset. Score includes a speed bonus (par 5s/pair, +2/sec under par).
- **Memory** — concentration grid; pause/reset.
- **Drills** (practice hub) — 7 timed games:
  - Box Pricing, Option Value, Moneyness Flash, Break-even — mental-math (the last three are 90-second sprints with Pause/Resume; Moneyness has a reduced +1 streak bonus).
  - Greeks: Identify, Greeks: Predict P&L, Outlook → Strategy — "answer until 10 correct" quizzes (no clock).
- **Leaderboard** — shared, cross-player boards (see Recent updates).
- **Build-a-payoff** — reproduce a target payoff by picking legs, or name it.
- **Sandbox** — live payoff calculator with real-dollar inputs + strategy recognition.
- **Test** — mixed exam spanning every mode (recognition, outlook, Greeks, moneyness, intrinsic value, break-evens); multiple choice / type-the-answer / calculate-the-value / select-all; Back/Next navigation, graded at the end with explanations.

## Architecture notes
- js/payoff.js (payoff engine + SVG renderer: relative, absolute, near-expiry), js/app.js (shell/router/home), js/storage.js, js/modes/*.js.
- js/config.js + js/leaderboard.js (Supabase client, fetch-based) + js/modes/leaderboard.js (the tab); supabase/schema.sql (DB schema).
- Greeks & Outlook are not top-level tabs — they publish question factories to a shared DrillBank, consumed by the Drills quizzes and the Test mode (single source of question math).
- Scoring: 10 + (streak−1)×bonus per correct (bonus +2 normally, +1 for Moneyness). Box Pricing, Break-even, and Option Value use a flat +10 (no streak multiplier); Option Value adds an end-of-round accuracy bonus.
- Home has a collapsible "Filter strategies" panel (difficulty tier + category) and a "Reset all progress" button.
- gallery.html = an all-strategies "Strategy Reference" study sheet.

## Deploy / maintenance
- Commit → `git push origin main` → deploys via a GitHub Actions workflow (`.github/workflows/deploy-pages.yml`; not the legacy Jekyll builder). A `.nojekyll` file is present. Verify the live version by curling `index.html` for the `?v=N` string.
- Asset URLs carry a `?v=N` cache-bust query — bump N every deploy (currently `?v=34`) or the CDN serves stale JS/CSS.
- `gh` here is the portable binary at `%LOCALAPPDATA%\gh-portable\bin\gh.exe`.

**Current state:** Feature-complete and live; all modes built, verified, and deployed. Positioned as a practice/reinforcement tool — no guided "Learn"/curriculum mode by design.

---

## Recent updates (July 2026)

### Live leaderboard (new — the app now has a backend)
- New **Leaderboard** tab (nav position: right after Drills). Backed by **Supabase** (Postgres). The core app is still backendless and degrades gracefully — if Supabase is unreachable, every game still plays and scores locally exactly as before; only the leaderboard shows "unavailable."
- **One combined board per game**, for **9 games** (the 7 Drills + Match + Memory; Test excluded). Columns: **Rank / Player / Score / Acc / Acc%**. Clickable **Score** and **Acc** headers sort (Acc% is Acc's readout, not a separate sort); 🥇🥈🥉 on the top 3; shows top 10 plus a pinned "Your best" row when you're outside it.
- Each player keeps **two bests per game**: their **top-points run** and their **top-100%-accuracy run**, deduped to one row when they're the same run.
- **Auto-post**: finishing a game saves automatically — asks for a nickname once, then silent thereafter; a "Try again" button appears on a transient network/rate-limit failure.
- **Identity**: remembered nickname, no login. Names are unique, claimed per-browser via a random token in localStorage. A "**Posting as `<name>` · Change name**" line sits at the top of the tab (rename via the `rename_player` RPC).
- **Security model**: client talks to Supabase with plain `fetch` (no SDK, no CDN). All writes go through `SECURITY DEFINER` RPCs (`submit_score`, `rename_player`); RLS makes the table read-only to clients (no direct insert/update/delete). Anti-abuse = range checks + rate limiting in the RPC (a determined spoof is still possible → clean up via dashboard). **Admin removals are done only in the Supabase dashboard** — no admin code or secret ships in the site. Public URL + anon key live in `js/config.js` (public by design; the `service_role` key never leaves Supabase). Schema in `supabase/schema.sql`.

### Scoring & mode changes
- **Flat scoring (no streak multiplier)** on **Box Pricing, Break-even, and Option Value** (+10 per correct). Option Value adds a small end-of-round **accuracy bonus** (up to +20%, scaled by hit rate), so 15/15 edges out 15/16. Moneyness keeps the reduced +1/streak; the other Greeks/Outlook quizzes keep +2/streak.
- **Greeks: Predict P&L** and **Outlook → Strategy** changed from timed 10-question races to **"answer until 10 correct"** (same format as Greeks: Identify).

### Infra / deploy
- Deploys now run through a **GitHub Actions workflow** (`.github/workflows/deploy-pages.yml`), not the legacy Jekyll builder (which hit a failure streak). Pushing to `main` auto-deploys; a `.nojekyll` file is present. Verify the live version by curling `index.html` for the `?v=N` string.
- Cache-bust is now at **`?v=34`**.
- GitHub account renamed **`mperlmutter12` → `miperlmutter`**; the old `mperlmutter12.github.io` URL is dead (no redirect).
