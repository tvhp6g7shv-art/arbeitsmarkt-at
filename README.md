# arbeitsmarkt-monitor.at

Arbeitslosenzahlen nach Ausbildungsstand, Generation, Bundesland und Bezirk —
täglich automatisch aktualisiert aus offenen Daten.

**Live: [arbeitsmarkt-monitor.at](https://arbeitsmarkt-monitor.at)**

Dieses Repository enthält die Datenpipeline und die Diagramme. Die erzeugten
JSON-Dateien liegen in `docs/data/` und werden über GitHub Pages ausgeliefert.

## Datenquellen

| Quelle | Lizenz |
|---|---|
| [AMS Österreich — Arbeitsmarktdaten (Open Data)](https://www.data.gv.at/datasets?publisher=AMS+%C3%96sterreich) | CC BY 4.0 |
| [Eurostat — lfst_r_lfu3rt](https://ec.europa.eu/eurostat/databrowser/view/lfst_r_lfu3rt) | Eurostat-Nutzungsbedingungen |
| [STATISTIK AUSTRIA — Bezirksgrenzen](https://data.statistik.gv.at/web/catalog.jsp) | CC BY 4.0 |

AMS-Zahlen sind beim AMS registrierte Arbeitslose (nationale Definition,
monatlich, ohne Schulungsteilnehmer:innen). Die Quoten stammen aus der EU-weiten
Arbeitskräfteerhebung (ILO-Definition, jährlich) und sind mit den
AMS-Absolutzahlen nicht direkt verrechenbar.

Methodik und Aufbereitung im Detail:
[arbeitsmarkt-monitor.at/methodik](https://arbeitsmarkt-monitor.at/methodik/)

## Lizenz

Grafiken und aufbereitete Daten: CC BY 4.0, Namensnennung
`arbeitsmarkt-monitor.at`. Für die Rohdaten gelten die Lizenzen der jeweiligen
Quelle (siehe Tabelle).
