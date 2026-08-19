"""
Themenstrang: Generationen / Altersgruppen
Altersdaten laden, Altersgruppen zu Generationen zuordnen,
generationen.json bauen. Sichert nebenbei die Vormerkdauer-Dimension
(gemeinsam.VORMERKDAUER) für den Strang dauer.


Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import re

import pandas as pd

import config
from gemeinsam import (SCHEMA_REPORT, VORMERKDAUER, lade_ams_csv, log,
                       pruefe_spalten, prozent, spalte_finden, warnen, zu_zahl)

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
            "Das AMS liefert Altersgruppen, keine Geburtsjahrgänge. Jede wurde "
            "der Generation mit der größten Überschneidung zugeordnet — an den "
            "Rändern unscharf. Exakte Gruppen in der Tabelle."
        ),
        "generationen": eintraege,
        "je_bundesland": je_bundesland,
        "altersgruppen": altersgruppen,
        "zeitreihe": {
            "monate": [m(d) for d in reihe.index],
            "serien": {str(c): [int(v) for v in reihe[c].values] for c in reihe.columns},
        },
    }
