/* Automatické zařazení pohybů do kategorií.
   Obecná pravidla pro běžné řetězce a slova (ne osobní údaje). Co appka nepozná, můžeš zařadit ručně
   a appka si podle obchodníka zapamatuje tvoje pravidlo (ukládá se spolu s daty, ne do kódu). */
(function (root) {
  'use strict';

  /* Bez diakritiky, malá písmena, jednotné mezery. */
  const fold = s => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9&.*/+\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

  /* Klíč obchodníka: stejný obchod z různých poboček a plateb dá stejný klíč
     ("KAUFLAND CZ 1950" a "Kaufland CZ 2210" → "kaufland cz"). */
  function merchantKey(name) {
    let s = fold(name);
    if (!s) return '';
    s = s.replace(/^\d+\s+/, '').replace(/[*/]+/g, ' ')
    s = s.replace(/\b(vam dekuje|dekuje za nakup|dekujeme|dekuji)\b/g, ' ')
      .replace(/\b(s\.?r\.?o\.?|a\.?s\.?|z\.?s\.?|spol\.?|cz|czech rep\.?)\b/g, m => (m === 'cz' ? 'cz' : ' '))
      .replace(/\d{3,}.*$/, ' ')          // číslo pobočky, kód transakce a vše za ním
      .replace(/\b\d{1,2}\b/g, ' ')       // krátká čísla (pobočka 02)
      .replace(/[*/]+$/, ' ')
      .replace(/\s+/g, ' ').trim();
    const w = s.split(' ').filter(Boolean);
    return w.slice(0, 3).join(' ');
  }

  /* [id kategorie, regulární výraz nad složeným textem bez diakritiky]. Pořadí rozhoduje, první shoda vyhrává.
     Výraz se hledá od hranice slova (\b na začátku), takže "restaur" chytí i "restaurace". Kde má jít o celé slovo, je v něm \b. */
  const R = (cat, re) => [cat, new RegExp('\\b(?:' + re + ')', 'i')];
  const RULES = [
    // příjmy (vyhodnocují se jen u kladných částek)
    R('prace', 'zfp|mzda|vyplata|provize'),
    R('davky', 'cssz|cs sz|socialni sprav|urad prace|stipend|std |davk|duchod|prispevek'),

    // výdaje: nejdřív specifické
    R('rozvoz', 'wolt\\b|foodora|damejidlo|bolt food|fitkitchen|pomelo ?box|krabick|kosik\\.cz'),
    R('predplatne', 'spotify|netflix|hbo\\b|max\\.com|disney|apple\\.com|itunes|icloud|google \\*|google play|youtube|anthropic|claude\\.ai|claude sub|openai|chatgpt|adobe|microsoft|office 365|dropbox|herohero|patreon|audible|canva|notion|github|lepsi\\.tv|jubox|o2 tv|voyo|skyshowtime|steam purchase|twitch|substack'),
    R('tabak', 'tabak|trafika|iqos|vape|cigar|zigaret'),
    R('restaurace', 'kfc|mcdonald|burger king|subway|bageterie|bagetarie'),
    R('taxi', 'bolt\\.eu|bolt\\b|uber\\b|liftago|taxi|free ?now'),
    R('auto', 'shell\\b|omv\\b|orlen|benzin|eurooil|euro oil|d-oil|\\bmol \\b|tank ono|bp tankstelle|motorest|cs phm|cs prim|autodoplnky|parkov|parking|car ?wash|pneu|autosklo|dalnicni|dalnice|mmb '),
    R('cestovani', 'ryanair|wizz|easyjet|lufthansa|airbnb|booking\\.com|hotel|penzion|rezidence|ubytov|hostel|tfl\\b|resort|apartm|ferry|flixbus|letiste|airport|aeropuerto|praha ruzyne'),
    R('doprava', 'idsjmk|dpp\\b|dpmb|dpo\\b|regiojet|student agency|cd\\.cz|ceske drahy|rjcz|csad|leo express|arriva|brno (?:hl|i|ii|iii|iv|v|vi|josefska|nadrazni)\\b|praha hl|nadrazni|mhd|jizdne|jizdenk|pid\\b|litacka'),
    R('sport', 'gym|fitness|x ?fitness|multisport|decathlon|hervis|intersport|vilgain|myprotein|vp nutrition|gymbeam|squash|plavani|bazen|koupaliste|sportcentrum|sport centrum|volejbal|florbal|fotbal|tenis|lezeck|boulder|crossfit|joga\\b|yoga|nutrition|protein'),
    R('zdravi', 'lekarna|dr\\.? ?max|drmax|benu\\b|farmacia|zubni|ortho ?dent|dental|poliklinik|nemocnic|optik|doktor|ambulance|laborato|fyzio'),
    R('pece', 'barber|kadernic|holic|kosmetik|nehty|nail|wellness|salon|sephora|notino|douglas|rituals|masaz|spa\\b'),
    R('zabava', 'cinema|cinemacity|kino\\b|playstation|nintendo|xbox|epic games|minigolf|golf|bowling|o2 arena|divadlo|theatre|muzeum|zoo\\b|listky|ticketportal|goout|smsticket|laser|escape|billiard|bilard|kasino|casino|sazka|tipsport|fortuna'),
    R('hospoda', 'pivnic|hospod|pivovar|bar\\b|pub\\b|lounge|club\\b|klub|cocktail|drink|vinotek|wine\\b|shisha|hookah|beach|potrefena husa'),
    R('kavarna', 'cafe|kavar|coffee|costa\\b|starbucks|dezert|cukrar|zmrzlin|gelato|bakery|pekarn|sweet|donut|bubble tea|dorty|croissant|caffe|espresso|gails|fika|kolac'),
    R('restaurace', 'kfc|mcdonald|burger king|subway|bistro|bageterie|bagetarie|restaur|pizz|kebab|sushi|wok\\b|asia|pho\\b|bufet|buffet|grill|steak|ugo\\b|salaterie|pret a manger|schnitzel|ristorante|diner|jidelna|kantyna|kuchyn|hamburger|burger|bagel|taco|food court|trattoria|osteria'),
    R('potraviny', 'rohlik|albert|lidl|kaufland|tesco|billa|penny|globus|makro|coop\\b|potraviny|samoobsluha|minimarket|mini market|non stop|zabka|teta\\b|delikomat|dm drogerie|rossmann|supermarket|supermercado|hypermarket|velkoobchod|spar\\b|nisa\\b|vecerka|market|maso\\b|uzenar|ovoce|zelenina|farm|coca-cola'),
    R('lide', 'kvetin|flamengo|darek|darky|dar pro|svatb'),
    R('domacnost', 'ikea|action\\b|jysk|obi\\b|hornbach|baumax|tedi\\b|xxxlutz|mobelix|bauhaus|sconto|zahrad|zelezarstvi|elektro'),
    R('nakupy', 'alza|czc\\b|datart|electro ?world|mall\\.cz|vinted|zalando|about you|h&m|hm cz|reserved|zara\\b|pepco|kik\\b|peek|cloppenburg|mango|massimo dutti|smarty|eurobit|knihy|luxor|dobrovsky|amazon|aliexpress|temu|shein|dobirk|ppl\\.cz|inspiration|e-shop|eshop|obchod|store\\b|shop\\b'),
    R('energie', 'e\\.on|eon\\.cz|pre\\b|cez\\b|innogy|vodafone|o2\\b|t-mobile|nordic telecom|upc\\b|plyn|elektrin|vodne|stocne|internet|telefon|teplo'),
    R('bydleni', 'spolecenstvi vlastniku|svj\\b|najem|najemne|nedoplatek za r|fond oprav|zalohy sluzeb'),
    R('dane', 'financni urad|cssz|ceska sprava socialniho|zdravotni pojist|vzp\\b|ozp\\b|vozp|cpzp|rbp\\b|zpmv|dan z|dph\\b|silnicni dan|eportal'),
    R('pojisteni', 'pojist|axa|allianz|generali|kooperativa|uniqa|nn\\b|cpp\\b|slavia|ergo\\b'),
    R('studium', 'muni|masaryk|univerzit|skolne|kurz\\b|skola|efpa|seminar|konference|licence|zkouska|vzdelavani|kniha'),
    R('poplatky', 'poplatek|komercni banka|ceska posta|zasilkovna|ppl\\b|dpd\\b|notar|cuzk|gopay|kolek|sprava poplatku|overeni uctu'),
    R('hotovost', 'atm\\b|vyber hotovosti|revolut|bankomat'),
  ];


  /* Čitelný název z bankovního textu: bez "VAM DEKUJE", čísel poboček a křiku VELKÝMI PÍSMENY. */
  const KEEP_UP = new Set(['KFC', 'BK', 'DM', 'IKEA', 'CSAD', 'DPP', 'OMV', 'MMB', 'ATM', 'KB', 'CS', 'ČS', 'ČSOB', 'PPL', 'DPD', 'HM', 'TFL', 'USA', 'UK', 'EU']);
  function tidyName(name) {
    let s = String(name || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/^\d{2,}\s+(?=[A-Za-zÁ-Ž])/, '')
      .replace(/^(dekujeme|děkujeme),?\s*/i, '')
      .replace(/\s*(vam dekuje|vám děkuje|dekuje za nakup|děkuje za nákup)\s*/ig, ' ')
      .replace(/\s+\d{3,}.*$/, '')
      .replace(/[/\s]*\d{5,}.*$/, '')
      .replace(/[,;\s]+$/, '').trim();
    if (s.length > 4 && s === s.toUpperCase()) {
      s = s.toLowerCase().replace(/(^|[\s.,*/-])([a-zá-ž])/g, (m, a, b) => a + b.toUpperCase());
      s = s.replace(/\b[A-Za-zÁ-Ž]{1,3}\b/g, w => (KEEP_UP.has(w.toUpperCase()) ? w.toUpperCase() : w));
    }
    return s;
  }

  const IN_CATS = new Set(['prace', 'davky', 'vedlejsi', 'lide_in', 'vratky', 'prijem']);

  /* Osoba = dvě slova s velkým písmenem bez označení firmy. Používá se jen pro převody z účtu na účet. */
  function looksLikePerson(name) {
    const n = String(name || '').trim();
    if (!n || /\d|s\.?r\.?o|a\.?s\.?\b|spol|z\.?s\.?\b|univerz|banka|urad|fond|akademie|\*/i.test(n)) return false;
    const w = n.split(/\s+/);
    return w.length >= 2 && w.length <= 4 && w.every(x => /^[A-ZÁ-Ž][a-zá-ž.\-]+$/.test(x) || /^[A-ZÁ-Ž]+$/.test(x));
  }

  /* rec: { name, msg, amount (v haléřích, se znaménkem), type, card (true u platby kartou) }.
     userRules: { [klíč obchodníka]: { c: 'kategorie', u: čas } } a navíc volitelně přesné shody.
     Vrací { cat, how }, how = 'user' | 'rule' | 'person' | 'fallback'. */
  function categorize(rec, userRules) {
    const income = rec.amount > 0;
    const key = merchantKey(rec.name);
    // uživatelské pravidlo: výdaje pod klíčem obchodníka, příjmy pod klíčem s plusem na konci
    const ur = key && userRules && userRules[income ? key + '+' : key];
    if (ur && ur.c && IN_CATS.has(ur.c) === income) return { cat: ur.c, how: 'user', key };
    const text = fold([rec.name, rec.msg].filter(Boolean).join(' '));
    const type = fold(rec.type);
    if (income) {
      if (/vraceni nakupu|refund|vratk|storno/.test(text + ' ' + type) || (rec.card && !/stipend/.test(text))) return { cat: 'vratky', how: 'rule', key };
      for (const [cat, re] of RULES) if (IN_CATS.has(cat) && re.test(text)) return { cat, how: 'rule', key };
      if (!rec.card && looksLikePerson(rec.name)) return { cat: 'lide_in', how: 'person', key };
      return { cat: 'prijem', how: 'fallback', key };
    }
    if (/vyber hotovosti/.test(type)) return { cat: 'hotovost', how: 'rule', key };
    for (const [cat, re] of RULES) if (!IN_CATS.has(cat) && re.test(text)) return { cat, how: 'rule', key };
    if (!rec.card && looksLikePerson(rec.name)) return { cat: 'lide', how: 'person', key };
    return { cat: 'ostatni', how: 'fallback', key };
  }

  root.BudgetRules = { fold, merchantKey, tidyName, categorize, looksLikePerson, RULES, IN_CATS };
}(typeof window !== 'undefined' ? window : globalThis));
