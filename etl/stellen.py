"""
Themenstrang: Offene Stellen und Stellenandrang (stellen.json)

Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import pandas as pd

import config
from gemeinsam import lade_optional, warnen, zu_zahl

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
