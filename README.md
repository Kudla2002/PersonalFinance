# Budgetovka

Osobní rozpočet na jedné stránce: měsíční příjmy, výdaje a spoření rozdělené do kategorií.
Bez serveru, bez buildu. Data zůstávají ve tvém prohlížeči, volitelně i na tvém Google Disku.

**Appka:** https://kudla2002.github.io/PersonalFinance/

## Co umí

Pět záložek (dole na mobilu, nahoře na počítači):

- **Přehled**: kolik zbývá z příjmů, tempo útraty v měsíci proti průměru z minulých měsíců a odhad konce měsíce
  (pevné platby jako nájem se do tempa nepočítají), příjmy, výdaje, spoření, míra spoření, koláč podle skupin,
  kategorie s limity a změnou proti průměru, nejčastější obchodníci a postřehy (kolik jde na hospody a kavárny,
  největší nárůst, největší platba, nejdražší den v týdnu, pravidelné platby, cíl spoření).
- **Pohyby**: seznam po dnech, filtr příjem/výdaj/kategorie, hledání, celé období; podzáložka **Obchodníci**
  (kolik, kolikrát, průměr; klik otevře detail s grafem a přeřazením všech plateb najednou).
- **Kalendář**: teplotní mapa útrat po dnech měsíce, detail dne.
- **Trendy**: 6 / 12 měsíců / vše, sloupce příjmy × výdaje, míra spoření, skupiny výdajů, tabulka kategorií po měsících.
- **Plán**: měsíční limity na kategorie (návrh z průměru jedním klikem), cíl míry spoření, automaticky nalezené
  pravidelné platby (měsíčně i ročně, i ukončené) s měsíčním součtem.

**Zbytečné výdaje** (Přehled a Plán): z posledních tří uzavřených měsíců appka najde časté drobné útraty u jednoho
řetězce (kafe, fast food, hospoda), drahý rozvoz a krátké jízdy taxíkem, tabák, dvakrát placená předplatná,
poplatky bance a jídlo venku dražší než nákupy. U každého ukáže částku za měsíc a za rok a konkrétní tip.
Co je v pořádku, jde skrýt (synchronizuje se). Ukázková data jsou označená pruhem a zmizí, jakmile nahraješ svoje.

31 kategorií ve 8 skupinách (hospoda, kavárny, rozvoz jídla, fitko, doprava, taxi, tabák…), ne jedna „zábava“.

**Import výpisu** (ikona Data → Importovat výpis): CSV z banky (UTF-8 i Windows-1250, `;` `,` tabulátor).
Sloupce se poznají podle názvů v hlavičce, jinak je přiřadíš ručně. Platby se zařadí podle obchodníka,
duplicity (stejný den, částka, obchodník) se přeskočí, platby v cizí měně se vynechají. Čísla účtů, VS, KS
a SS se do poznámek nepřebírají. Před importem je náhled. Import se dá vrátit tlačítkem Vrátit.
Formáty bank jsou ověřené jen na ukázkových souborech (Fio, Air Bank, Revolut), ne na reálných exportech.

**Pravidla**: když změníš kategorii a necháš zapnuté „Pamatovat“, appka si obchodníka zapamatuje, přeřadí
už existující platby a příště ho zařadí sama. Pravidla se synchronizují s Diskem a jdou zrušit (Data → Pravidla).

Dál: přidání, úprava a smazání s tlačítkem Vrátit, přihlášení přes Google a synchronizace mezi zařízeními,
záloha do JSON (slučuje se, nepřepisuje), export do CSV (středník, BOM, otevře se v Excelu), světlý a tmavý vzhled,
mobil i offline (PWA).

Klávesy: `N` nový pohyb, `/` hledání, `1`–`5` záložky, `←` `→` měsíc.

## Data a soukromí

**Bez přihlášení** je všechno v `localStorage` prohlížeče, kde appku otevřeš. Nic se nikam neodesílá.
Data nejsou sdílená mezi telefonem a počítačem a zmizí, když prohlížeč smažeš data webů.

**Po přihlášení přes Google** se data navíc zrcadlí do souboru `Budgetovka – data.json` v kořeni tvého
Google Disku. Appka žádá jen o oprávnění `drive.file` (vidí jen soubory, které sama vytvořila, ne zbytek
Disku) a o e-mail účtu. Mezi appkou a Googlem nestojí žádný server, appka mluví přímo s API Googlu.

Co z toho plyne:

- Soubor na Disku je čitelný JSON bez šifrování. Kdo má přístup k tvému Google účtu, přečte ho.
- Přihlašovací token (platí hodinu) je v `localStorage` prohlížeče. Na cizím zařízení se odhlas, odhlášení data ze zařízení smaže.
- Ukázková data zůstávají jen v zařízení a na Disk se nenahrávají.
- „Smazat všechna data“ a import zálohy platí i pro Disk a ostatní zařízení.

### Jak se slučují změny

Každá položka má čas poslední změny. Při synchronizaci vyhrává novější verze, a to po položkách, takže
úpravy z telefonu a z počítače se spojí. Smazání se pamatuje 120 dní (náhrobek), aby smazaná položka
nevstala z mrtvých na druhém zařízení. Sloučení je opakovatelné, na pořadí zařízení nezáleží.
Synchronizuje se 1,5 s po každé změně, při návratu do appky, po obnovení připojení a každé dvě minuty.

Omezení, o kterých je dobré vědět:

- Když jsi stejné výdaje ručně zadal na dvou zařízeních ještě před prvním přihlášením, po prvním sloučení budou dvakrát. Smaž jednu kopii.
- Zařízení, které bylo offline déle než 120 dní, může vrátit položky smazané mezitím jinde.
- Hodiny zařízení se berou doslova. Telefon s hodinami o den napřed vyhraje každý spor o úpravu.
- Dvě zařízení, která uloží změnu ve stejné vteřině, se mohou na chvíli přepsat; při další synchronizaci se položky slučují znovu a nic se neztratí.

## Přihlášení přes Google: jak je nastavené

Je hotové a běží na vlastním projektu `budgetovka` v Google Cloud Console (účet kudlicka.vojtech2002@gmail.com):

- zapnuté **Google Drive API**,
- **Google Auth Platform**: externí aplikace Budgetovka, publikovaná (*In production*), oprávnění `drive.file`
  a `userinfo.email`. Obě jsou nenáročná, ověření od Googlu nechtějí. Bez publikace by přihlášení po sedmi dnech vypršelo,
- stránky pro souhlas: domovská stránka a [zásady soukromí](privacy.html) (Google je k publikaci vyžaduje), doména `kudla2002.github.io`,
- **OAuth klient** typu Web: origin `https://kudla2002.github.io`, redirect URI `https://kudla2002.github.io/PersonalFinance/`
  (s lomítkem na konci). Client ID je veřejný údaj a je v `GCFG.clientId` v `app.js`.

Při změně adresy appky (jiný název repa, vlastní doména) uprav origin a redirect URI v klientovi a přidej novou doménu
v **Branding → Authorized domains**, jinak přihlášení skončí chybou `redirect_uri_mismatch`.
Pro vývoj na vlastním počítači přidej do klienta ještě `http://localhost:8000/` mezi redirect URI.

Klient je záměrně oddělený od ostatních appek. Oprávnění `drive.file` se váže na Client ID, takže sdílený klient by
dvěma appkám otevřel soubory té druhé. Client secret se nepoužívá, appka ho nepotřebuje a nikde není.

## Formát dat

Soubor `Budgetovka – data.json` i pole `tx` v záloze:

```json
{
  "app": "budgetovka", "v": 4,
  "tx": [{ "id": "…", "date": "2026-10-10", "cat": "potraviny", "amount": 125050, "note": "Albert", "at": 1760000000000, "u": 1760000000000 }],
  "tomb": { "id-smazane-polozky": 1760000100000 },
  "meta": { "r:albert": { "v": "potraviny", "u": 1760000000000 }, "l:hospoda": { "v": 150000, "u": 1760000000000 }, "g:rate": { "v": 20, "u": 1760000000000 } }
}
```

`amount` je v haléřích (125050 = 1 250,50 Kč), `u` je čas poslední změny, `tomb` jsou smazané položky.
`meta` drží pravidla zařazení (`r:<obchodník>`, u příjmů s `+` na konci), měsíční limity (`l:<kategorie>`, haléře)
a cíl spoření (`g:rate`, %), skrytá upozornění (`x:<id>`); hodnota `null` znamená smazáno. Kategorie jsou v `cats.js`.
Při přidání kategorie nebo změně formátu zvyš `SCHEMA` v `app.js`, ať starší verze appky nepřepíše soubor, kterému nerozumí.

## Úpravy

Žádný build. Otevři `index.html` nebo spusť `python3 -m http.server` ve složce a jdi na `localhost:8000`.

| Soubor | Co v něm je |
|---|---|
| `index.html` | struktura stránky a okna |
| `styles.css` | vzhled, barvy jako proměnné na začátku, světlé i tmavé |
| `rules.js` | pravidla zařazení plateb do kategorií, klíč obchodníka |
| `cats.js` | kategorie, skupiny, barvy, ikony |
| `analytics.js` | součty, průměry, tempo měsíce, pravidelné platby, kalendář |
| `importer.js` | čtení CSV z banky, detekce sloupců, odstranění duplicit |
| `app.js` | data, mutace, export, přihlášení a synchronizace s Diskem |
| `kit.js` | ikony, grafy (SVG), společné prvky oken |
| `views.js` | záložky Přehled, Pohyby, Kalendář, Trendy, Plán |
| `dialogs.js` | okna: pohyb, data, import, obchodník, nezařazené, pravidla, limity |
| `privacy.html` | zásady ochrany soukromí (odkaz z okna Data a z Google Cloud) |
| `sw.js` | offline režim; při změně seznamu souborů zvyš `CACHE` |

Nasazení je přes GitHub Pages z větve `main`, změna je hotová po pushi.

## Co by šlo přidat

- Import PDF výpisu přímo v appce (teď jen CSV).
- Vlastní kategorie.
- Rozpočet po měsících (ne jen jeden limit na kategorii).
- Kurzy cizích měn (teď se platby v cizí měně při importu vynechají).

## Osobní data nepatří do repa

Repo je veřejné. Výpisy, zálohy (`budgetovka-data.json`) ani exporty sem nikdy necommituj. Appka je záměrně napsaná tak, že
žádná data v kódu nejsou (kromě vymyšlených ukázkových dat v `app.js`).
