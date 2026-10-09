# Budgetovka

Osobní rozpočet na jedné stránce: měsíční příjmy, výdaje a spoření rozdělené do kategorií.
Bez serveru, bez buildu. Data zůstávají ve tvém prohlížeči, volitelně i na tvém Google Disku.

**Appka:** https://kudla2002.github.io/PersonalFinance/

## Co umí

- Přehled měsíce: kolik zbývá z příjmů, příjmy, výdaje, spoření a míra spoření.
- Pruh příjmů: celý příjem rozdělený na kategorie výdajů, spoření a zbytek. Přesahují-li výdaje příjmy, pruh to ukáže značkou.
- Kategorie jako filtr: klik na kategorii nebo zdroj příjmu zúží seznam pohybů.
- Vývoj za 6 měsíců a průměrný příjem a výdaje. Klik na měsíc ho otevře.
- Přidání, úprava a smazání s tlačítkem Vrátit.
- Přihlášení přes Google a synchronizace mezi zařízeními přes soubor na Google Disku.
- Záloha do JSON, obnova ze zálohy, export do CSV (středník, UTF-8 s BOM, otevře se rovnou v Excelu).
- Světlý a tmavý vzhled podle systému, funguje na mobilu a offline (PWA, lze přidat na plochu).
- Klávesy: `N` nová položka, `←` `→` přepnutí měsíce.

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
  "app": "budgetovka", "v": 2,
  "tx": [{ "id": "…", "date": "2026-10-10", "cat": "jidlo", "amount": 125050, "note": "Albert", "at": 1760000000000, "u": 1760000000000 }],
  "tomb": { "id-smazane-polozky": 1760000100000 }
}
```

`amount` je v haléřích (125050 = 1 250,50 Kč), `u` je čas poslední změny, `tomb` jsou smazané položky.
Kategorie a jejich druh (příjem, výdaj, spoření) jsou v poli `CATS` na začátku `app.js`.
Při přidání kategorie zvyš `SCHEMA`, ať starší verze appky nepřepíše soubor, kterému nerozumí.

## Úpravy

Žádný build. Otevři `index.html` nebo spusť `python3 -m http.server` ve složce a jdi na `localhost:8000`.

| Soubor | Co v něm je |
|---|---|
| `index.html` | struktura stránky a okna |
| `styles.css` | vzhled, barvy jako proměnné na začátku, světlé i tmavé |
| `app.js` | data, výpočty, vykreslení, přihlášení a synchronizace |
| `privacy.html` | zásady ochrany soukromí (odkaz z okna Data a z Google Cloud) |
| `sw.js` | offline režim; při změně seznamu souborů zvyš `CACHE` |

Nasazení je přes GitHub Pages z větve `main`, změna je hotová po pushi.

## Co by šlo přidat

- Opakující se položky (nájem, splátka, předplatné).
- Import výpisu z banky (CSV) s automatickým zařazením do kategorií.
- Měsíční limity na kategorie.
- Vlastní kategorie.
