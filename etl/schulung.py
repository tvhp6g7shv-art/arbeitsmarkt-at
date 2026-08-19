"""
Themenstrang: Personen in Schulung (schulung.json)

Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import pandas as pd

from gemeinsam import lade_optional, prozent, warnen, zu_zahl
import config

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
            "vorgemerkt. Arbeitslose plus Schulungen ergibt die in Medien "
            "meist genannten „vorgemerkten Personen“."
        ),
        "bestand": int(aktuell),
        "veraenderung_pct": prozent(aktuell, alt) if alt else None,
        "monate": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in letzte.index],
        "werte": [int(v) for v in letzte.values],
    }
