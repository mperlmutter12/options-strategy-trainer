/* ============================================================
 * modes/drills.js — "Drills" tab: mental-math calculation games
 * (chooser page; room to add more drills later)
 *   1) Box Pricing — given a box's four legs + prices, compute the
 *      net cost, the value at expiration, or the locked-in profit.
 *      Clean integers, type-the-number, timer + streak.
 *   2) Option Value — a single call/put + strike + stock price.
 *      Compute its intrinsic value at expiration, or (70% of the
 *      time) your P/L if you bought it for a premium. 90-second
 *      sprint: answer as many as you can. Wide-ranging awkward
 *      dollar amounts with .25/.50 cents, mixed ITM/OTM.
 *   3) Moneyness Flash — flash an option (type, strike, stock),
 *      tap ITM / ATM / OTM (or press 1/2/3) against a 90s clock.
 *   4) Break-even — legs + per-leg premiums; type the break-even
 *      price (singles + verticals, one BE each). 90s sprint.
 *
 * Games 2–4 share runSprint() — the 90-second timer + pause + HUD +
 * scoring shell — and supply their own makeQ()/render().
 * ============================================================ */
(function (global) {
  'use strict';

  function ri(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  // Decimal-aware money: integers render with no decimals (box game), so this
  // is backward-compatible; fractional values (option-value game) show cents.
  function money(n) { var a = Math.abs(n); return (n < 0 ? '−$' : '$') + (Number.isInteger(a) ? String(a) : a.toFixed(2)); }
  function px(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }
  function round2(n) { return Math.round(n * 100) / 100; }

  function init(view, ctx) {
    var h = ctx.h;
    function menu() {
      view.innerHTML = '';
      view.appendChild(h('h1', { text: 'Drills' }));
      view.appendChild(h('p', { class: 'sub', text: 'Timed practice games to build speed and instinct — beat the clock and your own best score.' }));
      var grid = h('div', { class: 'grid' });
      grid.appendChild(card(h, 'Box Pricing',
        'Given a box spread\'s four legs and their prices, work out the net cost, what it\'s worth at expiration, or the locked-in profit.',
        ctx.Store.get('box-pricing'), function () { runBox(view, ctx, menu); }));
      grid.appendChild(card(h, 'Option Value',
        '90-second sprint. One call or put with a strike and the stock price: compute what it\'s worth at expiration — or, if you bought it for a premium, your profit/loss. Answer as many as you can. Awkward dollars, cents in play.',
        ctx.Store.get('option-value'), function () { runOption(view, ctx, menu); }));
      grid.appendChild(card(h, 'Moneyness Flash',
        '90-second sprint. An option flashes up — call or put, a strike, the stock price. Tap ITM / ATM / OTM (or press 1 / 2 / 3) as fast as you can. Pure recognition reflex.',
        ctx.Store.get('moneyness'), function () { runMoneyness(view, ctx, menu); }));
      grid.appendChild(card(h, 'Break-even',
        '90-second sprint. Given a strategy\'s legs and per-leg premiums, type the break-even price. Singles are one step; verticals make you net the premiums first.',
        ctx.Store.get('breakeven'), function () { runBreakeven(view, ctx, menu); }));
      grid.appendChild(card(h, 'Greeks: Identify',
        'Timed — 10 questions, race the clock. Spot which strategy carries a Greek, and match strategies to their full Δ/Γ/Θ/V profile.',
        ctx.Store.get('greeks'), function () { launchQuiz(view, ctx, menu, 'greeksIdentify', { title: 'Greeks: Identify', storeKey: 'greeks', blurb: 'Identify which strategy carries a Greek, and match strategies to their full Δ/Γ/Θ/V profile. Ten questions, against the clock.' }); }));
      grid.appendChild(card(h, 'Greeks: Predict P&L',
        'Timed — 10 questions. A scenario hits (price, vol, or time); decide whether the position profits, loses, or barely changes.',
        ctx.Store.get('greeks-predict'), function () { launchQuiz(view, ctx, menu, 'greeksPredict', { title: 'Greeks: Predict the P&L', storeKey: 'greeks-predict', blurb: 'A scenario hits — price moves, vol shifts, or time passes. Decide whether the position profits, loses, or barely changes. Ten questions, against the clock.' }); }));
      grid.appendChild(card(h, 'Outlook → Strategy',
        'Timed — 10 questions. Given a market view (direction, volatility, risk appetite), pick the strategy that best fits.',
        ctx.Store.get('outlook'), function () { launchQuiz(view, ctx, menu, 'outlook', { title: 'Outlook → Strategy', storeKey: 'outlook', blurb: 'Given a market view — direction, volatility, and risk appetite — pick the strategy that best fits. Ten questions, against the clock.' }); }));
      view.appendChild(grid);
    }
    menu();
  }

  function card(h, title, blurb, rec, onclick) {
    var bits = [];
    if (rec.plays) bits.push(rec.plays + ' play' + (rec.plays > 1 ? 's' : ''));
    if (rec.bestScore != null) bits.push('best ' + rec.bestScore);
    if (rec.bestTimeMs != null) bits.push('fastest ' + global.Store.fmtTime(rec.bestTimeMs));
    return h('div', { class: 'card', style: 'cursor:pointer', onclick: onclick }, [
      h('div', { class: 'card-head' }, [h('span', { class: 'name', text: title })]),
      h('p', { class: 'sub', style: 'margin:0', text: blurb }),
      h('div', { class: 'tag-line', style: 'margin-top:10px', text: bits.join(' · ') || 'not played yet' })
    ]);
  }

  /* ---- box problem generator (clean integers) ---- */
  function makeBox() {
    var W = pick([5, 10, 15, 20]);
    var K1 = pick([85, 90, 95, 100]);
    var K2 = K1 + W;
    var profit = pick([-1, 0, 1, 2]);   // long-box edge; negative = a bad fill
    var cost = W - profit;              // net debit to open
    var cd = Math.round(cost / 2), pd = cost - cd;       // split into call-spread + put-spread debit
    var b = ri(1, 4), a = b + cd;        // sell call K2 = b, buy call K1 = a
    var d = ri(1, 4), c = d + pd;        // sell put K1 = d, buy put K2 = c

    var legs = [
      { sign: '+', t: 'Call', k: K1, p: a },
      { sign: '−', t: 'Call', k: K2, p: b },
      { sign: '+', t: 'Put', k: K2, p: c },
      { sign: '−', t: 'Put', k: K1, p: d }
    ];

    var ask = pick(['cost', 'value', 'profit']);
    var q, ans, ex;
    if (ask === 'cost') {
      q = 'What does it cost to open this box (net debit, per share)?';
      ans = cost;
      ex = 'Net cost = (buy call − sell call) + (buy put − sell put) = (' + a + ' − ' + b + ') + (' + c + ' − ' + d + ') = ' + money(cost) + '.';
    } else if (ask === 'value') {
      q = 'What is this box worth at expiration (per share)?';
      ans = W;
      ex = 'A box always settles to the distance between its strikes: ' + K2 + ' − ' + K1 + ' = ' + money(W) + ' (regardless of where the underlying lands).';
    } else {
      q = 'Opened at this net cost, what is the locked-in profit per share? (negative = a loss)';
      ans = profit;
      ex = 'Profit = width − cost = (' + K2 + ' − ' + K1 + ') − ' + cost + ' = ' + W + ' − ' + cost + ' = ' + money(profit) + '.';
    }
    return { legs: legs, prompt: q, answer: ans, explain: ex };
  }

  /* ---- box game ---- */
  function runBox(view, ctx, back) {
    var h = ctx.h;
    var state = { i: 0, n: 10, score: 0, streak: 0, qs: [], answered: false };

    view.innerHTML = '';
    view.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [
      h('button', { class: 'btn ghost', text: '← Drills', onclick: back })
    ]));
    view.appendChild(h('h1', { text: 'Box Pricing' }));
    view.appendChild(h('p', { class: 'sub', text: 'A box spread = a bull call spread + a bear put spread on the same two strikes. It is worth the strike width at expiration, so the edge is the width minus what you pay. Compute it in your head.' }));

    var setup = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    var cs = h('input', { class: 'q-input pairs-input', type: 'number', min: '5', max: '25', step: '1', value: '10' });
    setup.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: 'Questions' }), cs,
      h('button', { class: 'btn primary', text: '▶ Start', onclick: start })
    ]));
    view.appendChild(setup);

    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Q ' }), h('span', { id: 'bx-q', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Streak ' }), h('span', { id: 'bx-streak', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Score ' }), h('span', { id: 'bx-score', class: 'mono', text: '0' })])
    ]);
    view.appendChild(hud);
    var area = h('div');
    view.appendChild(area);

    function start() {
      state.n = Math.max(5, Math.min(25, parseInt(cs.value, 10) || 10));
      state.qs = []; for (var i = 0; i < state.n; i++) state.qs.push(makeBox());
      state.i = 0; state.score = 0; state.streak = 0;
      hud.style.display = 'flex';
      renderQ();
    }

    function renderQ() {
      var q = state.qs[state.i];
      state.answered = false;
      area.innerHTML = '';
      document.getElementById('bx-q').textContent = (state.i + 1) + '/' + state.qs.length;
      sync();

      var card = h('div', { class: 'muted-box' });
      // legs
      var legBox = h('div', { class: 'legs', style: 'font-size:15px;line-height:2' });
      legBox.innerHTML = q.legs.map(function (l) {
        var cls = l.sign === '+' ? 'buy' : 'sell';
        return '<span class="' + cls + '">' + l.sign + '1 ' + l.t + ' $' + l.k + ' @ $' + l.p + '</span>';
      }).join('<br>');
      card.appendChild(legBox);

      card.appendChild(h('div', { class: 'q-prompt', style: 'margin-top:14px', text: q.prompt }));
      var inp = h('input', { class: 'q-input', type: 'number', step: '0.5', placeholder: 'Your answer ($ per share)…', autocomplete: 'off', style: 'max-width:260px' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      card.appendChild(inp);
      var submitBtn = h('button', { class: 'btn primary', style: 'margin-top:12px;display:block', text: 'Submit ▸', onclick: submit });
      card.appendChild(submitBtn);
      card.appendChild(h('div', { id: 'bx-fb', style: 'margin-top:10px' }));
      area.appendChild(card);
      inp.focus();

      function submit() {
        if (state.answered) return;
        var val = parseFloat(inp.value);
        if (isNaN(val)) { inp.focus(); return; }
        state.answered = true;
        inp.disabled = true; submitBtn.disabled = true;
        var correct = Math.abs(val - q.answer) < 0.01;
        if (correct) { state.streak++; state.score += 10 + (state.streak - 1) * 2; } else { state.streak = 0; }
        sync();
        var fb = document.getElementById('bx-fb');
        fb.appendChild(h('div', { class: 'feedback ' + (correct ? 'ok' : 'no'),
          text: (correct ? '✓ Correct. ' : '✗ Answer: ' + money(q.answer) + '. ') + q.explain }));
        var last = state.i === state.qs.length - 1;
        fb.appendChild(h('button', { class: 'btn primary', style: 'margin-top:8px', text: last ? 'Finish ▸' : 'Next ▸', onclick: function () {
          state.i++; if (state.i >= state.qs.length) finish(); else renderQ();
        } }));
      }
    }

    function sync() {
      document.getElementById('bx-streak').textContent = state.streak;
      document.getElementById('bx-score').textContent = state.score;
    }

    function finish() {
      var rec = ctx.Store.record('box-pricing', { score: state.score });
      area.innerHTML = '';
      var best = (rec.bestScore === state.score) ? ' 🏆 new best!' : '';
      area.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: 'Final score: ' + state.score + best }),
        h('p', { class: 'tag-line', text: 'Best: ' + (rec.bestScore || state.score) + ' · games played: ' + rec.plays }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Drills', onclick: back }),
          h('button', { class: 'btn', text: '⌂ Home', onclick: ctx.home })
        ])
      ]));
      hud.style.display = 'none';
    }
  }

  /* ---- option-value problem generator ----
     A single long call/put. 70% include a premium (you bought it) and ask
     for P/L = intrinsic − premium; 30% ask pure intrinsic value. 70% carry a
     .25/.50 fraction; all answers land on .25 increments. Mixed ITM/OTM. */
  function makeOption() {
    var type = pick(['Call', 'Put']);
    var hasPrem = Math.random() < 0.70;
    var useCents = Math.random() < 0.70;
    var itm = Math.random() < 0.6;            // ensure both ITM and OTM appear

    // Strike and gap are drawn fresh across a wide range each question, so stock
    // prices, strikes and depths vary a lot. The stock's .25/.50 fraction is an
    // independent pick from the premium's, so the two never lock together.
    var K = ri(45, 175);
    var gap = ri(1, 28);
    var sFrac = useCents ? pick([0.25, 0.5]) : 0;

    // Place the stock so the option is ITM or OTM (gap ≥ 1 > frac ≤ 0.5, so the sign holds).
    var S = (type === 'Call')
      ? (itm ? K + gap + sFrac : K - gap + sFrac)
      : (itm ? K - gap + sFrac : K + gap + sFrac);

    var intrinsic = Math.round((type === 'Call' ? Math.max(S - K, 0) : Math.max(K - S, 0)) * 100) / 100;
    var intrTxt = (type === 'Call')
      ? 'max(' + px(S) + ' − ' + px(K) + ', 0)'
      : 'max(' + px(K) + ' − ' + px(S) + ', 0)';

    var prem = 0, ans, prompt, explain;
    if (hasPrem) {
      prem = ri(1, 14) + (useCents ? pick([0, 0.25, 0.5]) : 0);
      ans = Math.round((intrinsic - prem) * 100) / 100;     // long P/L
      prompt = 'You bought this ' + type.toLowerCase() + '. What is your profit/loss at expiration? (negative = a loss, $ per share)';
      explain = 'Intrinsic value = ' + intrTxt + ' = ' + money(intrinsic) + '. You paid ' + money(prem) +
        ', so P/L = ' + px(intrinsic) + ' − ' + px(prem) + ' = ' + money(ans) +
        (intrinsic === 0 ? ' — it expires worthless, so you lose the full premium.' : '.');
    } else {
      ans = intrinsic;
      prompt = 'What is this ' + type.toLowerCase() + ' worth at expiration? ($ per share)';
      explain = 'A ' + type.toLowerCase() + ' is worth ' + (type === 'Call' ? 'max(stock − strike, 0)' : 'max(strike − stock, 0)') +
        ' at expiration: ' + intrTxt + ' = ' + money(intrinsic) +
        (intrinsic === 0 ? ' — out of the money, so it expires worthless.' : '.');
    }
    return { type: type, K: K, S: S, prem: prem, hasPrem: hasPrem, answer: ans, prompt: prompt, explain: explain };
  }

  /* ---- option-value game (90-second sprint) ---- */
  function runOption(view, ctx, back) {
    var h = ctx.h;
    var ROUND_MS = 90000;
    var state = { score: 0, correct: 0, attempted: 0, streak: 0, deadline: 0, remainingMs: 0, timerId: null, q: null, answered: false, running: false, paused: false };

    function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }
    function leave() { stopTimer(); state.running = false; back(); }

    view.innerHTML = '';
    view.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [
      h('button', { class: 'btn ghost', text: '← Drills', onclick: leave })
    ]));
    view.appendChild(h('h1', { text: 'Option Value' }));
    view.appendChild(h('p', { class: 'sub', text: 'A call is worth max(stock − strike, 0) at expiration; a put, max(strike − stock, 0) — never less than zero. If you bought it for a premium, your P/L is that value minus what you paid. 90-second sprint: answer as many as you can.' }));

    var setup = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    setup.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: '90 seconds · type your answer, Enter to submit. Correct answers fly straight to the next; a miss pauses so you can read why.' }),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn primary', text: '▶ Start', onclick: start })
    ]));
    view.appendChild(setup);

    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Time ' }), h('span', { id: 'ov-time', class: 'mono', text: '90s' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Correct ' }), h('span', { id: 'ov-correct', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Streak ' }), h('span', { id: 'ov-streak', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Score ' }), h('span', { id: 'ov-score', class: 'mono', text: '0' })]),
      h('span', { style: 'flex:1' }),
      h('button', { id: 'ov-pause', class: 'btn ghost', text: '⏸ Pause', onclick: togglePause })
    ]);
    view.appendChild(hud);
    var pausedMsg = h('div', { class: 'paused-msg', style: 'display:none' }, '⏸ Paused — the clock is stopped and the question is hidden. Press Resume to continue.');
    view.appendChild(pausedMsg);
    var area = h('div');
    view.appendChild(area);

    // Pause freezes the countdown: stash the time left, stop the interval, hide the
    // question; on resume rebuild the deadline from the remaining time and restart.
    function togglePause() {
      if (!state.running) return;
      var btn = document.getElementById('ov-pause');
      if (!state.paused) {
        state.paused = true;
        state.remainingMs = Math.max(0, state.deadline - Date.now());
        stopTimer();
        if (btn) btn.textContent = '▶ Resume';
        area.style.display = 'none';
        pausedMsg.style.display = '';
      } else {
        state.paused = false;
        state.deadline = Date.now() + state.remainingMs;
        stopTimer();
        state.timerId = setInterval(tick, 250);
        tick();
        if (btn) btn.textContent = '⏸ Pause';
        pausedMsg.style.display = 'none';
        area.style.display = '';
        var inp = area.querySelector('input.q-input');
        if (inp && !inp.readOnly) inp.focus();
      }
    }

    function start() {
      state.score = 0; state.correct = 0; state.attempted = 0; state.streak = 0;
      state.running = true; state.paused = false;
      state.deadline = Date.now() + ROUND_MS;
      hud.style.display = 'flex';
      pausedMsg.style.display = 'none';
      area.style.display = '';
      var pb = document.getElementById('ov-pause'); if (pb) pb.textContent = '⏸ Pause';
      stopTimer();
      state.timerId = setInterval(tick, 250);
      tick();
      renderQ();
    }

    function tick() {
      var timeEl = document.getElementById('ov-time');
      if (!timeEl) { stopTimer(); return; }              // user navigated away mid-round
      var left = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
      timeEl.textContent = left + 's';
      timeEl.style.color = left <= 10 ? '#ff5c5c' : '';
      if (left <= 0) finish();
    }

    function renderQ() {
      if (!state.running) return;
      state.q = makeOption();
      state.answered = false;
      area.innerHTML = '';

      var q = state.q;
      function advance() { if (state.running && !state.paused) renderQ(); }

      var card = h('div', { class: 'muted-box' });
      var posBox = h('div', { class: 'legs', style: 'font-size:15px;line-height:2' });
      posBox.innerHTML =
        (q.hasPrem
          ? '<span class="buy">Bought 1 ' + q.type + '  ·  strike $' + px(q.K) + '  ·  paid $' + px(q.prem) + '</span>'
          : '<span>1 ' + q.type + '  ·  strike $' + px(q.K) + '</span>') +
        '<br><span class="mono">Stock at expiration: $' + px(q.S) + '</span>';
      card.appendChild(posBox);

      card.appendChild(h('div', { class: 'q-prompt', style: 'margin-top:14px', text: q.prompt }));
      var inp = h('input', { class: 'q-input', type: 'number', step: '0.25', placeholder: 'Your answer ($ per share)…', autocomplete: 'off', style: 'max-width:260px' });
      // Enter submits while unanswered; once a miss is showing, Enter advances.
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { if (state.answered) advance(); else submit(); } });
      card.appendChild(inp);
      var submitBtn = h('button', { class: 'btn primary', style: 'margin-top:12px;display:block', text: 'Submit ▸', onclick: submit });
      card.appendChild(submitBtn);
      card.appendChild(h('div', { id: 'ov-fb', style: 'margin-top:10px' }));
      area.appendChild(card);
      inp.focus();

      function submit() {
        if (state.answered || !state.running || state.paused) return;
        var val = parseFloat(inp.value);
        if (isNaN(val)) { inp.focus(); return; }
        state.attempted++;
        var correct = Math.abs(val - q.answer) < 0.01;
        if (correct) {
          state.correct++; state.streak++; state.score += 10 + (state.streak - 1) * 2;
          syncHud();
          renderQ();                       // instant next — keep the sprint moving
          return;
        }
        // miss: reset streak and pause to show the worked answer
        state.answered = true; state.streak = 0;
        inp.readOnly = true; submitBtn.disabled = true;
        syncHud();
        var fb = document.getElementById('ov-fb');
        fb.appendChild(h('div', { class: 'feedback no', text: '✗ Answer: ' + money(q.answer) + '. ' + q.explain }));
        fb.appendChild(h('button', { class: 'btn primary', style: 'margin-top:8px', text: 'Next ▸ (Enter)', onclick: advance }));
        inp.focus();                       // keep focus so Enter advances
      }
    }

    function syncHud() {
      document.getElementById('ov-correct').textContent = state.correct;
      document.getElementById('ov-streak').textContent = state.streak;
      document.getElementById('ov-score').textContent = state.score;
    }

    function finish() {
      if (!state.running) return;
      state.running = false; state.paused = false;
      stopTimer();
      var rec = ctx.Store.record('option-value', { score: state.score });
      hud.style.display = 'none';
      pausedMsg.style.display = 'none';
      area.style.display = '';
      area.innerHTML = '';
      var best = (rec.bestScore === state.score && state.score > 0) ? ' 🏆 new best!' : '';
      var acc = state.attempted ? Math.round(100 * state.correct / state.attempted) : 0;
      area.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: 'Time! Score: ' + state.score + best }),
        h('p', { class: 'tag-line', text: state.correct + ' correct of ' + state.attempted + ' answered (' + acc + '%) · best ' + (rec.bestScore || state.score) + ' · games played ' + rec.plays }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Drills', onclick: leave }),
          h('button', { class: 'btn', text: '⌂ Home', onclick: function () { stopTimer(); state.running = false; ctx.home(); } })
        ])
      ]));
    }
  }

  /* ============================================================
   * runSprint — shared 90-second sprint shell (timer + pause + HUD +
   * scoring). The game supplies cfg.makeQ() and cfg.render(area, q, api).
   * render() owns the per-question DOM (area is cleared each question);
   * it calls api.recordAnswer(ok) to score and api.next() to advance.
   * api also exposes running(), paused(), h, money, px.
   * ============================================================ */
  function runSprint(view, ctx, back, cfg) {
    var h = ctx.h;
    var ID = cfg.idPrefix;
    var DUR = cfg.durationMs || 90000;
    var state = { score: 0, correct: 0, attempted: 0, streak: 0, deadline: 0, remainingMs: 0, timerId: null, running: false, paused: false };

    function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }
    function leave() { stopTimer(); state.running = false; back(); }

    view.innerHTML = '';
    view.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [
      h('button', { class: 'btn ghost', text: '← Drills', onclick: leave })
    ]));
    view.appendChild(h('h1', { text: cfg.title }));
    view.appendChild(h('p', { class: 'sub', text: cfg.sub }));

    var setup = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    setup.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: cfg.startNote }),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn primary', text: '▶ Start', onclick: start })
    ]));
    view.appendChild(setup);

    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Time ' }), h('span', { id: ID + '-time', class: 'mono', text: (DUR / 1000) + 's' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Correct ' }), h('span', { id: ID + '-correct', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Streak ' }), h('span', { id: ID + '-streak', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Score ' }), h('span', { id: ID + '-score', class: 'mono', text: '0' })]),
      h('span', { style: 'flex:1' }),
      h('button', { id: ID + '-pause', class: 'btn ghost', text: '⏸ Pause', onclick: togglePause })
    ]);
    view.appendChild(hud);
    var pausedMsg = h('div', { class: 'paused-msg', style: 'display:none' }, '⏸ Paused — the clock is stopped and the question is hidden. Press Resume to continue.');
    view.appendChild(pausedMsg);
    var area = h('div');
    view.appendChild(area);

    function togglePause() {
      if (!state.running) return;
      var btn = document.getElementById(ID + '-pause');
      if (!state.paused) {
        state.paused = true;
        state.remainingMs = Math.max(0, state.deadline - Date.now());
        stopTimer();
        if (btn) btn.textContent = '▶ Resume';
        area.style.display = 'none';
        pausedMsg.style.display = '';
      } else {
        state.paused = false;
        state.deadline = Date.now() + state.remainingMs;
        stopTimer();
        state.timerId = setInterval(tick, 250);
        tick();
        if (btn) btn.textContent = '⏸ Pause';
        pausedMsg.style.display = 'none';
        area.style.display = '';
        var inp = area.querySelector('input');
        if (inp && !inp.readOnly) { inp.focus(); }
        else { var fx = area.querySelector('[tabindex]'); if (fx) fx.focus(); }
      }
    }

    function tick() {
      var t = document.getElementById(ID + '-time');
      if (!t) { stopTimer(); return; }                  // user navigated away mid-round
      var left = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
      t.textContent = left + 's';
      t.style.color = left <= 10 ? '#ff5c5c' : '';
      if (left <= 0) finish();
    }

    function syncHud() {
      document.getElementById(ID + '-correct').textContent = state.correct;
      document.getElementById(ID + '-streak').textContent = state.streak;
      document.getElementById(ID + '-score').textContent = state.score;
    }

    var api = {
      recordAnswer: function (ok) {
        state.attempted++;
        if (ok) { state.correct++; state.streak++; state.score += 10 + (state.streak - 1) * 2; }
        else { state.streak = 0; }
        syncHud();
      },
      next: function () { if (state.running && !state.paused) renderQ(); },
      running: function () { return state.running; },
      paused: function () { return state.paused; },
      h: h, money: money, px: px
    };

    function renderQ() {
      if (!state.running) return;
      area.innerHTML = '';
      cfg.render(area, cfg.makeQ(), api);
    }

    function start() {
      state.score = 0; state.correct = 0; state.attempted = 0; state.streak = 0;
      state.running = true; state.paused = false;
      state.deadline = Date.now() + DUR;
      hud.style.display = 'flex';
      pausedMsg.style.display = 'none';
      area.style.display = '';
      var pb = document.getElementById(ID + '-pause'); if (pb) pb.textContent = '⏸ Pause';
      stopTimer();
      state.timerId = setInterval(tick, 250);
      tick();
      renderQ();
    }

    function finish() {
      if (!state.running) return;
      state.running = false; state.paused = false;
      stopTimer();
      var rec = ctx.Store.record(cfg.storeKey, { score: state.score });
      hud.style.display = 'none';
      pausedMsg.style.display = 'none';
      area.style.display = '';
      area.innerHTML = '';
      var best = (rec.bestScore === state.score && state.score > 0) ? ' 🏆 new best!' : '';
      var acc = state.attempted ? Math.round(100 * state.correct / state.attempted) : 0;
      area.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: 'Time! Score: ' + state.score + best }),
        h('p', { class: 'tag-line', text: state.correct + ' correct of ' + state.attempted + ' answered (' + acc + '%) · best ' + (rec.bestScore || state.score) + ' · games played ' + rec.plays }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Drills', onclick: leave }),
          h('button', { class: 'btn', text: '⌂ Home', onclick: function () { stopTimer(); state.running = false; ctx.home(); } })
        ])
      ]));
    }
  }

  /* ---- Moneyness Flash ---- */
  function makeMoneyness() {
    var type = pick(['Call', 'Put']);
    var K = ri(40, 180);
    // weighted: ITM 40% / OTM 40% / ATM 20% (ATM is the rarer, sharper call)
    var r = Math.random();
    var which = r < 0.4 ? 'ITM' : (r < 0.8 ? 'OTM' : 'ATM');
    var S;
    if (which === 'ATM') {
      S = K;                                  // exactly at the strike
    } else {
      var gap = ri(1, 25);
      var frac = (Math.random() < 0.5) ? pick([0.25, 0.5, 0.75]) : 0;
      // Call: ITM when stock is above the strike. Put: ITM when below.
      var above = (type === 'Call') ? (which === 'ITM') : (which === 'OTM');
      S = above ? (K + gap + frac) : (K - gap + frac);
    }
    return { type: type, K: K, S: round2(S), answer: which };
  }

  function runMoneyness(view, ctx, back) {
    var lastResult = null;
    runSprint(view, ctx, back, {
      title: 'Moneyness Flash',
      sub: 'A call is in-the-money when the stock is above the strike; a put, when it is below; at-the-money is exactly at the strike. Classify each option as fast as you can.',
      startNote: '90 seconds · tap ITM / ATM / OTM, or press 1 / 2 / 3. Go fast.',
      storeKey: 'moneyness', idPrefix: 'mf',
      makeQ: makeMoneyness,
      render: function (area, q, api) {
        var h = api.h;
        if (lastResult) {
          area.appendChild(h('div', { class: 'feedback ' + (lastResult.ok ? 'ok' : 'no'), style: 'margin-bottom:10px', text: lastResult.text }));
        }
        var card = h('div', { class: 'muted-box', style: 'outline:none' });
        card.tabIndex = 0;
        var opt = h('div', { class: 'legs', style: 'font-size:18px;line-height:2' });
        opt.innerHTML = '<span class="mono">' + q.type + '  ·  strike $' + px(q.K) + '</span><br>' +
                        '<span class="mono">Stock now: $' + px(q.S) + '</span>';
        card.appendChild(opt);
        card.appendChild(h('div', { class: 'q-prompt', style: 'margin-top:10px', text: 'In, at, or out of the money?' }));

        var locked = false;
        function choose(p) {
          if (locked || !api.running() || api.paused()) return;
          locked = true;
          var ok = (p === q.answer);
          lastResult = ok
            ? { ok: true, text: '✓ ' + q.type + ' $' + px(q.K) + ', stock $' + px(q.S) + ' → ' + q.answer }
            : { ok: false, text: '✗ You tapped ' + p + ' — it was ' + q.answer + ' (' + q.type + ' $' + px(q.K) + ', stock $' + px(q.S) + ')' };
          api.recordAnswer(ok);
          api.next();
        }

        var row = h('div', { class: 'row', style: 'margin-top:12px' });
        ['ITM', 'ATM', 'OTM'].forEach(function (lab, i) {
          row.appendChild(h('button', { class: 'btn', style: 'min-width:96px;justify-content:center', text: '[' + (i + 1) + '] ' + lab, onclick: function () { choose(lab); } }));
        });
        card.appendChild(row);
        card.addEventListener('keydown', function (e) {
          if (e.key === '1') choose('ITM');
          else if (e.key === '2') choose('ATM');
          else if (e.key === '3') choose('OTM');
        });
        area.appendChild(card);
        card.focus();
      }
    });
  }

  /* ---- Break-even (singles + verticals, one BE each) ---- */
  function bePremium() { return ri(1, 12) + (Math.random() < 0.4 ? 0.5 : 0); }
  function beStrike() { return ri(50, 160); }
  function beWidth() { return pick([5, 10, 15, 20, 25]); }
  function beEdge() { return pick([1, 2, 3, 4]) + (Math.random() < 0.4 ? 0.5 : 0); }
  function beSmall() { return ri(1, 5) + (Math.random() < 0.4 ? 0.5 : 0); }
  function beLeg(sign, text) { return '<span class="' + (sign === '+' ? 'buy' : 'sell') + '">' + sign + ' ' + text + '</span>'; }

  var BE_TEMPLATES = [
    function () {                                     // Long Call
      var K = beStrike(), p = bePremium();
      return { legs: [beLeg('+', '1 Call $' + px(K) + ' @ $' + px(p))], prompt: 'Break-even at expiration?',
        answer: round2(K + p), explain: 'Long call breaks even at strike + premium = ' + px(K) + ' + ' + px(p) + ' = ' + money(K + p) + '.' };
    },
    function () {                                     // Long Put
      var K = beStrike(), p = bePremium();
      return { legs: [beLeg('+', '1 Put $' + px(K) + ' @ $' + px(p))], prompt: 'Break-even at expiration?',
        answer: round2(K - p), explain: 'Long put breaks even at strike − premium = ' + px(K) + ' − ' + px(p) + ' = ' + money(K - p) + '.' };
    },
    function () {                                     // Bull Call Spread (debit)
      var K1 = beStrike(), K2 = K1 + beWidth(), b = beSmall(), d = beEdge(), a = round2(b + d);
      return { legs: [beLeg('+', '1 Call $' + px(K1) + ' @ $' + px(a)), beLeg('−', '1 Call $' + px(K2) + ' @ $' + px(b))], prompt: 'Break-even at expiration?',
        answer: round2(K1 + d), explain: 'Net debit = ' + px(a) + ' − ' + px(b) + ' = ' + money(d) + '. Bull call spread breaks even at lower strike + net debit = ' + px(K1) + ' + ' + px(d) + ' = ' + money(K1 + d) + '.' };
    },
    function () {                                     // Bear Put Spread (debit)
      var K1 = beStrike(), K2 = K1 + beWidth(), b = beSmall(), d = beEdge(), a = round2(b + d);
      return { legs: [beLeg('+', '1 Put $' + px(K2) + ' @ $' + px(a)), beLeg('−', '1 Put $' + px(K1) + ' @ $' + px(b))], prompt: 'Break-even at expiration?',
        answer: round2(K2 - d), explain: 'Net debit = ' + px(a) + ' − ' + px(b) + ' = ' + money(d) + '. Bear put spread breaks even at higher strike − net debit = ' + px(K2) + ' − ' + px(d) + ' = ' + money(K2 - d) + '.' };
    },
    function () {                                     // Bull Put Spread (credit)
      var K1 = beStrike(), K2 = K1 + beWidth(), buy = beSmall(), cr = beEdge(), sell = round2(buy + cr);
      return { legs: [beLeg('−', '1 Put $' + px(K2) + ' @ $' + px(sell)), beLeg('+', '1 Put $' + px(K1) + ' @ $' + px(buy))], prompt: 'Break-even at expiration?',
        answer: round2(K2 - cr), explain: 'Net credit = ' + px(sell) + ' − ' + px(buy) + ' = ' + money(cr) + '. Bull put spread breaks even at the short strike − net credit = ' + px(K2) + ' − ' + px(cr) + ' = ' + money(K2 - cr) + '.' };
    },
    function () {                                     // Bear Call Spread (credit)
      var K1 = beStrike(), K2 = K1 + beWidth(), buy = beSmall(), cr = beEdge(), sell = round2(buy + cr);
      return { legs: [beLeg('−', '1 Call $' + px(K1) + ' @ $' + px(sell)), beLeg('+', '1 Call $' + px(K2) + ' @ $' + px(buy))], prompt: 'Break-even at expiration?',
        answer: round2(K1 + cr), explain: 'Net credit = ' + px(sell) + ' − ' + px(buy) + ' = ' + money(cr) + '. Bear call spread breaks even at the short strike + net credit = ' + px(K1) + ' + ' + px(cr) + ' = ' + money(K1 + cr) + '.' };
    },
    function () {                                     // Covered Call
      var S0 = beStrike(), c = bePremium(), K = S0 + pick([5, 10, 15]);
      return { legs: [beLeg('+', '100 Shares @ $' + px(S0)), beLeg('−', '1 Call $' + px(K) + ' @ $' + px(c))], prompt: 'Break-even on the stock at expiration?',
        answer: round2(S0 - c), explain: 'Covered call breaks even at stock cost − call premium received = ' + px(S0) + ' − ' + px(c) + ' = ' + money(S0 - c) + ' (the strike does not affect the break-even).' };
    },
    function () {                                     // Protective Put
      var S0 = beStrike(), p = bePremium(), K = S0 - pick([5, 10, 15]);
      return { legs: [beLeg('+', '100 Shares @ $' + px(S0)), beLeg('+', '1 Put $' + px(K) + ' @ $' + px(p))], prompt: 'Break-even on the stock at expiration?',
        answer: round2(S0 + p), explain: 'Protective put breaks even at stock cost + put premium paid = ' + px(S0) + ' + ' + px(p) + ' = ' + money(S0 + p) + ' (the strike does not affect the break-even).' };
    }
  ];

  function makeBreakeven() { return pick(BE_TEMPLATES)(); }

  function runBreakeven(view, ctx, back) {
    runSprint(view, ctx, back, {
      title: 'Break-even',
      sub: 'Find the underlying price where the position breaks even at expiration. Long call = strike + premium; long put = strike − premium; spreads = net the premiums, then apply to the right strike.',
      startNote: '90 seconds · type the break-even price, Enter to submit. A miss pauses with the math.',
      storeKey: 'breakeven', idPrefix: 'be',
      makeQ: makeBreakeven,
      render: function (area, q, api) {
        var h = api.h;
        var card = h('div', { class: 'muted-box' });
        var legs = h('div', { class: 'legs', style: 'font-size:15px;line-height:2' });
        legs.innerHTML = q.legs.join('<br>');
        card.appendChild(legs);
        card.appendChild(h('div', { class: 'q-prompt', style: 'margin-top:14px', text: q.prompt }));
        var inp = h('input', { class: 'q-input', type: 'number', step: '0.5', placeholder: 'Break-even price ($)…', autocomplete: 'off', style: 'max-width:260px' });
        card.appendChild(inp);
        var submitBtn = h('button', { class: 'btn primary', style: 'margin-top:12px;display:block', text: 'Submit ▸', onclick: submit });
        card.appendChild(submitBtn);
        var fb = h('div', { style: 'margin-top:10px' });
        card.appendChild(fb);
        area.appendChild(card);
        inp.focus();

        var answered = false;
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { if (answered) api.next(); else submit(); } });

        function submit() {
          if (answered || !api.running() || api.paused()) return;
          var val = parseFloat(inp.value);
          if (isNaN(val)) { inp.focus(); return; }
          var ok = Math.abs(val - q.answer) < 0.01;
          if (ok) { api.recordAnswer(true); api.next(); return; }
          answered = true; api.recordAnswer(false);
          inp.readOnly = true; submitBtn.disabled = true;
          fb.appendChild(h('div', { class: 'feedback no', text: '✗ Break-even: ' + money(q.answer) + '. ' + q.explain }));
          fb.appendChild(h('button', { class: 'btn primary', style: 'margin-top:8px', text: 'Next ▸ (Enter)', onclick: function () { api.next(); } }));
          inp.focus();
        }
      }
    });
  }

  /* ---- timed 10-question MC quiz shell (race the clock; best time saved) ----
     cfg: { title, blurb, storeKey, make() -> MC question }. Powers the Greeks
     and Outlook drills, which were converted from pick-a-question-count quizzes
     to "how fast can you finish 10?" The clock freezes when Q10 is answered. */
  function runTimedQuiz(view, ctx, back, cfg) {
    var h = ctx.h;
    var N = 10;
    var state = { i: 0, score: 0, streak: 0, correctCount: 0, qs: [], answered: false, startMs: 0, elapsedMs: 0, timerId: null, paused: false, pausedAt: 0, active: false };

    function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }
    function leave() { stopTimer(); back(); }

    // Pause a count-up stopwatch: stop ticking and hide the question; on resume,
    // push startMs forward by the paused gap so the pause doesn't count.
    function togglePause() {
      if (!state.active) return;
      var btn = document.getElementById('tq-pause');
      if (!state.paused) {
        state.paused = true; state.pausedAt = Date.now();
        stopTimer();
        if (btn) btn.textContent = '▶ Resume';
        area.style.display = 'none';
        pausedMsg.style.display = '';
      } else {
        state.paused = false;
        state.startMs += (Date.now() - state.pausedAt);
        stopTimer();
        state.timerId = setInterval(updateTime, 100);
        updateTime();
        if (btn) btn.textContent = '⏸ Pause';
        pausedMsg.style.display = 'none';
        area.style.display = '';
      }
    }

    view.innerHTML = '';
    view.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [
      h('button', { class: 'btn ghost', text: '← Drills', onclick: leave })
    ]));
    view.appendChild(h('h1', { text: cfg.title }));
    view.appendChild(h('p', { class: 'sub', text: cfg.blurb }));

    var setup = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    setup.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: 'Race to answer 10 questions — the clock starts when you begin.' }),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn primary', text: '▶ Start', onclick: start })
    ]));
    view.appendChild(setup);

    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Time ' }), h('span', { id: 'tq-time', class: 'mono', text: '0.0s' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Q ' }), h('span', { id: 'tq-q', class: 'mono', text: '0/' + N })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Correct ' }), h('span', { id: 'tq-correct', class: 'mono', text: '0' })]),
      h('span', { style: 'flex:1' }),
      h('button', { id: 'tq-pause', class: 'btn ghost', text: '⏸ Pause', onclick: togglePause })
    ]);
    view.appendChild(hud);
    var pausedMsg = h('div', { class: 'paused-msg', style: 'display:none' }, '⏸ Paused — the clock is stopped and the question is hidden. Press Resume to continue.');
    view.appendChild(pausedMsg);
    var area = h('div');
    view.appendChild(area);

    function buildQs() {
      var qs = [], guard = 0;
      while (qs.length < N && guard < N * 15) { guard++; var q = cfg.make(); if (q) qs.push(q); }
      return qs;
    }

    function start() {
      var qs = buildQs();
      if (qs.length < N) {
        hud.style.display = 'none';
        area.innerHTML = '';
        area.appendChild(h('div', { class: 'feedback no', text: 'Not enough distinct strategies in your current scope to build 10 questions. Widen your tiers / categories on the Home screen.' }));
        return;
      }
      state.qs = qs; state.i = 0; state.score = 0; state.streak = 0; state.correctCount = 0;
      state.startMs = Date.now(); state.elapsedMs = 0;
      state.paused = false; state.active = true;
      hud.style.display = 'flex';
      pausedMsg.style.display = 'none';
      area.style.display = '';
      var pb = document.getElementById('tq-pause'); if (pb) { pb.textContent = '⏸ Pause'; pb.disabled = false; }
      stopTimer();
      state.timerId = setInterval(updateTime, 100);
      updateTime();
      renderQ();
    }

    function updateTime() {
      var t = document.getElementById('tq-time');
      if (!t) { stopTimer(); return; }
      var ms = state.elapsedMs || (Date.now() - state.startMs);
      t.textContent = (ms / 1000).toFixed(1) + 's';
    }

    function renderQ() {
      var q = state.qs[state.i];
      state.answered = false;
      area.innerHTML = '';
      document.getElementById('tq-q').textContent = (state.i + 1) + '/' + N;
      var card = h('div', { class: 'muted-box' });
      card.appendChild(h('div', { class: 'q-prompt', text: q.promptText || q.prompt }));
      if (q.promptMono) card.appendChild(h('div', { class: 'greek-profile-prompt mono', text: q.promptMono }));
      var optWrap = h('div', { class: 'q-options' });
      q.options.forEach(function (opt, oi) {
        optWrap.appendChild(h('button', { class: 'q-opt' + (q.mono ? ' mono' : ''), text: opt, onclick: function () { answer(oi, optWrap, q); } }));
      });
      card.appendChild(optWrap);
      card.appendChild(h('div', { id: 'tq-fb', style: 'margin-top:10px' }));
      area.appendChild(card);
    }

    function answer(oi, optWrap, q) {
      if (state.answered || state.paused) return;
      state.answered = true;
      var correct = oi === q.answer;
      Array.prototype.forEach.call(optWrap.children, function (b, idx) {
        b.disabled = true;
        if (idx === q.answer) b.classList.add('opt-correct');
        else if (idx === oi) b.classList.add('opt-wrong');
      });
      if (correct) { state.streak++; state.score += 10 + (state.streak - 1) * 2; state.correctCount++; } else { state.streak = 0; }
      document.getElementById('tq-correct').textContent = state.correctCount;
      var last = state.i === N - 1;
      if (last) {                                              // freeze the clock + disable pause at completion
        state.elapsedMs = Date.now() - state.startMs; state.active = false; stopTimer(); updateTime();
        var pb = document.getElementById('tq-pause'); if (pb) pb.disabled = true;
      }
      var fb = document.getElementById('tq-fb');
      fb.appendChild(h('div', { class: 'feedback ' + (correct ? 'ok' : 'no'), text: (correct ? '✓ ' : '✗ ') + q.explain }));
      fb.appendChild(h('button', { class: 'btn primary', style: 'margin-top:8px', text: last ? 'Finish ▸' : 'Next ▸', onclick: function () {
        state.i++; if (state.i >= N) finish(); else renderQ();
      } }));
    }

    function finish() {
      state.active = false; state.paused = false;
      var rec = ctx.Store.record(cfg.storeKey, { score: state.correctCount, timeMs: state.elapsedMs });
      area.innerHTML = '';
      area.style.display = '';
      pausedMsg.style.display = 'none';
      hud.style.display = 'none';
      var pb = (rec.bestTimeMs === state.elapsedMs) ? ' 🏆 new best time!' : '';
      area.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: 'Done — ' + (state.elapsedMs / 1000).toFixed(1) + 's' + pb }),
        h('p', { class: 'tag-line', text: state.correctCount + ' / ' + N + ' correct · fastest ' + ctx.Store.fmtTime(rec.bestTimeMs) + ' · plays ' + rec.plays }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Drills', onclick: leave }),
          h('button', { class: 'btn', text: '⌂ Home', onclick: ctx.home })
        ])
      ]));
    }
  }

  /* ---- launch a strategy-based timed quiz from the Drills menu (needs ≥4 strategies) ---- */
  function launchQuiz(view, ctx, back, factoryName, meta) {
    var h = ctx.h;
    var DB = global.DrillBank || {};
    var pool = ctx.strategies;
    if (!DB[factoryName] || pool.length < 4) {
      view.innerHTML = '';
      view.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [h('button', { class: 'btn ghost', text: '← Drills', onclick: back })]));
      view.appendChild(h('h1', { text: meta.title }));
      view.appendChild(h('div', { class: 'muted-box' }, [
        h('p', { class: 'sub', text: 'This quiz needs at least 4 strategies in your session. Adjust your tiers / categories on the Home screen.' }),
        h('button', { class: 'btn primary', text: '← Drills', onclick: back })
      ]));
      return;
    }
    runTimedQuiz(view, ctx, back, { title: meta.title, blurb: meta.blurb, storeKey: meta.storeKey, make: DB[factoryName](pool) });
  }

  /* ---- publish the numeric generators so Test can reuse them (one source of math) ---- */
  var DB = global.DrillBank = global.DrillBank || {};
  DB.moneyness = makeMoneyness;
  DB.optionValue = makeOption;
  DB.breakeven = makeBreakeven;
  DB.box = makeBox;

  global.App.registerMode({
    id: 'drills', label: 'Drills', minStrategies: 0,
    blurb: 'Timed practice games that sharpen the mental math and fast recognition options trading runs on.',
    init: init
  });
})(window);
