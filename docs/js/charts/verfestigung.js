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

/* Drei Stufen einer Rampe, monochrom. Kein --viz-kritisch: das ist in
   idl.css als Statusfarbe deklariert („nur fuer Veraenderungen, immer mit
   Pfeil und Text"), hier waere es eine Kategorie — User-Entscheid 19.08.

   Nebeneffekt, der den Ausschlag gab: Rot (#f84444) und Mittelgrau
   (#8c8c8c) lagen bei 1,06 : 1, also praktisch gleich hell. Wer Rot-Gruen
   nicht unterscheidet, sah zwei gleiche Flaechen. Monochrom traegt die
   Helligkeit die Rangordnung selbst, das Problem entfaellt.

   Warum 3/5/6 und nicht 2/4/6: seq-2 gegen die weisse Karte ist 1,41 : 1,
   und bei „unter 20" besteht der Balken zu 97 % aus dieser Klasse — er las
   sich als leere Spur. seq-3 bringt 2,10 (hell) bzw. 2,47 (dunkel). */
const FARBEN = ["--viz-seq-3", "--viz-seq-5", "--viz-seq-6"];

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

  /* Die Zusammenlegung ab 60 gehoert hierher, nicht in den Hinweistext:
     u-verlauf haengt seinen Definitionshinweis genauso hinter das Datum. */
  setzeText("u-verfestigung",
    `Anteil je Altersgruppe nach Dauer der Vormerkung · Stand ${monat(daten.stand)}`
    + ` · ab ${daten.schwelle} zusammengefasst`);
  setzeText("h-verfestigung", daten.hinweis ?? "");

  /* Die letzte Klasse trägt die Endbeschriftung. Sie steht rechts außen und
     zeigt denselben Wert wie das Segment — nur lesbar. */
  const letzte = klassen.length - 1;

  d.setOption({
    ...basis(),
    /* `top: 46` ueberschreibt die 10 aus balkenGitter. Ohne das klebt die
       Legende am obersten Balken — bei den Diagrammen ohne Legende ist der
       kleine Rand richtig, hier nicht. verlauf.js loest dasselbe mit 34;
       hier braucht es etwas mehr, weil die Balken dicker sind. */
    grid: { ...balkenGitter(feld, { left: 96, right: 76 }), top: 46 },
    /* Legende buendig mit der Zeichenflaeche statt am Feldrand: sonst haengt
       sie ueber der Spalte der Altersbeschriftungen. Schmal uebernimmt
       `containLabel` den linken Rand, dort bleibt 0 richtig. */
    legend: legende(feld, { top: 0, left: istSchmal(feld) ? 0 : 96,
      itemWidth: 11, itemHeight: 11, itemGap: 14, data: klassen,
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
        /* 2-px-Fuge in Kartenfarbe zwischen den Segmenten.
           NICHT Zierrat, sondern der eigentliche Fix fuer die
           Unterscheidbarkeit: Mittelgrau und Rot liegen in der Helligkeit
           nah beieinander (hell 1,97 : 1, dunkel sogar nur 1,24 : 1), und
           mit festen Stufen der sequenziellen Rampe ist das nicht zu
           beheben — die Rampe kehrt im Dunkelmodus ihre Leserichtung um,
           was in einem Modus hilft und im anderen schadet.
           Die Fuge macht die Grenze unabhaengig von der Farbwahrnehmung
           sichtbar und wirkt in beiden Modi gleich. */
        borderColor: stil("--viz-surface"),
        borderWidth: 2,
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
