/* Obrazovky: Přehled, Pohyby (+ Obchodníci), Kalendář, Trendy a Plán. Okna jsou v dialogs.js. */
(function () {
  'use strict';

  const BG = window.BG;
  const K = window.BGKit;
  const U = BG.u;
  const { $, $$, esc, numStr, money, moneyRound, compact, pctText, pad, todayISO, shiftYM, daysIn, fmtMonth, fmtMonthName, fmtMonthShort, fmtDay, fmtShort, fmtDate, MINUS, NBSP } = U;
  const { CATS, CAT, GROUPS, GRP, An, Rules } = BG;
  const fold = Rules.fold;

  const TABS = [
    { id: 'home', name: 'Přehled', icon: 'home' },
    { id: 'moves', name: 'Pohyby', icon: 'list' },
    { id: 'cal', name: 'Kalendář', icon: 'cal' },
    { id: 'trend', name: 'Trendy', icon: 'trend' },
    { id: 'plan', name: 'Plán', icon: 'plan' },
  ];
  const EAT = ['restaurace', 'kavarna', 'hospoda', 'rozvoz'];
  const UIKEY = 'budgetovka.ui';

  const S = {
    tab: 'home', ym: todayISO().slice(0, 7), all: false,
    sub: 'list', kind: 'all', mkind: 'out', cat: null, q: '', shown: 200,
    day: null, trendN: 12, openCats: false,
  };
  try {
    const j = JSON.parse(localStorage.getItem(UIKEY) || 'null');
    if (j && TABS.some(t => t.id === j.tab)) S.tab = j.tab;
    if (j && [6, 12, 0].includes(j.trendN)) S.trendN = j.trendN;
  } catch (e) { /* bez uloženého stavu */ }
  const saveUI = () => { try { localStorage.setItem(UIKEY, JSON.stringify({ tab: S.tab, trendN: S.trendN })); } catch (e) { /* nevadí */ } };

  let D = null; // údaje spočítané jednou pro jedno vykreslení

  /* ---------- barvy kategorií ---------- */

  function applyColors() {
    let css = ':root{';
    for (const g of GROUPS) css += `--g-${g.id}:var(--${g.col});`;
    for (const c of CATS) {
      const p = c.cnt <= 1 ? 100 : Math.round(100 - c.idx * (34 / (c.cnt - 1)));
      css += `--c-${c.id}:var(--${GRP[c.grp].col});--c-${c.id}:color-mix(in srgb,var(--${GRP[c.grp].col}) ${p}%,var(--bg2));`;
    }
    css += '}';
    let st = $('#catStyle');
    if (!st) { st = document.createElement('style'); st.id = 'catStyle'; document.head.append(st); }
    st.textContent = css;
  }

  const catColor = id => `var(--c-${id})`;
  const av = (catId, cls) => `<span class="av${cls ? ' ' + cls : ''}" style="background:${catColor(catId)}">${K.icon(catId)}</span>`;
  const avGrp = (grpId, iconName, cls) => `<span class="av${cls ? ' ' + cls : ''}" style="background:var(--g-${grpId})">${K.icon(iconName)}</span>`;

  /* ---------- údaje pro jedno vykreslení ---------- */

  function compute() {
    const tx = BG.tx;
    const mm = An.byMonth(tx);
    const yms = Object.keys(mm).sort();
    const nowYM = todayISO().slice(0, 7);
    const lastData = yms[yms.length - 1];
    return {
      tx, mm, yms, nowYM, today: todayISO(),
      first: yms.length && yms[0] < nowYM ? yms[0] : nowYM,
      last: lastData && lastData > nowYM ? lastData : nowYM,
      lim: BG.limits(), target: BG.target(), _rec: null,
      rec() { return this._rec || (this._rec = An.recurring(tx, this.today)); },
      _lk: null,
      leaks() { return this._lk || (this._lk = An.leaks(tx, this.today)); },
    };
  }

  function monthList() {
    const out = [];
    for (let ym = D.last; ym >= D.first; ym = shiftYM(ym, -1)) out.push(ym);
    return out;
  }

  const sumTx = list => An.summarize(list);
  const fracOf = ym => (ym === D.nowYM ? +D.today.slice(8, 10) / daysIn(ym) : ym < D.nowYM ? 1 : 0);

  /* šířka grafu v px podle toho, kolik místa má panel (aby se písmo v SVG nezmenšovalo) */
  function cw(cols) {
    const vw = window.innerWidth || 1024;
    const small = vw <= 480;
    const avail = Math.min(vw, 1180) - (small ? 28 : 32);
    const wide = cols === 2 && avail >= 614;
    const panel = wide ? (avail - 14) / 2 : avail;
    return Math.max(260, Math.round(panel - (small ? 32 : 36)));
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pct0 = v => (v < 0 ? MINUS : '') + Math.abs(Math.round(v));

  /* ---------- drobné stavební kameny HTML ---------- */

  function head(title, sub, right) {
    return `<div class="large"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right || ''}</div>`;
  }

  const plw = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

  /* Hlavička záložky: název měsíce je zároveň výběr měsíce, šipky vedle. Šetří jeden řádek a jedno klepnutí. */
  function mhead(label, allowAll, sub, right) {
    const opts = monthList().map(ym => `<option value="${ym}"${!S.all && ym === S.ym ? ' selected' : ''}>${fmtMonth(ym)}</option>`).join('');
    const allOpt = allowAll ? `<option value="all"${S.all ? ' selected' : ''}>Celé období</option>` : '';
    const atFirst = S.all || S.ym <= D.first;
    const atLast = S.all || S.ym >= D.last;
    const title = S.all ? 'Celé období' : fmtMonth(S.ym);
    return `<div class="mhead">
      <div class="mh-l"><div class="mh-k">${label}</div>
        <label class="mpick"><h1>${title}</h1><span class="chev" aria-hidden="true">▾</span><select id="monthSel" aria-label="Vybrat měsíc">${allOpt}${opts}</select></label>
        ${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <div class="mh-r">${right || ''}${(S.all || S.ym !== D.nowYM) ? '<button type="button" class="pback" data-act="month-today">Dnes</button>' : ''}
        <button type="button" class="pnav" data-act="month-prev" aria-label="Předchozí měsíc"${atFirst ? ' disabled' : ''}>‹</button>
        <button type="button" class="pnav" data-act="month-next" aria-label="Další měsíc"${atLast ? ' disabled' : ''}>›</button></div>
    </div>`;
  }

  function perbar(allowAll) {
    const opts = monthList().map(ym => `<option value="${ym}"${!S.all && ym === S.ym ? ' selected' : ''}>${fmtMonth(ym)}</option>`).join('');
    const allOpt = allowAll ? `<option value="all"${S.all ? ' selected' : ''}>Celé období</option>` : '';
    const atFirst = S.all || S.ym <= D.first;
    const atLast = S.all || S.ym >= D.last;
    return `<div class="perbar">
      <button type="button" class="pnav" data-act="month-prev" aria-label="Předchozí měsíc"${atFirst ? ' disabled' : ''}>‹</button>
      <select id="monthSel" aria-label="Měsíc">${allOpt}${opts}</select>
      <button type="button" class="pnav" data-act="month-next" aria-label="Další měsíc"${atLast ? ' disabled' : ''}>›</button>
      ${(S.all || S.ym !== D.nowYM) ? '<button type="button" class="pback" data-act="month-today">Tento měsíc</button>' : ''}
    </div>`;
  }

  /* změna proti referenci: pct + barva (špatně = červeně). goodUp = růst je dobře (příjmy) */
  function delta(cur, ref, goodUp, minRef) {
    if (!(ref > (minRef || 0))) return '';
    const p = (cur - ref) / ref * 100;
    if (Math.abs(p) < 5) return '';
    const bad = goodUp ? p < 0 : p > 0;
    return `<span class="delta ${bad ? 'bad' : 'good'}">${p > 0 ? '▲' : '▼'} ${Math.min(999, Math.round(Math.abs(p)))} %</span>`;
  }

  const signed = (t) => {
    const k = CAT[t.cat].kind;
    return (k === 'in' ? '+' : k === 'out' ? MINUS : '') + numStr(t.amount) + NBSP + 'Kč';
  };

  function txRow(t, opts) {
    const c = CAT[t.cat];
    const parts = String(t.note || '').split(' · ');
    const title = parts[0] || c.name;
    const sub = [c.name].concat(parts.slice(1)).filter(Boolean).join(' · ');
    const dateTag = opts && opts.date ? `<small>${fmtShort(t.date)}</small>` : '';
    return `<button type="button" class="row row-btn" data-act="edit" data-id="${esc(t.id)}">${av(t.cat)}
      <div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>
      <div class="end ${c.kind === 'in' ? 'in' : c.kind === 'save' ? 'sv' : ''}">${signed(t)}${dateTag}</div></button>`;
  }

  function sorted(list) {
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0) || (a.id < b.id ? 1 : -1));
  }

  function emptyState() {
    return head('Finance', 'Příjmy, výdaje a spoření po měsících.')
      + `<div class="panel" style="max-width:560px"><h2>Zatím tu nic není</h2>
      <p class="cap" style="margin-top:6px">Nahraj výpis z banky (CSV) nebo zálohu (JSON), klidně jen přetažením souboru do okna. Appka pohyby sama roztřídí do kategorií jako hospoda, kavárna, gym nebo rozvoz. Zbytek zařadíš jedním klepnutím a appka si to pamatuje. Data zůstávají jen v tomto prohlížeči, volitelně i na tvém Google Disku.</p>
      <div class="chips">
        <button type="button" class="chipbtn on" data-act="pick-file">Nahrát výpis nebo zálohu</button>
        <button type="button" class="chipbtn" data-act="add">Přidat pohyb ručně</button>
        <button type="button" class="chipbtn" data-act="demo">Vyzkoušet na ukázce</button>
      </div></div>`;
  }

  /* ========== PŘEHLED ========== */

  function paceChart(ym, list) {
    const n = daysIn(ym);
    const p = An.pace(list, ym, D.today);
    const prev = An.monthRange(shiftYM(ym, -1), 3).filter(k => (D.mm[k] || []).length);
    const curves = prev.map(k => An.pace(D.mm[k], k, D.today).cum.map(v => (v == null ? 0 : v)));
    const avg = Array.from({ length: n }, (_, i) => (curves.length
      ? curves.reduce((a, c) => a + c[Math.min(i, c.length - 1)], 0) / curves.length : null));
    const W = cw(2), H = clamp(Math.round(W * 0.42), 170, 230), L = 44, R = 10, T = 12, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const top = Math.max(p.spent, p.projected || 0, avg[n - 1] || 0, 1);
    const maxY = K.niceMax(top * 1.04);
    const x = i => L + pw * (n > 1 ? i / (n - 1) : 0);
    const y = v => T + ph * (1 - v / maxY);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxY * k / 4;
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${compact(v)}</text>`;
    }
    for (const d of (pw < 300 ? [1, 10, 20, n] : [1, 5, 10, 15, 20, 25, n])) if (d <= n) g += `<text x="${x(d - 1).toFixed(1)}" y="${H - 8}" text-anchor="middle">${d}.</text>`;
    let svg = g;
    if (curves.length) {
      svg += `<polyline points="${avg.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--gray)" stroke-width="1.6" stroke-dasharray="4 4" stroke-linejoin="round"/>`;
    }
    if (p.upTo > 0) {
      const pts = [];
      for (let i = 0; i < p.upTo; i++) pts.push(`${x(i).toFixed(1)},${y(p.cum[i]).toFixed(1)}`);
      svg += `<polygon points="${x(0).toFixed(1)},${y(0)} ${pts.join(' ')} ${x(p.upTo - 1).toFixed(1)},${y(0)}" fill="var(--tint)" opacity=".1"/>`;
      svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--tint)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
      svg += `<circle cx="${x(p.upTo - 1).toFixed(1)}" cy="${y(p.cum[p.upTo - 1]).toFixed(1)}" r="4.5" fill="var(--tint)" stroke="var(--bg2)" stroke-width="2"/>`;
      if (p.projected != null) {
        svg += `<line x1="${x(p.upTo - 1).toFixed(1)}" y1="${y(p.cum[p.upTo - 1]).toFixed(1)}" x2="${x(n - 1).toFixed(1)}" y2="${y(p.projected).toFixed(1)}" stroke="var(--orange)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>`;
        svg += `<circle cx="${x(n - 1).toFixed(1)}" cy="${y(p.projected).toFixed(1)}" r="4" fill="var(--bg2)" stroke="var(--orange)" stroke-width="2"/>`;
      }
    }
    const tips = [];
    const colW = pw / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const bits = [`<b>${i + 1}.&nbsp;${+ym.slice(5)}.</b>`];
      if (p.cum[i] != null) bits.push(`utraceno ${money(p.cum[i])}`);
      if (avg[i] != null) bits.push(`<span class="tk">průměr ${moneyRound(avg[i])}</span>`);
      tips.push(bits.join('<br>'));
      svg += `<rect class="hit" data-tip="${i}" x="${(x(i) - colW / 2).toFixed(1)}" y="${T}" width="${colW.toFixed(1)}" height="${ph}"/>`;
    }
    return {
      html: `<div class="chartwrap" data-tips='${esc(JSON.stringify(tips))}'><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kumulativní výdaje v měsíci">${svg}</svg></div>`,
      p, hasAvg: curves.length > 0, avgEnd: avg[n - 1],
    };
  }

  function insights(ym, s) {
    const out = [];
    const frac = fracOf(ym);
    const avg = An.avgByCat(D.tx, ym, 3);
    const exp = c => (avg.avg[c] || 0) * Math.max(frac, 0.0001);

    // jídlo mimo domov
    const eatNow = EAT.reduce((a, c) => a + (s.byCat[c] || 0), 0);
    if (eatNow > 0 && s.out > 0) {
      let t = `Jídlo a pití mimo domov (restaurace, kavárny, hospody, rozvoz): <b>${moneyRound(eatNow)}</b>, tedy ${pctText(eatNow, s.out)} výdajů.`;
      if (avg.months >= 1 && frac >= 0.3) {
        const e = EAT.reduce((a, c) => a + exp(c), 0);
        if (e > 0) {
          const d = (eatNow - e) / e * 100;
          if (Math.abs(d) >= 10) t += ` To je o ${Math.round(Math.abs(d))} % ${d > 0 ? 'víc' : 'méně'} než obvykle.`;
        }
      }
      out.push({ icon: 'restaurace', col: 'var(--g-jidlo)', html: t });
    }

    // největší skok proti obvyklému
    if (avg.months >= 2 && frac >= 0.6) {
      let best = null;
      for (const c of CATS) {
        if (c.kind !== 'out' || c.fixed || c.id === 'ostatni' || c.id === 'hotovost') continue;
        const cur = s.byCat[c.id] || 0, e = exp(c.id);
        const diff = cur - e;
        if (diff >= 50000 && cur >= 1.4 * e && (!best || diff > best.diff)) best = { c, diff, cur, e };
      }
      if (best) out.push({ icon: best.c.id, col: catColor(best.c.id), html: `Nejvíc vyskočilo <b>${esc(best.c.name)}</b>: ${moneyRound(best.cur)}, což je o ${moneyRound(best.diff)} víc než obvykle${best.e > 0 ? '' : ' (dřív tu nic nebylo)'}.` });
    }

    // největší jednotlivá platba
    const list = D.mm[ym] || [];
    const big = list.filter(t => CAT[t.cat].kind === 'out' && !CAT[t.cat].fixed).sort((a, b) => b.amount - a.amount)[0];
    if (big && big.amount >= 100000 && list.length > 3) {
      out.push({ icon: big.cat, col: catColor(big.cat), html: `Největší jednotlivá platba: <b>${moneyRound(big.amount)}</b>, ${esc(String(big.note).split(' · ')[0] || CAT[big.cat].name)} (${fmtShort(big.date)}).` });
    }

    // nejdražší den v týdnu (posledních 90 dní, bez pevných výdajů)
    const endISO = ym === D.nowYM ? D.today : `${ym}-${pad(daysIn(ym))}`;
    const endN = An.dayNum(endISO), startN = endN - 89;
    const tot = Array(7).fill(0), cnt = Array(7).fill(0);
    let firstN = Infinity;
    for (const t of D.tx) {
      const dn = An.dayNum(t.date);
      if (dn < firstN) firstN = dn;
    }
    if (isFinite(firstN) && endN - firstN >= 45) {
      for (let dn = Math.max(startN, firstN); dn <= endN; dn++) cnt[(new Date(dn * 864e5).getUTCDay() + 6) % 7]++;
      for (const t of D.tx) {
        const c = CAT[t.cat];
        const dn = An.dayNum(t.date);
        if (c.kind !== 'out' || c.fixed || dn < startN || dn > endN) continue;
        tot[(new Date(dn * 864e5).getUTCDay() + 6) % 7] += t.amount;
      }
      const per = tot.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
      const all = tot.reduce((a, b) => a + b, 0) / Math.max(1, cnt.reduce((a, b) => a + b, 0));
      const bi = per.indexOf(Math.max(...per));
      if (all > 0 && per[bi] >= all * 1.35) {
        const names = ['pondělí', 'úterý', 'středu', 'čtvrtek', 'pátek', 'sobotu', 'neděli'];
        out.push({ icon: 'cal', col: 'var(--tint)', html: `Nejvíc utrácíš v ${names[bi]}: v průměru <b>${moneyRound(per[bi])}</b> za den, jinak ${moneyRound(all)}.` });
      }
    }

    // pravidelné platby
    if (ym === D.nowYM) {
      const act = D.rec().filter(r => !r.ended);
      const sum = act.reduce((a, r) => a + r.perMonth, 0);
      if (act.length >= 2) out.push({ icon: 'repeat', col: 'var(--indigo)', html: `Pravidelné platby (${act.length}) tě stojí asi <b>${moneyRound(sum)}</b> měsíčně. <button type="button" class="linkbtn" data-act="go" data-tab="plan" style="color:var(--tint)">Podívat se</button>` });
    }

    // cíl spoření
    if (D.target != null && s.in > 0 && frac >= 0.5) {
      const r = s.rate == null ? 0 : s.rate * 100;
      if (r >= D.target) out.push({ icon: 'flag', col: 'var(--green)', html: `Cíl spoření <b>${D.target} %</b> plníš: máš <b>${Math.round(r)} %</b>.` });
      else out.push({ icon: 'flag', col: 'var(--orange)', html: `Do cíle spoření ${D.target} % ti zatím chybí <b>${moneyRound(s.in * D.target / 100 - s.net)}</b> (máš ${Math.round(r)} %).` });
    }
    return out.slice(0, 5);
  }

  function viewHome() {
    if (!D.tx.length) return emptyState();
    const ym = S.ym;
    const list = D.mm[ym] || [];
    const s = sumTx(list);
    const sp = sumTx(D.mm[shiftYM(ym, -1)] || []);
    const frac = fracOf(ym);
    const nd = daysIn(ym);
    const day = +D.today.slice(8, 10);
    const sub = ym === D.nowYM ? `Den ${day} z ${nd} · zbývá ${plw(nd - day, 'den', 'dny', 'dní')}` : ym < D.nowYM ? 'Uzavřený měsíc' : 'Budoucí měsíc';
    let h = mhead('Přehled', false, sub);
    let paceHtml = () => '';

    if (!list.length) {
      return h + `<div class="panel"><h2>V tomto měsíci nic není</h2><p class="cap">Přidej pohyb, nebo se přepni na jiný měsíc.</p><div class="chips"><button type="button" class="chipbtn on" data-act="add">Přidat pohyb</button>${D.yms.length ? `<button type="button" class="chipbtn" data-act="month-last">Poslední měsíc s daty</button>` : ''}</div></div>` + todoBlock(ym, s);
    }

    const pc = paceChart(ym, list);
    // tempo: na počítači vedle hlavní karty, na mobilu až pod „Co řešit“
    paceHtml = cls => `<div class="panel ${cls}">
        <h2>Tempo měsíce</h2>
        <div class="cap"><span style="color:var(--tint)">●</span> ${ym === D.nowYM ? 'letos' : fmtMonthName(ym)} ${hasProj(pc) ? '<span style="color:var(--orange)">●</span> odhad ' : ''}${pc.hasAvg ? '<span style="color:var(--gray)">●</span> průměr předchozích měsíců' : ''}</div>
        ${s.out > 0 ? pc.html : '<div class="empty">V tomto měsíci zatím žádné výdaje.</div>'}
      </div>`;
    const fixedV = Object.entries(s.byCat).reduce((a, [c, v]) => a + (CAT[c].kind === 'out' && CAT[c].fixed ? v : 0), 0);
    const varV = s.out - fixedV;
    const base = Math.max(s.in, s.out + s.save, 1);
    const seg = (v, col) => (v > 0 ? `<span style="width:${(v / base * 100).toFixed(2)}%;background:${col}"></span>` : '');
    const leftPos = s.in - s.out - s.save;
    const neg = s.left < 0;
    const rate = s.rate == null ? null : Math.round(s.rate * 100);
    const cmp = (cur, prev, goodUp) => (ym === D.nowYM ? (prev ? `minule ${moneyRound(prev)}` : '&nbsp;') : delta(cur, prev, goodUp) || (prev ? `minule ${moneyRound(prev)}` : '&nbsp;'));

    h += `<div class="hero">
      <div class="panel hero-main">
        <div class="eyebrow">${neg ? 'Přečerpáno' : s.in > 0 ? 'Zbývá z příjmů' : 'Výdaje bez příjmů'}</div>
        <div class="big${neg ? ' neg' : ''}">${s.in > 0 ? (neg ? MINUS : '') + numStr(Math.round(Math.abs(s.left) / 100) * 100) : MINUS + numStr(Math.round(s.out / 100) * 100)}<small> Kč</small></div>
        <div class="lbar" role="img" aria-label="Rozdělení příjmů">${seg(fixedV, 'var(--indigo)')}${seg(varV, 'var(--orange)')}${seg(s.save, 'var(--yellow)')}${s.in > 0 ? seg(Math.max(0, leftPos), 'var(--green)') : ''}</div>
        <div class="leg"><span><i style="background:var(--indigo)"></i>Pevné ${moneyRound(fixedV)}</span><span><i style="background:var(--orange)"></i>Ostatní ${moneyRound(varV)}</span>${s.save ? `<span><i style="background:var(--yellow)"></i>Spoření ${moneyRound(s.save)}</span>` : ''}${s.in > 0 && leftPos > 0 ? `<span><i style="background:var(--green)"></i>Zbývá ${moneyRound(leftPos)}</span>` : ''}</div>
        <div class="stats">
          <button type="button" class="st" data-act="go" data-tab="moves" data-kind="in"><span class="k">Příjmy</span><b class="good">${moneyRound(s.in)}</b><small>${cmp(s.in, sp.in, true)}</small></button>
          <button type="button" class="st" data-act="go" data-tab="moves" data-kind="out"><span class="k">Výdaje</span><b>${moneyRound(s.out)}</b><small>${cmp(s.out, sp.out, false)}</small></button>
          <div class="st"><span class="k">Míra úspor</span><b class="${rate != null && rate < 0 ? 'bad' : ''}">${rate == null ? '–' : rate + ' %'}</b><small>${D.target != null ? `cíl ${D.target} %` : 'z příjmů'}</small></div>
          <div class="st"><span class="k">Na den</span><b>${pc.p.upTo ? moneyRound(pc.p.perDay) : '–'}</b><small>bez pevných plateb</small></div>
        </div>
        ${pc.p.projected != null && s.in > 0 ? `<div class="callout${s.in - pc.p.projected - s.save < 0 ? ' warn' : ''}">Při tomhle tempu skončí měsíc na <b>${moneyRound(pc.p.projected)}</b> výdajů${pc.hasAvg ? `, běžně je to ${moneyRound(pc.avgEnd)}` : ''}. Zbyde ${s.in - pc.p.projected - s.save >= 0 ? `asi <b>${moneyRound(s.in - pc.p.projected - s.save)}</b>` : `mínus <b>${moneyRound(pc.p.projected + s.save - s.in)}</b>`}.</div>` : ''}
      </div>
      ${paceHtml('hero-pace')}
    </div>`;

    // kategorie s rozbalením přímo na místě
    const avg = An.avgByCat(D.tx, ym, 3);
    const grpParts = GROUPS.filter(g => g.id !== 'in').map(g => ({
      id: g.id, name: g.name, v: g.id === 'spo' ? s.save : (s.byGrp[g.id] || 0), color: `var(--g-${g.id})`,
    })).filter(p => p.v > 0).sort((a, b) => b.v - a.v);
    const totalFlow = grpParts.reduce((a, p) => a + p.v, 0);
    const cats = CATS.filter(c => c.kind !== 'in' && s.byCat[c.id]).sort((a, b) => s.byCat[b.id] - s.byCat[a.id]);
    const counts = {};
    for (const t of list) counts[t.cat] = (counts[t.cat] || 0) + 1;
    const maxScale = Math.max(1, ...cats.map(c => s.byCat[c.id]), ...cats.map(c => D.lim[c.id] || 0));
    const shown = S.openCats ? cats : cats.slice(0, 8);
    const catRow = c => {
      const v = s.byCat[c.id];
      const e = (avg.avg[c.id] || 0) * frac;
      const over = D.lim[c.id] && v > D.lim[c.id];
      const dl = c.kind === 'out' && !c.fixed && avg.months >= 2 && frac >= 0.5 && e >= 30000 ? delta(v, e, false) : '';
      const open = S.openCat === c.id;
      let r = `<button type="button" class="row row-btn has-bar${open ? ' open' : ''}" data-act="cat-open" data-cat="${c.id}" aria-expanded="${open}">${av(c.id)}
        <div class="main"><div class="t">${esc(c.name)}</div><div class="s">${plw(counts[c.id], 'platba', 'platby', 'plateb')}${avg.avg[c.id] ? ` · obvykle ${moneyRound(avg.avg[c.id])}` : ''}${D.lim[c.id] ? ` · limit ${moneyRound(D.lim[c.id])}` : ''}</div></div>
        <div class="end${over ? ' up' : ''}">${money(v)}<small>${dl}</small></div><span class="disc" aria-hidden="true">›</span>
        <div class="bar2"><i style="width:${(v / maxScale * 100).toFixed(1)}%;background:${over ? 'var(--red)' : catColor(c.id)}"></i>${D.lim[c.id] ? `<u style="left:${Math.min(100, D.lim[c.id] / maxScale * 100).toFixed(1)}%"></u>` : ''}</div></button>`;
      if (open) {
        const items = list.filter(t => t.cat === c.id).sort((x, y) => y.amount - x.amount);
        r += `<div class="catx">${items.slice(0, 8).map(t => txRow(t, { date: true })).join('')}
          <div class="catx-foot">${items.length > 8 ? `<button type="button" data-act="go" data-tab="moves" data-cat="${c.id}">Všech ${items.length} v Pohybech</button>` : '<span></span>'}
          <button type="button" data-act="limit-edit" data-cat="${c.id}">${D.lim[c.id] ? 'Upravit limit' : 'Nastavit limit'}</button></div></div>`;
      }
      return r;
    };
    const catsHtml = `<div class="section"><div class="sechead">Kam to teče</div>
      <div class="panel"><div class="mixbox">
        ${K.donut(grpParts.map(p => ({ v: p.v, color: p.color, title: `${esc(p.name)}: ${moneyRound(p.v)}` })), 150, 24,
          `<text x="75" y="72" text-anchor="middle" style="font-size:11px;fill:var(--label2)">celkem</text><text x="75" y="92" text-anchor="middle" style="font-size:17px;font-weight:700;fill:var(--label)">${compact(totalFlow)}</text>`)}
        <div class="mixleg">${grpParts.map(p => `<div class="r"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><b>${moneyRound(p.v)}</b><em>${pctText(p.v, totalFlow)}</em></div>`).join('')}</div>
      </div></div>
      <div class="group cats" style="margin-top:12px">${shown.map(catRow).join('')}
      ${cats.length > 8 ? `<button type="button" class="more" data-act="cats-all">${S.openCats ? 'Zobrazit méně' : `Zobrazit všech ${cats.length} kategorií`}</button>` : ''}</div>
      <div class="secfoot">Klepnutím na kategorii uvidíš její platby.</div></div>`;

    const ms = An.merchants(list, 'out').slice(0, 5);
    const merchHtml = ms.length ? `<div class="section"><div class="itemhead"><div class="sechead">Kde utrácíš nejvíc</div><button type="button" data-act="go" data-tab="moves" data-sub="merch">Všichni</button></div>
      <div class="group">${ms.map(m => merchRow(m, s.out)).join('')}</div></div>` : '';
    const ins = insights(ym, s);
    const insHtml = ins.length ? `<div class="section"><div class="sechead">Postřehy</div><div class="group">${ins.map(i =>
      `<div class="row">${avGrpRaw(i.col, i.icon)}<div class="main"><div class="s" style="white-space:normal;color:var(--label);font-size:14px;line-height:1.4">${i.html}</div></div></div>`).join('')}</div></div>` : '';

    h += `<div class="dash"><div class="d-todo">${todoBlock(ym, s)}<div class="section mob-only">${paceHtml('')}</div></div><div class="d-cats">${catsHtml}</div><div class="d-side">${merchHtml}${insHtml}</div></div>`;
    return h;
  }

  /* Co řešit: všechno, co chce akci, na jednom místě a jedním klepnutím. */
  function todoBlock(ym, s) {
    const rows = [];
    const un = D.tx.filter(t => t.cat === 'ostatni');
    if (un.length) {
      const sum = un.reduce((a, t) => a + t.amount, 0);
      rows.push(`<div class="leak" style="--sev:var(--tint)"><button type="button" class="row row-btn" data-act="triage">${av('ostatni')}
        <div class="main"><div class="t">${plw(un.length, 'nezařazený pohyb', 'nezařazené pohyby', 'nezařazených pohybů')}</div><div class="s multi">${moneyRound(sum)} · zařadíš jedním klepnutím, appka si to zapamatuje</div></div>
        <div class="end"><span class="pill">Zařadit</span></div></button></div>`);
    }
    for (const c of CATS) {
      const L = D.lim[c.id], v = (s && s.byCat[c.id]) || 0;
      if (L && v > L) rows.push(`<div class="leak" style="--sev:var(--red)"><button type="button" class="row row-btn" data-act="cat-jump" data-cat="${c.id}">${av(c.id)}
        <div class="main"><div class="t">${esc(c.name)}: přes limit</div><div class="s">${moneyRound(v)} z ${moneyRound(L)}</div></div>
        <div class="end up">+${moneyRound(v - L)}</div></button></div>`);
    }
    const Lk = D.leaks();
    const vis = Lk.items.filter(it => !hiddenLeak(it));
    vis.slice(0, 3).forEach(it => rows.push(leakRow(it)));
    if (!rows.length) return '';
    return `<div class="section"><div class="itemhead"><div class="sechead">Co řešit</div>${vis.length ? `<button type="button" data-act="go" data-tab="plan">${vis.length > 3 ? `Všechna upozornění (${vis.length})` : 'Detail a tipy'}</button>` : ''}</div>
      <div class="group leaks">${rows.join('')}</div>
      ${vis.length && Lk.potential > 0 ? `<div class="secfoot">Zbytečné výdaje z ${monthsLabel(Lk.months)}. Když je omezíš na polovinu, ušetříš asi <b>${moneyRound(Lk.potential)}</b> ročně.</div>` : ''}</div>`;
  }

  /* ---------- zbytečné výdaje ---------- */
  const SEV = { high: ['var(--red)', 'Vysoké'], mid: ['var(--orange)', 'Střední'], low: ['var(--yellow)', 'Nízké'] };
  const hiddenLeak = it => !!BG.getMeta('x:' + it.id);

  function leakRow(it, opts) {
    const [col] = SEV[it.sev];
    const hidden = hiddenLeak(it);
    return `<div class="leak${hidden ? ' off' : ''}" style="--sev:${col}">
      <button type="button" class="row row-btn" data-act="go" data-tab="moves" data-cat="${it.cat}" data-all="1">${av(it.cat)}
        <div class="main"><div class="t">${esc(it.title)}</div><div class="s multi">${esc(it.text)}</div>${opts && opts.full ? `<div class="lktip">${esc(it.tip)}</div>` : ''}</div>
        <div class="end up">${moneyRound(it.perMonth)}<small>${moneyRound(it.perYear)} ročně</small></div></button>
      ${opts && opts.full ? `<div class="leakact"><button type="button" data-act="leak-hide" data-id="${esc(it.id)}">${hidden ? 'Znovu upozorňovat' : 'Tohle je v pořádku, skrýt'}</button></div>` : ''}
    </div>`;
  }

  function monthsLabel(months) {
    if (!months.length) return '';
    const a = fmtMonthShort(months[0]), b = fmtMonthShort(months[months.length - 1]);
    return months.length === 1 ? a : `${a} – ${b}`;
  }

  function leaksSection(full) {
    const L = D.leaks();
    const vis = L.items.filter(it => !hiddenLeak(it));
    const hid = L.items.length - vis.length;
    if (!L.months.length) return full ? `<div class="section"><div class="sechead">Zbytečné výdaje</div><div class="group"><div class="empty">Upozornění se počítají z uzavřených měsíců. Jakmile skončí první měsíc s daty, objeví se tady.</div></div></div>` : '';
    if (!full && !vis.length) return '';
    const rows = full ? (S.showHidden ? L.items : vis) : vis.slice(0, 3);
    let h = `<div class="section"><div class="itemhead"><div class="sechead">Zbytečné výdaje</div>${full ? (hid ? `<button type="button" data-act="leak-showhidden">${S.showHidden ? 'Schovat skryté' : `Skryté (${hid})`}</button>` : '') : `<button type="button" data-act="go" data-tab="plan">${vis.length > 3 ? `Všechna (${vis.length})` : 'Detail'}</button>`}</div>`;
    if (rows.length) h += `<div class="group leaks">${rows.map(it => leakRow(it, { full })).join('')}</div>`;
    else h += `<div class="group"><div class="empty">Nic podezřelého. Všechna upozornění máš skrytá nebo vyřešená.</div></div>`;
    const pot = L.potential;
    h += `<div class="secfoot">Z plateb za ${monthsLabel(L.months)}.${pot > 0 ? ` Když tyhle výdaje omezíš na polovinu, ušetříš asi <b>${moneyRound(pot)}</b> ročně.` : ''}</div></div>`;
    return h;
  }

  const hasProj = pc => pc.p.projected != null;
  const avGrpRaw = (color, iconName) => `<span class="av sm" style="background:${color}">${K.icon(iconName)}</span>`;
  const compactKc = v => `${compact(v)}<small> Kč</small>`;

  function merchRow(m, total, extra) {
    const share = total > 0 ? pctText(m.sum, total) : '';
    return `<button type="button" class="row row-btn" data-act="merch" data-key="${esc(m.key)}" data-inc="${CAT[m.cat].kind === 'in' ? 1 : 0}">${av(m.cat)}
      <div class="main"><div class="t">${esc(m.name)}</div><div class="s">${m.n}× · Ø ${moneyRound(m.avg)} · ${fmtShort(m.last)}</div></div>
      <div class="end">${money(m.sum)}<small>${share}</small></div></button>`;
  }

  /* ========== POHYBY ========== */

  function scopeList() {
    return S.all ? D.tx : (D.mm[S.ym] || []);
  }

  function filteredList(skipKind) {
    let list = scopeList();
    if (!skipKind && S.kind !== 'all') list = list.filter(t => CAT[t.cat].kind === S.kind);
    if (S.cat) list = list.filter(t => t.cat === S.cat);
    const q = fold(S.q.trim());
    if (q) {
      const num = /^\d+(?:[.,]\d{1,2})?$/.test(q) ? Math.round(parseFloat(q.replace(',', '.')) * 100) : null;
      list = list.filter(t => fold(String(t.note) + ' ' + CAT[t.cat].name).includes(q) || (num != null && t.amount === num));
    }
    return list;
  }

  function catSelectOptions(sel, kind) {
    let h = `<option value="">Všechny kategorie</option>`;
    for (const g of GROUPS) {
      const cs = CATS.filter(c => c.grp === g.id && (kind === 'all' || c.kind === kind));
      if (cs.length) h += `<optgroup label="${esc(g.name)}">${cs.map(c => `<option value="${c.id}"${sel === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`;
    }
    return h;
  }

  function movesList() {
    const list = sorted(filteredList());
    if (!list.length) return `<div class="group"><div class="empty">${S.q || S.cat || S.kind !== 'all' ? 'Nic neodpovídá filtru.' : 'V tomto období nejsou žádné pohyby.'}</div></div>`;
    const shown = list.slice(0, S.shown);
    let html = '';
    let i = 0;
    while (i < shown.length) {
      const date = shown[i].date;
      const day = [];
      while (i < shown.length && shown[i].date === date) day.push(shown[i++]);
      const ds = sumTx(day);
      const dsum = [ds.in ? '+' + numStr(ds.in) + NBSP + 'Kč' : '', ds.out ? MINUS + numStr(ds.out) + NBSP + 'Kč' : ''].filter(Boolean).join(' · ');
      html += `<div class="dayhead"><span>${fmtDay(date)}</span><b>${dsum}</b></div><div class="group">${day.map(t => txRow(t)).join('')}</div>`;
    }
    if (list.length > shown.length) html += `<div class="group" style="margin-top:14px"><button type="button" class="more" data-act="more">Zobrazit dalších ${Math.min(200, list.length - shown.length)} (zbývá ${list.length - shown.length})</button></div>`;
    return html;
  }

  function merchList() {
    let list = filteredList(true).filter(t => CAT[t.cat].kind === (S.mkind === 'in' ? 'in' : 'out'));
    const ms = An.merchants(list, S.mkind === 'in' ? 'in' : 'out');
    const total = ms.reduce((a, m) => a + m.sum, 0);
    if (!ms.length) return `<div class="group"><div class="empty">Žádní obchodníci.</div></div>`;
    const max = ms[0].sum;
    return `<div class="group">${ms.slice(0, S.shown).map(m => {
      const row = merchRow(m, total).replace('<button type="button" class="row row-btn"', '<button type="button" class="row row-btn has-bar"');
      return row.replace('</button>', `<div class="bar2"><i style="width:${(m.sum / max * 100).toFixed(1)}%;background:${catColor(m.cat)}"></i></div></button>`);
    }).join('')}${ms.length > S.shown ? `<button type="button" class="more" data-act="more">Zobrazit dalších ${Math.min(200, ms.length - S.shown)}</button>` : ''}</div>`;
  }

  function movesSummary() {
    const list = S.sub === 'merch' ? filteredList(true) : filteredList();
    const s = sumTx(list);
    if (S.sub === 'merch') {
      const ms = An.merchants(list.filter(t => CAT[t.cat].kind === (S.mkind === 'in' ? 'in' : 'out')), S.mkind === 'in' ? 'in' : 'out');
      return `<b>${ms.length}</b> obchodníků · ${S.mkind === 'in' ? 'příjmy' : 'výdaje'} <b>${moneyRound(S.mkind === 'in' ? s.in : s.out)}</b>`;
    }
    return `<b>${list.length}</b> pohybů${s.in ? ` · příjmy <b>+${moneyRound(s.in)}</b>` : ''}${s.out ? ` · výdaje <b>${moneyRound(s.out)}</b>` : ''}`;
  }

  function viewMoves() {
    const sub = S.all ? 'Celé období' : fmtMonth(S.ym);
    const seg = (items, cur, act, key) => `<div class="mini-seg" role="group">${items.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
    let h = mhead('Pohyby', true, `<span id="mvSummary">${movesSummary()}</span>`);
    h += `<div class="toolbar">
      ${seg([['list', 'Pohyby'], ['merch', 'Obchodníci']], S.sub, 'sub')}
      ${S.sub === 'list' ? seg([['all', 'Vše'], ['in', 'Příjmy'], ['out', 'Výdaje'], ['save', 'Spoření']], S.kind, 'kind')
        : seg([['out', 'Výdaje'], ['in', 'Příjmy']], S.mkind, 'mkind')}
      <select id="catSel" class="selpill" aria-label="Kategorie">${catSelectOptions(S.cat, S.sub === 'list' ? S.kind : S.mkind)}</select>
    </div>`;
    h += `<div id="mvList">${S.sub === 'list' ? movesList() : merchList()}</div>`;
    return h;
  }

  /* ========== KALENDÁŘ ========== */

  function viewCal() {
    const ym = S.ym;
    const list = D.mm[ym] || [];
    const cal = An.calendar(list, ym);
    const p = An.pace(list, ym, D.today);
    const maxDay = Math.max(1, ...cal.days.map(d => d.out));
    const top = [...cal.days].sort((a, b) => b.out - a.out)[0];
    const ns = An.noSpend(cal.days, p.upTo);
    const todayN = ym === D.nowYM ? +D.today.slice(8, 10) : 0;
    if (!S.day || !S.day.startsWith(ym)) S.day = ym === D.nowYM ? D.today : (top && top.out ? top.date : `${ym}-01`);
    const dows = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    let h = mhead('Kalendář', false, 'Kdy a kolik utrácíš');
    h += `<div class="tiles">
      <div class="tile"><div class="k">Utraceno</div><div class="v">${compactKc(p.spent)}</div><div class="h">${p.upTo ? `Ø ${moneyRound(p.spent / p.upTo)} za den` : '&nbsp;'}</div></div>
      <div class="tile"><div class="k">Nejdražší den</div><div class="v">${top && top.out ? compactKc(top.out) : '–'}</div><div class="h">${top && top.out ? fmtDay(top.date).replace(/^[^ ]+ /, '') : '&nbsp;'}</div></div>
      <div class="tile"><div class="k">Dny bez útraty</div><div class="v">${p.upTo ? ns.free + `<small> z ${p.upTo}</small>` : '–'}</div><div class="h">${ns.streak > 1 ? `série ${ns.streak}` : '&nbsp;'}</div></div>
    </div>`;
    h += '<div class="panel"><div class="cal">' + dows.map(d => `<div class="dow">${d}</div>`).join('');
    for (const w of cal.weeks) {
      for (const c of w) {
        if (!c) { h += '<div class="cell blank"></div>'; continue; }
        const hh = Math.sqrt(c.out / maxDay);
        const fut = ym === D.nowYM && c.day > todayN;
        h += `<button type="button" class="cell${c.day === todayN ? ' today' : ''}${c.date === S.day ? ' sel' : ''}${fut ? ' fut' : ''}${hh > 0.6 ? ' hot' : ''}" style="--h:${hh.toFixed(3)}" data-act="day" data-date="${c.date}" aria-label="${c.day}. ${c.out ? 'utraceno ' + moneyRound(c.out) : 'bez útraty'}"><span class="d">${c.day}</span><span class="a">${c.out ? compact(c.out) : ''}</span>${c.in ? '<i class="inc"></i>' : ''}</button>`;
      }
    }
    h += '</div><div class="heatleg"><span>méně</span><i></i><span>více</span><span style="margin-left:auto"><span style="color:var(--green)">●</span> příjem</span></div></div>';

    const dayList = sorted(list.filter(t => t.date === S.day));
    const ds = sumTx(dayList);
    h += `<div class="dayhead" style="margin-top:22px"><span>${fmtDay(S.day)}</span><b>${ds.out ? MINUS + numStr(ds.out) + NBSP + 'Kč' : ''}</b></div>
      <div class="group">${dayList.length ? dayList.map(t => txRow(t)).join('') : '<div class="empty">Tenhle den bez pohybů.</div>'}
      <button type="button" class="more" data-act="add" data-date="${S.day}">Přidat pohyb v tento den</button></div>`;
    return h;
  }

  /* ========== TRENDY ========== */

  function trendMonths() {
    let n = S.trendN;
    const end = D.last;
    if (!n) {
      const [fy, fm] = D.first.split('-').map(Number), [ey, em] = end.split('-').map(Number);
      n = Math.min(36, (ey - fy) * 12 + (em - fm) + 1);
    }
    let months = An.monthRange(end, Math.max(1, n));
    const fd = months.findIndex(m => (D.mm[m] || []).length);
    if (fd > 0) months = months.slice(fd);
    return months;
  }

  function barsChart(series) {
    const N = series.length;
    const W = cw(2), H = clamp(Math.round(W * 0.45), 190, 240), L = 44, R = 8, T = 12, B = 28;
    const pw = W - L - R, ph = H - T - B;
    const maxY = K.niceMax(Math.max(1, ...series.map(s => Math.max(s.in, s.out + s.save))) * 1.05);
    const y = v => T + ph * (1 - v / maxY);
    const slot = pw / N, bw = Math.min(22, slot * 0.36);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxY * k / 4;
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${compact(v)}</text>`;
    }
    const tips = [];
    const step = Math.max(1, Math.ceil(N * 36 / pw));
    series.forEach((s, i) => {
      const cx = L + slot * (i + 0.5);
      const out = s.out + s.save;
      if (s.in > 0) g += `<rect x="${(cx - bw - 1).toFixed(1)}" y="${y(s.in).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(s.in)).toFixed(1)}" rx="3" fill="var(--green)"/>`;
      if (out > 0) g += `<rect x="${(cx + 1).toFixed(1)}" y="${y(out).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(out)).toFixed(1)}" rx="3" fill="var(--orange)"/>`;
      if (i % step === 0 || i === N - 1) g += `<text x="${cx.toFixed(1)}" y="${H - 9}" text-anchor="middle">${fmtMonthShort(s.ym)}${s.ym.endsWith('-01') || i === 0 ? ' ' + s.ym.slice(2, 4) : ''}</text>`;
      tips.push(`<b>${fmtMonth(s.ym)}</b><br><span style="color:var(--green)">●</span> příjmy ${moneyRound(s.in)}<br><span style="color:var(--orange)">●</span> výdaje ${moneyRound(out)}<br><span class="tk">zbylo ${moneyRound(s.in - out)}</span>`);
      g += `<rect class="hit" data-tip="${i}" x="${(L + slot * i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}"/>`;
    });
    return `<div class="chartwrap" data-tips='${esc(JSON.stringify(tips))}'><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Příjmy a výdaje po měsících">${g}</svg></div>`;
  }

  function rateChart(series) {
    const N = series.length;
    const W = cw(2), H = clamp(Math.round(W * 0.38), 170, 210), L = 44, R = 14, T = 16, B = 28;
    const pw = W - L - R, ph = H - T - B;
    const pts = series.map(s => (s.in > 0 ? Math.max(-100, Math.min(100, (s.in - s.out) / s.in * 100)) : null));
    const vals = pts.filter(v => v != null);
    if (!vals.length) return '<div class="empty">Zatím chybí příjmy, ze kterých by šla míra úspor spočítat.</div>';
    let lo = Math.min(0, Math.floor(Math.min(...vals) / 10) * 10);
    let hi = Math.max(10, Math.ceil(Math.max(...vals, D.target || 0) / 10) * 10);
    if (hi - lo < 20) hi = lo + 20;
    const y = v => T + ph * (1 - (v - lo) / (hi - lo));
    const x = i => L + (N > 1 ? pw * i / (N - 1) : pw / 2);
    let g = '';
    const stepV = (hi - lo) > 80 ? 40 : (hi - lo) > 40 ? 20 : 10;
    for (let v = lo; v <= hi; v += stepV) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"${v === 0 ? ' style="stroke:var(--label3);stroke-width:1"' : ''}/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${pct0(v)} %</text>`;
    if (D.target != null) g += `<line x1="${L}" x2="${W - R}" y1="${y(D.target).toFixed(1)}" y2="${y(D.target).toFixed(1)}" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R}" y="${(y(D.target) - 5).toFixed(1)}" text-anchor="end" style="fill:var(--green)">cíl ${D.target} %</text>`;
    const step = Math.max(1, Math.ceil(N * 36 / pw));
    const path = [];
    pts.forEach((v, i) => { if (v != null) path.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); });
    g += `<polyline points="${path.join(' ')}" fill="none" stroke="var(--tint)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    const tips = [];
    series.forEach((s, i) => {
      if (i % step === 0 || i === N - 1) g += `<text x="${x(i).toFixed(1)}" y="${H - 9}" text-anchor="middle">${fmtMonthShort(s.ym)}</text>`;
      const v = pts[i];
      if (v != null) {
        g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="var(--bg2)" stroke="var(--tint)" stroke-width="2.2"/>`;
        if (N * 30 <= pw) g += `<text x="${x(i).toFixed(1)}" y="${(y(v) - 9).toFixed(1)}" text-anchor="middle" style="fill:var(--label);font-weight:600;paint-order:stroke;stroke:var(--bg2);stroke-width:3px">${pct0(v)}</text>`;
      }
      tips.push(`<b>${fmtMonth(s.ym)}</b><br>míra úspor ${v == null ? '–' : pct0(v) + ' %'}`);
      g += `<rect class="hit" data-tip="${i}" x="${(x(i) - pw / N / 2).toFixed(1)}" y="${T}" width="${(pw / N).toFixed(1)}" height="${ph}"/>`;
    });
    return `<div class="chartwrap" data-tips='${esc(JSON.stringify(tips))}'><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Míra úspor po měsících">${g}</svg></div>`;
  }

  function stackChart(series) {
    const N = series.length;
    const W = cw(1), H = clamp(Math.round(W * 0.3), 190, 260), L = 44, R = 8, T = 12, B = 28;
    const pw = W - L - R, ph = H - T - B;
    const grps = GROUPS.filter(g => g.id !== 'in' && g.id !== 'spo');
    const tot = s => grps.reduce((a, g) => a + (s.byGrp[g.id] || 0), 0);
    const maxY = K.niceMax(Math.max(1, ...series.map(tot)) * 1.05);
    const y = v => T + ph * (1 - v / maxY);
    const slot = pw / N, bw = Math.min(30, slot * 0.6);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxY * k / 4;
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${compact(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(N * 36 / pw));
    const tips = [];
    series.forEach((s, i) => {
      const cx = L + slot * (i + 0.5);
      let acc = 0;
      for (const gr of grps) {
        const v = s.byGrp[gr.id] || 0;
        if (!v) continue;
        g += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y(acc) - y(acc + v)).toFixed(1)}" fill="var(--g-${gr.id})"/>`;
        acc += v;
      }
      if (i % step === 0 || i === N - 1) g += `<text x="${cx.toFixed(1)}" y="${H - 9}" text-anchor="middle">${fmtMonthShort(s.ym)}</text>`;
      tips.push(`<b>${fmtMonth(s.ym)}</b>` + grps.filter(gr => s.byGrp[gr.id]).map(gr => `<br><span style="color:var(--g-${gr.id})">●</span> ${esc(gr.name)} ${moneyRound(s.byGrp[gr.id])}`).join('') + `<br><span class="tk">celkem ${moneyRound(acc)}</span>`);
      g += `<rect class="hit" data-tip="${i}" x="${(L + slot * i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}"/>`;
    });
    return `<div class="chartwrap" data-tips='${esc(JSON.stringify(tips))}'><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Výdaje podle skupin">${g}</svg></div>
      <div class="legendrow">${grps.map(gr => `<span><i style="background:var(--g-${gr.id})"></i>${esc(gr.name)}</span>`).join('')}</div>`;
  }

  function heatTable(series) {
    const sums = {};
    for (const s of series) for (const [c, v] of Object.entries(s.byCat)) if (CAT[c].kind === 'out') sums[c] = (sums[c] || 0) + v;
    const rows = Object.keys(sums).sort((a, b) => sums[b] - sums[a]);
    if (!rows.length) return '';
    const withData = series.filter(s => s.n > 0).length || 1;
    const yms = series.map(s => s.ym).join(',');
    return `<div class="tblwrap"><table class="heat"><thead><tr><th>Kategorie</th>${series.map(s => `<th><button type="button" data-act="month-go" data-ym="${s.ym}" title="Otevřít ${fmtMonth(s.ym)}">${fmtMonthShort(s.ym)}</button></th>`).join('')}<th>Ø měs.</th></tr></thead><tbody>${rows.map(c => {
      const mx = Math.max(...series.map(s => s.byCat[c] || 0), 1);
      return `<tr><td><button type="button" class="hcat" data-act="cell" data-cat="${c}" data-yms="${yms}">${esc(CAT[c].name)}</button></td>${series.map(s => {
        const v = s.byCat[c] || 0;
        return `<td class="hm" style="--h:${(v / mx).toFixed(3)}">${v ? `<button type="button" data-act="cell" data-cat="${c}" data-yms="${s.ym}" aria-label="${esc(CAT[c].name)}, ${fmtMonth(s.ym)}: ${moneyRound(v)}">${numStr(Math.round(v / 100) * 100)}</button>` : ''}</td>`;
      }).join('')}<td class="tot"><button type="button" data-act="cell" data-cat="${c}" data-yms="${yms}">${numStr(Math.round(sums[c] / withData / 100) * 100)}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function viewTrend() {
    if (!D.tx.length) return emptyState();
    const months = trendMonths();
    const series = An.series(D.tx, months);
    const act = series.filter(s => s.n > 0);
    const tIn = series.reduce((a, s) => a + s.in, 0), tOut = series.reduce((a, s) => a + s.out + s.save, 0);
    const inMonths = series.filter(s => s.in > 0);
    const rateAll = inMonths.length ? inMonths.reduce((a, s) => a + s.in - s.out - s.save, 0) / inMonths.reduce((a, s) => a + s.in, 0) : null;
    const worst = [...series].sort((a, b) => (b.out + b.save) - (a.out + a.save))[0];
    const seg = `<div class="mini-seg" role="group">${[[6, '6 měs.'], [12, '12 měs.'], [0, 'Vše']].map(([v, l]) => `<button type="button" data-act="trendn" data-v="${v}" aria-pressed="${S.trendN === v}">${l}</button>`).join('')}</div>`;
    let h = head('Trendy', `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}`, seg);
    h += `<div class="tiles">
      <div class="tile"><div class="k"><i style="background:var(--green)"></i>Příjmy celkem</div><div class="v">${compactKc(tIn)}</div><div class="h">${act.length ? `Ø ${moneyRound(tIn / act.length)}/měs.` : '&nbsp;'}</div></div>
      <div class="tile"><div class="k"><i style="background:var(--orange)"></i>Výdaje celkem</div><div class="v">${compactKc(tOut)}</div><div class="h">${act.length ? `Ø ${moneyRound(tOut / act.length)}/měs.` : '&nbsp;'}</div></div>
      <div class="tile"><div class="k"><i style="background:var(--yellow)"></i>Míra úspor</div><div class="v">${rateAll == null ? '–' : Math.round(rateAll * 100) + '<small> %</small>'}</div><div class="h">za celé období</div></div>
      <div class="tile"><div class="k"><i style="background:var(--red)"></i>Nejdražší měsíc</div><div class="v">${worst && worst.out ? compactKc(worst.out + worst.save) : '–'}</div><div class="h">${worst && worst.out ? fmtMonth(worst.ym) : '&nbsp;'}</div></div>
    </div>`;
    h += `<div class="hero"><div class="panel"><h2>Příjmy a výdaje</h2><div class="cap"><span style="color:var(--green)">●</span> příjmy <span style="color:var(--orange)">●</span> výdaje včetně spoření</div>${barsChart(series)}</div>
      <div class="panel"><h2>Míra úspor</h2><div class="cap">Kolik procent příjmů zbylo nebo se odložilo.</div>${rateChart(series)}</div></div>`;
    h += `<div class="hero"><div class="panel" style="grid-column:1/-1"><h2>Výdaje podle skupin</h2><div class="cap">Z čeho se skládají výdaje (bez spoření).</div>${stackChart(series)}</div></div>`;
    const ht = heatTable(series);
    if (ht) h += `<div class="section"><div class="sechead">Kategorie po měsících</div><div class="group">${ht}</div><div class="secfoot">Klepni na číslo a uvidíš, za co přesně to bylo. Sytost barvy je v rámci řádku: tmavší = víc než v ostatních měsících.</div></div>`;
    return h;
  }

  /* ========== PLÁN ========== */

  function viewPlan() {
    const ym = S.ym;
    const list = D.mm[ym] || [];
    const s = sumTx(list);
    const frac = fracOf(ym);
    let h = mhead('Plán', false, 'Co omezit, limity, cíl spoření a pravidelné platby') + leaksSection(true);

    // limity
    const limCats = CATS.filter(c => D.lim[c.id]).sort((a, b) => (s.byCat[b.id] || 0) / D.lim[b.id] - (s.byCat[a.id] || 0) / D.lim[a.id]);
    h += `<div class="section"><div class="itemhead"><div class="sechead">Měsíční limity</div><button type="button" data-act="limit-suggest">Navrhnout z průměru</button></div>`;
    if (limCats.length) {
      h += `<div class="group">${limCats.map(c => {
        const v = s.byCat[c.id] || 0, L = D.lim[c.id];
        const pct = v / L * 100;
        const col = pct > 100 ? 'var(--red)' : pct > 80 ? 'var(--orange)' : catColor(c.id);
        const left = L - v;
        return `<button type="button" class="row row-btn has-bar" data-act="limit-edit" data-cat="${c.id}">${av(c.id)}
          <div class="main"><div class="t">${esc(c.name)}</div><div class="s${pct > 100 ? ' bad' : ''}">${moneyRound(v)} z ${moneyRound(L)}${frac > 0 && frac < 1 && pct <= 100 && v / L > frac + 0.1 ? ' · rychleji než měsíc' : ''}</div></div>
          <div class="end${left < 0 ? ' up' : ''}">${left >= 0 ? moneyRound(left) : MINUS + moneyRound(-left).replace(MINUS, '')}<small>${left >= 0 ? 'zbývá' : 'přes limit'}</small></div>
          <div class="bar2"><i style="width:${Math.min(100, pct).toFixed(1)}%;background:${col}"></i>${frac > 0 && frac < 1 ? `<u style="left:${(frac * 100).toFixed(1)}%"></u>` : ''}</div></button>`;
      }).join('')}</div>`;
      if (frac > 0 && frac < 1) h += '<div class="secfoot">Svislá čárka je místo, kde bys měl být podle dne v měsíci.</div>';
    } else {
      h += `<div class="group"><div class="empty">Zatím žádné limity. Nastav si strop třeba pro hospody, kavárny nebo rozvoz a uvidíš, jak jsi na tom.</div></div>`;
    }
    h += `<div class="chips" style="margin-top:12px"><button type="button" class="chipbtn" data-act="limit-add">+ Přidat limit</button></div></div>`;

    // cíl spoření
    const tg = D.target == null ? 0 : D.target;
    const r3 = (() => {
      const ms = An.monthRange(shiftYM(ym, -1), 3).filter(k => (D.mm[k] || []).some(t => CAT[t.cat].kind === 'in'));
      if (!ms.length) return null;
      const a = ms.map(k => sumTx(D.mm[k])).reduce((q, x) => ({ in: q.in + x.in, net: q.net + x.net }), { in: 0, net: 0 });
      return a.in > 0 ? a.net / a.in * 100 : null;
    })();
    const rateNow = s.rate == null ? null : s.rate * 100;
    h += `<div class="section"><div class="sechead">Cíl spoření</div><div class="panel">
      <div class="slider"><div class="sl-head"><span>Chci odkládat</span><b id="rateVal">${tg ? tg + ' % příjmů' : 'vypnuto'}</b></div>
      <input type="range" id="rateSl" min="0" max="60" step="1" value="${tg}" style="--p:${tg / 60 * 100}%" aria-label="Cílová míra úspor">
      <div class="sl-ticks"><span>0</span><span>15</span><span>30</span><span>45</span><span>60 %</span></div></div>
      <dl class="kv" style="margin-top:8px">
        <dt>Tento měsíc</dt><dd>${rateNow == null ? '–' : Math.round(rateNow) + ' %'}</dd>
        <dt>Průměr 3 předchozích měsíců</dt><dd>${r3 == null ? '–' : Math.round(r3) + ' %'}</dd>
      </dl>
      ${tg && s.in > 0 ? (s.net >= s.in * tg / 100
        ? `<div class="callout good">Cíl plníš. Navíc nad cíl je <b>${moneyRound(s.net - s.in * tg / 100)}</b>.</div>`
        : `<div class="callout warn">Do cíle chybí <b>${moneyRound(s.in * tg / 100 - s.net)}</b>. Za tenhle měsíc to znamená utratit o tolik méně.</div>`) : ''}
    </div></div>`;

    // pravidelné platby
    const rec = D.rec();
    const act = rec.filter(r => !r.ended), ended = rec.filter(r => r.ended);
    const sumM = act.reduce((a, r) => a + r.perMonth, 0);
    const soon = act.filter(r => An.dayNum(r.next) - An.dayNum(D.today) <= 14);
    const recRow = r => {
      const days = An.dayNum(r.next) - An.dayNum(D.today);
      const when = r.ended ? '' : days < -3 ? ' · čekal jsem ji dřív' : days <= 0 ? ' · dnes nebo brzy' : ` · za ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`;
      return `<div class="row">${av(r.cat)}<div class="main"><div class="t">${esc(r.name)}</div><div class="s">${r.every} · ${r.n}× · naposledy ${fmtShort(r.last)}${r.ended ? '' : ` · další ≈ ${fmtShort(r.next)}${when}`}</div></div><div class="end">${moneyRound(r.amount)}<small>${r.every === 'ročně' ? `≈ ${moneyRound(r.perMonth)}/měs.` : ''}</small></div></div>`;
    };
    h += `<div class="section"><div class="sechead">Pravidelné platby</div>`;
    if (act.length || ended.length) {
      h += `<div class="panel" style="margin-bottom:12px"><div class="eyebrow">Pevné závazky měsíčně</div><div class="big" style="font-size:34px;margin-bottom:4px">${numStr(Math.round(sumM / 100) * 100)}<small> Kč</small></div>
        <div class="cap" style="margin:0">${act.length} pravidelných plateb zjištěných z historie${soon.length ? `, v nejbližších 14 dnech čeká ${soon.length}` : ''}.</div></div>
        <div class="group">${act.length ? act.map(recRow).join('') : '<div class="empty">Žádné aktivní.</div>'}</div>`;
      if (ended.length) h += `<details class="group ppd" style="margin-top:12px"><summary><span>Skončilo nebo vynecháno</span><span class="cnt">${ended.length}</span></summary>${ended.map(recRow).join('')}</details>`;
      h += `<div class="secfoot">Hledá se obchodník, u kterého se platba opakuje zhruba po měsíci nebo po roce (aspoň třikrát). Zjištěno z dat, nic nemusíš zadávat.</div>`;
    } else {
      h += `<div class="group"><div class="empty">Zatím je málo historie. Pravidelné platby appka pozná, až budou aspoň tři měsíce dat.</div></div>`;
    }
    h += '</div>';

    // zařazování
    const unsorted = D.tx.filter(t => t.cat === 'ostatni').length;
    h += `<div class="section"><div class="sechead">Zařazování</div><div class="group">
      <button type="button" class="row row-btn noav" data-act="triage"><div class="main"><div class="t">Nezařazené pohyby</div><div class="s">${unsorted ? `${unsorted} čeká na zařazení` : 'Všechno je zařazené'}</div></div><svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button type="button" class="row row-btn noav" data-act="rules"><div class="main"><div class="t">Moje pravidla</div><div class="s">${BG.ruleCount()} zapamatovaných obchodníků</div></div><svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div></div>`;
    return h;
  }

  /* ========== vykreslení a události ========== */

  const VIEWS = { home: viewHome, moves: viewMoves, cal: viewCal, trend: viewTrend, plan: viewPlan };

  function renderChrome() {
    $('#segTop').innerHTML = TABS.map(t => `<button type="button" role="tab" data-act="tab" data-tab="${t.id}" aria-selected="${S.tab === t.id}">${t.name}</button>`).join('');
    $('#tabBottom .tabbar-in').innerHTML = TABS.map(t => `<button type="button" role="tab" data-act="tab" data-tab="${t.id}" aria-selected="${S.tab === t.id}" aria-label="${t.name}">${K.icon(t.icon)}<span>${t.name}</span></button>`).join('');
    $('#searchBox').hidden = S.tab !== 'moves';
    const q = $('#q');
    if (q && q.value !== S.q) q.value = S.q;
  }

  /* Ukázková data musí být na první pohled poznat, jinak vypadají jako tvoje čísla. */
  function demoBanner() {
    if (!BG.hasDemo()) return '';
    return `<div class="banner demo"><span><b>Ukázková data.</b> Vymyšlená čísla na vyzkoušení, ne tvoje. Nahraj svůj výpis nebo zálohu a ukázka zmizí sama.</span><span class="bbtns"><button type="button" data-act="pick-file">Nahrát svoje data</button><button type="button" class="ghost" data-act="demo-clear">Smazat ukázku</button></span></div>`;
  }

  let firstRender = true;
  function render(opts) {
    D = compute();
    if (firstRender) {
      firstRender = false;
      // když aktuální měsíc nemá data, ale jiné ano, začni nejnovějším měsícem s daty
      if (D.yms.length && !D.mm[S.ym]) S.ym = D.yms[D.yms.length - 1];
    }
    // vybraný měsíc musí být v rozsahu
    if (S.ym > D.last) S.ym = D.last;
    if (S.ym < D.first) S.ym = D.first;
    const y = window.scrollY;
    renderChrome();
    const view = $('#view');
    view.innerHTML = demoBanner() + VIEWS[S.tab]();
    $$('.chartwrap[data-tips]', view).forEach(w => {
      try { K.chartTips(w, JSON.parse(w.dataset.tips)); } catch (e) { /* bez tipů */ }
    });
    window.scrollTo(0, opts && opts.top ? 0 : y);
  }

  function renderMovesList() {
    D = compute();
    const el = $('#mvList');
    if (!el || S.tab !== 'moves') return;
    el.innerHTML = S.sub === 'list' ? movesList() : merchList();
    const sm = $('#mvSummary');
    if (sm) sm.innerHTML = movesSummary();
  }

  function setTab(id, opts) {
    S.tab = id;
    if (opts && opts.reset) { S.cat = null; S.q = ''; S.kind = 'all'; }
    S.shown = 200;
    saveUI();
    render({ top: true });
  }

  function setMonth(ym) {
    S.all = false;
    S.ym = ym;
    S.shown = 200;
    S.day = null;
    render();
  }

  const DLG = () => window.BGDlg || {};

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !el.closest('#view, .bar, #tabBottom')) return;
    const a = el.dataset.act;
    const dlg = DLG();
    switch (a) {
      case 'tab': setTab(el.dataset.tab); break;
      case 'leak-hide': {
        const k = 'x:' + el.dataset.id;
        BG.setMeta(k, BG.getMeta(k) ? null : 1);
        BG.commit();
        break;
      }
      case 'leak-showhidden': S.showHidden = !S.showHidden; render(); break;
      case 'cat-open': S.openCat = S.openCat === el.dataset.cat ? null : el.dataset.cat; render(); break;
      case 'cat-jump': {
        S.openCat = el.dataset.cat;
        if (!S.openCats) S.openCats = true;
        render();
        const r = document.querySelector(`[data-act="cat-open"][data-cat="${el.dataset.cat}"]`);
        if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
      case 'cell': { const d = DLG(); if (d.openCell) d.openCell(el.dataset.cat, el.dataset.yms.split(',')); break; }
      case 'month-go': S.tab = 'home'; S.openCat = null; setMonth(el.dataset.ym); window.scrollTo(0, 0); break;
      case 'month-last': if (D.yms.length) setMonth(D.yms[D.yms.length - 1]); break;
      case 'pick-file': { const d = DLG(); if (d.pickFile) d.pickFile(); break; }
      case 'go':
        if (el.dataset.all) S.all = true;
        S.tab = el.dataset.tab;
        S.cat = el.dataset.cat || null;
        S.q = '';
        S.kind = el.dataset.kind || 'all';
        if (el.dataset.sub) S.sub = el.dataset.sub; else if (el.dataset.cat || el.dataset.kind) S.sub = 'list';
        S.mkind = 'out';
        S.shown = 200;
        saveUI();
        render({ top: true });
        break;
      case 'month-prev': setMonth(shiftYM(S.ym, -1)); break;
      case 'month-next': setMonth(shiftYM(S.ym, 1)); break;
      case 'month-today': setMonth(D.nowYM); break;
      case 'edit': { const t = BG.tx.find(x => x.id === el.dataset.id); if (t && dlg.openEntry) dlg.openEntry(t); break; }
      case 'add': if (dlg.openEntry) dlg.openEntry(null, { date: el.dataset.date }); break;
      case 'merch': if (dlg.openMerch) dlg.openMerch(el.dataset.key, el.dataset.inc === '1'); break;
      case 'more': S.shown += 200; renderMovesList(); break;
      case 'sub': S.sub = el.dataset.v; S.shown = 200; S.cat = null; render(); break;
      case 'kind': S.kind = el.dataset.v; S.shown = 200; S.cat = null; render(); break;
      case 'mkind': S.mkind = el.dataset.v; S.shown = 200; S.cat = null; render(); break;
      case 'cats-all': S.openCats = !S.openCats; render(); break;
      case 'day': S.day = el.dataset.date; render(); break;
      case 'trendn': S.trendN = +el.dataset.v; saveUI(); render(); break;
      case 'triage': if (dlg.openTriage) dlg.openTriage(); break;
      case 'rules': if (dlg.openRules) dlg.openRules(); break;
      case 'limit-edit': if (dlg.openLimit) dlg.openLimit(el.dataset.cat); break;
      case 'limit-add': if (dlg.openLimit) dlg.openLimit(null); break;
      case 'limit-suggest': if (dlg.suggestLimits) dlg.suggestLimits(); break;
      case 'import': if (dlg.openData) dlg.openData(); break;
      case 'demo': BG.loadDemo(); break;
      case 'demo-clear': BG.clearDemo(); BG.toast('Ukázka smazána', { label: 'Vrátit', run: BG.undo }); break;
      case 'data': { const d = DLG(); if (d.openData) d.openData(); break; }
      default: break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'monthSel') {
      if (t.value === 'all') { S.all = true; S.shown = 200; render(); } else setMonth(t.value);
    } else if (t.id === 'catSel') {
      S.cat = t.value || null; S.shown = 200; renderMovesList();
    } else if (t.id === 'rateSl') {
      const v = +t.value;
      BG.setMeta('g:rate', v > 0 ? v : null);
      BG.commit();
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'q') {
      S.q = t.value; S.shown = 200;
      if (S.tab === 'moves') renderMovesList();
    } else if (t.id === 'rateSl') {
      const v = +t.value;
      t.style.setProperty('--p', (v / 60 * 100) + '%');
      const lab = $('#rateVal');
      if (lab) lab.textContent = v ? v + ' % příjmů' : 'vypnuto';
    }
  });

  $('#addBtn').addEventListener('click', () => { const d = DLG(); if (d.openEntry) d.openEntry(null, { date: S.tab === 'cal' ? S.day : undefined }); });
  $('#dataBtn').addEventListener('click', () => { const d = DLG(); if (d.openData) d.openData(); });

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing || document.querySelector('dialog[open]')) return;
    const d = DLG();
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); if (d.openEntry) d.openEntry(null, {}); }
    else if (e.key === '/') { e.preventDefault(); setTab('moves'); const q = $('#q'); if (q) q.focus(); }
    else if (/^[1-5]$/.test(e.key)) setTab(TABS[+e.key - 1].id);
    else if (e.key === 'ArrowLeft' && ['home', 'moves', 'cal', 'plan'].includes(S.tab) && !S.all && S.ym > D.first) setMonth(shiftYM(S.ym, -1));
    else if (e.key === 'ArrowRight' && ['home', 'moves', 'cal', 'plan'].includes(S.tab) && !S.all && S.ym < D.last) setMonth(shiftYM(S.ym, 1));
  });

  applyColors();
  /* swipe doleva/doprava = další/předchozí měsíc (mobil) */
  (function swipe() {
    let x0 = null, y0 = 0, t0 = 0;
    const view = $('#view');
    view.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || e.target.closest('input, select, textarea, .chartwrap, .hscroll, table, .mini-seg')) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    view.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Date.now() - t0 > 600 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (!['home', 'moves', 'cal', 'plan'].includes(S.tab) || S.all) return;
      const next = shiftYM(S.ym, dx < 0 ? 1 : -1);
      if (next < D.first || next > D.last) return;
      setMonth(next);
      BG.toast(fmtMonth(next));
    }, { passive: true });
  })();

  window.BGV = { S, render, renderMovesList, setTab, TABS, applyColors, get D() { return D; }, catColor, av, txRow, sorted, merchRow };
  BG.ui.render = () => render();
})();
