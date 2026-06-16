/* ============================================================
 * modes/sandbox.js — Live-graphing payoff sandbox (free tool)
 * Type real-dollar values: stock price, and per leg the action,
 * type, strike, premium and qty. The payoff graph + metrics
 * update live as you add/remove legs. No scoring — a scratchpad.
 * Uses the ABSOLUTE engine in payoff.js (renderCustom).
 *
 * If the construction matches a known strategy (structurally,
 * spacing-independent), the recognized name is shown.
 * ============================================================ */
(function (global) {
  'use strict';

  function num(v, dflt) { var n = parseFloat(v); return isNaN(n) ? (dflt || 0) : n; }

  var DEFAULTS = { spot: 100, action: 'buy', type: 'call', strike: 100, premium: 5.00, qty: 1 };

  /* ---- structural recognition (spacing-independent signature) ----
     A leg becomes  type + signedQty + '@' + strikeRank.  Two
     constructions match if their sorted token sets are identical,
     so a 95/105 spread is recognized the same as a 100/110 one. */
  function signature(legs, strikeOf) {
    var strikes = legs.map(strikeOf);
    var distinct = strikes.slice().sort(function (a, b) { return a - b; })
      .filter(function (v, i, a) { return i === 0 || v !== a[i - 1]; });
    return legs.map(function (l) {
      var q = (l.action === 'buy' ? 1 : -1) * (l.qty || 1);
      return l.type.charAt(0) + (q >= 0 ? '+' : '') + q + '@' + distinct.indexOf(strikeOf(l));
    }).sort().join('|');
  }

  // Synthetic / arbitrage combos not in the strategy library (relative legs).
  var SYNTHETICS = [
    { name: 'Synthetic Long Stock', legs: [{ action: 'buy', type: 'call', strike: 0 }, { action: 'sell', type: 'put', strike: 0 }] },
    { name: 'Synthetic Short Stock', legs: [{ action: 'buy', type: 'put', strike: 0 }, { action: 'sell', type: 'call', strike: 0 }] },
    { name: 'Conversion', legs: [{ action: 'buy', type: 'stock', strike: 0 }, { action: 'buy', type: 'put', strike: 0 }, { action: 'sell', type: 'call', strike: 0 }] },
    { name: 'Reversal (Reverse Conversion)', legs: [{ action: 'sell', type: 'stock', strike: 0 }, { action: 'buy', type: 'call', strike: 0 }, { action: 'sell', type: 'put', strike: 0 }] }
  ];

  function recognize(userLegs) {
    if (!userLegs.length) return null;
    var SPOT = global.Payoff.SPOT;
    var userOf = function (l) { return Math.round((l.strike || 0) * 100) / 100; };
    var libOf = function (l) { return l.type === 'stock' ? SPOT : SPOT + (l.strike || 0); };
    var us = signature(userLegs, userOf);

    var lib = global.StrategyLib.all().filter(function (s) { return !s.timeBased; });
    for (var i = 0; i < lib.length; i++) {
      if (signature(lib[i].legs, libOf) === us) return lib[i].name;
    }
    for (var j = 0; j < SYNTHETICS.length; j++) {
      if (signature(SYNTHETICS[j].legs, libOf) === us) return SYNTHETICS[j].name;
    }
    return null;
  }

  function init(view, ctx) {
    var h = ctx.h;
    var P = global.Payoff;
    var state = { spot: DEFAULTS.spot, legs: [] };

    view.appendChild(h('h1', { text: 'Sandbox — live payoff graph' }));
    view.appendChild(h('p', { class: 'sub', text: 'A free payoff calculator. Set the stock price, add legs with real strikes / premiums / quantities, and watch the graph and metrics update live. If your construction matches a known strategy, its name is shown. Nothing is scored — explore freely.' }));

    /* ---- stock price + clear ---- */
    var top = h('div', { class: 'muted-box', style: 'margin-bottom:14px' });
    var spotInp = h('input', { class: 'q-input pairs-input', type: 'number', step: '1', min: '1', value: String(state.spot) });
    spotInp.style.width = '90px';
    spotInp.addEventListener('input', function () { state.spot = num(spotInp.value, DEFAULTS.spot); renderOutput(); });

    top.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'tag-line', text: 'Stock price $' }), spotInp,
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn ghost', text: 'Clear all', onclick: clearAll })
    ]));

    /* ---- leg adder ---- */
    var actionSel = sel(['buy', 'sell']);
    var typeSel = sel(['call', 'put', 'stock']);
    var strikeInp = h('input', { class: 'q-input pairs-input', type: 'number', step: '1', value: String(DEFAULTS.strike), title: 'strike' });
    strikeInp.style.width = '80px';
    var premInp = h('input', { class: 'q-input pairs-input', type: 'number', step: '0.05', value: DEFAULTS.premium.toFixed(2), title: 'premium / share' });
    premInp.style.width = '120px';
    var qtyInp = h('input', { class: 'q-input pairs-input', type: 'number', min: '1', step: '1', value: String(DEFAULTS.qty), title: 'contracts' });

    function syncType() {
      var stock = typeSel.value === 'stock';
      premInp.disabled = stock;
      strikeInp.title = stock ? 'entry price' : 'strike';
    }
    typeSel.addEventListener('change', syncType); syncType();

    var addBtn = h('button', { class: 'btn primary', text: '+ Add leg', onclick: function () {
      state.legs.push({
        action: actionSel.value, type: typeSel.value,
        strike: num(strikeInp.value, state.spot),
        premium: typeSel.value === 'stock' ? 0 : num(premInp.value, 0),
        qty: Math.max(1, Math.round(num(qtyInp.value, 1)))
      });
      renderLegList(); renderOutput();
    } });

    top.appendChild(h('div', { class: 'leg-adder', style: 'margin-top:12px' }, [
      labelWrap('action', actionSel),
      labelWrap('type', typeSel),
      labelWrap('strike $', strikeInp),
      labelWrap('prem $', premInp),
      labelWrap('qty', qtyInp),
      labelWrap(' ', addBtn)
    ]));
    view.appendChild(top);

    var legListEl = h('div', { class: 'leg-list', style: 'margin-bottom:14px' });
    view.appendChild(legListEl);

    var outputEl = h('div', { class: 'muted-box' });
    view.appendChild(outputEl);

    /* ---- actions ---- */
    function clearAll() {
      state.spot = DEFAULTS.spot;
      state.legs = [];
      spotInp.value = String(DEFAULTS.spot);
      actionSel.value = DEFAULTS.action;
      typeSel.value = DEFAULTS.type;
      strikeInp.value = String(DEFAULTS.strike);
      premInp.value = DEFAULTS.premium.toFixed(2);
      qtyInp.value = String(DEFAULTS.qty);
      syncType();
      renderLegList(); renderOutput();
    }

    /* ---- renderers ---- */
    function renderLegList() {
      legListEl.innerHTML = '';
      if (!state.legs.length) { legListEl.appendChild(h('div', { class: 'tag-line', text: 'No legs — add some above.' })); return; }
      state.legs.forEach(function (leg, i) {
        legListEl.appendChild(h('div', { class: 'leg-chip' }, [
          h('span', { class: leg.action === 'buy' ? 'buy' : 'sell', text: legLabel(leg) }),
          h('button', { class: 'leg-x', text: '×', title: 'remove', onclick: function () { state.legs.splice(i, 1); renderLegList(); renderOutput(); } })
        ]));
      });
    }

    function renderOutput() {
      outputEl.innerHTML = '';
      if (!state.legs.length) { outputEl.appendChild(h('div', { class: 'tag-line', text: 'Add legs to see the payoff graph.' })); return; }

      var name = recognize(state.legs);
      outputEl.appendChild(h('div', { class: 'recognized' + (name ? ' hit' : '') },
        name ? [h('span', { class: 'dim', text: 'Recognized: ' }), h('strong', { text: name })]
             : [h('span', { class: 'dim', text: 'No exact match in the strategy library.' })]));

      outputEl.appendChild(P.renderCustom(state.legs, state.spot, { width: 560, height: 300 }));
      var m = P.describeMetricsAbs(state.legs, state.spot);
      var grid = h('div', { class: 'metrics', style: 'margin-top:10px;max-width:420px' });
      grid.innerHTML =
        '<span class="k">Stock price</span><span class="v">$' + state.spot + '</span>' +
        '<span class="k">Net (options)</span><span class="v">' + m.net + '</span>' +
        '<span class="k">Max profit</span><span class="v profit">' + m.maxProfit + '</span>' +
        '<span class="k">Max loss</span><span class="v loss">' + m.maxLoss + '</span>' +
        '<span class="k">Break-even</span><span class="v">' + (m.breakEvens.join(', ') || '—') + '</span>';
      outputEl.appendChild(grid);
      outputEl.appendChild(h('div', { class: 'tag-line', style: 'margin-top:8px', text: 'Per-contract dollars (×100 shares). Profit zones green, loss red, gold dots = break-evens.' }));
    }

    function labelWrap(label, input) {
      return h('div', { class: 'sandbox-field' }, [ h('span', { class: 'tag-line', text: label }), input ]);
    }
    function sel(values) {
      var s = h('select', { class: 'btn ghost' });
      values.forEach(function (v) { s.appendChild(h('option', { value: v, text: v })); });
      return s;
    }
    function legLabel(leg) {
      var sign = leg.action === 'buy' ? '+' : '−';
      var qty = leg.qty || 1;
      if (leg.type === 'stock') return sign + qty + ' Stock @ $' + leg.strike;
      var typ = leg.type === 'call' ? 'Call' : 'Put';
      return sign + qty + ' ' + typ + ' $' + leg.strike + ' @ $' + (leg.premium || 0).toFixed(2);
    }

    renderLegList();
    renderOutput();
  }

  global.App.registerMode({
    id: 'sandbox', label: 'Sandbox', minStrategies: 0,
    blurb: 'Live payoff calculator: type real strikes, premiums and quantities and watch the graph update.',
    init: init
  });
})(window);
