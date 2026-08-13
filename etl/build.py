#!/usr/bin/env python3
"""
Datenpipeline für das Arbeitsmarkt-Dashboard Österreich.

Was dieses Skript tut:
  1. Lädt die offenen AMS-CSV-Dateien und die Eurostat-Quoten herunter
  2. Prüft, ob die Spalten noch so aussehen wie erwartet
  3. Aggregiert die Daten zu kleinen JSON-Dateien für das Dashboard
  4. Schreibt alles nach docs/data/

Aufruf:  python etl/build.py

Das Skript ist absichtlich gesprächig: es schreibt mit, was es tut, und
sammelt alle Auffälligkeiten in docs/data/meta.json unter "warnungen".
Wenn eine Quelle ihre Struktur ändert, bricht es mit einer verständlichen
Meldung ab, statt stillschweigend falsche Zahlen zu erzeugen.
"""

from __future__ import annotations

import io
import json
import sys
import datetime as dt
from pathlib import Path

import pandas as pd
import requests

import config

# ---------------------------------------------------------------------------
# Hilfsmittel
# ---------------------------------------------------------------------------

WARNUNGEN: list[str] = []
SCHEMA_REPORT: dict = {}

# Das Repo-Wurzelverzeichnis (eine Ebene über etl/)
WURZEL = Path(__file__).resolve().parent.parent
AUSGABE = WURZEL / config.AUSGABE_ORDNER


def log(text: str) -> None:
    print(text, flush=True)


def warnen(text: str) -> None:
    WARNUNGEN.append(text)
    log(f"  ⚠  {text}")


def abbruch(text: str) -> None:
    """Harter Abbruch mit klarer Meldung — erscheint im GitHub-Actions-Log."""
    log("")
    log("=" * 70)
    log("ABBRUCH: " + text)
    log("=" * 70)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def lade_bytes(url: str, params: dict | None = None) -> bytes:
    log(f"  ↓ {url.split('/')[-1][:60]}")
    try:
        antwort = requests.get(
            url,
            params=params,
            timeout=config.TIMEOUT_SEKUNDEN,
            headers={"User-Agent": "arbeitsmarkt-at-dashboard/1.0"},
        )
    except requests.RequestException as fehler:
        abbruch(f"Download fehlgeschlagen: {url}\n         {fehler}")
    if antwort.status_code != 200:
        abbruch(
            f"Download lieferte HTTP {antwort.status_code}: {url}\n"
            f"         Prüfen, ob die Quelle noch unter dieser Adresse liegt."
        )
    return antwort.content


def lade_ams_csv(schluessel: str) -> pd.DataFrame:
    """Lädt eine AMS-CSV und gibt sie mit kleingeschriebenen Spalten zurück."""
    dateiname = config.AMS_DATEIEN[schluessel]
    rohdaten = lade_bytes(f"{config.AMS_BASIS_URL}/{dateiname}")

    tabelle = None
    for kodierung in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            tabelle = pd.read_csv(
                io.BytesIO(rohdaten),
                sep=";",
                encoding=kodierung,
                dtype=str,
                keep_default_na=False,
            )
            break
        except UnicodeDecodeError:
            continue
    if tabelle is None:
        abbruch(f"{dateiname}: Keine passende Zeichenkodierung gefunden.")

    # Die Dateien enden mit einem Strichpunkt -> letzte Spalte ist leer
    tabelle = tabelle.loc[:, ~tabelle.columns.str.startswith("Unnamed")]
    tabelle.columns = [s.strip().lower() for s in tabelle.columns]

    SCHEMA_REPORT[dateiname] = {
        "spalten": list(tabelle.columns),
        "zeilen": int(len(tabelle)),
    }
    log(f"    {len(tabelle):,} Zeilen · Spalten: {', '.join(tabelle.columns)}")
    return tabelle


def pruefe_spalten(tabelle: pd.DataFrame, erwartet: list[str], quelle: str) -> None:
    fehlend = [s for s in erwartet if s not in tabelle.columns]
    if fehlend:
        abbruch(
            f"{quelle}: Erwartete Spalten fehlen: {', '.join(fehlend)}\n"
            f"         Tatsächlich vorhanden: {', '.join(tabelle.columns)}\n"
            f"         Die Quelle hat vermutlich ihr Format geändert."
        )


def zu_zahl(serie: pd.Series) -> pd.Series:
    """Wandelt Textspalten in Zahlen um. Punkt als Tausender, Komma als Komma."""
    return pd.to_numeric(
        serie.astype(str)
        .str.replace(".", "", regex=False)
        .str.replace(",", ".", regex=False)
        .str.strip()
        .replace({"": None}),
        errors="coerce",
    ).fillna(0)


# ---------------------------------------------------------------------------
# Schritt 1: Mapping Bezirk -> Bundesland
# ---------------------------------------------------------------------------

def baue_bezirks_mapping() -> dict[str, dict]:
    """
    Liest aus der Langzeitbeschäftigungslosigkeits-Datei die Zuordnung
    RGSCode -> (Bezirksname, Bundesland). Das ist die einzige AMS-Datei,
    die das Bundesland im Klartext mitliefert.
    """
    log("\n[1/5] Bezirks-Mapping aufbauen")
    tabelle = lade_ams_csv("bundesland_mapping")
    pruefe_spalten(
        tabelle, ["rgscode", "rgsname", "bundesland"], "LZBL-Datei"
    )

    eindeutig = (
        tabelle[["rgscode", "rgsname", "bundesland"]]
        .drop_duplicates(subset=["rgscode"])
        .set_index("rgscode")
    )

    mapping = {
        str(code).strip(): {
            "name": str(zeile["rgsname"]).strip(),
            "bundesland": str(zeile["bundesland"]).strip(),
        }
        for code, zeile in eindeutig.iterrows()
    }

    unbekannte = {
        eintrag["bundesland"] for eintrag in mapping.values()
    } - set(config.BUNDESLAND_NUTS2)
    if unbekannte:
        warnen(f"Unbekannte Bundesland-Bezeichnungen: {sorted(unbekannte)}")

    log(f"    {len(mapping)} Bezirke zugeordnet")
    return mapping


# ---------------------------------------------------------------------------
# Schritt 2: AMS-Ausbildungsdaten
# ---------------------------------------------------------------------------

def lade_ausbildungsdaten(mapping: dict[str, dict]) -> pd.DataFrame:
    log("\n[2/5] Arbeitslose nach Ausbildung laden")
    tabelle = lade_ams_csv("ausbildung")
    pruefe_spalten(
        tabelle,
        ["datum", "rgscode", "rgsname", "geschlecht", "ausbcode",
         "hoeabgausbildung", "bestand"],
        "AL_Ausbildung_RGS.csv",
    )

    tabelle["datum"] = pd.to_datetime(tabelle["datum"], errors="coerce")
    if tabelle["datum"].isna().any():
        warnen(f"{int(tabelle['datum'].isna().sum())} Zeilen mit unlesbarem Datum verworfen")
        tabelle = tabelle.dropna(subset=["datum"])

    tabelle["bestand"] = zu_zahl(tabelle["bestand"])
    tabelle["rgscode"] = tabelle["rgscode"].astype(str).str.strip()
    tabelle["ausbcode"] = tabelle["ausbcode"].astype(str).str.strip()

    # Bundesland anhängen
    tabelle["bundesland"] = tabelle["rgscode"].map(
        lambda c: mapping.get(c, {}).get("bundesland")
    )
    ohne_bl = tabelle["bundesland"].isna()
    if ohne_bl.any():
        fehlende = sorted(tabelle.loc[ohne_bl, "rgscode"].unique())
        warnen(
            f"{len(fehlende)} Bezirkscodes ohne Bundesland-Zuordnung: "
            f"{fehlende[:15]}{' …' if len(fehlende) > 15 else ''}"
        )
        tabelle = tabelle[~ohne_bl]

    # Codeliste der Ausbildungsstufen dokumentieren
    stufen = (
        tabelle[["ausbcode", "hoeabgausbildung"]]
        .drop_duplicates()
        .sort_values("ausbcode")
    )
    bekannt = set(config.AUSBILDUNG_REIHENFOLGE)
    neue = set(stufen["ausbcode"]) - bekannt
    if neue:
        warnen(
            f"Ausbildungscodes ohne festgelegte Sortierung: {sorted(neue)} — "
            f"in config.AUSBILDUNG_REIHENFOLGE ergänzen"
        )
    SCHEMA_REPORT["ausbildungsstufen"] = stufen.to_dict("records")

    log(f"    {len(tabelle):,} Zeilen · {tabelle['datum'].min():%Y-%m} bis "
        f"{tabelle['datum'].max():%Y-%m} · {stufen['ausbcode'].nunique()} Ausbildungsstufen")
    return tabelle


# ---------------------------------------------------------------------------
# Schritt 3: Eurostat-Quoten
# ---------------------------------------------------------------------------

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
    log("\n[3/5] Eurostat-Arbeitslosenquoten laden")
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


# ---------------------------------------------------------------------------
# Schritt 4: Aggregation zu den Dashboard-Dateien
# ---------------------------------------------------------------------------

def prozent(neu: float, alt: float) -> float | None:
    if not alt:
        return None
    return round((neu - alt) / alt * 100, 1)


def baue_ausgaben(daten: pd.DataFrame, mapping: dict, quoten: dict) -> dict[str, dict]:
    log("\n[4/5] Dashboard-Dateien aggregieren")

    monate = sorted(daten["datum"].unique())
    aktueller_monat = monate[-1]
    vorjahresmonat = aktueller_monat - pd.DateOffset(years=1)
    if vorjahresmonat not in monate:
        warnen("Kein exakter Vorjahresmonat vorhanden — Vergleiche entfallen teilweise")
        vorjahresmonat = None

    def m(datum) -> str:
        return pd.Timestamp(datum).strftime("%Y-%m-%d")

    jetzt = daten[daten["datum"] == aktueller_monat]
    vorjahr = daten[daten["datum"] == vorjahresmonat] if vorjahresmonat is not None else None

    ausgaben: dict[str, dict] = {}

    # --- KPI-Zeile ---------------------------------------------------------
    gesamt_jetzt = float(jetzt["bestand"].sum())
    gesamt_vorjahr = float(vorjahr["bestand"].sum()) if vorjahr is not None else 0.0

    nach_geschlecht = jetzt.groupby("geschlecht")["bestand"].sum().to_dict()

    quote_at = None
    if quoten:
        werte = [
            r["werte"].get("TOTAL") for r in quoten["regionen"]
            if r["werte"].get("TOTAL") is not None
        ]
        if werte:
            quote_at = {"jahr": quoten["jahr"], "spanne": [min(werte), max(werte)]}

    ausgaben["kpi"] = {
        "stand": m(aktueller_monat),
        "arbeitslose_gesamt": int(gesamt_jetzt),
        "vorjahr_gesamt": int(gesamt_vorjahr) if vorjahr is not None else None,
        "veraenderung_abs": int(gesamt_jetzt - gesamt_vorjahr) if vorjahr is not None else None,
        "veraenderung_pct": prozent(gesamt_jetzt, gesamt_vorjahr) if vorjahr is not None else None,
        "nach_geschlecht": {k: int(v) for k, v in nach_geschlecht.items()},
        "bezirke_anzahl": int(jetzt["rgscode"].nunique()),
        "quote_eu": quote_at,
    }

    # --- Zeitreihe Österreich ---------------------------------------------
    reihe = daten.groupby("datum")["bestand"].sum().sort_index()
    reihe_geschlecht = (
        daten.groupby(["datum", "geschlecht"])["bestand"].sum().unstack(fill_value=0).sort_index()
    )
    ausgaben["zeitreihe"] = {
        "monate": [m(d) for d in reihe.index],
        "gesamt": [int(v) for v in reihe.values],
        "nach_geschlecht": {
            str(spalte): [int(v) for v in reihe_geschlecht[spalte].values]
            for spalte in reihe_geschlecht.columns
        },
    }

    # --- Nach Ausbildungsstand --------------------------------------------
    def sortierschluessel(code: str) -> tuple[int, str]:
        if code in config.AUSBILDUNG_REIHENFOLGE:
            return (config.AUSBILDUNG_REIHENFOLGE.index(code), code)
        return (len(config.AUSBILDUNG_REIHENFOLGE), code)

    namen = (
        daten.drop_duplicates("ausbcode").set_index("ausbcode")["hoeabgausbildung"].to_dict()
    )
    codes = sorted(daten["ausbcode"].unique(), key=sortierschluessel)

    jetzt_ausb = jetzt.groupby("ausbcode")["bestand"].sum()
    vorjahr_ausb = (
        vorjahr.groupby("ausbcode")["bestand"].sum() if vorjahr is not None else None
    )
    reihe_ausb = (
        daten.groupby(["datum", "ausbcode"])["bestand"].sum().unstack(fill_value=0).sort_index()
    )

    stufen = []
    for code in codes:
        wert = float(jetzt_ausb.get(code, 0))
        alt = float(vorjahr_ausb.get(code, 0)) if vorjahr_ausb is not None else 0.0
        stufen.append({
            "code": code,
            "name": namen.get(code, code),
            "bestand": int(wert),
            "vorjahr": int(alt) if vorjahr is not None else None,
            "veraenderung_pct": prozent(wert, alt) if vorjahr is not None else None,
            "anteil_pct": round(wert / gesamt_jetzt * 100, 1) if gesamt_jetzt else 0,
        })

    # Ausbildungsstand je Bundesland (für den Regionsfilter)
    je_bundesland: dict[str, dict[str, int]] = {}
    for land, teil in jetzt.groupby("bundesland"):
        summen = teil.groupby("ausbcode")["bestand"].sum()
        je_bundesland[str(land)] = {c: int(summen.get(c, 0)) for c in codes}

    ausgaben["ausbildung"] = {
        "stand": m(aktueller_monat),
        "stufen": stufen,
        "je_bundesland": je_bundesland,
        "zeitreihe": {
            "monate": [m(d) for d in reihe_ausb.index],
            "serien": {
                str(c): [int(v) for v in reihe_ausb[c].values]
                for c in reihe_ausb.columns
            },
        },
    }

    # --- Bezirke (Choropleth) ---------------------------------------------
    jetzt_bez = jetzt.groupby("rgscode")["bestand"].sum()
    vorjahr_bez = (
        vorjahr.groupby("rgscode")["bestand"].sum() if vorjahr is not None else None
    )
    bezirke = []
    for code in sorted(jetzt_bez.index):
        wert = float(jetzt_bez[code])
        alt = float(vorjahr_bez.get(code, 0)) if vorjahr_bez is not None else 0.0
        info = mapping.get(code, {})
        bezirke.append({
            "code": code,
            "name": info.get("name", code),
            "bundesland": info.get("bundesland"),
            "bestand": int(wert),
            "veraenderung_pct": prozent(wert, alt) if vorjahr is not None else None,
        })
    ausgaben["bezirke"] = {"stand": m(aktueller_monat), "bezirke": bezirke}

    # --- Bundesländer (Tabelle mit Sparklines) ----------------------------
    reihe_land = (
        daten.groupby(["datum", "bundesland"])["bestand"].sum()
        .unstack(fill_value=0).sort_index()
    )
    letzte = reihe_land.tail(config.SPARKLINE_MONATE)

    quoten_je_land = {}
    if quoten:
        for region in quoten["regionen"]:
            quoten_je_land[region["name"]] = region["werte"].get("TOTAL")

    laender = []
    for land in config.BUNDESLAND_REIHENFOLGE:
        if land not in reihe_land.columns:
            warnen(f"Bundesland '{land}' fehlt in den Daten")
            continue
        wert = float(reihe_land[land].iloc[-1])
        alt = (
            float(reihe_land.loc[vorjahresmonat, land])
            if vorjahresmonat is not None and vorjahresmonat in reihe_land.index
            else 0.0
        )
        laender.append({
            "name": land,
            "nuts2": config.BUNDESLAND_NUTS2[land],
            "bestand": int(wert),
            "veraenderung_pct": prozent(wert, alt) if alt else None,
            "sparkline": [int(v) for v in letzte[land].values],
            "quote_eu": quoten_je_land.get(land),
        })

    ausgaben["bundeslaender"] = {
        "stand": m(aktueller_monat),
        "sparkline_monate": [m(d) for d in letzte.index],
        "laender": laender,
    }

    # --- Quoten ------------------------------------------------------------
    if quoten:
        ausgaben["quoten"] = quoten

    for name, inhalt in ausgaben.items():
        log(f"    ✓ {name}.json")
    return ausgaben


# ---------------------------------------------------------------------------
# Schritt 5: Geodaten und Schreiben
# ---------------------------------------------------------------------------

def hole_geodaten(bezirkscodes: set[str]) -> dict | None:
    log("\n[5/5] Bezirksgrenzen laden")
    try:
        geo = json.loads(lade_bytes(config.GEO_URL).decode("utf-8"))
    except SystemExit:
        warnen("Bezirksgrenzen nicht abrufbar — Karte bleibt vorerst leer")
        return None

    merkmale = geo.get("features", [])
    if not merkmale:
        warnen("Geodaten enthalten keine Features")
        return None

    geo_codes = {
        str(mm.get("properties", {}).get("g_id", "")).strip() for mm in merkmale
    }
    fehlend = bezirkscodes - geo_codes
    ueberzaehlig = geo_codes - bezirkscodes
    if fehlend:
        warnen(
            f"{len(fehlend)} AMS-Bezirkscodes ohne Geometrie: "
            f"{sorted(fehlend)[:20]} — diese Bezirke bleiben auf der Karte grau"
        )
    if ueberzaehlig:
        warnen(f"{len(ueberzaehlig)} Geometrien ohne AMS-Daten: {sorted(ueberzaehlig)[:20]}")

    # ECharts erwartet den Anzeigenamen in properties.name
    for merkmal in merkmale:
        eigenschaften = merkmal.setdefault("properties", {})
        eigenschaften["name"] = str(eigenschaften.get("g_id", "")).strip()
        eigenschaften["bezirk"] = eigenschaften.get("g_name", "")

    log(f"    {len(merkmale)} Bezirksgeometrien")
    return geo


def schreibe(name: str, inhalt) -> None:
    AUSGABE.mkdir(parents=True, exist_ok=True)
    ziel = AUSGABE / f"{name}.json"
    with ziel.open("w", encoding="utf-8") as datei:
        json.dump(inhalt, datei, ensure_ascii=False, separators=(",", ":"))
    groesse = ziel.stat().st_size / 1024
    log(f"    {name}.json  ({groesse:,.0f} KB)")


# ---------------------------------------------------------------------------

def main() -> None:
    start = dt.datetime.now(dt.timezone.utc)
    log("=" * 70)
    log("Arbeitsmarkt-Dashboard Österreich — Datenaktualisierung")
    log(f"Start: {start:%Y-%m-%d %H:%M} UTC")
    log("=" * 70)

    mapping = baue_bezirks_mapping()
    daten = lade_ausbildungsdaten(mapping)
    quoten = hole_eurostat()
    ausgaben = baue_ausgaben(daten, mapping, quoten)
    geo = hole_geodaten(set(daten["rgscode"].unique()))

    log("\nSchreiben")
    for name, inhalt in ausgaben.items():
        schreibe(name, inhalt)
    if geo:
        schreibe("bezirke_geo", geo)

    schreibe("meta", {
        "generiert_am": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stand_daten": ausgaben["kpi"]["stand"],
        "quellen": [
            {
                "name": "AMS Österreich — Arbeitsmarktdaten (Open Data)",
                "url": "https://www.data.gv.at/datasets?publisher=AMS+%C3%96sterreich",
                "lizenz": "CC BY 4.0",
            },
            {
                "name": "Eurostat — lfst_r_lfu3rt",
                "url": "https://ec.europa.eu/eurostat/databrowser/view/lfst_r_lfu3rt",
                "lizenz": "Eurostat-Nutzungsbedingungen",
            },
            {
                "name": "STATISTIK AUSTRIA — Bezirksgrenzen",
                "url": "https://data.statistik.gv.at/web/meta.jsp?dataset=OGDEXT_POLBEZ_1",
                "lizenz": "CC BY 4.0",
            },
        ],
        "hinweis_definitionen": (
            "AMS-Zahlen sind beim AMS registrierte Arbeitslose (nationale "
            "Definition, monatlich). Die Quoten stammen aus der EU-weiten "
            "Arbeitskräfteerhebung (ILO-Definition, jährlich) und sind mit den "
            "AMS-Absolutzahlen nicht direkt verrechenbar."
        ),
        "schema": SCHEMA_REPORT,
        "warnungen": WARNUNGEN,
    })

    dauer = (dt.datetime.now(dt.timezone.utc) - start).total_seconds()
    log("\n" + "=" * 70)
    if WARNUNGEN:
        log(f"Fertig in {dauer:.0f}s — mit {len(WARNUNGEN)} Hinweis(en):")
        for eintrag in WARNUNGEN:
            log(f"  · {eintrag}")
    else:
        log(f"Fertig in {dauer:.0f}s — keine Auffälligkeiten.")
    log("=" * 70)


if __name__ == "__main__":
    main()
