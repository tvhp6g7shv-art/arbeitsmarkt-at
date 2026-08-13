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
import re
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
VORMERKDAUER: dict = {}
LZBL: dict = {}

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


def lade_optional(schluessel: str) -> pd.DataFrame | None:
    """Wie lade_ams_csv, bricht aber nicht ab — für Zusatzquellen."""
    try:
        return lade_ams_csv(schluessel)
    except SystemExit:
        warnen(
            f"{config.AMS_DATEIEN[schluessel]} nicht abrufbar — "
            f"der zugehörige Abschnitt bleibt ausgeblendet"
        )
        return None


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
    log("\n[1/6] Bezirks-Mapping aufbauen")
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

    LZBL["tabelle"] = tabelle
    log(f"    {len(mapping)} Bezirke zugeordnet")
    return mapping


# ---------------------------------------------------------------------------
# Schritt 2: AMS-Ausbildungsdaten
# ---------------------------------------------------------------------------

def lade_ausbildungsdaten(mapping: dict[str, dict]) -> pd.DataFrame:
    log("\n[2/6] Arbeitslose nach Ausbildung laden")
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
    for fluss in ("zugang", "abgang"):          # für die Flussrechnung
        if fluss in tabelle.columns:
            tabelle[fluss] = zu_zahl(tabelle[fluss])
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
# Schritt 2b: Altersgruppen und Generationen
# ---------------------------------------------------------------------------

def alter_grenzen(text: str) -> tuple[int, int] | None:
    """
    Aus der Beschriftung einer Altersgruppe die Unter- und Obergrenze lesen.

    Die exakte Schreibweise des AMS ist nicht dokumentiert, deshalb erkennt
    diese Funktion die gängigen Varianten:
        "15-19", "15 bis 19", "15 bis 19 Jahre"  -> (15, 19)
        "unter 20", "u20", "<20"                 -> (15, 19)
        "bis 24"                                 -> (15, 24)
        "60+", "ab 60", "60 und mehr", "über 60" -> (60, 74)
    Offene Ränder werden auf das erwerbsfähige Alter geklammert
    (ALTER_UNTERGRENZE bis ALTER_OBERGRENZE) — sonst spannt "unter 20"
    bis Geburtsjahrgang heute und fällt der falschen Generation zu.
    Gibt None zurück, wenn nichts Verwertbares drinsteht.
    """
    def klammern(von: int, bis: int) -> tuple[int, int]:
        von = max(von, config.ALTER_UNTERGRENZE)
        bis = min(bis, config.ALTER_OBERGRENZE)
        return (von, max(von, bis))

    t = str(text).strip().lower()
    # "25 bis unter 30" meint 25–29, nicht 25–30
    exklusiv = "bis unter" in t or "bis  unter" in t
    zahlen = [int(z) for z in re.findall(r"\d+", t)]
    if not zahlen:
        return None
    if len(zahlen) >= 2:
        klein, gross = min(zahlen[0], zahlen[1]), max(zahlen[0], zahlen[1])
        return klammern(klein, gross - 1 if exklusiv else gross)

    z = zahlen[0]
    if t.startswith("u") or "unter" in t or "<" in t:
        return klammern(0, z - 1)
    if t.startswith("bis"):
        return klammern(0, z)
    if any(w in t for w in ("+", "über", "ueber", "älter", "aelter", "mehr", "ab ", ">")):
        return klammern(z, config.ALTER_OBERGRENZE)
    return klammern(z, z)


def generation_fuer(grenzen: tuple[int, int], jahr: int) -> str | None:
    """
    Altersgruppe der Generation mit der größten Überschneidung zuordnen.

    Aus Alter und Jahr ergeben sich die abgedeckten Geburtsjahrgänge; die
    werden mit den Generationen-Definitionen verglichen.
    """
    von_alter, bis_alter = grenzen
    geburt_von, geburt_bis = jahr - bis_alter, jahr - von_alter

    beste, groesste = None, 0
    for schluessel, _, jahr_von, jahr_bis in config.GENERATIONEN:
        ueberschneidung = max(0, min(geburt_bis, jahr_bis) - max(geburt_von, jahr_von) + 1)
        if ueberschneidung > groesste:
            beste, groesste = schluessel, ueberschneidung
    return beste


def spalte_finden(tabelle: pd.DataFrame, teil: str) -> str | None:
    for name in tabelle.columns:
        if teil in name:
            return name
    return None


def lade_altersdaten(mapping: dict[str, dict]) -> pd.DataFrame | None:
    """Arbeitslose nach Altersgruppen laden und je Monat einer Generation zuordnen."""
    log("\n[3/6] Arbeitslose nach Altersgruppen laden")
    try:
        tabelle = lade_ams_csv("alter")
    except SystemExit:
        warnen("Altersdatei nicht abrufbar — Generationen-Auswertung entfällt")
        return None

    spalte_alter = spalte_finden(tabelle, "alter")
    if spalte_alter is None:
        warnen(
            f"Keine Altersspalte gefunden (vorhanden: {', '.join(tabelle.columns)}) — "
            f"Generationen-Auswertung entfällt"
        )
        return None

    pruefe_spalten(tabelle, ["datum", "rgscode", "bestand"], config.AMS_DATEIEN["alter"])

    tabelle["datum"] = pd.to_datetime(tabelle["datum"], errors="coerce")
    tabelle = tabelle.dropna(subset=["datum"])
    tabelle["bestand"] = zu_zahl(tabelle["bestand"])
    tabelle["rgscode"] = tabelle["rgscode"].astype(str).str.strip()
    tabelle["altersgruppe"] = tabelle[spalte_alter].astype(str).str.strip()

    # Die Datei enthält zusätzlich die Dimension Vormerkdauer. Für die
    # Altersauswertung summieren wir sie weg (sonst Mehrfachzählung), vorher
    # sichern wir sie aber als eigene Auswertung.
    spalte_vmd = spalte_finden(tabelle, "vormerk") or spalte_finden(tabelle, "dauer")
    if spalte_vmd and spalte_vmd != "ds_vmd":
        VORMERKDAUER["tabelle"] = (
            tabelle.groupby(["datum", spalte_vmd], as_index=False)["bestand"].sum()
            .rename(columns={spalte_vmd: "dauer"})
        )
        log(f"    Vormerkdauergruppen: "
            f"{', '.join(sorted(tabelle[spalte_vmd].unique())[:8])}")
    else:
        warnen("Keine Vormerkdauer-Spalte gefunden — Verweildauer-Auswertung entfällt")

    schluesselspalten = ["datum", "rgscode", "altersgruppe"]
    if "geschlecht" in tabelle.columns:
        schluesselspalten.append("geschlecht")
    tabelle = tabelle.groupby(schluesselspalten, as_index=False)["bestand"].sum()

    # Beschriftungen einmal auswerten
    beschriftungen = sorted(tabelle["altersgruppe"].unique())
    grenzen = {b: alter_grenzen(b) for b in beschriftungen}
    unlesbar = [b for b, g in grenzen.items() if g is None]
    if unlesbar:
        warnen(
            f"Altersgruppen ohne erkennbare Grenzen: {unlesbar} — "
            f"diese Zeilen fließen nicht in die Generationen ein"
        )
    SCHEMA_REPORT["altersgruppen"] = [
        {"beschriftung": b, "von": g[0] if g else None, "bis": g[1] if g else None}
        for b, g in sorted(grenzen.items())
    ]
    log(f"    {len(beschriftungen)} Altersgruppen: {', '.join(beschriftungen[:12])}"
        f"{' …' if len(beschriftungen) > 12 else ''}")

    tabelle = tabelle[tabelle["altersgruppe"].map(lambda b: grenzen.get(b) is not None)]
    if tabelle.empty:
        warnen("Keine verwertbaren Altersgruppen — Generationen-Auswertung entfällt")
        return None

    # Zuordnung hängt vom Jahr ab: dieselbe Altersgruppe gehört 2019 zu einer
    # anderen Generation als 2026.
    tabelle["jahr"] = tabelle["datum"].dt.year
    paare = {
        (b, j): generation_fuer(grenzen[b], j)
        for b in tabelle["altersgruppe"].unique()
        for j in tabelle["jahr"].unique()
    }
    tabelle["generation"] = [
        paare[(b, j)] for b, j in zip(tabelle["altersgruppe"], tabelle["jahr"])
    ]
    tabelle["bundesland"] = tabelle["rgscode"].map(
        lambda c: mapping.get(c, {}).get("bundesland")
    )
    tabelle = tabelle.dropna(subset=["generation", "bundesland"])

    log(f"    {len(tabelle):,} Zeilen · {tabelle['datum'].min():%Y-%m} bis "
        f"{tabelle['datum'].max():%Y-%m}")
    return tabelle


def baue_generationen(daten: pd.DataFrame, aktueller_monat, vorjahresmonat) -> dict:
    """Aus den Altersdaten die Generationen-Ausgabe bauen."""
    def m(datum) -> str:
        return pd.Timestamp(datum).strftime("%Y-%m-%d")

    jahr = pd.Timestamp(aktueller_monat).year
    jetzt = daten[daten["datum"] == aktueller_monat]
    vorjahr = (
        daten[daten["datum"] == vorjahresmonat] if vorjahresmonat is not None else None
    )
    gesamt = float(jetzt["bestand"].sum())

    jetzt_gen = jetzt.groupby("generation")["bestand"].sum()
    vorjahr_gen = (
        vorjahr.groupby("generation")["bestand"].sum() if vorjahr is not None else None
    )

    # Welche Altersgruppen stecken aktuell in welcher Generation?
    zuordnung: dict[str, list[str]] = {}
    for gruppe in sorted(jetzt["altersgruppe"].unique()):
        schluessel = jetzt.loc[jetzt["altersgruppe"] == gruppe, "generation"].iloc[0]
        zuordnung.setdefault(schluessel, []).append(gruppe)

    eintraege = []
    for schluessel, bezeichnung, jahr_von, jahr_bis in config.GENERATIONEN:
        wert = float(jetzt_gen.get(schluessel, 0))
        if wert == 0 and schluessel not in zuordnung:
            continue                      # Generationen ohne Erwerbsalter weglassen
        alt = float(vorjahr_gen.get(schluessel, 0)) if vorjahr_gen is not None else 0.0
        eintraege.append({
            "schluessel": schluessel,
            "name": bezeichnung,
            "geburtsjahre": f"{jahr_von}–{jahr_bis}" if jahr_bis < 2100 else f"ab {jahr_von}",
            "alter_von": max(0, jahr - jahr_bis),
            "alter_bis": jahr - jahr_von,
            "altersgruppen": zuordnung.get(schluessel, []),
            "bestand": int(wert),
            "veraenderung_pct": prozent(wert, alt) if vorjahr is not None else None,
            "anteil_pct": round(wert / gesamt * 100, 1) if gesamt else 0,
        })

    reihe = (
        daten.groupby(["datum", "generation"])["bestand"].sum()
        .unstack(fill_value=0).sort_index()
    )
    je_bundesland: dict[str, dict[str, int]] = {}
    for land, teil in jetzt.groupby("bundesland"):
        summen = teil.groupby("generation")["bestand"].sum()
        je_bundesland[str(land)] = {
            e["schluessel"]: int(summen.get(e["schluessel"], 0)) for e in eintraege
        }

    # Altersgruppen einzeln — die exakte, unverfälschte Ebene
    jetzt_alter = jetzt.groupby("altersgruppe")["bestand"].sum()
    altersgruppen = [
        {
            "beschriftung": gruppe,
            "bestand": int(jetzt_alter[gruppe]),
            "generation": jetzt.loc[jetzt["altersgruppe"] == gruppe, "generation"].iloc[0],
        }
        for gruppe in sorted(jetzt_alter.index, key=lambda b: alter_grenzen(b) or (999, 999))
    ]

    return {
        "stand": m(aktueller_monat),
        "hinweis": (
            "Generationen sind Geburtsjahrgänge, das AMS liefert Altersgruppen. "
            "Jede Altersgruppe wurde der Generation mit der größten Überschneidung "
            "zugeordnet und für jeden Monat neu berechnet. An den Rändern zweier "
            "Generationen ist die Zuordnung daher unscharf. Die exakten "
            "Altersgruppen stehen in der Tabelle."
        ),
        "generationen": eintraege,
        "je_bundesland": je_bundesland,
        "altersgruppen": altersgruppen,
        "zeitreihe": {
            "monate": [m(d) for d in reihe.index],
            "serien": {str(c): [int(v) for v in reihe[c].values] for c in reihe.columns},
        },
    }


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


# ---------------------------------------------------------------------------
# Schritt 4: Aggregation zu den Dashboard-Dateien
# ---------------------------------------------------------------------------

def prozent(neu: float, alt: float) -> float | None:
    if not alt:
        return None
    return round((neu - alt) / alt * 100, 1)


def baue_ausgaben(daten: pd.DataFrame, mapping: dict, quoten: dict,
                  alter: pd.DataFrame | None = None) -> dict[str, dict]:
    log("\n[5/6] Dashboard-Dateien aggregieren")

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

    # Zusammenfassung auf 7 Gruppen fürs Diagramm (18 Stufen sind zu viele,
    # um sie als Balken noch unterscheiden zu können)
    zugeordnet = {c for _, _, codes in config.AUSBILDUNG_GRUPPEN for c in codes}
    nicht_zugeordnet = set(codes) - zugeordnet
    if nicht_zugeordnet:
        warnen(
            f"Ausbildungscodes ohne Gruppenzuordnung: {sorted(nicht_zugeordnet)} — "
            f"in config.AUSBILDUNG_GRUPPEN ergänzen, sonst fehlen sie im Diagramm"
        )

    gruppen = []
    for schluessel, bezeichnung, mitglieder in config.AUSBILDUNG_GRUPPEN:
        wert = float(sum(jetzt_ausb.get(c, 0) for c in mitglieder))
        alt = (
            float(sum(vorjahr_ausb.get(c, 0) for c in mitglieder))
            if vorjahr_ausb is not None else 0.0
        )
        gruppen.append({
            "schluessel": schluessel,
            "name": bezeichnung,
            "codes": mitglieder,
            "bestand": int(wert),
            "veraenderung_pct": prozent(wert, alt) if vorjahr is not None else None,
            "anteil_pct": round(wert / gesamt_jetzt * 100, 1) if gesamt_jetzt else 0,
        })

    gruppen_je_bundesland: dict[str, dict[str, int]] = {}
    for land, werte_land in je_bundesland.items():
        gruppen_je_bundesland[land] = {
            schluessel: int(sum(werte_land.get(c, 0) for c in mitglieder))
            for schluessel, _, mitglieder in config.AUSBILDUNG_GRUPPEN
        }

    # Zeitreihe je Gruppe — Grundlage des Verlaufsdiagramms
    letzte_monate = reihe_ausb.tail(config.VERLAUF_MONATE)
    zeitreihe_gruppen = {}
    for schluessel, _, mitglieder in config.AUSBILDUNG_GRUPPEN:
        spalten = [c for c in mitglieder if c in letzte_monate.columns]
        summe = letzte_monate[spalten].sum(axis=1) if spalten else None
        zeitreihe_gruppen[schluessel] = (
            [int(v) for v in summe.values] if summe is not None
            else [0] * len(letzte_monate)
        )

    ausgaben["ausbildung"] = {
        "stand": m(aktueller_monat),
        "gruppen": gruppen,
        "zeitreihe_gruppen": {
            "monate": [m(d) for d in letzte_monate.index],
            "serien": zeitreihe_gruppen,
        },
        "gruppen_je_bundesland": gruppen_je_bundesland,
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

    # --- Generationen ------------------------------------------------------
    if alter is not None and not alter.empty:
        ausgaben["generationen"] = baue_generationen(alter, aktueller_monat, vorjahresmonat)
        summe_gen = sum(g["bestand"] for g in ausgaben["generationen"]["generationen"])
        abweichung = abs(summe_gen - gesamt_jetzt) / gesamt_jetzt * 100 if gesamt_jetzt else 0
        if abweichung > 1:
            warnen(
                f"Generationen-Summe ({summe_gen:,}) weicht um {abweichung:.1f} % von der "
                f"Gesamtzahl aus der Ausbildungsdatei ({int(gesamt_jetzt):,}) ab — "
                f"die beiden AMS-Dateien zählen offenbar unterschiedlich"
            )
        else:
            log(f"    Gegenprobe Generationen: {summe_gen:,} vs. {int(gesamt_jetzt):,} "
                f"({abweichung:.1f} % Abweichung)")

    # --- Quoten ------------------------------------------------------------
    if quoten:
        ausgaben["quoten"] = quoten

    for name, inhalt in ausgaben.items():
        log(f"    ✓ {name}.json")
    return ausgaben


# ---------------------------------------------------------------------------
# Zusatzauswertungen
# ---------------------------------------------------------------------------

def baue_fluss(daten: pd.DataFrame) -> dict | None:
    """
    Zugänge und Abgänge je Monat.

    Die Spalten stecken schon in der Ausbildungsdatei. Der Bestand allein
    verschweigt die Bewegung: Ein gleichbleibender Bestand kann heißen, dass
    nichts passiert — oder dass jeden Monat Zehntausende zu- und abgehen.
    """
    if not {"zugang", "abgang"} <= set(daten.columns):
        warnen("Spalten ZUGANG/ABGANG fehlen — Flussrechnung entfällt")
        return None

    reihe = daten.groupby("datum")[["zugang", "abgang"]].sum().sort_index()
    letzte = reihe.tail(config.FLUSS_MONATE)
    saldo = (letzte["zugang"] - letzte["abgang"]).astype(int)

    return {
        "stand": pd.Timestamp(letzte.index[-1]).strftime("%Y-%m-%d"),
        "hinweis": (
            "Zugang = im Monat neu als arbeitslos vorgemerkt. "
            "Abgang = Vormerkung im Monat beendet, aus welchem Grund auch immer "
            "— Aufnahme einer Arbeit, Schulung, Pension, Abmeldung."
        ),
        "monate": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in letzte.index],
        "zugang": [int(v) for v in letzte["zugang"].values],
        "abgang": [int(v) for v in letzte["abgang"].values],
        "saldo": [int(v) for v in saldo.values],
    }


def baue_dauer(lzbl: pd.DataFrame | None) -> dict | None:
    """Vormerkdauer-Verteilung und Langzeitbeschäftigungslosigkeit."""
    ergebnis: dict = {}

    tabelle = VORMERKDAUER.get("tabelle")
    if tabelle is not None and not tabelle.empty:
        letzter = tabelle["datum"].max()
        jetzt = tabelle[tabelle["datum"] == letzter]

        def sortierung(bezeichnung: str) -> int:
            zahlen = [int(z) for z in re.findall(r"\d+", str(bezeichnung))]
            return zahlen[0] if zahlen else 999

        gruppen = jetzt.groupby("dauer")["bestand"].sum()
        summe = float(gruppen.sum())
        ergebnis["vormerkdauer"] = {
            "stand": pd.Timestamp(letzter).strftime("%Y-%m-%d"),
            "gruppen": [
                {
                    "name": str(name),
                    "bestand": int(wert),
                    "anteil_pct": round(wert / summe * 100, 1) if summe else 0,
                }
                for name, wert in sorted(gruppen.items(), key=lambda p: sortierung(p[0]))
            ],
        }

    if lzbl is not None and "status" in lzbl.columns:
        lzbl = lzbl.copy()
        lzbl["datum"] = pd.to_datetime(lzbl["datum"], errors="coerce")
        lzbl["bestand"] = zu_zahl(lzbl["bestand"])
        lzbl = lzbl.dropna(subset=["datum"])

        zustaende = sorted(lzbl["status"].unique())
        SCHEMA_REPORT["lzbl_status"] = zustaende
        log(f"    Status-Ausprägungen der LZBL-Datei: {', '.join(zustaende)}")

        reihe = (
            lzbl.groupby(["datum", "status"])["bestand"].sum()
            .unstack(fill_value=0).sort_index().tail(config.SPARKLINE_MONATE)
        )
        ergebnis["langzeit"] = {
            "hinweis": (
                "Langzeitbeschäftigungslos ist, wer durchgehend länger als "
                "zwölf Monate beim AMS vorgemerkt ist — Unterbrechungen durch "
                "Schulungen oder kurze Beschäftigung zählen dabei mit."
            ),
            "monate": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in reihe.index],
            "serien": {
                str(spalte): [int(v) for v in reihe[spalte].values]
                for spalte in reihe.columns
            },
        }

    return ergebnis or None


def baue_schulung(mapping: dict) -> dict | None:
    """
    Personen in Schulung. Ohne diese Zeile ist der Arbeitslosenbestand über
    die Zeit nicht vergleichbar: Werden Schulungsplätze ausgeweitet, sinkt die
    Arbeitslosenzahl, ohne dass sich am Arbeitsmarkt etwas geändert hat.
    """
    tabelle = lade_optional("schulung")
    if tabelle is None:
        return None
    if "datum" not in tabelle.columns or "bestand" not in tabelle.columns:
        warnen(
            f"Schulungsdatei hat unerwartete Spalten "
            f"({', '.join(tabelle.columns)}) — Abschnitt entfällt"
        )
        return None

    tabelle["datum"] = pd.to_datetime(tabelle["datum"], errors="coerce")
    tabelle["bestand"] = zu_zahl(tabelle["bestand"])
    tabelle = tabelle.dropna(subset=["datum"])

    # Die Datei ist mehrdimensional (Alter, Berufswunsch) — alles wegsummieren
    reihe = tabelle.groupby("datum")["bestand"].sum().sort_index()
    letzte = reihe.tail(config.SPARKLINE_MONATE)
    aktuell = float(letzte.iloc[-1])
    vorjahr_index = letzte.index[-1] - pd.DateOffset(years=1)
    alt = float(reihe.get(vorjahr_index, 0))

    return {
        "stand": pd.Timestamp(letzte.index[-1]).strftime("%Y-%m-%d"),
        "hinweis": (
            "Schulungsteilnehmer:innen gelten nicht als arbeitslos, sind aber "
            "beim AMS vorgemerkt. Arbeitslose plus Schulungen ergibt die Zahl, "
            "die in Medienberichten meist als „vorgemerkte Personen“ steht."
        ),
        "bestand": int(aktuell),
        "veraenderung_pct": prozent(aktuell, alt) if alt else None,
        "monate": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in letzte.index],
        "werte": [int(v) for v in letzte.values],
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

    at_jahre = [
        j for j in jahre
        if not tabelle[(tabelle["geo"] == config.EUROSTAT_HERVORHEBUNG)
                       & (tabelle["time"] == j)].empty
    ]
    rang_jahr = at_jahre[-1] if at_jahre else jahre[-1]
    aktuell = tabelle[tabelle["time"] == rang_jahr]

    # Nur echte Länder in die Rangliste. Der EU-Schnitt ist kein Land — stünde
    # er als Balken dazwischen, wäre "Platz 10 von 28" schlicht falsch. Er wird
    # stattdessen als Referenzlinie mitgegeben.
    rangliste, eu_referenz = [], None
    for _, zeile in aktuell.iterrows():
        code = str(zeile["geo"])
        wert = round(float(zeile["wert"]), 1)
        if code.startswith("EU") or code.startswith("EA"):
            if code == "EU27_2020":
                eu_referenz = wert
            continue
        if len(code) != 2:
            continue                     # sonstige Aggregate weglassen
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
    log(f"        {len(serien)} Reihen {jahre[0]}–{jahre[-1]} · "
        f"Rangliste {rang_jahr}: {len(rangliste)} Länder"
        + (f", Österreich auf Platz {platz}" if platz else ""))

    return {
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


def baue_stellen(daten: pd.DataFrame, mapping: dict) -> dict | None:
    """
    Offene Stellen und Stellenandrangziffer: Wie viele Arbeitslose kommen auf
    eine offene Stelle? Je Bundesland und je Ausbildungsstufe.
    """
    tabelle = lade_optional("stellen")
    if tabelle is None:
        return None
    if not {"datum", "rgscode", "bestand"} <= set(tabelle.columns):
        warnen(
            f"Stellendatei hat unerwartete Spalten "
            f"({', '.join(tabelle.columns)}) — Abschnitt entfällt"
        )
        return None

    tabelle["datum"] = pd.to_datetime(tabelle["datum"], errors="coerce")
    tabelle["bestand"] = zu_zahl(tabelle["bestand"])
    tabelle["rgscode"] = tabelle["rgscode"].astype(str).str.strip()
    tabelle = tabelle.dropna(subset=["datum"])
    tabelle["bundesland"] = tabelle["rgscode"].map(
        lambda c: mapping.get(c, {}).get("bundesland")
    )
    tabelle = tabelle.dropna(subset=["bundesland"])

    letzter = tabelle["datum"].max()
    jetzt_os = tabelle[tabelle["datum"] == letzter]
    jetzt_al = daten[daten["datum"] == daten["datum"].max()]

    os_land = jetzt_os.groupby("bundesland")["bestand"].sum()
    al_land = jetzt_al.groupby("bundesland")["bestand"].sum()

    laender = []
    for land in config.BUNDESLAND_REIHENFOLGE:
        stellen = float(os_land.get(land, 0))
        arbeitslose = float(al_land.get(land, 0))
        laender.append({
            "name": land,
            "stellen": int(stellen),
            "arbeitslose": int(arbeitslose),
            "andrang": round(arbeitslose / stellen, 1) if stellen else None,
        })

    reihe = tabelle.groupby("datum")["bestand"].sum().sort_index().tail(config.SPARKLINE_MONATE)
    gesamt_os = float(os_land.sum())
    gesamt_al = float(al_land.sum())

    return {
        "stand": pd.Timestamp(letzter).strftime("%Y-%m-%d"),
        "hinweis": (
            "Stellenandrang = gemeldete Arbeitslose je beim AMS gemeldeter "
            "offener Stelle. Nicht jede offene Stelle wird dem AMS gemeldet, "
            "die tatsächliche Zahl offener Stellen liegt höher."
        ),
        "stellen_gesamt": int(gesamt_os),
        "andrang_gesamt": round(gesamt_al / gesamt_os, 1) if gesamt_os else None,
        "laender": laender,
        "monate": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in reihe.index],
        "werte": [int(v) for v in reihe.values],
    }


def baue_branche() -> dict | None:
    """Arbeitslose nach Wirtschaftszweig — Bau und Leiharbeit laufen vor."""
    tabelle = lade_optional("branche")
    if tabelle is None:
        return None

    spalte_name = (
        spalte_finden(tabelle, "nace") or spalte_finden(tabelle, "wirtschaft")
        or spalte_finden(tabelle, "branche")
    )
    if spalte_name is None or "datum" not in tabelle.columns:
        warnen(
            f"Branchendatei hat unerwartete Spalten "
            f"({', '.join(tabelle.columns)}) — Abschnitt entfällt"
        )
        return None
    # Wenn es Code- und Klartextspalte gibt, die längere (den Klartext) nehmen
    kandidaten = [s for s in tabelle.columns if "nace" in s or "wirtschaft" in s]
    if len(kandidaten) > 1:
        spalte_name = max(
            kandidaten, key=lambda s: tabelle[s].astype(str).str.len().mean()
        )

    tabelle["datum"] = pd.to_datetime(tabelle["datum"], errors="coerce")
    tabelle["bestand"] = zu_zahl(tabelle["bestand"])
    tabelle = tabelle.dropna(subset=["datum"])

    letzter = tabelle["datum"].max()
    vorjahr = letzter - pd.DateOffset(years=1)
    jetzt = tabelle[tabelle["datum"] == letzter].groupby(spalte_name)["bestand"].sum()
    alt = tabelle[tabelle["datum"] == vorjahr].groupby(spalte_name)["bestand"].sum()

    eintraege = [
        {
            "name": str(name),
            "bestand": int(wert),
            "veraenderung_pct": prozent(float(wert), float(alt.get(name, 0))),
        }
        for name, wert in jetzt.sort_values(ascending=False).items()
    ]
    log(f"    {len(eintraege)} Wirtschaftszweige")

    return {
        "stand": pd.Timestamp(letzter).strftime("%Y-%m-%d"),
        "hinweis": (
            "Zugeordnet wird die Branche der zuletzt ausgeübten Tätigkeit. "
            "Bau und Arbeitskräfteüberlassung reagieren erfahrungsgemäß früher "
            "als der Gesamtbestand."
        ),
        "branchen": eintraege[:15],
    }


# ---------------------------------------------------------------------------
# Schritt 5: Geodaten und Schreiben
# ---------------------------------------------------------------------------

def code_aus_merkmal(merkmal: dict) -> str:
    """
    Bezirkskennziffer eines WFS-Features bestimmen. Der Statistik-Austria-WFS
    liefert sie als Attribut `g_id`, ersatzweise steckt sie in der Feature-ID
    ("STATISTIK_AUSTRIA_POLBEZ_20250101.101").
    """
    eigenschaften = merkmal.get("properties") or {}
    for schluessel in ("g_id", "id"):
        wert = str(eigenschaften.get(schluessel, "")).strip()
        if wert:
            return wert
    kennung = str(merkmal.get("id", ""))
    return kennung.rsplit(".", 1)[-1].strip() if "." in kennung else ""


def baue_kartenregionen(jetzt_je_rgs, vorjahr_je_rgs, mapping: dict,
                        stand: str) -> tuple[dict | None, dict]:
    """
    Bezirksgeometrien laden und zu Kartenregionen verschmelzen.

    Warum verschmelzen: AMS-Geschäftsstellenbezirke und politische Bezirke
    decken sich nicht. Die Tabelle KARTENREGIONEN fasst beide Seiten zu
    Flächen zusammen, die aus ganzen Bezirken bestehen und deren AMS-Zahlen
    sich sauber addieren lassen.
    """
    log("\n[6/6] Bezirksgeometrien laden und verschmelzen")
    try:
        from shapely.geometry import shape, mapping as geo_mapping
        from shapely.ops import unary_union
        from shapely.validation import make_valid
    except ImportError:
        warnen("shapely fehlt — Karte entfällt, die Tabellen enthalten alle Werte")
        return None, {}

    try:
        geo = json.loads(lade_bytes(config.GEO_URL).decode("utf-8"))
    except SystemExit:
        warnen("Bezirksgrenzen nicht abrufbar — Karte entfällt")
        return None, {}

    formen = {}
    for merkmal in geo.get("features", []):
        code = code_aus_merkmal(merkmal)
        if code and merkmal.get("geometry"):
            formen[code] = shape(merkmal["geometry"])
    log(f"    {len(formen)} Flächen im Dienst (94 Bezirke + 23 Wiener Gemeindebezirke)")

    def bereinigen(geometrie):
        """
        Die Rohgeometrien enthalten vereinzelt ungültige Ränder
        (selbstüberschneidend, Splitterflächen). GEOS bricht darüber beim
        Verschmelzen ab. make_valid repariert das; buffer(0) ist der
        Rückfall für die Fälle, die make_valid leer zurückgibt.
        """
        if geometrie.is_valid:
            return geometrie
        repariert = make_valid(geometrie)
        if repariert.is_empty:
            repariert = geometrie.buffer(0)
        return repariert

    merkmale, werte = [], []
    fehlende_geo, fehlende_daten, kaputte = [], [], []

    for name, rgs_codes, bkz_codes in config.KARTENREGIONEN:
        teile = [formen[b] for b in bkz_codes if b in formen]
        if len(teile) != len(bkz_codes):
            fehlende_geo.extend(b for b in bkz_codes if b not in formen)
            continue

        # Eine kaputte Fläche darf den ganzen Lauf nicht mitreißen.
        try:
            flaeche = unary_union([bereinigen(g) for g in teile])
            flaeche = flaeche.simplify(0.0015, preserve_topology=True)
            flaeche = bereinigen(flaeche)
        except Exception as fehler:
            kaputte.append(f"{name} ({type(fehler).__name__})")
            continue
        bestand = float(sum(jetzt_je_rgs.get(c, 0) for c in rgs_codes))
        hat_vorjahr = vorjahr_je_rgs is not None
        alt = (float(sum(vorjahr_je_rgs.get(c, 0) for c in rgs_codes))
               if hat_vorjahr else 0.0)
        if not any(c in jetzt_je_rgs for c in rgs_codes):
            fehlende_daten.append(name)

        land = next(
            (mapping[c]["bundesland"] for c in rgs_codes if c in mapping), None
        )
        merkmale.append({
            "type": "Feature",
            "properties": {"name": name, "bundesland": land},
            "geometry": geo_mapping(flaeche),
        })
        werte.append({
            "name": name,
            "bundesland": land,
            "ams_bezirke": [mapping.get(c, {}).get("name", c) for c in rgs_codes],
            "bestand": int(bestand),
            "veraenderung_pct": prozent(bestand, alt) if hat_vorjahr else None,
        })

    if kaputte:
        warnen(
            f"{len(kaputte)} Kartenregionen mit unbrauchbarer Geometrie: "
            f"{kaputte} — sie bleiben auf der Karte grau, ihre Werte stehen "
            f"weiterhin in den Tabellen"
        )
    if fehlende_geo:
        warnen(f"Bezirkskennziffern ohne Geometrie: {sorted(set(fehlende_geo))}")
    if fehlende_daten:
        warnen(f"Kartenregionen ohne AMS-Daten: {fehlende_daten}")

    # Gegenprobe: Deckt die Karte alle AMS-Bezirke ab?
    zugeordnet = {c for _, rl, _ in config.KARTENREGIONEN for c in rl}
    unzugeordnet = set(jetzt_je_rgs.index) - zugeordnet
    if unzugeordnet:
        warnen(
            f"{len(unzugeordnet)} AMS-Bezirke fehlen in KARTENREGIONEN: "
            f"{sorted(unzugeordnet)} — ihre Zahlen erscheinen nicht auf der Karte"
        )

    summe_karte = sum(w["bestand"] for w in werte)
    log(f"    {len(merkmale)} Kartenregionen · Summe {summe_karte:,}")
    return (
        {"type": "FeatureCollection", "features": merkmale},
        {"stand": stand, "regionen": werte},
    )


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
    alter = lade_altersdaten(mapping)
    quoten = hole_eurostat()
    ausgaben = baue_ausgaben(daten, mapping, quoten, alter)

    log("\n[5b/6] Zusatzauswertungen")
    for name, wert in [
        ("fluss",     baue_fluss(daten)),
        ("dauer",     baue_dauer(LZBL.get("tabelle"))),
        ("schulung",  baue_schulung(mapping)),
        ("eu",        hole_eurostat_vergleich()),
        ("stellen",   baue_stellen(daten, mapping)),
        ("branche",   baue_branche()),
    ]:
        if wert:
            ausgaben[name] = wert
            log(f"    ✓ {name}.json")

    # Gegenprobe: Arbeitslose + Schulungen = vorgemerkte Personen
    if "schulung" in ausgaben:
        vorgemerkt = ausgaben["kpi"]["arbeitslose_gesamt"] + ausgaben["schulung"]["bestand"]
        ausgaben["kpi"]["schulung"] = ausgaben["schulung"]["bestand"]
        ausgaben["kpi"]["vorgemerkt_gesamt"] = vorgemerkt
        log(f"    Vorgemerkte Personen gesamt: {vorgemerkt:,}")

    monate = sorted(daten["datum"].unique())
    letzter, vorjahr = monate[-1], monate[-1] - pd.DateOffset(years=1)
    jetzt_rgs = daten[daten["datum"] == letzter].groupby("rgscode")["bestand"].sum()
    vorjahr_rgs = (
        daten[daten["datum"] == vorjahr].groupby("rgscode")["bestand"].sum()
        if vorjahr in monate else None
    )
    try:
        geo, karte = baue_kartenregionen(
            jetzt_rgs, vorjahr_rgs, mapping, pd.Timestamp(letzter).strftime("%Y-%m-%d")
        )
    except Exception as fehler:
        warnen(
            f"Karte konnte nicht erzeugt werden ({type(fehler).__name__}: {fehler}) — "
            f"alle Werte stehen weiterhin in den Tabellen"
        )
        geo, karte = None, None

    log("\nSchreiben")
    for name, inhalt in ausgaben.items():
        schreibe(name, inhalt)
    if geo:
        schreibe("karte_geo", geo)
        schreibe("karte", karte)

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
                "url": "https://data.statistik.gv.at/web/catalog.jsp",
                "lizenz": "CC BY 4.0",
            },
        ],
        "hinweis_definitionen": (
            "AMS-Zahlen sind beim AMS registrierte Arbeitslose (nationale "
            "Definition, monatlich, ohne Schulungsteilnehmer:innen). Die Quoten "
            "stammen aus der EU-weiten Arbeitskräfteerhebung (ILO-Definition, "
            "jährlich) und sind mit den AMS-Absolutzahlen nicht direkt "
            "verrechenbar."
        ),
        "hinweis_bezirke": (
            "Die Bezirksangaben sind AMS-Geschäftsstellenbezirke (RGS), nicht "
            "politische Bezirke. Die beiden Nummernsysteme unterscheiden sich: "
            "RGSCode 102 ist Mattersburg, Bezirkskennziffer 102 ist Rust. Wien "
            "ist beim AMS in rund 15 Geschäftsstellen aufgeteilt. Die Karte "
            "zeigt daher Bundesländer; Bezirkswerte stehen in der Tabelle."
        ),
        "einbettung": config.EINBETTUNG,
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
