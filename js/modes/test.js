/* ============================================================
 * modes/test.js — Test mode (mixed question types)
 *   - multiple choice
 *   - type-the-answer (normalized, synonym/abbreviation aware)
 *   - select-all-that-apply
 * Score-only: graded at the end, no per-answer explanations
 * (the "why" lives in Flashcards). Best score persists.
 * ============================================================ */
(function (global) {
  'use strict';

  var SPOT = 100;
  var OUTLOOKS = ['bullish', 'bearish', 'neutral', 'agnostic'];
  var VOLS = ['long vol', 'short vol', 'neutral'];

  function legStrHtml(leg) {
    var sign = leg.action === 'buy' ? '+' : '−';
    var cls = leg.action === 'buy' ? 'buy' : 'sell';
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return '<span class="' + cls + '">' + sign + qty + ' Stock @ $' + SPOT + '</span>';
    var k = SPOT + (leg.strike || 0);
    var typ = leg.type === 'call' ? 'Call' : 'Put';
    var exp = leg.expiry === 'far' ? ' (far)' : '';
    return '<span class="' + cls + '">' + sign + qty + ' ' + typ + ' $' + k + exp + '</span>';
  }

  function norm(str) { return String(str).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---- distractor names: n wrong names different from the answer ---- */
  function otherNames(pool, answer, n) {
    return sample(pool.filter(function (s) { return s.id !== answer.id; }), n).map(function (s) { return s.name; });
  }

  /* ---- question generators (each returns a question object or null) ---- */
  function mc(prompt, node, correctLabel, distractors, explain) {
    var opts = shuffle([correctLabel].concat(distractors));
    return { kind: 'mc', prompt: prompt, node: node, options: opts, answer: opts.indexOf(correctLabel), correctLabel: correctLabel, explain: explain };
  }

  function genGraphToName(pool) {
    var s = pick(pool);
    return mc('Which strategy produces this payoff at expiration?',
      function () { return global.Payoff.renderStrategy(s, { width: 420, height: 220 }); },
      s.name, otherNames(pool, s, 3), s.blurb);
  }
  function genLegsToName(pool) {
    var s = pick(pool);
    return mc('Which strategy is built from these legs?',
      function () { return legsNode(s); }, s.name, otherNames(pool, s, 3),
      s.name + ': ' + s.blurb);
  }
  function genNameToOutlook(pool) {
    var s = pick(pool);
    var distract = shuffle(OUTLOOKS.filter(function (o) { return o !== s.priceOutlook; })).slice(0, 3);
    return mc('What is the price outlook of a ' + s.name + '?', null, s.priceOutlook, distract,
      'A ' + s.name + ' is ' + s.priceOutlook + ' on price. ' + s.blurb);
  }
  function genNameToVol(pool) {
    var s = pick(pool);
    var distract = VOLS.filter(function (o) { return o !== s.volOutlook; });
    return mc('What is the volatility outlook of a ' + s.name + '?', null, s.volOutlook, distract,
      'A ' + s.name + ' is ' + s.volOutlook + ' (net ' + s.greeks.vega + ' vega). ' + s.blurb);
  }
  function genTypeFromGraph(pool) {
    var s = pick(pool);
    return { kind: 'type', prompt: 'Name this strategy from its payoff graph:',
      node: function () { return global.Payoff.renderSVG(s.legs, { width: 420, height: 220 }); },
      accept: [norm(s.name)].concat((s.aka || []).map(norm)), displayAnswer: s.name, explain: s.blurb };
  }
  function genTypeFromLegs(pool) {
    var s = pick(pool);
    return { kind: 'type', prompt: 'Name this strategy from its legs:',
      node: function () { return legsNode(s); },
      accept: [norm(s.name)].concat((s.aka || []).map(norm)), displayAnswer: s.name, explain: s.blurb };
  }

  function genSelectAllGreek(pool) {
    var g = pick(global.Greeks.GREEKS);
    var sign = pick(['long', 'short']);
    var items = sample(pool, Math.min(6, pool.length));
    var correctCount = items.filter(function (s) { return s.greeks[g] === sign; }).length;
    if (correctCount === 0 || correctCount === items.length) return null; // degenerate
    return {
      kind: 'sall',
      prompt: 'Select ALL strategies that are net ' + sign + ' ' + global.Greeks.GREEK_LABEL[g] + ':',
      options: items.map(function (s) { return { label: s.name, correct: s.greeks[g] === sign }; }),
      explain: 'Net ' + sign + ' ' + global.Greeks.GREEK_LABEL[g] + ' means ' + global.Greeks.MEANING[g][sign] + '.'
    };
  }
  function genSelectAllAttr(pool) {
    var defs = [
      { p: 'have UNDEFINED (unlimited) risk', f: function (s) { return s.risk === 'undefined'; },
        why: 'Undefined-risk strategies have at least one naked short option, so loss is not capped.' },
      { p: 'have UNLIMITED profit potential', f: function (s) { return s.profitPotential === 'unlimited'; },
        why: 'Unlimited profit comes from a net long call or long stock exposure that keeps gaining as price rises.' },
      { p: 'are BULLISH on price', f: function (s) { return s.priceOutlook === 'bullish'; },
        why: 'Bullish strategies profit primarily when the underlying rises.' },
      { p: 'are NEUTRAL on price', f: function (s) { return s.priceOutlook === 'neutral'; },
        why: 'Neutral strategies profit when the underlying stays in a range.' },
      { p: 'are LONG volatility (long vega)', f: function (s) { return s.volOutlook === 'long vol'; },
        why: 'Long-vol strategies are net long options, so they gain when implied volatility rises.' }
    ];
    var d = pick(defs);
    var items = sample(pool, Math.min(6, pool.length));
    var correctCount = items.filter(d.f).length;
    if (correctCount === 0 || correctCount === items.length) return null;
    return {
      kind: 'sall',
      prompt: 'Select ALL strategies that ' + d.p + ':',
      options: items.map(function (s) { return { label: s.name, correct: d.f(s) }; }),
      explain: d.why
    };
  }

  function legsNode(s) {
    var d = document.createElement('div');
    d.className = 'legs q-legs';
    d.innerHTML = s.legs.map(legStrHtml).join('<br>');
    return d;
  }

  var GENERATORS = [genGraphToName, genLegsToName, genNameToOutlook, genNameToVol,
                    genTypeFromGraph, genTypeFromLegs, genSelectAllGreek, genSelectAllAttr];

  function buildQuestions(pool, n) {
    var qs = [];
    var guard = 0;
    while (qs.length < n && guard < n * 12) {
      guard++;
      var gen = pick(GENERATORS);
      // select-all generators need a few strategies
      if ((gen === genSelectAllGreek || gen === genSelectAllAttr) && pool.length < 4) continue;
      var q = gen(pool);
      if (q) qs.push(q);
    }
    return qs;
  }

  /* ---- mode ---- */
  function init(view, ctx) {
    var h = ctx.h;
    var pool = ctx.strategies;
    var state = { qs: [], i: 0, answers: [], count: 10 };

    view.appendChild(h('h1', { text: 'Test' }));
    view.appendChild(h('p', { class: 'sub', text: 'Mixed questions drawn from your active strategies: multiple choice, type-the-answer, and select-all-that-apply. Graded at the end, with the correct answer and a short "why" for each.' }));

    var setup = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    var cs = h('select', { class: 'btn ghost' });
    [5, 10, 15, 20].forEach(function (n) { cs.appendChild(h('option', { value: n, text: n + ' questions' })); });
    cs.value = state.count;
    cs.addEventListener('change', function () { state.count = +cs.value; });
    setup.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: 'Length' }), cs,
      h('button', { class: 'btn primary', text: '▶ Start test', onclick: start })
    ]));
    view.appendChild(setup);

    var area = h('div');
    view.appendChild(area);

    function start() {
      state.qs = buildQuestions(pool, state.count);
      state.i = 0; state.answers = [];
      renderQuestion();
    }

    function renderQuestion() {
      var q = state.qs[state.i];
      area.innerHTML = '';

      var head = h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, [
        h('span', { class: 'tag-line', text: 'Question ' + (state.i + 1) + ' of ' + state.qs.length }),
        h('span', { class: 'tag-line', text: qkindLabel(q.kind) })
      ]);
      area.appendChild(head);
      var bar = h('div', { class: 'progress' }, [ h('div', { class: 'progress-fill', style: 'width:' + (state.i / state.qs.length * 100) + '%' }) ]);
      area.appendChild(bar);

      var card = h('div', { class: 'muted-box', style: 'margin-top:14px' });
      card.appendChild(h('div', { class: 'q-prompt', text: q.prompt }));
      if (q.node) card.appendChild(h('div', { class: 'q-node' }, [q.node()]));

      var chosen = { mc: null, type: '', sall: {} };

      if (q.kind === 'mc') {
        var optWrap = h('div', { class: 'q-options' });
        q.options.forEach(function (opt, oi) {
          var b = h('button', { class: 'q-opt', text: opt, onclick: function () {
            chosen.mc = oi;
            Array.prototype.forEach.call(optWrap.children, function (c) { c.classList.remove('chosen'); });
            b.classList.add('chosen');
          } });
          optWrap.appendChild(b);
        });
        card.appendChild(optWrap);

      } else if (q.kind === 'type') {
        var inp = h('input', { class: 'q-input', type: 'text', placeholder: 'Type the strategy name…', autocomplete: 'off' });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
        card.appendChild(inp);
        card.appendChild(h('div', { class: 'tag-line', text: 'Synonyms & abbreviations accepted (e.g. "IC", "ironfly", "long call spread").' }));
        chosen._inp = inp;

      } else if (q.kind === 'sall') {
        var sw = h('div', { class: 'q-options' });
        q.options.forEach(function (opt, oi) {
          var b = h('button', { class: 'q-opt', text: opt.label, onclick: function () {
            chosen.sall[oi] = !chosen.sall[oi];
            b.classList.toggle('chosen', !!chosen.sall[oi]);
          } });
          sw.appendChild(b);
        });
        card.appendChild(sw);
        card.appendChild(h('div', { class: 'tag-line', text: 'Select every strategy that applies, then submit.' }));
      }

      var submitBtn = h('button', { class: 'btn primary', style: 'margin-top:14px', text: state.i === state.qs.length - 1 ? 'Finish ▸' : 'Submit ▸', onclick: submit });
      card.appendChild(submitBtn);
      area.appendChild(card);

      function submit() {
        var correct = grade(q, chosen);
        state.answers.push({ q: q, correct: correct });
        state.i++;
        if (state.i >= state.qs.length) finish();
        else renderQuestion();
      }
    }

    function grade(q, chosen) {
      if (q.kind === 'mc') return chosen.mc === q.answer;
      if (q.kind === 'type') return q.accept.indexOf(norm(chosen._inp.value)) >= 0;
      if (q.kind === 'sall') {
        for (var i = 0; i < q.options.length; i++) {
          if (!!chosen.sall[i] !== !!q.options[i].correct) return false;
        }
        return true;
      }
      return false;
    }

    function finish() {
      var score = state.answers.filter(function (a) { return a.correct; }).length;
      var total = state.answers.length;
      var rec = ctx.Store.record('test', { score: score, total: total });
      area.innerHTML = '';
      var pct = Math.round(score / total * 100);
      area.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: 'Score: ' + score + ' / ' + total + '  (' + pct + '%)' }),
        h('p', { class: 'tag-line', text: 'Best score this machine: ' + (rec.bestScore || score) + ' · tests taken: ' + rec.plays }),
        review(),
        h('div', { class: 'row', style: 'margin-top:8px' }, [
          h('button', { class: 'btn primary', text: '▶ New test', onclick: start }),
          h('button', { class: 'btn', text: '← Home', onclick: ctx.home })
        ])
      ]));
    }

    function review() {
      var wrap = h('div', { style: 'margin:12px 0' });
      wrap.appendChild(h('div', { class: 'fc-section-label', text: 'Review — correct answer and why' }));
      state.answers.forEach(function (a, i) {
        var ans = a.q.kind === 'mc' ? a.q.correctLabel
                : a.q.kind === 'type' ? a.q.displayAnswer
                : a.q.options.filter(function (o) { return o.correct; }).map(function (o) { return o.label; }).join(', ') || '(none)';
        wrap.appendChild(h('div', { class: 'review-row' }, [
          h('span', { class: a.correct ? 'profit' : 'loss', text: a.correct ? '✓' : '✗' }),
          h('span', { class: 'review-q', text: (i + 1) + '. ' + a.q.prompt }),
          h('span', { class: 'review-a dim', text: ans })
        ]));
        if (a.q.explain) {
          wrap.appendChild(h('div', { class: 'review-why', text: a.q.explain }));
        }
      });
      return wrap;
    }

    function qkindLabel(k) {
      return k === 'mc' ? 'multiple choice' : k === 'type' ? 'type the answer' : 'select all that apply';
    }
  }

  global.App.registerMode({
    id: 'test', label: 'Test', minStrategies: 4,
    blurb: 'Mixed questions: multiple choice, type-the-answer, and select-all-that-apply.',
    init: init
  });
})(window);
