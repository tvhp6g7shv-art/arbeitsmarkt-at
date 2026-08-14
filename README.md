# Arbeitsmarkt-Dashboard Österreich

Arbeitslosenzahlen nach Ausbildungsstand, Generation, Bundesland und Bezirk —
monatlich automatisch aktualisiert aus offenen Daten.

**Einrichtung:** → [SETUP.md](SETUP.md)
**Einbau in Oxygen 6:** → [oxygen/ANLEITUNG.md](oxygen/ANLEITUNG.md)

---

## Wie es funktioniert

```
GitHub Actions (6. jedes Monats)
   │
   ├─ lädt AMS-CSVs, Eurostat-Quoten, Bezirksgrenzen
   ├─ prüft, ob die Spalten noch stimmen
   ├─ aggregiert zu kleinen JSON-Dateien
   └─ legt sie in docs/data/ ab
                │
                ▼
        GitHub Pages liefert sie aus
                │
                ▼
   WordPress + Oxygen 6 lädt sie und zeichnet die Diagramme
```

Kein Server, keine Datenbank, keine laufenden Kosten.

## Was hier drin liegt

| Pfad | Zweck |
|---|---|
| `etl/build.py` | Der Ablauf der Datenpipeline — ruft nur noch die Strang-Module auf. |
| `etl/gemeinsam.py` | Geteiltes Fundament: Logging, Download, Prüfhelfer, Schreiben. |
| `etl/<strang>.py` | Ein Modul je Themenstrang: `uebersicht`, `regionen`, `ausbildung`, `generationen`, `eurostat`, `fluss`, `dauer`, `schulung`, `stellen`, `branche`, `karte`. |
| `etl/config.py` | Alle Einstellungen an einem Ort — Quell-URLs, Sortierungen, Zuordnungen. |
| `.github/workflows/` | Der Zeitplan, nach dem GitHub das Skript startet. |
| `docs/js/kern.js` | Gemeinsame Helfer, Laden der Daten, Seitenaufbau. Wird immer als erstes Skript geladen. |
| `docs/js/charts/` | Ein Modul je Diagramm (`zeitreihe.js`, `karte.js`, …) — hier wird pro Themenstrang iteriert. Welche Ausbildungsgruppen im Verlaufsdiagramm erscheinen, steht in `verlauf.js` (`VERLAUF_GRUPPEN`). |
| `docs/js/einbetten.js` | Einbetten-Dialog und iframe-Schnipsel. |
| `docs/embed.html` | Einbettseite: `embed.html?chart=<name>` zeigt genau eine Grafik mit Quellenzeile. |
| `docs/index.html` | Vorschauseite und Referenz für alle Diagramme. |
| `docs/data/` | Die erzeugten JSON-Dateien. Wird automatisch befüllt. |
| `oxygen/` | Anleitung für den Einbau in Oxygen 6. |

## Die erzeugten Daten

| Datei | Inhalt |
|---|---|
| `kpi.json` | Kernzahlen: Bestand, Vorjahresvergleich, Geschlechterverteilung |
| `zeitreihe.json` | Monatsverlauf Österreich seit Januar 2019 |
| `ausbildung.json` | Nach höchster abgeschlossener Ausbildung, gesamt und je Bundesland |
| `generationen.json` | Nach Generationen (Gen Z, Millennials, Gen X, Boomer) plus Altersgruppen |
| `eu.json` | Länderrangliste der 27 Mitgliedstaaten; enthält weiterhin die Zeitreihen AT/EU-27/DE und die HVPI-Inflation (seit v20 bzw. v19 von keiner Grafik genutzt) |
| `eukarte.json` | Quote je EU-Mitgliedstaat, aktuelles Jahr und Vorjahr, Differenz in Prozentpunkten |
| `eukarte_geo.json` | EU-Ländergrenzen als GeoJSON (GISCO NUTS-0, auf Europa zugeschnitten) |
| `bezirke.json` | Je AMS-Bezirk: Bestand und Vorjahresveränderung (Tabelle) |
| `karte.json` | Werte je Kartenregion (80 Regionen aus ganzen Bezirken) |
| `karte_geo.json` | Verschmolzene Bezirksgrenzen als GeoJSON |
| `bundeslaender.json` | Je Bundesland: Bestand, Veränderung, Quote, 36-Monats-Verlauf |
| `quoten.json` | Arbeitslosenquoten nach Bildungsstand (EU-Definition) |
| `fluss.json` | Zugänge und Abgänge je Monat |
| `dauer.json` | Vormerkdauer-Verteilung und Langzeitbeschäftigungslosigkeit |
| `schulung.json` | Personen in Schulung |
| `stellen.json` | Offene Stellen und Stellenandrangziffer je Bundesland |
| `branche.json` | Arbeitslose nach Wirtschaftszweig |
| `eu.json` | Rangliste aller 27 EU-Länder (Quote im aktuellsten Jahr) |
| `meta.json` | Stand, Quellen, Lizenzen und Warnhinweise des letzten Laufs |

## Zwei Messgrößen, die man nicht vermischen darf

**AMS-Zahlen** sind beim AMS *registrierte* Arbeitslose — nationale Definition,
monatlich, sehr granular, aber als absolute Zahl ohne Quote. Der Nenner
(unselbständig Beschäftigte) steckt nicht in den offenen Daten.

**Die Quoten** stammen aus der EU-Arbeitskräfteerhebung — ILO-Definition,
jährlich, nur Bundeslandebene, dafür international vergleichbar. Sie liegen
systematisch niedriger als die AMS-Zahlen nahelegen.

Beide gehören ins Dashboard, aber sichtbar getrennt und beschriftet.

## Datenquellen und Lizenzen

| Quelle | Was | Lizenz |
|---|---|---|
| [AMS Österreich](https://www.data.gv.at/datasets?publisher=AMS+%C3%96sterreich) | Arbeitslose nach Ausbildung, Bezirk, Geschlecht | CC BY 4.0 |
| [Eurostat](https://ec.europa.eu/eurostat/databrowser/view/lfst_r_lfu3rt) | Arbeitslosenquoten nach Bildungsstand, NUTS-2 | Eurostat-Nutzungsbedingungen |
| [STATISTIK AUSTRIA](https://data.statistik.gv.at/web/meta.jsp?dataset=OGDEXT_POLBEZ_1) | Bezirksgrenzen | CC BY 4.0 |

**CC BY 4.0 verlangt Namensnennung.** Die Quellenangabe muss auf jeder Seite
sichtbar sein, die diese Daten zeigt.

## Bekannte Einschränkungen

- **Stadt/Land fehlt noch.** Die Gemeindedatei des AMS enthält nur Geschlecht,
  keinen Ausbildungsstand. Die Verknüpfung mit der Urban-Rural-Typologie der
  Statistik Austria ist als nächster Schritt geplant.
- **Die Karte zeigt 80 Regionen, nicht 94 Bezirke.** AMS-Geschäftsstellenbezirke
  (99 Stück) und politische Bezirke (94) decken sich nicht: RGSCode 102 ist
  Mattersburg, Bezirkskennziffer 102 ist Rust. Manche AMS-Region umfasst
  mehrere Bezirke, manchmal liegen zwei AMS-Regionen in einem Bezirk, und Wien
  ist beim AMS in 15 Geschäftsstellen geteilt. Die Tabelle `KARTENREGIONEN` in
  `etl/config.py` fasst beide Seiten zu 80 Flächen zusammen, die aus GANZEN
  Bezirken bestehen. Jeder Bezirk und jede AMS-Region kommt darin genau einmal
  vor; das Skript prüft das bei jedem Lauf und meldet jede Lücke.
  Die ungefilterten 99 AMS-Bezirke stehen in der Tabelle „AMS-Bezirke".
- **Das Diagramm fasst die 18 AMS-Ausbildungsstufen zu 7 Gruppen zusammen.**
  Alle 18 Einzelstufen stehen in der Tabellenansicht.
- **Generationen sind eine Näherung.** Generationen sind Geburtsjahrgänge, das
  AMS liefert Altersgruppen in 5-Jahres-Schritten. Jede Altersgruppe wird der
  Generation mit der größten Überschneidung zugeordnet, für jeden Monat neu
  berechnet. An den Rändern (Gruppe 45–49 trennt Millennials von Gen X) ist die
  Zuordnung unscharf. Die exakten Altersgruppen stehen in der Tabelle.
- **Die Quoten sind jährlich**, die AMS-Zahlen monatlich. Das ist keine
  Ungenauigkeit, sondern der Unterschied der beiden Erhebungen.

## Einbettung für Redaktionen

Jede Grafik ist einzeln einbettbar:

```
https://DEIN-NAME.github.io/arbeitsmarkt-at/embed.html?chart=fluss
```

Verfügbare Namen: `zeitreihe`, `ausbildung`, `verlauf`, `generationen`,
`karte`, `fluss`, `dauer`, `schulung`, `stellen`, `branche`, `eukarte`, `eurang`.

Den fertigen iframe-Code liefert der Knopf **„Einbetten"** bei jeder Grafik im
Dashboard. Die Quellenangabe ist Teil der Grafik — wer sie einbettet,
transportiert die Namensnennung automatisch mit und erfüllt damit die
CC-BY-Bedingung.

Die Einbettseite meldet ihre Höhe per `postMessage`; der mitgelieferte
Schnipsel passt das iframe automatisch an. Ohne dieses Skript greift die
angegebene Festhöhe — die Grafik bricht also nicht.

**Vor dem Launch anpassen:** `EINBETTUNG` in `etl/config.py` — dort stehen
Name und Ziel-URL für die Zeile „Grafik: …".

## Wenn ein Lauf fehlschlägt

GitHub schickt eine E-Mail. Das Dashboard zeigt weiter die letzten guten Daten —
es geht nichts verloren. Im Protokoll unter **Actions → letzter Lauf → Daten
bauen** steht, woran es lag. Das Skript ist so gebaut, dass es bei unerwarteten
Spalten lieber abbricht als falsche Zahlen zu erzeugen.
