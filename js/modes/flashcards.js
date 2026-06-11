/* ============================================================
 * modes/flashcards.js — Flashcards / reference surface
 * Name on the front; graph + outlook + legs + net Greeks + the
 * "why" blurb on the back. Self-paced. This is where the
 * explanations live (Test/Match are score-only by design).
 * ============================================================ */
(function (global) {
  'use strict';

  var SPOT = 100;

  function legStr(leg) {
    var sign = leg.action === 'buy' ? '+' : '−';
    var cls = leg.action === 'buy' ? 'buy' : 'sell';
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return '<span class="' + cls + '">' + sign + qty + ' Stock @ $' + SPOT + '</span>';
    var k = SPOT + (leg.strike || 0);
    var typ = leg.type === 'call' ? 'Call' : 'Put';
    var exp = leg.expiry === 'far' ? ' (far)' : '';
    return '<span class="' + cls + '">' + sign + qty + ' ' + typ + ' $' + k + exp + '</span>';
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function init(view, ctx) {
    var h = ctx.h;
    var G = global.Greeks;
    var deck = ctx.strategies.slice();
    var order = deck.map(function (_, i) { return i; });
    var idx = 0, flipped = false, defFirst = false;

    view.appendChild(h('h1', { text: 'Flashcards' }));
    view.appendChild(h('p', { class: 'sub', text: 'Self-paced reference. Start from the name or the definition, then flip to reveal the other. Click the card (or press Space) to flip; arrow keys to move.' }));

    var startBtn;
    var controls = h('div', { class: 'row', style: 'margin-bottom:14px' }, [
      h('button', { class: 'btn', text: '⤺ Shuffle', onclick: function () { order = shuffle(order); idx = 0; flipped = false; render(); } }),
      (startBtn = h('button', { class: 'btn', text: 'Start with: Name', onclick: function () {
        defFirst = !defFirst; flipped = false;
        startBtn.textContent = 'Start with: ' + (defFirst ? 'Definition' : 'Name');
        render();
      } })),
      h('span', { class: 'spacer', style: 'flex:1' }),
      h('span', { id: 'fc-progress', class: 'tag-line' })
    ]);
    view.appendChild(controls);

    var stage = h('div', { class: 'fc-stage' });
    view.appendChild(stage);

    var nav = h('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, [
      h('button', { class: 'btn', text: '← Prev', onclick: prev }),
      h('button', { class: 'btn primary', text: 'Flip', onclick: flip }),
      h('button', { class: 'btn', text: 'Next →', onclick: next })
    ]);
    view.appendChild(nav);

    function cur() { return deck[order[idx]]; }
    function prev() { idx = (idx - 1 + deck.length) % deck.length; flipped = false; render(); }
    function next() { idx = (idx + 1) % deck.length; flipped = false; render(); }
    function flip() { flipped = !flipped; render(); }

    function render() {
      var s = cur();
      document.getElementById('fc-progress').textContent = (idx + 1) + ' / ' + deck.length;
      stage.innerHTML = '';

      var card = h('div', { class: 'flashcard' + (flipped ? ' flipped' : ''), onclick: flip });
      var tierCls = s.tier === 'Beginner' ? 'beginner' : (s.tier === 'Intermediate' ? 'intermediate' : 'advanced-tier');

      // NAME content
      var nameContent = h('div', { class: 'fc-name-content' }, [
        h('div', { class: 'tags', style: 'justify-content:center' }, [
          h('span', { class: 'pill ' + s.category, text: s.category }),
          h('span', { class: 'pill ' + tierCls, text: s.tier })
        ]),
        h('div', { class: 'fc-bigname', text: s.name }),
        h('div', { class: 'tag-line', text: 'click to flip' })
      ]);

      // DETAIL content
      var detailContent = h('div', { class: 'fc-detail-content' });
      var grid = h('div', { class: 'fc-back-grid' });

      var left = h('div');
      left.appendChild(global.Payoff.renderStrategy(s, { width: 360, height: 200 }));
      var metrics = h('div', { class: 'metrics', style: 'margin-top:8px' });
      metrics.innerHTML = global.Payoff.metricsTableHTML(s.legs);
      left.appendChild(metrics);

      var right = h('div');
      right.appendChild(h('div', { class: 'fc-name-sm', text: s.name }));
      right.appendChild(h('div', { class: 'tags' }, [
        h('span', { class: 'pill', text: s.priceOutlook }),
        h('span', { class: 'pill', text: s.volOutlook }),
        h('span', { class: 'pill', text: 'profit ' + s.profitPotential }),
        h('span', { class: 'pill', text: 'risk ' + s.risk })
      ]));
      right.appendChild(h('div', { class: 'fc-section-label', text: 'Legs' }));
      right.appendChild(h('div', { class: 'legs', html: s.legs.map(legStr).join('<br>') }));

      right.appendChild(h('div', { class: 'fc-section-label', text: 'Net Greeks' }));
      var gwrap = h('div', { class: 'fc-greeks' });
      G.GREEKS.forEach(function (gk) {
        var sign = s.greeks[gk];
        gwrap.appendChild(h('div', { class: 'fc-greek' }, [
          h('span', { class: 'fc-greek-name', text: G.GREEK_LABEL[gk] }),
          h('span', { class: 'fc-greek-sign sign-' + sign, text: G.SIGN_LABEL[sign] }),
          h('span', { class: 'fc-greek-mean dim', text: G.MEANING[gk][sign] })
        ]));
      });
      right.appendChild(gwrap);

      right.appendChild(h('div', { class: 'fc-section-label', text: 'Why' }));
      right.appendChild(h('p', { class: 'fc-why', text: s.blurb }));

      grid.appendChild(left);
      grid.appendChild(right);
      detailContent.appendChild(grid);

      // Assign content to faces: name-first (default) or definition-first.
      var frontInner = defFirst ? detailContent : nameContent;
      var backInner = defFirst ? nameContent : detailContent;
      card.appendChild(h('div', { class: 'fc-face fc-front' }, [frontInner]));
      card.appendChild(h('div', { class: 'fc-face fc-back' }, [backInner]));
      stage.appendChild(card);
    }

    // keyboard — scoped so it detaches when leaving the mode
    function onKey(e) {
      if (!document.body.contains(stage)) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);

    render();
  }

  global.App.registerMode({
    id: 'flashcards', label: 'Flashcards', minStrategies: 1,
    blurb: 'Flip cards: name on one side; graph, outlook, legs and the "why" on the other. The reference surface.',
    init: init
  });
})(window);
