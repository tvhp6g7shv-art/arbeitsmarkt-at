/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: selbstaendige
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, basis, achse, tabelle, setzeText, setzeHtml,
        diagramme, schrift, istSchmal, hoverDunkler } = AMS;

/* --- 22 — Selbständig und arbeitslos: die Zahl, die niemand erhebt ----
   ZWEI PANELS, NICHT EINS. Der Abschnitt zeigt nicht eine Größe, sondern
   zwei voneinander unabhängige Stellen, an denen dieselbe Personengruppe
   aus der Statistik fällt. Beide in einen Balken zu zwingen wäre falsch:
   die Bezugsjahre (2015 / 2014), die Grundgesamtheiten (Erwerbstätige /
   Arbeitslose) und die Einheiten (Millionen / Personen) sind verschieden.
   Zwei Grids halten sie getrennt und trotzdem nebeneinander lesbar.

   WARUM AUF 100 % NORMIERT. 4,1 Mio. und 244.900 in einer gemeinsamen
   Werteachse ergäben einen Balken und einen Strich. Der Anteil ist hier
   ohnehin die Aussage; die Absolutwerte stehen in Tooltip und Tabelle.

   KEINE BESCHRIFTUNG IN DEN SEGMENTEN — Hausregel aus verfestigung.js.
   Das kleinste Segment ist 6,0 %, auf einem 380-px-Feld also rund 23 px.
   Eine Zahl, die nur bei breitem Fenster erscheint, liest sich als Fehler.

   FARBEN: monochrome Rampe, in beiden Panels läuft sie von hell nach
   dunkel, und in beiden trägt die DUNKELSTE Stufe die Gruppe, die im
   System nicht vorkommt. Das ist die einzige Farbregel dieses Abschnitts
   und sie gilt panelübergreifend. Kein --viz-kritisch: das ist in idl.css
   als Statusfarbe deklariert („nur für Veränderungen, immer mit Pfeil und
   Text"), hier wäre es eine Kategorie.

   WAS DIESER ABSCHNITT NICHT BEHAUPTET. Die 67.800 nicht vorgemerkten
   ILO-Arbeitslosen sind NICHT nach vorheriger Selbständigkeit
   aufgeschlüsselt — diese Aufschlüsselung existiert nicht. Statistik
   Austria nennt als Mechanismus „Personen ohne Leistungsanspruch haben
   nur eine geringe Motivation, sich zu melden". Das passt auf ehemals
   Selbständige, belegt aber keinen Anteil. Der Segmentname sagt deshalb
   „gar nicht beim AMS gemeldet", nicht „Selbständige". */

/* SPRACHE — User-Entscheid 19.08., nach einer Rückfrage am fertigen Bild.
   In Titeln, Untertiteln und Segmentnamen kommt KEIN Fachbegriff vor. Kein
   „Nenner", kein „ILO", kein „vorgemerkt". Der User dazu: „wir dürfen nicht
   davon ausgehen, dass die Menschen wissen was ILO-Definition ist."

   Erster Entwurf hieß oben „Wer im Nenner der Arbeitslosenquote steht" und
   unten „Arbeitslose nach ILO-Definition und ihr Status beim AMS" — beides
   setzt voraus, dass man die Konstruktion der Quote schon kennt. Jetzt trägt
   die ZAHL den Titel und der Untertitel erklärt die Messung im Klartext.
   Die Fachbegriffe stehen weiterhin in `erlaeuterung` (Tooltip) und in
   doku/selbstaendige.md — dort sind sie richtig.

   Das ist derselbe Fehler wie in der Notiz „Komplexität kommt vom Modell,
   nicht von den Elementen": beim Vereinfachen zuerst das nötige Vorwissen
   streichen, nicht die Elemente. */

const FARBEN_NENNER = ["--viz-seq-3", "--viz-seq-6"];
const FARBEN_VORMERKUNG = ["--viz-seq-3", "--viz-seq-4", "--viz-seq-5", "--viz-seq-6"];

/* Anteil am Ganzen in Prozent — UNGERUNDET. Nicht `gemeinsam.prozent`-Logik:
   das ist ein Anteil, keine Veränderung.

   WARUM UNGERUNDET, obwohl überall sonst gerundet wird: die vier Segmente des
   zweiten Panels ergeben in der Quelle 55,3 + 11,1 + 6,0 + 27,7 = 100,1 %.
   Das ist kein Fehler der Quelle, sondern die Summe von vier einzeln
   gerundeten Werten. Als Balkendaten übergeben, ragte der Stapel um 0,1 %
   über die auf 100 begrenzte Achse hinaus — ECharts schneidet dann still ab,
   und das letzte Segment (genau das, um das es geht) wäre zu kurz gezeichnet.
   Der Balken rechnet deshalb mit den exakten Verhältnissen und summiert auf
   glatt 100; gerundet wird erst bei der Ausgabe durch `pz()`, wodurch Tooltip
   und Tabelle wieder exakt die Prozentwerte der Quelle zeigen. */
const anteil = (teil, ganzes) => ganzes ? teil / ganzes * 100 : 0;

/* 3,5 und 0,6 sind Millionenwerte mit einer Nachkommastelle — `zahl()`
   würde daraus „4" bzw. „1" machen. */
const mio = (v) => Number(v).toLocaleString("de-AT", {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});

function wertText(panel, wert) {
  return panel.einheit === "Mio."
    ? mio(wert) + " Mio."
    : zahl(wert) + " Personen";
}

function baueSelbstaendige(daten) {
  const S = schrift();
  if (!daten?.nenner?.segmente?.length || !daten?.vormerkung?.segmente?.length) return;
  const abschnitt = document.getElementById("s-selbstaendige");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-selbstaendige");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const schmal = istSchmal(feld);
  const panels = [daten.nenner, daten.vormerkung];
  const farben = [FARBEN_NENNER, FARBEN_VORMERKUNG];

  setzeText("u-selbstaendige", daten.unterzeile ?? "");
  setzeText("h-selbstaendige", daten.hinweis ?? "");

  /* SENKRECHTE AUFTEILUNG — GEMESSEN, NICHT GESCHAETZT.
     ------------------------------------------------------------------
     Erster Anlauf setzte Titel, Legende und Balken auf feste Prozentwerte
     der Feldhoehe, gerechnet aus geschaetzten Zeilenhoehen. Auf der
     Live-Seite sind die Schriften groesser als in der Rechnung: die
     Legende landete AUF dem Untertitel, und unter dem zweiten Balken
     blieb ein Drittel der Karte leer. Am 21.08.2026 am fertigen Bild
     aufgefallen — der User: „Die Grafik sieht voellig zerstoert aus."

     Konsequenz: keine Schaetzung mehr. Das Diagramm wird ZWEIMAL gebaut.
     Der erste Lauf dient nur dem Messen; danach stehen Kopfblockhoehe und
     Legendenhoehe in Pixeln fest, und der zweite Lauf setzt die Lage
     daraus. Das ist unabhaengig von Schriftgroesse, Zeilenumbruch und
     Feldbreite — also auch von der Frage, ob die Legende ein- oder
     zweizeilig umbricht.

     Warum nicht die Feldhoehe anpassen: `.viz-chart` bekommt seine Hoehe
     aus `idl.css` (Abschnitt 42) bzw. dem `<style>`-Block der beiden
     HTML-Dateien. Eine Inline-Hoehe daneben waere eine zweite Quelle.
     Stattdessen fuellt der uebrige Platz die BALKEN — sie wachsen, bis
     die Karte voll ist, gedeckelt bei 110 px. */
  /* DREI ZEILEN, ZWEI GRUPPEN — User-Vorgabe 21.08.2026 am Live-Bild:
     „Die mittlere Zeile gehoert zum Titel gesetzt. Die Zeile der Legende
     gehoert angesetzt."

     Erster Anlauf verteilte Titel, Untertitel und Legende mit gleichen
     Abstaenden. Dadurch schwebte der Untertitel in der Mitte und las sich
     als Teil der Legende. Richtig ist eine Zweiteilung:

       Titel
       Untertitel        <- eng am Titel, itemGap 2
                         <- ZAESUR (NACH_KOPF)
       Legende           <- dicht am Balken, NACH_LEG klein
       ===== Balken =====

     Die Legende gehoert zum Diagramm, nicht zur Ueberschrift. */
  const KOPF_GAP = 2;    // Titel -> Untertitel: so eng wie moeglich
  const NACH_KOPF = 24;  // Kopfblock -> Legende: die Zaesur
  const NACH_LEG = 6;    // Legende -> Balken: angesetzt
  const ACHSE = 22;      // Zeile mit „0 %" bis „100 %" unter dem Balken
  const LUFT = 34;       // zwischen den beiden Panels
  const RAND = 8;        // unter dem zweiten Panel
  const BALKEN_MAX = 110;

  const seitenrand = schmal ? { left: 8, right: 14 } : { left: 12, right: 20 };

  /* Die Titel sind ganze Sätze und tragen die Kernzahl — 64 bis 69 Zeichen.
     ECharts bricht Titel NICHT von selbst um; ohne `width` + `overflow`
     läuft der Satz auf schmalen Feldern rechts aus dem Bild. Beides wird
     aus der tatsächlichen Feldbreite gestellt, nicht geschätzt. */
  const textBreite = Math.max(160,
    feld.clientWidth - seitenrand.left - seitenrand.right);

  const bau = (lage) => ({
    ...basis(),
    title: panels.map((p, i) => ({
      text: p.titel,
      subtext: p.untertitel,
      top: lage[i].titel,
      left: seitenrand.left,
      itemGap: KOPF_GAP,
      textStyle: { color: stil("--viz-text"), fontSize: S.serie,
                   fontWeight: 600, fontFamily: S.familie,
                   width: textBreite, overflow: "break", lineHeight: S.serie + 6 },
      subtextStyle: { color: stil("--viz-muted"), fontSize: S.achse,
                      fontFamily: S.familie,
                      width: textBreite, overflow: "break", lineHeight: S.achse + 5 },
    })),
    legend: panels.map((p, i) => ({
      top: lage[i].legende,
      left: seitenrand.left,
      orient: "horizontal",
      itemWidth: 11, itemHeight: 11, itemGap: schmal ? 10 : 14,
      icon: "roundRect",
      data: p.segmente.map((s) => s.name),
      textStyle: { color: stil("--viz-text-2"), fontSize: S.serie,
                   fontFamily: S.familie },
    })),
    grid: panels.map((p, i) => ({
      top: lage[i].grid, height: lage[i].hoehe,
      left: seitenrand.left, right: seitenrand.right,
      containLabel: false,
    })),
    xAxis: panels.map((_, i) => ({
      ...achse(), gridIndex: i, type: "value", min: 0, max: 100,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse,
                   hideOverlap: true, formatter: (v) => v + " %" },
    })),
    /* Eine einzige Kategorie je Grid: der Balken IST das Panel. Die
       Beschriftung steht im Titel darüber, die Achse bleibt leer. */
    yAxis: panels.map((_, i) => ({
      ...achse(), gridIndex: i, type: "category", data: [""],
      axisLabel: { show: false }, axisTick: { show: false },
      axisLine: { show: false }, splitLine: { show: false },
    })),
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "shadow",
                     shadowStyle: { color: stil("--viz-grid"), opacity: 0.35 } },
      formatter: (p) => {
        if (!p?.length) return "";
        /* Welches Panel getroffen wurde, NICHT über `axisIndex` bestimmen:
           das Feld ist je nach ECharts-Version mal der Achsen-, mal der
           Grid-Index und fiel im Test still auf 0 zurück — dann stand über
           dem unteren Balken die Überschrift des oberen. Der Serienname ist
           eindeutig und versionsunabhängig. */
        const panel = panels.find((q) =>
          q.segmente.some((s) => s.name === p[0].seriesName)) ?? panels[0];
        /* Im Tooltip die Kurzform, nicht den Titelsatz: der Titel ist ein
           ganzer Satz mit der Kernzahl darin und würde den Kasten auf die
           halbe Bildschirmbreite ziehen. */
        const kopf = `<strong>${panel.kurz ?? panel.titel}</strong><br>` +
          `<span style="color:${stil("--viz-muted")}">${panel.stichtag} · ` +
          `${wertText(panel, panel.gesamt)} gesamt</span><br>`;
        return kopf + p.map((r) => {
          const seg = panel.segmente.find((s) => s.name === r.seriesName);
          return `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>${pz(r.value)} %</strong>` +
            (seg ? ` <span style="color:${stil("--viz-muted")}">` +
                   `(${wertText(panel, seg.wert)})</span>` : "");
        }).join("<br>");
      },
    },
    series: panels.flatMap((p, i) => {
      const letzte = p.segmente.length - 1;
      return p.segmente.map((seg, k) => ({
        name: seg.name, type: "bar", stack: "panel" + i,
        xAxisIndex: i, yAxisIndex: i, barWidth: "62%",
        data: [anteil(seg.wert, p.gesamt)],
        itemStyle: {
          color: stil(farben[i][k]),
          borderRadius: k === 0 ? [4, 0, 0, 4] : (k === letzte ? [0, 4, 4, 0] : 0),
          /* 2-px-Fuge in Kartenfarbe zwischen den Segmenten — dieselbe
             Begründung wie in verfestigung.js: die Rampenstufen liegen in
             der Helligkeit nah beieinander und kehren im Dunkelmodus ihre
             Leserichtung um. Die Fuge wirkt in beiden Modi und unabhängig
             von der Farbwahrnehmung. */
          borderColor: stil("--viz-surface"),
          borderWidth: 2,
        },
        emphasis: hoverDunkler(stil(farben[i][k])),
        label: { show: false },
      }));
    }),
  });

  const ersetzen = { replaceMerge: ["series", "xAxis", "yAxis", "grid", "title", "legend"] };

  /* --- Lauf 1: nur zum Messen -----------------------------------------
     Die Abstände sind absichtlich viel zu groß. Nichts darf sich
     überlappen, sonst misst der zweite Schritt zwei Blöcke als einen. */
  const weit = [{ titel: 0, legende: 90, grid: 150, hoehe: 40 },
                { titel: 260, legende: 350, grid: 410, hoehe: 40 }];
  d.setOption(bau(weit), ersetzen);

  /* --- Messen ----------------------------------------------------------
     Aus dem gezeichneten SVG, nicht aus der Option. Kopfblock = alle
     Textknoten, die zu Titel oder Untertitel gehören; Legende = die
     Textknoten, die exakt einem Segmentnamen entsprechen. Die Trennung
     über „exakt gleich" ist nötig, weil Segmentnamen als Teilzeichenkette
     auch im Untertitel vorkommen können. */
  function bloecke() {
    const svg = feld.querySelector("svg");
    if (!svg) return null;
    const b0 = feld.getBoundingClientRect();
    const texte = [...svg.querySelectorAll("text")];
    const namen = panels.flatMap((p) => p.segmente.map((s) => s.name));
    const kasten = (el) => {
      const b = el.getBoundingClientRect();
      return { oben: b.top - b0.top, unten: b.bottom - b0.top };
    };
    return panels.map((p, i) => {
      const kopfText = p.titel + " " + p.untertitel;
      const kopf = texte.filter((el) => {
        const s = (el.textContent || "").trim();
        return s && !namen.includes(s) && !/^[\d\s.,]+%$/.test(s)
               && kopfText.includes(s.slice(0, 14));
      }).map(kasten);
      const eigene = p.segmente.map((s) => s.name);
      const leg = texte.filter((el) => eigene.includes((el.textContent || "").trim()))
                       .map(kasten);
      const spanne = (a) => a.length
        ? Math.max(...a.map((x) => x.unten)) - Math.min(...a.map((x) => x.oben)) : 0;
      return { kopf: spanne(kopf) || 46, legende: spanne(leg) || 16 };
    });
  }

  const gemessen = bloecke();
  if (gemessen) {
    /* Was fest steht, abziehen; der Rest geht in die Balken. So bleibt
       unter dem zweiten Panel kein leerer Streifen stehen. */
    const fest = gemessen.reduce((s, m) =>
      s + m.kopf + NACH_KOPF + m.legende + NACH_LEG + ACHSE, 0) + LUFT + RAND;
    const uebrig = Math.max(0, feld.clientHeight - fest);
    const balken = Math.max(40, Math.min(BALKEN_MAX, Math.round(uebrig / panels.length)));

    let y = 0;
    const lage = gemessen.map((m) => {
      const eintrag = {
        titel: Math.round(y),
        legende: Math.round(y + m.kopf + NACH_KOPF),
        grid: Math.round(y + m.kopf + NACH_KOPF + m.legende + NACH_LEG),
        hoehe: balken,
      };
      y = eintrag.grid + balken + ACHSE + LUFT;
      return eintrag;
    });
    /* --- Lauf 2: die echte Lage --------------------------------------- */
    d.setOption(bau(lage), ersetzen);
  }

  /* --- Tabelle ---------------------------------------------------------
     Beide Panels in EINER Tabelle, mit einer Spalte „Messung", damit die
     Zeilen nicht verwechselt werden können — die Bezugsjahre sind
     verschieden. Darunter die Opting-In-Belege und die Lücken; beides
     gehört zur Aussage, ist aber kein Diagramminhalt. */
  const zeilen = [];
  panels.forEach((p) => p.segmente.forEach((seg) => zeilen.push({
    messung: p.kurz ?? p.untertitel, name: seg.name,
    wert: wertText(p, seg.wert), anteil: anteil(seg.wert, p.gesamt),
    quelle: p.quelle,
  })));

  const b = daten.belege;
  const belegHtml = b ? `
    <p class="viz-unterzeile" style="margin-top:16px">
      <strong>Beleg — freiwillige Arbeitslosenversicherung, ${b.zeitraum}:</strong>
      ${zahl(b.antraege_gesamt)} Anträge insgesamt, davon ${zahl(b.antraege_epu)} von
      Ein-Personen-Unternehmen und ${zahl(b.antraege_neue_selbstaendige)} von Neuen
      Selbständigen. ${zahl(b.leistungsbezieher_2009_2017)} Personen haben dadurch
      zwischen 2009 und 2017 Leistungen bezogen, die ihnen sonst nicht zugestanden
      hätten. Zum Vergleich: ${zahl(b.bezug.epu_bestand)} Ein-Personen-Unternehmen
      (${b.bezug.epu_stichtag}). Die Zahlen beziehen sich auf verschiedene Stichtage
      und sind nicht als Quote zu lesen.
      <br><span style="opacity:.75">Quelle: ${b.quelle}</span>
    </p>` : "";

  const luecken = Array.isArray(daten.luecken) && daten.luecken.length ? `
    <p class="viz-unterzeile" style="margin-top:12px">
      <strong>Was nicht erhoben wird:</strong></p>
    <ul class="viz-unterzeile" style="margin-top:4px">
      ${daten.luecken.map((l) => `<li>${l}</li>`).join("")}
    </ul>` : "";

  setzeHtml("t-selbstaendige",
    tabelle(
      [{ titel: "Messung", wert: (z) => z.messung },
       { titel: "Gruppe", wert: (z) => z.name },
       { titel: "Wert", num: true, wert: (z) => z.wert },
       { titel: "Anteil", num: true, wert: (z) => pz(z.anteil) + " %" },
       { titel: "Quelle", wert: (z) => z.quelle }],
      zeilen
    ) + belegHtml + luecken
  );
}

AMS.baueSelbstaendige = baueSelbstaendige;
})(window.AMS);
