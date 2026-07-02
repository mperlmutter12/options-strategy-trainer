# Options Strategy Trainer

A shareable, browser-based learning game that teaches options strategies by the
relationship between their **legs**, their **payoff graph**, their **market outlook**,
and their **net Greek profile**.

Vanilla HTML / CSS / JavaScript — **no framework, no build step, no backend**. Opens
straight from a local file *or* any static host.

**Live:** https://miperlmutter.github.io/options-strategy-trainer/

## Run it locally
Open **`index.html`** in any modern browser. That's it.

## Modes (top nav)
- **Flashcards** — flip cards (name ⇄ graph + outlook + legs + Greeks + the "why"); start from either side. The reference surface.
- **Match** — drag-to-pair tiles across any two facets (graph / name / legs / outlook); timer, streak, pause & reset.
- **Memory** — concentration grid: flip face-down tiles to find matching pairs.
- **Drills** — timed practice games (see below).
- **Build-a-payoff** — reproduce a target payoff by picking legs, or name the strategy.
- **Sandbox** — live-graphing calculator with real-dollar strikes / premiums and strategy recognition.
- **Test** — a mixed exam spanning every mode: multiple choice, type-the-answer, calculate-the-value, and select-all, with Back / Next navigation; graded with explanations at the end.

### Drills (the practice hub)
- **Box Pricing**, **Option Value**, **Moneyness Flash**, **Break-even** — mental-math games. Option Value / Moneyness / Break-even are 90-second sprints with Pause/Resume.
- **Greeks: Identify**, **Greeks: Predict P&L**, **Outlook → Strategy** — timed 10-question quizzes (race the clock; best completion time is saved).

> Greeks and Outlook are not top-level tabs — they publish their question factories
> on a shared `DrillBank` and run inside Drills (the Test mode also pulls from it).

Also: **`gallery.html`** renders every strategy's payoff at once — a reference sheet linked from the Home screen.

## Strategy library
**34 strategies** across singles, vertical spreads, volatility, advanced / synthetic,
and time-based (calendar / diagonal / double calendar + put variants) categories,
defined in **`js/strategies.js`** (human-readable — edit / spot-check freely). Strikes
are generalized around a $100 notional spot on a $5 grid.

> **Premiums:** a deterministic, **whole-dollar** teaching model — time value is $5 (near)
> / $8 (far) at the money, dropping $1 per $5 the strike sits from spot (floored at $1),
> plus intrinsic when in the money. *Not* Black-Scholes. Greeks are conceptual signs only.
>
> **Time-based strategies** use a near-expiry approximation (far legs keep residual time
> value), so their P/L is shown at the near-dated expiry.

## Project layout
```
index.html          # app shell + mode nav
gallery.html        # all-strategies reference sheet
css/styles.css      # dark trading-desk theme
js/payoff.js        # payoff engine + SVG renderer (relative, absolute, near-expiry)
js/strategies.js    # the strategy library
js/greeks.js        # conceptual Greek labels / meanings
js/storage.js       # localStorage scores / streaks / best times
js/app.js           # session scoping, home screen, router
js/modes/*.js       # one file per mode (greeks.js & outlook.js publish to DrillBank)
```

## Deploy
Hosted on GitHub Pages (`main` branch, repo root) — push to `main` and Pages rebuilds in ~1 min.
Asset URLs in `index.html` / `gallery.html` carry a `?v=N` cache-bust query; **bump `N` on every deploy** or the CDN may serve stale JS / CSS.
