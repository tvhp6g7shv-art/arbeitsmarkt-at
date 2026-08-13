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

    # Personen in Schulung. Schließt die Lücke zwischen "registrierte
    # Arbeitslose" und den in Medien genannten "vorgemerkten Personen".
    "schulung": "Bestand_SC_Alter_Berufswunsch_RGS.csv",

    # Offene Stellen nach Ausbildung — Grundlage der Stellenandrangziffer.
    # Spalten (verifiziert): Datum;RGSCode;RGSName;Bestand_Verfuegbarkeit;
    #                        AusbCode;HoeAbgAusbildung;BESTAND;ZUGANG;ABGANG
    "stellen": "OS_Ausbildung_RGS.csv",

    # Arbeitslose nach Wirtschaftszweig (ÖNACE).
    "branche": "AL_NACE_RGS.csv",
}

# Diese Quellen sind Zusatzinformation: Fällt eine aus, läuft der Rest weiter
# und der zugehörige Abschnitt bleibt im Dashboard ausgeblendet.
AMS_OPTIONAL = {"schulung", "stellen", "branche"}

# Eurostat — Arbeitslosenquote nach Bildungsstand und NUTS-2-Region.
# Kein API-Key nötig. Format: JSON-stat 2.0.
EUROSTAT_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    "lfst_r_lfu3rt"
)
# Zweite Eurostat-Abfrage: Österreich im Ländervergleich.
# Gleiche Definition, gleiche Quelle — nur ohne Regionalfilter.
#
# EUROSTAT_VERGLEICH sind die Linien im Zeitverlauf (wenige, sonst unlesbar).
# Zusätzlich wird eine Rangliste ALLER Länder für das aktuellste Jahr gebaut;
# dort ist Österreich hervorgehoben und der Rest Kontext.
EUROSTAT_VERGLEICH = ["AT", "EU27_2020", "DE"]
EUROSTAT_HERVORHEBUNG = "AT"
EUROSTAT_VERGLEICH_NAMEN = {
    "AT": "Österreich", "EU27_2020": "EU-27", "DE": "Deutschland",
}

# Aggregate wie der EU-27-Schnitt sind für Eurostat KEIN „country" — sie fallen
# aus der Abfrage mit geoLevel=country heraus. Sie müssen einzeln nachgeholt
# werden, sonst fehlt ausgerechnet die Vergleichslinie.
EUROSTAT_AGGREGATE = ["EU27_2020"]

# Die Länderabfrage liefert auch Nicht-EU-Meldeländer (Schweiz, Norwegen,
# Türkei, Westbalkan …). Für „Platz X von Y EU-Ländern" zählen nur die 27
# Mitgliedstaaten — sonst ist die Aussage schlicht falsch.
EU27_MITGLIEDER = [
    "BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "ES", "FR", "HR", "IT",
    "CY", "LV", "LT", "LU", "HU", "MT", "NL", "AT", "PL", "PT", "RO", "SI",
    "SK", "FI", "SE",
]

EUROSTAT_PARAMS = {
    "format": "JSON",
    "lang": "DE",
    "geoLevel": "nuts2",
    "sex": "T",          # T = alle Geschlechter
    "age": "Y15-74",
    "unit": "PC",        # Prozent
    "sinceTimePeriod": "2019",
}

# ---------------------------------------------------------------------------
# Inflation: harmonisierter Verbraucherpreisindex (HVPI), Jahresdurchschnitt.
# Gleiche Quelle, gleiche Frequenz wie die EU-Arbeitslosenquote — damit lassen
# sich beide Werte auf EINER Prozentachse gegeneinander auftragen.
# ---------------------------------------------------------------------------
EUROSTAT_INFLATION_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    "prc_hicp_aind"
)
EUROSTAT_INFLATION_PARAMS = {
    "format": "JSON",
    "lang": "DE",
    "coicop": "CP00",      # Gesamtindex, alle Waren und Dienstleistungen
    "unit": "RCH_A_AVG",   # Veränderung zum Vorjahr, Jahresdurchschnitt
    "sinceTimePeriod": "2019",
}
# Dieselben drei Gebiete wie im EU-Zeitvergleich, damit die Punkte zusammenpassen.
INFLATION_GEBIETE = ["AT", "DE", "EU27_2020"]

# Geodaten für die Karte: politische Bezirke.
# Der Layer enthält 117 Flächen: 94 politische Bezirke/Statutarstädte
# plus die 23 Wiener Gemeindebezirke (901–923), die wir nicht brauchen.
GEO_URL_ALT = (  # (Bundesländer, nur noch als Rückfallebene)
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
    "https://www.statistik.at/gs-open/GEODATA/ows"
    "?service=WFS&version=1.1.0&request=GetFeature"
    "&typeName=GEODATA:STATISTIK_AUSTRIA_NUTS2_20250101"
    "&outputFormat=application/json&srsName=EPSG:4326"
)

GEO_URL = (
    "https://www.statistik.at/gs-open/GEODATA/ows"
    "?service=WFS&version=1.1.0&request=GetFeature"
    "&typeName=GEODATA:STATISTIK_AUSTRIA_POLBEZ_20250101"
    "&outputFormat=application/json&srsName=EPSG:4326"
)

# ---------------------------------------------------------------------------
# Kartenregionen: AMS-Geschäftsstellenbezirke -> politische Bezirke
#
# Die beiden Systeme decken sich nicht. Manche AMS-Region umfasst mehrere
# Bezirke (Eisenstadt = Stadt + Rust + Umgebung), manchmal liegen mehrere
# AMS-Regionen in einem Bezirk (Bruck/Leitha und Schwechat), und Wien ist
# beim AMS in 15 Geschäftsstellen geteilt.
#
# Lösung: Kartenregionen, die aus GANZEN Bezirken bestehen. Wo nötig werden
# mehrere AMS-Regionen zu einer Kartenfläche zusammengefasst und ihre Zahlen
# addiert. Jeder der 94 Bezirke kommt genau einmal vor, jede der 99
# AMS-Regionen ebenfalls — das Skript prüft das bei jedem Lauf.
#
# Aufbau: (Anzeigename, [AMS-RGS-Codes], [Bezirkskennziffern])
# ---------------------------------------------------------------------------

KARTENREGIONEN = [
    # --- Burgenland ---
    ("Eisenstadt",              ["101"], ["101", "102", "103"]),
    ("Mattersburg",             ["102"], ["106"]),
    ("Neusiedl am See",         ["103"], ["107"]),
    ("Oberpullendorf",          ["104"], ["108"]),
    ("Oberwart",                ["105"], ["109"]),
    ("Güssing und Jennersdorf", ["108"], ["104", "105"]),
    # --- Kärnten ---
    ("Feldkirchen",             ["201"], ["210"]),
    ("Hermagor",                ["202"], ["203"]),
    ("Klagenfurt",              ["203"], ["201", "204"]),
    ("Spittal an der Drau",     ["204"], ["206"]),
    ("St. Veit an der Glan",    ["205"], ["205"]),
    ("Villach",                 ["206"], ["202", "207"]),
    ("Völkermarkt",             ["207"], ["208"]),
    ("Wolfsberg",               ["208"], ["209"]),
    # --- Niederösterreich ---
    ("Amstetten",               ["301"], ["305"]),
    ("Baden",                   ["304"], ["306"]),
    ("Bruck an der Leitha",     ["306", "329"], ["307"]),
    ("Gänserndorf",             ["308"], ["308"]),
    ("Gmünd",                   ["311"], ["309"]),
    ("Hollabrunn",              ["312"], ["310"]),
    ("Horn",                    ["313"], ["311"]),
    ("Korneuburg",              ["314"], ["312"]),
    ("Krems",                   ["315"], ["301", "313"]),
    ("Lilienfeld",              ["316"], ["314"]),
    ("Melk",                    ["317"], ["315"]),
    ("Mistelbach",              ["319"], ["316"]),
    ("Mödling",                 ["321"], ["317"]),
    ("Neunkirchen",             ["323"], ["318"]),
    ("St. Pölten",              ["326"], ["302", "319"]),
    ("Scheibbs",                ["328"], ["320"]),
    ("Tulln",                   ["331"], ["321"]),
    ("Waidhofen an der Thaya",  ["332"], ["322"]),
    ("Waidhofen an der Ybbs",   ["333"], ["303"]),
    ("Wiener Neustadt",         ["334"], ["304", "323"]),
    ("Zwettl",                  ["335"], ["325"]),
    # --- Oberösterreich ---
    ("Braunau",                 ["401"], ["404"]),
    ("Eferding",                ["402"], ["405"]),
    ("Freistadt",               ["403"], ["406"]),
    ("Gmunden",                 ["404"], ["407"]),
    ("Grieskirchen",            ["406"], ["408"]),
    ("Kirchdorf an der Krems",  ["407"], ["409"]),
    ("Linz",                    ["409", "421"], ["401", "410", "416"]),
    ("Perg",                    ["411"], ["411"]),
    ("Ried im Innkreis",        ["412"], ["412"]),
    ("Rohrbach",                ["413"], ["413"]),
    ("Schärding",               ["414"], ["414"]),
    ("Steyr",                   ["415"], ["402", "415"]),
    ("Vöcklabruck",             ["418"], ["417"]),
    ("Wels",                    ["419"], ["403", "418"]),
    # --- Salzburg ---
    ("St. Johann im Pongau",    ["501"], ["504"]),
    ("Hallein",                 ["503"], ["502"]),
    ("Tamsweg",                 ["505"], ["505"]),
    ("Zell am See",             ["506"], ["506"]),
    ("Salzburg-Stadt",          ["510"], ["501"]),
    ("Salzburg-Umgebung",       ["511"], ["503"]),
    # --- Steiermark ---
    ("Bruck-Mürzzuschlag",      ["601", "621"], ["621"]),
    ("Deutschlandsberg",        ["603"], ["603"]),
    ("Südoststeiermark",        ["604"], ["623"]),
    ("Weiz",                    ["606", "623"], ["617"]),
    ("Hartberg-Fürstenfeld",    ["609"], ["622"]),
    ("Murtal",                  ["610"], ["620"]),
    ("Murau",                   ["611"], ["614"]),
    ("Leibnitz",                ["614"], ["610"]),
    ("Leoben",                  ["616"], ["611"]),
    ("Liezen",                  ["618"], ["612"]),
    ("Voitsberg",               ["622"], ["616"]),
    ("Graz und Umgebung",       ["630", "631"], ["601", "606"]),
    # --- Tirol ---
    ("Imst",                    ["701"], ["702"]),
    ("Innsbruck",               ["702"], ["701", "703"]),
    ("Kitzbühel",               ["704"], ["704"]),
    ("Kufstein",                ["705"], ["705"]),
    ("Landeck",                 ["706"], ["706"]),
    ("Lienz",                   ["707"], ["707"]),
    ("Reutte",                  ["708"], ["708"]),
    ("Schwaz",                  ["709"], ["709"]),
    # --- Vorarlberg ---
    ("Bludenz",                 ["801"], ["801"]),
    ("Bregenz",                 ["802"], ["802"]),
    ("Dornbirn",                ["804"], ["803"]),
    ("Feldkirch",               ["805"], ["804"]),
    # --- Wien: 15 Geschäftsstellen, eine Fläche ---
    ("Wien", ["958", "959", "960", "962", "963", "964", "965", "966", "967",
              "968", "969", "974", "975", "976", "977"], ["900"]),
]

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

# Grenzen für offene Altersgruppen. Das AMS schreibt "unter 20 Jahre" und
# "65 Jahre und älter" — wörtlich genommen wären das 0–19 bzw. 65–unendlich.
# Beim AMS vorgemerkt sein kann man aber erst ab 15 und praktisch nicht über
# 74. Ohne diese Klammern landet "unter 20" fälschlich bei Generation Alpha
# und "65 und älter" bei der Vorkriegsgeneration.
ALTER_UNTERGRENZE = 15
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

# Wie viele Monate zeigt das Verlaufsdiagramm der Ausbildungsgruppen
VERLAUF_MONATE = 18

# Wie viele Monate zeigen Zu-/Abgänge und Schulungen
FLUSS_MONATE = 24

# ---------------------------------------------------------------------------
# Einbettung für Redaktionen
#
# Diese Zeile erscheint in jeder eingebetteten Grafik und erfüllt die
# CC-BY-Namensnennungspflicht.
#
# Achtung: arbeitsmarktdashboard.at löst derzeit noch nicht auf (Stand
# 2026-08-13). Bis die Domain steht, gehen alle Links in eingebetteten
# Grafiken ins Leere. Wer das vermeiden will, trägt vorübergehend die
# GitHub-Pages-Adresse als "url" ein und tauscht sie später:
#   "url": "https://tvhp6g7shv-art.github.io/arbeitsmarkt-at/",
# ---------------------------------------------------------------------------

EINBETTUNG = {
    "grafik_von": "arbeitsmarktdashboard.at",
    "url": "https://arbeitsmarktdashboard.at",
    "lizenz_grafik": "CC BY 4.0",
}

# Netzwerk
TIMEOUT_SEKUNDEN = 300
