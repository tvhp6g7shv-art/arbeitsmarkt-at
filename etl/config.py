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

# Geodaten der politischen Bezirke (für die Choropleth-Karte).
# Statistik Austria WFS, direkt in WGS84 — CC BY 4.0.
# Attribut g_id = dreistellige Bezirkskennziffer, g_name = Bezirksname.
GEO_URL = (
    "https://www.statistik.at/gs-open/GEODATA/ows"
    "?service=WFS&version=1.1.0&request=GetFeature"
    "&typeName=GEODATA:STATISTIK_AUSTRIA_POLBEZ_20250101"
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
# Ausbildungsstufen: Sortierung von niedrig nach hoch.
# Codes, die hier nicht vorkommen, landen automatisch am Ende und werden
# im Schema-Report gemeldet — dann diese Liste ergänzen.
# ---------------------------------------------------------------------------

AUSBILDUNG_REIHENFOLGE = [
    "PS",   # Pflichtschule
    "LE",   # Lehre
    "MB",   # Mittlere Ausbildung / BMS
    "HA",   # Höhere Ausbildung / AHS/BHS
    "AK",   # Akademie
    "FB",   # Fachhochschule Bakkalaureat
    "FH",   # Fachhochschule
    "UB",   # Universität Bakkalaureat
    "UN",   # Universität
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
