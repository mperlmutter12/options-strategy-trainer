/* ============================================================
 * modes/memory.js — Memory Match (concentration)
 * A grid of face-down tiles. Flip two; if they're the two facets
 * of the same strategy (e.g. graph + name) they stay revealed,
 * otherwise they flip back. Clear the board in the fewest moves
 * and fastest time. Best time + score persist.
 * ============================================================ */
(function (global) {
  'use strict';

  var SPOT = 100;

  var FACETS = {
    name: { label: 'Name', key: function (s) { return s.name; },
      render: function (s, h) { return h('div', { class: 'tile-name', text: s.name }); } },
    legs: { label: 'Legs', key: function (s) { return JSON.stringify(s.legs); },
      render: function (s, h) { return h('div', { class: 'tile-legs', html: s.legs.map(legStr).join('<br>') }); } },
    outlook: { label: 'Outlook', key: function (s) { return [s.priceOutlook, s.volOutlook, s.profitPotential, s.risk].join('|'); },
      render: function (s, h) { return h('div', { class: 'tile-outlook' }, [
        h('div', { text: s.priceOutlook + ' · ' + s.volOutlook }),
        h('div', { class: 'dim', text: 'profit ' + s.profitPotential + ' · risk ' + s.risk })]); } },
    graph: { label: 'Graph',
      key: function (s) { var pf = s.timeBased ? global.Payoff.payoffAtNearExpiry : global.Payoff.payoffAt; var p = []; for (var x = SPOT - 20; x <= SPOT + 20; x += 5) p.push(Math.round(pf(s.legs, x))); return p.join(','); },
      render: function (s, h) { var b = h('div', { class: 'tile-graph' }); b.appendChild(global.Payoff.renderStrategy(s, { width: 200, height: 110, mini: true })); return b; } }
  };

  function legStr(leg) {
    var sign = leg.action === 'buy' ? '+' : '−';
    var cls = leg.action === 'buy' ? 'buy' : 'sell';
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return '<span class="' + cls + '">' + sign + qty + ' Stock</span>';
    var k = SPOT + (leg.strike || 0);
    return '<span class="' + cls + '">' + sign + qty + (leg.type === 'call' ? 'C' : 'P') + k + '</span>';
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function pickRound(pool, fa, fb, count) {
    var seenA = {}, seenB = {}, chosen = [];
    shuffle(pool).forEach(function (s) {
      if (chosen.length >= count) return;
      var ka = FACETS[fa].key(s), kb = FACETS[fb].key(s);
      if (seenA[ka] || seenB[kb]) return;
      seenA[ka] = seenB[kb] = true; chosen.push(s);
    });
    return chosen;
  }

  function init(view, ctx) {
    var h = ctx.h;
    var pool = ctx.strategies;
    var state = { fa: 'graph', fb: 'name', count: Math.min(6, pool.length),
                  first: null, lock: false, moves: 0, miss: 0, matched: 0, total: 0, startMs: 0, timer: null, running: false };

    view.appendChild(h('h1', { text: 'Memory Match' }));
    view.appendChild(h('p', { class: 'sub', text: 'Concentration: all tiles start face-down. Flip two to find a matching pair (the two facets of the same strategy). Matches stay up; misses flip back. Clear the board in the fewest moves and fastest time.' }));

    var bar = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    var faWrap = h('span', { class: 'ctl' }), fbWrap = h('span', { class: 'ctl' }), countWrap = h('span', { class: 'ctl' });
    var maxPairs = Math.min(10, pool.length);
    if (state.count > maxPairs) state.count = maxPairs;

    function facetSelect(which) {
      var sel = h('select', { class: 'btn ghost' });
      Object.keys(FACETS).forEach(function (f) { sel.appendChild(h('option', { value: f, text: FACETS[f].label })); });
      sel.value = state[which];
      sel.addEventListener('change', function () {
        state[which] = sel.value;
        if (state.fa === state.fb) { var other = which === 'fa' ? 'fb' : 'fa'; state[other] = Object.keys(FACETS).filter(function (f) { return f !== sel.value; })[0]; }
        renderControls();
      });
      return sel;
    }
    function renderControls() {
      faWrap.innerHTML = ''; fbWrap.innerHTML = ''; countWrap.innerHTML = '';
      faWrap.appendChild(facetSelect('fa'));
      fbWrap.appendChild(facetSelect('fb'));
      var ci = h('input', { class: 'q-input pairs-input', type: 'number', min: '2', max: String(maxPairs), step: '1' });
      ci.value = state.count;
      function clamp() { var n = parseInt(ci.value, 10); if (isNaN(n)) n = state.count; n = Math.max(2, Math.min(maxPairs, n)); state.count = n; ci.value = n; }
      ci.addEventListener('change', clamp); ci.addEventListener('blur', clamp);
      countWrap.appendChild(ci);
      countWrap.appendChild(h('span', { class: 'tag-line', text: ' pairs (2–' + maxPairs + ')' }));
    }
    renderControls();

    bar.appendChild(h('div', { class: 'row toolbar' }, [
      h('span', { class: 'tag-line', text: 'Match' }), faWrap,
      h('span', { class: 'tag-line', text: '↔' }), fbWrap, countWrap,
      h('button', { class: 'btn primary', text: '▶ New board', onclick: start })
    ]));
    view.appendChild(bar);

    var hud = h('div', { class: 'row hud', style: 'margin-bottom:12px;display:none' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Time ' }), h('span', { id: 'mm-time', class: 'mono', text: '0.0s' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Moves ' }), h('span', { id: 'mm-moves', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Pairs left ' }), h('span', { id: 'mm-left', class: 'mono', text: '0' })]),
      h('span', { style: 'flex:1' }),
      h('button', { id: 'mm-pause', class: 'btn ghost', text: '⏸ Pause', onclick: togglePause }),
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
      var btn = document.getElementById('mm-pause');
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

    function start() {
      summary.innerHTML = '';
      if (state.fa === state.fb) { state.fb = state.fa === 'name' ? 'graph' : 'name'; renderControls(); }
      var chosen = pickRound(pool, state.fa, state.fb, state.count);
      if (chosen.length < 2) { board.innerHTML = '<p class="sub">Not enough distinct strategies for this pairing. Widen your scope.</p>'; return; }

      state.first = null; state.lock = false; state.moves = 0; state.miss = 0; state.matched = 0;
      state.total = chosen.length; state.running = true;
      state.paused = false; state.elapsed = 0; state.lastResume = Date.now();
      hud.style.display = 'flex';
      document.getElementById('mm-pause').textContent = '⏸ Pause';
      board.classList.remove('paused');
      pausedMsg.style.display = 'none';
      board.innerHTML = '';

      var tiles = [];
      chosen.forEach(function (s) { tiles.push(makeTile(s, state.fa)); tiles.push(makeTile(s, state.fb)); });
      shuffle(tiles).forEach(function (t) { board.appendChild(t); });
      updateHud();

      if (state.timer) clearInterval(state.timer);
      state.timer = setInterval(function () { if (!state.paused) document.getElementById('mm-time').textContent = (elapsedMs() / 1000).toFixed(1) + 's'; }, 100);
    }

    function makeTile(s, facet) {
      var inner = h('div', { class: 'mem-inner' }, [FACETS[facet].render(s, h)]);
      var tile = h('div', { class: 'tile mem-tile facet-' + facet + ' down' }, [
        h('div', { class: 'mem-back', text: '?' }), inner
      ]);
      tile._sid = s.id; tile._facet = facet; tile._matched = false;
      tile.addEventListener('click', function () { flip(tile); });
      return tile;
    }

    function flip(tile) {
      if (!state.running || state.paused || state.lock || tile._matched || !tile.classList.contains('down')) return;
      tile.classList.remove('down');
      if (!state.first) { state.first = tile; return; }
      if (state.first === tile) return;

      state.moves++;
      var a = state.first, b = tile;
      state.first = null;
      updateHud();

      if (a._sid === b._sid && a._facet !== b._facet) {
        a._matched = b._matched = true;
        a.classList.add('matched'); b.classList.add('matched');
        state.matched++;
        updateHud();
        if (state.matched === state.total) finish();
      } else {
        state.miss++;
        a.classList.add('wrong'); b.classList.add('wrong');
        state.lock = true;
        setTimeout(function () {
          a.classList.remove('wrong'); b.classList.remove('wrong');
          a.classList.add('down'); b.classList.add('down');
          state.lock = false;
        }, 800);
      }
    }

    function updateHud() {
      document.getElementById('mm-moves').textContent = state.moves;
      document.getElementById('mm-left').textContent = (state.total - state.matched);
    }

    function finish() {
      state.running = false;
      var ms = elapsedMs();
      clearInterval(state.timer);
      document.getElementById('mm-time').textContent = (ms / 1000).toFixed(1) + 's';
      // score rewards few moves: perfect = total moves; each miss costs points
      var score = Math.max(0, state.total * 20 - state.miss * 5);
      var rec = ctx.Store.record('memory', { score: score, timeMs: ms });
      var pb = (rec.bestTimeMs === ms) ? ' 🏆 new best time!' : '';
      summary.innerHTML = '';
      var box = h('div', { class: 'muted-box', style: 'margin-top:16px' }, [
        h('h2', { text: 'Board cleared' + pb }),
        h('p', { class: 'mono', text: 'Time ' + (ms / 1000).toFixed(1) + 's  ·  Moves ' + state.moves + '  ·  Misses ' + state.miss + '  ·  Score ' + score }),
        h('p', { class: 'tag-line', text: 'Best time ' + ctx.Store.fmtTime(rec.bestTimeMs) + '  ·  Best score ' + (rec.bestScore || score) }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', text: '▶ Play again', onclick: start }),
          h('button', { class: 'btn', text: '← Home', onclick: ctx.home })
        ])
      ]);
      summary.appendChild(box);
      // Perfect = no misses; attempted = pairs + misses.
      if (global.Leaderboard) global.Leaderboard.mountResult(box, 'memory', { score: score, correct: state.total, attempted: state.total + state.miss });
    }
  }

  global.App.registerMode({
    id: 'memory', label: 'Memory', minStrategies: 2,
    blurb: 'Concentration grid: flip face-down tiles to find matching graph↔name pairs from memory.',
    init: init
  });
})(window);
