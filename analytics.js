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


  /* ---------- Zbytečné výdaje ----------
     Hodnotí poslední (nejvýš) 3 uzavřené měsíce s daty. Vrací upozornění s částkou za měsíc a za rok,
     konkrétním tipem a seznamem pohybů, ze kterých vychází. Nic nehádá: všechno je součet skutečných plateb. */
  const GENERIC = new Set(['restaurace', 'bistro', 'cafe', 'kavarna', 'potraviny', 'bar', 'pivnice', 'hotel', 'trafika', 'the', 'u', 'la', 'le', 'el', 'na', 'pizza', 'pizzeria', 'hospoda', 'pub', 'brno', 'praha']);
  const brandOf = key => {
    const first = String(key || '').split(' ')[0].split(/[.\-]/)[0];
    return first && first.length >= 2 && !GENERIC.has(first) ? first : key;
  };
  const brandLabel = name => {
    const w = String(name || '').split(' ')[0].split(/[./*]/)[0];
    return w.length >= 2 ? (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()) : name;
  };
  // rodiny předplatných, které se často platí víckrát pod různými názvy
  const SUB_FAMILY = [['Claude', /claude|anthropic/i], ['Apple', /apple/i], ['Google', /google|youtube/i], ['Spotify', /spotify/i], ['Netflix', /netflix/i], ['Microsoft', /microsoft|office 365|xbox/i], ['ChatGPT', /openai|chatgpt/i]];

  const pl = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  const kc = v => `${Math.round(v / 100).toLocaleString('cs-CZ')} Kč`;

  function leakWindow(tx, todayISO) {
    const nowYM = ymOf(todayISO);
    const yms = [...new Set(tx.map(t => ymOf(t.date)))].filter(ym => ym < nowYM).sort();
    return yms.slice(-3);
  }

  function leaks(tx, todayISO) {
    const months = leakWindow(tx, todayISO);
    if (!months.length) return { months, items: [], potential: 0 };
    const nm = months.length;
    const set = new Set(months);
    const list = tx.filter(t => set.has(ymOf(t.date)) && kindOf(t.cat) === 'out');
    const pm = v => Math.round(v / nm);
    const items = [];
    const sev = v => (v >= 300000 ? 'high' : v >= 100000 ? 'mid' : 'low');
    const add = o => { o.id = o.id.toLowerCase().replace(/[^a-z0-9_:.\-]/g, '_').slice(0, 80); o.perYear = o.perMonth * 12; o.sev = o.sev || sev(o.perMonth); items.push(o); };

    // 1) časté drobné útraty u jednoho obchodu nebo řetězce (káva, fast food, hospoda)
    const OFTEN = { kavarna: 'Kafe s sebou z domu nebo termoska v práci. Omez to na 2× týdně a ušetříš víc než polovinu.',
      restaurace: 'Fast food a obědy venku: připrav si jídlo na 2–3 dny dopředu a choď ven cíleně, ne ze zvyku.',
      hospoda: 'Domluv si pevný rozpočet na večer nebo jednu hospodu týdně. Částka roste hlavně opakováním.' };
    const groups = new Map();
    for (const m of merchants(list.filter(t => OFTEN[t.cat]), 'out')) {
      const b = brandOf(m.key);
      let g = groups.get(b);
      if (!g) { g = { keys: [], names: {}, n: 0, sum: 0, cats: {}, items: [] }; groups.set(b, g); }
      g.keys.push(m.key); g.n += m.n; g.sum += m.sum; g.items.push(...m.items);
      g.names[m.name] = (g.names[m.name] || 0) + m.n;
      g.cats[m.cat] = (g.cats[m.cat] || 0) + m.n;
    }
    for (const [b, g] of groups) {
      const perN = g.n / nm, avg = g.sum / g.n, perMonth = pm(g.sum);
      if (perN < 4 || avg > 40000 || perMonth < 60000) continue;
      const cat = Object.entries(g.cats).sort((x, y) => y[1] - x[1])[0][0];
      const top = Object.entries(g.names).sort((x, y) => y[1] - x[1])[0][0];
      const title = g.keys.length > 1 ? `${brandLabel(top)} (${g.keys.length} pobočky)` : top;
      add({ id: 'often:' + b, kind: 'often', cat, title, perMonth, n: Math.round(perN), avg: Math.round(avg),
        text: `${Math.round(perN)}× za měsíc, v průměru ${kc(avg)} za návštěvu.`, tip: OFTEN[cat], ids: g.items.map(t => t.id) });
    }

    // 2) celé kategorie, kde je drahá hlavně pohodlnost
    const byCat = {};
    for (const t of list) (byCat[t.cat] = byCat[t.cat] || []).push(t);
    const rozvoz = byCat.rozvoz || [];
    if (pm(rozvoz.reduce((a, t) => a + t.amount, 0)) >= 100000) {
      const sum = rozvoz.reduce((a, t) => a + t.amount, 0);
      add({ id: 'cat:rozvoz', kind: 'cat', cat: 'rozvoz', title: 'Rozvoz jídla a krabičky', perMonth: pm(sum), n: Math.round(rozvoz.length / nm),
        text: `${pl(Math.round(rozvoz.length / nm), 'objednávka', 'objednávky', 'objednávek')} za měsíc.`,
        tip: 'Rozvoz stojí za jídlo i za pohodlí (doručení, servisní poplatek, přirážka). Krabičky dávají smysl, jen když je opravdu sníš; jinak vař na víc dní.', ids: rozvoz.map(t => t.id) });
    }
    const taxi = byCat.taxi || [];
    const tsum = taxi.reduce((a, t) => a + t.amount, 0);
    if (pm(tsum) >= 60000) {
      const short = taxi.filter(t => t.amount < 15000);
      const ssum = short.reduce((a, t) => a + t.amount, 0);
      add({ id: 'cat:taxi', kind: 'cat', cat: 'taxi', title: 'Taxi a Bolt', perMonth: pm(tsum), n: Math.round(taxi.length / nm),
        text: `${pl(Math.round(taxi.length / nm), 'jízda', 'jízdy', 'jízd')} za měsíc` + (short.length ? `, z toho ${Math.round(short.length / nm)} pod 150 Kč (${kc(pm(ssum))} měsíčně).` : '.'),
        tip: short.length ? 'Jízdy pod 150 Kč jsou vzdálenosti na MHD, kolo nebo pěšky. Bolt nech na noc a na kufr.' : 'Zkus, které jízdy šly nahradit MHD.', ids: taxi.map(t => t.id) });
    }
    const tab = byCat.tabak || [];
    const tabsum = tab.reduce((a, t) => a + t.amount, 0);
    if (tab.length && pm(tabsum) >= 20000) {
      add({ id: 'cat:tabak', kind: 'cat', cat: 'tabak', title: 'Trafika a tabák', perMonth: pm(tabsum), n: Math.round(tab.length / nm),
        text: `${pl(Math.round(tab.length / nm), 'nákup', 'nákupy', 'nákupů')} za měsíc.`, tip: 'Tahle položka nemá žádnou návratnost. Každé omezení je čistá úspora.', ids: tab.map(t => t.id) });
    }

    // 3) předplatná: stejná služba placená víckrát v jednom měsíci
    const subs = byCat.predplatne || [];
    for (const [fam, re] of SUB_FAMILY) {
      const f = subs.filter(t => re.test(t.note));
      if (!f.length) continue;
      const names = new Set(f.map(t => Rules.merchantKey(baseNote(t.note))));
      const byM = {};
      for (const t of f) (byM[ymOf(t.date)] = byM[ymOf(t.date)] || []).push(t);
      const dupM = Object.entries(byM).filter(([, a]) => a.length > 1);
      if (names.size > 1 && dupM.length) {
        const [ym, a] = dupM[dupM.length - 1];
        const parts = a.map(t => `${baseNote(t.note)} ${kc(t.amount)}`).join(' + ');
        const extra = dupM.flatMap(([, arr]) => arr.slice().sort((x, y) => y.amount - x.amount).slice(1));
        add({ id: 'sub:' + fam.toLowerCase(), kind: 'sub', cat: 'predplatne', title: `${fam}: platíš víc předplatných`, perMonth: pm(dupM.reduce((s, [, arr]) => s + arr.slice().sort((x, y) => y.amount - x.amount).slice(1).reduce((q, t) => q + t.amount, 0), 0)),
          text: `${ym.slice(5, 7)}/${ym.slice(0, 4)}: ${parts}.`, tip: 'Zkontroluj, jestli nemáš stejnou službu dvakrát (třeba web a aplikace, nebo dva účty). Nepotřebné zruš.', ids: extra.map(t => t.id) });
      }
    }
    const subSum = subs.reduce((a, t) => a + t.amount, 0);
    const subServices = new Set(subs.map(t => Rules.merchantKey(baseNote(t.note))));
    if (subServices.size >= 4 && pm(subSum) >= 50000) {
      add({ id: 'sub:all', kind: 'sub', cat: 'predplatne', title: 'Předplatná celkem', perMonth: pm(subSum), sev: 'low', n: subServices.size,
        text: `${pl(subServices.size, 'služba', 'služby', 'služeb')}.`, tip: 'Projdi seznam v Plánu → Pravidelné platby. Co jsi za poslední měsíc nepoužil, zruš.', ids: subs.map(t => t.id), overlap: true });
    }

    // 4) poplatky bance (dají se skoro vždy zrušit nebo snížit)
    const fees = list.filter(t => t.cat === 'poplatky' && /poplatek|komer[cč]n[ií] banka|\bkb\b|ceska sporitelna|csob|moneta|vedeni uctu/i.test(Rules.fold(t.note)));
    const fsum = fees.reduce((a, t) => a + t.amount, 0);
    if (fees.length) {
      add({ id: 'fee:bank', kind: 'fee', cat: 'poplatky', title: 'Poplatky bance', perMonth: pm(fsum), sev: 'mid', n: Math.round(fees.length / nm),
        text: fees.map(t => baseNote(t.note)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(', ') + ` · ${pl(Math.max(1, Math.round(fees.length / nm)), 'poplatek', 'poplatky', 'poplatků')} za měsíc.`, tip: 'Podívej se do přehledu poplatků v bankovnictví. Placené doplňkové služby (pojištění karty, „Bezpečí“ apod.) se dají zrušit, účet vést zdarma.', ids: fees.map(t => t.id) });
    }

    // 5) jídlo venku dražší než nákup potravin
    const sumOf = cats => list.filter(t => cats.includes(t.cat)).reduce((a, t) => a + t.amount, 0);
    const out = sumOf(['restaurace', 'kavarna', 'hospoda', 'rozvoz']);
    const food = sumOf(['potraviny']);
    if (out > food && pm(out) >= 200000) {
      add({ id: 'food:ratio', kind: 'ratio', cat: 'restaurace', title: 'Jídlo venku dražší než nákupy', perMonth: pm(out), sev: 'mid',
        text: `Venku ${kc(pm(out))}, v obchodě ${kc(pm(food))} měsíčně. ` + [['restaurace', 'restaurace'], ['hospoda', 'hospody'], ['kavarna', 'kavárny'], ['rozvoz', 'rozvoz']].map(([c, n]) => [n, sumOf([c])]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${kc(pm(v))}`).join(', ') + '.', tip: 'Když přesuneš třetinu jídel z venku domů, ušetříš řádově tisíce měsíčně.', ids: [], overlap: true });
    }

    items.sort((a, b) => b.perMonth - a.perMonth);
    // úspora: polovina z plateb, na které upozornění míří (každá platba se počítá jednou)
    const ids = new Set();
    for (const it of items) if (!it.overlap) for (const id of it.ids) ids.add(id);
    const flagged = list.filter(t => ids.has(t.id)).reduce((a, t) => a + t.amount, 0);
    return { months, items, potential: Math.round(pm(flagged) * 12 / 2) };
  }

  root.BudgetAnalytics = {
    init, pad, ymOf, shiftYM, daysIn, dayNum, baseNote, median,
    summarize, byMonth, monthRange, series, avgByCat, merchants, recurring, daily, pace, calendar, noSpend, leaks, leakWindow,
  };
}(typeof window !== 'undefined' ? window : globalThis));
