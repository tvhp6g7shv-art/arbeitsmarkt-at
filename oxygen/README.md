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
| `etl/build.py` | Die Datenpipeline. Lädt, prüft, aggregiert, schreibt. |
| `etl/config.py` | Alle Einstellungen an einem Ort — Quell-URLs, Sortierungen, Zuordnungen. |
| `.github/workflows/` | Der Zeitplan, nach dem GitHub das Skript startet. |
| `docs/index.html` | Vorschauseite und Referenz für alle Diagramme. Welche vier Ausbildungsstufen im Verlaufsdiagramm erscheinen, steht dort in `VERLAUF_STUFEN`. |
| `docs/data/` | Die erzeugten JSON-Dateien. Wird automatisch befüllt. |
| `oxygen/` | Anleitung für den Einbau in Oxygen 6. |

## Die erzeugten Daten

| Datei | Inhalt |
|---|---|
| `kpi.json` | Kernzahlen: Bestand, Vorjahresvergleich, Geschlechterverteilung |
| `zeitreihe.json` | Monatsverlauf Österreich seit Januar 2019 |
| `ausbildung.json` | Nach höchster abgeschlossener Ausbildung, gesamt und je Bundesland |
| `generationen.json` | Nach Generationen (Gen Z, Millennials, Gen X, Boomer) plus Altersgruppen |
| `bezirke.json` | Je AMS-Bezirk: Bestand und Vorjahresveränderung (Tabelle) |
| `bundeslaender_geo.json` | Bundeslandgrenzen als GeoJSON für die Karte |
| `bundeslaender.json` | Je Bundesland: Bestand, Veränderung, Quote, 36-Monats-Verlauf |
| `quoten.json` | Arbeitslosenquoten nach Bildungsstand (EU-Definition) |
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
- **Die Karte zeigt Bundesländer, nicht Bezirke.** AMS-Geschäftsstellenbezirke
  (RGSCode) und politische Bezirke (Bezirkskennziffer) sind zwei verschiedene
  Nummernsysteme: RGSCode 102 ist Mattersburg, Bezirkskennziffer 102 ist Rust.
  Ein Join über die Nummer sieht wie ein Treffer aus, ordnet die Zahlen aber
  dem falschen Bezirk zu. Wien hat beim AMS rund 15 Geschäftsstellen statt
  einer Fläche. Eine Bezirkskarte braucht daher eine handgeprüfte
  Zuordnungstabelle — bis dahin: Karte auf Bundeslandebene, Bezirkswerte in
  der Tabelle.
- **Das Diagramm fasst die 18 AMS-Ausbildungsstufen zu 7 Gruppen zusammen.**
  Alle 18 Einzelstufen stehen in der Tabellenansicht.
- **Generationen sind eine Näherung.** Generationen sind Geburtsjahrgänge, das
  AMS liefert Altersgruppen in 5-Jahres-Schritten. Jede Altersgruppe wird der
  Generation mit der größten Überschneidung zugeordnet, für jeden Monat neu
  berechnet. An den Rändern (Gruppe 45–49 trennt Millennials von Gen X) ist die
  Zuordnung unscharf. Die exakten Altersgruppen stehen in der Tabelle.
- **Die Quoten sind jährlich**, die AMS-Zahlen monatlich. Das ist keine
  Ungenauigkeit, sondern der Unterschied der beiden Erhebungen.

## Wenn ein Lauf fehlschlägt

GitHub schickt eine E-Mail. Das Dashboard zeigt weiter die letzten guten Daten —
es geht nichts verloren. Im Protokoll unter **Actions → letzter Lauf → Daten
bauen** steht, woran es lag. Das Skript ist so gebaut, dass es bei unerwarteten
Spalten lieber abbricht als falsche Zahlen zu erzeugen.
