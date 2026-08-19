/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: verfestigung
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        diagramme, schrift,
        istSchmal, balkenGitter, kategorieLabel, legende,
        hoverDunkler } = AMS;

/* --- 20 — Vormerkdauer je Altersgruppe -------------------------------
   Zehn liegende Balken, auf 100 % normiert, je drei Dauerklassen.

   ABWEICHUNG VON DER REGEL IN dauer.js: Dort steht „geordnete Kategorien,
   deshalb eine Farbe" — richtig für einen einfachen Balken, wo die Länge
   die Größe trägt. Hier liegen drei Klassen im selben Balken; sie brauchen
   zwingend eigene Flächen. Gewählt sind zwei Stufen der sequenziellen Rampe
   für den Kontext und `--viz-kritisch` für „über 1 Jahr" — die Klasse, um
   die es geht. Damit bleibt die Rangordnung sichtbar UND die Aussage
   springt heraus. Im Dashboard ist die Rampe grau, in embed.html blau;
   beide Male trägt dieselbe Signalfarbe die letzte Klasse.

   KEINE BESCHRIFTUNG IN DEN SEGMENTEN. Bei „unter 20" ist das lange
   Segment 0,3 % breit — dort passt keine Zahl hinein, und eine Zahl, die
   nur manchmal erscheint, liest sich als Fehler. Der eine Wert, auf den es
   ankommt, steht rechts außerhalb des Balkens. */

const FARBEN = ["--viz-seq-2", "--viz-seq-4", "--viz-kritisch"];

function baueVerfestigung(daten) {
  const S = schrift();
  if (!daten?.gruppen?.length) return;
  const abschnitt = document.getElementById("s-verfestigung");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-verfestigung");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const gruppen = daten.gruppen;
  const klassen = daten.klassen.map((k) => k.name);

  setzeText("u-verfestigung",
    `Anteil je Altersgruppe nach Dauer der Vormerkung · Stand ${monat(daten.stand)}`);
  setzeText("h-verfestigung", daten.hinweis ?? "");

  /* Die letzte Klasse trägt die Endbeschriftung. Sie steht rechts außen und
     zeigt denselben Wert wie das Segment — nur lesbar. */
  const letzte = klassen.length - 1;

  d.setOption({
    ...basis(),
    grid: balkenGitter(feld, { left: 96, right: 76 }),
    legend: legende(feld, { top: 0, left: 0, itemWidth: 11, itemHeight: 11,
      itemGap: 14, data: klassen,
      textStyle: { color: stil("--viz-text-2"), fontSize: S.serie } }),
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: stil("--viz-grid"), opacity: 0.35 } },
      formatter: (p) => {
        const g = gruppen[p[0].dataIndex];
        return `<strong>${g.alter} Jahre</strong> &middot; ${zahl(g.bestand)} Personen<br>` +
          p.map((r, i) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>` +
            `${pz(r.value)} %</strong> <span style="color:${stil("--viz-muted")}">` +
            `(${zahl(g.werte[i])})</span>`).join("<br>");
      },
    },
    xAxis: { ...achse(), type: "value", max: 100, axisLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"),
                   fontSize: S.achse, formatter: (v) => v + " %" } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: gruppen.map((g) => g.alter), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: S.serie, width: 82,
                   overflow: "truncate", margin: 12,
                   ...kategorieLabel(feld, 96, gruppen.length) } },
    series: klassen.map((name, k) => ({
      name, type: "bar", stack: "dauer", barWidth: "62%",
      data: gruppen.map((g) => g.anteile[k]),
      itemStyle: {
        color: stil(FARBEN[k]),
        /* Rundung nur an den Aussenkanten des gestapelten Balkens. */
        borderRadius: k === 0 ? [4, 0, 0, 4] : (k === letzte ? [0, 4, 4, 0] : 0),
      },
      emphasis: hoverDunkler(stil(FARBEN[k])),
      label: k === letzte
        ? { show: true, position: "right", distance: 8,
            color: stil("--viz-text-2"), fontSize: S.label,
            formatter: (p) => pz(p.value) + " %" }
        : { show: false },
    })),
  }, { replaceMerge: ["series", "yAxis", "legend"] });

  setzeHtml("t-verfestigung", tabelle(
    [{ titel: "Alter", wert: (z) => z.alter + " Jahre" },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) },
     ...daten.klassen.map((k, i) => ({
       titel: k.name, num: true,
       wert: (z) => pz(z.anteile[i]) + " %",
     })),
     { titel: "davon über 1 Jahr", num: true,
       wert: (z) => zahl(z.werte[z.werte.length - 1]) }],
    gruppen
  ));
}

AMS.baueVerfestigung = baueVerfestigung;
})(window.AMS);
