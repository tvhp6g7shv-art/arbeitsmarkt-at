/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: karte
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme } = AMS;

/* --- 4 — Karte: Bezirksregionen, sequenzielle Skala hell → dunkel ----
   Die Flächen sind aus ganzen politischen Bezirken verschmolzen, damit die
   AMS-Zahlen exakt auf die Geometrie passen. Wo AMS-Region und Bezirk sich
   nicht decken (Wien, Graz, Linz), bildet die Karte die zusammengefasste
   Einheit ab — lieber gröber und richtig als fein und falsch. */
/* ECharts kennt nur Polygon und MultiPolygon. Die Geometriereparatur im ETL
   liefert bei kaputten Rändern aber eine GeometryCollection — Flächen plus
   die Linienreste, die beim Reparieren anfallen. ECharts sucht darin
   `coordinates`, findet nichts und wirft „Invalid geoJson format".
   Hier werden solche Sammlungen auf ihre Flächen reduziert. Das ETL macht
   dasselbe seit v12; diese Zeile hält auch ältere Datenstände am Leben. */
function flaechenNormalisieren(geo) {
  if (!geo?.features) return geo;
  const raus = (g) => {
    if (!g) return null;
    if (g.type === "Polygon" || g.type === "MultiPolygon") return g;
    if (g.type === "GeometryCollection") {
      const teile = (g.geometries ?? []).map(raus).filter(Boolean);
      if (!teile.length) return null;
      const ringe = teile.flatMap((t) =>
        t.type === "Polygon" ? [t.coordinates] : t.coordinates);
      return { type: "MultiPolygon", coordinates: ringe };
    }
    return null;
  };
  return {
    ...geo,
    features: geo.features
      .map((f) => ({ ...f, geometry: raus(f.geometry) }))
      .filter((f) => f.geometry),
  };
}

function baueKarte(karte, geo) {
  const feld = document.getElementById("c-karte");
  if (!karte || !geo) {
    /* Höhe zurücknehmen, sonst bleibt ein leerer Kasten stehen */
    feld.className = "";
    feld.style.height = "auto";
    feld.innerHTML = `<p class="viz-unterzeile" style="padding:4px 0 0">
      Die Karte ist gerade nicht verfügbar — die Werte stehen in der Tabelle
      „AMS-Bezirke“ weiter unten.</p>`;
    const knopf = document.querySelector('[data-ziel="t-karte"]');
    if (knopf) knopf.style.display = "none";
    return;
  }

  /* Die Karte zeigt die VERÄNDERUNG, nicht den Bestand. Der Bestand folgt
     im Wesentlichen der Einwohnerzahl — Wien ist groß, Rust ist klein, das
     weiß man vorher. Interessant ist, wo sich etwas bewegt. */
  const mitWert = karte.regionen.filter(
    (r) => r.veraenderung_pct !== null && r.veraenderung_pct !== undefined);
  const ohneWert = karte.regionen.length - mitWert.length;
  const spanne = Math.max(1, ...mitWert.map((r) => Math.abs(r.veraenderung_pct)));
  /* Symmetrisch um null runden, sonst wirkt eine Seite stärker als sie ist. */
  const grenze = Math.ceil(spanne * 2) / 2;

  const staerkster_rueckgang = [...mitWert].sort((a, b) => a.veraenderung_pct - b.veraenderung_pct)[0];
  const staerkster_anstieg = [...mitWert].sort((a, b) => b.veraenderung_pct - a.veraenderung_pct)[0];

  /* „Juli 2025" statt „Juli 2026 des Vorjahres" — Datum selbst zurückrechnen. */
  const vorjahresmonat = (() => {
    const dat = new Date(karte.stand);
    dat.setFullYear(dat.getFullYear() - 1);
    return dat.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  })();

  setzeText("u-karte",
    `Veränderung gegenüber ${vorjahresmonat} · ` +
    `Grün = Rückgang, Rot = Anstieg · ${karte.regionen.length} Regionen` +
    (ohneWert ? ` · ${ohneWert} ohne Vergleichswert` : ""));

  setzeText("h-karte",
    (staerkster_rueckgang && staerkster_anstieg
      ? `Stärkster Rückgang: ${staerkster_rueckgang.name} ` +
        `(${pz(staerkster_rueckgang.veraenderung_pct)} %). ` +
        `Stärkster Anstieg: ${staerkster_anstieg.name} ` +
        `(+${pz(staerkster_anstieg.veraenderung_pct)} %). `
      : "") +
    "Die Farbe zeigt nur die Richtung und Stärke der Veränderung. " +
    "Ein hoher Anstieg in einem kleinen Bezirk kann wenige hundert Personen " +
    "bedeuten — die absoluten Zahlen stehen in der Tabelle.");

  echarts.registerMap("at-bezirke", flaechenNormalisieren(geo));
  const d = echarts.init(feld, null, { renderer: "canvas" });
  const nachName = Object.fromEntries(karte.regionen.map((r) => [r.name, r]));
  const werte = karte.regionen.map((r) => ({
    name: r.name,
    value: r.veraenderung_pct === null || r.veraenderung_pct === undefined
      ? "-" : r.veraenderung_pct,
  }));

  d.setOption({
    ...basis(),
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const r = nachName[p.name];
        if (!r) return `${p.name}<br><span style="color:${stil("--viz-muted")}">keine Daten</span>`;
        const v = r.veraenderung_pct;
        return `<strong>${r.name}</strong><br>` +
          `<span style="color:${stil("--viz-muted")}">${r.bundesland ?? ""}</span><br>` +
          (v === null || v === undefined
            ? `<span style="color:${stil("--viz-muted")}">keine Vergleichszahl</span><br>`
            : `<span style="color:${v > 0 ? stil("--viz-kritisch") : stil("--viz-gut")}">` +
              `${v > 0 ? "▲ Anstieg" : "▼ Rückgang"} ${pz(Math.abs(v))} %</span><br>`) +
          `<span style="color:${stil("--viz-muted")}">${zahl(r.bestand)} Arbeitslose</span>`;
      },
    },
    visualMap: {
      type: "continuous",
      min: -grenze, max: grenze, left: 12, bottom: 14, orient: "vertical",
      itemWidth: 12, itemHeight: 150, calculable: true,
      /* Beschriftung sagt, was die Farbe bedeutet — sonst muss man raten,
         ob Grün „viel" oder „gut" heißt. */
      text: ["Anstieg", "Rückgang"],
      formatter: (v) => (v > 0 ? "+" : "") + pz(v) + " %",
      textStyle: { color: stil("--viz-muted"), fontSize: 11 },
      inRange: { color: [
        stil("--viz-div-gut-4"), stil("--viz-div-gut-3"), stil("--viz-div-gut-2"),
        stil("--viz-div-gut-1"), stil("--viz-div-neutral"),
        stil("--viz-div-schlecht-1"), stil("--viz-div-schlecht-2"),
        stil("--viz-div-schlecht-3"), stil("--viz-div-schlecht-4"),
      ] },
    },
    series: [{
      type: "map", map: "at-bezirke", data: werte,
      roam: true, aspectScale: 0.78,
      /* Kein layoutCenter/layoutSize (bis v19 ["56%","52%"] / "94%").
         Grund: ECharts bezieht ein prozentuales layoutSize auf die KÜRZERE
         Containerseite. Die Kartenfläche ist ~1100 px breit, per CSS aber auf
         470 px Höhe festgelegt — 94 % ergaben also 442 px, in die Österreich
         eingepasst wurde. Die Karte nutzte damit rund 40 % der Breite, der
         Rest blieb leer. Mehr Höhe hätte nichts geändert, die Prozentangabe
         bleibt an die Höhe gekettet. Ohne beide Angaben passt ECharts die
         Fläche selbst ein, nutzt die Breite und rechnet bei resize() neu. */
      left: 0, right: 0, top: 8, bottom: 8,
      itemStyle: { areaColor: stil("--viz-grid"), borderColor: stil("--viz-surface"), borderWidth: 0.8 },
      emphasis: { label: { show: false },
                  itemStyle: { borderColor: stil("--viz-text"), borderWidth: 1.5 } },
      select: { disabled: true },
    }],
  });
  diagramme.push(d);

  /* Tabelle nach Veränderung sortiert — stärkster Rückgang zuerst. Das ist
     dieselbe Frage, die die Karte stellt, nur in Zahlen. */
  setzeHtml("t-karte", tabelle(
    [{ titel: "Region", wert: (z) => z.name },
     { titel: "Bundesland", wert: (z) => z.bundesland ?? "–" },
     { titel: "ggü. Vorjahr", num: true,
       wert: (z) => z.veraenderung_pct === null || z.veraenderung_pct === undefined ? "–"
         : `${z.veraenderung_pct > 0 ? "+" : ""}${pz(z.veraenderung_pct)} %` },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) }],
    [...karte.regionen].sort((x, y) => {
      const a = x.veraenderung_pct, b = y.veraenderung_pct;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      return a - b;
    })
  ));
}

AMS.flaechenNormalisieren = flaechenNormalisieren;
AMS.baueKarte = baueKarte;
})(window.AMS);
