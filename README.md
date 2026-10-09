# Budgetovka

Osobní rozpočet na jedné stránce: měsíční příjmy, výdaje a spoření rozdělené do kategorií.
Bez serveru, bez účtu, bez buildu. Data zůstávají jen ve tvém prohlížeči.

**Appka:** https://kudla2002.github.io/PersonalFinance/

## Co umí

- Přehled měsíce: kolik zbývá z příjmů, příjmy, výdaje, spoření a míra spoření.
- Pruh příjmů: celý příjem rozdělený na kategorie výdajů, spoření a zbytek. Přesahují-li výdaje příjmy, pruh to ukáže značkou.
- Kategorie jako filtr: klik na kategorii nebo zdroj příjmu zúží seznam pohybů.
- Vývoj za 6 měsíců a průměrný příjem a výdaje. Klik na měsíc ho otevře.
- Přidání, úprava a smazání s tlačítkem Vrátit.
- Záloha do JSON, obnova ze zálohy, export do CSV (středník, UTF-8 s BOM, otevře se rovnou v Excelu).
- Světlý a tmavý vzhled podle systému, funguje na mobilu a offline (PWA, lze přidat na plochu).
- Klávesy: `N` nová položka, `←` `→` přepnutí měsíce.

## Data a soukromí

Všechno se ukládá do `localStorage` v prohlížeči, kde appku otevřeš. Nic se nikam neodesílá.
To znamená, že data nejsou sdílená mezi telefonem a počítačem a zmizí, když prohlížeč smažeš
data webů. Proto je v okně **Data** záloha: stáhni ji občas a před výměnou zařízení.

Formát položky (pole `tx` v záloze):

```json
{ "id": "…", "date": "2026-10-10", "cat": "jidlo", "amount": 125050, "note": "Albert", "at": 1760000000000 }
```

`amount` je v haléřích (125050 = 1 250,50 Kč). Kategorie a jejich druh (příjem, výdaj, spoření)
jsou v poli `CATS` na začátku `app.js`.

## Úpravy

Žádný build. Otevři `index.html` nebo spusť `python3 -m http.server` ve složce a jdi na `localhost:8000`.

| Soubor | Co v něm je |
|---|---|
| `index.html` | struktura stránky a okna |
| `styles.css` | vzhled, barvy jako proměnné na začátku, světlé i tmavé |
| `app.js` | data, výpočty, vykreslení |
| `sw.js` | offline režim; při změně seznamu souborů zvyš `CACHE` |

Nasazení je přes GitHub Pages z větve `main`, změna je hotová po pushi.

## Co by šlo přidat

- Opakující se položky (nájem, splátka, předplatné).
- Import výpisu z banky (CSV) s automatickým zařazením do kategorií.
- Měsíční limity na kategorie.
- Vlastní kategorie.
