/* ========================================================================
   Zelf-opruimende service worker.
   De oude Wildeburg-app registreerde een service worker op de hoofdmap van
   oppadmetserge.nl die de site offline cachete. Nu de Landjuweel-app op de
   hoofdmap staat, moet die oude cache weg. Deze worker vervangt de oude,
   gooit alle caches leeg en meldt zichzelf af, zodat bezoekers direct de
   nieuwe app zien. (De Wildeburg-app zelf staat nu op /wildeburg/ met een
   eigen service worker.)
   ======================================================================== */

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) {
        // Open vensters herladen zodat ze de verse pagina van het netwerk halen.
        clients.forEach(function (client) { client.navigate(client.url); });
      })
  );
});
