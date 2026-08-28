/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: festspiele
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.

   Gezeigt wird EINE Sache: In welchem Monat meldet sich die Kulturbranche
   arbeitslos? Drei Linien über zwölf Monate, Abweichung vom jeweiligen
   Jahresmittel.

   WARUM DREI LINIEN UND NICHT EINE. Die Salzburger Kurve allein sagt nichts —
   eine Septemberspitze könnte der Kalender der Branche sein oder die
   Saisonalität der Region. Erst die beiden Kontrolllinien trennen das:
   das übrige Österreich (gleiche Branche, andere Region) hat seine Spitze im
   Juli, Salzburg über alle Branchen (gleiche Region, andere Branche) im
   Jänner. Beide Kontrollen gehören ins Bild, sonst muss man sie glauben.

   WARUM „ÖSTERREICH OHNE SALZBURG" UND NICHT „ÖSTERREICH". Der Landeswert
   enthält Salzburg mit rund einem Zehntel der Septemberzugänge; die
   Vergleichslinie zöge sich zum eigenen Befund hin. Das Herausrechnen
   passiert im ETL, nicht hier.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        diagramme, schrift, istSchmal, legende } = AMS;

/* Drei Stufen derselben monochromen Rampe, keine Kategorienfarben.
   Serie 1/2/3 ist die einzige Dreierstufung, die in beiden Auslieferungen
   trägt — die Reihenfolge der Serientöne ist je Palette verschieden.
   Die gestrichelte dritte Linie ist Kontext, nicht Gegenspieler; der Strich
   trägt diese Rolle unabhängig von der Farbwahrnehmung. */
const LINIEN = [
  { schluessel: "salzburg", name: "Salzburg · Kultur",              farbe: "--viz-series-1", breite: 2.5, typ: "solid"  },
  { schluessel: "rest",     name: "Österreich ohne Salzburg · Kultur", farbe: "--viz-series-2", breite: 1.8, typ: "solid"  },
  { schluessel: "alle",     name: "Salzburg · alle Branchen",        farbe: "--viz-series-3", breite: 1.5, typ: "dashed" },
];

function baueFestspiele(daten) {
  const S = schrift();
  if (!daten?.saison?.salzburg?.length) return;

  const abschnitt = document.getElementById("s-festspiele");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-festspiele");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const M = daten.monatsnamen;
  const jahre = daten.jahre_verwendet;

  /* Die Jahresliste gehört in die Unterzeile, nicht in den Hinweis: Wer die
     Kurve liest, muss sofort sehen, worüber gemittelt wurde. Zusammengefasst
     als Spanne, wo die Jahre lückenlos sind — „2019, 2022–2025" statt sechs
     Zahlen. */
  setzeText("u-festspiele",
    "Zugänge in die Arbeitslosigkeit · Abweichung vom jeweiligen Jahresmittel · "
    + jahresSpanne(jahre));
  setzeText("h-festspiele", daten.hinweis ?? "");

  /* Nur der höchste Punkt jeder Linie bekommt ein Symbol. Zwölf Punkte je
     Linie mal drei Linien sind 36 Kreise auf einer Fläche, auf der es um
     drei Spitzen geht. */
  const punkte = (werte) => {
    const max = Math.max(...werte);
    return werte.map((w) => (w === max ? 5 : 0));
  };

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 20, top: 40, bottom: 8, containLabel: true },
    legend: legende(feld, {
      top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 3, itemGap: 18,
      data: LINIEN.map((l) => l.name),
      textStyle: { color: stil("--viz-text-2"), fontSize: S.serie },
    }),
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-axis"), width: 1 } },
      formatter: (p) => `<strong>${vollerMonat(p[0].dataIndex)}</strong><br>` +
        p.map((r) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>` +
          `${r.value > 0 ? "+" : ""}${pz(r.value)} %</strong>`).join("<br>"),
    },
    xAxis: { ...achse(), type: "category", boundaryGap: false, data: M,
      splitLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse,
        formatter: (v) => (v > 0 ? "+" : "") + v + " %" } },
    series: LINIEN.map((l) => ({
      name: l.name, type: "line", data: daten.saison[l.schluessel],
      symbol: "circle", symbolSize: punkte(daten.saison[l.schluessel]),
      lineStyle: { width: l.breite, color: stil(l.farbe), type: l.typ },
      itemStyle: { color: stil(l.farbe),
                   borderColor: stil("--viz-surface"), borderWidth: 2 },
      emphasis: { focus: "series" },
    })),
  }, { replaceMerge: ["series"] });

  setzeHtml("t-festspiele", tabelle(
    [{ titel: "Jahr", wert: (z) => z.jahr + (z.pandemie ? " *" : "") },
     { titel: "Zugänge September", num: true, wert: (z) => zahl(z.sep_zugang) },
     { titel: "Anteil am Jahr", num: true, wert: (z) => pz(z.anteil) + " %" },
     { titel: "Bestand Mai", num: true, wert: (z) => zahl(z.mai_bestand) },
     { titel: "Bestand September", num: true, wert: (z) => zahl(z.sep_bestand) },
     { titel: "Veränderung", num: true,
       wert: (z) => (z.veraenderung > 0 ? "+" : "") + z.veraenderung + " %" },
     { titel: "Stärkster Monat", wert: (z) => z.spitzenmonat }],
    daten.jahre.slice().reverse()
  ) + `<p class="viz-unterzeile" style="margin-top:8px">* Pandemiejahr — in der `
    + `Kurve oben nicht enthalten, in der Tabelle aber gezeigt.</p>`);
}

/* „2019, 2022–2025" statt „2019, 2022, 2023, 2024, 2025". Lückenlose
   Abschnitte werden zusammengezogen, Einzeljahre bleiben stehen. */
function jahresSpanne(jahre) {
  const teile = [];
  let start = jahre[0], vorher = jahre[0];
  for (let i = 1; i <= jahre.length; i++) {
    if (jahre[i] === vorher + 1) { vorher = jahre[i]; continue; }
    teile.push(start === vorher ? String(start) : `${start}–${vorher}`);
    start = vorher = jahre[i];
  }
  return teile.join(", ");
}

const MONATE_LANG = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli",
                     "August", "September", "Oktober", "November", "Dezember"];
const vollerMonat = (i) => MONATE_LANG[i] ?? "";

AMS.baueFestspiele = baueFestspiele;
})(window.AMS);
