"""
Themenstrang: Regionen — Bezirks-Mapping, AMS-Bezirke, Bundesländer
Zuordnung RGSCode -> (Name, Bundesland) aus der LZBL-Datei sowie
bezirke.json und bundeslaender.json. Die LZBL-Tabelle wird für den
Strang dauer in gemeinsam.LZBL gesichert.


Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import config
from gemeinsam import (LZBL, lade_ams_csv, log, monats_iso, prozent,
                       pruefe_spalten, warnen)

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

def baue_bezirke(ctx: dict, mapping: dict) -> dict:
    """bezirke.json: AMS-Geschäftsstellenbezirke mit Vorjahresvergleich."""
    jetzt, vorjahr = ctx["jetzt"], ctx["vorjahr"]

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
    return {"stand": monats_iso(ctx["aktueller_monat"]), "bezirke": bezirke}


def baue_bundeslaender(daten, ctx: dict, quoten: dict) -> dict:
    """bundeslaender.json: Tabelle mit Sparklines und EU-Quote je Land."""
    vorjahresmonat = ctx["vorjahresmonat"]

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

    return {
        "stand": monats_iso(ctx["aktueller_monat"]),
        "sparkline_monate": [monats_iso(d) for d in letzte.index],
        "laender": laender,
    }
