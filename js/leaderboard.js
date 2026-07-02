/* ============================================================
 * leaderboard.js — Supabase-backed leaderboard client (no SDK).
 *
 * Talks to Supabase over plain fetch() against its PostgREST + RPC
 * endpoints, so there is NO external dependency and nothing to vendor.
 * The public anon key (window.LB_CONFIG) goes in the request headers.
 *
 * All WRITES go through the submit_score / rename_player RPCs (the only paths
 * RLS allows). READS are plain GETs against the public-readable `scores` table.
 *
 * Exposes global.Leaderboard:
 *   configured()                       -> bool (is the anon key filled in?)
 *   token()                            -> this browser's stable owner_token
 *   getNickname() / setNickname(n)
 *   postScore(game, {score,correct,attempted}, nickname?) -> Promise<{ok,error?}>
 *   board(game, limit?)                -> Promise<row[]> (all rows for a game)
 *   mountResult(container, game, stats)-> auto-post a finished run (or ask a name)
 *   renamePlayer(newNick)              -> Promise<{ok,error?}> (claim/rename)
 *   GAMES                              -> [{id,label}, ...]
 * ============================================================ */
(function (global) {
  'use strict';

  var CFG = global.LB_CONFIG || {};
  var BASE = String(CFG.url || '').replace(/\/+$/, '');
  var KEY = String(CFG.anonKey || '');
  var REST = BASE + '/rest/v1';
  var NICK_KEY = 'ost:nickname';
  var TOKEN_KEY = 'ost:token';

  function configured() {
    return !!(BASE && KEY && KEY.indexOf('PASTE') === -1);
  }

  /* ---- identity: a stable random token per browser ---- */
  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    var b = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b);
    else for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h[0]+h[1]+h[2]+h[3] + '-' + h[4]+h[5] + '-' + h[6]+h[7] + '-' + h[8]+h[9] + '-' + h[10]+h[11]+h[12]+h[13]+h[14]+h[15];
  }

  function token() {
    var t = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (!t) { t = uuid(); try { localStorage.setItem(TOKEN_KEY, t); } catch (e2) {} }
    return t;
  }
  function getNickname() { try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; } }
  function setNickname(n) { try { localStorage.setItem(NICK_KEY, n); } catch (e) {} }

  function headers(extra) {
    var h = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  var SELECT = 'nickname,score,correct,attempted,created_at,owner_token';

  /* ---- normalize a Postgres/PostgREST error into a short code ---- */
  function normalizeErr(msg) {
    msg = String(msg || '');
    if (msg.indexOf('name_taken') >= 0) return 'name_taken';
    if (msg.indexOf('invalid_nickname') >= 0) return 'invalid_nickname';
    if (msg.indexOf('invalid_score') >= 0 || msg.indexOf('invalid_counts') >= 0) return 'invalid_score';
    if (msg.indexOf('invalid_game') >= 0) return 'invalid_game';
    if (msg.indexOf('rate_limited') >= 0) return 'rate_limited';
    return msg || 'error';
  }

  /* ---- write: submit a score via the vetted RPC ---- */
  function postScore(game, stats, nickname) {
    if (!configured()) return Promise.resolve({ ok: false, error: 'not_configured' });
    var nick = (nickname != null ? nickname : getNickname()) || '';
    var body = {
      p_game: game,
      p_nickname: nick,
      p_token: token(),
      p_score: stats.score | 0,
      p_correct: stats.correct | 0,
      p_attempted: stats.attempted | 0
    };
    return fetch(REST + '/rpc/submit_score', { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      .then(function (res) {
        if (res.ok) { setNickname(nick); return { ok: true }; }
        return res.json().catch(function () { return {}; }).then(function (j) {
          return { ok: false, error: normalizeErr(j && (j.message || j.hint || j.details)) };
        });
      })
      .catch(function () { return { ok: false, error: 'network' }; });
  }

  /* ---- read: all rows for a game (both categories) ----
     One combined board per game: each player has up to two stored rows
     (best-overall + best-perfect). The tab merges/dedupes/ranks them
     client-side, so we just pull everything for the game. Row counts are
     tiny (an intern cohort), so a generous limit is plenty. */
  function board(game, limit) {
    if (!configured()) return Promise.resolve([]);
    var q = REST + '/scores?game=eq.' + encodeURIComponent(game) +
            '&order=score.desc,created_at.asc&limit=' + (limit || 500) +
            '&select=' + SELECT;
    return fetch(q, { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  /* ---- reusable "Post to leaderboard" UI (self-contained DOM) ---- */
  var NICK_RE = /^[A-Za-z0-9 _-]{2,16}$/;
  var lastGame = null;   // remembered so the Leaderboard tab opens to the last game played

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  // Auto-post a finished run into `container`. stats = {score, correct, attempted}.
  // If a nickname is set, submits silently and updates the player's best-points
  // and best-accuracy rows (server keeps the better). If no nickname yet, asks
  // for one once (then future finishes post automatically). No-op if unconfigured.
  function mountResult(container, game, stats) {
    if (!configured()) return;
    lastGame = game;
    var wrap = el('div', { class: 'lb-post', style: 'margin-top:14px' });
    container.appendChild(wrap);

    function viewLink() {
      var a = el('button', { class: 'btn', style: 'margin-top:8px', text: '🏆 View leaderboard' });
      a.onclick = function () { if (global.App && global.App.go) global.App.go('leaderboard'); };
      return a;
    }

    function post(nick) {
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'tag-line', text: 'Saving to leaderboard…' }));
      postScore(game, stats, nick).then(function (r) {
        wrap.innerHTML = '';
        if (r.ok) {
          wrap.appendChild(el('div', { class: 'feedback ok', text: '✓ Saved to the leaderboard as ' + (nick || getNickname()) + '.' }));
          wrap.appendChild(viewLink());
          return;
        }
        if (r.error === 'name_taken') { ask('That nickname is taken — pick another.'); return; }
        if (r.error === 'invalid_nickname') { ask('Use 2–16 letters, numbers, spaces, _ or -.'); return; }
        var msg = r.error === 'rate_limited' ? 'Too many submissions — wait a moment.'
                : r.error === 'invalid_score' ? 'That score could not be saved.'
                : 'Leaderboard unavailable right now.';
        wrap.appendChild(el('div', { class: 'feedback no', text: '✗ ' + msg }));
        // let a transient failure (network/rate limit) be retried without replaying the game
        var retry = el('button', { class: 'btn', style: 'margin-top:8px', text: '↻ Try again' });
        retry.onclick = function () { post(nick); };
        wrap.appendChild(retry);
      });
    }

    function ask(msg) {
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'tag-line', text: msg || 'Enter a nickname to join the leaderboard (your scores save automatically after this):' }));
      var inp = el('input', { class: 'q-input', type: 'text', maxlength: '16', placeholder: 'Nickname (2–16 chars)…', autocomplete: 'off', style: 'max-width:240px' });
      var save = el('button', { class: 'btn primary', text: 'Join ▸', style: 'margin-left:8px' });
      var note = el('div', { style: 'margin-top:8px' });
      function submit() {
        var v = (inp.value || '').trim();
        if (!NICK_RE.test(v)) {
          note.innerHTML = '';
          note.appendChild(el('div', { class: 'feedback no', text: '✗ Use 2–16 letters, numbers, spaces, _ or -.' }));
          inp.focus();
          return;
        }
        post(v);
      }
      save.onclick = submit;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      wrap.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [inp, save]));
      wrap.appendChild(note);
      inp.focus();
    }

    var nick = getNickname();
    if (nick && NICK_RE.test(nick)) post(nick);
    else ask();
  }

  /* ---- change/claim a nickname for this browser's token ---- */
  function renamePlayer(newNick) {
    if (!configured()) return Promise.resolve({ ok: false, error: 'not_configured' });
    var v = (newNick || '').trim();
    if (!NICK_RE.test(v)) return Promise.resolve({ ok: false, error: 'invalid_nickname' });
    return fetch(REST + '/rpc/rename_player', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_token: token(), p_new: v })
    }).then(function (res) {
      if (res.ok) { setNickname(v); return { ok: true }; }
      return res.json().catch(function () { return {}; }).then(function (j) {
        return { ok: false, error: normalizeErr(j && (j.message || j.hint || j.details)) };
      });
    }).catch(function () { return { ok: false, error: 'network' }; });
  }

  global.Leaderboard = {
    configured: configured,
    token: token,
    getNickname: getNickname,
    setNickname: setNickname,
    postScore: postScore,
    board: board,
    mountResult: mountResult,
    renamePlayer: renamePlayer,
    get lastGame() { return lastGame; },
    GAMES: [
      { id: 'box-pricing',   label: 'Box Pricing' },
      { id: 'option-value',  label: 'Option Value' },
      { id: 'moneyness',     label: 'Moneyness Flash' },
      { id: 'breakeven',     label: 'Break-even' },
      { id: 'greeks',        label: 'Greeks: Identify' },
      { id: 'greeks-predict',label: 'Greeks: Predict P&L' },
      { id: 'outlook',       label: 'Outlook → Strategy' },
      { id: 'match',         label: 'Match' },
      { id: 'memory',        label: 'Memory' }
    ]
  };
})(window);
