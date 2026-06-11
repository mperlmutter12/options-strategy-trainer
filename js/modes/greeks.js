/* ============================================================
 * modes/greeks.js — Greeks tab: two games behind one menu
 *   1) Identify — "which strategy is net short theta?", profile↔strategy
 *   2) Predict the P&L — scenario drills: price/vol/time move → gain,
 *      lose, or little change (applies each Greek to an outcome)
 * Conceptual signs only. Best scores persist per sub-game.
 * ============================================================ */
(function (global) {
  'use strict';

  var G = function () { return global.Greeks; };

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function profileStr(s) {
    var L = G().SIGN_LABEL;
    return 'Δ ' + L[s.greeks.delta] + ' · Γ ' + L[s.greeks.gamma] + ' · Θ ' + L[s.greeks.theta] + ' · V ' + L[s.greeks.vega];
  }

  /* ============================ MENU ============================ */
  function init(view, ctx) {
    var h = ctx.h;
    function menu() {
      view.innerHTML = '';
      view.appendChild(h('h1', { text: 'Greeks' }));
      view.appendChild(h('p', { class: 'sub', text: 'Two ways to practice the net Greek profile (Δ delta / Γ gamma / Θ theta / V vega) — conceptual signs only. Pick a game.' }));
      var grid = h('div', { class: 'grid' });
      grid.appendChild(gameCard(h, 'Identify',
        'Spot which strategy carries a Greek ("which is net short theta?") and match strategies to their full Δ/Γ/Θ/V profile.',
        ctx.Store.get('greeks'), function () { runIdentify(view, ctx, menu); }));
      grid.appendChild(gameCard(h, 'Predict the P&L',
        'A scenario hits — price moves, vol shifts, or time passes. Decide whether the position profits, loses, or barely changes. Learn what each Greek does.',
        ctx.Store.get('greeks-predict'), function () { runPredict(view, ctx, menu); }));
      view.appendChild(grid);
    }
    menu();
  }

  function gameCard(h, title, blurb, rec, onclick) {
    var bits = [];
    if (rec.plays) bits.push(rec.plays + ' play' + (rec.plays > 1 ? 's' : ''));
    if (rec.bestScore != null) bits.push('best ' + rec.bestScore);
    var card = h('div', { class: 'card', style: 'cursor:pointer', onclick: onclick }, [
      h('div', { class: 'card-head' }, [h('span', { class: 'name', text: title })]),
      h('p', { class: 'sub', style: 'margin:0', text: blurb }),
      h('div', { class: 'tag-line', style: 'margin-top:10px', text: bits.join(' · ') || 'not played yet' })
    ]);
    return card;
  }

  /* ===================== shared quiz shell ===================== */
  // Renders a rapid-fire MC quiz from a question factory. Each question:
  //   { prompt, promptMono?, options[], answer, explain, mono? }
  function runQuiz(view, ctx, back, cfg) {
    var h = ctx.h;
    var state = { i: 0, n: 10, score: 0, streak: 0, qs: [], answered: false };

    view.innerHTML = '';
    view.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [
      h('button', { class: 'btn ghost', text: '← Greeks', onclick: back })
    ]));
    view.appendChild(h('h1', { text: 'Greeks · ' + cfg.title }));
    view.appendChild(h('p', { class: 'sub', text: cfg.blurb }));

    var setup = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    var cs = h('input', { class: 'q-input pairs-input', type: 'number', min: '5', max: '25', step: '1', value: '10' });
    setup.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: 'Questions' }), cs,
      h('button', { class: 'btn primary', text: '▶ Start', onclick: start })
    ]));
    view.appendChild(setup);

    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Q ' }), h('span', { id: 'gq-q', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Streak ' }), h('span', { id: 'gq-streak', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Score ' }), h('span', { id: 'gq-score', class: 'mono', text: '0' })])
    ]);
    view.appendChild(hud);
    var area = h('div');
    view.appendChild(area);

    function start() {
      state.n = Math.max(5, Math.min(25, parseInt(cs.value, 10) || 10));
      state.qs = []; var guard = 0;
      while (state.qs.length < state.n && guard < state.n * 12) { guard++; var q = cfg.make(); if (q) state.qs.push(q); }
      state.i = 0; state.score = 0; state.streak = 0;
      hud.style.display = 'flex';
      renderQ();
    }

    function renderQ() {
      var q = state.qs[state.i];
      state.answered = false;
      area.innerHTML = '';
      document.getElementById('gq-q').textContent = (state.i + 1) + '/' + state.qs.length;
      sync();
      var card = h('div', { class: 'muted-box' });
      card.appendChild(h('div', { class: 'q-prompt', text: q.promptText || q.prompt }));
      if (q.promptMono) card.appendChild(h('div', { class: 'greek-profile-prompt mono', text: q.promptMono }));
      var optWrap = h('div', { class: 'q-options' });
      q.options.forEach(function (opt, oi) {
        optWrap.appendChild(h('button', { class: 'q-opt' + (q.mono ? ' mono' : ''), text: opt, onclick: function () { answer(oi, optWrap, q); } }));
      });
      card.appendChild(optWrap);
      card.appendChild(h('div', { id: 'gq-fb', style: 'margin-top:10px' }));
      area.appendChild(card);
    }

    function answer(oi, optWrap, q) {
      if (state.answered) return;
      state.answered = true;
      var correct = oi === q.answer;
      Array.prototype.forEach.call(optWrap.children, function (b, idx) {
        b.disabled = true;
        if (idx === q.answer) b.classList.add('opt-correct');
        else if (idx === oi) b.classList.add('opt-wrong');
      });
      if (correct) { state.streak++; state.score += 10 + (state.streak - 1) * 2; } else { state.streak = 0; }
      sync();
      var fb = document.getElementById('gq-fb');
      fb.appendChild(h('div', { class: 'feedback ' + (correct ? 'ok' : 'no'), text: (correct ? '✓ ' : '✗ ') + q.explain }));
      var last = state.i === state.qs.length - 1;
      fb.appendChild(h('button', { class: 'btn primary', style: 'margin-top:8px', text: last ? 'Finish ▸' : 'Next ▸', onclick: function () {
        state.i++; if (state.i >= state.qs.length) finish(); else renderQ();
      } }));
    }

    function sync() {
      document.getElementById('gq-streak').textContent = state.streak;
      document.getElementById('gq-score').textContent = state.score;
    }

    function finish() {
      var rec = ctx.Store.record(cfg.storeKey, { score: state.score });
      area.innerHTML = '';
      var best = (rec.bestScore === state.score) ? ' 🏆 new best!' : '';
      area.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: 'Final score: ' + state.score + best }),
        h('p', { class: 'tag-line', text: 'Best: ' + (rec.bestScore || state.score) + ' · games played: ' + rec.plays }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Greeks', onclick: back }),
          h('button', { class: 'btn', text: '⌂ Home', onclick: ctx.home })
        ])
      ]));
      hud.style.display = 'none';
    }
  }

  /* ===================== game 1: Identify ===================== */
  function runIdentify(view, ctx, back) {
    var pool = ctx.strategies;
    function genWhichStrategy() {
      var g = pick(G().GREEKS), sign = pick(['long', 'short']);
      var m = pool.filter(function (s) { return s.greeks[g] === sign; });
      var nm = pool.filter(function (s) { return s.greeks[g] !== sign; });
      if (!m.length || nm.length < 3) return null;
      var c = pick(m), opts = shuffle([c].concat(sample(nm, 3)));
      return { prompt: 'Which strategy is net ' + sign + ' ' + G().GREEK_LABEL[g] + '?',
        options: opts.map(function (s) { return s.name; }), answer: opts.indexOf(c),
        explain: c.name + ' is net ' + sign + ' ' + G().GREEK_LABEL[g] + ' — ' + G().MEANING[g][sign] + '.' };
    }
    function genWhatSign() {
      var s = pick(pool), g = pick(G().GREEKS), L = G().SIGN_LABEL, opts = [L.long, L.short, L.neutral];
      return { prompt: 'What is the net ' + G().GREEK_LABEL[g] + ' of a ' + s.name + '?',
        options: opts, answer: opts.indexOf(L[s.greeks[g]]),
        explain: 'A ' + s.name + ' is net ' + L[s.greeks[g]] + ' ' + G().GREEK_LABEL[g] + ' — ' + G().MEANING[g][s.greeks[g]] + '.' };
    }
    function genProfileToStrategy() {
      var c = pick(pool), cp = profileStr(c), others = pool.filter(function (s) { return profileStr(s) !== cp; });
      if (others.length < 3) return null;
      var opts = shuffle([c].concat(sample(others, 3)));
      return { promptText: 'Which strategy has this net Greek profile?', promptMono: cp,
        options: opts.map(function (s) { return s.name; }), answer: opts.indexOf(c), explain: cp + ' is the profile of a ' + c.name + '.' };
    }
    function genStrategyToProfile() {
      var c = pick(pool), cp = profileStr(c), seen = {}, others = []; seen[cp] = true;
      shuffle(pool).forEach(function (s) { var p = profileStr(s); if (!seen[p]) { seen[p] = true; others.push(p); } });
      if (others.length < 3) return null;
      var opts = shuffle([cp].concat(others.slice(0, 3)));
      return { promptText: 'What is the net Greek profile of a ' + c.name + '?', options: opts, answer: opts.indexOf(cp), mono: true, explain: 'A ' + c.name + ': ' + cp + '.' };
    }
    var GENS = [genWhichStrategy, genWhatSign, genProfileToStrategy, genStrategyToProfile];
    runQuiz(view, ctx, back, {
      title: 'Identify', storeKey: 'greeks',
      blurb: 'Identify which strategy carries a Greek, and match strategies to their full Δ/Γ/Θ/V profile.',
      make: function () { return pick(GENS)(); }
    });
  }

  /* ================== game 2: Predict the P&L ================== */
  var SCENARIOS = [
    { text: 'the underlying RISES', greek: 'delta', invert: false },
    { text: 'the underlying FALLS', greek: 'delta', invert: true },
    { text: 'implied VOLATILITY RISES', greek: 'vega', invert: false },
    { text: 'implied VOLATILITY FALLS', greek: 'vega', invert: true },
    { text: 'a day passes with NO move (TIME decay)', greek: 'theta', invert: false },
    { text: 'the underlying makes a BIG move (either direction)', greek: 'gamma', invert: false }
  ];
  function flip(sign) { return sign === 'long' ? 'short' : (sign === 'short' ? 'long' : 'neutral'); }

  function runPredict(view, ctx, back) {
    var pool = ctx.strategies;
    var OPTS = ['Profit', 'Loss', 'Little change'];
    function make() {
      var s = pick(pool), sc = pick(SCENARIOS);
      var sign = s.greeks[sc.greek];
      var eff = sc.invert ? flip(sign) : sign;
      var outcome = eff === 'long' ? 'Profit' : (eff === 'short' ? 'Loss' : 'Little change');
      return {
        prompt: 'You hold a ' + s.name + '. If ' + sc.text + ', what happens to your P&L (all else equal)?',
        options: OPTS.slice(), answer: OPTS.indexOf(outcome),
        explain: 'A ' + s.name + ' is net ' + G().SIGN_LABEL[sign] + ' ' + G().GREEK_LABEL[sc.greek] +
                 ' (' + G().MEANING[sc.greek][sign] + ') → ' + outcome.toLowerCase() + '.'
      };
    }
    runQuiz(view, ctx, back, {
      title: 'Predict the P&L', storeKey: 'greeks-predict',
      blurb: 'A scenario hits — price moves, volatility shifts, or time passes. Decide whether the position profits, loses, or barely changes. The feedback names the Greek doing the work.',
      make: make
    });
  }

  global.App.registerMode({
    id: 'greeks', label: 'Greeks', minStrategies: 4,
    blurb: 'Two games: Identify net Greek profiles, and Predict the P&L when price / vol / time move.',
    init: init
  });
})(window);
