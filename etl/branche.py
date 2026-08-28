"""
Themenstrang: Arbeitslosigkeit nach Wirtschaftszweig (branche.json)

Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import pandas as pd

from gemeinsam import lade_optional, log, prozent, spalte_finden, warnen, zu_zahl

def baue_branche(tabelle: pd.DataFrame | None = None) -> dict | None:
    """
    Arbeitslose nach Wirtschaftszweig — Bau und Leiharbeit laufen vor.

    `tabelle` wird seit v-festspiele von aussen hereingereicht: dieselbe
    Datei traegt zwei Auswertungen, und `lade_optional` hat keinen
    Zwischenspeicher — ohne Uebergabe wuerden 470 MB zweimal geladen.
    Ohne Argument verhaelt sich die Funktion wie vorher.
    """
    if tabelle is None:
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

    def zerlegen(roh: str) -> tuple[str, str]:
        """
        Die AMS-Bezeichnung lautet „O78200 - Überlassung von Arbeitskräften".
        Der ÖNACE-Schlüssel gehört nicht in die Achsenbeschriftung — er kostet
        Platz und sagt Lesenden nichts. Er bleibt als eigenes Feld erhalten,
        damit sich jede Zeile gegen die AMS-Quelle nachprüfen lässt.
        """
        text = str(roh).strip()
        code = ""
        if " - " in text:
            moeglich, rest = text.split(" - ", 1)
            moeglich = moeglich.strip()
            # Nur abtrennen, wenn es wirklich ein Schlüssel ist
            if len(moeglich) <= 8 and any(z.isdigit() for z in moeglich):
                code, text = moeglich, rest.strip()
        if text.upper() in ("K.A.", "KA", "K. A.", "UNBEKANNT", ""):
            text = "Ohne Angabe"
        return text, code

    eintraege = []
    for name, wert in jetzt.sort_values(ascending=False).items():
        klartext, code = zerlegen(name)
        eintraege.append({
            "name": klartext,
            "code": code,
            "bestand": int(wert),
            "veraenderung_pct": prozent(float(wert), float(alt.get(name, 0))),
        })
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
