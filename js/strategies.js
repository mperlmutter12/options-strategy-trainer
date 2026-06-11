/* ============================================================
 * strategies.js — the editable strategy library
 * ------------------------------------------------------------
 * HUMAN-READABLE ON PURPOSE. Spot-check / correct freely.
 *
 * Strikes are RELATIVE to a $100 notional spot, $5 spacing.
 *   strike:  0  → $100 (ATM)
 *   strike: +5  → $105 (OTM call / ITM put)
 *   strike: -5  → $95  (ITM call / OTM put)
 *
 * leg = { action: 'buy'|'sell', type: 'call'|'put'|'stock',
 *         strike: <relative $>, qty: <n>, expiry: 'near'|'far' }
 *
 * greeks are CONCEPTUAL SIGNS ONLY (no Black-Scholes):
 *   'long'  = net positive,  'short' = net negative,  'neutral' = ~flat
 *
 * Outlook vocab:
 *   priceOutlook: 'bullish' | 'bearish' | 'neutral' | 'agnostic'
 *   volOutlook:   'long vol' | 'short vol' | 'neutral'
 *   profit/risk:  'limited' | 'unlimited' | 'undefined'
 *
 * time-based strategies (calendar/diagonal/double) are appended
 * separately once the payoff model is settled — see strategies-time.js.
 * ============================================================ */
(function (global) {
  'use strict';

  var STRATEGIES = [

    /* ---------------- SINGLES (Beginner) ---------------- */
    {
      id: 'long-call', name: 'Long Call', category: 'single', tier: 'Beginner',
      legs: [{ action: 'buy', type: 'call', strike: 0, qty: 1, expiry: 'near' }],
      priceOutlook: 'bullish', volOutlook: 'long vol',
      profitPotential: 'unlimited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['long call', 'buy call', 'call'],
      blurb: 'Pay a premium for the right to buy. Profit rises without limit as the underlying climbs; the most you can lose is the premium.'
    },
    {
      id: 'long-put', name: 'Long Put', category: 'single', tier: 'Beginner',
      legs: [{ action: 'buy', type: 'put', strike: 0, qty: 1, expiry: 'near' }],
      priceOutlook: 'bearish', volOutlook: 'long vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'short', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['long put', 'buy put', 'put'],
      blurb: 'Pay a premium for the right to sell. Profits as the underlying falls (capped because price can only reach $0); max loss is the premium.'
    },
    {
      id: 'short-call', name: 'Short Call', category: 'single', tier: 'Beginner',
      legs: [{ action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' }],
      priceOutlook: 'bearish', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'undefined',
      greeks: { delta: 'short', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['short call', 'naked call', 'sell call', 'writing a call'],
      blurb: 'Collect a premium betting the underlying stays flat or falls. Profit is capped at the credit; loss is unlimited if it rallies.'
    },
    {
      id: 'short-put', name: 'Short Put', category: 'single', tier: 'Beginner',
      legs: [{ action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' }],
      priceOutlook: 'bullish', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['short put', 'naked put', 'sell put', 'writing a put'],
      blurb: 'Collect a premium betting the underlying holds or rises. Profit capped at the credit; large (but bounded) loss if it falls to zero.'
    },
    {
      id: 'covered-call', name: 'Covered Call', category: 'single', tier: 'Beginner',
      legs: [
        { action: 'buy', type: 'stock', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['covered call', 'buy-write', 'covered write'],
      blurb: 'Own the stock and sell a call against it. The call premium adds yield and caps your upside above the strike; downside is the stock minus the credit.'
    },
    {
      id: 'protective-put', name: 'Protective Put', category: 'single', tier: 'Beginner',
      legs: [
        { action: 'buy', type: 'stock', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: -5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bullish', volOutlook: 'long vol',
      profitPotential: 'unlimited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['protective put', 'married put', 'stock + put'],
      blurb: 'Own the stock and buy a put as insurance. Keeps unlimited upside while the put floors your downside below the strike (for the cost of the premium).'
    },

    /* ---------------- VERTICAL SPREADS (Intermediate) ---------------- */
    {
      id: 'bull-call-spread', name: 'Bull Call Spread', category: 'vertical', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bullish', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'neutral', theta: 'short', vega: 'neutral' },
      aka: ['bull call spread', 'long call spread', 'call debit spread', 'debit call spread'],
      blurb: 'Buy a call and sell a higher-strike call to cheapen it. A defined-risk bullish bet: both profit and loss are capped by the strike width and the debit.'
    },
    {
      id: 'bear-call-spread', name: 'Bear Call Spread', category: 'vertical', tier: 'Intermediate',
      legs: [
        { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bearish', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'short', gamma: 'neutral', theta: 'long', vega: 'neutral' },
      aka: ['bear call spread', 'short call spread', 'call credit spread', 'credit call spread'],
      blurb: 'Sell a call and buy a higher-strike call for protection. Collect a credit betting price stays below the short strike; risk is capped at the width minus the credit.'
    },
    {
      id: 'bull-put-spread', name: 'Bull Put Spread', category: 'vertical', tier: 'Intermediate',
      legs: [
        { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: -10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bullish', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'neutral', theta: 'long', vega: 'neutral' },
      aka: ['bull put spread', 'short put spread', 'put credit spread', 'credit put spread'],
      blurb: 'Sell a put and buy a lower-strike put for protection. Collect a credit betting price holds above the short strike; defined risk below.'
    },
    {
      id: 'bear-put-spread', name: 'Bear Put Spread', category: 'vertical', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'put', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: -10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bearish', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'short', gamma: 'neutral', theta: 'short', vega: 'neutral' },
      aka: ['bear put spread', 'long put spread', 'put debit spread', 'debit put spread'],
      blurb: 'Buy a put and sell a lower-strike put to cheapen it. A defined-risk bearish bet capped by the strike width and the debit paid.'
    },

    /* ---------------- VOLATILITY (Intermediate / Advanced) ---------------- */
    {
      id: 'long-straddle', name: 'Long Straddle', category: 'vol', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: 0, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'agnostic', volOutlook: 'long vol',
      profitPotential: 'unlimited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['long straddle', 'straddle'],
      blurb: 'Buy a call and a put at the same strike. Profits from a big move in either direction; loses if the underlying sits still (you paid two premiums).'
    },
    {
      id: 'short-straddle', name: 'Short Straddle', category: 'vol', tier: 'Intermediate',
      legs: [
        { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'undefined',
      greeks: { delta: 'neutral', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['short straddle'],
      blurb: 'Sell a call and a put at the same strike. Collect both premiums betting the underlying pins the strike; unlimited risk if it moves sharply.'
    },
    {
      id: 'long-strangle', name: 'Long Strangle', category: 'vol', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'call', strike: 5, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: -5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'agnostic', volOutlook: 'long vol',
      profitPotential: 'unlimited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['long strangle', 'strangle'],
      blurb: 'Buy an OTM call and an OTM put. Cheaper than a straddle but needs a bigger move to pay off; loss limited to the two premiums.'
    },
    {
      id: 'short-strangle', name: 'Short Strangle', category: 'vol', tier: 'Intermediate',
      legs: [
        { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'undefined',
      greeks: { delta: 'neutral', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['short strangle'],
      blurb: 'Sell an OTM call and an OTM put. A wider neutral zone than a short straddle for a smaller credit; still unlimited risk on a big move.'
    },
    {
      id: 'iron-condor', name: 'Iron Condor', category: 'vol', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'put', strike: -15, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 15, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['iron condor', 'condor', 'ic'],
      blurb: 'Sell an OTM put spread and an OTM call spread. Profits in a wide range while the underlying stays between the short strikes; risk capped by the wings.',
      components: [
        [ { action: 'buy', type: 'put', strike: -15, qty: 1, expiry: 'near' }, { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' } ],
        [ { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' }, { action: 'buy', type: 'call', strike: 15, qty: 1, expiry: 'near' } ]
      ]
    },
    {
      id: 'iron-butterfly', name: 'Iron Butterfly', category: 'vol', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'put', strike: -10, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['iron butterfly', 'iron fly', 'ironfly'],
      blurb: 'A short straddle bracketed by long wings. Higher credit and a sharper profit peak than an iron condor, but a narrower profit zone; risk is capped.',
      components: [
        [ { action: 'buy', type: 'put', strike: -10, qty: 1, expiry: 'near' }, { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' } ],
        [ { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' }, { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' } ]
      ]
    },

    /* ---------------- ADVANCED (price/structure, non-time) ---------------- */
    {
      id: 'long-call-butterfly', name: 'Call Butterfly', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'call', strike: -10, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 0, qty: 2, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['butterfly', 'call butterfly', 'long butterfly', 'long call butterfly'],
      blurb: 'Buy one ITM call, sell two ATM calls, buy one OTM call. A cheap, defined-risk bet that the underlying pins the middle strike at expiration.',
      components: [
        [ { action: 'buy', type: 'call', strike: -10, qty: 1, expiry: 'near' }, { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' } ],
        [ { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' }, { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' } ]
      ]
    },
    {
      id: 'broken-wing-butterfly', name: 'Broken-Wing Butterfly', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'call', strike: -10, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 0, qty: 2, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 15, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['broken wing butterfly', 'bwb', 'broken-wing butterfly', 'skip strike butterfly'],
      blurb: 'A butterfly with one wing pushed further out, skewing the risk. Often opened for a credit so one side carries no loss — the cost is more risk on the other.',
      components: [
        [ { action: 'buy', type: 'call', strike: -10, qty: 1, expiry: 'near' }, { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' } ],
        [ { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' }, { action: 'buy', type: 'call', strike: 15, qty: 1, expiry: 'near' } ]
      ]
    },
    {
      id: 'call-ratio-spread', name: 'Call Ratio Spread', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 10, qty: 2, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'undefined',
      greeks: { delta: 'short', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['call ratio spread', 'ratio spread', 'front ratio spread', 'ratio call spread'],
      blurb: 'Buy one call and sell two higher-strike calls. Profits in a modest rally to the short strike, but the extra naked short call means unlimited risk on a sharp move up.'
    },
    {
      id: 'collar', name: 'Collar', category: 'single', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'stock', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: -5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['collar', 'protective collar', 'hedge wrapper'],
      blurb: 'Own the stock, buy a protective put below and sell a covered call above. The call premium pays for the put, fencing the stock into a defined range — capped upside, floored downside.'
    },
    {
      id: 'jade-lizard', name: 'Jade Lizard', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'short vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'short', theta: 'long', vega: 'short' },
      aka: ['jade lizard'],
      blurb: 'A short put plus a short call spread, sized so the total credit covers the call-spread width — leaving NO risk to the upside. All the risk is to the downside, like a short put.',
      components: [
        [ { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' } ],
        [ { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' }, { action: 'buy', type: 'call', strike: 10, qty: 1, expiry: 'near' } ]
      ]
    },
    {
      id: 'call-backspread', name: 'Call Backspread', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 10, qty: 2, expiry: 'near' }
      ],
      priceOutlook: 'bullish', volOutlook: 'long vol',
      profitPotential: 'unlimited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['call backspread', 'call ratio backspread', 'backspread', 'ratio backspread'],
      blurb: 'Sell one call and buy two higher-strike calls. A long-volatility bullish bet: limited, defined risk if it stalls near the long strike, but unlimited profit on a strong rally.'
    },
    {
      id: 'put-backspread', name: 'Put Backspread', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: -10, qty: 2, expiry: 'near' }
      ],
      priceOutlook: 'bearish', volOutlook: 'long vol',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'short', gamma: 'long', theta: 'short', vega: 'long' },
      aka: ['put backspread', 'put ratio backspread'],
      blurb: 'Sell one put and buy two lower-strike puts. A long-volatility bearish bet: defined risk if it stalls, with a large (bounded) payoff on a sharp drop.'
    },
    {
      id: 'synthetic-long-stock', name: 'Synthetic Long Stock', category: 'advanced', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bullish', volOutlook: 'neutral',
      profitPotential: 'unlimited', risk: 'limited',
      greeks: { delta: 'long', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['synthetic long stock', 'synthetic stock', 'synthetic long'],
      blurb: 'Buy a call and sell a put at the same strike. The combined position behaves exactly like owning the stock — a straight 45° P/L line — for little or no cash outlay.'
    },
    {
      id: 'synthetic-short-stock', name: 'Synthetic Short Stock', category: 'advanced', tier: 'Intermediate',
      legs: [
        { action: 'buy', type: 'put', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'bearish', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'undefined',
      greeks: { delta: 'short', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['synthetic short stock', 'synthetic short'],
      blurb: 'Buy a put and sell a call at the same strike. Behaves like being short the stock — a downward 45° line — with unlimited risk if the underlying rallies.'
    },
    {
      id: 'conversion', name: 'Conversion', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'stock', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 0, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['conversion'],
      blurb: 'Long stock combined with a synthetic short (long put + short call, same strike). A flat, near-riskless line — an arbitrage that locks in any mispricing between the stock and its synthetic.'
    },
    {
      id: 'reversal', name: 'Reversal', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'sell', type: 'stock', strike: 0, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 0, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: 0, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['reversal', 'reverse conversion', 'revcon'],
      blurb: 'Short stock combined with a synthetic long (long call + short put, same strike). A flat, near-riskless line — the mirror image of a conversion.'
    },
    {
      id: 'long-box', name: 'Long Box', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'buy', type: 'call', strike: -5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: 5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['box spread', 'box', 'long box', 'long box spread'],
      blurb: 'A bull call spread plus a bear put spread at the same two strikes. The payoff is a fixed amount — the strike width — no matter where the underlying lands. A riskless, bond-like position used to lock in a financing rate.',
      components: [
        [ { action: 'buy', type: 'call', strike: -5, qty: 1, expiry: 'near' }, { action: 'sell', type: 'call', strike: 5, qty: 1, expiry: 'near' } ],
        [ { action: 'buy', type: 'put', strike: 5, qty: 1, expiry: 'near' }, { action: 'sell', type: 'put', strike: -5, qty: 1, expiry: 'near' } ]
      ]
    },
    {
      id: 'short-box', name: 'Short Box', category: 'advanced', tier: 'Advanced',
      legs: [
        { action: 'sell', type: 'call', strike: -5, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'call', strike: 5, qty: 1, expiry: 'near' },
        { action: 'sell', type: 'put', strike: 5, qty: 1, expiry: 'near' },
        { action: 'buy', type: 'put', strike: -5, qty: 1, expiry: 'near' }
      ],
      priceOutlook: 'neutral', volOutlook: 'neutral',
      profitPotential: 'limited', risk: 'limited',
      greeks: { delta: 'neutral', gamma: 'neutral', theta: 'neutral', vega: 'neutral' },
      aka: ['short box', 'short box spread'],
      blurb: 'Selling the box — the mirror of a long box. Collects the strike width up front and repays it at expiration, effectively borrowing at a locked rate. Flat, riskless payoff.',
      components: [
        [ { action: 'sell', type: 'call', strike: -5, qty: 1, expiry: 'near' }, { action: 'buy', type: 'call', strike: 5, qty: 1, expiry: 'near' } ],
        [ { action: 'sell', type: 'put', strike: 5, qty: 1, expiry: 'near' }, { action: 'buy', type: 'put', strike: -5, qty: 1, expiry: 'near' } ]
      ]
    }
  ];

  // Helpers used across modes.
  function byId(id) {
    for (var i = 0; i < STRATEGIES.length; i++) if (STRATEGIES[i].id === id) return STRATEGIES[i];
    return null;
  }
  function all() { return STRATEGIES.slice(); }

  global.StrategyLib = {
    list: STRATEGIES,
    all: all,
    byId: byId,
    CATEGORIES: ['single', 'vertical', 'vol', 'advanced'],
    CATEGORY_LABELS: { single: 'Singles', vertical: 'Vertical Spreads', vol: 'Volatility', advanced: 'Advanced' },
    TIERS: ['Beginner', 'Intermediate', 'Advanced'],
    // register(...) lets strategies-time.js append once the model is settled.
    register: function (arr) { Array.prototype.push.apply(STRATEGIES, arr); }
  };
})(window);
