"""
Themenstrang: Ausbildung — Laden der AMS-Ausbildungsdatei und Bau von
ausbildung.json (18 Stufen, 7 Gruppen, Verlaufs-Zeitreihe, je Bundesland).

Die Ausbildungsdatei ist zugleich die Kerndatei der Pipeline: Aus ihr
speisen sich auch KPI, Zeitreihe, Bezirke, Bundesländer und Fluss.

Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import pandas as pd

import config
from gemeinsam import (SCHEMA_REPORT, lade_ams_csv, log, monats_iso, prozent,
                       pruefe_spalten, warnen, zu_zahl)


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


def baue_ausbildung(daten: pd.DataFrame, ctx: dict) -> dict:
    """ausbildung.json: Stufen, Gruppen, Verlaufsreihe, je Bundesland."""
    jetzt, vorjahr = ctx["jetzt"], ctx["vorjahr"]
    gesamt_jetzt = float(jetzt["bestand"].sum())

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

    return {
        "stand": monats_iso(ctx["aktueller_monat"]),
        "gruppen": gruppen,
        "zeitreihe_gruppen": {
            "monate": [monats_iso(d) for d in letzte_monate.index],
            "serien": zeitreihe_gruppen,
        },
        "gruppen_je_bundesland": gruppen_je_bundesland,
        "stufen": stufen,
        "je_bundesland": je_bundesland,
        "zeitreihe": {
            "monate": [monats_iso(d) for d in reihe_ausb.index],
            "serien": {
                str(c): [int(v) for v in reihe_ausb[c].values]
                for c in reihe_ausb.columns
            },
        },
    }
