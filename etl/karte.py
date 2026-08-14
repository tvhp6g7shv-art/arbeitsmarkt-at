"""
Themenstrang: Bezirkskarte (karte.json, karte_geo.json)
Bezirksgeometrien laden, reparieren und gemäß config.KARTENREGIONEN
zu Kartenregionen verschmelzen.


Der Code ist unverändert aus build.py (v17) übernommen; seit v18 pro
Themenstrang in Module zerlegt.
"""

from __future__ import annotations

import json

import config
from gemeinsam import lade_bytes, log, prozent, warnen

def code_aus_merkmal(merkmal: dict) -> str:
    """
    Bezirkskennziffer eines WFS-Features bestimmen. Der Statistik-Austria-WFS
    liefert sie als Attribut `g_id`, ersatzweise steckt sie in der Feature-ID
    ("STATISTIK_AUSTRIA_POLBEZ_20250101.101").
    """
    eigenschaften = merkmal.get("properties") or {}
    for schluessel in ("g_id", "id"):
        wert = str(eigenschaften.get(schluessel, "")).strip()
        if wert:
            return wert
    kennung = str(merkmal.get("id", ""))
    return kennung.rsplit(".", 1)[-1].strip() if "." in kennung else ""


def baue_kartenregionen(jetzt_je_rgs, vorjahr_je_rgs, mapping: dict,
                        stand: str) -> tuple[dict | None, dict]:
    """
    Bezirksgeometrien laden und zu Kartenregionen verschmelzen.

    Warum verschmelzen: AMS-Geschäftsstellenbezirke und politische Bezirke
    decken sich nicht. Die Tabelle KARTENREGIONEN fasst beide Seiten zu
    Flächen zusammen, die aus ganzen Bezirken bestehen und deren AMS-Zahlen
    sich sauber addieren lassen.
    """
    log("\n[6/6] Bezirksgeometrien laden und verschmelzen")
    try:
        from shapely.geometry import shape, mapping as geo_mapping
        from shapely.ops import unary_union
        from shapely.validation import make_valid
    except ImportError:
        warnen("shapely fehlt — Karte entfällt, die Tabellen enthalten alle Werte")
        return None, {}

    try:
        geo = json.loads(lade_bytes(config.GEO_URL).decode("utf-8"))
    except SystemExit:
        warnen("Bezirksgrenzen nicht abrufbar — Karte entfällt")
        return None, {}

    formen = {}
    for merkmal in geo.get("features", []):
        code = code_aus_merkmal(merkmal)
        if code and merkmal.get("geometry"):
            formen[code] = shape(merkmal["geometry"])
    log(f"    {len(formen)} Flächen im Dienst (94 Bezirke + 23 Wiener Gemeindebezirke)")

    def bereinigen(geometrie):
        """
        Die Rohgeometrien enthalten vereinzelt ungültige Ränder
        (selbstüberschneidend, Splitterflächen). GEOS bricht darüber beim
        Verschmelzen ab. make_valid repariert das; buffer(0) ist der
        Rückfall für die Fälle, die make_valid leer zurückgibt.
        """
        if geometrie.is_valid:
            return geometrie
        repariert = make_valid(geometrie)
        if repariert.is_empty:
            repariert = geometrie.buffer(0)
        return repariert

    def nur_flaechen(geometrie):
        """
        make_valid() gibt bei kaputten Rändern eine GeometryCollection zurück:
        die reparierten Flächen PLUS die Linien und Punkte, die beim Reparieren
        übrig bleiben. ECharts kann damit nichts anfangen — es kennt nur
        Polygon und MultiPolygon und bricht mit „Invalid geoJson format" ab.
        Deshalb hier alles Nicht-Flächige wegwerfen und wieder zu einer
        einzigen Fläche zusammensetzen.
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
    fehlende_geo, fehlende_daten, kaputte = [], [], []

    for name, rgs_codes, bkz_codes in config.KARTENREGIONEN:
        teile = [formen[b] for b in bkz_codes if b in formen]
        if len(teile) != len(bkz_codes):
            fehlende_geo.extend(b for b in bkz_codes if b not in formen)
            continue

        # Eine kaputte Fläche darf den ganzen Lauf nicht mitreißen.
        try:
            flaeche = unary_union([bereinigen(g) for g in teile])
            flaeche = flaeche.simplify(0.0015, preserve_topology=True)
            flaeche = bereinigen(flaeche)
            flaeche = nur_flaechen(flaeche)
            if flaeche is None or flaeche.is_empty:
                kaputte.append(f"{name} (keine Fläche übrig)")
                continue
        except Exception as fehler:
            kaputte.append(f"{name} ({type(fehler).__name__})")
            continue
        bestand = float(sum(jetzt_je_rgs.get(c, 0) for c in rgs_codes))
        hat_vorjahr = vorjahr_je_rgs is not None
        alt = (float(sum(vorjahr_je_rgs.get(c, 0) for c in rgs_codes))
               if hat_vorjahr else 0.0)
        if not any(c in jetzt_je_rgs for c in rgs_codes):
            fehlende_daten.append(name)

        land = next(
            (mapping[c]["bundesland"] for c in rgs_codes if c in mapping), None
        )
        merkmale.append({
            "type": "Feature",
            "properties": {"name": name, "bundesland": land},
            "geometry": geo_mapping(flaeche),
        })
        werte.append({
            "name": name,
            "bundesland": land,
            "ams_bezirke": [mapping.get(c, {}).get("name", c) for c in rgs_codes],
            "bestand": int(bestand),
            "veraenderung_pct": prozent(bestand, alt) if hat_vorjahr else None,
        })

    if kaputte:
        warnen(
            f"{len(kaputte)} Kartenregionen mit unbrauchbarer Geometrie: "
            f"{kaputte} — sie bleiben auf der Karte grau, ihre Werte stehen "
            f"weiterhin in den Tabellen"
        )
    if fehlende_geo:
        warnen(f"Bezirkskennziffern ohne Geometrie: {sorted(set(fehlende_geo))}")
    if fehlende_daten:
        warnen(f"Kartenregionen ohne AMS-Daten: {fehlende_daten}")

    # Gegenprobe: Deckt die Karte alle AMS-Bezirke ab?
    zugeordnet = {c for _, rl, _ in config.KARTENREGIONEN for c in rl}
    unzugeordnet = set(jetzt_je_rgs.index) - zugeordnet
    if unzugeordnet:
        warnen(
            f"{len(unzugeordnet)} AMS-Bezirke fehlen in KARTENREGIONEN: "
            f"{sorted(unzugeordnet)} — ihre Zahlen erscheinen nicht auf der Karte"
        )

    summe_karte = sum(w["bestand"] for w in werte)
    log(f"    {len(merkmale)} Kartenregionen · Summe {summe_karte:,}")
    return (
        {"type": "FeatureCollection", "features": merkmale},
        {"stand": stand, "regionen": werte},
    )
