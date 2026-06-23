/* ============================================================
 * modes/match.js — Match (drag-to-pair) — the centerpiece
 * Configurable facets: match any two of {graph, name, legs, outlook}.
 * Drag a tile onto its partner (or click one then the other on touch);
 * correct pairs fade out. Timer + streak + score. Best time persists.
 * ============================================================ */
(function (global) {
  'use strict';

  var SPOT = 100;

  /* ---- facet definitions: how each side of a pair is shown + keyed ---- */
  var FACETS = {
    name: {
      label: 'Name',
      key: function (s) { return s.name; },
      render: function (s, h) { return h('div', { class: 'tile-name', text: s.name }); }
    },
    legs: {
      label: 'Legs',
      key: function (s) { return JSON.stringify(s.legs); },
      render: function (s, h) {
        return h('div', { class: 'tile-legs', html: s.legs.map(legStr).join('<br>') });
      }
    },
    outlook: {
      label: 'Outlook',
      key: function (s) { return [s.priceOutlook, s.volOutlook, s.profitPotential, s.risk].join('|'); },
      render: function (s, h) {
        return h('div', { class: 'tile-outlook' }, [
          h('div', { text: s.priceOutlook + ' · ' + s.volOutlook }),
          h('div', { class: 'dim', text: 'profit ' + s.profitPotential + ' · risk ' + s.risk })
        ]);
      }
    },
    graph: {
      label: 'Graph',
      key: function (s) {
        // sample the curve so visually-identical payoffs collide (and get deduped)
        var pf = s.timeBased ? global.Payoff.payoffAtNearExpiry : global.Payoff.payoffAt;
        var pts = [];
        for (var x = SPOT - 20; x <= SPOT + 20; x += 5) pts.push(Math.round(pf(s.legs, x)));
        return pts.join(',');
      },
      render: function (s, h) {
        var box = h('div', { class: 'tile-graph' });
        box.appendChild(global.Payoff.renderStrategy(s, { width: 200, height: 110, mini: true }));
        return box;
      }
    }
  };

  function legStr(leg) {
    var sign = leg.action === 'buy' ? '+' : '−';
    var cls = leg.action === 'buy' ? 'buy' : 'sell';
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return '<span class="' + cls + '">' + sign + qty + ' Stock</span>';
    var k = SPOT + (leg.strike || 0);
    var typ = leg.type === 'call' ? 'C' : 'P';
    var exp = leg.expiry === 'far' ? 'f' : '';
    return '<span class="' + cls + '">' + sign + qty + typ + k + exp + '</span>';
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Pick `count` strategies whose values are UNIQUE on both facets,
     so every tile has exactly one correct partner. */
  function pickRound(pool, fa, fb, count) {
    var seenA = {}, seenB = {}, chosen = [];
    shuffle(pool).forEach(function (s) {
      if (chosen.length >= count) return;
      var ka = FACETS[fa].key(s), kb = FACETS[fb].key(s);
      if (seenA[ka] || seenB[kb]) return;
      seenA[ka] = seenB[kb] = true;
      chosen.push(s);
    });
    return chosen;
  }

  function init(view, ctx) {
    var h = ctx.h;
    var pool = ctx.strategies;
    var state = { fa: 'graph', fb: 'name', count: Math.min(6, pool.length),
                  startMs: 0, timer: null, score: 0, streak: 0, matched: 0, selected: null, running: false };

    view.appendChild(h('h1', { text: 'Match' }));
    view.appendChild(h('p', { class: 'sub', text: 'Drag a tile onto its partner — or tap one then the other. Match the two facets you choose. Correct pairs disappear; build a streak and beat your best time.' }));

    /* ---- setup bar ---- */
    var bar = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    var row = h('div', { class: 'row toolbar' });

    function facetSelect(which) {
      var sel = h('select', { class: 'btn ghost' });
      Object.keys(FACETS).forEach(function (f) {
        sel.appendChild(h('option', { value: f, text: FACETS[f].label }));
      });
      sel.value = state[which];
      sel.addEventListener('change', function () {
        state[which] = sel.value;
        // never match a facet against itself
        if (state.fa === state.fb) {
          var other = which === 'fa' ? 'fb' : 'fa';
          var alt = Object.keys(FACETS).filter(function (f) { return f !== sel.value; })[0];
          state[other] = alt;
        }
        renderControls();
      });
      return sel;
    }

    var maxPairs = Math.min(20, pool.length);
    if (state.count > maxPairs) state.count = maxPairs;

    var faWrap = h('span', { class: 'ctl' }), fbWrap = h('span', { class: 'ctl' }), countWrap = h('span', { class: 'ctl' });
    function renderControls() {
      faWrap.innerHTML = ''; fbWrap.innerHTML = ''; countWrap.innerHTML = '';
      faWrap.appendChild(facetSelect('fa'));
      fbWrap.appendChild(facetSelect('fb'));
      var ci = h('input', { class: 'q-input pairs-input', type: 'number', min: '1', max: String(maxPairs), step: '1' });
      ci.value = state.count;
      function clampCount() {
        var n = parseInt(ci.value, 10);
        if (isNaN(n)) n = state.count;
        n = Math.max(1, Math.min(maxPairs, n));
        state.count = n; ci.value = n;
      }
      ci.addEventListener('change', clampCount);
      ci.addEventListener('blur', clampCount);
      countWrap.appendChild(ci);
      countWrap.appendChild(h('span', { class: 'tag-line', text: ' pairs (1–' + maxPairs + ')' }));
    }
    renderControls();

    row.appendChild(h('span', { class: 'tag-line', text: 'Match' }));
    row.appendChild(faWrap);
    row.appendChild(h('span', { class: 'tag-line', text: '↔' }));
    row.appendChild(fbWrap);
    row.appendChild(countWrap);
    row.appendChild(h('button', { class: 'btn primary', text: '▶ Start round', onclick: start }));
    bar.appendChild(row);
    view.appendChild(bar);

    /* ---- HUD ---- */
    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Time ' }), h('span', { id: 'm-time', class: 'mono', text: '0.0s' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Streak ' }), h('span', { id: 'm-streak', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Score ' }), h('span', { id: 'm-score', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Pairs left ' }), h('span', { id: 'm-left', class: 'mono', text: '0' })]),
      h('span', { style: 'flex:1' }),
      h('button', { id: 'm-pause', class: 'btn ghost', text: '⏸ Pause', onclick: togglePause }),
      h('button', { class: 'btn ghost', text: '↻ Reset', onclick: function () { if (state.total) start(); } })
    ]);
    view.appendChild(hud);

    var pausedMsg = h('div', { class: 'paused-msg', style: 'display:none' }, '⏸ Paused — board hidden. Press Resume to continue.');
    view.appendChild(pausedMsg);

    var board = h('div', { class: 'match-board' });
    view.appendChild(board);
    var summary = h('div');
    view.appendChild(summary);

    function elapsedMs() { return state.elapsed + (state.paused ? 0 : Date.now() - state.lastResume); }

    function togglePause() {
      if (!state.running) return;
      var btn = document.getElementById('m-pause');
      if (!state.paused) {
        state.paused = true;
        state.elapsed += Date.now() - state.lastResume;
        btn.textContent = '▶ Resume';
        board.classList.add('paused');
        pausedMsg.style.display = '';
      } else {
        state.paused = false;
        state.lastResume = Date.now();
        btn.textContent = '⏸ Pause';
        board.classList.remove('paused');
        pausedMsg.style.display = 'none';
      }
    }

    /* ---- round lifecycle ---- */
    function start() {
      summary.innerHTML = '';
      if (state.fa === state.fb) { state.fb = state.fa === 'name' ? 'graph' : 'name'; renderControls(); }
      var chosen = pickRound(pool, state.fa, state.fb, state.count);
      if (chosen.length < 2) { board.innerHTML = '<p class="sub">Not enough distinct strategies for this facet pairing. Widen your session scope.</p>'; return; }

      state.score = 0; state.streak = 0; state.matched = 0; state.selected = null;
      state.total = chosen.length; state.running = true;
      state.paused = false; state.elapsed = 0; state.lastResume = Date.now();
      hud.style.display = 'flex';
      document.getElementById('m-pause').textContent = '⏸ Pause';
      board.classList.remove('paused');
      pausedMsg.style.display = 'none';
      board.innerHTML = '';

      var tiles = [];
      chosen.forEach(function (s) {
        tiles.push(makeTile(s, state.fa));
        tiles.push(makeTile(s, state.fb));
      });
      shuffle(tiles).forEach(function (t) { board.appendChild(t); });
      updateHud();

      if (state.timer) clearInterval(state.timer);
      state.timer = setInterval(function () {
        if (!state.paused) document.getElementById('m-time').textContent = (elapsedMs() / 1000).toFixed(1) + 's';
      }, 100);
    }

    function makeTile(s, facet) {
      var tile = h('div', { class: 'tile facet-' + facet, draggable: 'true' });
      tile._sid = s.id; tile._facet = facet;
      tile.appendChild(FACETS[facet].render(s, h));

      // click / tap to select-then-match
      tile.addEventListener('click', function () { onPick(tile); });

      // HTML5 drag
      tile.addEventListener('dragstart', function (e) {
        tile.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', s.id + '|' + facet); } catch (err) {}
      });
      tile.addEventListener('dragend', function () { tile.classList.remove('dragging'); });
      tile.addEventListener('dragover', function (e) { e.preventDefault(); tile.classList.add('drop-hover'); });
      tile.addEventListener('dragleave', function () { tile.classList.remove('drop-hover'); });
      tile.addEventListener('drop', function (e) {
        e.preventDefault();
        tile.classList.remove('drop-hover');
        var dragged = board.querySelector('.dragging');
        if (dragged && dragged !== tile) attempt(dragged, tile);
      });
      return tile;
    }

    function onPick(tile) {
      if (!state.running || state.paused || tile.classList.contains('matched')) return;
      if (!state.selected) { state.selected = tile; tile.classList.add('selected'); return; }
      if (state.selected === tile) { tile.classList.remove('selected'); state.selected = null; return; }
      var first = state.selected;
      first.classList.remove('selected');
      state.selected = null;
      attempt(first, tile);
    }

    function attempt(a, b) {
      if (state.paused) return;
      if (a._sid === b._sid && a._facet !== b._facet) {
        // correct
        state.matched++;
        state.streak++;
        state.score += 10 + (state.streak - 1) * 2; // streak bonus
        [a, b].forEach(function (t) {
          t.classList.remove('selected');
          t.classList.add('matched');
          setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
        });
        updateHud();
        if (state.matched === state.total) finish();
      } else {
        // wrong
        state.streak = 0;
        state.score = Math.max(0, state.score - 2);
        [a, b].forEach(function (t) {
          t.classList.add('wrong');
          setTimeout(function () { t.classList.remove('wrong'); }, 380);
        });
        updateHud();
      }
    }

    function updateHud() {
      document.getElementById('m-streak').textContent = state.streak;
      document.getElementById('m-score').textContent = state.score;
      document.getElementById('m-left').textContent = (state.total - state.matched);
    }

    function finish() {
      state.running = false;
      var ms = elapsedMs();
      clearInterval(state.timer);
      document.getElementById('m-time').textContent = (ms / 1000).toFixed(1) + 's';
      // Speed bonus (a medium driver): par is 5s per pair; earn +2 points for every
      // second you finish under par, never negative. Folded into the score.
      var parSec = 5 * state.total;
      var speedBonus = Math.max(0, Math.round((parSec - ms / 1000) * 2));
      state.score += speedBonus;
      document.getElementById('m-score').textContent = state.score;
      var rec = ctx.Store.record('match', { score: state.score, total: state.total, timeMs: ms });
      var best = (rec.bestTimeMs === ms) ? ' 🏆 new best time!' : '';
      summary.innerHTML = '';
      summary.appendChild(h('div', { class: 'muted-box', style: 'margin-top:16px' }, [
        h('h2', { text: 'Round complete' + best }),
        h('p', { class: 'mono', text: 'Time ' + (ms / 1000).toFixed(1) + 's  ·  Score ' + state.score + ' (incl. +' + speedBonus + ' speed)' +
          '  ·  Best time ' + ctx.Store.fmtTime(rec.bestTimeMs) + '  ·  Best score ' + (rec.bestScore || 0) }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Home', onclick: ctx.home })
        ])
      ]));
    }
  }

  global.App.registerMode({
    id: 'match', label: 'Match', minStrategies: 2,
    blurb: 'Drag-to-pair tiles. Match graphs, names, legs, or outlooks against each other. Beat the clock.',
    init: init
  });
})(window);
