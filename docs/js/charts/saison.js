/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: saison
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        diagramme, schrift, istSchmal } = AMS;

/* --- 21 — „Zwei Österreichs": Saisonfigur je Bundesland ---------------
   Neun kleine Liniendiagramme, eines je Bundesland, alle auf DERSELBEN
   y-Achse. Nur so sind die Formen vergleichbar — und die Form ist hier
   die ganze Aussage: ein Berg im Jahr gegen zwei.

   WOHER DIE DATEN KOMMEN: aus `bundeslaender.json`, das ohnehin geladen
   wird. Kein eigenes ETL-Modul, kein zweiter Download, keine neue Datei
   im Auslieferungspfad. Die Saisonfigur wird hier im Browser gerechnet.

   RECHENWEG — Verhältnis zum gleitenden Zwölfmonatsdurchschnitt.
   Für jeden Monat wird ein ZENTRIERTER 12-Monats-Durchschnitt als Trend
   gebildet (halbe Gewichte an den beiden Rändern, weil 12 gerade ist) und
   der Monatswert daran gemessen. Der Mittelwert je Kalendermonat ist die
   Saisonfigur.

   WARUM NICHT „Abweichung vom Jahresmittel": Die Sparklines umfassen 36
   Monate, davon sind nur ZWEI vollständige Kalenderjahre. Ein Jahresmittel
   traegt den Anstieg der Reihe mit — die Figur bekommt dadurch am
   Jahresanfang zu wenig und in der Jahresmitte zu viel. Nachgemessen an
   der langen Reihe (`zeitreihe.json`, 91 Monate, Corona-Jahre heraus):
   der gleitende Durchschnitt weicht im Mittel 1,7 Prozentpunkte ab, das
   Jahresmittel 2,4. Fuer Frauen 0,8 gegen 2,7.

   GRENZE, DIE MAN KENNEN MUSS: Aus 36 Monaten bleiben 24 mit gueltigem
   Trend, also GENAU ZWEI Beobachtungen je Kalendermonat. Die Figur ist
   belastbar in der Form, nicht in der zweiten Nachkommastelle. Deshalb
   steht im Diagramm kein Wert, sondern nur der Monat der Jahresspitze.

   GRUPPIERUNG IST DATENGETRIEBEN, NICHT VERDRAHTET. Ein Land gehoert zum
   Zwischensaisontyp, wenn BEIDE Zwischensaisonmonate — April und
   November — ueber dem Jahrestrend liegen. Wuerde sich ein Land kuenftig
   anders verhalten, wandert es von selbst in die andere Gruppe, und auch
   die Beispiele im Hinweistext werden aus den Daten geschrieben.

   WARUM NICHT „Jahresspitze im Dezember oder Jaenner": Diese Regel war der
   erste Anlauf und wurde in der Abnahme verworfen. Sie haette Salzburg zum
   Wintertyp erklaert, weil dort der Jaenner (+17,4 %) den April (+16,8 %)
   um 0,6 Prozentpunkte schlaegt — eine Entscheidung auf Rauschen, bei nur
   zwei Beobachtungen je Monat. Salzburgs Figur hat in Wahrheit drei
   Buckel und ein Sommertief von −18 %; das ist Tourismus, kein Winterberg.
   Die Regel „beide Zwischensaisonen ueber dem Trend" trennt dieselben
   Daten mit 10,4 Prozentpunkten Abstand: schwaechster Ja-Fall Vorarlberg
   (April +6,8), staerkster Nein-Fall Kaernten (April −3,6).

   DASS SALZBURGS PUNKT AUF DEM JAENNER SITZT, IST KEIN FEHLER. Markiert
   wird der hoechste Monat, und der ist dort tatsaechlich der Jaenner —
   Salzburg traegt Bau UND Tourismus. Die drei Buckel der Linie zeigen das
   deutlicher, als eine geglaettete Zuordnung es koennte.

   JEDE GRUPPE HAT IHREN EIGENEN TON. Erste Fassung liess alle neun Linien
   gleich aussehen und ueberliess die Trennung den beiden
   Gruppenueberschriften. User-Befund 20.08.: „Zwei Oesterreichs" ist dann
   irrefuehrend, weil man drei Reihen und drei Spalten sieht und keine zwei
   Gruppen. Zu Recht — die Einteilung ist die Aussage, sie gehoert in die
   Grafik und nicht nur in die Beschriftung.

   ZWEITE FASSUNG WAR ZWEI GRAUTOENE (`--viz-series-1` / `--viz-series-6`)
   UND HAT NICHT GEREICHT. Nachgerechnet lagen sie zueinander hell bei
   4,18 : 1, dunkel aber nur bei 2,77 : 1 — unter der Grafikschwelle. Der
   Kommentar an dieser Stelle hat das als unvermeidlich beschrieben
   („kein Paar der Palette schafft beides"), und in Grautoenen stimmt das
   auch: gemessen ueber die ganze Palette bleibt allein `--viz-seq-4` in
   beiden Modi zugleich ueber 3 : 1 zur Flaeche und ueber 3 : 1 zur ersten
   Gruppe, und der Ton ist bereits die Nulllinie. User-Entscheid 20.08.
   deshalb: ein echter Farbton statt einer weiteren Graustufe.

   NEU: `--viz-akzent`, ein KATEGORIALES Token, keine Statusfarbe.
   Bewusst nicht `--viz-kritisch` oder `--viz-gut` — die beiden einzigen
   vorhandenen Farbtoken bedeuten „schlecht" und „gut", und der
   Zwischensaisontyp ist weder das eine noch das andere. Werte je
   Auslieferung, weil die drei Paletten verschieden sind:

     monochrom (index.html, idl.css)  hell #1e738f   dunkel #4396b1
     bunt (embed.html)                hell #bf4d1a   dunkel #eb6834

   Nachgerechnet gegen die jeweilige Kartenflaeche: 5,38 / 4,92 monochrom,
   4,77 / 5,44 bunt — alle vier ueber 4,5 : 1, denn die Gruppenueberschrift
   traegt denselben Ton und ist TEXT, nicht nur Grafik. Gegen Gruppe 1
   monochrom hell 3,68 : 1 und dunkel 2,79 : 1.

   DASS DER DUNKELWERT MIT 2,79 UNTER 3 LIEGT, IST HIER KEIN MANGEL MEHR.
   Die Schwelle gilt fuer Serien, die sich EINE Zeichenflaeche teilen und
   nur ueber die Helligkeit auseinanderzuhalten sind. Hier steht in jedem
   der neun Felder genau eine Linie, die Gruppen liegen in getrennten
   Zeilenbloecken, und die Trennung laeuft ueber den Farbton — der ist
   unabhaengig von der Helligkeit und traegt auch dort, wo 2,79 : 1 nicht
   traegt. In der bunten Palette ist das ohnehin das Bauprinzip: sie trennt
   ueber Farbabstand (dE 8 bei Deuteranopie), nicht ueber Kontrast.

   Getragen wird die Trennung damit vierfach: Farbton, Fuellung,
   Zeilenblock und Gruppenueberschrift — und die traegt denselben Ton wie
   ihre Linien, womit die Zuordnung ohne Legende lesbar ist. */

const MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun",
                "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONATE_LANG = ["Jänner", "Februar", "März", "April", "Mai", "Juni",
                     "Juli", "August", "September", "Oktober", "November", "Dezember"];

/* Mindestens so viele Monate, damit jeder Kalendermonat wenigstens einmal
   einen gueltigen Trendwert bekommt: 12 Monate fallen an den Raendern weg. */
const MIN_MONATE = 24;

/* Saisonfigur eines Landes. Gibt 12 Werte in Prozent zurueck (Index 0 =
   Jaenner) oder null, wenn die Reihe zu kurz ist. */
function figur(monate, werte) {
  const n = werte.length;
  if (!n || n !== monate.length || n < MIN_MONATE) return null;
  const nach = Array.from({ length: 12 }, () => []);
  for (let i = 6; i < n - 6; i++) {
    let summe = 0;
    for (let k = i - 5; k <= i + 5; k++) summe += werte[k];
    const trend = (0.5 * werte[i - 6] + summe + 0.5 * werte[i + 6]) / 12;
    if (!trend) continue;
    const m = parseInt(monate[i].slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) nach[m].push((werte[i] / trend - 1) * 100);
  }
  if (nach.some((liste) => liste.length === 0)) return null;
  return nach.map((liste) => liste.reduce((a, b) => a + b, 0) / liste.length);
}

function baueSaison(daten) {
  const S = schrift();
  const feld = document.getElementById("c-saison");
  if (!feld) return;
  const abschnitt = document.getElementById("s-saison");

  const monate = daten?.sparkline_monate ?? [];
  const laender = (daten?.laender ?? [])
    .map((L) => ({ name: L.name, werte: figur(monate, L.sparkline ?? []) }))
    .filter((L) => L.werte);

  /* Zu kurze oder fehlende Reihe: Abschnitt bleibt weg, statt eine leere
     Karte stehen zu lassen. Das Inline-`display:none` bleibt dann stehen
     und Abschnitt 39.10 im CSS versteckt die Karte. */
  if (laender.length < 2) return;

  for (const L of laender) {
    L.spitze = L.werte.indexOf(Math.max(...L.werte));
    L.tief = L.werte.indexOf(Math.min(...L.werte));
    L.amplitude = L.werte[L.spitze] - L.werte[L.tief];
    /* Zwischensaisontyp: April (3) UND November (10) ueber dem Trend.
       Begruendung im Kopfkommentar. */
    L.winter = !(L.werte[3] > 0 && L.werte[10] > 0);
  }

  const gruppen = [
    { name: "Ein Berg im Jahr — der Winter",
      kurz: "Wintertyp",
      laender: laender.filter((L) => L.winter) },
    { name: "Zwei Berge im Jahr — die Zwischensaisonen",
      kurz: "Zwischensaisontyp",
      laender: laender.filter((L) => !L.winter) },
  ].filter((g) => g.laender.length);
  for (const g of gruppen) g.laender.sort((a, b) => b.amplitude - a.amplitude);

  if (abschnitt) abschnitt.style.display = "";

  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  /* --- Text ueber und unter der Grafik, aus den Daten geschrieben ------
     Die Beispiellaender werden NICHT verdrahtet: genommen wird je Gruppe
     das Land mit der groessten Amplitude. Aendert sich die Datenlage,
     aendert sich der Satz mit. */
  const beispiel = (g) => g && g.laender[0]
    ? `${g.laender[0].name} (${MONATE_LANG[g.laender[0].spitze]})` : "";
  const winterGruppe = gruppen.find((g) => g.kurz === "Wintertyp");
  const zwischen = gruppen.find((g) => g.kurz === "Zwischensaisontyp");

  setzeText("u-saison",
    `Abweichung vom gleitenden Zwölfmonatsdurchschnitt, ${monate.length} Monate`
    + ` bis ${monat(daten.stand)} · gleiche Skala in allen neun Feldern`);

  setzeText("h-saison",
    zwischen && winterGruppe
      ? `Der schlechteste Monat ist nicht überall derselbe: ${beispiel(winterGruppe)}`
        + ` gegen ${beispiel(zwischen)}. Wo der Bau den Takt vorgibt, gibt es einen`
        + ` Winterberg; wo der Tourismus ihn vorgibt, zwei Zwischensaisonen.`
      : "Abweichung vom eigenen Zwölfmonatstrend, je Bundesland.");

  /* --- Geometrie ------------------------------------------------------
     ECharts kennt keine Media Queries, deshalb wird hier in Pixeln
     gerechnet. `beiBreitenwechsel` in kern.js baut die Grafik neu, sobald
     sich die Breitenstufe aendert — die Zahlen unten gelten also immer
     fuer die Breite, die beim Bau gemessen wurde. */
  const schmal = istSchmal(feld);
  const spalten = schmal ? 1 : 3;
  const W = feld.clientWidth || 900;
  const H = feld.clientHeight || 520;

  const KOPF_GRUPPE = 26;   /* Zeile der Gruppenueberschrift */
  const KOPF_LAND = 18;     /* Zeile mit dem Landesnamen */
  const ACHSE_UNTEN = 20;   /* Platz fuer Jän/Apr/Jul/Okt */
  const ZEILEN_LUFT = 12;
  const RAND_LINKS = 32;    /* y-Beschriftung, nur in der ersten Spalte */
  const RAND_RECHTS = 8;
  const SPALTEN_LUFT = 16;

  const zeilenJeGruppe = gruppen.map((g) => Math.ceil(g.laender.length / spalten));
  const zeilenGesamt = zeilenJeGruppe.reduce((a, b) => a + b, 0);
  /* ZEILEN_LUFT einmal je ZEILE, nicht je Gruppenwechsel — die Schleife
     unten schlaegt sie auf jede Zeile auf.

     HIER LAG EIN FEHLER (gefunden 20.08. an der echten Seite): Die Formel
     rechnete `(zeilenGesamt - gruppen.length)`, die Schleife verteilte aber
     `zeilenGesamt`. Bei 620 px Feldhoehe fehlten dadurch 24 px, und die
     Monatsachse der untersten Reihe wurde abgeschnitten.

     Warum die Abnahme das nicht gefunden hat: Sie prueft, ob die GITTER im
     Feld liegen. Die Achsenbeschriftung steht aber UNTERHALB des Gitters
     und war in der Pruefung nicht enthalten. Die Pruefung rechnet jetzt
     ACHSE_UNTEN mit. */
  const fest = gruppen.length * KOPF_GRUPPE
    + zeilenGesamt * (KOPF_LAND + ACHSE_UNTEN + ZEILEN_LUFT);
  const plotHoehe = Math.max(44, (H - fest) / zeilenGesamt);

  const spaltenBreite =
    (W - RAND_LINKS - RAND_RECHTS - (spalten - 1) * SPALTEN_LUFT) / spalten;

  /* Gemeinsame y-Skala fuer ALLE Felder. Ohne sie waere jede Form auf
     ihre eigene Hoehe gestreckt und der Vergleich wertlos — Vorarlberg
     saehe aus wie Kaernten. Auf volle 10 gerundet, mit etwas Luft. */
  const alle = laender.flatMap((L) => L.werte);
  const stufe = 10;
  /* Eine halbe Stufe Luft nach oben. Ohne sie klebt der hoechste Punkt an
     der Skalenobergrenze, und seine Monatsbeschriftung wird ueber die
     Zeichenflaeche hinaus in die Titelzeile gedrueckt — am 20.08. bei
     Kaernten (+39,0 bei Obergrenze 40) auf der echten Seite passiert.
     Mit dem Zuschlag wird daraus eine Obergrenze von 50. */
  const yMax = Math.ceil((Math.max(...alle, 5) + stufe / 2) / stufe) * stufe;
  /* Die UNTERGRENZE wird auf ein Vielfaches der Schrittweite gerundet, nicht
     nur auf eine Stufe. ECharts setzt die Teilstriche von der Untergrenze aus:
     bei −30 und Schrittweite 20 laegen sie auf −30 / −10 / +10 — die NULL
     waere kein Teilstrich und bekaeme keine Beschriftung. Sie ist aber der
     Bezugspunkt jeder Ablesung („so viele wie im Zwoelfmonatsschnitt").
     Mit −40 als Untergrenze liegen die Striche auf −40 / −20 / 0 / +20 / +40. */
  const schritt = stufe * 2;
  const yMin = Math.floor((Math.min(...alle, -5) - stufe / 4) / schritt) * schritt;

  const grids = [];
  const xAchsen = [];
  const yAchsen = [];
  const serien = [];
  const titel = [];
  const reihenfolge = [];   /* fuer Tabelle und Tooltip */

  let y = 0;
  /* Ein Ton je Gruppe — Begruendung im Kopfkommentar. Die Zuordnung folgt
     der Reihenfolge in `gruppen`, nicht dem Namen: faellt eine Gruppe weg,
     rutscht die andere auf den ersten Ton und bleibt die kraeftigere. */
  const GRUPPENFARBEN = ["--viz-series-1", "--viz-akzent"];
  const farbeVon = (gi) => stil(GRUPPENFARBEN[gi % GRUPPENFARBEN.length]);
  /* Fuellung: Gruppe 1 bleibt auf der neutralen Rampe, Gruppe 2 nimmt ihren
     eigenen Ton. Der frueherer Kommentar hier sprach sich gegen zwei
     Fuelltoene aus („eine zweite Botschaft neben der Linienfarbe") — das
     galt, solange beide Gruppen Grautoene waren und die Fuellung nichts
     hinzufuegen konnte ausser Gewicht. Mit einem echten Farbton ist es
     umgekehrt: eine graue Flaeche unter einer farbigen Linie sieht aus wie
     ein Fehler. Die Fuellung sagt jetzt dasselbe wie die Linie, nur leiser. */
  const FUELLFARBEN = ["--viz-seq-3", "--viz-akzent"];
  const FUELLDECKUNG = [0.45, 0.18];

  gruppen.forEach((gruppe, gi) => {
    titel.push({
      text: gruppe.name.toUpperCase(),
      left: RAND_LINKS,
      top: y + 4,
      /* Die Ueberschrift traegt den Ton ihrer Linien. Damit ist die
         Zuordnung ohne Legende lesbar — und die Legende entfaellt. */
      textStyle: { color: farbeVon(gi), fontSize: S.achse,
                   fontWeight: 600, fontFamily: S.familie },
    });
    y += KOPF_GRUPPE;

    gruppe.laender.forEach((L, k) => {
      const spalte = k % spalten;
      const zeile = Math.floor(k / spalten);
      const links = RAND_LINKS + spalte * (spaltenBreite + SPALTEN_LUFT);
      const oben = y + zeile * (KOPF_LAND + plotHoehe + ACHSE_UNTEN + ZEILEN_LUFT);
      const index = grids.length;
      reihenfolge.push(L);

      titel.push({
        text: L.name,
        left: links,
        top: oben,
        textStyle: { color: stil("--viz-text-2"), fontSize: S.serie,
                     fontWeight: 600, fontFamily: S.familie },
      });

      grids.push({
        left: links, top: oben + KOPF_LAND,
        width: spaltenBreite, height: plotHoehe,
      });

      xAchsen.push({
        ...achse(), gridIndex: index, type: "category", data: MONATE,
        boundaryGap: false,
        axisLine: { lineStyle: { color: stil("--viz-axis"), width: 1 } },
        splitLine: { show: false },
        /* Nur jeder dritte Monat: zwoelf Kuerzel auf 260 px sind Brei. */
        axisLabel: { color: stil("--viz-muted"), fontSize: S.achse,
                     interval: (i) => i % 3 === 0, margin: 6 },
      });

      yAchsen.push({
        ...achse(), gridIndex: index, type: "value", min: yMin, max: yMax,
        /* Feste Schrittweite von zwei Stufen. Ohne sie zeichnet ECharts eine
           Linie je Stufe und laesst die Beschriftungen weg, die nicht mehr
           passen — sichtbar wurde daraus die Folge „+50, +40, +20, 0, −20",
           die wie ein Fehler aussieht. Mit `interval` sind Linie und Zahl
           wieder dasselbe Raster. */
        interval: schritt,
        axisLine: { show: false },
        /* Rasterlinien in ALLEN Feldern. Sie standen zuerst nur in der
           ersten Spalte, weil die Beschriftung dort steht — das sah aus,
           als fehle den Spalten 2 und 3 etwas (User-Befund 20.08.). Die
           Linien sind der Massstab, an dem die Form abgelesen wird; ohne
           sie ist ein Feld nicht mit dem Nachbarn vergleichbar. */
        splitLine: { show: true,
                     lineStyle: { color: stil("--viz-grid"), width: 1 } },
        /* Die ZAHLEN dagegen nur in der ersten Spalte — dreimal dieselbe
           Skala kostet Platz und sagt nichts Neues. */
        axisLabel: spalte === 0
          /* Rand-Beschriftungen aus: ECharts setzt zusaetzlich zu den
             Teilstrichen je eine Zahl an Unter- und Obergrenze. Die
             Obergrenze liegt hier eine halbe Schrittweite ueber dem letzten
             Teilstrich — daraus wurde die Folge „+50" direkt ueber „+40",
             die wie ein Fehler aussieht. Uebrig bleiben die echten
             Teilstriche: −20 / 0 / +20 / +40. */
          ? { color: stil("--viz-muted"), fontSize: S.achse,
              showMinLabel: false, showMaxLabel: false,
              formatter: (v) => (v > 0 ? "+" : "") + v }
          : { show: false },
      });

      serien.push({
        name: L.name, type: "line", xAxisIndex: index, yAxisIndex: index,
        data: L.werte, smooth: 0.25, showSymbol: true,
        /* Punkt nur auf der Jahresspitze — sie ist die Aussage. */
        symbol: "circle",
        symbolSize: (wert, p) => (p.dataIndex === L.spitze ? 7 : 0),
        itemStyle: { color: farbeVon(gi) },
        lineStyle: { color: farbeVon(gi), width: 1.8 },
        /* Fuellung je Gruppe — Begruendung bei FUELLFARBEN oben. */
        areaStyle: { color: stil(FUELLFARBEN[gi % FUELLFARBEN.length]),
                     opacity: FUELLDECKUNG[gi % FUELLDECKUNG.length], origin: 0 },
        /* Beschriftung der Jahresspitze. Sie steht ueber dem Punkt — ausser
           am linken oder rechten Rand: dort stiesse sie mit dem Landesnamen
           zusammen (bei Kaernten und Salzburg am 20.08. auf der echten
           Seite beobachtet, „Jaen" lag auf dem Titel). Am Rand weicht sie
           deshalb zur Seite aus, wo ohnehin Platz ist. */
        label: {
          show: true, distance: 4,
          position: L.spitze <= 1 ? "right" : (L.spitze >= 10 ? "left" : "top"),
          color: stil("--viz-text-2"), fontSize: S.achse, fontWeight: 600,
          formatter: (p) => (p.dataIndex === L.spitze ? MONATE[L.spitze] : ""),
        },
        /* Nulllinie: „so viele wie im Zwoelfmonatsschnitt". Sie ist der
           Bezugspunkt jeder Ablesung UND die Kante der Flaechenfuellung
           (`origin: 0`), muss also sichtbar sein.

           NICHT `--viz-axis` wie die uebrigen Achsen: der Token bringt
           hell nur 1,41 : 1 gegen die Kartenflaeche. Das reicht fuer eine
           Achse am Rand, nicht fuer eine Linie, an der abgelesen wird.
           `--viz-seq-4` liefert hell 3,03 : 1 und dunkel 4,55 : 1 — ueber
           der Grafikschwelle von 3 : 1 in beiden Modi. */
        markLine: {
          silent: true, symbol: "none", animation: false,
          data: [{ yAxis: 0 }],
          lineStyle: { color: stil("--viz-seq-4"), width: 1, type: "solid" },
          label: { show: false },
        },
      });
    });

    y += zeilenJeGruppe[gi] * (KOPF_LAND + plotHoehe + ACHSE_UNTEN + ZEILEN_LUFT);
  });

  d.setOption({
    ...basis(),
    title: titel,
    grid: grids,
    xAxis: xAchsen,
    yAxis: yAchsen,
    series: serien,
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-grid"), width: 1 } },
      formatter: (p) => {
        const eintrag = Array.isArray(p) ? p[0] : p;
        const L = reihenfolge.find((x) => x.name === eintrag.seriesName);
        const vz = eintrag.value > 0 ? "+" : "";
        return `<strong>${eintrag.seriesName}</strong> &middot; `
          + `${MONATE_LANG[eintrag.dataIndex]}<br>`
          + `${vz}${pz(eintrag.value)} % gegenüber dem Zwölfmonatsschnitt`
          + (L ? `<br><span style="color:${stil("--viz-muted")}">Jahresspitze: `
                 + `${MONATE_LANG[L.spitze]} &middot; Tiefpunkt: ${MONATE_LANG[L.tief]}`
                 + `</span>` : "");
      },
    },
  }, { replaceMerge: ["series", "xAxis", "yAxis", "grid", "title"] });

  setzeHtml("t-saison", tabelle(
    [{ titel: "Bundesland", wert: (z) => z.name },
     { titel: "Typ", wert: (z) => (z.winter ? "Wintertyp" : "Zwischensaisontyp") },
     { titel: "Jahresspitze", wert: (z) => MONATE_LANG[z.spitze] },
     { titel: "Tiefpunkt", wert: (z) => MONATE_LANG[z.tief] },
     { titel: "Amplitude", num: true, wert: (z) => pz(z.amplitude) + " Pp." },
     ...MONATE.map((m, i) => ({
       titel: m, num: true,
       wert: (z) => (z.werte[i] > 0 ? "+" : "") + pz(z.werte[i]),
     }))],
    reihenfolge
  ));
}

AMS.baueSaison = baueSaison;
})(window.AMS);
