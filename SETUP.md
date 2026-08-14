# Einrichtung — Schritt für Schritt

Rechne mit 15 Minuten. Du brauchst kein Terminal und keine Programmierkenntnisse.
Alles passiert im Browser.

---

## Schritt 1 — Repository anlegen

1. Auf [github.com](https://github.com) einloggen
2. Oben rechts auf das **`+`** klicken → **New repository**
3. Ausfüllen:
   - **Repository name:** `arbeitsmarkt-at`
   - **Public** auswählen *(wichtig — GitHub Pages ist nur für öffentliche Repos gratis)*
   - **Add a README file** NICHT ankreuzen (wir laden gleich eigene Dateien hoch)
4. **Create repository**

---

## Schritt 2 — Dateien hochladen

1. Das ZIP entpacken, das du bekommen hast. Darin liegt der Ordner `arbeitsmarkt-at`.
2. Im leeren Repository auf **uploading an existing file** klicken
   (der Link steht mitten auf der Seite).
3. **Den Inhalt** des entpackten Ordners ins Browserfenster ziehen — also die
   Ordner `.github`, `docs`, `etl` und die Dateien `README.md`, `SETUP.md`.
   Nicht den äußeren Ordner selbst.
4. Unten **Commit changes** klicken.

> **Wenn `.github` beim Ziehen fehlt:** macOS blendet Ordner mit einem Punkt am
> Anfang aus. Im Finder `Cmd + Shift + .` drücken — dann werden sie sichtbar.

Danach muss die Dateiliste im Repository so aussehen:

```
.github/workflows/daten-aktualisieren.yml
docs/index.html
docs/data/.gitkeep
etl/build.py
etl/config.py
etl/requirements.txt
README.md
SETUP.md
```

---

## Schritt 3 — GitHub Actions erlauben zu schreiben

Das Skript legt neue Datendateien im Repository ab. Dafür braucht es die Erlaubnis.

1. Im Repository auf **Settings** (oben)
2. Links: **Actions** → **General**
3. Ganz unten bei **Workflow permissions**:
   **Read and write permissions** auswählen
4. **Save**

Ohne diesen Schritt läuft das Skript zwar durch, kann die Ergebnisse aber nicht
speichern.

---

## Schritt 4 — GitHub Pages einschalten

1. **Settings** → links **Pages**
2. Bei **Source**: **Deploy from a branch**
3. **Branch:** `main`, Ordner: **`/docs`**
4. **Save**

GitHub zeigt dir danach die Adresse an, meist:
`https://DEIN-NAME.github.io/arbeitsmarkt-at/`

---

## Schritt 5 — Ersten Datenlauf starten

1. Im Repository auf **Actions** (oben)
2. Links **Daten aktualisieren** anklicken
3. Rechts **Run workflow** → nochmal **Run workflow**

Der Lauf dauert ein bis drei Minuten. Ein grüner Haken bedeutet: fertig.

**Sieh dir das Protokoll an** — klick auf den Lauf und dann auf *Daten bauen*.
Ganz unten steht entweder „keine Auffälligkeiten" oder eine Liste von Hinweisen.
Diese Hinweise sind wichtig: Sie zeigen zum Beispiel, ob Ausbildungscodes oder
Bezirke aufgetaucht sind, die das Skript noch nicht kennt. Schick sie mir, dann
passe ich die Konfiguration an.

---

## Schritt 6 — Anschauen

Ruf `https://DEIN-NAME.github.io/arbeitsmarkt-at/` auf.
Beim ersten Mal kann es fünf Minuten dauern, bis GitHub die Seite ausliefert.

Das ist die Vorschauseite — funktionsfähig, aber im Standard-Look. Wie die
Diagramme in dein Oxygen-Design kommen, steht in
[oxygen/ANLEITUNG.md](oxygen/ANLEITUNG.md).

---

## Ab jetzt läuft es von allein

Am 6. jedes Monats um 07:00 (Wiener Zeit) holt GitHub automatisch die neuen
AMS-Zahlen und aktualisiert das Dashboard.

**Wenn etwas schiefgeht,** schickt dir GitHub eine E-Mail mit dem Betreff
„Run failed". Das Dashboard zeigt dann weiter die alten Zahlen — es geht nichts
kaputt, es wird nur nicht aktueller. Schick mir die Mail, dann sehe ich nach.

---

## Häufige Stolpersteine

| Problem | Ursache | Lösung |
|---|---|---|
| Action schlägt fehl mit „Permission denied" | Schritt 3 vergessen | Workflow permissions auf „Read and write" |
| Seite zeigt 404 | Pages-Ordner falsch | Settings → Pages → Ordner muss `/docs` sein |
| Seite sagt „Daten konnten nicht geladen werden" | Erster Datenlauf fehlt | Schritt 5 ausführen |
| `.github`-Ordner fehlt nach dem Upload | macOS blendet ihn aus | `Cmd + Shift + .` im Finder |
| Actions-Tab zeigt nichts an | Actions deaktiviert | Settings → Actions → Allow all actions |
| Änderungen sind nach dem Upload nicht sichtbar | Browser hält die JS-Dateien im Cache | In `docs/index.html` und `docs/embed.html` die Ziffer in `?v=19` hochzählen (steht an jedem `<script src="js/…">`) |

---

## Nach jedem Upload: zwei Handgriffe

**1. Die Versionsziffer hochzählen.** In `docs/index.html` und `docs/embed.html`
steht an jedem Skript-Tag eine Versionsziffer (seit v18 ist der Code pro
Themenstrang aufgeteilt — `js/kern.js` zuerst, dann die Module aus
`js/charts/`):

```html
<script src="js/kern.js?v=19" defer></script>
<script src="js/charts/zeitreihe.js?v=19" defer></script>
<!-- … -->
```

GitHub Pages liefert JavaScript mit `Cache-Control: max-age=600` aus. Ohne eine
neue Ziffer sieht ein Besucher nach dem Upload bis zu zehn Minuten die alte
Datei — und wer die Seite schon einmal offen hatte, unter Umständen deutlich
länger. Ein Hard-Reload hilft dir, aber nicht deinen Besuchern.

Also: bei jedem Upload `v=19` → `v=20` → `v=21` … (in beiden HTML-Dateien,
an allen Skript-Tags — Suchen-und-Ersetzen `?v=19` reicht).

**2. Nur wenn sich im Ordner `etl/` etwas geändert hat:**
Actions → „Daten aktualisieren" → **Run workflow**. Alles unter `docs/data/`
entsteht erst bei einem Lauf; ein Upload allein ändert daran nichts.
