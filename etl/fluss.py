"""
Themenstrang: Zugänge und Abgänge (fluss.json)

Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import pandas as pd

import config
from gemeinsam import warnen

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
