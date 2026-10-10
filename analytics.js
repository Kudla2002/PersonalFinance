/* Výpočty nad pohyby: souhrny, obchodníci, pravidelné platby, tempo měsíce, kalendář.
   Čisté funkce bez DOM, aby šly testovat samostatně. Částky jsou v haléřích. */
(function (root) {
  'use strict';

  const Rules = root.BudgetRules;
  let CAT = {};
  const init = cats => { CAT = cats; };

  const pad = n => String(n).padStart(2, '0');
  const ymOf = iso => iso.slice(0, 7);
  const shiftYM = (ym, delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const dayNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
  const kindOf = id => (CAT[id] ? CAT[id].kind : 'out');
  const baseNote = n => String(n || '').split(' · ')[0].trim();
  const median = a => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };

  function summarize(list) {
    const s = { in: 0, out: 0, save: 0, byCat: {}, byGrp: {}, n: list.length };
    for (const t of list) {
      const c = CAT[t.cat];
      if (!c) continue;
      s[c.kind] += t.amount;
      s.byCat[t.cat] = (s.byCat[t.cat] || 0) + t.amount;
      if (c.kind === 'out') s.byGrp[c.grp] = (s.byGrp[c.grp] || 0) + t.amount;
    }
    s.net = s.in - s.out;               // co se neutratilo (včetně odložení do spoření)
    s.left = s.net - s.save;            // co zbylo, aniž by to bylo odložené
    s.rate = s.in > 0 ? s.net / s.in : null;
    return s;
  }

  function byMonth(tx) {
    const m = {};
    for (const t of tx) (m[ymOf(t.date)] = m[ymOf(t.date)] || []).push(t);
    return m;
  }

  /* Posledních n měsíců končících ym (včetně), i prázdné. */
  function monthRange(ym, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(shiftYM(ym, -i));
    return out;
  }

  function series(tx, months) {
    const m = byMonth(tx);
    return months.map(ym => ({ ym, ...summarize(m[ym] || []) }));
  }

  /* Průměr kategorií za předchozí měsíce, které mají nějaká data (aby nezkresloval prázdný začátek). */
  function avgByCat(tx, ym, n) {
    const m = byMonth(tx);
    const months = monthRange(shiftYM(ym, -1), n).filter(k => (m[k] || []).length);
    const sum = {};
    for (const k of months) for (const [c, v] of Object.entries(summarize(m[k]).byCat)) sum[c] = (sum[c] || 0) + v;
    const avg = {};
    for (const [c, v] of Object.entries(sum)) avg[c] = v / (months.length || 1);
    return { avg, months: months.length };
  }

  /* Obchodníci: stejný obchod z různých poboček se sečte. */
  function merchants(list, kind) {
    const map = new Map();
    for (const t of list) {
      if (kind && kindOf(t.cat) !== kind) continue;
      const name = baseNote(t.note) || '(bez názvu)';
      const key = Rules.merchantKey(name) || name.toLowerCase();
      let g = map.get(key);
      if (!g) { g = { key, names: {}, cats: {}, n: 0, sum: 0, last: '', first: t.date, byMonth: {}, items: [] }; map.set(key, g); }
      g.n++; g.sum += t.amount; g.items.push(t);
      g.names[name] = (g.names[name] || 0) + 1;
      g.cats[t.cat] = (g.cats[t.cat] || 0) + 1;
      if (t.date > g.last) g.last = t.date;
      if (t.date < g.first) g.first = t.date;
      g.byMonth[ymOf(t.date)] = (g.byMonth[ymOf(t.date)] || 0) + t.amount;
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
    return [...map.values()].map(g => ({ ...g, name: top(g.names), cat: top(g.cats), avg: g.sum / g.n }))
      .sort((a, b) => b.sum - a.sum);
  }

  /* Pravidelné platby: stejný obchodník, podobná částka, odstup zhruba měsíc (nebo rok).
     Nejdřív se zkusí celý obchodník (pro proměnlivé částky, třeba energie), pak podle přesné částky
     (třeba několik různých předplatných pod jedním obchodníkem). */
  function recurring(tx, todayISO) {
    const today = dayNum(todayISO);
    const byKey = new Map();
    for (const t of tx) {
      if (kindOf(t.cat) !== 'out') continue;
      const name = baseNote(t.note);
      const key = Rules.merchantKey(name);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(t);
    }
    const found = [];
    const analyse = (items, key, label) => {
      const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
      // ve stejném měsíci víc plateb = nejde o pravidelnou měsíční platbu
      if (sorted.length < 3) return null;
      const days = sorted.map(t => dayNum(t.date));
      const gaps = days.slice(1).map((d, i) => d - days[i]);
      const med = median(gaps);
      const amounts = sorted.map(t => t.amount);
      const m = median(amounts);
      const spread = Math.max(...amounts) - Math.min(...amounts);
      const monthly = med >= 24 && med <= 38;
      const yearly = med >= 350 && med <= 380;
      if (!monthly && !yearly) return null;
      const okGaps = gaps.filter(g => (monthly ? g >= 20 && g <= 42 : g >= 340 && g <= 390)).length;
      if (okGaps < Math.max(2, Math.ceil(gaps.length * 0.7))) return null;
      return { sorted, med, m, spread, monthly, yearly, key, label };
    };
    for (const [key, items] of byKey) {
      let hit = null;
      const whole = analyse(items, key, key);
      if (whole && whole.spread <= whole.m * 0.35) hit = [whole];
      else {
        const byAmt = new Map();
        for (const t of items) { const k = Math.round(t.amount / 100); (byAmt.get(k) || byAmt.set(k, []).get(k)).push(t); }
        const parts = [...byAmt.values()].map(g => analyse(g, key, key)).filter(Boolean);
        if (parts.length) hit = parts;
      }
      if (!hit) continue;
      for (const h of hit) {
        const last = h.sorted[h.sorted.length - 1];
        const every = h.monthly ? 'měsíčně' : 'ročně';
        const gap = Math.round(h.med);
        const nextDay = dayNum(last.date) + gap;
        const next = new Date(nextDay * 864e5).toISOString().slice(0, 10);
        const ended = today - dayNum(last.date) > gap * 2.2;
        const names = {};
        for (const t of h.sorted) names[baseNote(t.note)] = (names[baseNote(t.note)] || 0) + 1;
        const cats = {};
        for (const t of h.sorted) cats[t.cat] = (cats[t.cat] || 0) + 1;
        found.push({
          key, name: Object.entries(names).sort((a, b) => b[1] - a[1])[0][0],
          cat: Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0],
          amount: Math.round(h.m), every, n: h.sorted.length, last: last.date, next, ended,
          perMonth: Math.round(h.monthly ? h.m : h.m / 12), items: h.sorted,
        });
      }
    }
    return found.sort((a, b) => (a.ended - b.ended) || (b.perMonth - a.perMonth));
  }

  /* Denní součty měsíce (výdaje a příjmy). */
  function daily(list, ym) {
    const n = daysIn(ym);
    const days = Array.from({ length: n }, (_, i) => ({ day: i + 1, date: `${ym}-${pad(i + 1)}`, out: 0, in: 0, n: 0 }));
    for (const t of list) {
      if (!t.date.startsWith(ym)) continue;
      const d = days[+t.date.slice(8, 10) - 1];
      const k = kindOf(t.cat);
      if (k === 'out') d.out += t.amount; else if (k === 'in') d.in += t.amount;
      d.n++;
    }
    return days;
  }

  /* Průběh měsíce: kumulativní výdaje po dnech a odhad konce měsíce.
     Pevné výdaje (nájem, daně…) se do tempa nepočítají, jen se přičtou, co už bylo zaplaceno. */
  function pace(list, ym, todayISO) {
    const n = daysIn(ym);
    const nowYM = ymOf(todayISO);
    const upTo = ym < nowYM ? n : ym === nowYM ? +todayISO.slice(8, 10) : 0;
    const days = daily(list, ym);
    const cum = [];
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += days[i].out; cum.push(i < upTo ? acc : null); }
    let fixed = 0, variable = 0;
    for (const t of list) {
      if (!t.date.startsWith(ym) || kindOf(t.cat) !== 'out') continue;
      if (CAT[t.cat].fixed) fixed += t.amount;
      else if (ym !== nowYM || +t.date.slice(8, 10) <= upTo) variable += t.amount;
    }
    const perDay = upTo > 0 ? variable / upTo : 0;
    const projected = ym === nowYM && upTo > 0 && upTo < n ? Math.round(fixed + perDay * n) : null;
    return { days, cum, upTo, fixed, variable, perDay, projected, spent: acc };
  }

  /* Kalendář měsíce: týdny od pondělí, buňky s denními součty. */
  function calendar(list, ym) {
    const days = daily(list, ym);
    const [y, m] = ym.split('-').map(Number);
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const cells = Array.from({ length: lead }, () => null).concat(days);
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, days };
  }

  /* Dny bez útraty v uplynulé části měsíce. */
  function noSpend(days, upTo) {
    let free = 0, best = 0, run = 0;
    for (let i = 0; i < upTo && i < days.length; i++) {
      if (days[i].out === 0) { free++; run++; best = Math.max(best, run); } else run = 0;
    }
    return { free, streak: best };
  }

  root.BudgetAnalytics = {
    init, pad, ymOf, shiftYM, daysIn, dayNum, baseNote, median,
    summarize, byMonth, monthRange, series, avgByCat, merchants, recurring, daily, pace, calendar, noSpend,
  };
}(typeof window !== 'undefined' ? window : globalThis));
