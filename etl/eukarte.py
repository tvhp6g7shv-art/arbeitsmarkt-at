"""
Themenstrang: EU-Länderkarte (eukarte.json, eukarte_geo.json)

Zeigt die Veränderung der Arbeitslosenquote je EU-Mitgliedstaat gegenüber
dem Vorjahr, in Prozentpunkten.

Datenherkunft: keine eigene Abfrage. Die Länderwerte stammen aus dem Abruf
in eurostat.py (geoLevel=country) und liegen in gemeinsam.EU_QUOTEN.
Neu geladen wird hier nur die Geometrie.

Zwei Dinge, die diese Karte NICHT ist:

  * Sie ist nicht die Bezirkskarte auf EU-Ebene. Die Bezirkskarte zeigt die
    Veränderung des AMS-Bestands in Prozent — Personenzahlen nach nationaler
    Definition, monatlich. Diese Karte zeigt die Differenz zweier Quoten in
    Prozentpunkten, nach ILO-Definition, jährlich. Gleiche Bildsprache,
    andere Größe.

  * Sie ist nicht aktuell im Sinne der AMS-Zahlen. Eurostat liefert diese
    Reihe jährlich; die Karte hinkt der Monatsstatistik daher um bis zu
    zwei Jahre nach. Das Jahr steht deshalb in der Unterzeile.
"""

from __future__ import annotations

import json

import config
from gemeinsam import EU_QUOTEN, lade_bytes, log, warnen


def code_aus_merkmal(merkmal: dict) -> str:
    """
    Ländercode eines GISCO-Features bestimmen.

    Auf NUTS-Ebene 0 ist die NUTS-Kennung gleich dem Ländercode ("AT", "DE",
    "EL" für Griechenland — dieselbe Schreibweise, die Eurostat in
    lfst_r_lfu3rt verwendet). Der Zugriff ist absichtlich defensiv gestaffelt:
    ändert GISCO die Attributnamen, entsteht eine Warnung und eine graue
    Fläche, nicht ein falsch zugeordneter Wert.
    """
    eigenschaften = merkmal.get("properties") or {}
    for schluessel in ("NUTS_ID", "CNTR_CODE", "id", "FID"):
        wert = str(eigenschaften.get(schluessel, "")).strip().upper()
        if wert:
            return wert
    kennung = str(merkmal.get("id", "")).strip().upper()
    return kennung


def name_aus_merkmal(merkmal: dict, rueckfall: str) -> str:
    eigenschaften = merkmal.get("properties") or {}
    for schluessel in ("NAME_LATN", "NUTS_NAME", "NAME"):
        wert = str(eigenschaften.get(schluessel, "")).strip()
        if wert:
            return wert
    return rueckfall


def baue_eu_karte() -> tuple[dict | None, dict | None]:
    """
    Ländergeometrien laden, auf Europa zuschneiden, mit den Quoten verbinden.

    Gibt (geo, werte) zurück. Fällt etwas aus, kommt (None, None) — die
    Sektion bleibt dann im Frontend verborgen, das übrige Dashboard läuft
    unverändert weiter. Dasselbe Verhalten wie bei der Bezirkskarte.
    """
    log("\n[6b/6] EU-Ländergeometrien laden")

    if not EU_QUOTEN.get("laender"):
        warnen("Keine EU-Länderquoten vorhanden — EU-Karte entfällt")
        return None, None

    try:
        from shapely.geometry import box, shape, mapping as geo_mapping
        from shapely.ops import unary_union
        from shapely.validation import make_valid
    except ImportError:
        warnen("shapely fehlt — EU-Karte entfällt, die Werte stehen in der Tabelle")
        return None, None

    try:
        geo = json.loads(lade_bytes(config.EU_GEO_URL).decode("utf-8"))
    except SystemExit:
        warnen("EU-Ländergrenzen (GISCO) nicht abrufbar — EU-Karte entfällt")
        return None, None
    except Exception as fehler:
        warnen(f"EU-Ländergrenzen: {type(fehler).__name__} — EU-Karte entfällt")
        return None, None

    merkmale_roh = geo.get("features") or []
    if not merkmale_roh:
        warnen("GISCO-Antwort enthält keine Features — EU-Karte entfällt")
        return None, None

    formen, namen_geo = {}, {}
    for merkmal in merkmale_roh:
        code = code_aus_merkmal(merkmal)
        if code and merkmal.get("geometry"):
            formen[code] = shape(merkmal["geometry"])
            namen_geo[code] = name_aus_merkmal(merkmal, code)
    log(f"    {len(formen)} Länderflächen im Dienst")

    ausschnitt = box(*config.EU_KARTE_AUSSCHNITT)

    def bereinigen(geometrie):
        if geometrie.is_valid:
            return geometrie
        repariert = make_valid(geometrie)
        if repariert.is_empty:
            repariert = geometrie.buffer(0)
        return repariert

    def nur_flaechen(geometrie):
        """
        Wie bei der Bezirkskarte: ECharts kennt nur Polygon und MultiPolygon.
        make_valid() und das Zuschneiden können GeometryCollections mit
        Linien- und Punktresten liefern; die müssen weg, sonst bricht ECharts
        mit „Invalid geoJson format" ab.
        """
        art = geometrie.geom_type
        if art in ("Polygon", "MultiPolygon"):
            return geometrie
        if art == "GeometryCollection" or art.startswith("Multi"):
            teile = [t for t in geometrie.geoms
                     if t.geom_type in ("Polygon", "MultiPolygon") and not t.is_empty]
            if not teile:
                return None
            return unary_union(teile)
        return None

    merkmale, werte = [], []
    fehlende_geo, kaputte, beschnitten = [], [], []

    for eintrag in EU_QUOTEN["laender"]:
        code = eintrag["code"]
        if code not in formen:
            fehlende_geo.append(code)
            continue
        try:
            flaeche = bereinigen(formen[code])
            vorher = flaeche.area
            flaeche = flaeche.intersection(ausschnitt)
            if flaeche.is_empty:
                kaputte.append(f"{code} (liegt außerhalb des Ausschnitts)")
                continue
            if flaeche.area < vorher * 0.995:
                beschnitten.append(code)
            flaeche = flaeche.simplify(config.EU_KARTE_TOLERANZ, preserve_topology=True)
            flaeche = bereinigen(flaeche)
            flaeche = nur_flaechen(flaeche)
            if flaeche is None or flaeche.is_empty:
                kaputte.append(f"{code} (keine Fläche übrig)")
                continue
        except Exception as fehler:
            kaputte.append(f"{code} ({type(fehler).__name__})")
            continue

        # Der Name aus Eurostat ist deutsch beschriftet und damit die bessere
        # Wahl; GISCO liefert lateinische Eigennamen ("Österreich" vs.
        # "Osterreich"). Der Geometriename ist nur Rückfall.
        name = eintrag.get("name") or namen_geo.get(code, code)
        merkmale.append({
            "type": "Feature",
            "properties": {"name": name, "code": code},
            "geometry": geo_mapping(flaeche),
        })
        werte.append({
            "code": code,
            "name": name,
            "quote": eintrag["quote"],
            "quote_vorjahr": eintrag["quote_vorjahr"],
            "veraenderung_pp": eintrag["veraenderung_pp"],
        })

    if fehlende_geo:
        warnen(
            f"Mitgliedstaaten ohne Geometrie in GISCO: {sorted(fehlende_geo)} — "
            f"ihre Werte stehen weiterhin in der Tabelle. Falls die Liste lang "
            f"ist, haben sich die Attributnamen des Dienstes geändert."
        )
    if kaputte:
        warnen(f"EU-Flächen unbrauchbar: {kaputte}")
    if beschnitten:
        log(f"    Überseegebiete zugeschnitten bei: {sorted(beschnitten)}")

    if not merkmale:
        warnen("Keine brauchbare EU-Fläche übrig — EU-Karte entfällt")
        return None, None

    mit_wert = [w for w in werte if w["veraenderung_pp"] is not None]
    log(f"    {len(merkmale)} Länder · {len(mit_wert)} mit Vorjahresvergleich · "
        f"{EU_QUOTEN['vorjahr']} → {EU_QUOTEN['jahr']}")

    return (
        {"type": "FeatureCollection", "features": merkmale},
        {
            "definition": "Arbeitslosenquote nach ILO-Definition, 15–74 Jahre. "
                          "Veränderung in Prozentpunkten.",
            "quelle": "Eurostat lfst_r_lfu3rt · Geometrie: Eurostat GISCO (NUTS 2021)",
            "jahr": EU_QUOTEN["jahr"],
            "vorjahr": EU_QUOTEN["vorjahr"],
            "laender": werte,
        },
    )
