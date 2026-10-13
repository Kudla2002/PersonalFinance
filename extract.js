/* Čtení výpisů z PDF a z fotek (OCR). Všechno běží v prohlížeči, soubor se nikam neposílá.
   Knihovny (pdf.js, tesseract.js) se načítají až ve chvíli, kdy jsou potřeba, z vlastní složky vendor/.
   Výstup: záznamy ve stejném tvaru jako z CSV ({date, amount, name, msg, type, card, id, note?, uid?}),
   takže je zpracuje stejný import s náhledem, deduplikací a zařazením. */
(function (root) {
  'use strict';

  const Rules = root.BudgetRules;
  const fold = s => (Rules ? Rules.fold(s) : String(s || '').toLowerCase());

  /* ---------- obecné pomůcky ---------- */

  const MONTHS = { ledna: 1, unora: 2, brezna: 3, dubna: 4, kvetna: 5, cervna: 6, cervence: 7, srpna: 8, zari: 9, rijna: 10, listopadu: 11, prosince: 12,
    leden: 1, unor: 2, brezen: 3, duben: 4, kveten: 5, cerven: 6, cervenec: 7, srpen: 8, rijen: 10, listopad: 11, prosinec: 12 };
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => (y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

  /* Najde datum kdekoli v textu. Vrací { iso, index, len } nebo null. year = rok, když chybí. */
  function findDate(s, year) {
    let m = s.match(/\b(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\b/);
    if (m) { const v = iso(+m[3], +m[2], +m[1]); if (v) return { iso: v, index: m.index, len: m[0].length }; }
    m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) { const v = iso(+m[1], +m[2], +m[3]); if (v) return { iso: v, index: m.index, len: m[0].length }; }
    m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (m) { const v = iso(+m[3], +m[2], +m[1]); if (v) return { iso: v, index: m.index, len: m[0].length }; }
    const f = fold(s);
    m = f.match(/\b(\d{1,2})\.?\s+(ledna|unora|brezna|dubna|kvetna|cervna|cervence|srpna|zari|rijna|listopadu|prosince)(?:\s+(\d{4}))?/);
    if (m) { const v = iso(m[3] ? +m[3] : year, MONTHS[m[2]], +m[1]); if (v) return { iso: v, index: m.index, len: m[0].length }; }
    m = s.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(?!\s*\d)/);
    if (m && year) { const v = iso(year, +m[2], +m[1]); if (v) return { iso: v, index: m.index, len: m[0].length }; }
    return null;
  }

  /* Částka na konci řádku: "- 1 234,50 Kč", "−245 Kč", "+30 000,00 CZK", "1234.50". */
  const AMT_END = /([+\-−–]\s?)?(\d{1,3}(?:[  .]\d{3})+|\d+)([,.]\d{2})?\s*(Kč|CZK|Kc|,-)?\s*$/i;

  function amountAtEnd(s) {
    const m = s.match(AMT_END);
    if (!m) return null;
    const hasDec = !!m[3], hasCur = !!m[4];
    if (!hasDec && !hasCur && !m[1]) return null; // holé číslo bez měny a desetin je spíš kód nebo číslo účtu
    const intPart = m[2].replace(/[  .]/g, '');
    if (intPart.length > 9) return null;
    const v = parseInt(intPart, 10) * 100 + (hasDec ? parseInt(m[3].slice(1), 10) : 0);
    const sign = m[1] ? (/\+/.test(m[1]) ? 1 : -1) : 0;
    return { v, sign, index: m.index, cur: hasCur };
  }

  const BANKS = { '0100': 'KB', '0300': 'ČSOB', '0600': 'MONETA', '0710': 'ČNB', '0800': 'Česká spořitelna', '2010': 'Fio', '2250': 'Creditas', '2700': 'UniCredit', '3030': 'Air Bank', '3500': 'ING', '5500': 'Raiffeisen', '6210': 'mBank', '6363': 'Partners' };

  /* ---------- výpis Komerční banky ---------- */

  const DATE_RE = '\\d{1,2}\\. \\d{1,2}\\. \\d{4}';
  const KB_HDR = new RegExp('^\\s{0,8}(' + DATE_RE + ')\\s{2,}(?:(.*?)\\s{2,})?(?:([+\\-−])\\s?)?(\\d{1,3}(?: \\d{3})*,\\d{2}) ([A-Z]{3}|Kč)\\s*$');
  const KB_EXEC = new RegExp('^\\s*(' + DATE_RE + ')\\s+(\\S+)\\s{2,}(.+?)\\s{2,}(\\S+)\\s{2,}(\\S+)\\s{2,}(\\S+)\\s*$');
  const KB_FOOT = /Komerční banka, a\. s\., se sídlem|Zapsaná v obchodním|^\s*Výpis z účtu \d|^\s*\d+\/\d+\s*$|Datum výpisu|Code: VYPIS/;
  const dmy = s => { const [d, m, y] = s.match(/\d+/g).map(Number); return iso(y, m, d); };
  const kbMoney = (sign, num) => { const v = parseInt(num.replace(/ /g, '').replace(',', ''), 10); return sign && sign !== '+' ? -v : v; };

  function isKB(lines) {
    const head = lines.slice(0, 80).join('\n');
    return /Komerční banka/.test(lines.join('\n').slice(0, 20000)) && /Datum provedení/.test(head + lines.slice(0, 300).join('\n'));
  }

  /* lines: [{ text, cells: [{x, s}] }] */
  function parseKB(lines) {
    const L = lines.filter(l => !KB_FOOT.test(l.text));
    const blocks = [];
    for (let i = 0; i < L.length; i++) {
      const m = L[i].text.match(KB_HDR);
      if (!m) continue;
      let k = i + 1, extra = [];
      while (k < L.length && k < i + 8 && !/Datum provedení/.test(L[k].text)) { if (L[k].text.trim()) extra.push(L[k].text.trim()); k++; }
      if (k >= L.length || !/Datum provedení/.test(L[k].text)) continue;
      const mid = (m[2] || '').trim();
      const parts = mid ? mid.split(/\s{2,}/) : [];
      const b = { date: dmy(m[1]), parts, sign: m[3], num: m[4], cur: m[5], extra, msg: [], type: '', exec: '', code: '', vs: '' };
      k++;
      let typeX = null;
      if (k < L.length) {
        const e = L[k].text.match(KB_EXEC);
        if (e) {
          b.exec = dmy(e[1]); b.code = e[2]; b.type = e[3].trim(); b.vs = e[4];
          const tc = (L[k].cells || []).find(c => c.s.trim() && e[3].startsWith(c.s.trim().split(/\s+/)[0]) && c.s.trim() !== e[2]);
          typeX = tc ? tc.x : null;
          k++;
        }
      }
      while (k < L.length && L[k].text.trim() && !KB_HDR.test(L[k].text)) {
        const ln = L[k];
        const firstX = ln.cells && ln.cells.length ? ln.cells[0].x : null;
        const ind = ln.text.length - ln.text.trimStart().length;
        const isType = typeX != null && firstX != null ? Math.abs(firstX - typeX) < 12 : ind > 50;
        if (isType) b.type += ' ' + ln.text.trim(); else b.msg.push(ln.text.trim());
        k++;
      }
      blocks.push(b);
      i = k - 1;
    }

    const rows = blocks.map(b => {
      let name = b.parts[0] || '', acct = b.parts[1] || '';
      if (b.parts.length === 1 && /\d{4}\*{4,}|\/\d{4}$/.test(b.parts[0])) { name = ''; acct = b.parts[0]; }
      return { date: b.date, exec: b.exec, name: name.trim(), acct, amount: kbMoney(b.sign, b.num), cur: b.cur, type: b.type.trim(), vs: b.vs, msg: b.msg.join(' | '), extra: b.extra.join(' | '), code: b.code };
    });

    // platby v cizí měně: banka je zaúčtuje vyrovnávací úhradou v Kč za celý den a měnu; rozpočítá se podle částky v měně
    const isSettle = r => /^Vyrovnávací/.test(r.type);
    const S = rows.filter(r => isSettle(r) && r.cur === 'Kč');
    const P = rows.filter(r => isSettle(r) && r.cur !== 'Kč');
    const M = rows.filter(r => r.cur !== 'Kč' && !isSettle(r));
    const grp = new Map();
    const g = k => { if (!grp.has(k)) grp.set(k, { S: 0, P: 0, M: [] }); return grp.get(k); };
    for (const r of S) { const c = (r.extra.match(/1 ([A-Z]{3}) =/) || [])[1]; if (c) g(r.date + '|' + c).S += r.amount; }
    for (const r of P) g(r.date + '|' + r.cur).P += r.amount;
    for (const r of M) g(r.date + '|' + r.cur).M.push(r);
    const out = [];
    let unmatched = 0;
    for (const [, x] of grp) {
      if (!x.M.length) { if (x.S) unmatched += x.S; continue; }
      const msum = x.M.reduce((a, r) => a + r.amount, 0);
      const parts = x.M.map(r => (msum ? Math.round(r.amount * x.S / msum) : 0));
      const diff = x.S - parts.reduce((a, v) => a + v, 0);
      if (diff) { let bi = 0; x.M.forEach((r, i) => { if (Math.abs(r.amount) > Math.abs(x.M[bi].amount)) bi = i; }); parts[bi] += diff; }
      x.M.forEach((r, i) => out.push({ ...r, amount: parts[i], fx: `${r.amount < 0 ? '-' : ''}${(Math.abs(r.amount) / 100).toFixed(2).replace('.', ',')} ${r.cur}`, card: true }));
    }
    // vyrovnávací úhrady bez dohledané platby necháme jako jeden pohyb, ať součet sedí s bankou
    for (const r of S) {
      const c = (r.extra.match(/1 ([A-Z]{3}) =/) || [])[1];
      if (!c || !grp.get(r.date + '|' + c) || !grp.get(r.date + '|' + c).M.length) out.push({ ...r, name: 'Platba v cizí měně', card: true });
    }
    for (const r of rows) if (r.cur === 'Kč' && !isSettle(r)) out.push({ ...r, card: /\*{4}/.test(r.acct) });

    // jméno protistrany podle účtu (banka ho někdy uvede jen u části plateb)
    const acctName = {};
    for (const r of out) if (r.acct && !r.card && r.name) acctName[r.acct] = r.name;
    const cleanMsg = m => String(m || '').split(' | ').map(x => x.replace(/^Zpráva pro příjemce:\s*/i, '').replace(/^Popis pro mě:\s*/i, '').trim())
      .filter(Boolean).filter(x => !(x.length >= 14 && !/\s/.test(x)) && !/^DOC\./.test(x) && !/^\/INSTR/.test(x) && !/^PYORD/.test(x) && !/^\d+$/.test(x));

    const recs = out.map(r => {
      const isTransfer = !r.card && !!r.acct;
      let name = r.name, resolved = false;
      if (!name && r.acct && acctName[r.acct]) { name = acctName[r.acct]; resolved = true; }
      const msgs = cleanMsg(r.msg);
      let note = '', cat = '';
      const tail = (r.acct || '').slice(-9);
      const [acc, bank] = tail.split('/');
      if (isTransfer && r.amount < 0 && bank === '0710') {
        note = /zdravotn/i.test(r.msg) ? 'Zdravotní pojišťovna' : acc === '1651' ? 'Zdravotní pojišťovna' : acc === '8621' ? 'Finanční úřad' : acc === '6631' ? 'ČSSZ' : 'Platba státu';
        name = note; cat = 'dane';
      }

      if (r.type === 'Opakovaná platba' && /^(wolt|bolt)/i.test(name) && Math.abs(r.amount) <= 15000) { note = (/^wolt/i.test(name) ? 'Wolt+' : 'Bolt+') + ' (předplatné)'; cat = 'predplatne'; }

      const tidy = Rules ? Rules.tidyName : s => s;
      if (!note) {
        note = tidy(name) || tidy(msgs[0] || '');
        if (!note && isTransfer) { note = 'Převod: ' + (BANKS[bank] || 'banka ' + (bank || '?')) + ' ··' + String(acc || '').slice(-4); if (r.amount < 0 && !msgs.length) cat = 'hotovost'; }
        if (!note) note = r.type || 'Pohyb';
        if (isTransfer && name && !resolved && msgs[0] && msgs[0].toLowerCase() !== note.toLowerCase()) note += ' · ' + msgs[0].slice(0, 30);
      }
      if (r.fx) note += ' · ' + r.fx;
      return {
        date: r.date, amount: r.amount, name: name || msgs[0] || '', msg: msgs[0] || '', type: r.type, card: !!r.card,
        id: r.code ? 'kb|' + r.code : '', uid: r.code ? 'kb-' + r.code : '', note: note.slice(0, 80), cat,
      };
    });
    const total = rows.filter(r => r.cur === 'Kč').reduce((a, r) => a + r.amount, 0);
    const declared = (() => { const t = lines.map(l => l.text).join('\n').match(/Celkový počet transakcí\s+(\d+)/); return t ? +t[1] : null; })();
    return { recs, check: { blocks: blocks.length, declared, total, unmatched } };
  }

  /* ---------- obecný výpis / snímek obrazovky / účtenka ---------- */

  function parseGeneric(textLines, opts) {
    const year = (opts && opts.year) || new Date().getFullYear();
    const recs = [];
    let curDate = null, prevText = '';
    for (const raw of textLines) {
      const line = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const a = amountAtEnd(line);
      const d = findDate(line, year);
      if (d) curDate = d.iso;
      if (!a) { if (!d && /[a-zá-ž]{3}/i.test(line)) prevText = line; continue; }
      let name = line.slice(0, a.index);
      if (d && d.index < a.index) name = (name.slice(0, d.index) + ' ' + name.slice(d.index + d.len)).trim();
      name = name.replace(/\s{2,}/g, ' ').replace(/^[\s\-–:|·]+|[\s\-–:|·]+$/g, '').trim();
      if (!/[a-zá-ž]{2}/i.test(name)) name = prevText;
      const date = (d && d.iso) || curDate;
      if (!date || !a.v) continue;
      if (/zůstatek|zustatek|celkem|součet|soucet|balance|obrat/i.test(name)) continue;
      const amount = a.sign ? a.sign * a.v : -a.v; // bez znaménka bereme jako výdaj
      recs.push({ date, amount, name: name.slice(0, 80), msg: '', type: '', card: amount < 0, id: '', guessedSign: !a.sign });
      prevText = '';
    }
    return recs;
  }

  /* Účtenka: celková částka, datum a obchod. */
  function parseReceipt(textLines, opts) {
    const year = (opts && opts.year) || new Date().getFullYear();
    const lines = textLines.map(l => String(l || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    let total = null, best = null, date = null;
    for (const l of lines) {
      const d = findDate(l, year);
      if (d && !date) date = d.iso;
      const m = l.match(/(\d{1,3}(?:[ .]\d{3})*|\d+)[,.](\d{2})\s*(Kč|CZK|Kc)?\s*$/i);
      if (!m) continue;
      const v = parseInt(m[1].replace(/[ .]/g, ''), 10) * 100 + parseInt(m[2], 10);
      if (/celkem|k úhradě|k uhrade|suma|total|zaplaceno|platba kartou|celková|celkova/i.test(l) && v > 0) { if (!total || v > total) total = v; }
      if (!best || v > best) best = v;
    }
    const shop = lines.find(l => /[a-zá-ž]{3}/i.test(l) && !/^(datum|účtenka|uctenka|daňový|danovy|doklad|dič|dic|ič|ic)\b/i.test(l)) || '';
    return { amount: total || best, date, shop: ((Rules && Rules.tidyName(shop)) || shop).slice(0, 60) };
  }

  /* ---------- PDF (pdf.js) ---------- */

  const vendorBase = () => (root.document ? new URL('vendor/', root.document.baseURI).href : 'vendor/');
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const s = root.document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Knihovnu se nepodařilo načíst. Jsi online?')); };
      root.document.head.append(s);
    });
    return loaded[src];
  }

  /* Text PDF po řádcích: položky se seskupí podle svislé pozice a seřadí zleva doprava. */
  function itemsToLines(items) {
    const rows = [];
    const sorted = items.filter(it => it.str && it.str.trim()).map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str, w: it.width || 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    for (const it of sorted) {
      const r = rows.find(q => Math.abs(q.y - it.y) <= 2.2);
      if (r) r.cells.push(it); else rows.push({ y: it.y, cells: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => {
      r.cells.sort((a, b) => a.x - b.x);
      // sousední kousky blízko u sebe slepit, větší mezery = oddělovač sloupců (dvě mezery)
      const cells = [];
      for (const c of r.cells) {
        const last = cells[cells.length - 1];
        if (last && c.x - (last.x + last.w) < 3) { last.s += (c.x - (last.x + last.w) > 0.8 ? ' ' : '') + c.s; last.w = c.x + c.w - last.x; } else cells.push({ ...c });
      }
      const minX = cells[0].x;
      const lead = ' '.repeat(Math.max(0, Math.min(6, Math.round(minX / 40))));
      return { text: lead + cells.map(c => c.s.trim()).join('   '), cells };
    });
  }

  async function pdfLines(buf, onProgress) {
    if (!root.pdfjsLib) await loadScript(vendorBase() + 'pdf.min.js');
    const lib = root.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = vendorBase() + 'pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const all = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      all.push(...itemsToLines(tc.items));
      if (onProgress) onProgress(p / doc.numPages);
    }
    return all;
  }

  async function fromPDF(buf, onProgress) {
    const lines = await pdfLines(buf, onProgress);
    const text = lines.map(l => l.text);
    if (!text.join('').trim()) {
      const e = new Error('V PDF není text (je to sken). Vyfoť ho nebo nahraj jako obrázek, appka ho přečte přes OCR.');
      e.scanned = true; throw e;
    }
    if (isKB(text)) {
      const r = parseKB(lines);
      if (r.recs.length) return { kind: 'statement', bank: 'Komerční banka', recs: r.recs, check: r.check };
    }
    const recs = parseGeneric(text);
    return { kind: 'statement', bank: '', recs, check: null };
  }

  /* ---------- fotka (tesseract.js) ---------- */

  let ocrWorker = null;
  async function ocrText(file, onProgress) {
    if (!root.Tesseract) await loadScript(vendorBase() + 'tesseract/tesseract.min.js');
    if (!ocrWorker) {
      ocrWorker = await root.Tesseract.createWorker('ces', 1, {
        workerPath: vendorBase() + 'tesseract/worker.min.js',
        corePath: vendorBase() + 'tesseract/',
        langPath: vendorBase() + 'tesseract',
        gzip: true, workerBlobURL: false,
        logger: m => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); },
      });
    }
    const { data } = await ocrWorker.recognize(file);
    return String(data.text || '').split('\n');
  }

  async function fromImage(file, onProgress) {
    const lines = await ocrText(file, onProgress);
    const recs = parseGeneric(lines);
    // víc pohybů s datem = výpis nebo snímek bankovnictví, jinak účtenka
    if (recs.length >= 2) return { kind: 'statement', bank: '', recs, check: null, ocr: true };
    const r = parseReceipt(lines);
    return { kind: 'receipt', receipt: r, lines, ocr: true };
  }

  root.BudgetExtract = { findDate, amountAtEnd, parseKB, parseGeneric, parseReceipt, itemsToLines, isKB, fromPDF, fromImage };
}(typeof window !== 'undefined' ? window : globalThis));
