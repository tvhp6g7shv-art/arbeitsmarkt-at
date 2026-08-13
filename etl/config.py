"""
Zentrale Konfiguration der Datenpipeline.

Hier stehen alle Einstellungen an einem Ort. Wenn sich eine Quell-URL
ändert, muss nur diese Datei angepasst werden.
"""

# ---------------------------------------------------------------------------
# Quellen
# ---------------------------------------------------------------------------

# AMS Open Data — CC BY 4.0, monatlich aktualisiert, Zeitreihe ab 01/2019
AMS_BASIS_URL = "https://www.arbeitsmarktdatenbank.at/opendata"

AMS_DATEIEN = {
    # Arbeitslose nach höchster abgeschlossener Ausbildung.
    # Spalten: Datum;RGSCode;RGSName;Geschlecht;AusbCode;HoeAbgAusbildung;
    #          BESTAND;ZUGANG;ABGANG
    "ausbildung": "AL_Ausbildung_RGS.csv",

    # Langzeitbeschäftigungslosigkeit — brauchen wir NUR wegen der Spalte
    # "Bundesland": daraus bauen wir das Mapping RGSCode -> Bundesland.
    # Spalten: Datum;RGSCode;RGSName;Bundesland;Status;Geschlecht;BESTAND
    "bundesland_mapping": "LZBL_Gesamtuebersicht_RGS_Bundesland.csv",

    # Arbeitslose nach Altersgruppen (5-Jahres-Schritte) und Vormerkdauer.
    # Grundlage für die Generationen-Auswertung.
    # Laut data.gv.at-Beschreibung: Datum, RGSCode, RGSName, Geschlecht,
    # Vormerkdauer, Altersgruppe, Bestand, DS_VMD.
    # Die exakte Schreibweise der Altersgruppen ist von außen nicht
    # dokumentiert — das Skript erkennt sie selbst (siehe alter_grenzen()).
    "alter": "Bestand_AL_Geschlecht_Altersgruppen_VMD_RGS.csv",
}

# Eurostat — Arbeitslosenquote nach Bildungsstand und NUTS-2-Region.
# Kein API-Key nötig. Format: JSON-stat 2.0.
EUROSTAT_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    "lfst_r_lfu3rt"
)
EUROSTAT_PARAMS = {
    "format": "JSON",
    "lang": "DE",
    "geoLevel": "nuts2",
    "sex": "T",          # T = alle Geschlechter
    "age": "Y15-74",
    "unit": "PC",        # Prozent
    "sinceTimePeriod": "2019",
}

# Geodaten für die Karte: BUNDESLÄNDER (NUTS-2), nicht Bezirke.
#
# Warum nicht Bezirke: Die AMS-Geschäftsstellenbezirke (RGSCode) und die
# politischen Bezirke (Bezirkskennziffer) sind ZWEI VERSCHIEDENE
# Nummernsysteme. Beispiel: RGSCode 102 = Mattersburg, Bezirkskennziffer
# 102 = Rust(Stadt). Ein Join über die Nummer sieht aus wie ein Treffer,
# ordnet die Zahlen aber dem falschen Bezirk zu. Wien hat beim AMS
# ~15 Geschäftsstellen (958–977) statt einer Fläche.
# Eine Bezirkskarte braucht daher eine handgeprüfte Zuordnungstabelle
# RGSCode -> politische Bezirke. Bis die existiert: Karte auf
# Bundeslandebene (dort ist die Zuordnung eindeutig), Bezirksdetails
# stehen in der Tabelle.
GEO_URL = (
    "https://www.statistik.at/gs-open/GEODATA/ows"
    "?service=WFS&version=1.1.0&request=GetFeature"
    "&typeName=GEODATA:STATISTIK_AUSTRIA_NUTS2_20250101"
    "&outputFormat=application/json&srsName=EPSG:4326"
)

# ---------------------------------------------------------------------------
# NUTS-2-Codes -> Bundesland (in Österreich 1:1)
# ---------------------------------------------------------------------------

NUTS2_BUNDESLAND = {
    "AT11": "Burgenland",
    "AT12": "Niederösterreich",
    "AT13": "Wien",
    "AT21": "Kärnten",
    "AT22": "Steiermark",
    "AT31": "Oberösterreich",
    "AT32": "Salzburg",
    "AT33": "Tirol",
    "AT34": "Vorarlberg",
}

BUNDESLAND_NUTS2 = {v: k for k, v in NUTS2_BUNDESLAND.items()}

# Reihenfolge für Anzeige (nach Einwohnerzahl absteigend)
BUNDESLAND_REIHENFOLGE = [
    "Wien", "Niederösterreich", "Oberösterreich", "Steiermark", "Tirol",
    "Kärnten", "Salzburg", "Vorarlberg", "Burgenland",
]

# ---------------------------------------------------------------------------
# Ausbildungsstufen
#
# Das AMS unterscheidet 18 Stufen (Stand 08/2026, aus den Daten verifiziert).
# Für die Tabelle bleiben alle 18 erhalten; fürs Diagramm werden sie zu
# 7 Gruppen zusammengefasst — mehr als etwa sieben Kategorien kann ein
# Balkendiagramm nicht mehr sinnvoll unterscheidbar zeigen.
#
# Codes, die hier fehlen, landen automatisch am Ende und werden im
# Schema-Report gemeldet.
# ---------------------------------------------------------------------------

AUSBILDUNG_REIHENFOLGE = [
    "PO",   # Keine abgeschl. Pflichtschule
    "PS",   # Pflichtschule
    "LT",   # Teilintegrierte Lehre
    "LE",   # Lehre
    "LM",   # Lehre u. Meisterprüfung
    "MS",   # Sonstige mittlere Schule
    "MK",   # Mittlere kaufm. Schule
    "MT",   # Mittlere techn.-gewerbl. Schule
    "HA",   # Allg. höhere Schule
    "HK",   # Höhere kaufm. Schule
    "HT",   # Höhere techn.-gewerbl. Schule
    "HS",   # Höhere sonstige Schule
    "AK",   # Akademie
    "FB",   # Fachhochschule Bakkalaureat
    "UB",   # Bakkalaureatstudium
    "FH",   # Fachhochschule
    "UV",   # Universität
    "XX",   # Ungeklärt
]

# Zusammenfassung fürs Diagramm. Reihenfolge = Anzeigereihenfolge.
AUSBILDUNG_GRUPPEN = [
    ("pflicht",  "Pflichtschule oder weniger", ["PO", "PS"]),
    ("lehre",    "Lehre",                      ["LT", "LE", "LM"]),
    ("mittel",   "Mittlere Schule",            ["MS", "MK", "MT"]),
    ("matura",   "Höhere Schule (Matura)",     ["HA", "HK", "HT", "HS"]),
    ("akademie", "Akademie oder Bachelor",     ["AK", "FB", "UB"]),
    ("hoch",     "Fachhochschule, Universität", ["FH", "UV"]),
    ("unklar",   "Ungeklärt",                  ["XX"]),
]

# ---------------------------------------------------------------------------
# Generationen
#
# Geburtsjahrgänge nach der gängigen Abgrenzung des Pew Research Center.
# Wichtig: Das AMS liefert ALTERSGRUPPEN, keine Geburtsjahrgänge. Die
# Zuordnung ist deshalb eine Näherung — das Skript rechnet für jeden Monat
# aus, welche Geburtsjahre eine Altersgruppe abdeckt, und ordnet sie der
# Generation mit der größten Überschneidung zu. An zwei Rändern
# (Altersgruppe 45–49 und die offene oberste Gruppe) liegen Generationen-
# grenzen mitten in einer Gruppe; dort ist die Zuordnung unscharf.
#
# Reihenfolge = Anzeigereihenfolge (jung nach alt).
# ---------------------------------------------------------------------------

# Obergrenze für offene Altersgruppen ("60 und mehr"). Ohne diese Grenze
# spannt die oberste Gruppe rechnerisch bis Geburtsjahr 1900 und würde
# fälschlich der ältesten Generation zugeschlagen. 74 ist die realistische
# Obergrenze für beim AMS vorgemerkte Personen.
ALTER_OBERGRENZE = 74

GENERATIONEN = [
    ("alpha",  "Generation Alpha",     2013, 2100),
    ("z",      "Generation Z",         1997, 2012),
    ("y",      "Millennials (Gen Y)",  1981, 1996),
    ("x",      "Generation X",         1965, 1980),
    ("boomer", "Babyboomer",           1946, 1964),
    ("still",  "Vor 1946 geboren",     1900, 1945),
]

# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------

# Zielordner für die JSON-Dateien. Muss unter docs/ liegen, damit
# GitHub Pages sie ausliefert.
AUSGABE_ORDNER = "docs/data"

# Wie viele Monate in die Sparklines der Bundesland-Tabelle
SPARKLINE_MONATE = 36

# Netzwerk
TIMEOUT_SEKUNDEN = 300
