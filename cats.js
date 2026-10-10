/* Kategorie, jejich skupiny a barvy. Při přidání nebo odebrání kategorie zvyš SCHEMA v app.js.
   `fixed` = pevné výdaje (nájem, pojištění, daně), které se nepočítají do tempa útrat. */
(function (root) {
  'use strict';

  /* col = název barvy v CSS (--green, --indigo…), podle ní se odvodí odstíny kategorií ve skupině */
  const GROUPS = [
    { id: 'in',   name: 'Příjmy',               col: 'green' },
    { id: 'dom',  name: 'Domov',                col: 'indigo' },
    { id: 'jidlo', name: 'Jídlo a pití',        col: 'orange' },
    { id: 'mob',  name: 'Mobilita',             col: 'blue' },
    { id: 'cas',  name: 'Volný čas',            col: 'pink' },
    { id: 'zdr',  name: 'Zdraví a péče',        col: 'teal' },
    { id: 'fin',  name: 'Finance a povinnosti', col: 'purple' },
    { id: 'spo',  name: 'Spoření',              col: 'yellow' },
  ];

  const CATS = [
    { id: 'prace',     name: 'Provize a mzda',          kind: 'in',   grp: 'in' },
    { id: 'davky',     name: 'Dávky a stipendia',       kind: 'in',   grp: 'in' },
    { id: 'vedlejsi',  name: 'Vedlejší příjem',         kind: 'in',   grp: 'in' },
    { id: 'lide_in',   name: 'Převody od lidí',         kind: 'in',   grp: 'in' },
    { id: 'vratky',    name: 'Vratky a prodeje',        kind: 'in',   grp: 'in' },
    { id: 'prijem',    name: 'Ostatní příjem',          kind: 'in',   grp: 'in' },

    { id: 'bydleni',   name: 'Nájem a bydlení',         kind: 'out',  grp: 'dom', fixed: true },
    { id: 'energie',   name: 'Energie a telefon',       kind: 'out',  grp: 'dom', fixed: true },
    { id: 'domacnost', name: 'Domácnost a vybavení',    kind: 'out',  grp: 'dom' },

    { id: 'potraviny', name: 'Potraviny a drogerie',    kind: 'out',  grp: 'jidlo' },
    { id: 'restaurace', name: 'Restaurace a fast food', kind: 'out',  grp: 'jidlo' },
    { id: 'kavarna',   name: 'Kavárny a sladké',        kind: 'out',  grp: 'jidlo' },
    { id: 'hospoda',   name: 'Hospody a bary',          kind: 'out',  grp: 'jidlo' },
    { id: 'rozvoz',    name: 'Rozvoz a krabičky',       kind: 'out',  grp: 'jidlo' },

    { id: 'doprava',   name: 'MHD, vlaky a autobusy',   kind: 'out',  grp: 'mob' },
    { id: 'taxi',      name: 'Taxi a Bolt',             kind: 'out',  grp: 'mob' },
    { id: 'auto',      name: 'Auto a parkování',        kind: 'out',  grp: 'mob' },
    { id: 'cestovani', name: 'Cestování a ubytování',   kind: 'out',  grp: 'mob' },

    { id: 'zabava',    name: 'Zábava a kultura',        kind: 'out',  grp: 'cas' },
    { id: 'predplatne', name: 'Předplatná a software',  kind: 'out',  grp: 'cas' },
    { id: 'nakupy',    name: 'Nákupy a oblečení',       kind: 'out',  grp: 'cas' },
    { id: 'tabak',     name: 'Trafika a tabák',         kind: 'out',  grp: 'cas' },

    { id: 'sport',     name: 'Gym a sport',             kind: 'out',  grp: 'zdr' },
    { id: 'zdravi',    name: 'Zdraví a lékárna',        kind: 'out',  grp: 'zdr' },
    { id: 'pece',      name: 'Péče a vzhled',           kind: 'out',  grp: 'zdr' },

    { id: 'dane',      name: 'Daně a odvody',           kind: 'out',  grp: 'fin', fixed: true },
    { id: 'pojisteni', name: 'Pojištění',               kind: 'out',  grp: 'fin', fixed: true },
    { id: 'studium',   name: 'Studium a vzdělání',      kind: 'out',  grp: 'fin' },
    { id: 'poplatky',  name: 'Poplatky a pošta',        kind: 'out',  grp: 'fin' },
    { id: 'lide',      name: 'Dárky a převody lidem',   kind: 'out',  grp: 'fin' },
    { id: 'hotovost',  name: 'Hotovost a převody',      kind: 'out',  grp: 'fin' },
    { id: 'ostatni',   name: 'Nezařazeno',              kind: 'out',  grp: 'fin' },

    { id: 'sporeni',   name: 'Spoření a investice',     kind: 'save', grp: 'spo' },
  ];

  /* Starší verze appky používaly jiné identifikátory. */
  const ALIAS = { jidlo: 'potraviny', sluzby: 'predplatne' };

  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const GRP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
  CATS.forEach(c => { c.idx = CATS.filter(x => x.grp === c.grp).indexOf(c); c.cnt = CATS.filter(x => x.grp === c.grp).length; });

  root.BudgetCats = { CATS, CAT, GROUPS, GRP, ALIAS };
}(typeof window !== 'undefined' ? window : globalThis));
