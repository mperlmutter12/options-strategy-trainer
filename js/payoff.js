/* ============================================================
 * payoff.js — multi-leg payoff engine + SVG renderer
 * ------------------------------------------------------------
 * Ported and generalized from the C# Task2_PayoffDiagram
 * (OptionValue / NetPL), extended from a single option to an
 * arbitrary list of legs.
 *
 * Two engines share one renderer:
 *   RELATIVE  — strikes relative to a $100 notional, model premiums.
 *               Used by the strategy library and all game modes.
 *   ABSOLUTE  — real-dollar strikes/spot/premiums you type in.
 *               Used by the Sandbox (live-graphing) mode.
 *
 * No framework, no modules — everything hangs off the global
 * `Payoff` object so the app works opened straight from file://.
 * ============================================================ */
(function (global) {
  'use strict';

  var SPOT = 100;          // notional underlying price all strikes are relative to
  var CONTRACT = 100;      // shares per contract (used for per-contract dollar display)
  var _uid = 0;            // unique id source for SVG clipPaths

  /* ----------------------------------------------------------
   * PREMIUM MODEL  (design note)
   * ----------------------------------------------------------
   * The generalized leg model carries no premiums, but payoff
   * curves and break-evens need an entry cost. We use a simple,
   * deterministic, internally-consistent model — NOT Black-Scholes:
   *
   *   premium = intrinsic-at-spot + time value
   *   time value = ATM_TV − $1 per $5 the strike sits from spot (floored at $1)
   *
   * Whole-dollar, ATM-peaked teaching premiums: $5 (near) / $8 (far) at the
   * money, dropping a clean $1 per strike further out, plus intrinsic when ITM.
   * Not market quotes — just internally consistent.
   * -------------------------------------------------------- */
  var PREMIUM = {
    atmTvNear: 5.0, atmTvFar: 8.0,
    resWidth: 9   // width of the far-leg RESIDUAL time-value curve at the near expiry
                  // (still a gaussian) — keeps calendar tents peaked, double-cal humps split
  };

  function intrinsic(type, strike, S) {
    if (type === 'call') return Math.max(S - strike, 0);
    if (type === 'put') return Math.max(strike - S, 0);
    return 0;
  }

  // Theoretical entry premium for an option leg at trade inception (S = spot).
  function premium(type, strike, expiry) {
    var atm = (expiry === 'far') ? PREMIUM.atmTvFar : PREMIUM.atmTvNear;
    var steps = Math.abs(strike - SPOT) / 5;          // strikes sit on a $5 grid
    var tv = Math.max(atm - steps, 1);                // ~$1 of time value per $5 OTM/ITM, floored at $1
    return intrinsic(type, strike, SPOT) + tv;
  }

  function legStrike(leg) { return SPOT + (leg.strike || 0); }

  // Per-leg entry premium (per share, signed: + paid / - collected). Stock = 0.
  function legEntryCost(leg) {
    var dir = (leg.action === 'buy') ? 1 : -1;
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return 0;
    return dir * qty * premium(leg.type, legStrike(leg), leg.expiry);
  }

  // P/L of a single leg at expiration price S (per share, x1 contract).
  function legPL(leg, S) {
    var dir = (leg.action === 'buy') ? 1 : -1;
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return dir * qty * (S - SPOT);
    var K = legStrike(leg);
    return dir * qty * (intrinsic(leg.type, K, S) - premium(leg.type, K, leg.expiry));
  }

  function payoffAt(legs, S) {
    var total = 0;
    for (var i = 0; i < legs.length; i++) total += legPL(legs[i], S);
    return total;
  }

  function netDebit(legs) {
    var c = 0;
    for (var i = 0; i < legs.length; i++) c += legEntryCost(legs[i]);
    return c;
  }

  /* ----------------------------------------------------------
   * ABSOLUTE engine — legs with real $ strikes + explicit premiums.
   * leg = { action, type:'call'|'put'|'stock', strike, premium, qty }
   * For stock, `strike` is the entry/cost-basis price; premium ignored.
   * -------------------------------------------------------- */
  function legPLAbs(leg, S) {
    var dir = (leg.action === 'buy') ? 1 : -1;
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return dir * qty * (S - (leg.strike || 0));
    return dir * qty * (intrinsic(leg.type, leg.strike || 0, S) - (leg.premium || 0));
  }
  function payoffAtAbs(legs, S) {
    var total = 0;
    for (var i = 0; i < legs.length; i++) total += legPLAbs(legs[i], S);
    return total;
  }
  function netDebitAbs(legs) {
    var c = 0;
    for (var i = 0; i < legs.length; i++) {
      if (legs[i].type === 'stock') continue;
      var dir = (legs[i].action === 'buy') ? 1 : -1;
      c += dir * (legs[i].qty || 1) * (legs[i].premium || 0);
    }
    return c;
  }

  /* ----------------------------------------------------------
   * METRICS — generic numeric solver over a P/L function.
   * Samples a grid (+ kink points) for break-evens, max/min,
   * and detects upside unboundedness.
   * -------------------------------------------------------- */
  function solveMetrics(plFn, kinks, lo, hi) {
    var xs = [];
    var step = (hi - lo) / 600;
    for (var x = lo; x <= hi + 1e-9; x += step) xs.push(x);
    (kinks || []).forEach(function (k) { if (k >= lo && k <= hi) xs.push(k); });
    xs.sort(function (a, b) { return a - b; });

    var ys = xs.map(plFn);
    var maxP = -Infinity, minP = Infinity;
    for (var j = 0; j < ys.length; j++) { if (ys[j] > maxP) maxP = ys[j]; if (ys[j] < minP) minP = ys[j]; }

    // Break-evens: STRICT zero crossings only. A near-flat curve (e.g. a
    // conversion/reversal sitting on $0) has no meaningful break-even, so
    // skip detection entirely rather than marking every sample point.
    var eps = 1e-6;
    var flat = (maxP - minP) < 1e-4;
    var bes = [];
    if (!flat) {
      var sgn = function (y) { return y < -eps ? -1 : (y > eps ? 1 : 0); };
      for (var k = 1; k < xs.length; k++) {
        var y0 = ys[k - 1], y1 = ys[k], s0 = sgn(y0), s1 = sgn(y1);
        if (s0 !== 0 && s1 !== 0 && s0 !== s1) {
          var t = y0 / (y0 - y1);
          pushBE(bes, xs[k - 1] + t * (xs[k] - xs[k - 1]));
        }
      }
    }

    var rightSlope = plFn(hi) - plFn(hi - (hi - lo) / 600);
    var profitUnlimited = rightSlope > 0.001;
    var lossUnlimited = rightSlope < -0.001;

    return {
      maxProfit: profitUnlimited ? Infinity : maxP,
      maxLoss: lossUnlimited ? -Infinity : minP,
      breakEvens: bes,
      profitUnlimited: profitUnlimited,
      lossUnlimited: lossUnlimited
    };
  }

  function pushBE(arr, v) {
    var r = Math.round(v * 100) / 100;
    for (var i = 0; i < arr.length; i++) if (Math.abs(arr[i] - r) < 0.05) return;
    arr.push(r);
  }

  function computeMetrics(legs, opts) {
    opts = opts || {};
    var hi = opts.hi || (SPOT * 2.5);
    var kinks = legs.filter(function (l) { return l.type !== 'stock'; }).map(legStrike);
    var m = solveMetrics(function (s) { return payoffAt(legs, s); }, kinks, 0, hi);
    m.netDebit = netDebit(legs);
    return m;
  }

  function computeMetricsAbs(legs, spot) {
    var dom = domainAbs(legs, spot);
    var hi = Math.max(dom.hi, spot * 2.5);
    var kinks = legs.filter(function (l) { return l.type !== 'stock'; }).map(function (l) { return l.strike || 0; });
    var m = solveMetrics(function (s) { return payoffAtAbs(legs, s); }, kinks, 0, hi);
    m.netDebit = netDebitAbs(legs);
    return m;
  }

  /* ---- display domains ---- */
  function displayDomain(legs) {
    var maxDist = 25;
    for (var i = 0; i < legs.length; i++) {
      if (legs[i].type === 'stock') continue;
      maxDist = Math.max(maxDist, Math.abs(legs[i].strike || 0) + 12);
    }
    return { lo: Math.max(0, SPOT - maxDist), hi: SPOT + maxDist };
  }

  function domainAbs(legs, spot) {
    var ks = [spot];
    legs.forEach(function (l) { if (l.type !== 'stock') ks.push(l.strike || 0); else ks.push(l.strike || spot); });
    var mn = Math.min.apply(null, ks), mx = Math.max.apply(null, ks);
    var span = Math.max(mx - mn, spot * 0.3, 10);
    return { lo: Math.max(0, mn - span * 0.45), hi: mx + span * 0.45 };
  }

  /* ----------------------------------------------------------
   * SHARED SVG RENDERER — draws any P/L function over a domain.
   * -------------------------------------------------------- */
  function drawCurve(plFn, dom, breakEvens, spot, opts) {
    opts = opts || {};
    var W = opts.width || 460, H = opts.height || 300;
    var mini = !!opts.mini;
    var pad = mini ? { t: 8, r: 8, b: 8, l: 8 } : { t: 18, r: 16, b: 34, l: 52 };

    var n = 240, pts = [], yMax = -Infinity, yMin = Infinity;
    for (var i = 0; i <= n; i++) {
      var s = dom.lo + (dom.hi - dom.lo) * i / n;
      var pl = plFn(s);
      pts.push({ s: s, pl: pl });
      if (pl > yMax) yMax = pl; if (pl < yMin) yMin = pl;
    }
    // Pre-sample component lines and include them in the y-range, so a flat net
    // (e.g. a box) still shows its sloped underlying spreads in-frame.
    var compFns = opts._componentFns || [];
    var compVals = compFns.map(function (fn) {
      var arr = [];
      for (var ci = 0; ci <= n; ci++) {
        var cv = fn(dom.lo + (dom.hi - dom.lo) * ci / n);
        arr.push(cv);
        if (cv > yMax) yMax = cv; if (cv < yMin) yMin = cv;
      }
      return arr;
    });
    yMax = Math.max(yMax, 0); yMin = Math.min(yMin, 0);
    var span = (yMax - yMin) || 1;
    yMax += span * 0.12; yMin -= span * 0.12;

    var plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    function sx(s) { return pad.l + (s - dom.lo) / (dom.hi - dom.lo) * plotW; }
    function sy(pl) { return pad.t + (yMax - pl) / (yMax - yMin) * plotH; }

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'payoff-svg' + (mini ? ' payoff-mini' : ''));
    svg.setAttribute('preserveAspectRatio', 'none');
    function el(name, attrs) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

    var zeroY = sy(0);
    var areaUp = 'M' + sx(pts[0].s) + ',' + zeroY, areaDn = 'M' + sx(pts[0].s) + ',' + zeroY;
    for (var p = 0; p < pts.length; p++) {
      var X = sx(pts[p].s);
      areaUp += ' L' + X + ',' + sy(Math.max(pts[p].pl, 0));
      areaDn += ' L' + X + ',' + sy(Math.min(pts[p].pl, 0));
    }
    areaUp += ' L' + sx(pts[pts.length - 1].s) + ',' + zeroY + ' Z';
    areaDn += ' L' + sx(pts[pts.length - 1].s) + ',' + zeroY + ' Z';
    svg.appendChild(el('path', { d: areaDn, class: 'pl-loss-fill' }));
    svg.appendChild(el('path', { d: areaUp, class: 'pl-profit-fill' }));
    svg.appendChild(el('line', { x1: pad.l, y1: zeroY, x2: pad.l + plotW, y2: zeroY, class: 'zero-line' }));

    if (!mini && spot != null && spot >= dom.lo && spot <= dom.hi) {
      svg.appendChild(el('line', { x1: sx(spot), y1: pad.t, x2: sx(spot), y2: pad.t + plotH, class: 'spot-line' }));
    }

    // dotted component lines (the "parts" that sum to the net payoff), clipped to the plot.
    if (compVals.length) {
      var clipId = 'ppclip' + (++_uid);
      var defs = el('defs', {});
      var cp = el('clipPath', { id: clipId });
      cp.appendChild(el('rect', { x: pad.l, y: pad.t, width: plotW, height: plotH }));
      defs.appendChild(cp);
      svg.appendChild(defs);
      compVals.forEach(function (arr) {
        var cd = '';
        for (var ci = 0; ci <= n; ci++) {
          cd += (ci ? ' L' : 'M') + sx(dom.lo + (dom.hi - dom.lo) * ci / n) + ',' + sy(arr[ci]);
        }
        svg.appendChild(el('path', { d: cd, class: 'payoff-component', 'clip-path': 'url(#' + clipId + ')' }));
      });
    }

    var d = '';
    for (var q = 0; q < pts.length; q++) d += (q ? ' L' : 'M') + sx(pts[q].s) + ',' + sy(pts[q].pl);
    svg.appendChild(el('path', { d: d, class: 'payoff-line' }));

    if (!mini) {
      (breakEvens || []).forEach(function (be) {
        if (be < dom.lo || be > dom.hi) return;
        svg.appendChild(el('circle', { cx: sx(be), cy: zeroY, r: 3.5, class: 'be-dot' }));
        var t = el('text', { x: sx(be), y: zeroY - 6, class: 'be-label' });
        t.textContent = '$' + be.toFixed(0); svg.appendChild(t);
      });
      addText(svg, el, pad.l - 6, pad.t + 4, fmtY(yMax), 'axis-label y');
      addText(svg, el, pad.l - 6, zeroY + 4, '0', 'axis-label y');
      addText(svg, el, pad.l - 6, pad.t + plotH, fmtY(yMin), 'axis-label y');
      addText(svg, el, pad.l, H - 8, '$' + dom.lo.toFixed(0), 'axis-label x start');
      if (spot != null) addText(svg, el, sx(spot), H - 8, '$' + spot.toFixed(0), 'axis-label x mid');
      addText(svg, el, pad.l + plotW, H - 8, '$' + dom.hi.toFixed(0), 'axis-label x end');
    }
    return svg;
  }

  function addText(svg, el, x, y, str, cls) { var t = el('text', { x: x, y: y, class: cls }); t.textContent = str; svg.appendChild(t); }
  function fmtY(v) { var d = v * CONTRACT; if (Math.abs(d) >= 1000) return (d / 1000).toFixed(1) + 'k'; return d.toFixed(0); }

  // RELATIVE renderer (library + games). Dotted "parts" lines are drawn ONLY when
  // opts.components (an array of leg-arrays) is supplied — there is no per-leg default.
  function renderSVG(legs, opts) {
    opts = opts || {};
    var dom = displayDomain(legs);
    var m = computeMetrics(legs, { hi: dom.hi });
    var comps = opts.components || [];
    opts._componentFns = comps.map(function (cl) { return function (s) { return payoffAt(cl, s); }; });
    return drawCurve(function (s) { return payoffAt(legs, s); }, dom, m.breakEvens, SPOT, opts);
  }

  // Render a full strategy object: logical components if defined, and the
  // near-expiry model for time-based strategies (calendars/diagonals/doubles).
  function renderStrategy(strategy, opts) {
    opts = opts || {};
    if (strategy.components && opts.components === undefined) opts.components = strategy.components;
    return strategy.timeBased ? renderTimeBased(strategy.legs, opts) : renderSVG(strategy.legs, opts);
  }

  // ABSOLUTE renderer (sandbox) — net line only (no component decomposition).
  function renderCustom(legs, spot, opts) {
    opts = opts || {};
    var dom = domainAbs(legs, spot);
    var m = computeMetricsAbs(legs, spot);
    return drawCurve(function (s) { return payoffAtAbs(legs, s); }, dom, m.breakEvens, spot, opts);
  }

  /* ----------------------------------------------------------
   * Human-readable metric strings.
   * -------------------------------------------------------- */
  function moneyC(v) {
    if (v === Infinity || v === -Infinity) return 'Unlimited';
    return '$' + (v * CONTRACT).toFixed(0);
  }
  function describeMetrics(legs) {
    var m = computeMetrics(legs);
    return {
      maxProfit: m.profitUnlimited ? 'Unlimited' : moneyC(m.maxProfit),
      maxLoss: m.lossUnlimited ? 'Unlimited' : moneyC(m.maxLoss),
      breakEvens: m.breakEvens.map(function (b) { return '$' + b.toFixed(2); }),
      net: (m.netDebit >= 0 ? 'Debit $' : 'Credit $') + Math.abs(m.netDebit * CONTRACT).toFixed(0)
    };
  }
  function describeMetricsAbs(legs, spot) {
    var m = computeMetricsAbs(legs, spot);
    return {
      maxProfit: m.profitUnlimited ? 'Unlimited' : moneyC(m.maxProfit),
      maxLoss: m.lossUnlimited ? 'Unlimited' : moneyC(m.maxLoss),
      breakEvens: m.breakEvens.map(function (b) { return '$' + b.toFixed(2); }),
      net: (m.netDebit >= 0 ? 'Debit $' : 'Credit $') + Math.abs(m.netDebit * CONTRACT).toFixed(0)
    };
  }

  /* ----------------------------------------------------------
   * Pricing + metrics table (HTML for a .metrics grid).
   * Lists STOCK PRICE, each leg's STRIKE + PREMIUM, NET, and outcomes.
   * Used by gallery, flashcards, and build-a-payoff.
   * -------------------------------------------------------- */
  function legPriceLabel(leg) {
    var sign = leg.action === 'buy' ? '+' : '−';
    var cls = leg.action === 'buy' ? 'buy' : 'sell';
    var qty = leg.qty || 1;
    if (leg.type === 'stock') return '<span class="' + cls + '">' + sign + qty + ' Stock</span>';
    var typ = leg.type === 'call' ? 'Call' : 'Put';
    return '<span class="' + cls + '">' + sign + qty + ' ' + typ + ' $' + legStrike(leg) + '</span>';
  }

  function metricsTableHTML(legs) {
    var m = describeMetrics(legs);
    var rows = '';
    rows += row('Stock price', '$' + SPOT + ' <span class="dim">(notional spot)</span>');
    legs.forEach(function (leg) {
      if (leg.type === 'stock') {
        rows += row(legPriceLabel(leg), '$' + SPOT + ' <span class="dim">basis</span>');
      } else {
        var p = premium(leg.type, legStrike(leg), leg.expiry);
        rows += row(legPriceLabel(leg), 'prem $' + p.toFixed(2) + '<span class="dim">/sh</span>');
      }
    });
    rows += row('Net', m.net);
    rows += row('Max profit', '<span class="profit">' + m.maxProfit + '</span>');
    rows += row('Max loss', '<span class="loss">' + m.maxLoss + '</span>');
    rows += row('Break-even', m.breakEvens.join(', ') || '—');
    return rows;
  }
  function row(k, v) { return '<span class="k">' + k + '</span><span class="v">' + v + '</span>'; }

  /* ----------------------------------------------------------
   * TIME-BASED engine — calendars/diagonals/doubles span two expiries.
   * Valued AT THE NEAR expiry: near legs expire to intrinsic; far legs keep
   * residual time value (one period remaining ≈ atmTvNear, centered on
   * moneyness S−K). A teaching approximation — NOT Black-Scholes.
   * -------------------------------------------------------- */
  function valueAtNearExpiry(leg, S) {
    if (leg.type === 'stock') return S;
    var K = legStrike(leg);
    var intr = intrinsic(leg.type, K, S);
    if (leg.expiry === 'far') {
      var d = (S - K) / PREMIUM.resWidth;
      return intr + PREMIUM.atmTvNear * Math.exp(-0.5 * d * d);
    }
    return intr;
  }
  function payoffAtNearExpiry(legs, S) {
    var total = 0;
    for (var i = 0; i < legs.length; i++) {
      var leg = legs[i], dir = (leg.action === 'buy') ? 1 : -1, qty = leg.qty || 1;
      if (leg.type === 'stock') { total += dir * qty * (S - SPOT); continue; }
      var entry = premium(leg.type, legStrike(leg), leg.expiry);
      total += dir * qty * (valueAtNearExpiry(leg, S) - entry);
    }
    return total;
  }
  function hasFarLeg(legs) {
    for (var i = 0; i < legs.length; i++) if (legs[i].expiry === 'far') return true;
    return false;
  }
  function computeMetricsTime(legs) {
    var kinks = legs.filter(function (l) { return l.type !== 'stock'; }).map(legStrike);
    // sample wide so the far leg's residual time value fully decays (bounded risk)
    var m = solveMetrics(function (s) { return payoffAtNearExpiry(legs, s); }, kinks, 0, SPOT * 3);
    m.netDebit = netDebit(legs);
    return m;
  }
  function describeMetricsTime(legs) {
    var m = computeMetricsTime(legs);
    return {
      maxProfit: m.profitUnlimited ? 'Unlimited' : moneyC(m.maxProfit),
      maxLoss: m.lossUnlimited ? 'Unlimited' : moneyC(m.maxLoss),
      breakEvens: m.breakEvens.map(function (b) { return '$' + b.toFixed(2); }),
      net: (m.netDebit >= 0 ? 'Debit $' : 'Credit $') + Math.abs(m.netDebit * CONTRACT).toFixed(0)
    };
  }
  function renderTimeBased(legs, opts) {
    opts = opts || {};
    var dom = displayDomain(legs);
    var m = computeMetricsTime(legs);
    opts._componentFns = (opts.components || []).map(function (cl) { return function (s) { return payoffAtNearExpiry(cl, s); }; });
    return drawCurve(function (s) { return payoffAtNearExpiry(legs, s); }, dom, m.breakEvens, SPOT, opts);
  }
  function metricsTableHTMLTime(legs) {
    var m = describeMetricsTime(legs);
    var rows = '';
    rows += row('Stock price', '$' + SPOT + ' <span class="dim">(notional spot)</span>');
    legs.forEach(function (leg) {
      if (leg.type === 'stock') { rows += row(legPriceLabel(leg), '$' + SPOT + ' <span class="dim">basis</span>'); return; }
      var p = premium(leg.type, legStrike(leg), leg.expiry);
      var exp = '<span class="dim"> ' + (leg.expiry === 'far' ? 'far' : 'near') + '</span>';
      rows += row(legPriceLabel(leg) + exp, 'prem $' + p.toFixed(2) + '<span class="dim">/sh</span>');
    });
    rows += row('Net', m.net);
    rows += row('Max profit', '<span class="profit">' + m.maxProfit + '</span> <span class="dim">at near exp.</span>');
    rows += row('Max loss', '<span class="loss">' + m.maxLoss + '</span>');
    rows += row('Break-even', m.breakEvens.join(', ') || '—');
    return rows;
  }
  // Pick the right metrics table for a strategy (time-based or at-expiration).
  function metricsTableFor(strategy) {
    return strategy.timeBased ? metricsTableHTMLTime(strategy.legs) : metricsTableHTML(strategy.legs);
  }

  global.Payoff = {
    SPOT: SPOT, CONTRACT: CONTRACT, PREMIUM: PREMIUM,
    intrinsic: intrinsic, premium: premium, legStrike: legStrike,
    payoffAt: payoffAt, netDebit: netDebit,
    computeMetrics: computeMetrics, describeMetrics: describeMetrics, displayDomain: displayDomain,
    renderSVG: renderSVG, renderStrategy: renderStrategy, metricsTableHTML: metricsTableHTML,
    metricsTableFor: metricsTableFor,
    // time-based (calendars/diagonals/doubles) — near-expiry approximation
    payoffAtNearExpiry: payoffAtNearExpiry, computeMetricsTime: computeMetricsTime,
    describeMetricsTime: describeMetricsTime, renderTimeBased: renderTimeBased,
    metricsTableHTMLTime: metricsTableHTMLTime, hasFarLeg: hasFarLeg,
    // absolute / sandbox
    payoffAtAbs: payoffAtAbs, computeMetricsAbs: computeMetricsAbs,
    describeMetricsAbs: describeMetricsAbs, renderCustom: renderCustom, domainAbs: domainAbs
  };
})(window);
