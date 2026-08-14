"""
Themenstrang: Eurostat — Quoten, EU-Vergleich, Inflation
JSON-stat-Parser, Arbeitslosenquoten nach Bildungsstand (AT-Regionen),
Ländervergleich mit Rangliste sowie HVPI-Inflation (steckt in eu.json;
seit v19 nutzt sie keine Grafik mehr, die Reihe bleibt für spätere
Auswertungen erhalten).


Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import json

import pandas as pd

import config
from gemeinsam import EU_QUOTEN, lade_bytes, log, warnen

def entpacke_jsonstat(rohdaten: dict) -> tuple[pd.DataFrame, dict]:
    """
    JSON-stat 2.0 in eine flache Tabelle umwandeln.

    JSON-stat speichert alle Werte in einem flachen Dictionary, dessen
    Schlüssel eine durchlaufende Nummer ist. Aus dieser Nummer lassen sich
    die Positionen in den einzelnen Dimensionen zurückrechnen — von der
    letzten Dimension nach vorne, jeweils per Division mit Rest.

    Gibt zurück: (Tabelle, Klartext-Beschriftungen je Dimension)
    """
    dimensions_ids = rohdaten["id"]
    groessen = rohdaten["size"]

    # Pro Dimension: Position -> Code, und Code -> Klartext
    positionen: dict[str, list[str]] = {}
    beschriftungen: dict[str, dict[str, str]] = {}
    for dim in dimensions_ids:
        kategorie = rohdaten["dimension"][dim]["category"]
        index = kategorie["index"]
        if isinstance(index, dict):
            sortiert = sorted(index.items(), key=lambda paar: paar[1])
            positionen[dim] = [code for code, _ in sortiert]
        else:
            positionen[dim] = list(index)
        beschriftungen[dim] = kategorie.get("label", {})

    zeilen = []
    for flacher_index, wert in rohdaten["value"].items():
        if wert is None:
            continue
        rest = int(flacher_index)
        koordinaten = {}
        for stelle in range(len(groessen) - 1, -1, -1):
            rest, position = divmod(rest, groessen[stelle])
            dim = dimensions_ids[stelle]
            koordinaten[dim] = positionen[dim][position]
        koordinaten["wert"] = wert
        zeilen.append(koordinaten)

    return pd.DataFrame(zeilen), beschriftungen


def hole_eurostat() -> dict:
    log("\n[4/6] Eurostat-Arbeitslosenquoten laden")
    rohdaten = json.loads(
        lade_bytes(config.EUROSTAT_URL, config.EUROSTAT_PARAMS).decode("utf-8")
    )
    tabelle, beschriftungen = entpacke_jsonstat(rohdaten)

    if "geo" not in tabelle.columns or "isced11" not in tabelle.columns:
        warnen("Eurostat-Antwort hat unerwartete Dimensionen — Quoten werden übersprungen")
        return {}

    # Nur österreichische Regionen
    tabelle = tabelle[tabelle["geo"].isin(config.NUTS2_BUNDESLAND)]
    if tabelle.empty:
        warnen("Eurostat lieferte keine österreichischen Regionen")
        return {}

    neuestes_jahr = sorted(tabelle["time"].unique())[-1]
    aktuell = tabelle[tabelle["time"] == neuestes_jahr]

    isced_codes = sorted(aktuell["isced11"].unique())
    regionen = []
    for code, name in config.NUTS2_BUNDESLAND.items():
        teil = aktuell[aktuell["geo"] == code]
        regionen.append({
            "code": code,
            "name": name,
            "werte": {
                zeile["isced11"]: round(float(zeile["wert"]), 1)
                for _, zeile in teil.iterrows()
            },
        })

    # Zeitreihe für Gesamt-Bildungsstand
    jahre = sorted(tabelle["time"].unique())
    zeitreihe = {}
    for code, name in config.NUTS2_BUNDESLAND.items():
        teil = tabelle[(tabelle["geo"] == code) & (tabelle["isced11"] == "TOTAL")]
        werte = teil.set_index("time")["wert"].to_dict()
        zeitreihe[code] = [
            round(float(werte[j]), 1) if j in werte else None for j in jahre
        ]

    log(f"    Jahr {neuestes_jahr} · {len(isced_codes)} Bildungsstufen · 9 Regionen")
    return {
        "definition": "ILO/Labour-Force-Survey (EU-vergleichbar) — nicht identisch "
                      "mit der nationalen AMS-Definition",
        "quelle": "Eurostat lfst_r_lfu3rt",
        "jahr": neuestes_jahr,
        "jahre": jahre,
        "isced": [
            {"code": c, "name": beschriftungen.get("isced11", {}).get(c, c)}
            for c in isced_codes
        ],
        "regionen": regionen,
        "zeitreihe": zeitreihe,
    }


def hole_eurostat_vergleich() -> dict | None:
    """Österreich gegen EU-27 und Deutschland — gleiche Quelle, gleiche Definition."""
    log("\n    Eurostat-Ländervergleich")
    params = dict(config.EUROSTAT_PARAMS)
    params["geoLevel"] = "country"      # alle Länder statt AT-Regionen
    params["isced11"] = "TOTAL"
    try:
        rohdaten = json.loads(
            lade_bytes(config.EUROSTAT_URL, params).decode("utf-8")
        )
    except SystemExit:
        warnen("Eurostat-Ländervergleich nicht abrufbar")
        return None

    tabelle, _ = entpacke_jsonstat(rohdaten)
    if "geo" not in tabelle.columns:
        warnen("Eurostat-Ländervergleich hat unerwartete Struktur")
        return None

    # Zweite Abfrage für die Aggregate. geoLevel=country schließt sie aus —
    # der EU-27-Schnitt ist für Eurostat kein Land. Ohne diesen Nachschlag
    # fehlt genau die Linie, gegen die verglichen werden soll.
    aggregat_beschriftungen = {}
    for code in config.EUROSTAT_AGGREGATE:
        agg_params = dict(config.EUROSTAT_PARAMS)
        agg_params.pop("geoLevel", None)
        agg_params["isced11"] = "TOTAL"
        agg_params["geo"] = code
        try:
            agg_roh = json.loads(
                lade_bytes(config.EUROSTAT_URL, agg_params).decode("utf-8")
            )
            agg_tabelle, agg_labels = entpacke_jsonstat(agg_roh)
        except SystemExit:
            warnen(f"Eurostat-Aggregat {code} nicht abrufbar — Vergleichslinie fehlt")
            continue
        except Exception as fehler:
            warnen(f"Eurostat-Aggregat {code}: {type(fehler).__name__} — Vergleichslinie fehlt")
            continue
        if "geo" in agg_tabelle.columns and not agg_tabelle.empty:
            tabelle = pd.concat([tabelle, agg_tabelle], ignore_index=True)
            aggregat_beschriftungen.update(agg_labels.get("geo", {}))

    jahre = sorted(tabelle["time"].unique())
    serien = {}
    for code in config.EUROSTAT_VERGLEICH:
        teil = tabelle[tabelle["geo"] == code].set_index("time")["wert"].to_dict()
        if teil:
            serien[code] = [
                round(float(teil[j]), 1) if j in teil else None for j in jahre
            ]
    if not serien:
        warnen("Eurostat lieferte keine Vergleichswerte")
        return None

    # Rangliste aller Länder für das aktuellste Jahr, in dem Österreich einen
    # Wert hat — sonst steht Österreich in der Liste, aber ohne Balken.
    beschriftungen = {}
    try:
        beschriftungen = entpacke_jsonstat(rohdaten)[1].get("geo", {})
    except Exception:
        pass
    beschriftungen.update(aggregat_beschriftungen)

    at_jahre = [
        j for j in jahre
        if not tabelle[(tabelle["geo"] == config.EUROSTAT_HERVORHEBUNG)
                       & (tabelle["time"] == j)].empty
    ]
    rang_jahr = at_jahre[-1] if at_jahre else jahre[-1]
    aktuell = tabelle[tabelle["time"] == rang_jahr]

    # Nur die 27 Mitgliedstaaten in die Rangliste. Zwei Gründe:
    # Der EU-Schnitt ist kein Land — stünde er als Balken dazwischen, wäre
    # „Platz 10 von 28" falsch; er wird als Referenzlinie mitgegeben.
    # Und Eurostat meldet auf Länderebene auch Schweiz, Norwegen, Türkei und
    # den Westbalkan mit — „Platz 16 von 34 EU-Ländern" wäre schlicht gelogen.
    rangliste, eu_referenz = [], None
    mitglieder = set(config.EU27_MITGLIEDER)
    for _, zeile in aktuell.iterrows():
        code = str(zeile["geo"])
        wert = round(float(zeile["wert"]), 1)
        if code == "EU27_2020":
            eu_referenz = wert
            continue
        if code not in mitglieder:
            continue                     # Aggregate und Nicht-EU-Meldeländer
        rangliste.append({
            "code": code,
            "name": beschriftungen.get(code, code),
            "wert": wert,
            "hervorgehoben": code == config.EUROSTAT_HERVORHEBUNG,
        })
    rangliste.sort(key=lambda e: e["wert"])

    platz = next(
        (i + 1 for i, e in enumerate(rangliste) if e["hervorgehoben"]), None
    )

    sammle_eu_quoten(tabelle, beschriftungen, rang_jahr)
    log(f"        {len(serien)} Reihen {jahre[0]}–{jahre[-1]} · "
        f"Rangliste {rang_jahr}: {len(rangliste)} Länder"
        + (f", Österreich auf Platz {platz}" if platz else ""))

    ergebnis = {
        "definition": "Arbeitslosenquote nach ILO-Definition, 15–74 Jahre",
        "quelle": "Eurostat lfst_r_lfu3rt",
        "jahre": jahre,
        "namen": config.EUROSTAT_VERGLEICH_NAMEN,
        "serien": serien,
        "rang_jahr": rang_jahr,
        "rangliste": rangliste,
        "eu_referenz": eu_referenz,
        "platz_oesterreich": platz,
    }
    inflation = hole_inflation(jahre)
    if inflation:
        ergebnis["inflation"] = inflation
        ergebnis["quelle_inflation"] = "Eurostat prc_hicp_aind"
    return ergebnis


def sammle_eu_quoten(tabelle, beschriftungen: dict, jahr: str) -> None:
    """
    Quoten je EU-Mitgliedstaat für `jahr` und das Vorjahr in EU_QUOTEN legen.

    Rechnet die Veränderung in PROZENTPUNKTEN, nicht in Prozent. Bei Quoten
    ist das die einzig sinnvolle Differenz: 4,0 → 4,4 sind +0,4 Prozentpunkte.
    Als „+10 Prozent" wäre derselbe Sachverhalt formal richtig, aber
    irreführend — kleine Ausgangsquoten erzeugen große Prozentwerte, und mit
    der Bestandsveränderung der Bezirkskarte wäre es trotz gleicher Einheit
    nicht vergleichbar.

    Füllt geteilten Zustand statt zurückzugeben, damit eukarte.py die
    Länderabfrage nicht wiederholen muss. Schreibt nur Schlüssel, weist
    EU_QUOTEN nie neu zu.
    """
    try:
        vorjahr = str(int(jahr) - 1)
    except (TypeError, ValueError):
        warnen(f"Eurostat-Jahresangabe '{jahr}' nicht als Zahl lesbar — EU-Karte entfällt")
        return

    jetzt = tabelle[tabelle["time"] == jahr].set_index("geo")["wert"].to_dict()
    davor = tabelle[tabelle["time"] == vorjahr].set_index("geo")["wert"].to_dict()

    if not davor:
        warnen(
            f"Eurostat hat für {vorjahr} keine Länderwerte — die EU-Karte kann "
            f"keine Veränderung zeigen und entfällt"
        )
        return

    laender, ohne_vorjahr = [], []
    for code in config.EU27_MITGLIEDER:
        if code not in jetzt:
            continue
        quote = round(float(jetzt[code]), 1)
        alt = round(float(davor[code]), 1) if code in davor else None
        if alt is None:
            ohne_vorjahr.append(code)
        laender.append({
            "code": code,
            "name": beschriftungen.get(code, code),
            "quote": quote,
            "quote_vorjahr": alt,
            # Erst runden, dann subtrahieren wäre schlampig; hier wird die
            # Differenz aus den gerundeten Quoten gebildet, damit die
            # Tabellenwerte und die Differenz zusammenpassen.
            "veraenderung_pp": None if alt is None else round(quote - alt, 1),
        })

    if not laender:
        warnen(f"Keine EU-Mitgliedstaaten mit Quote für {jahr} — EU-Karte entfällt")
        return
    if ohne_vorjahr:
        warnen(
            f"{len(ohne_vorjahr)} Mitgliedstaaten ohne Wert für {vorjahr} "
            f"({sorted(ohne_vorjahr)}) — sie bleiben auf der EU-Karte grau"
        )

    EU_QUOTEN["jahr"] = jahr
    EU_QUOTEN["vorjahr"] = vorjahr
    EU_QUOTEN["laender"] = laender
    log(f"        EU-Karte: {len(laender)} Mitgliedstaaten, {vorjahr} → {jahr}")


def hole_inflation(jahre: list) -> dict | None:
    """
    HVPI-Jahresinflation für dieselben Gebiete und Jahre wie die
    Arbeitslosenquote. Beides sind Prozentwerte derselben Frequenz — nur
    deshalb dürfen sie in einer Grafik gegeneinander stehen.

    Fällt die Abfrage aus, fehlt nur das Feld "inflation" in eu.json —
    seit v19 nutzt es keine Grafik mehr. Der EU-Vergleich bleibt vollständig.
    """
    log("    Eurostat-Inflation (HVPI)")
    params = dict(config.EUROSTAT_INFLATION_PARAMS)
    werte = {}
    for code in config.INFLATION_GEBIETE:
        anfrage = dict(params)
        anfrage["geo"] = code
        try:
            roh = json.loads(
                lade_bytes(config.EUROSTAT_INFLATION_URL, anfrage).decode("utf-8")
            )
            tabelle, _ = entpacke_jsonstat(roh)
        except SystemExit:
            warnen(f"Inflationsdaten für {code} nicht abrufbar")
            continue
        except Exception as fehler:
            warnen(f"Inflationsdaten {code}: {type(fehler).__name__}")
            continue
        if tabelle.empty or "time" not in tabelle.columns:
            continue
        je_jahr = tabelle.set_index("time")["wert"].to_dict()
        werte[code] = [
            round(float(je_jahr[j]), 1) if j in je_jahr and pd.notna(je_jahr[j]) else None
            for j in jahre
        ]

    if not werte:
        warnen("Keine Inflationsdaten — Feld 'inflation' fehlt in eu.json")
        return None
    log(f"        {len(werte)} Gebiete, {jahre[0]}–{jahre[-1]}")
    return werte
