/* Budgetovka: osobní rozpočet. Bez serveru a bez buildu.
   Data jsou jen v localStorage tohoto prohlížeče. Částky se ukládají v haléřích. */
(() => {
  'use strict';

  const STORE_KEY = 'budgetovka.v1';
  const MINUS = '−';
  const NBSP = ' ';

  /* ---------- kategorie ---------- */

  const CATS = [
    { id: 'prace',    name: 'Provize a mzda',      kind: 'in' },
    { id: 'vedlejsi', name: 'Vedlejší příjem',     kind: 'in' },
    { id: 'prijem',   name: 'Ostatní příjem',      kind: 'in' },
    { id: 'bydleni',  name: 'Bydlení',             kind: 'out' },
    { id: 'jidlo',    name: 'Jídlo',               kind: 'out' },
    { id: 'doprava',  name: 'Doprava',             kind: 'out' },
    { id: 'zdravi',   name: 'Zdraví a sport',      kind: 'out' },
    { id: 'zabava',   name: 'Zábava a volný čas',  kind: 'out' },
    { id: 'sluzby',   name: 'Služby a předplatné', kind: 'out' },
    { id: 'studium',  name: 'Studium',             kind: 'out' },
    { id: 'dane',     name: 'Daně a odvody',       kind: 'out' },
    { id: 'ostatni',  name: 'Ostatní výdaje',      kind: 'out' },
    { id: 'sporeni',  name: 'Spoření a investice', kind: 'save' },
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const KIND_NAME = { in: 'Příjem', out: 'Výdaj', save: 'Spoření' };
  const catColor = id => (CAT[id].kind === 'in' ? null : `var(--c-${id})`);

  /* ---------- pomocné funkce ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pad = n => String(n).padStart(2, '0');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  const nf0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numStr = minor => {
    const abs = Math.abs(minor);
    return abs % 100 === 0 ? nf0.format(abs / 100) : nf2.format(abs / 100);
  };
  const money = minor => numStr(minor) + NBSP + 'Kč';
  const pctOf = (v, base) => (base > 0 ? v / base * 100 : 0);
  const pctText = (v, base) => {
    const p = pctOf(v, base);
    return p > 0 && p < 1 ? '<1 %' : Math.round(p) + ' %';
  };

  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const dateOf = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftYM = (ym, delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const fmtMonth = ym => cap(new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(dateOf(ym + '-01')));
  const fmtMonthShort = ym => new Intl.DateTimeFormat('cs-CZ', { month: 'short' }).format(dateOf(ym + '-01')).replace('.', '');
  const fmtDay = iso => cap(new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateOf(iso)));

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- data ---------- */

  let tx = [];
  let undoSnapshot = null;

  const ui = { ym: todayISO().slice(0, 7), kind: 'all', cat: null, q: '' };

  function sanitize(list) {
    if (!Array.isArray(list)) return { items: [], skipped: 0 };
    const items = [];
    let skipped = 0;
    for (const t of list) {
      const ok = t && typeof t === 'object'
        && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
        && CAT[t.cat]
        && Number.isFinite(t.amount) && t.amount > 0 && t.amount < 1e12;
      if (!ok) { skipped++; continue; }
      items.push({
        id: t.id ? String(t.id) : uid(),
        date: t.date,
        cat: t.cat,
        amount: Math.round(t.amount),
        note: String(t.note || '').slice(0, 80),
        at: Number.isFinite(t.at) ? t.at : 0,
        ...(t.demo ? { demo: true } : {}),
      });
    }
    return { items, skipped };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      return sanitize(JSON.parse(raw).tx).items;
    } catch (e) {
      console.warn('Budgetovka: data se nepodařilo načíst', e);
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, tx }));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return true;
    } catch (e) {
      toast('Data se nepodařilo uložit. Zkontroluj, jestli prohlížeč neblokuje úložiště.');
      return false;
    }
  }

  const inMonth = ym => tx.filter(t => t.date.startsWith(ym));

  function summarize(list) {
    const s = { in: 0, out: 0, save: 0, byCat: {} };
    for (const t of list) {
      s[CAT[t.cat].kind] += t.amount;
      s.byCat[t.cat] = (s.byCat[t.cat] || 0) + t.amount;
    }
    s.left = s.in - s.out - s.save;
    return s;
  }

  /* ---------- ukázková data ---------- */

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function demoData() {
    const out = [];
    const today = todayISO();
    const thisYM = today.slice(0, 7);
    for (let i = 5; i >= 0; i--) {
      const ym = shiftYM(thisYM, -i);
      const [y, m] = ym.split('-').map(Number);
      const r = rng(y * 100 + m);
      const last = daysIn(ym);
      const between = (a, b, step = 10) => Math.round((a + r() * (b - a)) / step) * step;
      const pick = arr => arr[Math.floor(r() * arr.length)];
      const add = (day, cat, kc, note) => {
        let date = `${ym}-${pad(Math.min(day, last))}`;
        if (date > today) {
          // příjem tohoto měsíce už "přišel", ať ukázka nezačíná v mínusu
          if (CAT[cat].kind === 'in' && ym === thisYM) date = today;
          else return;
        }
        out.push({ id: uid(), date, cat, amount: Math.round(kc * 100), note, at: out.length, demo: true });
      };

      add(1, 'bydleni', 15800, 'Nájem a energie');
      add(5, 'zdravi', 890, 'Posilovna');
      add(7, 'sluzby', 649, 'Telefon');
      add(7, 'sluzby', 169, 'Hudba');
      add(8, 'sluzby', 520, 'Předplatné AI');
      add(12, 'prace', between(34000, 62000, 100), 'Provize');
      if (r() > 0.5) add(21, 'vedlejsi', between(12000, 38000, 100), 'Realitní provize');
      add(6, 'sporeni', 5000, 'ETF, pravidelná investice');
      add(6, 'sporeni', 1000, 'Penzijní spoření');
      add(8, 'dane', 4700, 'Zálohy OSVČ');
      if (r() > 0.6) add(3 + Math.floor(r() * 20), 'studium', between(300, 1800, 10), pick(['Skripta', 'Kurz', 'Kniha']));

      const foods = 9 + Math.floor(r() * 5);
      for (let k = 0; k < foods; k++) add(1 + Math.floor(r() * last), 'jidlo', between(90, 1300, 10), pick(['Albert', 'Lidl', 'Billa', 'Oběd', 'Rohlík', 'Kavárna', 'Wolt']));
      for (let k = 0; k < 2; k++) add(2 + Math.floor(r() * (last - 2)), 'doprava', between(900, 1900, 10), 'Benzín');
      add(2, 'doprava', 550, 'Jízdenka IDS JMK');
      const fun = 2 + Math.floor(r() * 3);
      for (let k = 0; k < fun; k++) add(1 + Math.floor(r() * last), 'zabava', between(200, 1600, 10), pick(['Kino', 'Večeře s přáteli', 'Koncert', 'Hra']));
      if (r() > 0.5) add(1 + Math.floor(r() * last), 'zdravi', between(150, 900, 10), 'Lékárna');
    }
    return out;
  }

  /* ---------- tooltip a toast ---------- */

  const tipEl = $('#tip');
  let slabTips = {};
  let trendTips = {};

  function showTip(el) {
    const html = slabTips[el.dataset.tip] || trendTips[el.dataset.tip];
    if (!html) return;
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.top - h - 10;
    if (top < 8) top = r.bottom + 10;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  const hideTip = () => { tipEl.hidden = true; };

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el) showTip(el);
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-tip]')) hideTip();
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest('[data-tip]');
    if (el) showTip(el);
  });
  document.addEventListener('focusout', e => {
    if (e.target.closest('[data-tip]')) hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, action) {
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    const span = document.createElement('span');
    span.textContent = msg;
    toastEl.append(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); toastEl.hidden = true; });
      toastEl.append(b);
    }
    toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, action ? 7000 : 3200);
  }

  /* ---------- vykreslení ---------- */

  function renderHeader() {
    $('#monthTitle').textContent = fmtMonth(ui.ym);
    const nowYM = todayISO().slice(0, 7);
    $('#todayBtn').disabled = ui.ym === nowYM;
  }

  function renderSlab() {
    const list = inMonth(ui.ym);
    const s = summarize(list);
    const neg = s.left < 0;

    const result = $('.result');
    result.classList.toggle('neg', neg);
    $('#resultLabel').textContent = neg ? 'Přečerpáno' : 'Zbývá z příjmů';
    $('#resultNum').innerHTML = `<span class="n">${neg ? MINUS : ''}${esc(numStr(s.left))}</span><span class="cur">Kč</span>`;

    $('#lIn').textContent = money(s.in);
    $('#lOut').textContent = (s.out ? MINUS : '') + money(s.out);
    $('#lSave').textContent = (s.save ? MINUS : '') + money(s.save);
    $('#lRate').textContent = s.in > 0 ? Math.round(s.save / s.in * 100) + ' %' : '–';

    // zdroje příjmů, jen když jsou aspoň dva
    const sources = CATS.filter(c => c.kind === 'in' && s.byCat[c.id]);
    $('#lInSubs').innerHTML = sources.length > 1
      ? sources.map(c => `<button type="button" class="ledger-sub" data-cat="${c.id}" aria-pressed="${ui.cat === c.id}"><span>${esc(c.name)}</span><span>${esc(money(s.byCat[c.id]))}</span></button>`).join('')
      : '';

    // pruh příjmů
    const outCats = CATS.filter(c => c.kind === 'out' && s.byCat[c.id]).sort((a, b) => s.byCat[b.id] - s.byCat[a.id]);
    const segs = outCats.map(c => ({ id: c.id, name: c.name, v: s.byCat[c.id] }));
    if (s.save) segs.push({ id: 'sporeni', name: CAT.sporeni.name, v: s.save });
    const flow = s.out + s.save;
    const base = Math.max(s.in, flow);
    const rest = Math.max(0, s.in - flow);

    hideTip();
    slabTips = {};
    let html = '';
    for (const g of segs) {
      const key = 'seg-' + g.id;
      slabTips[key] = `<strong>${esc(g.name)}</strong><div class="t-row"><span>Částka</span><span>${esc(money(g.v))}</span></div><div class="t-row"><span>Z příjmů</span><span>${pctText(g.v, base)}</span></div>`;
      html += `<span class="bs" data-tip="${key}" style="flex:${g.v} 1 0;background:var(--c-${g.id})"></span>`;
    }
    if (rest > 0) {
      slabTips['seg-rest'] = `<strong>Zbývá</strong><div class="t-row"><span>Částka</span><span>${esc(money(rest))}</span></div><div class="t-row"><span>Z příjmů</span><span>${pctText(rest, base)}</span></div>`;
      html += `<span class="bs rest" data-tip="seg-rest" style="flex:${rest} 1 0"></span>`;
    }
    $('#bar').innerHTML = html;

    const bar = $('#bar');
    const marker = $('#marker');
    if (flow > s.in && s.in > 0) {
      marker.hidden = false;
      marker.style.left = (s.in / base * 100) + '%';
    } else {
      marker.hidden = true;
    }

    const scale = $('#splitScale');
    if (!list.length) scale.textContent = '';
    else if (flow > s.in) scale.textContent = s.in > 0 ? 'Výdaje a spoření přesahují příjmy' : 'Příjmy zatím chybí';
    else scale.textContent = '100 % = ' + money(base);

    const summary = segs.slice(0, 3).map(g => `${g.name} ${pctText(g.v, base)}`).join(', ');
    bar.setAttribute('aria-label', list.length ? `Rozdělení příjmů ${money(s.in)}: ${summary}${rest > 0 ? `, zbývá ${money(rest)}` : ''}` : 'Rozdělení příjmů, zatím prázdné');

    // legenda
    $('#legend').innerHTML = segs.map(g => {
      const pressed = ui.cat === g.id;
      return `<li><button type="button" class="leg" data-cat="${g.id}" aria-pressed="${pressed}"><i class="dot" style="--dot:var(--c-${g.id})"></i><span class="name">${esc(g.name)}</span><span class="val">${esc(money(g.v))}</span><span class="pct">${pctText(g.v, base)}</span></button></li>`;
    }).join('');

    $('#slabEmpty').hidden = list.length > 0;
    $('.split').hidden = list.length === 0;
    $('#legend').hidden = segs.length === 0;
  }

  function renderTrend() {
    const nowYM = todayISO().slice(0, 7);
    let end = ui.ym > nowYM ? ui.ym : nowYM;
    if (ui.ym < shiftYM(end, -5)) end = ui.ym;
    const months = Array.from({ length: 6 }, (_, i) => shiftYM(end, i - 5));
    const data = months.map(ym => {
      const list = inMonth(ym);
      return { ym, n: list.length, ...summarize(list) };
    });
    const max = Math.max(1, ...data.flatMap(d => [d.in, d.out]));

    const h = v => (v > 0 ? Math.max(2, v / max * 100) : 0);
    hideTip();
    trendTips = {};
    $('#tcols').innerHTML = data.map(d => {
      const key = 'm-' + d.ym;
      trendTips[key] = `<strong>${esc(fmtMonth(d.ym))}</strong>`
        + `<div class="t-row"><span>Příjmy</span><span>${esc(money(d.in))}</span></div>`
        + `<div class="t-row"><span>Výdaje</span><span>${esc(money(d.out))}</span></div>`
        + `<div class="t-row"><span>Spoření</span><span>${esc(money(d.save))}</span></div>`
        + `<div class="t-row"><span>Zbývá</span><span>${d.left < 0 ? MINUS : ''}${esc(money(d.left))}</span></div>`;
      const label = `${fmtMonth(d.ym)}: příjmy ${money(d.in)}, výdaje ${money(d.out)}`;
      return `<button type="button" class="tcol" data-ym="${d.ym}" data-tip="${key}" aria-pressed="${d.ym === ui.ym}" aria-label="${esc(label)}">`
        + `<span class="bars"><i class="b in" style="height:${h(d.in)}%"></i><i class="b out" style="height:${h(d.out)}%"></i></span>`
        + `<span class="tlabel">${esc(fmtMonthShort(d.ym))}</span></button>`;
    }).join('');

    const withData = data.filter(d => d.n > 0);
    const avg = $('#avg');
    if (withData.length >= 2) {
      const aIn = Math.round(withData.reduce((a, d) => a + d.in, 0) / withData.length / 100) * 100;
      const aOut = Math.round(withData.reduce((a, d) => a + d.out, 0) / withData.length / 100) * 100;
      avg.innerHTML = `<div><dt>Průměrný příjem</dt><dd>${esc(money(aIn))}</dd></div>`
        + `<div><dt>Průměrné výdaje</dt><dd>${esc(money(aOut))}</dd></div>`
        + `<p>Průměr za ${withData.length} ${withData.length < 5 ? 'měsíce' : 'měsíců'} s pohyby. Příjmy jednoho měsíce se můžou hodně lišit od průměru.</p>`;
    } else {
      avg.innerHTML = '';
    }

    $('#trendTable tbody').innerHTML = data.map(d =>
      `<tr><td>${esc(fmtMonth(d.ym))}</td><td>${esc(money(d.in))}</td><td>${esc(money(d.out))}</td><td>${esc(money(d.save))}</td></tr>`).join('');
  }

  function filteredTx() {
    const q = ui.q.trim().toLowerCase();
    return inMonth(ui.ym).filter(t => {
      const c = CAT[t.cat];
      if (ui.kind !== 'all' && c.kind !== ui.kind) return false;
      if (ui.cat && t.cat !== ui.cat) return false;
      if (q) {
        const hay = `${t.note} ${c.name} ${numStr(t.amount)} ${t.amount / 100}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  }

  function renderList() {
    $$('#kindFilter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === ui.kind)));

    const chip = $('#activeFilter');
    chip.innerHTML = ui.cat
      ? `<button type="button" class="filter-chip" id="clearCat" aria-label="Zrušit filtr kategorie ${esc(CAT[ui.cat].name)}">${esc(CAT[ui.cat].name)}<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>`
      : '';

    const list = filteredTx();
    const host = $('#txList');
    if (!list.length) {
      const monthHas = inMonth(ui.ym).length > 0;
      host.innerHTML = monthHas
        ? `<div class="none"><p>Nic neodpovídá filtru.</p><button type="button" class="text-btn" id="clearAll">Zrušit filtry</button></div>`
        : `<div class="none"><p>V měsíci ${esc(fmtMonth(ui.ym).toLowerCase())} zatím nic není.</p><button type="button" class="text-btn" id="addHere">Přidat položku</button></div>`;
      return;
    }

    const today = todayISO();
    const yesterday = toISO(new Date(Date.now() - 864e5));
    const groups = [];
    for (const t of list) {
      const g = groups[groups.length - 1];
      if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] });
    }

    host.innerHTML = groups.map(g => {
      const tag = g.date === today ? 'Dnes' : g.date === yesterday ? 'Včera' : '';
      const rows = g.items.map(t => {
        const c = CAT[t.cat];
        const dot = c.kind === 'in' ? '<i class="dot ring"></i>' : `<i class="dot" style="--dot:${catColor(t.cat)}"></i>`;
        const sign = c.kind === 'in' ? '+' : MINUS;
        return `<li><button type="button" class="row" data-id="${esc(t.id)}" aria-label="Upravit: ${esc(c.name)}${t.note ? ', ' + esc(t.note) : ''}, ${sign}${esc(money(t.amount))}">${dot}<span class="row-main"><span class="row-cat">${esc(c.name)}</span>${t.note ? `<span class="row-note">${esc(t.note)}</span>` : ''}</span><span class="row-amt ${c.kind === 'in' ? 'in' : 'out'}">${sign}${esc(money(t.amount))}</span></button></li>`;
      }).join('');
      return `<div class="day"><h3 class="day-head">${esc(fmtDay(g.date))}${tag ? `<span class="tag">${tag}</span>` : ''}</h3><ul>${rows}</ul></div>`;
    }).join('');
  }

  function renderAll() {
    const empty = tx.length === 0;
    $('#empty').hidden = !empty;
    $('#content').hidden = empty;
    $('#demoBanner').hidden = !tx.some(t => t.demo);
    renderHeader();
    if (!empty) {
      renderSlab();
      renderTrend();
      renderList();
    }
  }

  /* ---------- navigace po měsících ---------- */

  function setMonth(ym) {
    ui.ym = ym;
    hideTip();
    renderAll();
  }
  $('#prevBtn').addEventListener('click', () => setMonth(shiftYM(ui.ym, -1)));
  $('#nextBtn').addEventListener('click', () => setMonth(shiftYM(ui.ym, 1)));
  $('#todayBtn').addEventListener('click', () => setMonth(todayISO().slice(0, 7)));

  /* ---------- filtry a klikání v přehledu ---------- */

  function toggleCat(id, cls) {
    ui.cat = ui.cat === id ? null : id;
    if (ui.cat && ui.kind !== 'all' && CAT[ui.cat].kind !== ui.kind) ui.kind = 'all';
    renderSlab();
    renderList();
    const again = document.querySelector(`.${cls}[data-cat="${id}"]`);
    if (again) again.focus({ preventScroll: true });
    if (ui.cat && window.matchMedia('(max-width: 900px)').matches) {
      $('#txTitle').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  document.addEventListener('click', e => {
    const catBtn = e.target.closest('[data-cat]');
    if (catBtn) { toggleCat(catBtn.dataset.cat, catBtn.classList[0]); return; }

    const col = e.target.closest('.tcol');
    if (col) {
      const ym = col.dataset.ym;
      setMonth(ym);
      const again = document.querySelector(`.tcol[data-ym="${ym}"]`);
      if (again) again.focus({ preventScroll: true });
      return;
    }

    const row = e.target.closest('.row');
    if (row) { openEntry(row.dataset.id); return; }

    if (e.target.closest('#clearCat')) { ui.cat = null; renderSlab(); renderList(); return; }
    if (e.target.closest('#clearAll')) { ui.cat = null; ui.kind = 'all'; ui.q = ''; $('#q').value = ''; renderSlab(); renderList(); return; }
    if (e.target.closest('#addHere')) { openEntry(); return; }
  });

  $('#kindFilter').addEventListener('click', e => {
    const b = e.target.closest('button[data-kind]');
    if (!b) return;
    ui.kind = b.dataset.kind;
    if (ui.cat && ui.kind !== 'all' && CAT[ui.cat].kind !== ui.kind) ui.cat = null;
    renderSlab();
    renderList();
  });

  $('#q').addEventListener('input', e => { ui.q = e.target.value; renderList(); });

  /* ---------- přidat / upravit položku ---------- */

  const entryDlg = $('#entryDlg');
  const form = $('#entryForm');
  const fAmount = $('#fAmount');
  const fDate = $('#fDate');
  const fNote = $('#fNote');
  const fErr = $('#fErr');
  const fDelete = $('#fDelete');
  let editingId = null;

  const kindInputs = () => $$('input[name="kind"]', form);
  const currentKind = () => (kindInputs().find(i => i.checked) || { value: 'out' }).value;

  function buildChips(kind, selected) {
    const cats = CATS.filter(c => c.kind === kind);
    const pick = cats.some(c => c.id === selected) ? selected : cats[0].id;
    $('#fCats').innerHTML = cats.map(c => {
      const dot = c.kind === 'in' ? '<i class="dot ring"></i>' : `<i class="dot" style="--dot:var(--c-${c.id})"></i>`;
      return `<label class="chip"><input type="radio" name="cat" value="${c.id}"${c.id === pick ? ' checked' : ''}><span>${dot}${esc(c.name)}</span></label>`;
    }).join('');
  }

  function defaultDate() {
    const now = todayISO();
    if (ui.ym === now.slice(0, 7)) return now;
    return `${ui.ym}-${pad(Math.min(new Date().getDate(), daysIn(ui.ym)))}`;
  }

  function resetDeleteBtn() {
    fDelete.classList.remove('confirm');
    fDelete.textContent = 'Smazat';
  }

  function openEntry(id) {
    const t = id ? tx.find(x => x.id === id) : null;
    editingId = t ? t.id : null;
    $('#entryTitle').textContent = t ? 'Upravit položku' : 'Nová položka';
    fErr.textContent = '';
    resetDeleteBtn();
    fDelete.hidden = !t;

    const kind = t ? CAT[t.cat].kind : (ui.kind !== 'all' ? ui.kind : (tx.length ? 'out' : 'in'));
    kindInputs().forEach(i => { i.checked = i.value === kind; });
    buildChips(kind, t ? t.cat : (ui.cat && CAT[ui.cat].kind === kind ? ui.cat : null));
    fAmount.value = t ? String(t.amount / 100).replace('.', ',') : '';
    fDate.value = t ? t.date : defaultDate();
    fNote.value = t ? t.note : '';

    if (!entryDlg.open) entryDlg.showModal();
    fAmount.focus();
    if (t) fAmount.select();
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'kind') buildChips(e.target.value, null);
  });

  function parseAmount(str) {
    const s = String(str).replace(/[\s ]/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const amount = parseAmount(fAmount.value);
    const catEl = $('input[name="cat"]:checked', form);
    if (!(amount > 0) || amount >= 1e12) { fErr.textContent = 'Zadej částku větší než nula, třeba 1 250 nebo 99,90.'; fAmount.focus(); return; }
    if (!catEl) { fErr.textContent = 'Vyber kategorii.'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fDate.value)) { fErr.textContent = 'Vyber datum.'; fDate.focus(); return; }

    const data = { date: fDate.value, cat: catEl.value, amount, note: fNote.value.trim().slice(0, 80) };
    if (editingId) {
      const t = tx.find(x => x.id === editingId);
      if (t) Object.assign(t, data);
    } else {
      tx.push({ id: uid(), ...data, at: Date.now() });
    }
    if (!persist()) return;
    ui.ym = data.date.slice(0, 7);
    entryDlg.close();
    renderAll();
    toast('Uloženo');
  });

  fDelete.addEventListener('click', () => {
    if (!fDelete.classList.contains('confirm')) {
      fDelete.classList.add('confirm');
      fDelete.textContent = 'Opravdu smazat?';
      return;
    }
    const idx = tx.findIndex(x => x.id === editingId);
    if (idx < 0) return;
    const [removed] = tx.splice(idx, 1);
    persist();
    entryDlg.close();
    renderAll();
    toast('Smazáno', {
      label: 'Vrátit',
      run: () => { tx.push(removed); persist(); renderAll(); },
    });
  });

  $('#fCancel').addEventListener('click', () => entryDlg.close());
  $('#entryClose').addEventListener('click', () => entryDlg.close());
  fAmount.addEventListener('input', () => { fErr.textContent = ''; });

  $('#addBtn').addEventListener('click', () => openEntry());
  $('#emptyAdd').addEventListener('click', () => openEntry());

  /* ---------- data: záloha, export, ukázka ---------- */

  const dataDlg = $('#dataDlg');
  const dataMsg = $('#dataMsg');
  const wipeBtn = $('#wipeBtn');
  let pendingImport = null;

  function resetDataDlg() {
    dataMsg.textContent = '';
    wipeBtn.classList.remove('confirm');
    wipeBtn.textContent = 'Smazat všechna data';
    pendingImport = null;
    $('#impFile').value = '';
  }

  $('#dataBtn').addEventListener('click', () => { resetDataDlg(); dataDlg.showModal(); });
  $('#dataClose').addEventListener('click', () => dataDlg.close());

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('#expJson').addEventListener('click', () => {
    if (!tx.length) { dataMsg.textContent = 'Zatím není co zálohovat.'; return; }
    const payload = { app: 'budgetovka', version: 1, exportedAt: new Date().toISOString(), tx };
    download(`budgetovka-zaloha-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    dataMsg.textContent = `Záloha stažena, ${tx.length} položek.`;
  });

  $('#expCsv').addEventListener('click', () => {
    if (!tx.length) { dataMsg.textContent = 'Zatím není co exportovat.'; return; }
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    const rows = [['Datum', 'Typ', 'Kategorie', 'Částka (Kč)', 'Poznámka'].map(q).join(';')];
    const sorted = [...tx].sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
    for (const t of sorted) {
      const c = CAT[t.cat];
      const [y, m, d] = t.date.split('-');
      const amount = (t.amount / 100).toFixed(2).replace('.', ',');
      rows.push([`${Number(d)}.${Number(m)}.${y}`, KIND_NAME[c.kind], c.name, amount, t.note].map((v, i) => (i === 3 ? v : q(v))).join(';'));
    }
    download(`budgetovka-${todayISO()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
    dataMsg.textContent = 'CSV staženo.';
  });

  $('#impFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const { items, skipped } = sanitize(parsed && parsed.tx);
      if (!items.length) throw new Error('empty');
      pendingImport = items;
      dataMsg.innerHTML = `<div class="inline"><p>Záloha obsahuje ${items.length} položek${skipped ? `, ${skipped} nečitelných se přeskočí` : ''}. Nahradit jimi aktuální data?</p><button type="button" class="btn btn-danger confirm" id="impYes">Nahradit data</button><button type="button" class="btn btn-ghost" id="impNo">Zrušit</button></div>`;
    } catch (err) {
      pendingImport = null;
      dataMsg.textContent = 'Tenhle soubor není záloha z Budgetovky. Vyber soubor JSON, který jsi stáhl tlačítkem Stáhnout zálohu.';
    }
  });

  dataMsg.addEventListener('click', e => {
    if (e.target.closest('#impNo')) { resetDataDlg(); return; }
    if (e.target.closest('#impYes') && pendingImport) {
      undoSnapshot = tx;
      tx = pendingImport;
      pendingImport = null;
      persist();
      ui.cat = null; ui.kind = 'all'; ui.q = ''; $('#q').value = '';
      dataDlg.close();
      renderAll();
      toast('Data obnovena ze zálohy', { label: 'Vrátit', run: restoreSnapshot });
    }
  });

  function restoreSnapshot() {
    if (!undoSnapshot) return;
    tx = undoSnapshot;
    undoSnapshot = null;
    persist();
    renderAll();
  }

  function loadDemo() {
    tx = tx.concat(demoData());
    persist();
    ui.ym = todayISO().slice(0, 7);
    renderAll();
    toast('Ukázková data načtena');
  }
  $('#loadDemo').addEventListener('click', () => { dataDlg.close(); loadDemo(); });
  $('#emptyDemo').addEventListener('click', loadDemo);

  $('#demoClear').addEventListener('click', () => {
    undoSnapshot = tx;
    tx = tx.filter(t => !t.demo);
    persist();
    ui.cat = null;
    renderAll();
    toast('Ukázková data smazána', { label: 'Vrátit', run: restoreSnapshot });
  });

  wipeBtn.addEventListener('click', () => {
    if (!wipeBtn.classList.contains('confirm')) {
      wipeBtn.classList.add('confirm');
      wipeBtn.textContent = 'Opravdu smazat vše?';
      return;
    }
    undoSnapshot = tx;
    tx = [];
    persist();
    ui.cat = null; ui.kind = 'all'; ui.q = ''; $('#q').value = '';
    dataDlg.close();
    renderAll();
    toast('Všechna data smazána', { label: 'Vrátit', run: restoreSnapshot });
  });

  dataDlg.addEventListener('close', resetDataDlg);
  entryDlg.addEventListener('close', resetDeleteBtn);

  // klik mimo okno (na ztmavené pozadí) ho zavře; klik na jeho vnitřní okraj ne
  [entryDlg, dataDlg].forEach(dlg => {
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) dlg.close();
    });
  });

  /* ---------- klávesy ---------- */

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing || entryDlg.open || dataDlg.open) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEntry(); }
    else if (e.key === 'ArrowLeft') { setMonth(shiftYM(ui.ym, -1)); }
    else if (e.key === 'ArrowRight') { setMonth(shiftYM(ui.ym, 1)); }
  });

  /* ---------- start ---------- */

  window.addEventListener('storage', e => {
    if (e.key === STORE_KEY) { tx = load(); renderAll(); }
  });

  tx = load();
  renderAll();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
