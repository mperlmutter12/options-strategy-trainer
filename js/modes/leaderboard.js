/* ============================================================
 * modes/leaderboard.js — the Leaderboard tab.
 * One combined board per game, ranked by score, with ACC (correct/
 * attempted) and ACC% columns. Each player keeps up to two rows: their
 * best-scoring run and their best flawless (100%) run — merged here from
 * the two stored category rows and deduped when they're the same run.
 * Reads via global.Leaderboard. Purely additive: if Supabase isn't
 * configured/reachable it degrades to a message and never blocks the app.
 * ============================================================ */
(function (global) {
  'use strict';

  var MEDAL = ['🥇', '🥈', '🥉'];

  function pctNum(r) { return r.attempted > 0 ? Math.round(100 * r.correct / r.attempted) : -1; }
  function pctText(r) { return r.attempted > 0 ? pctNum(r) + '%' : '—'; }

  // Merge a player's stored rows into one board: drop exact duplicates
  // (a player whose best-overall run IS their best-perfect run), then rank by
  // the active column header:
  //   'score' — score desc, then accuracy desc
  //   'acc'   — accuracy desc, then score desc (ties within a shown % go to score)
  // Accuracy uses the displayed (rounded) percent, so rows showing the same %
  // group together and are ordered by score within that group. (Acc% is just the
  // percentage readout of Acc — it is not a separate sort.)
  function dedupeSort(rows, sortMode) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var k = r.owner_token + '|' + r.score + '|' + r.correct + '|' + r.attempted;
      if (seen[k]) return;
      seen[k] = true;
      out.push(r);
    });
    out.sort(function (a, b) {
      var pa = pctNum(a), pb = pctNum(b);
      if (sortMode === 'acc') {
        if (pb !== pa) return pb - pa;
        if (b.score !== a.score) return b.score - a.score;
      } else {
        if (b.score !== a.score) return b.score - a.score;
        if (pb !== pa) return pb - pa;
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });
    return out;
  }

  function init(view, ctx) {
    var h = ctx.h;
    var LB = global.Leaderboard;

    view.appendChild(h('h1', { text: 'Leaderboard' }));

    if (!LB || !LB.configured()) {
      view.appendChild(h('div', { class: 'muted-box' }, [
        h('p', { class: 'sub', text: 'The leaderboard is not set up yet. Once it is, your scores show up here automatically.' })
      ]));
      return;
    }

    view.appendChild(h('p', { class: 'sub', text: 'How everyone stacks up — ranked by score, with accuracy. Each player keeps their top-scoring run and their top 100%-accuracy run. Scores save automatically when you finish a game.' }));

    var idLine = h('div', { class: 'tag-line', style: 'margin:2px 2px 14px' });
    view.appendChild(idLine);

    var state = { game: LB.lastGame || LB.GAMES[0].id, sort: 'score' };

    var controls = h('div', { class: 'muted-box', style: 'margin-bottom:16px' });
    var gsel = h('select', { class: 'btn ghost' });
    LB.GAMES.forEach(function (g) { gsel.appendChild(h('option', { value: g.id, text: g.label })); });
    gsel.value = state.game;
    gsel.addEventListener('change', function () { state.game = gsel.value; load(); });

    var refreshBtn = h('button', { class: 'btn ghost', text: '↻ Refresh' });
    refreshBtn.onclick = function () { load(); };

    controls.appendChild(h('div', { class: 'row toolbar' }, [
      h('span', { class: 'tag-line', text: 'Game' }), gsel,
      h('span', { style: 'flex:1' }),
      refreshBtn
    ]));
    view.appendChild(controls);
    view.appendChild(h('p', { class: 'tag-line', style: 'margin:-6px 2px 10px', text: 'Click the Score or Acc header to sort.' }));

    var area = h('div');
    view.appendChild(area);

    function rowEl(rank, r, isMe, noMedal) {
      var medal = (!noMedal && MEDAL[rank - 1]) || '';
      return h('div', { class: 'lb-row' + (isMe ? ' lb-me' : '') }, [
        h('span', { class: 'lb-rank mono', text: medal || String(rank) }),
        h('span', { class: 'lb-name', text: r.nickname }),
        h('span', { class: 'lb-score mono', text: String(r.score) }),
        h('span', { class: 'lb-detail mono dim', text: r.correct + '/' + r.attempted }),
        h('span', { class: 'lb-pct mono dim', text: pctText(r) })
      ]);
    }

    function head(cls, label, key) {
      var active = state.sort === key;
      return h('span', {
        class: cls + ' lb-sortable' + (active ? ' lb-sort-active' : ''),
        onclick: function () { if (state.sort !== key) { state.sort = key; load(); } },
        text: active ? label + ' ▾' : label
      });
    }
    function header() {
      return h('div', { class: 'lb-row lb-head' }, [
        h('span', { class: 'lb-rank', text: '#' }),
        h('span', { class: 'lb-name', text: 'Player' }),
        head('lb-score', 'Score', 'score'),
        head('lb-detail', 'Acc', 'acc'),
        h('span', { class: 'lb-pct', text: 'Acc%' })   // readout of Acc, not a separate sort
      ]);
    }

    function load() {
      var game = state.game, myToken = LB.token();
      area.innerHTML = '';
      area.appendChild(h('p', { class: 'tag-line', text: 'Loading…' }));

      LB.board(game).then(function (rows) {
        if (state.game !== game) return;   // selection changed mid-load
        area.innerHTML = '';
        var all = dedupeSort(rows || [], state.sort);
        if (!all.length) {
          area.appendChild(h('div', { class: 'muted-box' }, [
            h('p', { class: 'sub', text: 'No scores yet — be the first. Finish a game and your score saves here automatically.' })
          ]));
          return;
        }

        var box = h('div', { class: 'muted-box lb-table' });
        box.appendChild(header());
        var meInTop = false;
        all.slice(0, 10).forEach(function (r, i) {
          var isMe = r.owner_token === myToken;
          if (isMe) meInTop = true;
          box.appendChild(rowEl(i + 1, r, isMe));
        });
        area.appendChild(box);

        if (!meInTop) {
          var idx = -1;
          for (var i = 0; i < all.length; i++) {
            if (all[i].owner_token === myToken) { idx = i; break; }
          }
          if (idx >= 0) {
            var wrap = h('div', { class: 'muted-box lb-table', style: 'margin-top:10px' });
            wrap.appendChild(h('div', { class: 'tag-line', style: 'margin-bottom:4px', text: 'Your best' }));
            wrap.appendChild(rowEl(idx + 1, all[idx], true, true));
            area.appendChild(wrap);
          }
        }
      });
    }

    // "Posting as X · Change name" line (or a "Set a nickname" prompt if none)
    function renderId() {
      idLine.innerHTML = '';
      var nick = LB.getNickname();
      if (nick) {
        idLine.appendChild(h('span', { text: 'Posting as ' }));
        idLine.appendChild(h('span', { class: 'lb-idname', text: nick }));
        idLine.appendChild(h('span', { text: '  ·  ' }));
        var chg = h('span', { class: 'lb-link', text: 'Change name' });
        chg.onclick = promptName;
        idLine.appendChild(chg);
      } else {
        idLine.appendChild(h('span', { text: 'You’re not on the board yet — scores save automatically once you set a name.  ' }));
        var set = h('span', { class: 'lb-link', text: 'Set a nickname' });
        set.onclick = promptName;
        idLine.appendChild(set);
      }
    }
    function promptName() {
      idLine.innerHTML = '';
      var inp = h('input', { class: 'q-input', type: 'text', maxlength: '16', placeholder: 'Nickname (2–16 chars)…', autocomplete: 'off', style: 'max-width:220px' });
      inp.value = LB.getNickname() || '';
      var save = h('button', { class: 'btn primary', style: 'margin-left:8px', text: 'Save' });
      var cancel = h('span', { class: 'lb-link', style: 'margin-left:10px', text: 'cancel' });
      var msg = h('span', { class: 'tag-line', style: 'margin-left:10px' });
      function submit() {
        var v = (inp.value || '').trim();
        if (!/^[A-Za-z0-9 _-]{2,16}$/.test(v)) { msg.textContent = 'Use 2–16 letters, numbers, spaces, _ or -.'; return; }
        save.disabled = true; msg.textContent = 'Saving…';
        LB.renamePlayer(v).then(function (r) {
          if (r.ok) { renderId(); load(); }
          else { save.disabled = false; msg.textContent = r.error === 'name_taken' ? 'That name is taken.' : 'Could not save — try again.'; }
        });
      }
      save.onclick = submit;
      cancel.onclick = renderId;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') renderId(); });
      idLine.appendChild(inp); idLine.appendChild(save); idLine.appendChild(cancel); idLine.appendChild(msg);
      inp.focus();
    }
    renderId();

    load();
  }

  global.App.registerMode({
    id: 'leaderboard', label: 'Leaderboard', minStrategies: 0,
    blurb: 'See how everyone stacks up — ranked by score, with accuracy.',
    init: init
  });
})(window);
