# Auftrag an Copilot im Hauptprojekt

Integriere die beiden fertig abgestimmten Website-Abschnitte aus diesem Paket in die bestehende Hauptwebsite. Implementiere die Integration und pruefe sie, statt nur einen Vorschlag zu schreiben.

## Ziel und Grenzen

Die Gestaltung, Inhalte, Bildkomposition und responsive Darstellung sind bereits abgestimmt. Erhalte sie. Nutze `index.html` im Paket als visuelle Referenz. Ersetze sie nicht durch ein neues Design, ein Gesamtbild, generische Karten oder ein anderes Farbschema. Veraendere keine fachlich unbeteiligten Seiten, Navigationen oder globalen Styles. Installiere dafuer keine neue Bibliothek und keinen neuen App-Router.

## Vorgehen

1. Lies zuerst die Projektanweisungen und identifiziere Framework, Komponentenstruktur, Asset-Verwaltung, Styling-Konventionen und die passende Zielseite. "Wie es funktioniert" ist ein allgemeiner Prozessabschnitt; "Entgraten" ist eine fachliche Bearbeitungserklaerung. Sie muessen nicht direkt untereinander auf derselben Seite stehen. Falls mehrere Zielseiten oder Positionen plausibel sind und sich die beabsichtigte Platzierung nicht aus dem Projekt ergibt, frage gezielt danach.
2. Lies die beiden Fragmente unter `sections/`, die Stylesheets unter `styles/` sowie die technischen Hinweise in `README.md`.
3. Uebertrage die Fragmente in die vorhandene Template- oder Komponentenarchitektur, beispielsweise als `HowItWorksSection` und `DeburringSection`, soweit dies zu den Projektkonventionen passt. Keine zusaetzlichen `html`-, `head`-, `body`- oder `main`-Elemente aus der Vorschauseite einbauen.
4. Kopiere die acht Bilder in den bestehenden Asset-Bereich und passe saemtliche `src`-Pfade an. Beachte Unterseiten, Base-Paths und gegebenenfalls den vorhandenen Image-Loader. Verwende die Einzelbilder, nicht die grossen Gesamtvorlagen. Erhalte die Seitenverhaeltnisse, Transparenz und vorhandenen Groessenangaben.
5. In React/Next passe HTML-Syntax korrekt an, insbesondere `className`, JSX-Selbstschliessung und ARIA-Attribute. Wenn vorhandene Image-Komponenten eingesetzt werden, muessen Bildgroessen, `object-fit` und CSS-Transformationen weiterhin funktionieren. Keine Hydration, Client-Komponente oder Laufzeitlogik allein fuer diese statischen Abschnitte einfuehren.
6. Binde die beiden CSS-Dateien entsprechend der Projektkonvention ein. Behalte die Namensraeume `.step-q-process` und `.deburr`. Bei CSS Modules muessen alle Klassen und Selektoren inklusive verschachtelter Regeln und Pseudoelemente konsistent zugeordnet werden. Fuehre keine globalen `body`-, `h2`- oder `img`-Regeln aus diesem Paket ein. Lade Abschnittsstyles nach dem allgemeinen Reset oder loese auftretende Kollisionen lokal, ohne pauschal `!important` zu verwenden.
7. Erhalte die benannten Container `step-q` und `deburr` mit `container-type: inline-size`. Baue die Abschnitte in Eltern mit flexibler Breite ein; vermeide feste Desktopbreiten. Nutze bei Grid-/Flex-Eltern bei Bedarf `min-width: 0`. Erhalte die lokale Breitenbegrenzung und Abstaende; passe nur doppelte aeussere Seitenabstaende begruendet an.
8. Passe Ueberschriftenebenen an die Zielseite an, ohne deren Darstellung zu veraendern. Entgraten startet bereits mit `h2.deburr__heading`; Vergleich und Optionenerklaerung sind im Fragment ebenfalls `h2`, Diagrammtitel `h3`. Falls du sie zu `h3`/`h4` abstufst, passe die bisher elementbezogenen CSS-Selektoren lokal an oder verwende entsprechende Klassen. Pruefe `aria-labelledby` und eindeutige IDs. Bei mehrfacher Verwendung derselben Komponente erzeuge stabile, instanzspezifische IDs fuer alle referenzierten Ueberschriften.
9. Erhalte deutsche Texte, weiche Trennstellen, Alternativtexte, dekorative leere `alt`-Attribute und die Tabellen-Kopfzellen mit `scope="row"`. Stelle eine geeignete Sprachangabe `lang="de"` sicher, auf der Seite oder am jeweiligen Abschnitt. Bei vorhandener Internationalisierung folge deren Muster, ohne ungefragt neue Uebersetzungen zu erfinden.

## Unbedingt erhalten

- Prozessreihenfolge: Daten erkennen, Pruefen, Mitgeben, Weiterverarbeiten.
- Kein oberer Zierstrich bei "Wie es funktioniert". Die kurzen Linien unter den vier Schritttiteln bleiben erhalten.
- Individuelle Prozessbildskalierungen **1.18 / 1.27 / 1.10 / 1.12** und begrenzte Illustrationsbereiche. Gleiche Dateigroesse bedeutet nicht gleiche sichtbare Motivgroesse.
- Vier Prozessspalten bei Abschnittsbreite ueber 1050 px, zwei bis einschliesslich 1050 px, eine bis einschliesslich 620 px. Pfeile duerfen keine falsche Verbindung zwischen getrennten Zeilen erzeugen.
- Entgraten mit drei Hauptspalten ueber 1100 px, zwei bis einschliesslich 1100 px und einer bis einschliesslich 700 px. Weitere lokale Anpassungen bei 1450 px und 380 px beibehalten.
- Rueckseitig bedeutet nur Rueckseite; zweiseitig bedeutet beide Seiten. Bei zweiseitig ist die Vorderseite ausdruecklich **entgratet**. Die widerspruechliche Beschriftung der urspruenglichen Bildvorlage wurde bewusst korrigiert.
- Die Vergleichsgrafiken sind HTML/CSS, keine Bilder mit eingebrannten Beschriftungen. Erhalte die Markierung der bearbeiteten Seiten und `t = Materialstaerke`.
- Aussagen zu verbleibenden scharfen Kanten, moeglicher Oberflaechenveraenderung und Relevanz fuer Angebot/Fertigung nicht entfernen oder staerker versprechen.
- Kantenfoto und HTML-Kantenlabel als zusammengehoerige Komposition erhalten; die Originalbeschriftung ist in der Bilddatei noch vorhanden und wird ueberlagert.

## Abnahme

1. Fuehre die relevanten bestehenden Lint-, Typ- und Build-Pruefungen aus. Behebe nur integrationsbedingte Fehler.
2. Teste die tatsaechlichen Zielseiten mindestens bei 320, 390, 768, 1024, 1280 und 1672 px sowie mit einem engeren Elterncontainer bei breitem Browserfenster. Die Breakpoints beziehen sich auf die Abschnittsbreite.
3. Pruefe, dass alle acht Bilder laden, keine horizontalen Scrollbalken entstehen und Texte, Nummern, Fotos, Pfeile sowie Diagrammbeschriftungen weder ueberlappen noch ungewollt abgeschnitten werden. Pruefe insbesondere den vergroesserten ersten Prozessschritt und das Kantenlabel.
4. Vergleiche Desktop- und Mobile-Screenshots mit der Paketvorschau. Kontrolliere Ueberschriftenhierarchie, doppelte IDs, ARIA-Verweise und dass die Styles keine anderen Seitenteile veraendern.
5. Berichte knapp die eingebauten Komponenten, Zielseiten, Asset-/Style-Pfade, ausgefuehrten Checks und eventuell verbleibenden Einschraenkungen.

Falls die Zielbrowser keine CSS-Container-Queries unterstuetzen oder die Bildqualitaet am vorgesehenen Einbauort nicht ausreicht, benenne diese konkrete Einschraenkung und klaere die passende Alternative, statt das Design stillschweigend zu veraendern.