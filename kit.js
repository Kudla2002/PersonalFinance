/* Drobné stavební kameny zobrazení: ikony, okna (sheet) a pomocné funkce pro SVG grafy. */
(function (root) {
  'use strict';

  /* Ikony 24×24, čárové. Jména odpovídají záložkám, kategoriím a ovládacím prvkům. */
  const P = {
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    // záložky a ovládání
    home: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    trend: '<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15.5 7H21v5.5"/>',
    plan: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
    // příjmy
    prace: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M3 13.5h18"/>',
    davky: '<path d="M3 10l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    vedlejsi: '<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15.5 7H21v5.5"/>',
    lide_in: '<path d="M12 4v12"/><path d="M6.5 11l5.5 5.5L17.5 11"/><path d="M5 20h14"/>',
    vratky: '<path d="M9.5 6.5l-5 5 5 5"/><path d="M5 11.5h9a4.5 4.5 0 0 1 0 9H9"/>',
    prijem: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    // domov
    bydleni: '<path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    energie: '<path d="M13 2.5L4.5 14H11l-1 7.5L19.5 10H13z"/>',
    domacnost: '<path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11"/><path d="M3 13a2 2 0 0 1 4 0v1.5h10V13a2 2 0 0 1 4 0v5H3z"/><path d="M5.5 18v2M18.5 18v2"/>',
    // jídlo
    potraviny: '<path d="M3 4.5h2.2l2.3 10.5h9.8l2.2-8H6.2"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>',
    restaurace: '<path d="M7 3v7.5M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10"/><path d="M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17"/>',
    kavarna: '<path d="M4 9h12.5v5a5 5 0 0 1-5 5h-2.5a5 5 0 0 1-5-5z"/><path d="M16.5 10.5h1.8a2.5 2.5 0 0 1 0 5h-1.8"/><path d="M8 3.5v2.5M12 3.5v2.5"/>',
    hospoda: '<path d="M5 8.5h10.5V20H5z"/><path d="M15.5 10.5h2.2a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2h-2.2"/><path d="M5 8.5C5 6.5 6.5 5.5 8 5.5c.8-1.6 3.4-1.6 4.2 0 1.8 0 3.3 1 3.3 3"/><path d="M8.5 12v4.5M12 12v4.5"/>',
    rozvoz: '<path d="M3.5 7.5L12 3.5l8.5 4v9l-8.5 4-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9"/>',
    // mobilita
    doprava: '<rect x="4.5" y="4" width="15" height="12.5" rx="2.5"/><path d="M4.5 11h15M8 16.5V19M16 16.5V19"/><path d="M8.5 13.8h.01M15.5 13.8h.01"/>',
    taxi: '<path d="M4 15l1.6-5.4A2 2 0 0 1 7.5 8.2h9a2 2 0 0 1 1.9 1.4L20 15v3.2H4z"/><path d="M9.5 8.2V6h5v2.2M4 15h16"/><path d="M7.5 17.5v2M16.5 17.5v2"/>',
    auto: '<path d="M5 20.5V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5v15M3.5 20.5h12"/><path d="M5 10h9M14 8.5h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9.2L18.5 6"/>',
    cestovani: '<rect x="3.5" y="8" width="17" height="11.5" rx="2"/><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M3.5 13h17M10.5 13v1.5h3V13"/>',
    // volný čas
    zabava: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v12M16 6v12M3 10h5M3 14h5M16 10h5M16 14h5"/>',
    predplatne: '<path d="M4.5 9.5a8 8 0 0 1 14-2.5L20 9"/><path d="M20 4.5V9h-4.5"/><path d="M19.5 14.5a8 8 0 0 1-14 2.5L4 15"/><path d="M4 19.5V15h4.5"/>',
    nakupy: '<path d="M5.5 8h13l1 12.5h-15z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    tabak: '<path d="M3 15h13.5v3.5H3z"/><path d="M19.5 15v3.5M22 15v3.5"/><path d="M16.5 11.5c0-2 2.2-2 2.2-4.3M13 11.5c0-2 2.2-2 2.2-4.3"/>',
    // zdraví
    sport: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>',
    zdravi: '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
    pece: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    // finance
    dane: '<path d="M4 20.5h16M5.5 17.5h13"/><path d="M6.5 17.5V10M10 17.5V10M14 17.5V10M17.5 17.5V10"/><path d="M3.5 9.5L12 4l8.5 5.5z"/>',
    pojisteni: '<path d="M12 3l7.5 2.8v5.7c0 4.6-3.1 8.1-7.5 9.5-4.4-1.4-7.5-4.9-7.5-9.5V5.8z"/><path d="M9 12l2.2 2.2L15.2 10"/>',
    studium: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.8v4.2c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.2"/><path d="M21.5 9.5V15"/>',
    poplatky: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9.5 8.5h5M9.5 12.5h5"/>',
    lide: '<rect x="4" y="10.5" width="16" height="10" rx="1.5"/><rect x="3" y="7" width="18" height="3.5" rx="1"/><path d="M12 7v13.5"/><path d="M12 7c-3.3 0-4.5-3.8-1.8-3.8 2 0 1.8 3.8 1.8 3.8zM12 7c3.3 0 4.5-3.8 1.8-3.8-2 0-1.8 3.8-1.8 3.8z"/>',
    hotovost: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 10v4M17.5 10v4"/>',
    ostatni: '<path d="M6 12h.01M12 12h.01M18 12h.01" style="stroke-width:3"/>',
    sporeni: '<path d="M12 21v-8.5"/><path d="M12 12.5c0-4-3-6.3-7.5-6.3 0 4 3 6.3 7.5 6.3z"/><path d="M12 14.5c0-3.2 2.4-5.2 6.5-5.2 0 3.2-2.4 5.2-6.5 5.2z"/>',
    // ostatní prvky
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3.5a6 6 0 0 0-3.4 10.9c.6.5.9 1.1.9 1.6h5c0-.5.3-1.1.9-1.6A6 6 0 0 0 12 3.5z"/>',
    repeat: '<path d="M17 3.5l3 3-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12"/><path d="M7 20.5l-3-3 3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
    flag: '<path d="M5 21V4M5 4.5h11l-1.8 3.5L16 11.5H5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    warn: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  };

  const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.ostatni}</svg>`;

  /* ---------- okna ---------- */

  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function openDlg(dlg) {
    dlg.classList.remove('sheet-closing');
    if (!dlg.open) dlg.showModal();
  }

  function closeDlg(dlg) {
    if (!dlg.open || dlg.classList.contains('sheet-closing')) return;
    if (reduced()) { dlg.close(); return; }
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      dlg.classList.remove('sheet-closing');
      if (dlg.open) dlg.close();
    };
    dlg.classList.add('sheet-closing');
    dlg.addEventListener('animationend', fin, { once: true });
    setTimeout(fin, 400);
  }

  // zavření křížkem, klikem na ztmavené pozadí a klávesou Esc (s animací)
  function wireDlg(dlg) {
    dlg.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { closeDlg(dlg); return; }
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDlg(dlg);
    });
    dlg.addEventListener('cancel', e => { e.preventDefault(); closeDlg(dlg); });
  }

  function sheetHTML(o) {
    const left = o.left === undefined ? 'Zavřít' : o.left;
    return `<div class="sheet"><div class="sbar">`
      + (left ? `<button type="button" class="l" data-close>${left}</button>` : '<span></span>')
      + `<h2>${o.title}</h2>`
      + (o.right ? `<button type="button" class="r" data-act="ok">${o.right}</button>` : '<span></span>')
      + `</div><div class="sbody">${o.body}</div></div>`;
  }

  /* ---------- SVG ---------- */

  // "pěkné" horní meze osy: 1, 2, 2.5, 5, 10 × řád
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  function donut(parts, size, sw, centerHTML) {
    const r = (size - sw) / 2;
    const C = 2 * Math.PI * r;
    const c = size / 2;
    const total = parts.reduce((a, p) => a + p.v, 0);
    let off = 0;
    let svg = `<svg class="mixdonut spin-in" viewBox="0 0 ${size} ${size}" role="img" aria-label="Podíl skupin výdajů">`;
    svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--fill2)" stroke-width="${sw}"/>`;
    if (total > 0) {
      for (const p of parts) {
        if (p.v <= 0) continue;
        const len = p.v / total * C;
        const gap = parts.filter(x => x.v > 0).length > 1 ? Math.min(2.5, len * 0.4) : 0;
        svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${(len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${c} ${c})"><title>${p.title || ''}</title></circle>`;
        off += len;
      }
    }
    svg += centerHTML || '';
    return svg + '</svg>';
  }

  /* Tooltip u grafů: prvky s data-tip="index" uvnitř .chartwrap, texty jsou v poli tips. */
  function chartTips(wrap, tips) {
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    wrap.append(tip);
    let timer = 0;
    const show = el => {
      const html = tips[+el.dataset.tip];
      if (!html) return;
      tip.innerHTML = html;
      tip.hidden = false;
      const w = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      let x = r.left + r.width / 2 - w.left;
      x = Math.max(half + 2, Math.min(x, w.width - half - 2));
      tip.style.left = x + 'px';
      tip.style.top = Math.max(tip.offsetHeight + 4, r.top - w.top + (el.dataset.ty ? +el.dataset.ty : 0)) + 'px';
    };
    const hide = () => { tip.hidden = true; };
    wrap.addEventListener('pointermove', e => { const el = e.target.closest('[data-tip]'); if (el) show(el); else hide(); });
    wrap.addEventListener('pointerleave', hide);
    wrap.addEventListener('click', e => {
      const el = e.target.closest('[data-tip]');
      if (el) { show(el); clearTimeout(timer); timer = setTimeout(hide, 3500); } else hide();
    });
  }

  root.BGKit = { icon, P, openDlg, closeDlg, wireDlg, sheetHTML, niceMax, donut, chartTips };
}(window));
