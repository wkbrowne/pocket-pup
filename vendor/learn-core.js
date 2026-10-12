/* learn-core.js
 * The learning engine shared by Population Pup and Last Bell.
 *
 * It decides WHICH skill to ask next and WHAT an answer means. It holds no screens, sounds, story,
 * storage or question text: each game supplies those through a small "host" object and keeps its own saves.
 *
 * A host provides:
 *   state()               the learner's saved state: an object with `sk` (records by key). The engine keeps its own
 *                         working data under `core` inside it and creates that if it is missing.
 *   key(group, id)        the key a skill's record is saved under. Each game keeps the keys it already uses.
 *   skills(group)         the ids of the skills in a group, in the order they are taught. A group is one subject at
 *                         one grade, for example Grade 4 math.
 *   lane(group)           the subject a group belongs to; groups in the same lane can lend each other warm-up skills.
 *   today()               the day number (whole days, local time).
 * and may provide:
 *   kinds(group, id)      how many different kinds of question the skill has (default 6)
 *   prereq(group, id)     the earlier skill this one rests on, as {group, id}, or null
 *   harder(group, id)     the same skill one grade up, as {group, id}, for stretch questions, or null
 *   live(group, id)       false to keep a skill out for now (for example one that needs a voice the device lacks)
 *   answered(group, id, ok, taught)   called once for every answer recorded
 *   random()              a source of randomness, for repeatable tests
 *   config                any of the settings in DEFAULTS below; a value may be a function, read each time
 *
 * A skill's record: n answered, r right, cs right in a row, miss recent misses, box 0 (shaky) to 4 (solid),
 * m mastered, slip, hist (last three answers), fast (rushed misses), w (missed kinds still open, each needing two
 * right answers), wx (an example of each), kd (kinds answered right), due and rv (review day and step), head (a
 * head start from a quick check), rest (the day it was rested).
 */
var LearnCore = (function () {
  'use strict';
  var VERSION = '1.1.0';
  var GAPS = [1, 3, 7, 14, 30, 60];      // REVIEW BY DAYS: a mastered skill comes back after 1 day, then 3, 7, 14, 30 and 60
  // SKILL BUILDER: the steps Granny Dot or the Guide takes, by why play stopped
  var STEPS = { miss: ['one'], intro: ['watch', 'two', 'all'], teach: ['watch', 'two', 'all', 'solo', 'solo'], refresh: ['watch', 'solo', 'solo'] };
  var DEFAULTS = {
    newStart: 6,        // new skills arrive a few at a time: enough to have this many going in a group...
    newPerDay: 4,       // ...then this many more a day (99 for no limit)
    early: true,        // while nothing started is shaky, the next new skill may come early
    inPlay: 8,          // ...but new skills wait while this many started skills are not yet mastered (99 for no limit)
    liftBelow: 0.75,    // when fewer than this share of the last ten answers were right, a strong skill is asked and new skills wait (0 for never)
    liftGap: 2,         // at least this many other questions between those
    retryAfter: 3,      // a missed skill comes back this many questions later
    retryGap: 2,        // at least this many other questions between retries (so at most one in three is a retry)
    retryCap: 6,        // retries waiting at once
    retryStop: 4,       // after this many misses in a row the quick retries stop, so one hard kind cannot take over
    retryKeep: 40,      // a retry that could not be asked within this many questions is dropped (its missed kind stays open)
    wantOpen: 0.7,      // how often a missed kind is asked for when its skill comes up
    stretch: 0          // how often a mastered skill comes back one grade harder (0 for never)
  };

  function hash(t) { var h = 0; for (var k = 0; k < t.length; k++) h = (h * 31 + t.charCodeAt(k)) | 0; return (h >>> 0).toString(36); }
  function box(st) { return st.box == null ? (st.m ? 3 : 1) : st.box; }
  function openKinds(st) { return st.w ? Object.keys(st.w) : []; }
  function solid(st) { return !!st.m || (st.n >= 3 && box(st) >= 2); }

  // A hint for a wrong number: what kind of slip it was, where that can be worked out. Returns null if it cannot say.
  function numberHint(question, answer, picked) {
    var a = +answer, v = +picked; if (!isFinite(a) || !isFinite(v) || a === v) return null;
    var m = /([\d,]+) ([+−×÷]) ([\d,]+) = \?/.exec(question);
    if (m) { var x = +m[1].replace(/,/g, ''), y = +m[3].replace(/,/g, '');
      if (m[2] === '−' && v === x + y) return 'Look at the sign. It says take away, but that is what you get when you add.';
      if (m[2] === '+' && v === Math.abs(x - y)) return 'Look at the sign. It says add, but that is what you get when you take away.';
      if (m[2] === '×' && v === x + y) return 'Look at the sign. It says multiply, but that is what you get when you add.';
      if (m[2] === '÷' && v === x - y) return 'Look at the sign. It says divide, but that is what you get when you take away.'; }
    var d = Math.round(Math.abs(v - a) * 100) / 100;
    if (d === 1) return 'So close: you are off by just 1. Check the ones again.';
    if (d === 10) return 'You are off by exactly 10. The ones are right, so check the tens again.';
    if (d === 100) return 'You are off by exactly 100. Check the hundreds again.';
    if (a && (v === a * 10 || v * 10 === a)) return 'Your digits look right, but they are in the wrong places. Check the place value.';
    return v > a ? 'That is too big. Work it through once more.' : 'That is too small. Work it through once more.';
  }

  function create(host) {
    var rnd = host.random || Math.random;
    function cfg(k) { var c = host.config || {}, v = c[k] === undefined ? DEFAULTS[k] : c[k]; return typeof v === 'function' ? v() : v; }
    function shuffle(a) { return a.map(function (v) { return [rnd(), v]; }).sort(function (x, y) { return x[0] - y[0]; }).map(function (v) { return v[1]; }); }
    function pickOf(a) { return a[Math.floor(rnd() * a.length)]; }
    function core() { var s = host.state(), c = s.core || (s.core = {}); c.n = c.n || 0; c.retry = c.retry || []; c.deck = c.deck || {}; c.fwd = c.fwd || {}; c.seenDay = c.seenDay || {}; c.support = c.support || []; c.recent = c.recent || []; if (!c.nd || c.nd.d !== host.today()) c.nd = { d: host.today(), c: {} }; return c; }
    function rec(group, id) { var s = host.state(), k = host.key(group, id); s.sk = s.sk || {}; return s.sk[k] || (s.sk[k] = { n: 0, r: 0, cs: 0, miss: 0 }); }
    function ids(group) { var all = host.skills(group) || []; return host.live ? all.filter(function (id) { return host.live(group, id) !== false; }) : all; }
    function has(group, id) { return (host.skills(group) || []).indexOf(id) >= 0; }
    function breadth(group, id) { var k = host.kinds ? host.kinds(group, id) : 6; return Math.min(rec(group, id).head ? 3 : 6, Math.max(1, k || 1)); }
    function card(group, id) { return '^' + group + '|' + id; }
    function uncard(c) { var cut = c.indexOf('|'); return { group: c.slice(1, cut), id: c.slice(cut + 1) }; }
    function prereq(group, id) { var p = host.prereq ? host.prereq(group, id) : null; return p && has(p.group, p.id) && !(p.group === group && p.id === id) ? p : null; }

    // WHICH SKILL NEXT.
    //  - A missed skill comes back a few questions later as the same kind ("One more try"); at most one question in three is a retry.
    //  - Each round deals every skill still being learned (a shaky one twice, unless that would crowd out the rest),
    //    every mastered skill whose review day has come, and any earlier skill being built up ("Warm-up").
    //  - New skills join a few at a time, in teaching order, and wait while enough are already in play. The same skill is never asked twice in a row.
    //  - After a run of misses new skills wait, and now and then a skill she is good at is asked ("lift"), so most answers stay right.
    // Returns {group, id, tag, want}: tag is '', 'One more try', 'Review', 'Warm-up' or 'Stretch'; want is a kind to ask for, or null.
    // A lift also carries lift: true; its tag is 'Review' for a mastered skill and '' otherwise.
    function pick(group) {
      var c = core(), now = host.today(), all = ids(group), lane = host.lane(group);
      var st = function (id) { return rec(group, id); }, rested = function (g, id) { return rec(g, id).rest === now; };
      var out = function (g, id, tag, want) { c.lastS = id; return { group: g, id: id, tag: tag || '', want: want || null, noRecord: tag === 'Stretch' }; };
      var sup = c.support.filter(function (x) { return host.lane(x.group) === lane && has(x.group, x.id); });
      // where a waiting retry lives: this group, or an earlier group's skill that is being built up
      var home = function (r) { if (r.g === group) return all.indexOf(r.s) >= 0 ? group : null; return sup.some(function (x) { return x.group === r.g && x.id === r.s; }) ? r.g : null; };
      c.retry = c.retry.filter(function (r) { return r && r.g && r.s && c.n - r.at < cfg('retryKeep'); });
      // room for new skills: started skills not yet mastered count against the limit
      var slots = cfg('inPlay') - all.filter(function (id) { var s2 = st(id); return s2.n > 0 && !s2.m; }).length;
      var low = c.recent.length >= 6 && c.recent.filter(function (x) { return x; }).length / c.recent.length < cfg('liftBelow');
      // new skills wait after a run of misses, unless so few are in play that one hard skill would hold everything up
      var hold = low && slots <= cfg('inPlay') / 2;
      if (low && (c.sinceLift == null ? 99 : c.sinceLift) >= cfg('liftGap')) {
        var strong = all.filter(function (id) { var s2 = st(id); return id !== c.lastS && s2.n > 0 && box(s2) >= 3 && !rested(group, id); }), going = strong.filter(function (id) { return !st(id).m; });
        if (strong.length) { var e = pickOf(going.length ? going : strong), o = out(group, e, st(e).m ? 'Review' : '', null);
          c.sinceLift = 0; c.gap = (c.gap || 0) + 1; if (c.deck[group]) c.deck[group] = c.deck[group].filter(function (x) { return x !== e; }); o.lift = true; return o; }
      }
      c.sinceLift = (c.sinceLift || 0) + 1;
      if ((c.gap || 0) >= cfg('retryGap')) {
        for (var q = 0; q < c.retry.length; q++) { var r = c.retry[q], g0 = r.at <= c.n && r.s !== c.lastS ? home(r) : null;
          if (g0 && !rested(g0, r.s)) { c.retry.splice(q, 1); c.gap = 0; return out(g0, r.s, g0 === group ? 'One more try' : 'Warm-up', r.sig); } }
      }
      c.gap = (c.gap || 0) + 1;
      var mine = function (x) { return x[0] !== '^'; }, cst = function (x) { return mine(x) ? st(x) : null; };
      var d = (c.deck[group] || []).filter(function (x) { return mine(x) ? all.indexOf(x) >= 0 : true; });
      var unseen = function (list) { return list.filter(function (x) { var s2 = cst(x); return s2 && !s2.n; }).length; };
      // on a new day the day's new skills join the round already under way
      if (d.length && c.seenDay[group] !== now) { var room0 = hold ? 0 : Math.min(cfg('newPerDay') - (c.nd.c[group] || 0), slots) - unseen(d), at = 1;
        all.forEach(function (id) { if (room0 > 0 && !st(id).n && d.indexOf(id) < 0 && !rested(group, id)) { d.splice(Math.min(d.length, at), 0, id); at += 2; room0--; } }); }
      c.seenDay[group] = now;
      // a skill mastered part-way through a round does not get its second turn: it waits for its review day
      if (!c.fwd[group]) d = d.filter(function (x) { var s2 = cst(x); return !s2 || !(s2.m && s2.due > now); });
      if (!d.length) {
        c.fwd[group] = false;
        var started = all.filter(function (id) { return st(id).n > 0; }).length, room = Math.max(cfg('newStart') - started, cfg('newPerDay') - (c.nd.c[group] || 0)), shaky = [];
        var steady = all.every(function (id) { var s2 = st(id); return !s2.n || s2.m || box(s2) >= 2; });
        if (room <= 0 && cfg('early') && steady) room = 1;
        room = hold ? 0 : Math.min(room, slots);
        all.forEach(function (id, i) { var s2 = st(id); if (rested(group, id)) return;
          if (!s2.n) { if (room-- > 0) d.push(id); return; }
          if (s2.m) { if (s2.due == null) s2.due = now + i % 4; if (s2.due <= now) d.push(id); return; }
          d.push(id); if (box(s2) === 0) shaky.push(id); });
        // an earlier skill she is building up takes a turn in every round until it is mastered
        c.support = c.support.filter(function (x) { return has(x.group, x.id) && !rec(x.group, x.id).m; });
        c.support.forEach(function (x) { if (host.lane(x.group) === lane && !rested(x.group, x.id)) d.push(card(x.group, x.id)); });
        if (shaky.length * 2 <= (d.length + shaky.length) / 3) d = d.concat(shaky);
        // nothing left to learn and nothing due today: bring forward the reviews that are due soonest
        if (!d.length) { d = all.filter(function (id) { return st(id).m && !rested(group, id); }).sort(function (x, y) { return (st(x).due || 0) - (st(y).due || 0); }).slice(0, 4); c.fwd[group] = d.length > 0; }
        if (!d.length) d = all.filter(function (id) { return st(id).n > 0; });
        if (!d.length) d = all.slice(0, Math.max(1, cfg('newStart')));
        d = shuffle(d);
        // open each round with something she is good at
        var si = -1; for (var k = 0; k < d.length && si < 0; k++) { var s3 = cst(d[k]); if (s3 && box(s3) >= 3) si = k; } if (si > 0) d.unshift(d.splice(si, 1)[0]);
      }
      var last = c.lastS, j = -1; for (var k2 = 0; k2 < d.length && j < 0; k2++) if ((mine(d[k2]) ? d[k2] : uncard(d[k2]).id) !== last) j = k2;
      var id;
      if (j < 0 && all.length > 1) {      // only the skill just asked is left in the round: ask a different one that is in play
        var others = all.filter(function (x) { return x !== last; }), inPlay = others.filter(function (x) { var s2 = st(x); return s2.n > 0 && !(s2.m && s2.due > now); });
        var begun = others.filter(function (x) { return st(x).n > 0; });
        id = pickOf(inPlay.length ? inPlay : begun.length ? begun : others.slice(0, Math.max(1, cfg('newStart'))));
      } else {
        var cardNow = d.splice(Math.max(0, j), 1)[0];
        if (!mine(cardNow)) { var u = uncard(cardNow); c.deck[group] = d; if (has(u.group, u.id)) { var wk0 = openKinds(rec(u.group, u.id))[0]; return out(u.group, u.id, 'Warm-up', wk0 && rnd() < cfg('wantOpen') ? wk0 : null); } id = pickOf(all); }
        else id = cardNow;
      }
      c.deck[group] = d;
      var s4 = st(id), wk = openKinds(s4)[0];
      if (s4.m && box(s4) >= 3 && cfg('stretch') && host.harder && rnd() < cfg('stretch')) { var up = host.harder(group, id); if (up && has(up.group, up.id)) return out(up.group, up.id, 'Stretch', null); }
      return out(group, id, s4.m ? 'Review' : '', wk && rnd() < cfg('wantOpen') ? wk : null);
    }

    // WHAT AN ANSWER MEANS. One answer goes into the record, and what comes back says what should happen next:
    //   'ok'      right: carry on
    //   'miss'    a single slip: a hint and a second try, then an explanation if needed
    //   'intro'   not taught yet (a miss the first time the skill is met, or "I'm not sure yet"): teach it, with no penalty
    //   'teach'   it keeps going wrong (two of the last three missed, or two rushed misses): the Skill Builder
    //   'refresh' a mastered skill has slipped twice: a refresher
    // Teaching happens only on one of these signs. A skill answered right from the start never gets a lesson.
    // how: {sig, ex, fast, unsure}: the kind of question, an example of it for the report, a rushed answer, "not sure".
    function record(group, id, ok, how) {
      how = how || {}; var c = core(), st = rec(group, id), first = !st.n, h = how.sig, now = host.today(); c.n++;
      c.recent = c.recent.concat(ok && !how.unsure ? 1 : 0).slice(-10);
      var again = function () { if ((st.miss || 0) < cfg('retryStop') && c.retry.length < cfg('retryCap') && !c.retry.some(function (r) { return r.g === group && r.s === id; })) c.retry.push({ g: group, s: id, at: c.n + cfg('retryAfter'), sig: h }); };
      // a missed kind has to be answered right twice before it is cleared; one example is kept for the grown-up report
      var open = function () { if (!h) return; st.w = st.w || {}; st.w[h] = 2; var ks = Object.keys(st.w); if (ks.length > 5) { delete st.w[ks[0]]; if (st.wx) delete st.wx[ks[0]]; } if (how.ex) (st.wx = st.wx || {})[h] = how.ex; };
      var tell = function (taught) { if (host.answered) host.answered(group, id, ok, taught); };
      if (first) c.nd.c[group] = (c.nd.c[group] || 0) + 1;
      st.n++;
      if (how.unsure || (first && !ok)) { tell(true); st.cs = 0; st.box = Math.min(box(st), 1); if (how.unsure) st.hist = (st.hist || []).concat(0).slice(-3); open(); again(); return 'intro'; }
      tell(false); st.hist = (st.hist || []).concat(ok ? 1 : 0).slice(-3);
      if (ok) {
        st.r = (st.r || 0) + 1; st.miss = Math.max(0, (st.miss || 0) - 1); st.cs = (st.cs || 0) + 1; st.box = Math.min(4, box(st) + 1);
        if (h && st.w && st.w[h] && --st.w[h] <= 0) { delete st.w[h]; if (st.wx) delete st.wx[h]; }
        if (h) { st.kd = st.kd || []; if (st.kd.indexOf(h) < 0) st.kd.push(h); if (st.kd.length > 12) st.kd.shift(); }
        if (st.m && st.cs >= 3) st.slip = 0;      // three right in a row forgives an old slip
        if (st.m && (st.due == null || st.due <= now)) { st.rv = Math.min(GAPS.length - 1, (st.rv || 0) + 1); st.due = now + GAPS[st.rv]; }
        // MASTERED: four right in a row, at least five answered, right on several different kinds, and no missed kind still open
        if (!st.m && st.cs >= 4 && st.n >= 5 && !openKinds(st).length && (!h || (st.kd || []).length >= breadth(group, id))) { st.m = true; st.slip = 0; st.rv = 0; st.due = now + GAPS[0]; }
        return 'ok';
      }
      st.miss = Math.min(6, (st.miss || 0) + 1); st.cs = 0; st.box = 0; open(); again(); if (how.fast) st.fast = (st.fast || 0) + 1;
      if (st.m) { st.rv = 0; st.due = now + GAPS[0]; st.slip = (st.slip || 0) + 1; if (st.slip >= 2) { st.m = false; st.slip = 0; st.hist = []; st.fast = 0; return 'refresh'; } }
      if (st.hist.filter(function (x) { return !x; }).length >= 2 || st.fast >= 2) { st.hist = []; st.fast = 0; return 'teach'; }
      return 'miss';
    }

    // STEPPING BACK. If a skill headed for the Skill Builder rests on an earlier skill that is not solid, that one is checked first.
    function warmupFor(group, id) { var p = prereq(group, id); return p && !solid(rec(p.group, p.id)) ? p : null; }
    // Three warm-up questions were asked: with two or three right the trouble is in the new part.
    // Otherwise the earlier skill is built first: it joins the daily rounds, and the harder skill is rested for today.
    function warmupDone(group, id, pre, right) {
      if (right >= 2) return 'on';
      var c = core(); rec(group, id).rest = host.today();
      c.support = c.support.filter(function (x) { return !(x.group === pre.group && x.id === pre.id); }).concat({ group: pre.group, id: pre.id, need: id });
      return 'back';
    }
    // The teaching steps for a skill ended well: it goes back into practice, and after the Skill Builder one more check is set a little later.
    function taught(group, id, mode, sig) {
      var c = core(), st = rec(group, id); st.miss = 0; st.hist = []; st.fast = 0;
      if (mode === 'teach') { if (sig && st.w) delete st.w[sig]; if (sig && st.wx) delete st.wx[sig];
        c.retry = c.retry.filter(function (r) { return !(r.g === group && r.s === id); }); c.retry.push({ g: group, s: id, at: c.n + 8, sig: sig }); }
    }
    function rest(group, id) { rec(group, id).rest = host.today(); }
    // QUICK CHECK: a right answer gives a head start (two more right answers master it), not mastery, because one answer can be luck.
    function headStart(group, id, sig) { var st = rec(group, id); st.head = 1; st.n = Math.max(st.n, 3); st.r = Math.max(st.r || 0, 3); st.cs = Math.max(st.cs || 0, 3); st.box = Math.max(3, box(st)); st.kd = st.kd || []; if (sig && st.kd.indexOf(sig) < 0) st.kd.push(sig); }
    // where the learner stands in a group
    function standing(group) {
      var now = host.today(), rows = (host.skills(group) || []).map(function (id) { return { id: id, st: rec(group, id) }; }), on = rows.filter(function (x) { return x.st.n > 0; });
      return { all: rows, mastered: rows.filter(function (x) { return x.st.m; }), due: rows.filter(function (x) { return x.st.m && x.st.due != null && x.st.due <= now; }),
        fresh: rows.filter(function (x) { return !x.st.n; }), weak: on.filter(function (x) { return !x.st.m && (box(x.st) === 0 || (x.st.miss || 0) >= 2); }), strong: on.filter(function (x) { return x.st.m || box(x.st) >= 3; }) };
    }
    function reset(group) { var c = core(); if (group) { delete c.deck[group]; delete c.fwd[group]; c.retry = c.retry.filter(function (r) { return r.g !== group; }); } else { c.deck = {}; c.fwd = {}; c.retry = []; c.gap = 0; } }

    return { rec: rec, pick: pick, record: record, breadth: breadth, prereq: prereq, warmupFor: warmupFor, warmupDone: warmupDone, taught: taught, rest: rest, headStart: headStart, standing: standing, reset: reset,
      total: function () { return core().n; }, support: function () { return core().support; }, retries: function () { return core().retry; }, core: core };
  }

  // ---- checks. A made-up learner and a made-up curriculum, so the rules can be tested with no game around them.
  function fakeHost(opts) {
    opts = opts || {}; var S = { sk: {} }, day = 0, seed = opts.seed || 7;
    var groups = { m4: [], e4: [], m3: [] }; for (var i = 0; i < (opts.skills || 12); i++) { groups.m4.push('m' + i); groups.e4.push('e' + i); } for (var j = 0; j < 6; j++) groups.m3.push('p' + j);
    var host = { state: function () { return S; }, key: function (g, id) { return g + '|' + id; }, skills: function (g) { return groups[g] || []; }, lane: function (g) { return g[0]; }, today: function () { return day; },
      kinds: function () { return opts.kinds || 6; }, prereq: function (g, id) { return g === 'm4' && +id.slice(1) < 6 ? { group: 'm3', id: 'p' + id.slice(1) } : null; },
      random: function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }, config: opts.config || {} };
    host.nextDay = function (n) { day += n == null ? 1 : n; }; host.fresh = function () { S = { sk: {} }; day = 0; }; host.S = function () { return S; };
    return host;
  }
  // Each rule is run on a made-up answer history. Every line should come back true.
  function checks() {
    var out = {}, H = fakeHost(), E = create(H), n = 0;
    var run = function (seq, sigFn, id) { H.fresh(); id = id || 'm0'; var vs = seq.map(function (a, q) { return E.record('m4', id, a[0] === 'R', { fast: a === 'Mf', unsure: a === 'U', sig: sigFn ? sigFn(q) : 'kind' + (n++) }); }); return { vs: vs, st: E.rec('m4', id) }; };
    var R = function (c) { var a = []; while (c--) a.push('R'); return a; }, r;
    r = run(['M']); out['a first-time miss is taught with no penalty'] = r.vs[0] === 'intro' && !r.st.miss && r.st.box === 1;
    r = run(['R', 'R', 'R']); out['right from the start means no lesson'] = r.vs.every(function (v) { return v === 'ok'; });
    r = run(['R', 'R', 'M']); out['one slip gets a hint and an explanation only'] = r.vs[2] === 'miss';
    r = run(['R', 'R', 'M', 'M']); out['two of the last three missed gets the Skill Builder'] = r.vs[3] === 'teach';
    r = run(['R', 'M', 'R', 'M']); out['two of the last three missed, not in a row, also does'] = r.vs[3] === 'teach';
    r = run(['R', 'R', 'R', 'Mf', 'R', 'R', 'Mf']); out['two rushed wrong answers get the Skill Builder'] = r.vs[3] === 'miss' && r.vs[6] === 'teach';
    r = run(['R', 'R', 'R', 'M', 'R', 'R', 'M']); out['two slow misses far apart do not'] = r.vs[6] === 'miss';
    r = run(['R', 'R', 'U']); out['"not sure yet" is taught with no penalty'] = r.vs[2] === 'intro' && !r.st.miss;
    out['mastery needs four in a row and five answered'] = run(R(4)).st.m !== true && run(R(4).concat(['M'], R(3))).st.m !== true;
    out['mastery needs several different kinds right'] = run(R(8), function () { return 'onekind'; }).st.m !== true && run(R(8)).st.m === true;
    r = run(['R', 'R', 'M', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], function (q) { return q === 2 || q === 3 ? 'hard' : 'k' + q; }); out['a missed kind must be answered right twice before mastery'] = r.st.m !== true;
    r = run(['R', 'R', 'M', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], function (q) { return q === 2 || q === 3 || q === 9 ? 'hard' : 'k' + q; }); out['and once it has been, mastery follows'] = r.st.m === true;
    r = run(R(8).concat(['M', 'R', 'R', 'M'])); out['a mastered skill that slips twice gets a refresher'] = r.vs[7] === 'ok' && r.vs[11] === 'refresh' && !r.st.m;
    r = run(R(8).concat(['M', 'R', 'R', 'R', 'M'])); out['but three right in a row forgives an old slip'] = r.vs[12] === 'miss' && r.st.m === true;
    r = run(R(8)); out['a newly mastered skill is due the next day'] = r.st.due === 1;
    H.nextDay(); E.record('m4', 'm0', true, { sig: 'r1' }); var a1 = r.st.due; H.nextDay(3); E.record('m4', 'm0', true, { sig: 'r2' }); var a2 = r.st.due; out['reviews space out: 3 days, then 7'] = a1 === 1 + 3 && a2 === 4 + 7;
    E.record('m4', 'm0', false, { sig: 'r3' }); out['a missed review comes back the next day'] = r.st.due === 5;
    var play = function (c, seen, okFor, g) { for (var q = 0; q < c; q++) { var p = E.pick(g || 'm4'); seen[p.group + '|' + p.id] = 1; E.record(p.group, p.id, okFor(p), { sig: 'p' + (n++) }); } };
    var size = function (o) { return Object.keys(o).length; }, seen;
    H.fresh(); seen = {}; play(60, seen, function (p) { return p.id !== 'm0'; }); out['while a skill is shaky, day one stays at six skills'] = size(seen) === 6;
    H.nextDay(); play(20, seen, function (p) { return p.id !== 'm0'; }); out["the next day brings the day's new skills, and no more"] = size(seen) === 6 + 4;
    H.fresh(); seen = {}; play(120, seen, function () { return true; }); out['when everything is going well, new skills come early'] = size(seen) > 6;
    H.fresh(); for (var q0 = 0; q0 < 8; q0++) E.record('m4', 'm0', true, { sig: 'x' + q0 }); var got = 0; for (var q1 = 0; q1 < 40; q1++) { var p1 = E.pick('m4'); if (p1.id === 'm0') got++; E.record(p1.group, p1.id, q1 % 5 > 0, { sig: 'z' + q1 }); }
    out['a mastered skill stays out of the rounds until its review day'] = E.rec('m4', 'm0').m === true && got === 0;
    H.fresh(); seen = {}; for (var q6 = 0; q6 < 200; q6++) { if (q6 && q6 % 20 === 0) H.nextDay(); var p6 = E.pick('m4'); seen[p6.id] = 1; E.record(p6.group, p6.id, true, { sig: 'same' }); }
    out['new skills wait while eight are in play and not yet mastered'] = size(seen) === 8;
    H.fresh(); for (var q7 = 0; q7 < 8; q7++) E.record('m4', 'm0', true, { sig: 'x' + q7 }); for (var q8 = 0; q8 < 8; q8++) E.record('m4', 'm' + (1 + q8 % 4), false, { sig: 'y' }); seen = {}; var lifts = 0, pl = E.pick('m4'), pl2 = E.pick('m4');
    out['after a run of misses a strong skill is asked, but not twice running'] = pl.lift === true && pl.id === 'm0' && pl.tag === 'Review' && !pl2.lift;
    for (var q9 = 0; q9 < 12; q9++) { var p9 = E.pick('m4'); if (p9.lift) lifts++; seen[p9.id] = 1; E.record(p9.group, p9.id, !!p9.lift, { sig: 'y' }); }
    out['and new skills wait until answers are going right again'] = lifts === 4 && size(seen) === 5;
    H.fresh(); lifts = 0; for (var q10 = 0; q10 < 60; q10++) { var p10 = E.pick('m4'); if (p10.lift) lifts++; E.record(p10.group, p10.id, q10 % 5 > 0, { sig: 'g' + q10 }); } out['with four answers in five right there is no lift'] = lifts === 0;
    H.fresh(); var w = E.warmupFor('m4', 'm2'); out['a skill can point back to an earlier one that is not solid'] = !!w && w.group === 'm3' && w.id === 'p2' && E.warmupFor('m4', 'm9') === null;
    out['two of three warm-ups right means the trouble is in the new part'] = E.warmupDone('m4', 'm2', w, 2) === 'on' && !E.support().length;
    out['otherwise the earlier skill is built first and the harder one rests'] = E.warmupDone('m4', 'm2', w, 1) === 'back' && E.support().length === 1 && E.rec('m4', 'm2').rest === H.today();
    var warm = 0, wrong = 0, rested = 0; for (var q2 = 0; q2 < 40; q2++) { var p2 = E.pick('m4'); if (p2.id === 'm2' && p2.group === 'm4') rested++; if (p2.group === 'm3') { warm++; if (p2.tag !== 'Warm-up' || p2.id !== 'p2') wrong++; } E.record(p2.group, p2.id, q2 % 3 > 0, { sig: 's' + (n++) }); }
    out['an earlier skill being built up takes turns in the rounds'] = warm >= 2 && !wrong && rested === 0;
    delete E.rec('m3', 'p2').w; for (var q3 = 0; q3 < 12; q3++) E.record('m3', 'p2', true, { sig: 'w' + q3 }); E.reset('m4'); for (var q4 = 0; q4 < 30; q4++) { var p3 = E.pick('m4'); E.record(p3.group, p3.id, true, { sig: 'v' + (n++) }); }
    out['and leaves them once it is mastered'] = !E.support().length;
    out['a skill is solid when mastered or going well'] = solid({ m: true, n: 1 }) && solid({ n: 3, box: 2 }) && !solid({ n: 2, box: 3 }) && !solid({ n: 5, box: 0 });
    H.fresh(); E.headStart('m4', 'm1', 'hs'); E.record('m4', 'm1', true, { sig: 'h1' }); E.record('m4', 'm1', true, { sig: 'h2' }); out['a head start means two more right answers master the skill'] = E.rec('m4', 'm1').m === true;
    H.fresh(); E.record('m4', 'm1', true, { sig: 'a' }); E.record('m4', 'm1', false, { sig: 'b' }); E.taught('m4', 'm1', 'teach', 'b'); out['after the Skill Builder the missed kind is cleared and one more check is set'] = !openKinds(E.rec('m4', 'm1')).length && E.retries().some(function (x) { return x.s === 'm1' && x.at === E.total() + 8; });
    H.fresh(); E.record('e4', 'e1', true, { sig: 'a' }); E.record('e4', 'e1', false, { sig: 'b' }); for (var q5 = 0; q5 < 50; q5++) { var p5 = E.pick('m4'); E.record(p5.group, p5.id, true, { sig: 'u' + (n++) }); }
    out['a retry that cannot be asked is dropped, and its missed kind stays open'] = !E.retries().length && openKinds(E.rec('e4', 'e1')).length === 1;
    out['number hints name the mistake'] = /add/.test(numberHint('52 − 17 = ?', 35, 69)) && /off by just 1/.test(numberHint('', 36, 37)) && /exactly 10/.test(numberHint('', 45, 55)) && /too big/.test(numberHint('', 45, 80)) && /place value/.test(numberHint('', 45, 450));
    return out;
  }
  // A pretend learner plays `total` answers on one group; a pretend day is 20 answers. Every promise the picker makes is checked on every pick.
  // opts: {skills, weak, total, acc, weakAcc, seed}. On a real host pass {host, engine, group, sigOf}.
  function simulate(opts) {
    opts = opts || {}; var H = opts.host || fakeHost({ skills: opts.skills || 28, seed: opts.seed }), E = opts.engine || create(H), group = opts.group || 'm4', total = opts.total || 300;
    var all = H.skills(group), weak = all.slice(0, opts.weak == null ? 3 : opts.weak), count = {}, broke = {}, verdicts = {}, last = null, lastRetry = -9, retries = 0, lifts = 0, lastRefresh = -99, n = 0, rnd = H.random || Math.random, cap = (H.config || {}).inPlay || DEFAULTS.inPlay;
    var bad = function (t) { broke[t] = 1; };
    for (var k = 0; k < total; k++) {
      if (k % 20 === 0 && k && opts.nextDay) opts.nextDay(); else if (k % 20 === 0 && k && H.nextDay) H.nextDay();
      var open0 = all.filter(function (x) { var s2 = E.rec(group, x); return s2.n && !s2.m; }).length, p = E.pick(group), st = E.rec(p.group, p.id), wasM = st.m, cs0 = st.cs || 0, n0 = st.n, home = p.group === group;
      if (home && !n0 && open0 >= cap && k - lastRefresh > 40) bad('a new skill started with too many in play'); if (p.lift) lifts++;
      if (home) count[p.id] = (count[p.id] || 0) + 1;
      if (home && wasM && st.due > H.today() && p.tag !== 'One more try' && !p.lift && !E.core().fwd[group] && all.some(function (x) { var s2 = E.rec(group, x); return x !== p.id && x !== last && s2.n && !s2.m && s2.rest !== H.today(); })) bad('a mastered skill came back before its review day');
      if (p.id === last) bad('same skill twice in a row'); last = p.id;
      if (p.tag === 'One more try') { retries++; if (k - lastRetry < 3) bad('two retries within three questions'); lastRetry = k; }
      var sig = opts.sigOf ? opts.sigOf(p) : (p.want && rnd() < .9 ? p.want : 'k' + Math.floor(rnd() * 8)), ok = rnd() < (home && weak.indexOf(p.id) >= 0 ? (opts.weakAcc == null ? .45 : opts.weakAcc) : (opts.acc == null ? .92 : opts.acc)), v = E.record(p.group, p.id, ok, { sig: sig });
      verdicts[v] = (verdicts[v] || 0) + 1; n++; if (v === 'refresh') lastRefresh = k;
      var keys = {}; E.retries().forEach(function (x) { if (keys[x.g + x.s]) bad('two retries waiting for one skill'); keys[x.g + x.s] = 1; });
      if (!wasM && st.m && !(cs0 + 1 >= 4 && n0 + 1 >= 5)) bad('mastered too early');
      if (!wasM && st.m && openKinds(st).length) bad('mastered with a missed kind still open');
      if (ok && v !== 'ok') bad('a right answer led to ' + v); if (!ok && v === 'ok') bad('a miss passed as right');
      if (!ok && !n0 && v !== 'intro') bad('a first-time miss was not treated as new'); if (v === 'intro' && st.box > 1) bad('a new skill was not kept low');
      if (!ok && v !== 'intro' && st.box !== 0) bad('a miss did not go to box 0'); if (st.box > 4) bad('box above 4');
    }
    var w = weak.reduce(function (a, id) { return a + (count[id] || 0); }, 0), others = all.filter(function (id) { return weak.indexOf(id) < 0; });
    return { broke: Object.keys(broke), retries: retries, lifts: lifts, verdicts: verdicts, mastered: all.filter(function (id) { return E.rec(group, id).m; }).length + ' of ' + all.length, weakShare: Math.round(w / total * 100) + '%',
      fewestOther: Math.min.apply(null, others.map(function (id) { return count[id] || 0; })), missing: others.filter(function (id) { return !count[id]; }) };
  }

  return { VERSION: VERSION, GAPS: GAPS, STEPS: STEPS, DEFAULTS: DEFAULTS, create: create, hash: hash, box: box, openKinds: openKinds, solid: solid, numberHint: numberHint, fakeHost: fakeHost, checks: checks, simulate: simulate };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LearnCore;
