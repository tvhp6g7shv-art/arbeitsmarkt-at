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

        def sortierung(bezeichnung: str) -> tuple[int, int]:
            """
            Nach TATSÄCHLICHER Dauer ordnen, gemessen in Tagen.

            Bis v20 nahm diese Funktion die erste Zahl im Namen — und
            sortierte damit falsch, weil Quartale und Jahre durcheinander
            gerieten:

                1 Quartal (bis 91 Tage)          -> 1
                2 Jahre (366 bis 731 Tage)       -> 2   ← landete vor
                2 Quartale (92 bis 183 Tage)     -> 2      „2 Quartale"
                ab 3 Jahre (mehr als 731 Tage)   -> 3   ← landete vor
                3 Quartale (184 bis 274 Tage)    -> 3      „3 Quartale"

            Die Tagesangabe in der Klammer ist die verlässliche Größe. Wir
            nehmen die höchste Zahl im Namen als Obergrenze. „mehr als 731"
            und „366 bis 731" ergeben dabei beide 731 — deshalb schiebt das
            zweite Tupelglied offene Endgruppen ("ab", "mehr als") hinter
            die geschlossene Gruppe mit derselben Obergrenze.
            """
            text = str(bezeichnung)
            zahlen = [int(z) for z in re.findall(r"\d+", text)]
            obergrenze = max(zahlen) if zahlen else 99999
            offen = 1 if re.search(r"\bab\b|mehr als", text, re.I) else 0
            return (obergrenze, offen)

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
