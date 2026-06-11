/* ============================================================
 * modes/drills.js — "Drills" tab: mental-math calculation games
 * (chooser page; room to add more drills later)
 *   1) Box Pricing — given a box's four legs + prices, compute the
 *      net cost, the value at expiration, or the locked-in profit.
 *      Clean integers, type-the-number, timer + streak.
 * ============================================================ */
(function (global) {
  'use strict';

  function ri(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function money(n) { return (n < 0 ? '−$' : '$') + Math.abs(n); }

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

  global.App.registerMode({
    id: 'drills', label: 'Drills', minStrategies: 0,
    blurb: 'Mental-math drills. First up: Box Pricing — compute a box spread\'s cost, value, and edge.',
    init: init
  });
})(window);
