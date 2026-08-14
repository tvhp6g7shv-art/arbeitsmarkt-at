"""
Themenstrang: Übersicht — KPI-Zeile und Österreich-Zeitreihe
(kpi.json, zeitreihe.json)

Der Code ist unverändert aus build.py (v17, baue_ausgaben) übernommen;
seit v18 pro Themenstrang in Module zerlegt. Der Zeitrahmen (jetzt /
Vorjahr) kommt aus gemeinsam.zeitkontext().
"""

from __future__ import annotations

import pandas as pd

from gemeinsam import monats_iso, prozent


def baue_kpi(ctx: dict, quoten: dict) -> dict:
    """KPI-Zeile: Gesamtbestand, Geschlechter, EU-Quotenspanne."""
    jetzt, vorjahr = ctx["jetzt"], ctx["vorjahr"]

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

    return {
        "stand": monats_iso(ctx["aktueller_monat"]),
        "arbeitslose_gesamt": int(gesamt_jetzt),
        "vorjahr_gesamt": int(gesamt_vorjahr) if vorjahr is not None else None,
        "veraenderung_abs": int(gesamt_jetzt - gesamt_vorjahr) if vorjahr is not None else None,
        "veraenderung_pct": prozent(gesamt_jetzt, gesamt_vorjahr) if vorjahr is not None else None,
        "nach_geschlecht": {k: int(v) for k, v in nach_geschlecht.items()},
        "bezirke_anzahl": int(jetzt["rgscode"].nunique()),
        "quote_eu": quote_at,
    }


def baue_zeitreihe(daten: pd.DataFrame) -> dict:
    """Monatszeitreihe Österreich gesamt und nach Geschlecht."""
    reihe = daten.groupby("datum")["bestand"].sum().sort_index()
    reihe_geschlecht = (
        daten.groupby(["datum", "geschlecht"])["bestand"].sum().unstack(fill_value=0).sort_index()
    )
    return {
        "monate": [monats_iso(d) for d in reihe.index],
        "gesamt": [int(v) for v in reihe.values],
        "nach_geschlecht": {
            str(spalte): [int(v) for v in reihe_geschlecht[spalte].values]
            for spalte in reihe_geschlecht.columns
        },
    }
