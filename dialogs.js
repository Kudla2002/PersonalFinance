/* Okna: přidání a úprava pohybu, data a záloha, import CSV, obchodník, nezařazené, pravidla, limity. */
(function () {
  'use strict';

  const BG = window.BG;
  const K = window.BGKit;
  const V = window.BGV;
  const U = BG.u;
  const { $, $$, esc, numStr, money, moneyRound, todayISO, shiftYM, daysIn, fmtMonth, fmtMonthShort, fmtShort, MINUS, NBSP } = U;
  const { CATS, CAT, GROUPS, An, Rules, Imp } = BG;

  const dlgs = {
    entry: $('#entryDlg'), data: $('#dataDlg'), imp: $('#importDlg'), merch: $('#merchDlg'),
    triage: $('#triageDlg'), rules: $('#rulesDlg'), limit: $('#limitDlg'), cell: $('#cellDlg'),
  };
  Object.values(dlgs).forEach(K.wireDlg);

  const close = d => K.closeDlg(d);
  const open = d => K.openDlg(d);

  /* nabídka kategorií pro výběr, seskupená podle skupin */
  function catOptions(kinds, selected, skip) {
    let h = '';
    for (const g of GROUPS) {
      const cs = CATS.filter(c => c.grp === g.id && kinds.includes(c.kind) && !(skip && skip.includes(c.id)));
      if (cs.length) h += `<optgroup label="${esc(g.name)}">${cs.map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`;
    }
    return h;
  }

  /* nejpoužívanější kategorie daného druhu (pro rychlé čipy) */
  function topCats(kind, n, skip) {
    const cnt = {};
    for (const t of BG.tx) if (CAT[t.cat] && CAT[t.cat].kind === kind && !(skip || []).includes(t.cat)) cnt[t.cat] = (cnt[t.cat] || 0) + 1;
    const used = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    const fill = CATS.filter(c => c.kind === kind && !used.includes(c.id) && !(skip || []).includes(c.id)).map(c => c.id);
    return used.concat(fill).slice(0, n);
  }
  const chip = (id, on) => `<button type="button" class="catchip${on ? ' on' : ''}" data-cat="${id}" style="--cc:${V.catColor(id)}"><i></i>${esc(CAT[id].name)}</button>`;

  const amountInput = minor => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2).replace('.', ','));
  const keyOf = note => { const b = An.baseNote(note); return Rules.merchantKey(b) || b.toLowerCase(); };
  const prettyKey = k => { const s = k.replace(/\+$/, ''); return s.charAt(0).toUpperCase() + s.slice(1); };

  function showMonthOf(date) {
    const S = V.S;
    if (S.tab === 'plan' || S.tab === 'trend') return;
    if (!S.all && date.slice(0, 7) !== S.ym) { S.ym = date.slice(0, 7); }
    if (S.tab === 'cal') S.day = date;
  }

  /* ========== přidání a úprava pohybu ========== */

  function openEntry(t, preset) {
    const dlg = dlgs.entry;
    const editing = !!t;
    const D = V.D;
    const S = V.S;
    const today = todayISO();
    const defDate = (preset && preset.date) || (S.all || S.ym === D.nowYM || S.tab === 'plan' || S.tab === 'trend' ? today : `${S.ym}-01`);
    const st = { kind: editing ? CAT[t.cat].kind : 'out', touched: false, orig: editing ? t.cat : null };
    const defCat = { out: 'potraviny', in: 'prace', save: 'sporeni' };
    const KINDS = [['out', 'Výdaj'], ['in', 'Příjem'], ['save', 'Spoření']];

    dlg.innerHTML = K.sheetHTML({
      title: editing ? 'Upravit pohyb' : 'Nový pohyb', left: 'Zrušit', right: 'Uložit',
      body: `<div style="display:flex;justify-content:center"><div class="mini-seg" id="enKind" role="group">${KINDS.map(([v, l]) => `<button type="button" data-k="${v}" aria-pressed="${st.kind === v}">${l}</button>`).join('')}</div></div>
      <div class="fg"><div class="group">
        <div class="frow"><label for="enAmt">Částka</label><input id="enAmt" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${editing ? amountInput(t.amount) : ''}"><span class="lab" style="width:auto;color:var(--label2)">Kč</span></div>
        <div class="frow"><label for="enCat">Kategorie</label><select id="enCat"></select></div>
        <div class="chiprow" id="enChips"></div>
        <div class="frow"><label for="enDate">Datum</label><input id="enDate" type="date" value="${editing ? t.date : defDate}"></div>
        <div class="frow"><label for="enNote">Obchodník</label><input id="enNote" type="text" maxlength="80" autocomplete="off" list="enNotes" placeholder="Např. Albert" value="${editing ? esc(t.note) : ''}"><datalist id="enNotes"></datalist></div>
      </div></div>
      <div class="fg" id="enRemWrap" hidden><div class="group"><div class="frow"><div class="lab" style="width:auto;flex:1"><span id="enRemLab"></span><small id="enRemSub"></small></div><input id="enRem" type="checkbox" class="switch" aria-label="Zapamatovat pro obchodníka"></div></div></div>
      ${editing ? '<div class="fg"><div class="group"><button type="button" class="danger-row" id="enDel">Smazat pohyb</button></div></div>' : ''}
      <p class="msg bad" id="enMsg" role="alert"></p>`,
    });

    const sel = $('#enCat', dlg), amt = $('#enAmt', dlg), note = $('#enNote', dlg), date = $('#enDate', dlg);
    const remWrap = $('#enRemWrap', dlg), rem = $('#enRem', dlg), msg = $('#enMsg', dlg);

    const kindsOf = k => (k === 'save' ? ['save'] : [k]);
    function fillCats(selected) {
      sel.innerHTML = catOptions(kindsOf(st.kind), selected, st.kind === 'out' ? [] : []);
      fillChips();
    }
    function fillChips() {
      const box = $('#enChips', dlg);
      const ids = topCats(st.kind, st.kind === 'out' ? 8 : 4, ['ostatni']);
      if (!ids.includes(sel.value)) ids.unshift(sel.value);
      box.innerHTML = ids.map(id => chip(id, id === sel.value)).join('');
    }
    fillCats(editing ? t.cat : defCat[st.kind]);

    // nedávní obchodníci pro našeptávání
    const seen = new Set(), names = [];
    for (const x of V.sorted(BG.tx)) {
      const b = An.baseNote(x.note);
      if (b && !seen.has(b)) { seen.add(b); names.push(b); if (names.length >= 60) break; }
    }
    $('#enNotes', dlg).innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');

    function syncRem() {
      const k = keyOf(note.value);
      const inc = st.kind === 'in';
      const changed = editing ? sel.value !== st.orig : st.touched;
      const show = !!k && st.kind !== 'save' && changed;
      if (show && remWrap.hidden) rem.checked = true;
      remWrap.hidden = !show;
      if (show) {
        let n = BG.countSameMerchant(k, inc, sel.value);
        if (editing && t.cat !== sel.value && keyOf(t.note) === k) n -= 1;
        $('#enRemLab', dlg).textContent = `Pamatovat pro „${An.baseNote(note.value)}“`;
        $('#enRemSub', dlg).textContent = n > 0 ? `Přeřadí i ${n} dalších pohybů a příště zařadí samo` : 'Příště se zařadí samo';
      }
    }

    $('#enKind', dlg).addEventListener('click', e => {
      const b = e.target.closest('button[data-k]');
      if (!b || b.dataset.k === st.kind) return;
      st.kind = b.dataset.k;
      $$('#enKind button', dlg).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      st.touched = false;
      fillCats(defCat[st.kind]);
      syncRem();
    });
    sel.addEventListener('change', () => { st.touched = true; fillChips(); syncRem(); });
    $('#enChips', dlg).addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      sel.value = b.dataset.cat; st.touched = true; fillChips(); syncRem();
    });
    note.addEventListener('input', syncRem);
    note.addEventListener('change', () => {
      // u nového pohybu nabídni kategorii podle obchodníka, dokud kategorii nezměníš ručně
      if (editing || st.touched || st.kind === 'save' || !note.value.trim()) { syncRem(); return; }
      const r = Rules.categorize({ name: note.value.trim(), msg: '', amount: st.kind === 'in' ? 1 : -1, type: '', card: true }, BG.userRules());
      if (r.how !== 'fallback' && CAT[r.cat] && CAT[r.cat].kind === st.kind) { sel.value = r.cat; fillChips(); }
      syncRem();
    });

    function save() {
      msg.textContent = '';
      const v = Imp.parseAmount(amt.value);
      const minor = v == null ? 0 : Math.abs(v);
      if (!minor) { msg.textContent = 'Zadej částku.'; amt.focus(); return; }
      if (minor >= 1e11) { msg.textContent = 'Částka je příliš velká.'; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { msg.textContent = 'Zadej datum.'; date.focus(); return; }
      const data = { date: date.value, cat: sel.value, amount: minor, note: note.value.trim().slice(0, 80) };
      const k = keyOf(data.note);
      const applyRule = !remWrap.hidden && rem.checked && k;
      BG.snap();
      let moved = 0;
      if (editing) {
        // po synchronizaci se objekty pohybů vyměnily, proto se hledá podle id; smazaný pohyb se úpravou vrátí
        const live = BG.tx.find(x => x.id === t.id);
        if (live) BG.edit(live, data); else BG.restore({ ...t, ...data });
      } else BG.add(data);
      if (applyRule) moved = BG.setRule(k, data.cat, st.kind === 'in', true);
      showMonthOf(data.date);
      BG.commit();
      close(dlg);
      BG.toast((editing ? 'Uloženo' : 'Přidáno') + (moved ? `, přeřazeno dalších ${moved}` : ''), { label: 'Vrátit', run: BG.undo });
    }
    dlg.querySelector('[data-act="ok"]').addEventListener('click', save);
    [amt, note, date].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }));

    if (editing) {
      const del = $('#enDel', dlg);
      del.addEventListener('click', () => {
        if (!del.classList.contains('confirm')) { del.classList.add('confirm'); del.textContent = 'Opravdu smazat?'; return; }
        const removed = BG.remove(t.id);
        BG.commit();
        close(dlg);
        if (removed) BG.toast('Pohyb smazán', { label: 'Vrátit', run: () => { BG.restore(removed); BG.commit(); } });
      });
    }
    open(dlg);
    if (!editing) { try { amt.focus({ preventScroll: true }); } catch (e) { /* bez fokusu */ } }
  }

  /* ========== data, záloha a Google ========== */

  function buildData() {
    dlgs.data.innerHTML = K.sheetHTML({
      title: 'Data', left: 'Hotovo',
      body: `<div class="fg"><div class="sechead">Google Disk</div><div class="group"><div class="gbox">
          <p id="gText"></p>
          <p class="gbox-link"><a href="privacy.html" target="_blank" rel="noopener">Zásady ochrany soukromí</a></p>
          <div class="gbtns"><button type="button" id="gLogin" class="primary" hidden>Přihlásit přes Google</button><button type="button" id="gSyncNow" hidden>Synchronizovat teď</button><button type="button" id="gLogout" hidden>Odhlásit</button></div>
        </div></div></div>
        <div class="fg"><div class="sechead">Import</div><div class="group">
          <button type="button" class="btnrow" id="btnCsv">Nahrát výpis (CSV) nebo zálohu (JSON)…</button>
        </div><div class="secfoot">Soubor můžeš taky jen přetáhnout do okna. Zpracuje se jen v tomhle prohlížeči a nikam se neposílá. Duplicity se přeskočí a záloha se sloučí, nic se nepřepíše.</div></div>
        <div class="fg"><div class="sechead">Záloha</div><div class="group">
          <button type="button" class="btnrow" id="btnExpJson">Stáhnout zálohu (JSON)</button>
          <button type="button" class="btnrow" id="btnExpCsv">Stáhnout pro Excel (CSV)</button>
        </div><div class="secfoot" id="dataNote"></div></div>
        <div class="fg"><div class="sechead">Zařazování</div><div class="group">
          <button type="button" class="btnrow" id="btnTriage">Nezařazené pohyby</button>
          <button type="button" class="btnrow" id="btnRules">Moje pravidla</button>
        </div></div>
        <div class="fg"><div class="sechead">Ukázka</div><div class="group">
          <button type="button" class="btnrow" id="btnDemo">Načíst ukázková data</button>
        </div></div>
        <div class="fg"><div class="group"><button type="button" class="danger-row" id="wipeBtn">Smazat všechna data</button></div><div class="secfoot" id="wipeNote"></div></div>
        <p class="msg" id="dataMsg"></p>`,
    });
    const d = dlgs.data;
    $('#btnCsv', d).addEventListener('click', pickFile);
    $('#btnExpJson', d).addEventListener('click', () => download(`budgetovka-zaloha-${todayISO()}.json`, BG.exportJSON(), 'application/json'));
    $('#btnExpCsv', d).addEventListener('click', () => download(`budgetovka-${todayISO()}.csv`, BG.exportCSV(), 'text/csv;charset=utf-8'));
    $('#btnTriage', d).addEventListener('click', () => { close(d); openTriage(); });
    $('#btnRules', d).addEventListener('click', () => { close(d); openRules(); });
    $('#btnDemo', d).addEventListener('click', () => {
      if (BG.hasDemo()) { BG.clearDemo(); BG.toast('Ukázková data smazána', { label: 'Vrátit', run: BG.undo }); } else { BG.loadDemo(); BG.toast('Ukázková data načtena'); }
      refreshData();
    });
    const wipe = $('#wipeBtn', d);
    wipe.addEventListener('click', () => {
      if (!wipe.classList.contains('confirm')) { wipe.classList.add('confirm'); wipe.textContent = 'Opravdu smazat vše?'; return; }
      BG.wipeAll();
      close(d);
      BG.toast('Všechna data smazána', { label: 'Vrátit', run: BG.undo });
    });
    d.addEventListener('close', () => {
      wipe.classList.remove('confirm'); wipe.textContent = 'Smazat všechna data';
      const lo = $('#gLogout', d);
      if (lo) { lo.classList.remove('confirm'); lo.textContent = 'Odhlásit'; }
      $('#dataMsg', d).textContent = '';
    });
  }

  function refreshData() {
    const b = $('#btnDemo', dlgs.data);
    if (b) b.textContent = BG.hasDemo() ? 'Smazat ukázková data' : 'Načíst ukázková data';
  }

  function openData() { refreshData(); open(dlgs.data); }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  /* Jeden vstup pro všechno: záloha (JSON) i výpis z banky (CSV). Pozná se podle obsahu, ne podle tlačítka. */
  function mergeJSON(text) {
    try {
      BG.snap();
      const r = BG.mergeBackup(text);
      close(dlgs.data);
      // ukaž nejnovější měsíc, ve kterém jsou data
      const last = BG.tx.reduce((m, t) => (t.date > m ? t.date : m), '');
      if (last && window.BGV) { const S = window.BGV.S; S.all = false; S.ym = last.slice(0, 7); S.tab = 'home'; window.BGV.render({ top: true }); }
      BG.toast(r.added > 0 ? `Záloha sloučena, přibylo ${r.added} pohybů` : 'Záloha sloučena, nic nového v ní nebylo', r.added > 0 ? { label: 'Vrátit', run: BG.undo } : undefined);
    } catch (err) {
      BG.toast(err.message || 'Zálohu se nepodařilo přečíst.');
    }
  }

  function startCSV(name, buf) {
    let a;
    try { a = Imp.analyse(buf); } catch (err) { a = { error: 'Soubor se nepodařilo přečíst.' }; }
    if (a.error) { BG.toast(a.error); return; }
    IMP = { name, a, map: { ...a.map }, revive: false, mapOpen: a.needsMap };
    close(dlgs.data);
    renderImport();
    open(dlgs.imp);
  }

  function handleFile(f) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { BG.toast('Soubor je moc velký.'); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const buf = fr.result;
      const head = new Uint8Array(buf.slice(0, 64));
      let i = 0;
      while (i < head.length && (head[i] <= 32 || head[i] === 0xEF || head[i] === 0xBB || head[i] === 0xBF)) i++;
      const isJSON = /\.json$/i.test(f.name) || head[i] === 0x7B; // {
      if (isJSON) mergeJSON(new TextDecoder('utf-8').decode(buf));
      else if (/\.pdf$/i.test(f.name) || (head[0] === 0x25 && head[1] === 0x50)) BG.toast('PDF výpis appka nepřečte. Stáhni si z bankovnictví výpis jako CSV.');
      else startCSV(f.name, buf);
    };
    fr.onerror = () => BG.toast('Soubor se nepodařilo přečíst.');
    fr.readAsArrayBuffer(f);
  }

  function pickFile() { const i = $('#fileCsv'); i.value = ''; i.click(); }

  $('#fileJson').addEventListener('change', e => handleFile(e.target.files && e.target.files[0]));

  // přetažení souboru kamkoli do okna
  let dragN = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; document.body.classList.add('dropping'); });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragN = Math.max(0, dragN - 1); if (!dragN) document.body.classList.remove('dropping'); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragN = 0; document.body.classList.remove('dropping');
    handleFile(e.dataTransfer.files[0]);
  });

  /* ========== import výpisu (CSV) ========== */

  let IMP = null;
  const MAP_FIELDS = [
    ['date', 'Datum', true], ['amount', 'Částka', true], ['name', 'Obchodník / protistrana'], ['msg', 'Zpráva nebo popis'],
    ['cur', 'Měna'], ['dir', 'Směr platby'], ['id', 'ID transakce'], ['type', 'Typ platby'], ['acct', 'Číslo protiúčtu'], ['state', 'Stav'],
  ];

  $('#fileCsv').addEventListener('change', e => handleFile(e.target.files && e.target.files[0]));

  function importPreview() {
    const m = IMP.map;
    if (m.date === undefined || m.amount === undefined) return null;
    const tr = Imp.toRecords(IMP.a.rows, IMP.a.headerIdx, m);
    const b = Imp.build(tr.recs, { userRules: BG.userRules(), existing: BG.tx.filter(t => !t.demo), tomb: IMP.revive ? {} : BG.tomb });
    return { tr, b };
  }

  function renderImport() {
    const dlg = dlgs.imp;
    const p = importPreview();
    const n = p ? p.b.items.length : 0;
    const hdr = IMP.a.header;
    const mapRows = MAP_FIELDS.map(([f, label, req]) => `<div class="maprow"><label for="map_${f}">${label}${req ? ' *' : ''}</label>
      <select id="map_${f}" data-f="${f}"><option value="">—</option>${hdr.map((h, i) => `<option value="${i}"${IMP.map[f] === i ? ' selected' : ''}>${esc(String(h).trim() || 'sloupec ' + (i + 1))}</option>`).join('')}</select></div>`).join('');
    let body = '';
    if (!p) {
      body += `<div class="callout warn">Nepoznal jsem sloupce s datem a částkou. Vyber je ručně níž.</div>`;
    } else {
      const s = p.b.stat;
      const top = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const skipped = [
        s.dup ? `${s.dup} duplicit` : '', s.gone ? `${s.gone} dříve smazaných` : '',
        p.tr.skipped.foreign ? `${p.tr.skipped.foreign} v cizí měně` : '', p.tr.skipped.pending ? `${p.tr.skipped.pending} nedokončených` : '',
        p.tr.skipped.invalid ? `${p.tr.skipped.invalid} nečitelných řádků` : '',
      ].filter(Boolean);
      body += `<div class="sheetstat">
        <div><div class="k">Nových pohybů</div><div class="v">${n}</div></div>
        <div><div class="k">Příjmy</div><div class="v in">+${moneyRound(s.in)}</div></div>
        <div><div class="k">Výdaje</div><div class="v">${moneyRound(s.out)}</div></div>
        <div><div class="k">Období</div><div class="v" style="font-size:14px">${s.from ? `${fmtShort(s.from)} – ${fmtShort(s.to)} ${s.to.slice(0, 4)}` : '–'}</div></div>
      </div>`;
      if (skipped.length) body += `<p class="msg" style="text-align:left;padding:0 4px">Přeskočeno: ${skipped.join(', ')}.</p>`;
      if (s.gone > 0) body += `<div class="fg"><div class="group"><div class="frow"><div class="lab" style="width:auto;flex:1">Přidat i dříve smazané<small>${s.gone} pohybů, které jsi v appce smazal</small></div><input id="impRevive" type="checkbox" class="switch"${IMP.revive ? ' checked' : ''}></div></div></div>`;
      if (n) {
        body += `<div><div class="sechead">Jak je appka zařadila</div><div class="chips">${top.map(([c, k]) => `<span class="fchip" style="background:var(--fill2);color:var(--label);padding:5px 12px">${esc(CAT[c].name)} <b style="margin-left:4px">${k}</b></span>`).join('')}</div>
          ${s.unsorted ? `<div class="secfoot">${s.unsorted} pohybů zůstane v „Nezařazeno“. Zařadíš je po importu jedním klepnutím a appka si to zapamatuje.</div>` : ''}</div>`;
        const sample = [...p.b.items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
        body += `<div class="preview"><div class="sechead">Ukázka</div><div class="group">${sample.map(it => {
          const c = CAT[it.cat];
          return `<div class="row">${V.av(it.cat, 'sm')}<div class="main"><div class="t">${esc(An.baseNote(it.note) || c.name)}</div><div class="s">${esc(c.name)} · ${fmtShort(it.date)}</div></div><div class="end ${c.kind === 'in' ? 'in' : ''}">${c.kind === 'in' ? '+' : MINUS}${numStr(it.amount)}${NBSP}Kč</div></div>`;
        }).join('')}</div></div>`;
      } else {
        body += `<div class="callout">Nic nového k importu. Všechno z tohoto souboru už v appce je.</div>`;
      }
    }
    body += `<details class="ppd"${IMP.mapOpen ? ' open' : ''} id="impMapBox"><summary style="padding:0 4px 8px"><span class="sechead" style="margin:0">Sloupce v souboru</span><span class="cnt"></span></summary><div class="group">${mapRows}</div>
      <div class="secfoot">Appka sloupce poznala podle názvů v hlavičce. Kdyby něco nesedělo, oprav to tady.</div></details>`;
    dlg.innerHTML = K.sheetHTML({ title: 'Import výpisu', left: 'Zrušit', right: n ? `Importovat ${n}` : 'Importovat', body });
    const ok = dlg.querySelector('[data-act="ok"]');
    ok.disabled = !n;
    ok.addEventListener('click', () => {
      const pv = importPreview();
      if (!pv || !pv.b.items.length) return;
      BG.snap();
      const added = BG.addMany(pv.b.items);
      const to = pv.b.stat.to;
      const S = V.S;
      S.all = false; S.ym = to.slice(0, 7); S.tab = 'home';
      BG.commit();
      close(dlg);
      BG.toast(`Importováno ${added} pohybů`, { label: 'Vrátit', run: BG.undo });
      IMP = null;
    });
    $$('select[data-f]', dlg).forEach(sl => sl.addEventListener('change', () => {
      IMP.mapOpen = $('#impMapBox', dlg).open;
      if (sl.value === '') delete IMP.map[sl.dataset.f]; else IMP.map[sl.dataset.f] = +sl.value;
      renderImport();
    }));
    const rv = $('#impRevive', dlg);
    if (rv) rv.addEventListener('change', () => { IMP.revive = rv.checked; IMP.mapOpen = $('#impMapBox', dlg).open; renderImport(); });
  }

  /* ========== obchodník ========== */

  function openMerch(key, inc) {
    const kind = inc ? 'in' : 'out';
    const list = BG.tx.filter(t => CAT[t.cat].kind === kind);
    const g = An.merchants(list, kind).find(m => m.key === key);
    if (!g) return;
    const dlg = dlgs.merch;
    const D = V.D;
    const months = An.monthRange(D.last, 12);
    const vals = months.map(m => g.byMonth[m] || 0);
    const mx = Math.max(...vals, 1);
    const thisM = g.byMonth[D.last] || 0;
    const items = V.sorted(g.items);
    dlg.innerHTML = K.sheetHTML({
      title: esc(g.name), left: 'Zavřít',
      body: `<div class="sum"><div class="k">${inc ? 'Celkem přijato' : 'Celkem utraceno'}</div><div class="v">${money(g.sum)}</div><div class="h">${g.n}× · průměr ${moneyRound(g.avg)}</div></div>
        <div class="sheetstat">
          <div><div class="k">První</div><div class="v" style="font-size:15px">${U.fmtDate(g.first)}</div></div>
          <div><div class="k">Poslední</div><div class="v" style="font-size:15px">${U.fmtDate(g.last)}</div></div>
          <div><div class="k">${fmtMonth(D.last).split(' ')[0]}</div><div class="v" style="font-size:15px">${moneyRound(thisM)}</div></div>
        </div>
        <div><div class="sechead">Posledních 12 měsíců</div><div class="panel" style="padding:14px 16px"><div class="spark">${vals.map((v, i) => `<div class="${v ? '' : 'zero'}" style="height:${Math.max(3, v / mx * 100)}%;background:${V.catColor(g.cat)}" title="${fmtMonth(months[i])}: ${moneyRound(v)}"></div>`).join('')}</div>
          <div class="sparklab">${months.map(m => `<span>${fmtMonthShort(m).slice(0, 3)}</span>`).join('')}</div></div></div>
        <div class="fg"><div class="group"><div class="frow"><label for="mCat">Kategorie</label><select id="mCat">${catOptions(inc ? ['in'] : ['out', 'save'], g.cat)}</select></div></div>
          <div class="secfoot">Změna přeřadí všech ${g.n} pohybů tohoto obchodníka a appka si ji zapamatuje i pro další importy.</div></div>
        <div><div class="sechead">Pohyby</div><div class="group">${items.slice(0, 30).map(t => V.txRow(t, { date: true }).replace('data-act="edit"', 'data-edit="1"')).join('')}
          ${items.length > 30 ? `<div class="empty" style="padding:12px">a dalších ${items.length - 30}</div>` : ''}</div></div>
        <button type="button" class="chipbtn" id="mShow" style="justify-self:center">Zobrazit v Pohybech</button>`,
    });
    $('#mCat', dlg).addEventListener('change', e => {
      const cat = e.target.value;
      BG.snap();
      const n = BG.setRule(key, cat, inc, true);
      BG.commit();
      BG.toast(`Přeřazeno ${n} pohybů do „${CAT[cat].name}“`, { label: 'Vrátit', run: BG.undo });
      openMerch(key, inc);
    });
    dlg.onclick = e => {
      const row = e.target.closest('[data-edit]');
      if (row) {
        const t = BG.tx.find(x => x.id === row.dataset.id);
        close(dlg);
        if (t) setTimeout(() => openEntry(t), 120);
      }
    };
    $('#mShow', dlg).addEventListener('click', () => {
      const S = V.S;
      S.tab = 'moves'; S.sub = 'list'; S.kind = 'all'; S.cat = null; S.q = g.name; S.all = true; S.shown = 200;
      close(dlg);
      V.render({ top: true });
    });
    open(dlg);
  }

  /* ========== detail buňky v Trendech: kategorie × měsíc(e) ========== */

  function openCell(cat, yms) {
    const dlg = dlgs.cell;
    const c = CAT[cat];
    if (!c) return;
    const set = new Set(yms);
    const items = V.sorted(BG.tx.filter(t => t.cat === cat && set.has(t.date.slice(0, 7))));
    const sum = items.reduce((a, t) => a + t.amount, 0);
    const one = yms.length === 1;
    const period = one ? fmtMonth(yms[0]) : `${fmtMonth(yms[0])} – ${fmtMonth(yms[yms.length - 1])}`;
    // srovnání s průměrem ostatních měsíců v okně
    const D = V.D;
    let cmp = '';
    if (one) {
      const prev = An.avgByCat(BG.tx, yms[0], 6);
      const avg = prev.avg[cat] || 0;
      if (prev.months && avg > 0) {
        const d = Math.round((sum - avg) / avg * 100);
        cmp = `${d >= 0 ? '+' : MINUS}${Math.abs(d)} % proti průměru (${moneyRound(avg)})`;
      }
    } else {
      const withData = yms.filter(m => (D.mm[m] || []).length).length || 1;
      cmp = `průměr ${moneyRound(sum / withData)} měsíčně`;
    }
    const ms = An.merchants(items, c.kind).slice(0, 6);
    dlg.innerHTML = K.sheetHTML({
      title: esc(c.name), left: 'Zavřít',
      body: `<div class="sum"><div class="k">${esc(period)}</div><div class="v">${money(sum)}</div><div class="h">${items.length} ${items.length === 1 ? 'platba' : items.length < 5 ? 'platby' : 'plateb'}${cmp ? ' · ' + cmp : ''}</div></div>
        ${ms.length > 1 ? `<div><div class="sechead">Kde nejvíc</div><div class="group">${ms.map(m => `<button type="button" class="row row-btn has-bar" data-merch="${esc(m.key)}"><div class="main"><div class="t">${esc(m.name)}</div><div class="s">${m.n}× · Ø ${moneyRound(m.avg)}</div></div><div class="end">${money(m.sum)}<small>${sum ? Math.round(m.sum / sum * 100) + ' %' : ''}</small></div><div class="bar2"><i style="width:${(m.sum / (ms[0].sum || 1) * 100).toFixed(1)}%;background:${V.catColor(cat)}"></i></div></button>`).join('')}</div></div>` : ''}
        <div><div class="sechead">Platby</div><div class="group">${items.slice(0, 60).map(t => V.txRow(t, { date: true }).replace('data-act="edit"', 'data-edit="1"')).join('') || '<div class="empty">Nic.</div>'}
          ${items.length > 60 ? `<div class="empty" style="padding:12px">a dalších ${items.length - 60}</div>` : ''}</div></div>
        <button type="button" class="chipbtn" id="cShow" style="justify-self:center">Otevřít v Pohybech</button>`,
    });
    dlg.onclick = e => {
      const row = e.target.closest('[data-edit]');
      if (row) { const t = BG.tx.find(x => x.id === row.dataset.id); close(dlg); if (t) setTimeout(() => openEntry(t), 120); return; }
      const mr = e.target.closest('[data-merch]');
      if (mr) { close(dlg); setTimeout(() => openMerch(mr.dataset.merch, c.kind === 'in'), 120); }
    };
    $('#cShow', dlg).addEventListener('click', () => {
      const S = V.S;
      S.tab = 'moves'; S.sub = 'list'; S.kind = 'all'; S.cat = cat; S.q = ''; S.shown = 200;
      if (one) { S.all = false; S.ym = yms[0]; } else S.all = true;
      close(dlg);
      V.render({ top: true });
    });
    open(dlg);
  }

  /* ========== nezařazené ========== */

  function openTriage() { renderTriage(); open(dlgs.triage); }

  function renderTriage() {
    const dlg = dlgs.triage;
    const un = BG.tx.filter(t => t.cat === 'ostatni');
    const ms = An.merchants(un, 'out');
    const total = un.reduce((a, t) => a + t.amount, 0);
    let body;
    if (!ms.length) {
      body = `<div class="panel" style="text-align:center"><div class="av" style="background:var(--green);margin:0 auto 10px">${K.icon('check')}</div><h2>Všechno je zařazené</h2><p class="cap" style="margin:6px 0 0">Nové pohyby z dalších importů appka zařadí podle toho, co ses ji naučil.</p></div>`;
    } else {
      var quick = topCats('out', 6, ['ostatni', 'bydleni', 'dane', 'pojisteni', 'energie']);
      body = `<div class="callout" style="margin-top:0">Ťukni u obchodníka na kategorii. Přeřadí se všechny jeho pohyby a příště se zařadí samo. Nezařazeno: <b>${un.length}</b> pohybů, ${moneyRound(total)}.</div>
        <div class="group triage">${ms.slice(0, 40).map(m => `<div class="trow"><div class="row">${V.av('ostatni')}<div class="main"><div class="t">${esc(m.name)}</div><div class="s">${m.n}× · ${moneyRound(m.sum)} · ${fmtShort(m.last)}</div></div>
          <select class="selpill" data-key="${esc(m.key)}" aria-label="Jiná kategorie pro ${esc(m.name)}"><option value="">Jiná…</option>${catOptions(['out', 'save'], '', ['ostatni'])}</select></div>
          <div class="chiprow" data-key="${esc(m.key)}">${quick.map(id => chip(id, false)).join('')}</div></div>`).join('')}</div>
        ${ms.length > 40 ? `<div class="secfoot">A ještě ${ms.length - 40} dalších obchodníků. Po zařazení těchto se zobrazí.</div>` : ''}`;
    }
    dlg.innerHTML = K.sheetHTML({ title: 'Nezařazené', left: 'Hotovo', body });
    const assign = (key, cat) => {
      BG.snap();
      const n = BG.setRule(key, cat, false, true);
      BG.commit();
      BG.toast(`${n} ${n === 1 ? 'pohyb' : 'pohybů'} → ${CAT[cat].name}`, { label: 'Vrátit', run: () => { BG.undo(); if (dlg.open) renderTriage(); } });
      renderTriage();
    };
    $$('.chiprow[data-key]', dlg).forEach(row => row.addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (b) assign(row.dataset.key, b.dataset.cat);
    }));
    $$('select[data-key]', dlg).forEach(sl => sl.addEventListener('change', () => {
      if (!sl.value) return;
      const cat = sl.value;
      BG.snap();
      const n = BG.setRule(sl.dataset.key, cat, false, true);
      BG.commit();
      BG.toast(`${n} ${n === 1 ? 'pohyb' : 'pohybů'} → ${CAT[cat].name}`, { label: 'Vrátit', run: () => { BG.undo(); if (dlg.open) renderTriage(); } });
      renderTriage();
    }));
  }

  /* ========== pravidla ========== */

  function openRules() { renderRules(); open(dlgs.rules); }

  function renderRules() {
    const dlg = dlgs.rules;
    const rules = Object.entries(BG.userRules()).sort((a, b) => a[0].localeCompare(b[0], 'cs'));
    const body = rules.length
      ? `<div class="group">${rules.map(([k, r]) => {
        const inc = k.endsWith('+');
        return `<div class="row noav"><div class="main"><div class="t">${esc(prettyKey(k))}</div><div class="s">${inc ? 'příjem' : 'výdaj'}</div></div>
          <select class="selpill" data-rk="${esc(k)}" aria-label="Kategorie pro ${esc(k)}">${catOptions(inc ? ['in'] : ['out', 'save'], r.c)}</select>
          <button type="button" class="iconbtn" data-del="${esc(k)}" aria-label="Zapomenout pravidlo" title="Zapomenout pravidlo" style="width:30px;height:30px">×</button></div>`;
      }).join('')}</div><div class="secfoot">Pravidlo říká, do které kategorie appka zařadí obchodníka při dalším importu. Zapomenutí pravidla už zařazené pohyby nemění.</div>`
      : `<div class="panel"><p class="cap" style="margin:0">Zatím žádná pravidla. Vzniknou, když u obchodníka změníš kategorii a necháš zapnuté „Pamatovat“, nebo když zařadíš nezařazené.</p></div>`;
    dlg.innerHTML = K.sheetHTML({ title: 'Moje pravidla', left: 'Hotovo', body });
    $$('select[data-rk]', dlg).forEach(sl => sl.addEventListener('change', () => {
      const k = sl.dataset.rk, inc = k.endsWith('+'), base = inc ? k.slice(0, -1) : k;
      BG.snap();
      const n = BG.setRule(base, sl.value, inc, true);
      BG.commit();
      BG.toast(n ? `Pravidlo uloženo, přeřazeno ${n} pohybů` : 'Pravidlo uloženo', { label: 'Vrátit', run: () => { BG.undo(); if (dlg.open) renderRules(); } });
    }));
    $$('button[data-del]', dlg).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.del, inc = k.endsWith('+');
      BG.clearRule(inc ? k.slice(0, -1) : k, inc);
      BG.commit();
      renderRules();
    }));
  }

  /* ========== limity ========== */

  function openLimit(cat) {
    const dlg = dlgs.limit;
    const lim = BG.limits();
    const avg = An.avgByCat(BG.tx, V.S.ym, 3);
    const editing = !!cat;
    const free = CATS.filter(c => c.kind === 'out' && !lim[c.id] && c.id !== 'ostatni').map(c => c.id);
    dlg.innerHTML = K.sheetHTML({
      title: editing ? 'Limit' : 'Nový limit', left: 'Zrušit', right: 'Uložit',
      body: `<div class="fg"><div class="group">
        <div class="frow"><label for="lmCat">Kategorie</label>${editing ? `<select id="lmCat" disabled><option>${esc(CAT[cat].name)}</option></select>` : `<select id="lmCat">${catOptions(['out'], free[0], CATS.filter(c => !free.includes(c.id)).map(c => c.id))}</select>`}</div>
        <div class="frow"><label for="lmAmt">Limit na měsíc</label><input id="lmAmt" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${editing ? amountInput(lim[cat]) : ''}"><span class="lab" style="width:auto;color:var(--label2)">Kč</span></div>
      </div><div class="secfoot" id="lmHint"></div></div>
      ${editing ? '<div class="fg"><div class="group"><button type="button" class="danger-row" id="lmDel">Odebrat limit</button></div></div>' : ''}
      <p class="msg bad" id="lmMsg"></p>`,
    });
    const sel = $('#lmCat', dlg), amt = $('#lmAmt', dlg);
    const hint = () => {
      const id = editing ? cat : sel.value;
      const a = avg.avg[id];
      $('#lmHint', dlg).textContent = a ? `Obvykle (průměr předchozích ${avg.months} měsíců): ${moneyRound(a)}.` : 'Pro tuto kategorii zatím není z čeho spočítat průměr.';
    };
    hint();
    if (!editing) sel.addEventListener('change', hint);
    const save = () => {
      const v = Imp.parseAmount(amt.value);
      const minor = v == null ? 0 : Math.abs(v);
      if (!minor) { $('#lmMsg', dlg).textContent = 'Zadej částku.'; return; }
      const id = editing ? cat : sel.value;
      if (!id) { $('#lmMsg', dlg).textContent = 'Nejsou volné kategorie.'; return; }
      BG.setMeta('l:' + id, minor);
      BG.commit();
      close(dlg);
      BG.toast('Limit uložen');
    };
    dlg.querySelector('[data-act="ok"]').addEventListener('click', save);
    amt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    if (editing) $('#lmDel', dlg).addEventListener('click', () => { BG.setMeta('l:' + cat, null); BG.commit(); close(dlg); BG.toast('Limit odebrán'); });
    open(dlg);
  }

  function suggestLimits() {
    const avg = An.avgByCat(BG.tx, V.S.ym, 3);
    if (!avg.months) { BG.toast('Zatím je málo historie na návrh limitů.'); return; }
    const lim = BG.limits();
    const skip = new Set(['ostatni', 'hotovost', 'lide']);
    const cands = CATS.filter(c => c.kind === 'out' && !c.fixed && !skip.has(c.id) && !lim[c.id] && (avg.avg[c.id] || 0) >= 30000)
      .sort((a, b) => avg.avg[b.id] - avg.avg[a.id]).slice(0, 8);
    if (!cands.length) { BG.toast('Není co navrhnout, limity máš nastavené.'); return; }
    BG.snap();
    for (const c of cands) BG.setMeta('l:' + c.id, Math.ceil(avg.avg[c.id] * 1.05 / 10000) * 10000);
    BG.commit();
    BG.toast(`Nastaveno ${cands.length} limitů podle průměru a 5 % rezervy`, { label: 'Vrátit', run: BG.undo });
  }

  /* ========== propojení ========== */

  buildData();
  BG.ui.openData = openData;
  BG.ui.closeData = () => close(dlgs.data);
  BG.ui.dataMsg = t => { const m = $('#dataMsg'); if (m) m.textContent = t; };
  BG.ui.sync = () => {};
  window.BGDlg = { openCell, openEntry, openMerch, openTriage, openRules, openLimit, suggestLimits, openData, pickFile, handleFile };

  BG.boot();
})();
