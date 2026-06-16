/* ============================================================
 * app.js — shell: session scoping, home screen, router
 * Modes self-register via App.registerMode(...). The app owns the
 * active strategy set (tier + category filters) and hands it to a
 * mode when launched.
 * ============================================================ */
(function (global) {
  'use strict';

  var App = {
    modes: [],
    session: {
      tiers: { Beginner: true, Intermediate: true, Advanced: true },
      cats: { single: true, vertical: true, vol: true, advanced: true }
    },
    _view: null,
    _current: null
  };

  /* ---- tiny DOM helper ---- */
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  App.h = h;

  /* ---- active strategy set from current session filters ---- */
  App.activeStrategies = function () {
    return StrategyLib.all().filter(function (s) {
      return App.session.tiers[s.tier] && App.session.cats[s.category];
    });
  };

  App.registerMode = function (mode) { App.modes.push(mode); };

  /* ---- navigation ---- */
  function buildNav() {
    var nav = document.getElementById('nav');
    nav.innerHTML = '';
    nav.appendChild(h('button', { text: 'Home', 'data-mode': 'home', onclick: function () { App.go('home'); } }));
    App.modes.forEach(function (m) {
      nav.appendChild(h('button', { text: m.label, 'data-mode': m.id, onclick: function () { App.go(m.id); } }));
    });
  }

  function setActiveNav(id) {
    var nav = document.getElementById('nav');
    Array.prototype.forEach.call(nav.children, function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === id);
    });
  }

  App.go = function (id) {
    setActiveNav(id);
    App._view.innerHTML = '';
    App._current = id;
    if (id === 'home') return renderHome();
    var mode = App.modes.filter(function (m) { return m.id === id; })[0];
    if (!mode) return renderHome();
    var active = App.activeStrategies();
    var min = mode.minStrategies || 1;
    if (active.length < min) {
      App._view.appendChild(h('div', { class: 'muted-box' }, [
        h('h2', { text: mode.label }),
        h('p', { class: 'sub', text: 'This mode needs at least ' + min + ' strategies in your session. ' +
          'You currently have ' + active.length + '. Adjust your tiers / categories on the Home screen.' }),
        h('button', { class: 'btn primary', text: '← Home', onclick: function () { App.go('home'); } })
      ]));
      return;
    }
    mode.init(App._view, App.ctx());
  };

  /* ---- context handed to each mode ---- */
  App.ctx = function () {
    return {
      h: h,
      strategies: App.activeStrategies(),
      session: App.session,
      Payoff: global.Payoff,
      Store: global.Store,
      home: function () { App.go('home'); }
    };
  };

  /* ---- home screen: session scoping + mode picker ---- */
  function renderHome() {
    var v = App._view;
    v.appendChild(h('h1', { text: 'Options Strategy Trainer' }));
    v.appendChild(h('p', { class: 'sub', text: 'Learn to recognize options strategies by their legs, payoff graph, market outlook, and net Greek profile. Pick a mode below to get started.' }));

    /* --- session scope: collapsed by default behind a "Filter strategies" toggle --- */
    var scope = h('details', { class: 'glossary', style: 'margin-top:0;margin-bottom:24px' });
    scope.appendChild(h('summary', { text: 'Filter strategies' }));
    scope.appendChild(h('div', { class: 'row', style: 'justify-content:space-between;margin-top:6px' }, [
      h('span', { class: 'tag-line', text: 'Choose which strategies appear across the games.' }),
      h('span', { id: 'active-count', class: 'tag-line' })
    ]));

    // tier checkboxes
    scope.appendChild(h('div', { class: 'tag-line', style: 'margin:14px 0 6px', text: 'Difficulty tiers' }));
    var tierRow = h('div', { class: 'row' });
    StrategyLib.TIERS.forEach(function (t) {
      tierRow.appendChild(checkbox('tier-' + t, t, App.session.tiers[t], function (on) {
        App.session.tiers[t] = on; updateCount();
      }));
    });
    scope.appendChild(tierRow);

    // category checkboxes
    scope.appendChild(h('div', { class: 'tag-line', style: 'margin:16px 0 6px', text: 'Categories' }));
    var catRow = h('div', { class: 'row' });
    StrategyLib.CATEGORIES.forEach(function (c) {
      catRow.appendChild(checkbox('cat-' + c, StrategyLib.CATEGORY_LABELS[c], App.session.cats[c], function (on) {
        App.session.cats[c] = on; updateCount();
      }));
    });
    scope.appendChild(catRow);
    v.appendChild(scope);

    /* --- mode cards --- */
    var grid = h('div', { class: 'grid' });
    App.modes.forEach(function (m) {
      var card = h('div', { class: 'card', style: 'cursor:pointer', onclick: function () { App.go(m.id); } });
      card.appendChild(h('div', { class: 'card-head' }, [ h('span', { class: 'name', text: m.label }) ]));
      card.appendChild(h('p', { class: 'sub', style: 'margin:0', text: m.blurb || '' }));
      var bits = [];
      if (m.aggregateKeys) {
        // Drills' stats live under its sub-games' keys — sum their plays for the card.
        var totalPlays = m.aggregateKeys.reduce(function (sum, k) { return sum + (Store.get(k).plays || 0); }, 0);
        if (totalPlays) bits.push(totalPlays + ' play' + (totalPlays > 1 ? 's' : ''));
      } else {
        var best = Store.get(m.id);
        if (best.plays) bits.push(best.plays + ' play' + (best.plays > 1 ? 's' : ''));
        if (best.bestScore != null) bits.push('best ' + best.bestScore);
        if (best.bestTimeMs != null) bits.push('fastest ' + Store.fmtTime(best.bestTimeMs));
      }
      card.appendChild(h('div', { class: 'tag-line', style: 'margin-top:10px', text: bits.join(' · ') || 'not played yet' }));
      grid.appendChild(card);
    });
    v.appendChild(grid);

    v.appendChild(renderGlossary());

    var ref = h('p', { class: 'sub', style: 'margin-top:24px' }, [
      'Want to see every strategy at once? Open the ',
      h('a', { href: 'gallery.html', text: 'Strategy Reference' }), '.'
    ]);
    v.appendChild(ref);

    if (!Store.available()) {
      v.appendChild(h('p', { class: 'tag-line', style: 'color:var(--gold)', text: '⚠ localStorage unavailable — scores and streaks will not persist this session.' }));
    }

    v.appendChild(h('div', { class: 'row', style: 'margin-top:20px' }, [
      h('button', { class: 'btn ghost', text: 'Reset all progress', onclick: function () {
        if (window.confirm('Reset all saved scores, streaks and best times on this browser? This cannot be undone.')) {
          Store.clear();
          App.go('home');
        }
      } })
    ]));

    v.appendChild(h('div', { class: 'home-footer' }, [
      h('div', { text: '© 2026 Puma Capital, LLC' }),
      h('div', { class: 'home-footer-sub', text: 'New York (Headquarters)' }),
      h('div', { class: 'home-footer-sub', text: '555 Theodore Fremd Ave, Suite C-204, Rye, NY 10580' }),
      h('div', { class: 'home-footer-sub', text: 'Phone: 212.269.4100' })
    ]));

    updateCount();
  }

  /* ---- glossary: all terms next to their definitions ---- */
  var GLOSSARY = [
    { group: 'Building blocks', items: [
      ['Call', 'The right to BUY the underlying at the strike. Gains as price rises.'],
      ['Put', 'The right to SELL the underlying at the strike. Gains as price falls.'],
      ['Strike price', 'The fixed price at which an option can be exercised.'],
      ['Premium', 'The price paid (or received) for an option, quoted per share. ×100 = per contract.'],
      ['Stock price / spot', 'The current underlying price. This app uses a $100 notional spot.'],
      ['Leg', 'One option (or stock) position within a multi-part strategy.'],
      ['Expiration', 'When the option expires; payoffs here are shown at expiration.'],
      ['ITM / ATM / OTM', 'In-, at-, or out-of-the-money — the strike relative to the spot price.']
    ]},
    { group: 'Outcomes', items: [
      ['Break-even', 'The underlying price where the strategy\'s P/L crosses zero.'],
      ['Max profit', 'The most the strategy can make at expiration ("Unlimited" if uncapped).'],
      ['Max loss', 'The most it can lose ("Unlimited" if uncapped).'],
      ['Net debit', 'You pay to open the position (premiums paid > collected).'],
      ['Net credit', 'You collect to open the position (premiums collected > paid).']
    ]},
    { group: 'Price outlook', items: [
      ['Bullish', 'Profits primarily when the underlying rises.'],
      ['Bearish', 'Profits primarily when the underlying falls.'],
      ['Neutral', 'Profits when the underlying stays within a range.'],
      ['Direction-agnostic', 'Profits from a large move either way (cares about size, not direction).']
    ]},
    { group: 'Volatility & risk', items: [
      ['Long vol (long vega)', 'Gains when implied volatility rises; usually net long options.'],
      ['Short vol (short vega)', 'Gains when implied volatility falls; usually net short options.'],
      ['Limited', 'The profit or loss is capped at a known amount.'],
      ['Unlimited / undefined', 'The profit or loss is not capped (e.g. a naked short call).']
    ]},
    { group: 'The Greeks (conceptual signs)', items: [
      ['Delta (Δ)', 'Directional exposure. Long = gains as price rises; short = gains as price falls.'],
      ['Gamma (Γ)', 'How fast delta changes. Long = delta moves in your favor on a big move.'],
      ['Theta (Θ)', 'Time decay. Long = time passing helps you; short = it hurts you.'],
      ['Vega (V)', 'Volatility exposure. Long = gains when implied vol rises; short = gains when it falls.']
    ]}
  ];

  function renderGlossary() {
    var details = h('details', { class: 'glossary' });
    details.appendChild(h('summary', { text: '📖 Glossary — terms & definitions' }));
    GLOSSARY.forEach(function (sec) {
      details.appendChild(h('div', { class: 'fc-section-label', text: sec.group }));
      var dl = h('div', { class: 'glossary-grid' });
      sec.items.forEach(function (it) {
        dl.appendChild(h('div', { class: 'gl-term', text: it[0] }));
        dl.appendChild(h('div', { class: 'gl-def', text: it[1] }));
      });
      details.appendChild(dl);
    });
    return details;
  }

  function checkbox(id, label, checked, onChange) {
    var wrap = h('label', { class: 'btn ghost', style: 'display:inline-flex;align-items:center;gap:8px;cursor:pointer' });
    var box = h('input', { type: 'checkbox', id: id });
    box.checked = checked;
    box.addEventListener('change', function () { onChange(box.checked); });
    wrap.appendChild(box);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
  }

  function updateCount() {
    var el = document.getElementById('active-count');
    if (!el) return;
    var n = App.activeStrategies().length;
    el.textContent = n + ' strateg' + (n === 1 ? 'y' : 'ies') + ' active';
    el.style.color = n === 0 ? 'var(--red)' : 'var(--text-dim)';
  }

  /* ---- boot ---- */
  App.boot = function () {
    App._view = document.getElementById('view');
    buildNav();
    App.go('home');
  };

  global.App = App;
})(window);
