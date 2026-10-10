/* Budgetovka: jádro. Data jsou v localStorage tohoto prohlížeče. Po přihlášení přes Google se zrcadlí
   do souboru na tvém Google Disku a slučují mezi zařízeními. Částky se ukládají v haléřích.
   Vzhled je ve views.js, tady je jen práce s daty, synchronizace a rozhraní `window.BG`, které si zobrazení bere. */
(() => {
  'use strict';

  /* Google přihlášení. Client ID je veřejný údaj (ne tajný klíč). Když tu zůstane zástupný text
     __GOOGLE_CLIENT_ID__, přihlášení je v appce skryté. Postup nastavení je v README. */
  const GCFG = {
    clientId: '54571547764-d33i5181dd5cbkinff42o1gukl2v95ii.apps.googleusercontent.com',
    fileName: 'Budgetovka – data.json',
    // drive.file: appka vidí jen soubor, který sama vytvořila, ne zbytek Disku
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
  };
  const SCHEMA = 4; // 4: skrytá upozornění (meta x:…)
  const TOMB_TTL = 120 * 864e5;
  const STORE_KEY = 'budgetovka.v1';
  const MINUS = '−';
  const NBSP = ' ';

  const { CATS, CAT, GROUPS, GRP, ALIAS } = window.BudgetCats;
  const Rules = window.BudgetRules;
  const An = window.BudgetAnalytics;
  const Imp = window.BudgetImport;
  An.init(CAT);

  /* ---------- pomocné funkce ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pad = n => String(n).padStart(2, '0');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  const nf0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numStr = minor => {
    const abs = Math.abs(minor);
    return abs % 100 === 0 ? nf0.format(abs / 100) : nf2.format(abs / 100);
  };
  const numRound = minor => nf0.format(Math.round(Math.abs(minor) / 100));
  const money = minor => (minor < 0 ? MINUS : '') + numStr(minor) + NBSP + 'Kč';
  const moneyRound = minor => (Math.round(minor / 100) < 0 ? MINUS : '') + numRound(minor) + NBSP + 'Kč';
  // do grafů: 1 250 -> 1,3 tis., 2 400 000 -> 2,4 mil.
  const compact = minor => {
    const kc = Math.abs(minor) / 100;
    const s = kc >= 1e6 ? nf1.format(kc / 1e6) + NBSP + 'mil.' : kc >= 10000 ? nf0.format(kc / 1000) + NBSP + 'tis.' : kc >= 1000 ? nf1.format(kc / 1000) + NBSP + 'tis.' : nf0.format(kc);
    return (minor < 0 ? MINUS : '') + s;
  };
  const pctOf = (v, base) => (base > 0 ? v / base * 100 : 0);
  const pctText = (v, base) => {
    const p = pctOf(v, base);
    return p > 0 && p < 1 ? '<1 %' : Math.round(p) + ' %';
  };

  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const dateOf = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftYM = An.shiftYM;
  const daysIn = An.daysIn;
  const fmtMonth = ym => cap(new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(dateOf(ym + '-01')));
  const fmtMonthName = ym => cap(new Intl.DateTimeFormat('cs-CZ', { month: 'long' }).format(dateOf(ym + '-01')));
  const fmtMonthShort = ym => new Intl.DateTimeFormat('cs-CZ', { month: 'short' }).format(dateOf(ym + '-01')).replace('.', '');
  const fmtDay = iso => cap(new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateOf(iso)));
  const fmtDate = iso => `${+iso.slice(8, 10)}.${NBSP}${+iso.slice(5, 7)}.${NBSP}${iso.slice(0, 4)}`;
  const fmtShort = iso => `${+iso.slice(8, 10)}.${NBSP}${+iso.slice(5, 7)}.`;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ui = {}; // zobrazení si sem zaregistruje funkce: render, openData, closeData, dataMsg

  /* ---------- toast ---------- */

  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, action) {
    if (!toastEl) return;
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
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, action ? 7000 : 3600);
  }

  /* ---------- data ---------- */

  /* Každá položka má čas poslední změny `u`. Smazané položky se pamatují v `tomb` (id → čas smazání),
     aby smazání na jednom zařízení nevrátilo druhé při synchronizaci. Nastavení (pravidla zařazení,
     limity, cíl spoření) je v `meta` jako { klíč: { v: hodnota, u: čas } }, hodnota null = zrušeno. */
  let tx = [];
  let tomb = {};
  let meta = {};
  let undoSnapshot = null;

  const fixCat = c => ALIAS[c] || c;

  function sanitize(list) {
    if (!Array.isArray(list)) return { items: [], skipped: 0 };
    const items = [];
    let skipped = 0;
    for (const t of list) {
      const cat = t && fixCat(t.cat);
      const ok = t && typeof t === 'object'
        && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
        && CAT[cat]
        && Number.isFinite(t.amount) && t.amount > 0 && t.amount < 1e12;
      if (!ok) { skipped++; continue; }
      const at = Number.isFinite(t.at) ? t.at : 0;
      items.push({
        id: t.id ? String(t.id) : uid(),
        date: t.date,
        cat,
        amount: Math.round(t.amount),
        note: String(t.note || '').slice(0, 80),
        at,
        // starší data bez `u`: čas vzniku, nejméně 1 (nula by se v porovnání s náhrobkem ztratila)
        u: Number.isFinite(t.u) && t.u > 0 ? t.u : Math.max(1, at),
        ...(t.demo ? { demo: true } : {}),
      });
    }
    return { items, skipped };
  }

  function sanitizeTomb(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    const cutoff = Date.now() - TOMB_TTL;
    for (const [id, t] of Object.entries(obj)) if (Number.isFinite(t) && t > cutoff) out[id] = t;
    return out;
  }

  /* r:<klíč obchodníka> -> id kategorie, l:<kategorie> -> měsíční limit v haléřích, g:rate -> cílová míra úspor v % */
  function metaValue(k, v) {
    if (v == null) return null;
    if (k.startsWith('r:')) { const c = fixCat(v); return CAT[c] ? c : undefined; }
    if (k.startsWith('l:')) return Number.isFinite(v) && v > 0 && v < 1e11 ? Math.round(v) : undefined;
    if (k === 'g:rate') return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : undefined;
    if (k.startsWith('x:')) return v ? 1 : null;
    return undefined;
  }

  function sanitizeMeta(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    const cutoff = Date.now() - TOMB_TTL;
    for (const [k, m] of Object.entries(obj)) {
      if (!/^(?:r:.{1,90}|l:[a-z_]{1,30}|g:[a-z_]{1,30}|x:[a-z0-9_:.\-]{1,80})$/.test(k) || !m || typeof m !== 'object') continue;
      if (!(Number.isFinite(m.u) && m.u > 0)) continue;
      let key = k;
      if (k.startsWith('l:')) key = 'l:' + fixCat(k.slice(2));
      const v = metaValue(key, m.v);
      if (v === undefined) continue;
      if (v === null && m.u < cutoff) continue;
      if (key !== k && out[key] && out[key].u >= m.u) continue;
      out[key] = { v, u: m.u };
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { tx: [], tomb: {}, meta: {} };
      const j = JSON.parse(raw);
      return { tx: sanitize(j.tx).items, tomb: sanitizeTomb(j.tomb), meta: sanitizeMeta(j.meta) };
    } catch (e) {
      console.warn('Budgetovka: data se nepodařilo načíst', e);
      return { tx: [], tomb: {}, meta: {} };
    }
  }

  // sync = false u zápisů, které vznikly samotnou synchronizací
  function persist(sync = true) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: SCHEMA, tx, tomb, meta }));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      toast('Data se nepodařilo uložit. Zkontroluj, jestli prohlížeč neblokuje úložiště.');
      return false;
    }
    if (sync) Sync.soon();
    return true;
  }

  const renderAll = () => { if (ui.render) ui.render(); };
  const commit = () => { const ok = persist(); renderAll(); return ok; };

  /* ---------- změny dat (každá si zapíše čas, aby šla sloučit) ---------- */

  const stamp = prev => Math.max(Date.now(), (prev || 0) + 1);
  const sameContent = (a, b) => a.date === b.date && a.cat === b.cat && a.amount === b.amount && a.note === b.note;
  const snapshot = () => ({ tx: tx.map(t => ({ ...t })), meta: JSON.parse(JSON.stringify(meta)) });

  function addItem(data) {
    const now = Date.now();
    const t = { id: uid(), ...data, at: now, u: now };
    tx.push(t);
    return t;
  }

  function editItem(t, data) {
    Object.assign(t, data);
    t.u = stamp(t.u);
  }

  function removeItem(id) {
    const idx = tx.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const [removed] = tx.splice(idx, 1);
    if (!removed.demo) tomb[removed.id] = stamp(removed.u);
    return removed;
  }

  function restoreItem(t) {
    const u = stamp(Math.max(t.u, tomb[t.id] || 0));
    delete tomb[t.id];
    tx.push({ ...t, u });
  }

  // Nahradí všechna data seznamem (vymazání, vrácení). Co v seznamu chybí, se smaže i jinde.
  function replaceAll(list) {
    const now = Date.now();
    const old = new Map(tx.map(t => [t.id, t]));
    const seen = new Set();
    const next = [];
    for (const t of list) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const o = old.get(t.id);
      if (o && sameContent(o, t) && !!o.demo === !!t.demo) { next.push(o); continue; }
      next.push({ ...t, u: stamp(Math.max(o ? o.u : 0, tomb[t.id] || 0, now - 1)) });
      delete tomb[t.id];
    }
    for (const t of tx) if (!seen.has(t.id) && !t.demo) tomb[t.id] = stamp(t.u);
    tx = next;
  }

  function setMeta(k, v) {
    const prev = meta[k];
    if ((prev ? prev.v : null) === (v == null ? null : v)) return false;
    if (v == null && !prev) return false;
    meta[k] = { v: v == null ? null : v, u: stamp(prev && prev.u) };
    return true;
  }
  const getMeta = k => (meta[k] ? meta[k].v : null);

  function limits() {
    const out = {};
    for (const [k, m] of Object.entries(meta)) if (k.startsWith('l:') && m.v != null && CAT[k.slice(2)]) out[k.slice(2)] = m.v;
    return out;
  }
  function target() { return getMeta('g:rate'); }

  // pravidla zařazení pro Rules.categorize: { klíč: { c } }, příjmy mají klíč s plusem na konci
  function userRules() {
    const out = {};
    for (const [k, m] of Object.entries(meta)) if (k.startsWith('r:') && m.v) out[k.slice(2)] = { c: m.v };
    return out;
  }
  const ruleCount = () => Object.keys(userRules()).length;

  const noteKey = t => { const b = An.baseNote(t.note); return Rules.merchantKey(b) || b.toLowerCase(); };
  const isIn = t => CAT[t.cat].kind === 'in';

  /* Zapamatuje, že obchodník patří do kategorie, a (volitelně) přeřadí i dosavadní pohyby.
     Vrací počet přeřazených pohybů. */
  function setRule(key, cat, income, apply) {
    if (!key || !CAT[cat]) return 0;
    setMeta('r:' + (income ? key + '+' : key), cat);
    let n = 0;
    if (apply) {
      for (const t of tx) {
        if (t.demo || t.cat === cat || isIn(t) !== income || noteKey(t) !== key) continue;
        editItem(t, { cat });
        n++;
      }
    }
    return n;
  }
  function clearRule(key, income) { return setMeta('r:' + (income ? key + '+' : key), null); }

  /* Kolik pohybů by se přeřadilo (pro nápovědu v okně). */
  function countSameMerchant(key, income, exceptCat) {
    let n = 0;
    for (const t of tx) if (!t.demo && isIn(t) === income && noteKey(t) === key && t.cat !== exceptCat) n++;
    return n;
  }

  /* Vloží nové pohyby z importu (už zkontrolované na duplicity v Imp.build).
     Dříve smazaný pohyb se vrací jen výslovně (revive) a s novějším časem, aby přebil náhrobek. */
  function addMany(items) {
    const now = Date.now();
    let n = 0;
    if (items.length) tx = tx.filter(t => !t.demo); // skutečná data vytlačí ukázku
    const have = new Set(tx.map(t => t.id));
    for (const it of items) {
      if (have.has(it.id)) continue;
      let u = now;
      if (Object.prototype.hasOwnProperty.call(tomb, it.id)) { u = stamp(tomb[it.id]); delete tomb[it.id]; }
      tx.push({ id: it.id, date: it.date, cat: it.cat, amount: it.amount, note: it.note, at: now, u });
      have.add(it.id);
      n++;
    }
    return n;
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
    for (let i = 7; i >= 0; i--) {
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

      add(1, 'bydleni', 15800, 'Nájem');
      add(3, 'energie', between(1700, 2300, 10), 'Energie');
      add(7, 'energie', 649, 'Telefon');
      add(9, 'sport', 890, 'Posilovna');
      add(7, 'predplatne', 169, 'Spotify');
      add(8, 'predplatne', 520, 'Předplatné AI');
      add(12, 'predplatne', 259, 'Netflix');
      add(12, 'prace', between(34000, 62000, 100), 'Provize');
      if (r() > 0.5) add(21, 'vedlejsi', between(12000, 38000, 100), 'Realitní provize');
      add(6, 'sporeni', 5000, 'ETF, pravidelná investice');
      add(6, 'sporeni', 1000, 'Penzijní spoření');
      add(8, 'dane', 4700, 'Zálohy OSVČ');
      add(15, 'pojisteni', 1350, 'Pojištění auta');
      if (r() > 0.6) add(3 + Math.floor(r() * 20), 'studium', between(300, 1800, 10), pick(['Skripta', 'Kurz', 'Kniha']));

      const shops = 8 + Math.floor(r() * 5);
      for (let k = 0; k < shops; k++) add(1 + Math.floor(r() * last), 'potraviny', between(90, 1300, 10), pick(['Albert', 'Lidl', 'Billa', 'Rohlík', 'Kaufland']));
      for (let k = 0; k < 6; k++) add(1 + Math.floor(r() * last), 'restaurace', between(120, 480, 10), pick(['Oběd, bistro', 'KFC', 'Pizzerie', 'Burger']));
      for (let k = 0; k < 5; k++) add(1 + Math.floor(r() * last), 'kavarna', between(70, 190, 10), pick(['Starbucks', 'Kavárna Moravská', 'Costa Coffee']));
      for (let k = 0; k < 3; k++) add(1 + Math.floor(r() * last), 'hospoda', between(200, 900, 10), pick(['Pivnice U Mostu', 'Bar Šalanda', 'Hospoda U Dvou']));
      for (let k = 0; k < 3; k++) add(1 + Math.floor(r() * last), 'rozvoz', between(250, 650, 10), 'Wolt');
      for (let k = 0; k < 2; k++) add(2 + Math.floor(r() * (last - 2)), 'auto', between(900, 1900, 10), 'Benzín OMV');
      for (let k = 0; k < 3; k++) add(1 + Math.floor(r() * last), 'taxi', between(100, 320, 10), 'Bolt');
      add(2, 'doprava', 550, 'Jízdenka IDS JMK');
      const fun = 1 + Math.floor(r() * 3);
      for (let k = 0; k < fun; k++) add(1 + Math.floor(r() * last), 'zabava', between(200, 1600, 10), pick(['Kino', 'Koncert', 'Hra', 'Bowling']));
      if (r() > 0.5) add(1 + Math.floor(r() * last), 'zdravi', between(150, 900, 10), 'Lékárna Dr. Max');
      if (r() > 0.5) add(1 + Math.floor(r() * last), 'pece', between(250, 700, 10), 'Barber');
      if (r() > 0.4) add(1 + Math.floor(r() * last), 'nakupy', between(300, 2400, 10), pick(['Alza', 'Zalando', 'H&M']));
    }
    return out;
  }

  /* ---------- export ---------- */

  function exportJSON() {
    return JSON.stringify({ app: 'budgetovka', v: SCHEMA, exportedAt: new Date().toISOString(), ...localDoc() }, null, 1);
  }

  function csvCell(v) {
    const s = String(v);
    // buňka začínající = + - @ by se v Excelu mohla spustit jako vzorec
    const safe = /^[=+@\t\r]/.test(s) ? "'" + s : s;
    return /[;"\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  }
  function exportCSV() {
    const KIND = { in: 'Příjem', out: 'Výdaj', save: 'Spoření' };
    const rows = [['Datum', 'Typ', 'Skupina', 'Kategorie', 'Částka', 'Poznámka']];
    for (const t of [...tx].filter(t => !t.demo).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
      const c = CAT[t.cat];
      const v = (c.kind === 'in' ? 1 : -1) * t.amount;
      rows.push([t.date, KIND[c.kind], GRP[c.grp].name, c.name, (v / 100).toFixed(2).replace('.', ','), t.note]);
    }
    return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
  }

  /* ---------- Google: přihlášení ---------- */

  const gGet = (k, d = null) => {
    try { const v = localStorage.getItem('budgetovka.g.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  };
  const gSet = (k, v) => {
    try { localStorage.setItem('budgetovka.g.' + k, JSON.stringify(v)); } catch (e) { /* bez úložiště nejde přihlášení udržet */ }
  };
  const gDel = (...ks) => ks.forEach(k => { try { localStorage.removeItem('budgetovka.g.' + k); } catch (e) { /* nic */ } });
  const go = url => { location.assign(url); };
  const hash = s => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };

  let notice = ''; // zpráva z návratu od Googlu, ukáže se po startu

  /* Přihlášení přesměrováním celé stránky (implicitní tok). Funguje i v appce přidané na plochu iPhonu,
     kde vyskakovací okna ne. Token platí hodinu; po vypršení se na pozadí obnoví stejným přesměrováním. */
  const GAuth = {
    configured: () => !!GCFG.clientId && !/^__/.test(GCFG.clientId),
    signedIn: () => !!gGet('ok'),
    token() { const t = gGet('tok'); return t && t.exp > Date.now() + 60000 ? t.at : null; },
    redirectUri: () => location.origin + location.pathname.replace(/index\.html$/, ''),

    login(silent) {
      if (!GAuth.configured()) { toast('Přihlášení přes Google ještě není nastavené.'); return; }
      const st = uid();
      gSet('state', st); gSet('last', Date.now()); gSet('silent', !!silent);
      const p = new URLSearchParams({
        client_id: GCFG.clientId,
        redirect_uri: GAuth.redirectUri(),
        response_type: 'token',
        scope: GCFG.scope,
        state: st,
      });
      const hint = gGet('hint');
      if (hint) p.set('login_hint', hint);
      if (silent) p.set('prompt', 'none');
      else if (!hint) p.set('prompt', 'select_account');
      go('https://accounts.google.com/o/oauth2/v2/auth?' + p);
    },

    // zpracuje návrat od Googlu (údaje jsou v části URL za #)
    handleRedirect() {
      if (!/^#(?:.*&)?(?:access_token|error)=/.test(location.hash)) return;
      const p = new URLSearchParams(location.hash.slice(1));
      history.replaceState(null, '', location.pathname + location.search);
      if (p.get('state') !== gGet('state')) return;
      gDel('state');
      const silent = !!gGet('silent');
      if (p.get('access_token')) {
        // Google dovolí při přihlášení odškrtnout jednotlivá oprávnění; bez Disku to nemá smysl
        if (!(p.get('scope') || '').includes('drive.file')) {
          notice = 'Bez oprávnění k Disku nejde synchronizovat. Přihlas se znovu a nech zaškrtnuté oprávnění k souborům na Disku.';
          return;
        }
        gSet('tok', { at: p.get('access_token'), exp: Date.now() + (+p.get('expires_in') || 3600) * 1000, scope: p.get('scope') });
        gSet('ok', 1);
        gSet('check', 1);
      } else if (!silent) {
        notice = p.get('error') === 'access_denied' ? 'Přihlášení bylo zrušeno.' : 'Google vrátil chybu: ' + p.get('error');
      }
    },

    // tiché obnovení tokenu při otevření appky: jen když je online, uživatel už byl přihlášený a nic nerozepisuje
    maybeRefresh() {
      if (!GAuth.configured() || !GAuth.signedIn() || GAuth.token() || !navigator.onLine) return false;
      if (Date.now() - (gGet('last') || 0) < 5 * 60000) return false;
      if (document.querySelector('dialog[open]')) return false;
      GAuth.login(true);
      return true;
    },

    async whoami() {
      const r = await (await gfetch('https://www.googleapis.com/oauth2/v3/userinfo')).json();
      const email = String(r.email || '').toLowerCase();
      if (!email) throw new Error('Google nevrátil e-mail účtu');
      const owner = gGet('owner');
      if (owner && owner !== email) {
        // data na zařízení patří jinému účtu; do Disku tohoto účtu se nesmí promíchat
        wipeLocal();
        toast('Přihlášen jiný účet než dřív. Data z tohoto zařízení jsem nahradil daty z jeho Disku.');
      }
      gSet('owner', email); gSet('hint', email); gDel('check');
    },

    // má zařízení změny, které ještě nejsou na Disku?
    unsynced() {
      const d = localDoc();
      return (d.tx.length > 0 || Object.keys(d.meta).length > 0) && gGet('sig') !== hash(canon(d));
    },

    logout() {
      wipeLocal();
      gDel('tok', 'ok', 'hint', 'owner', 'check', 'last', 'silent', 'state');
      setStatus('out');
    },
  };

  function wipeLocal() {
    tx = []; tomb = {}; meta = {}; undoSnapshot = null;
    persist(false);
    gDel('fid', 'synced', 'sig');
    renderAll();
  }

  async function gfetch(url, opt = {}) {
    const t = GAuth.token();
    if (!t) throw Object.assign(new Error('nepřihlášeno'), { code: 401 });
    const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401) { gDel('tok'); throw Object.assign(new Error('přihlášení vypršelo'), { code: 401 }); }
    if (!r.ok) throw httpError(r.status);
    return r;
  }

  function httpError(status) {
    const hint = status === 403 ? ' (je v Google projektu zapnuté Drive API a máš povolený přístup k Disku?)' : '';
    return Object.assign(new Error('Google ' + status + hint), { code: status });
  }

  /* ---------- Google: slučování a synchronizace s Diskem ---------- */

  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const norm = t => ({ id: t.id, date: t.date, cat: t.cat, amount: t.amount, note: t.note, at: t.at, u: t.u });
  const localDoc = () => ({ tx: tx.filter(t => !t.demo).map(norm), tomb: { ...tomb }, meta: JSON.parse(JSON.stringify(meta)) });
  const canon = d => JSON.stringify([
    d.tx.map(norm).sort(byId),
    Object.keys(d.tomb).sort().map(k => [k, d.tomb[k]]),
    Object.keys(d.meta || {}).sort().map(k => [k, d.meta[k].v, d.meta[k].u]),
  ]);

  function mergeMeta(a, b) {
    const out = {};
    for (const src of [a || {}, b || {}]) {
      for (const [k, m] of Object.entries(src)) {
        const cur = out[k];
        if (!cur || m.u > cur.u || (m.u === cur.u && JSON.stringify(m.v) > JSON.stringify(cur.v))) out[k] = { v: m.v, u: m.u };
      }
    }
    const cutoff = Date.now() - TOMB_TTL;
    for (const k of Object.keys(out)) if (out[k].v == null && out[k].u < cutoff) delete out[k];
    return out;
  }

  /* U každé položky vyhrává novější změna. Smazání (náhrobek) vyhraje, je-li novější než poslední úprava.
     Nastavení se slučuje po klíčích stejným způsobem. Slučování je symetrické a opakovatelné,
     takže na pořadí synchronizací zařízení nezáleží. */
  function mergeDocs(a, b) {
    const dead = {};
    for (const src of [a.tomb, b.tomb]) for (const [id, t] of Object.entries(src)) dead[id] = Math.max(dead[id] || 0, t);
    const best = new Map();
    for (const t of a.tx.concat(b.tx)) {
      const cur = best.get(t.id);
      if (!cur || t.u > cur.u || (t.u === cur.u && JSON.stringify(norm(t)) > JSON.stringify(norm(cur)))) best.set(t.id, t);
    }
    const out = [];
    for (const t of best.values()) {
      if (Object.prototype.hasOwnProperty.call(dead, t.id) && dead[t.id] >= t.u) continue;
      delete dead[t.id];
      out.push(norm(t));
    }
    const cutoff = Date.now() - TOMB_TTL;
    for (const id of Object.keys(dead)) if (dead[id] < cutoff) delete dead[id];
    return { tx: out.sort(byId), tomb: dead, meta: mergeMeta(a.meta, b.meta) };
  }

  function applyDoc(doc) {
    // ukázková data drž jen dokud nejsou žádná skutečná
    tx = doc.tx.map(t => ({ ...t })).concat(doc.tx.length ? [] : tx.filter(t => t.demo));
    tomb = { ...doc.tomb };
    meta = JSON.parse(JSON.stringify(doc.meta || {}));
    persist(false);
    renderAll();
  }

  function parseRemote(text) {
    if (!text.trim()) return { tx: [], tomb: {}, meta: {} };
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('Soubor na Disku nejde přečíst. Nechávám ho beze změny.'); }
    if (!j || j.app !== 'budgetovka') throw new Error('Soubor na Disku nemá formát Budgetovky. Nechávám ho beze změny.');
    if ((j.v || 0) > SCHEMA) throw new Error('Soubor na Disku je z novější verze appky. Obnov stránku.');
    return { tx: sanitize(j.tx).items.filter(t => !t.demo), tomb: sanitizeTomb(j.tomb), meta: sanitizeMeta(j.meta) };
  }

  /* Záloha ze souboru se SLOUČÍ s tím, co už v appce je (nic se nepřepíše naslepo). */
  function mergeBackup(text) {
    const remote = parseRemote(text);
    const before = tx.filter(t => !t.demo).length;
    applyDoc(mergeDocs(localDoc(), remote));
    persist(true);
    return { added: tx.filter(t => !t.demo).length - before, total: remote.tx.length };
  }

  const DRV = 'https://www.googleapis.com/drive/v3/files';
  const UP = 'https://www.googleapis.com/upload/drive/v3/files';

  async function findFile() {
    let id = gGet('fid');
    if (id) return id;
    const q = encodeURIComponent(`name='${GCFG.fileName.replace(/'/g, "\\'")}' and trashed=false`);
    const r = await (await gfetch(`${DRV}?q=${q}&spaces=drive&fields=files(id,createdTime)&orderBy=createdTime&pageSize=10`)).json();
    id = (r.files && r.files[0] && r.files[0].id) || null; // při duplicitě platí nejstarší soubor
    if (id) gSet('fid', id);
    return id;
  }

  async function downloadFile(id) {
    const r = await fetch(`${DRV}/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + GAuth.token() } });
    if (r.status === 404) { gDel('fid'); return null; }
    if (r.status === 401) { gDel('tok'); throw Object.assign(new Error('přihlášení vypršelo'), { code: 401 }); }
    if (!r.ok) throw httpError(r.status);
    return parseRemote(await r.text());
  }

  async function uploadFile(id, doc) {
    const body = JSON.stringify({ app: 'budgetovka', v: SCHEMA, updatedAt: new Date().toISOString(), tx: doc.tx, tomb: doc.tomb, meta: doc.meta || {} });
    if (id) {
      await gfetch(`${UP}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return id;
    }
    const b = 'bdg' + uid().replace(/-/g, '');
    const metaPart = JSON.stringify({ name: GCFG.fileName, mimeType: 'application/json' });
    const r = await (await gfetch(`${UP}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + b },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
    })).json();
    gSet('fid', r.id);
    return r.id;
  }

  let syncState = 'out';
  let syncErr = '';
  let syncBusy = false;
  let syncAgain = false;
  let syncTimer = 0;
  let syncLast = gGet('synced');

  async function syncRun() {
    if (syncBusy) { syncAgain = true; return; }
    if (!GAuth.configured() || !GAuth.signedIn()) { setStatus('out'); return; }
    if (!GAuth.token()) { setStatus('expired'); return; }
    if (!navigator.onLine) { setStatus('offline'); return; }
    syncBusy = true;
    setStatus('busy');
    try {
      if (gGet('check') || !gGet('owner')) await GAuth.whoami();
      let id = await findFile();
      let remote = id ? await downloadFile(id) : null;
      if (id && !remote) { // soubor na Disku zmizel: najdi znovu, jinak se založí nový
        id = await findFile();
        remote = id ? await downloadFile(id) : null;
        if (!remote) id = null;
      }
      const base = remote || { tx: [], tomb: {}, meta: {} };
      const merged = mergeDocs(base, localDoc());
      if (!remote || canon(merged) !== canon(base)) await uploadFile(id, merged);

      const cur = localDoc(); // za dobu přenosu se mohlo něco změnit
      const next = mergeDocs(merged, cur);
      if (canon(next) !== canon(cur)) { applyDoc(next); toast('Data aktualizována z Google Disku'); }
      if (canon(next) !== canon(merged)) syncAgain = true;
      gSet('sig', hash(canon(merged)));
      syncLast = Date.now();
      gSet('synced', syncLast);
      setStatus('ok');
    } catch (e) {
      console.warn('Budgetovka: synchronizace', e);
      if (e.code === 401) setStatus('expired'); else setStatus('error', e.message);
    } finally {
      syncBusy = false;
      if (syncAgain) { syncAgain = false; syncSoon(); }
    }
  }

  function syncSoon() {
    clearTimeout(syncTimer);
    if (!GAuth.configured() || !GAuth.signedIn()) return;
    syncTimer = setTimeout(syncRun, 1500);
  }

  const stale = ms => Date.now() - (syncLast || 0) > ms;

  function syncInit() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !GAuth.signedIn()) return;
      if (GAuth.maybeRefresh()) return;
      if (GAuth.token() && stale(15000)) syncRun();
      else if (!GAuth.token()) setStatus('expired');
    });
    window.addEventListener('online', syncSoon);
    window.addEventListener('offline', () => { if (GAuth.signedIn()) setStatus('offline'); });
    setInterval(() => {
      if (document.visibilityState !== 'visible' || !GAuth.signedIn() || syncBusy) return;
      if (!GAuth.token()) setStatus('expired');
      else if (stale(120000)) syncRun();
    }, 60000);

    if (!GAuth.configured() || !GAuth.signedIn()) { setStatus('out'); return; }
    if (GAuth.token()) syncRun();
    else { setStatus('expired'); GAuth.maybeRefresh(); }
  }

  const Sync = { run: syncRun, soon: syncSoon, init: syncInit };

  /* ---------- Google: zobrazení stavu ---------- */

  const setText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
  const setHidden = (sel, hide) => { const el = $(sel); if (el) el.hidden = hide; };

  function setStatus(s, msg) {
    syncState = s;
    syncErr = msg || '';
    renderSync();
  }

  function renderSync() {
    const hm = syncLast ? new Date(syncLast).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '';
    const map = {
      out: ['Přihlásit', 'Přihlásit přes Google a ukládat data na Google Disk'],
      busy: ['Synchronizuji…', 'Synchronizuji s Google Diskem'],
      ok: ['Synchronizováno', 'Synchronizováno s Google Diskem' + (hm ? ' v ' + hm : '')],
      expired: ['Obnovit přihlášení', 'Přihlášení vypršelo. Změny se zatím ukládají jen v tomto zařízení.'],
      offline: ['Offline', 'Bez připojení. Změny se nahrají, až se připojíš.'],
      error: ['Chyba synchronizace', 'Synchronizace selhala: ' + syncErr],
    };
    const [label, title] = map[syncState] || map.out;
    const btn = $('#syncBtn');
    if (btn) {
      btn.hidden = !GAuth.configured();
      btn.dataset.s = syncState;
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    setText('#syncTxt', label);

    const cfg = GAuth.configured();
    const signed = GAuth.signedIn();
    const email = gGet('owner');
    const detail = {
      ok: hm ? `Poslední synchronizace v ${hm}.` : '',
      busy: 'Synchronizuji…',
      expired: 'Přihlášení vypršelo, změny se zatím ukládají jen v tomto zařízení. Obnov přihlášení.',
      offline: 'Bez připojení, změny se nahrají, až se připojíš.',
      error: 'Synchronizace selhala: ' + syncErr,
    }[syncState] || '';
    let text;
    if (!cfg) text = 'Přihlášení přes Google ještě není nastavené. Chybí Client ID v souboru app.js, postup je v README.';
    else if (!signed) text = `Po přihlášení se data ukládají do souboru „${GCFG.fileName}“ na tvém Google Disku a sdílejí se mezi telefonem a počítačem. Appka vidí jen tenhle jeden soubor, ne zbytek Disku.`;
    else text = `${email ? 'Přihlášen jako ' + email + '.' : 'Přihlášen přes Google.'} ${detail}`.trim();
    setText('#gText', text);

    const login = $('#gLogin');
    if (login) {
      login.hidden = !cfg || (signed && syncState !== 'expired');
      login.textContent = signed ? 'Obnovit přihlášení' : 'Přihlásit přes Google';
    }
    const now = $('#gSyncNow');
    if (now) { now.hidden = !signed || syncState === 'expired'; now.disabled = syncState === 'busy'; }
    setHidden('#gLogout', !signed);
    setText('#dataNote', signed
      ? 'Data jsou v tomhle prohlížeči a zrcadlí se do souboru na tvém Google Disku. Zálohu do souboru si můžeš stáhnout i tak.'
      : 'Bez přihlášení je všechno uložené jen v tomhle prohlížeči na tomhle zařízení. Občas si stáhni zálohu, ať o data nepřijdeš při vymazání prohlížeče nebo výměně telefonu.');
    setText('#wipeNote', signed ? 'Smaže data i na Google Disku a na ostatních zařízeních.' : 'Nejdřív si stáhni zálohu.');
    if (ui.sync) ui.sync({ state: syncState, signed, cfg });
  }

  function bindSync() {
    const btn = $('#syncBtn');
    if (btn) btn.addEventListener('click', () => {
      if (syncState === 'out' || syncState === 'expired') { GAuth.login(false); return; }
      if (ui.openData) ui.openData();
    });
    const login = $('#gLogin');
    if (login) login.addEventListener('click', () => GAuth.login(false));
    const now = $('#gSyncNow');
    if (now) now.addEventListener('click', () => { if (ui.dataMsg) ui.dataMsg(''); Sync.run(); });
    const out = $('#gLogout');
    if (out) out.addEventListener('click', () => {
      if (!out.classList.contains('confirm')) {
        out.classList.add('confirm');
        out.textContent = 'Opravdu odhlásit?';
        if (ui.dataMsg) ui.dataMsg('Data se z tohoto zařízení smažou. Na Google Disku zůstanou a po dalším přihlášení se vrátí.'
          + (GAuth.unsynced() ? ' Pozor: poslední změny se ještě nenahrály na Disk a odhlášením zmizí.' : ''));
        return;
      }
      GAuth.logout();
      if (ui.closeData) ui.closeData();
      toast('Odhlášeno. Data zůstala na Google Disku.');
    });
  }

  /* ---------- rozhraní pro zobrazení ---------- */

  const BG = {
    CATS, CAT, GROUPS, GRP, ALIAS, Rules, An, Imp, SCHEMA, ui,
    u: {
      $, $$, esc, cap, pad, uid, nf0, nf1, numStr, numRound, money, moneyRound, compact, pctOf, pctText,
      toISO, todayISO, dateOf, shiftYM, daysIn, fmtMonth, fmtMonthName, fmtMonthShort, fmtDay, fmtDate, fmtShort,
      reducedMotion, MINUS, NBSP,
    },
    toast,
    get tx() { return tx; },
    get tomb() { return tomb; },
    get meta() { return meta; },
    limits, target, getMeta, setMeta, userRules, ruleCount,
    add: addItem, edit: editItem, remove: removeItem, restore: restoreItem, replaceAll,
    setRule, clearRule, countSameMerchant, addMany,
    commit, persist,
    // Zpráva pro "Vrátit": vezme snímek před změnou a vrátí funkci, která ho obnoví.
    snap() { undoSnapshot = snapshot(); return undoSnapshot; },
    undo() {
      if (!undoSnapshot) return;
      const s = undoSnapshot;
      undoSnapshot = null;
      replaceAll(s.tx);
      // nastavení se vrací novou změnou (s novým časem), aby vyhrálo i při synchronizaci
      for (const k of new Set([...Object.keys(meta), ...Object.keys(s.meta)])) {
        const want = s.meta[k] ? s.meta[k].v : null;
        if (getMeta(k) !== want) setMeta(k, want);
      }
      commit();
    },
    demoData, loadDemo() { tx = tx.concat(demoData()); persist(); renderAll(); },
    clearDemo() { BG.snap(); replaceAll(tx.filter(t => !t.demo)); commit(); },
    hasDemo: () => tx.some(t => t.demo),
    wipeAll() { BG.snap(); replaceAll([]); for (const k of Object.keys(meta)) setMeta(k, null); commit(); },
    exportJSON, exportCSV, mergeBackup,
    sync: { run: Sync.run, state: () => syncState, last: () => syncLast },
    auth: GAuth, GCFG,
    unsynced: () => GAuth.unsynced(),
    // volá views.js po zaregistrování zobrazení
    boot() {
      GAuth.handleRedirect();
      ({ tx, tomb, meta } = load());
      bindSync();
      renderAll();
      renderSync();
      if (notice) { toast(notice); notice = ''; }
      Sync.init();
      window.addEventListener('storage', e => {
        if (e.key === 'budgetovka.v1') { ({ tx, tomb, meta } = load()); renderAll(); }
      });
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
    },
    // jen pro testy
    _test: { mergeDocs, localDoc, canon, applyDoc, parseRemote, sanitize, sanitizeMeta, GAuth, gGet, gSet, Sync },
  };

  window.BG = BG;
})();
