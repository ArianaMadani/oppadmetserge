# Op pad met Serge — Wildeburg 2026

Een klein, persoonlijk festival-appje voor Wildeburg 2026 (10–12 juli, Kraggenburg)
met de line-up en de notities van Serge & Ariana. Je kunt door alle artiesten
bladeren, het blokkenschema per dag bekijken, en je eigen favorieten bewaren in
een persoonlijk tijdschema.

## Wat kun je ermee?

- **🎵 Artiesten** — alle artiesten op alfabet, met genre-labels, de notities van
  Serge & Ariana en een ★ bij hun tips. Zoek op naam, genre of omschrijving, of
  filter op genre, alleen tips, of alleen je favorieten.
- **📅 Schema** — het blokkenschema per dag (vrijdag / zaterdag / zondag). Veeg
  het schema naar links en rechts. De nacht loopt gewoon door tot ’s ochtends.
- **❤️ Mijn schema** — tik bij een artiest op het hartje en die verschijnt hier,
  netjes op tijd gesorteerd per dag. Overlappen twee favorieten qua tijd? Dan
  krijg je een waarschuwing.

## Hoe open ik hem op mijn eigen computer?

Dubbelklik simpelweg op **`index.html`**. Dan opent het appje in je browser.
Er is verder niets voor nodig — geen installatie, geen internet.

## Hoe zet ik hem online (GitHub Pages)?

Zo kun je hem op je telefoon gebruiken zonder de bestanden mee te nemen:

1. Maak een gratis account op [github.com](https://github.com) (als je die nog
   niet hebt).
2. Klik rechtsboven op **+** → **New repository**. Geef ’m een naam
   (bijvoorbeeld `wildeburg`) en klik op **Create repository**.
3. Klik op **uploading an existing file** (of: **Add file → Upload files**) en
   sleep deze vier bestanden erin:
   - `index.html`
   - `style.css`
   - `app.js`
   - `data.js`

   Klik daarna op **Commit changes**.
4. Ga in je repository naar **Settings** (tabblad bovenaan) → **Pages** (links in
   het menu).
5. Kies bij **Branch** de optie **main** (en map **/ (root)**) en klik op
   **Save**.
6. Wacht een minuutje. Boven aan de Pages-pagina verschijnt een link, zoiets als
   `https://jouwnaam.github.io/wildeburg/`. Dat is jouw appje online! Deel ’m
   gerust met vrienden.

## Over je favorieten

Je favorieten (de hartjes) worden opgeslagen **op het apparaat en in de browser
die je gebruikt**. Ze staan dus niet in een account: als je het appje op je
telefoon opent, staan daar andere favorieten dan op je laptop. Wis je de
gegevens van je browser, dan verdwijnen de favorieten ook. Voor onderweg op het
festival open je hem dus het handigst gewoon op je telefoon.

## Iets aanpassen aan de line-up of notities?

Alle informatie staat in **`data.js`**. Daar kun je omschrijvingen aanvullen
(bij `desc: null` staat nog geen notitie), tips aanzetten (`tip: true`) of tijden
wijzigen. De rest van het appje werkt daar vanzelf op mee.
