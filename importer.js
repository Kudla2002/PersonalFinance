/* Import bankovních výpisů ve formátu CSV. Celé se děje v prohlížeči, nic se nikam neposílá.
   Sloupce se hledají podle názvů v hlavičce (Fio, Air Bank, Raiffeisenbank, Revolut, ČSOB a podobné),
   když se nenajdou, appka je nechá vybrat ručně. Částky jsou v haléřích. */
(function (root) {
  'use strict';

  const Rules = root.BudgetRules;
  const fold = Rules.fold;

  /* UTF-8, a když v něm nejsou smysluplné znaky (starší exporty bývají ve Windows-1250), tak 1250. */
  function decode(buf) {
    let s = new TextDecoder('utf-8').decode(buf);
    if (s.includes('�')) {
      try { s = new TextDecoder('windows-1250').decode(buf); } catch (e) { /* ponechá UTF-8 */ }
    }
    return s.replace(/^﻿/, '');
  }

  function guessDelimiter(text) {
    const head = text.split(/\r?\n/).slice(0, 5).join('\n');
    const cnt = ch => (head.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
    const c = { ';': cnt(';'), ',': cnt(','), '\t': cnt('\t') };
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  }

  function parseCSV(text) {
    const delim = guessDelimiter(text);
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(c => c.trim() !== '')) rows.push(row);
    return { rows, delim };
  }

  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return null;
  }

  /* "-1 234,56", "1,234.56", "−99", "(120.00)", "123,45 CZK" -> haléře (se znaménkem) nebo null. */
  function parseAmount(s) {
    let t = String(s == null ? '' : s).trim();
    if (!t) return null;
    let neg = /^\(.*\)$/.test(t) || /^[-−–]/.test(t) || /[-−–]$/.test(t);
    t = t.replace(/[^\d.,]/g, '');
    if (!t) return null;
    const lastC = t.lastIndexOf(','), lastD = t.lastIndexOf('.');
    const dec = Math.max(lastC, lastD);
    let intPart = t, frac = '';
    if (dec >= 0 && t.length - dec - 1 <= 2 && t.length - dec - 1 > 0) { intPart = t.slice(0, dec); frac = t.slice(dec + 1); }
    intPart = intPart.replace(/[.,]/g, '');
    if (!/^\d+$/.test(intPart || '0')) return null;
    const v = parseInt(intPart || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
    if (!Number.isFinite(v)) return null;
    return neg ? -v : v;
  }

  /* Hledání sloupců podle hlavičky. První vzor, který sedí, vyhrává; vzory jsou seřazené od nejpřesnějších. */
  const FIND = {
    date: [/^datum provedeni$/, /^completed date$/, /^datum transakce$/, /^datum pohybu$/, /^booking date$/, /^datum zauctovani$/, /^datum$/, /^date$/, /datum/],
    amount: [/^castka v mene uctu$/, /^zauctovana castka$/, /^objem$/, /^castka$/, /^amount$/, /castka|objem|amount/],
    cur: [/^mena uctu$/, /^mena$/, /^currency$/, /mena|currency/],
    dir: [/^smer/],
    name: [/^nazev obchodnika$/, /^nazev protiuctu$/, /^nazev protistrany$/, /^protistrana$/, /^merchant$/, /^obchodnik$/, /^counterparty$/, /prijemce|odesilatel|protistrana|obchodnik|counterparty/, /^description$/, /^popis/, /nazev/],
    msg: [/^zprava pro prijemce$/, /^zprava$/, /^poznamka pro mne$/, /^vlastni poznamka$/, /^poznamka$/, /^message$/, /^note$/, /zprava|poznamka|komentar|upresneni|message/],
    id: [/^id pohybu$/, /^id transakce$/, /^kod transakce$/, /^transaction id$/, /^id$/, /reference|identifik/],
    type: [/^typ transakce$/, /^typ uhrady$/, /^typ$/, /^type$/, /^druh/],
    state: [/^state$/, /^stav$/, /^status$/],
    acct: [/^cislo uctu protistrany$/, /^cislo protiuctu$/, /^protiucet$/, /^protiuctu$/, /protiucet|protiuctu|counterparty account/],
  };
  const EXCLUDE = {
    amount: /puvodni|poplatek|fee|zustatek|balance|original/,
    cur: /puvodni|original/,
    name: /ucet|cislo|iban|banka|kod/,
    msg: /vs$|ks$|ss$|variabilni|konstantni|specificky/,
    id: /pokyn|instrukc/,
    date: /splatnosti/,
  };

  function detect(header) {
    const h = header.map(x => fold(x));
    const map = {};
    const used = new Set();
    for (const [field, pats] of Object.entries(FIND)) {
      let hit = -1;
      for (const re of pats) {
        hit = h.findIndex((x, i) => !used.has(i) && re.test(x) && !(EXCLUDE[field] && EXCLUDE[field].test(x)));
        if (hit >= 0) break;
      }
      if (hit >= 0) { map[field] = hit; if (field !== 'msg') used.add(hit); }
    }
    return { map, ok: map.date !== undefined && map.amount !== undefined };
  }

  /* Najde řádek s hlavičkou (některé banky dávají nad tabulku souhrn účtu). */
  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const d = detect(rows[i]);
      if (d.ok && rows[i].length >= 3) return i;
    }
    return -1;
  }

  /* Z řádků CSV udělá záznamy. Cizí měny a nedokončené platby se počítají zvlášť a přeskakují. */
  function toRecords(rows, headerIdx, map) {
    const recs = [];
    const skipped = { foreign: 0, invalid: 0, pending: 0 };
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const get = k => (map[k] === undefined || map[k] === null || map[k] === '' ? '' : String(r[map[k]] == null ? '' : r[map[k]]).trim());
      const state = fold(get('state'));
      if (state && !/completed|dokonc|provedeno|zauctovano|booked|settled/.test(state) && /pending|reverted|declined|failed|zamitnut|cekajici|storno|probiha/.test(state)) { skipped.pending++; continue; }
      const date = parseDate(get('date'));
      let amount = parseAmount(get('amount'));
      if (!date || amount === null || amount === 0) { skipped.invalid++; continue; }
      const dir = fold(get('dir'));
      if (dir) { if (/odchoz|vydaj|out|debit/.test(dir)) amount = -Math.abs(amount); else if (/prichoz|prijem|in|credit/.test(dir)) amount = Math.abs(amount); }
      const cur = get('cur').toUpperCase();
      if (cur && cur !== 'CZK' && cur !== 'KČ' && cur !== 'KC') { skipped.foreign++; continue; }
      const name = get('name');
      const msg = get('msg');
      const acct = get('acct');
      const type = get('type');
      const card = /kart|card|mobilni platba|apple pay|google pay|nakup/.test(fold(type)) || (!acct && !!name && !!type && !/prevod|uhrada|transfer/.test(fold(type)));
      recs.push({ date, amount, name, msg, id: get('id'), type, card });
    }
    return { recs, skipped };
  }

  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  /* Z nových záznamů udělá položky appky: kategorie, název, id, odfiltrované duplicity.
     existing: položky, které už appka má; tomb: smazané id (smazané se nevracejí). */
  function build(recs, opts) {
    const { userRules = null, existing = [], tomb = {}, now = Date.now() } = opts || {};
    const have = new Set(existing.map(t => t.id));
    // stejná platba (datum, částka, obchodník), kterou už appka má pod jiným id, se přeskočí; počítá se po kusech
    const sig = new Map();
    for (const t of existing) {
      const k = [t.date, t.amount, Rules.merchantKey(String(t.note || '').split(' · ')[0])].join('|');
      sig.set(k, (sig.get(k) || 0) + 1);
    }
    const seen = new Map();
    const items = [];
    const stat = { dup: 0, gone: 0, byCat: {}, unsorted: 0, from: '', to: '', in: 0, out: 0 };
    for (const r of recs) {
      const base = r.id ? 'id|' + r.id : [r.date, r.amount, r.name, r.msg].join('|');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      const id = 'imp-' + hash(base + '|' + (r.id ? '' : n));
      if (have.has(id)) { stat.dup++; continue; }
      if (Object.prototype.hasOwnProperty.call(tomb, id)) { stat.gone++; continue; }
      const note = (Rules.tidyName(r.name) || Rules.tidyName(r.msg) || 'Pohyb').slice(0, 80);
      const kk = [r.date, Math.abs(r.amount), Rules.merchantKey(note)].join('|');
      if ((sig.get(kk) || 0) > 0 && !r.id) { sig.set(kk, sig.get(kk) - 1); stat.dup++; continue; }
      const c = Rules.categorize({ name: r.name || r.msg, msg: r.msg, amount: r.amount, type: r.type, card: r.card }, userRules);
      items.push({ id, date: r.date, cat: c.cat, amount: Math.abs(r.amount), note, at: now, u: now, _how: c.how, _in: r.amount > 0 });
      stat.byCat[c.cat] = (stat.byCat[c.cat] || 0) + 1;
      if (c.cat === 'ostatni') stat.unsorted++;
      if (r.amount > 0) stat.in += r.amount; else stat.out += -r.amount;
      if (!stat.from || r.date < stat.from) stat.from = r.date;
      if (!stat.to || r.date > stat.to) stat.to = r.date;
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    return { items, stat };
  }

  /* Celý postup: bajty souboru -> detekce -> záznamy. */
  function analyse(buf) {
    const text = typeof buf === 'string' ? buf : decode(buf);
    const { rows, delim } = parseCSV(text);
    if (rows.length < 2) return { error: 'Soubor je prázdný nebo to není CSV.' };
    const hi = findHeader(rows);
    if (hi < 0) return { rows, delim, headerIdx: 0, header: rows[0], map: detect(rows[0]).map, needsMap: true };
    const map = detect(rows[hi]).map;
    return { rows, delim, headerIdx: hi, header: rows[hi], map, needsMap: false };
  }

  root.BudgetImport = { decode, parseCSV, parseDate, parseAmount, detect, findHeader, toRecords, build, analyse, hash };
}(typeof window !== 'undefined' ? window : globalThis));
