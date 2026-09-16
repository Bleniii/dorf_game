# Dorfgeschichte – So funktioniert es

Ein simples Schnitzeljagd-Spiel für dein Handy. Du scannst QR-Codes an fünf Orten im Dorf, löst Rätsel und entschlüsselst Stück für Stück die Geschichte. Alles läuft direkt im Browser, ohne Installation.

## Die einfache Regel: Was wohin gehört?

Damit niemand die Lösungen einfach so aus dem Code lesen kann, trennen wir das Spiel in zwei Teile:

1.  **Deine Inhalte (`content/`):** Hier liegen alle Texte, Rätsel und Lösungswörter im Klartext. **Diesen Ordner niemals öffentlich hochladen!** Er bleibt bei dir auf dem Rechner oder in einem privaten Repo.
2.  **Das fertige Spiel (`data/game.json`):** Das ist die verschlüsselte Version, die du zusammen mit `index.html`, `css/` und `js/` auf GitHub Pages uploadest. Nur diese Dateien brauchen andere sehen.

## Wie das Verschlüsseln funktioniert (kurz erklärt)

Jede Station hat ein eigenes **Lösungswort**. Dieses Wort steht auf der Karte am jeweiligen Ort (oder ist Teil des QR-Codes). Erst wenn du dieses Wort eingibst, wird der Text dazu freigeschaltet.

*   **Sicherheit:** Wir nutzen starke Verschlüsselung (AES-GCM). Ohne das richtige Wort ist der Inhalt unlesbar – auch nicht in den Entwickler-Tools.
*   **Realismus-Check:** Es geht hier darum, Neugierige abzuschrecken, keine Banken zu schützen. Eine vierstellige Jahreszahl lässt sich theoretisch knacken, aber es dauert lange genug, dass kein normaler Spieler es tun wird. Wer mehr Sicherheit will, wählt einfach längere Wörter statt komplexerer Mathematik.

## Wichtige Hinweise fürs Feld

Bevor ihr losgeht, lest bitte kurz diese Punkte durch, um Frust zu vermeiden:

*   **Im richtigen Browser bleiben:** Manche QR-Scanner öffnen Links in ihrem eigenen Mini-Browser. Dort speichert das Spiel euren Fortschritt oft nicht korrekt. Bitte nutzt eure normale Browser-App (Chrome, Safari etc.).
*   **Offline-fähig:** Sobald die Seite einmal geladen ist, könnt ihr sie auch ohne Netz weiter spielen. Die Daten liegen dann lokal auf dem Handy.
*   **Kein Server nötig:** Ihr sendet eure Antworten nirgendwohin. Alle Berechnungen laufen auf eurem Gerät. Das schützt eure Privatsphäre und spart Akku.
*   **Routing-Tipp:** Da GitHub Pages keine fancy URLs erlaubt, nutzen wir Adressen wie `seite.de/#w=xyz`. Das ist normal und funktioniert problemlos.

## Testen vor dem Start

Wir haben das System schon mal komplett durchgespielt: Falsche Wörter, Umlaute, alte QR-Codes und das Sperren von Stationen, bevor man dran ist. Alles klappt. 
Wenn ihr Änderungen macht, testet unbedingt nochmal den kompletten Weg von Station 1 bis 5.