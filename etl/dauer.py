"""
Themenstrang: Vormerkdauer und Langzeitbeschäftigungslosigkeit (dauer.json)
Nutzt die von generationen.py gesicherte Vormerkdauer-Dimension
(gemeinsam.VORMERKDAUER) und die LZBL-Datei aus regionen.py
(gemeinsam.LZBL).


Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import re

import pandas as pd

import config
from gemeinsam import SCHEMA_REPORT, VORMERKDAUER, log, zu_zahl

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
