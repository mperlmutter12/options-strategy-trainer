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
 * ============================================================ */
(function (global) {
  'use strict';

  function ri(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  // Decimal-aware money: integers render with no decimals (box game), so this
  // is backward-compatible; fractional values (option-value game) show cents.
  function money(n) { var a = Math.abs(n); return (n < 0 ? '−$' : '$') + (Number.isInteger(a) ? String(a) : a.toFixed(2)); }
  function px(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }

  function init(view, ctx) {
    var h = ctx.h;
    function menu() {
      view.innerHTML = '';
      view.appendChild(h('h1', { text: 'Drills' }));
      view.appendChild(h('p', { class: 'sub', text: 'Mental-math practice. Read the position, do the arithmetic in your head, type the answer.' }));
      var grid = h('div', { class: 'grid' });
      grid.appendChild(card(h, 'Box Pricing',
        'Given a box spread\'s four legs and their prices, work out the net cost, what it\'s worth at expiration, or the locked-in profit.',
        ctx.Store.get('box-pricing'), function () { runBox(view, ctx, menu); }));
      grid.appendChild(card(h, 'Option Value',
        '90-second sprint. One call or put with a strike and the stock price: compute what it\'s worth at expiration — or, if you bought it for a premium, your profit/loss. Answer as many as you can. Awkward dollars, cents in play.',
        ctx.Store.get('option-value'), function () { runOption(view, ctx, menu); }));
      view.appendChild(grid);
    }
    menu();
  }

  function card(h, title, blurb, rec, onclick) {
    var bits = [];
    if (rec.plays) bits.push(rec.plays + ' play' + (rec.plays > 1 ? 's' : ''));
    if (rec.bestScore != null) bits.push('best ' + rec.bestScore);
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
    var state = { score: 0, correct: 0, attempted: 0, streak: 0, deadline: 0, timerId: null, q: null, answered: false, running: false };

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
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Score ' }), h('span', { id: 'ov-score', class: 'mono', text: '0' })])
    ]);
    view.appendChild(hud);
    var area = h('div');
    view.appendChild(area);

    function start() {
      state.score = 0; state.correct = 0; state.attempted = 0; state.streak = 0;
      state.running = true;
      state.deadline = Date.now() + ROUND_MS;
      hud.style.display = 'flex';
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
      function advance() { if (state.running) renderQ(); }

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
        if (state.answered || !state.running) return;
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
      state.running = false;
      stopTimer();
      var rec = ctx.Store.record('option-value', { score: state.score });
      var timeEl = document.getElementById('ov-time'); if (timeEl) { timeEl.textContent = '0s'; timeEl.style.color = ''; }
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

  global.App.registerMode({
    id: 'drills', label: 'Drills', minStrategies: 0,
    blurb: 'Mental-math drills. First up: Box Pricing — compute a box spread\'s cost, value, and edge.',
    init: init
  });
})(window);
