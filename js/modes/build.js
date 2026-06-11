/* ============================================================
 * modes/build.js — Build-a-payoff
 * Given a target payoff graph + outlook (name hidden), the intern
 * assembles legs; the app draws their result live and checks it
 * against the target by COMPARING PAYOFF CURVES (so any equivalent
 * construction that reproduces the target is accepted).
 * Direct descendant of the original C# Payoff Diagram Generator.
 * ============================================================ */
(function (global) {
  'use strict';

  var SPOT = 100;
  var STRIKES = [-15, -10, -5, 0, 5, 10, 15];

  function norm(str) { return String(str).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Two leg-sets match if their payoff curves agree across the domain.
  function curvesMatch(a, b) {
    if (!a.length) return false;
    for (var s = 0; s <= 200; s += 2) {
      if (Math.abs(global.Payoff.payoffAt(a, s) - global.Payoff.payoffAt(b, s)) > 0.25) return false;
    }
    return true;
  }

  function legLabel(leg) {
    var sign = leg.action === 'buy' ? '+' : '−';
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return sign + qty + ' Stock @ $' + SPOT;
    var k = SPOT + (leg.strike || 0);
    var typ = leg.type === 'call' ? 'Call' : 'Put';
    var exp = leg.expiry === 'far' ? ' (far)' : '';
    return sign + qty + ' ' + typ + ' $' + k + exp;
  }

  function init(view, ctx) {
    var h = ctx.h;
    var pool = ctx.strategies.filter(function (s) { return !s.timeBased; });
    var state = { target: null, legs: [], solved: 0, attempts: 0, revealed: false };
    var nameInputEl = null;

    view.appendChild(h('h1', { text: 'Build-a-payoff' }));
    view.appendChild(h('p', { class: 'sub', text: 'Reproduce the target payoff OR name it. Add legs until your curve matches the target, and/or type its name, then Check against target. Any construction that reproduces the payoff counts.' }));

    var hud = h('div', { class: 'row', style: 'margin-bottom:12px' }, [
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Solved ' }), h('span', { id: 'b-solved', class: 'mono', text: '0' })]),
      h('span', { class: 'hud-stat' }, [h('span', { class: 'dim', text: 'Attempts ' }), h('span', { id: 'b-att', class: 'mono', text: '0' })])
    ]);
    view.appendChild(hud);

    var cols = h('div', { class: 'build-cols' });
    var targetCol = h('div', { class: 'muted-box' });
    var buildCol = h('div', { class: 'muted-box' });
    cols.appendChild(targetCol);
    cols.appendChild(buildCol);
    view.appendChild(cols);

    /* ---------- target ---------- */
    function newTarget() {
      state.target = shuffle(pool)[0];
      state.legs = [];
      state.revealed = false;
      renderTarget();
      renderBuild();
    }

    function renderTarget() {
      var s = state.target;
      targetCol.innerHTML = '';
      targetCol.appendChild(h('div', { class: 'fc-section-label', text: 'Target payoff' }));
      targetCol.appendChild(global.Payoff.renderSVG(s.legs, { width: 380, height: 210, components: [] }));
      targetCol.appendChild(h('div', { class: 'tags', style: 'margin-top:10px' }, [
        h('span', { class: 'pill', text: s.priceOutlook }),
        h('span', { class: 'pill', text: s.volOutlook }),
        h('span', { class: 'pill', text: 'profit ' + s.profitPotential }),
        h('span', { class: 'pill', text: 'risk ' + s.risk })
      ]));
      var nameLine = h('div', { class: 'tag-line', style: 'margin-top:10px' },
        state.revealed ? [h('strong', { text: s.name })] : [h('span', { text: 'Name hidden — build it from the graph + outlook.' })]);
      targetCol.appendChild(nameLine);
      targetCol.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, [
        h('button', { class: 'btn ghost', text: state.revealed ? '🙈 Hide name' : '👁 Show name', onclick: function () { state.revealed = !state.revealed; renderTarget(); } }),
        h('button', { class: 'btn ghost', text: '↻ New target', onclick: newTarget })
      ]));
    }

    /* ---------- builder ---------- */
    function renderBuild() {
      buildCol.innerHTML = '';

      // name the strategy — at the top; folded into the single Check action
      buildCol.appendChild(h('div', { class: 'fc-section-label', text: 'Name the strategy (optional)' }));
      nameInputEl = h('input', { class: 'q-input', type: 'text', placeholder: 'Type the strategy name…', autocomplete: 'off' });
      nameInputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
      buildCol.appendChild(nameInputEl);

      buildCol.appendChild(h('div', { class: 'fc-section-label', text: 'Your construction' }));

      // leg-adder controls
      var actionSel = sel(['buy', 'sell']);
      var typeSel = sel(['call', 'put', 'stock']);
      var strikeSel = sel(STRIKES.map(function (k) { return String(k); }), STRIKES.map(function (k) { return '$' + (SPOT + k); }));
      strikeSel.value = '0';
      var qtyInp = h('input', { class: 'q-input pairs-input', type: 'number', min: '1', max: '5', step: '1', value: '1' });

      function syncType() { strikeSel.disabled = (typeSel.value === 'stock'); }
      typeSel.addEventListener('change', syncType); syncType();

      var adder = h('div', { class: 'leg-adder' }, [
        actionSel, typeSel, strikeSel, qtyInp,
        h('button', { class: 'btn primary', text: '+ Add leg', onclick: function () {
          var leg = { action: actionSel.value, type: typeSel.value,
                      strike: typeSel.value === 'stock' ? 0 : parseInt(strikeSel.value, 10),
                      qty: Math.max(1, Math.min(5, parseInt(qtyInp.value, 10) || 1)), expiry: 'near' };
          state.legs.push(leg);
          renderBuild();
        } })
      ]);
      buildCol.appendChild(adder);

      // current legs
      var legList = h('div', { class: 'leg-list' });
      if (!state.legs.length) {
        legList.appendChild(h('div', { class: 'tag-line', text: 'No legs yet — add some above.' }));
      } else {
        state.legs.forEach(function (leg, i) {
          legList.appendChild(h('div', { class: 'leg-chip' }, [
            h('span', { class: leg.action === 'buy' ? 'buy' : 'sell', text: legLabel(leg) }),
            h('button', { class: 'leg-x', text: '×', title: 'remove', onclick: function () { state.legs.splice(i, 1); renderBuild(); } })
          ]));
        });
        legList.appendChild(h('button', { class: 'btn ghost', style: 'margin-top:8px', text: 'Clear all', onclick: function () { state.legs = []; renderBuild(); } }));
      }
      buildCol.appendChild(legList);

      // live preview + pricing/metrics
      buildCol.appendChild(h('div', { class: 'fc-section-label', text: 'Your payoff (live)' }));
      if (state.legs.length) {
        buildCol.appendChild(global.Payoff.renderSVG(state.legs, { width: 380, height: 210 }));
        var mt = h('div', { class: 'metrics', style: 'margin-top:8px' });
        mt.innerHTML = global.Payoff.metricsTableHTML(state.legs);
        buildCol.appendChild(mt);
      } else {
        buildCol.appendChild(h('div', { class: 'tag-line', text: '—' }));
      }

      // single check — validates the built payoff AND/OR the typed name
      var checkBtn = h('button', { class: 'btn primary', style: 'margin-top:12px', text: '✓ Check against target', onclick: check });
      buildCol.appendChild(checkBtn);
      buildCol.appendChild(h('div', { id: 'b-feedback', style: 'margin-top:10px' }));
    }

    function check() {
      state.attempts++;
      document.getElementById('b-att').textContent = state.attempts;
      var fb = document.getElementById('b-feedback');
      fb.innerHTML = '';

      var nameVal = nameInputEl ? nameInputEl.value : '';
      var accept = [norm(state.target.name)].concat((state.target.aka || []).map(norm));
      var nameOk = nameVal.trim() !== '' && accept.indexOf(norm(nameVal)) >= 0;
      var curveOk = curvesMatch(state.legs, state.target.legs);

      if (nameOk || curveOk) {
        state.solved++;
        document.getElementById('b-solved').textContent = state.solved;
        ctx.Store.record('build', { score: state.solved });
        state.revealed = true; renderTarget();
        var how = curveOk && nameOk ? 'Payoff matches and named correctly.'
                : curveOk ? 'Your payoff matches the target.'
                : 'Named correctly.';
        fb.appendChild(h('div', { class: 'feedback ok', text: '✓ Correct — this is a ' + state.target.name + '. ' + how }));
        fb.appendChild(h('button', { class: 'btn primary', style: 'margin-top:8px', text: 'Next target →', onclick: newTarget }));
      } else {
        fb.appendChild(h('div', { class: 'feedback no', text: '✗ Not yet — your payoff doesn\'t match the target' + (nameVal.trim() ? ' and that name isn\'t right' : '') + '. Adjust your legs (compare break-evens, slopes, caps) or type the strategy name.' }));
      }
    }

    function sel(values, labels) {
      var s = h('select', { class: 'btn ghost' });
      values.forEach(function (v, i) { s.appendChild(h('option', { value: v, text: labels ? labels[i] : v })); });
      return s;
    }

    newTarget();
  }

  global.App.registerMode({
    id: 'build', label: 'Build-a-payoff', minStrategies: 1,
    blurb: 'Given a target graph/outlook, pick legs to construct the strategy; the app draws and checks your result.',
    init: init
  });
})(window);
