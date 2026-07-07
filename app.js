/* ========================================================================
   Op pad met Serge — Wildeburg 2026
   Vanilla JS, hash-navigatie, localStorage-favorieten.
   Data komt uit data.js (globale WILDEBURG_DATA).
   ======================================================================== */

(function () {
  "use strict";

  // data.js definieert `const WILDEBURG_DATA` op top-level scope. Bij een klassiek
  // <script> is dat een globale lexicale binding (WILDEBURG_DATA), maar GEEN
  // window-property. Daarom hier de bare global gebruiken, niet window.WILDEBURG_DATA.
  var DATA = (typeof WILDEBURG_DATA !== "undefined")
    ? WILDEBURG_DATA
    : window.WILDEBURG_DATA;
  var FAV_KEY = "wildeburg-favs";

  // ---- Podium-kleuren (matchen met CSS-variabelen, ook voor inline styles) ----
  var STAGE_COLORS = {
    "Wildlive":        "#e8623a",
    "Strand":          "#2aa6c4",
    "Helling":         "#7b5cd6",
    "BUD X Lodge":     "#c8447e",
    "Bamboebos":       "#3f9e56",
    "Duinpan":         "#d99b28",
    "Studio De Baan":  "#b0863a",
    "Achtertuin":      "#e0b93f",
    "Kas":             "#5c9a6f"
  };
  function stageColor(stage) {
    return STAGE_COLORS[stage] || "#326049";
  }

  // ---- Kleine helpers ----
  function el(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Diakriet-ongevoelig + lowercase (voor zoeken: "jasmin" vindt "Jasmín")
  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // ---- App-state ----
  var currentView = "artiesten"; // welke tab/scherm actief is (voor gerichte re-renders)

  // ---- Favorieten (localStorage) ----
  var favs = loadFavs();
  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {}
  }
  function isFav(id) { return favs.indexOf(id) !== -1; }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i === -1) favs.push(id); else favs.splice(i, 1);
    saveFavs();
  }

  // ---- Data-indexen ----
  var byId = {};
  DATA.artists.forEach(function (a) { byId[a.id] = a; });

  var artistsSorted = DATA.artists.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
  });

  var dayById = {};
  DATA.days.forEach(function (d) { dayById[d.id] = d; });
  var DAY_ORDER = DATA.days.map(function (d) { return d.id; });

  // ---- Tijd-/nachtlogica ----
  // Een festivaldag loopt van 12:00 tot 12:00 de volgende dag.
  // Tijden < 12:00 horen bij de nacht/ochtend NA die dag -> uur + 24.
  // Voorbeeld: day "vr", start "02:00" => absoluut uur 26 (zaterdagnacht).
  function toHours(t) {
    if (t == null) return null;
    var parts = t.split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) || 0;
    return h + m / 60;
  }
  // Absoluut uur binnen het dag-grid (12 = 12:00 middag, 26 = 02:00 nacht, 36 = 12:00 dag erna)
  function absHour(t) {
    var h = toHours(t);
    if (h == null) return null;
    if (h < 12) h += 24; // ochtend/nacht hoort bij de nacht van deze festivaldag
    return h;
  }
  // Voor eindtijd: als end kleiner is dan start (over middernacht), tel er 24 bij op.
  function absEndHour(start, end) {
    var s = absHour(start);
    var e = absHour(end);
    if (s == null || e == null) return e;
    if (e <= s) e += 24;
    return e;
  }

  // Format een absoluut uur (12..36) terug naar "HH:MM"
  function fmtAbsHour(absH) {
    var h = absH % 24;
    var hh = Math.floor(h);
    var mm = Math.round((h - hh) * 60);
    return pad2(hh) + ":" + pad2(mm);
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Op welke festivaldag valt een slot voor "Mijn schema" chronologisch?
  // We gebruiken absHour als sorteersleutel binnen de festivaldag.

  // ---- Router ----
  window.addEventListener("hashchange", route);

  // Onthoud scrollposities per tab, zodat "terug" vanaf een artiest
  // niet naar het begin van de lijst of het schema springt.
  // Het schema is één doorlopend grid: nog maar één horizontale scrollpositie
  // ({x: grid-scroll, y: verticale paginascroll}). Artiesten: alleen de
  // verticale paginascroll (getal).
  var savedScroll = { schema: null, artiesten: 0 };
  function pageY() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }
  function rememberScroll() {
    if (currentView === "schema") {
      var sc = document.querySelector(".schedule-scroll");
      savedScroll.schema = { x: sc ? sc.scrollLeft : 0, y: pageY() };
    } else if (currentView === "artiesten") {
      savedScroll.artiesten = pageY();
    }
  }

  function route() {
    var hash = location.hash.replace(/^#/, "");
    var parts = hash.split("/");
    rememberScroll();

    if (parts[0] === "artiest" && parts[1]) {
      renderDetail(parts[1]);
      setActiveTab(null);
      return;
    }
    if (parts[0] === "schema") {
      renderSchedule();
      setActiveTab("schema");
      // Deep-link #schema/za => spring naar die dag; anders herstel scrollpositie.
      var dayParam = (parts[1] && DAY_ORDER.indexOf(parts[1]) !== -1) ? parts[1] : null;
      var applySchemaScroll = function () {
        var sc = document.querySelector(".schedule-scroll");
        if (!sc) return;
        void sc.scrollWidth; // forceer layout zodat scrollLeft niet naar 0 klemt
        if (dayParam) {
          sc.scrollLeft = dayScrollLeft(dayParam);
          window.scrollTo(0, 0);
        } else if (savedScroll.schema) {
          sc.scrollLeft = savedScroll.schema.x || 0;
          window.scrollTo(0, savedScroll.schema.y || 0);
        } else {
          window.scrollTo(0, 0);
        }
        updateDaySpy();
      };
      // Het brede grid is soms pas na een layout-tick echt scrollbaar (scrollLeft
      // zou anders naar 0 klemmen). rAF dekt het vloeiende geval; de timer is een
      // betrouwbaar vangnet (ook als rAF gethrottled is).
      requestAnimationFrame(function () {
        applySchemaScroll();
        requestAnimationFrame(applySchemaScroll);
      });
      setTimeout(applySchemaScroll, 80);
      return;
    }
    if (parts[0] === "mijn") {
      renderMySchedule();
      setActiveTab("mijn");
      return;
    }
    // default
    renderArtists();
    setActiveTab("artiesten");
    var savedY = savedScroll.artiesten || 0;
    // Herstel na de render zodat de (langere) lijst er al staat.
    requestAnimationFrame(function () { window.scrollTo(0, savedY); });
  }

  function setActiveTab(tab) {
    var btns = document.querySelectorAll(".tabbar__btn");
    btns.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === tab);
    });
  }

  function scrollTop() {
    window.scrollTo(0, 0);
  }

  // ======================================================================
  //  TAB 1 + 5: ARTIESTEN (lijst + zoeken/filteren)
  // ======================================================================
  var searchState = {
    q: "",
    genres: [],       // actieve genre-filters
    tipOnly: false,
    favOnly: false,
    showAllGenres: false
  };

  // Verzamel alle genres + frequentie
  var genreCount = {};
  DATA.artists.forEach(function (a) {
    (a.genres || []).forEach(function (g) {
      genreCount[g] = (genreCount[g] || 0) + 1;
    });
  });
  var allGenresByFreq = Object.keys(genreCount).sort(function (a, b) {
    var d = genreCount[b] - genreCount[a];
    return d !== 0 ? d : a.localeCompare(b, "nl");
  });
  var TOP_GENRES = 15;

  // Nachtsets: tijden vóór 12:00 horen bij de nacht ná die festivaldag.
  var NIGHT_AFTER = { vr: "za", za: "zo", zo: "ma" };
  function isNight(s) { return s.start != null && parseInt(s.start, 10) < 12; }
  function dayText(s) {
    var day = dayById[s.day];
    var label = day ? day.label : s.day;
    return isNight(s) ? label.toLowerCase() + "nacht (" + s.day + " → " + (NIGHT_AFTER[s.day] || "?") + ")" : label;
  }

  function slotSummary(a) {
    // Korte dag+tijd+podium regels voor op de kaart
    if (!a.slots || a.slots.length === 0) {
      return '<div class="slot-none">Nog niet op het blokkenschema</div>';
    }
    return a.slots.map(function (s) {
      var tijd = (s.start && s.end) ? (s.start + "–" + s.end) : "tijd nog onbekend";
      return '<div class="slot-line-mini">' +
             '<span class="dot" style="background:' + stageColor(s.stage) + '"></span>' +
             '<span>' + escapeHtml(capFirst(dayText(s))) + ' · ' +
             escapeHtml(tijd) + ' · ' + escapeHtml(s.stage) + '</span></div>';
    }).join("");
  }
  function capFirst(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function matchesFilters(a) {
    if (searchState.tipOnly && !a.tip) return false;
    if (searchState.favOnly && !isFav(a.id)) return false;

    if (searchState.genres.length) {
      var ag = a.genres || [];
      for (var i = 0; i < searchState.genres.length; i++) {
        if (ag.indexOf(searchState.genres[i]) === -1) return false; // AND
      }
    }

    if (searchState.q) {
      var q = normalize(searchState.q);
      var hay = normalize(a.name + " " + (a.desc || "") + " " + (a.genres || []).join(" "));
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function renderArtists() {
    currentView = "artiesten";
    var list = artistsSorted.filter(matchesFilters);

    var genresToShow = searchState.showAllGenres
      ? allGenresByFreq
      : allGenresByFreq.slice(0, TOP_GENRES);

    var html = "";

    // Zoekbalk
    html += '<div class="searchbar">' +
            '<span class="searchbar__icon">🔍</span>' +
            '<input id="searchInput" type="search" inputmode="search" ' +
            'placeholder="Zoek artiest, genre of omschrijving…" ' +
            'value="' + escapeHtml(searchState.q) + '" autocomplete="off">' +
            '</div>';

    // Toggles
    html += '<div class="filter-row">' +
            '<button class="toggle-chip' + (searchState.tipOnly ? " is-active" : "") +
              '" data-toggle="tip">★ Alleen tips</button>' +
            '<button class="toggle-chip' + (searchState.favOnly ? " is-active" : "") +
              '" data-toggle="fav">❤️ Alleen favorieten</button>' +
            '</div>';

    // Genre-filters
    html += '<div class="genre-filters">';
    genresToShow.forEach(function (g) {
      var active = searchState.genres.indexOf(g) !== -1;
      html += '<button class="genre-chip' + (active ? " is-active" : "") +
              '" data-genre="' + escapeHtml(g) + '">' + escapeHtml(g) + '</button>';
    });
    if (allGenresByFreq.length > TOP_GENRES) {
      html += '<button class="genre-more" data-more="1">' +
              (searchState.showAllGenres ? "minder ▲" : "meer… ▾") + '</button>';
    }
    html += '</div>';

    html += '<div class="result-count">' + list.length + ' van ' +
            DATA.artists.length + ' artiesten</div>';

    // Kaarten
    if (list.length === 0) {
      html += '<div class="no-results">Geen artiesten gevonden. Pas je zoekopdracht of filters aan.</div>';
    } else {
      html += '<div class="card-list">';
      list.forEach(function (a) { html += artistCard(a); });
      html += '</div>';
    }

    el("view").innerHTML = html;
    bindArtistsEvents();
  }

  function artistCard(a) {
    var color = a.slots && a.slots.length ? stageColor(a.slots[0].stage) : "#326049";
    var favClass = isFav(a.id) ? " is-fav" : "";
    var heart = isFav(a.id) ? "❤️" : "🤍";

    var genresHtml = (a.genres || []).slice(0, 6).map(function (g) {
      return '<span class="mini-chip">' + escapeHtml(g) + '</span>';
    }).join("");

    return '' +
      '<div class="artist-card" data-artist="' + escapeHtml(a.id) + '" ' +
        'style="--stage-color:' + color + '">' +
        '<button class="fav-btn' + favClass + '" data-fav="' + escapeHtml(a.id) + '" ' +
          'aria-label="Favoriet aan/uit">' + heart + '</button>' +
        '<div class="artist-card__name">' +
          escapeHtml(a.name) +
          (a.tip ? '<span class="tip-badge" title="Tip van Serge">★</span>' : '') +
        '</div>' +
        (genresHtml ? '<div class="artist-card__genres">' + genresHtml + '</div>' : '') +
        '<div class="artist-card__slots">' + slotSummary(a) + '</div>' +
      '</div>';
  }

  function bindArtistsEvents() {
    var input = el("searchInput");
    if (input) {
      input.addEventListener("input", function () {
        searchState.q = input.value;
        // Alleen de lijst + teller verversen zou ideaal zijn; hier hele view,
        // maar we herstellen focus + cursor.
        var pos = input.selectionStart;
        renderArtists();
        var again = el("searchInput");
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }

    document.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-toggle");
        if (t === "tip") searchState.tipOnly = !searchState.tipOnly;
        if (t === "fav") searchState.favOnly = !searchState.favOnly;
        renderArtists();
      });
    });

    document.querySelectorAll("[data-genre]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = b.getAttribute("data-genre");
        var i = searchState.genres.indexOf(g);
        if (i === -1) searchState.genres.push(g); else searchState.genres.splice(i, 1);
        renderArtists();
      });
    });

    var moreBtn = document.querySelector("[data-more]");
    if (moreBtn) moreBtn.addEventListener("click", function () {
      searchState.showAllGenres = !searchState.showAllGenres;
      renderArtists();
    });

    bindCardEvents();
  }

  // Klik op kaart -> detail; klik op hartje -> toggle (zonder navigeren)
  function bindCardEvents() {
    document.querySelectorAll(".artist-card[data-artist]").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-fav]")) return; // hartje handelt zelf af
        location.hash = "artiest/" + card.getAttribute("data-artist");
      });
    });
    document.querySelectorAll("[data-fav]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-fav");
        toggleFav(id);
        // Visuele update ter plekke
        var nowFav = isFav(id);
        btn.classList.toggle("is-fav", nowFav);
        btn.textContent = nowFav ? "❤️" : "🤍";
        // Als "alleen favorieten" aan staat, kan de kaart weg moeten
        if (searchState.favOnly && !nowFav && currentView === "artiesten") {
          renderArtists();
        }
      });
    });
  }

  // ======================================================================
  //  TAB 2: ARTIESTDETAIL
  // ======================================================================
  function renderDetail(id) {
    currentView = "detail";
    var a = byId[id];
    if (!a) {
      el("view").innerHTML =
        '<button class="back-btn" data-back="1">← Terug</button>' +
        '<div class="no-results">Artiest niet gevonden.</div>';
      bindBack();
      scrollTop();
      return;
    }

    var color = a.slots && a.slots.length ? stageColor(a.slots[0].stage) : "#326049";
    var favActive = isFav(a.id);

    var genresHtml = (a.genres || []).map(function (g) {
      return '<span class="mini-chip">' + escapeHtml(g) + '</span>';
    }).join("");

    var descHtml = a.desc
      ? '<p class="detail__desc">' + escapeHtml(a.desc) + '</p>'
      : '<p class="detail__desc is-empty">Nog geen notitie — wordt aangevuld!</p>';

    var slotsHtml = "";
    if (a.slots && a.slots.length) {
      slotsHtml = '<div class="detail__slots">' + a.slots.map(function (s) {
        var day = dayById[s.day];
        var tijd = (s.start && s.end)
          ? (s.start + "–" + s.end)
          : "Tijd nog onbekend";
        var extras = "";
        if (s.live) extras += '<span class="tag-live">LIVE</span>';
        if (s.label) extras += '<span class="tag-label">' + escapeHtml(s.label) + '</span>';
        var dagKop = isNight(s)
          ? escapeHtml((day ? day.label : s.day) + "nacht") +
            '<br><small class="muted">' + escapeHtml("nacht " + s.day + " → " + (NIGHT_AFTER[s.day] || "?")) + '</small>'
          : escapeHtml(day ? day.label : s.day) +
            '<br><small class="muted">' + escapeHtml(day ? day.datum : "") + '</small>';
        return '<div class="slot-line" style="--stage-color:' + stageColor(s.stage) + '">' +
          '<div class="slot-line__day">' + dagKop + '</div>' +
          '<div class="slot-line__body">' +
            '<span class="slot-line__time">' + escapeHtml(tijd) + '</span>' + extras +
            '<br><span class="slot-line__stage">📍 ' + escapeHtml(s.stage) + '</span>' +
          '</div>' +
        '</div>';
      }).join("") + '</div>';
    } else {
      slotsHtml = '<div class="detail__slots"><div class="slot-none">Nog niet op het blokkenschema</div></div>';
    }

    var html =
      '<button class="back-btn" data-back="1">← Terug</button>' +
      '<div class="detail" style="--stage-color:' + color + '">' +
        (a.tip ? '<div class="detail__tip">★ Tip van Serge</div>' : '') +
        '<h1 class="detail__name">' + escapeHtml(a.name) + '</h1>' +
        (genresHtml ? '<div class="chips">' + genresHtml + '</div>' : '') +
        descHtml +
        slotsHtml +
        '<button class="detail__fav' + (favActive ? " is-fav" : "") + '" data-detailfav="' +
          escapeHtml(a.id) + '">' +
          '<span class="big-heart">' + (favActive ? "❤️" : "🤍") + '</span>' +
          '<span>' + (favActive ? "In mijn schema" : "Voeg toe aan mijn schema") + '</span>' +
        '</button>' +
      '</div>';

    el("view").innerHTML = html;
    bindBack();

    var favBtn = document.querySelector("[data-detailfav]");
    favBtn.addEventListener("click", function () {
      toggleFav(a.id);
      var now = isFav(a.id);
      favBtn.classList.toggle("is-fav", now);
      favBtn.querySelector(".big-heart").textContent = now ? "❤️" : "🤍";
      favBtn.querySelector("span:last-child").textContent =
        now ? "In mijn schema" : "Voeg toe aan mijn schema";
    });

    scrollTop();
  }

  function bindBack() {
    var b = document.querySelector("[data-back]");
    if (b) b.addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.hash = "artiesten";
    });
  }

  // ======================================================================
  //  TAB 3: DOORLOPEND BLOKKENSCHEMA (één continue tijdlijn)
  // ======================================================================
  // De hele festival-tijdlijn staat op één horizontaal scrollend grid:
  // vrijdag 12:00 → zaterdag 12:00 → zondag 12:00 → zondag 23:00 (59 uur),
  // zodat de nacht gewoon doorloopt. Globale uur-offset t.o.v. vrijdag 12:00:
  //   dayIndex(vr=0,za=1,zo=2) * 24 + (absHour − 12)
  var currentDay = "vr";            // welke dag-knop actief oogt (scroll-spy stuurt dit)
  var HOUR_WIDTH = 92;              // px per uur (iets smaller dan vroeger => prettiger op mobiel)
  var STAGE_LABEL_WIDTH = 112;
  var FEST_START = 12;             // vrijdag 12:00 = globaal uur 0
  var FEST_TOTAL_HOURS = 59;       // t/m zondag 23:00

  function dayIndex(dayId) {
    var i = DAY_ORDER.indexOf(dayId);
    return i === -1 ? 0 : i;
  }
  // Globaal uur (0..59) op de doorlopende as voor een absoluut uur binnen een dag.
  function globalHour(dayId, absH) {
    return dayIndex(dayId) * 24 + (absH - FEST_START);
  }
  // Globaal uur waarop 12:00 van een dag begint (vr=0, za=24, zo=48).
  function dayGlobalStart(dayId) { return dayIndex(dayId) * 24; }
  // scrollLeft die 12:00 van een dag netjes links naast de podium-kolom zet.
  function dayScrollLeft(dayId) { return dayGlobalStart(dayId) * HOUR_WIDTH; }

  // Verzamel alle getimede slots (globaal geplaatst) en de "geen tijd"-slots per dag.
  function slotsForFestival() {
    var timed = [];        // {artist, slot, gStart, gEnd, stage}
    var untimedByDay = {}; // dayId -> stage -> [ {artist, slot} ]
    DATA.artists.forEach(function (a) {
      (a.slots || []).forEach(function (s) {
        if (s.start == null || s.end == null) {
          if (!untimedByDay[s.day]) untimedByDay[s.day] = {};
          if (!untimedByDay[s.day][s.stage]) untimedByDay[s.day][s.stage] = [];
          untimedByDay[s.day][s.stage].push({ artist: a, slot: s });
        } else {
          timed.push({
            artist: a, slot: s, stage: s.stage,
            gStart: globalHour(s.day, absHour(s.start)),
            gEnd: globalHour(s.day, absEndHour(s.start, s.end))
          });
        }
      });
    });
    return { timed: timed, untimedByDay: untimedByDay };
  }

  function renderSchedule() {
    currentView = "schema";

    var data = slotsForFestival();
    var totalHours = FEST_TOTAL_HOURS;
    var gridWidth = STAGE_LABEL_WIDTH + totalHours * HOUR_WIDTH;

    // Dag-knoppen = jump-knoppen (geen re-render meer)
    var html = '<div class="day-switcher">';
    DATA.days.forEach(function (d) {
      html += '<button data-day="' + d.id + '">' +
        escapeHtml(d.label) + '<small>' + escapeHtml(d.datum) + '</small></button>';
    });
    html += '</div>';

    // Podia met minstens één getimed blok (vaste volgorde uit data.stages)
    var stagesWithContent = DATA.stages.filter(function (st) {
      return data.timed.some(function (t) { return t.stage === st; });
    });

    // ---- Doorlopend tijd-grid ----
    html += '<div class="schedule-scroll"><div class="schedule-grid" style="' +
      'grid-template-columns:' + STAGE_LABEL_WIDTH + 'px repeat(' + totalHours +
      ', ' + HOUR_WIDTH + 'px);' +
      'grid-template-rows:22px 30px repeat(' + stagesWithContent.length + ', 58px);' +
      'width:' + gridWidth + 'px;">';

    // Rij 1: hoek (spant 2 kop-rijen) + dag-banden
    html += '<div class="time-head corner" style="grid-row:1 / span 2;">Podium</div>';
    DATA.days.forEach(function (d) {
      var startH = dayGlobalStart(d.id);
      var nextIdx = dayIndex(d.id) + 1;
      var endH = Math.min(nextIdx * 24, totalHours);
      var span = endH - startH;
      if (span <= 0) return;
      html += '<div class="day-band' + (dayIndex(d.id) > 0 ? " is-boundary" : "") +
        '" style="grid-row:1;grid-column:' + (2 + startH) + ' / span ' + span + ';">' +
        '<span class="day-band__txt">' + escapeHtml(d.label + ' · ' + d.datum) + '</span></div>';
    });

    // Rij 2: tijd-as (uur-labels), continu 12:00 → 23:00 dag erna
    for (var h = 0; h < totalHours; h++) {
      var clock = (FEST_START + h) % 24;
      var boundary = (h % 24 === 0 && h > 0) ? " is-boundary" : "";
      html += '<div class="time-head' + boundary + '" style="grid-row:2;grid-column:' +
        (2 + h) + ';">' + pad2(clock) + ':00</div>';
    }

    // Podium-rijen
    stagesWithContent.forEach(function (st, rowIdx) {
      var rowLine = rowIdx + 3; // rij 1 = dag-band, rij 2 = tijd-as
      html += '<div class="stage-label" style="grid-row:' + rowLine + ';grid-column:1;' +
        '--stage-color:' + stageColor(st) + '">' +
        '<span class="stage-label__swatch"></span>' + escapeHtml(st) + '</div>';

      html += '<div class="stage-row-bg" style="grid-row:' + rowLine +
        ';grid-column:2 / span ' + totalHours + ';position:relative;">';

      data.timed.filter(function (t) { return t.stage === st; })
        .forEach(function (t) {
          var left = t.gStart * HOUR_WIDTH;
          var clampedEnd = Math.min(t.gEnd, totalHours);
          var width = (clampedEnd - t.gStart) * HOUR_WIDTH;
          if (width < 26) width = 26;
          var fav = isFav(t.artist.id);
          html += '<button class="sched-block' +
            (t.artist.tip ? " is-tip" : "") + (fav ? " is-fav" : "") + '" ' +
            'data-artist="' + escapeHtml(t.artist.id) + '" ' +
            'style="left:' + left + 'px;width:' + (width - 4) + 'px;' +
            'background:' + stageColor(st) + '">' +
            '<span class="sched-block__name">' + escapeHtml(t.artist.name) + '</span>' +
            '<span class="sched-block__time">' + escapeHtml(t.slot.start + "–" + t.slot.end) + '</span>' +
            (fav ? '<span class="fav-corner">❤️</span>' : '') +
          '</button>';
        });

      html += '</div>'; // stage-row-bg
    });

    // Verticale scheidslijnen op dag-grenzen (za 12:00, zo 12:00) over de hele hoogte
    DATA.days.forEach(function (d) {
      if (dayIndex(d.id) === 0) return;
      var x = STAGE_LABEL_WIDTH + dayGlobalStart(d.id) * HOUR_WIDTH;
      html += '<div class="day-divider" style="left:' + x + 'px;"></div>';
    });

    html += '</div></div>'; // schedule-grid + scroll

    html += '<p class="schedule-hint">Sleep het schema naar links/rechts — het loopt ' +
      'door van vrijdag t/m zondagavond, de nacht incluis. Tik op een dag om erheen ' +
      'te springen, of op een blok voor info. ❤️ = jouw favoriet.</p>';

    // ---- "Verder deze dag" (slots zonder tijd), gegroepeerd per dag ----
    DAY_ORDER.forEach(function (dayId) {
      var byStage = data.untimedByDay[dayId];
      if (!byStage) return;
      var stages = DATA.stages.filter(function (st) { return byStage[st]; });
      if (!stages.length) return;
      var day = dayById[dayId];
      html += '<div class="no-time-section">' +
        '<div class="section-title">Verder op ' +
        escapeHtml(day ? day.label.toLowerCase() : dayId) + ' (tijd nog onbekend)</div>';
      stages.forEach(function (st) {
        html += '<div class="no-time-stage" style="--stage-color:' + stageColor(st) + '">' +
          '<div class="no-time-stage__head"><span class="swatch"></span>' +
          escapeHtml(st) + '</div><div class="no-time-chips">';
        byStage[st].forEach(function (item) {
          var fav = isFav(item.artist.id);
          html += '<button class="no-time-chip' + (fav ? " is-fav" : "") + '" ' +
            'data-artist="' + escapeHtml(item.artist.id) + '">' +
            (item.artist.tip ? "★ " : "") +
            escapeHtml(item.artist.name) + '</button>';
        });
        html += '</div></div>';
      });
      html += '</div>';
    });

    el("view").innerHTML = html;

    // Dag-knoppen: smooth-scroll (jump) naar 12:00 van die dag, geen re-render.
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.addEventListener("click", function () {
        var dayId = b.getAttribute("data-day");
        var sc = document.querySelector(".schedule-scroll");
        setActiveDayBtn(dayId);
        smoothScrollLeft(sc, dayScrollLeft(dayId), 450);
        // Houd de URL netjes zonder een re-render/hashchange te forceren.
        if (history.replaceState) history.replaceState(null, "", "#schema/" + dayId);
      });
    });

    document.querySelectorAll(".sched-block[data-artist], .no-time-chip[data-artist]")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          location.hash = "artiest/" + b.getAttribute("data-artist");
        });
      });

    // Scroll-spy: actieve dag-knop volgt de horizontale scrollpositie.
    var sc = document.querySelector(".schedule-scroll");
    if (sc) sc.addEventListener("scroll", onScheduleScroll, { passive: true });
  }

  // ---- Vloeiende jump-scroll (eigen rAF-animatie, werkt overal) ----
  var programmaticScroll = false;
  var jumpTimer = null;
  var jumpToken = 0; // invalideert een lopende animatie zodra er een nieuwe start
  function smoothScrollLeft(el, target, duration) {
    if (!el) return;
    clearTimeout(jumpTimer);
    jumpToken++;
    var myToken = jumpToken;
    var start = el.scrollLeft;
    var dist = target - start;
    duration = duration || 450;
    programmaticScroll = true; // onderdruk de spy tijdens de animatie
    var done = false;
    function finish() {
      if (done || myToken !== jumpToken) return; // al klaar of vervangen
      done = true;
      el.scrollLeft = target;
      programmaticScroll = false;
      updateDaySpy();
    }
    if (Math.abs(dist) < 1) { finish(); return; }
    var t0 = null;
    function ease(p) { return p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; } // easeInOutQuad
    function step(ts) {
      if (done || myToken !== jumpToken) return; // afgebroken
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / duration, 1);
      el.scrollLeft = Math.round(start + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else finish();
    }
    requestAnimationFrame(step);
    // Vangnet: mocht rAF gethrottled/gepauzeerd zijn (verborgen tab e.d.), dan
    // landt deze timeout ons alsnog netjes op de juiste plek (whoever-first-wins).
    jumpTimer = setTimeout(finish, duration + 400);
  }

  // ---- Scroll-spy voor het doorlopende schema ----
  var spyTicking = false;
  function onScheduleScroll() {
    if (programmaticScroll) return; // geen spy tijdens een jump (voorkomt geflikker)
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(function () {
      spyTicking = false;
      updateDaySpy();
    });
  }
  // Bepaal welke dag het (net na de linkerrand) van de viewport raakt en markeer die.
  function updateDaySpy() {
    var sc = document.querySelector(".schedule-scroll");
    if (!sc) return;
    // Probe iets voorbij de sticky podium-kolom, zodat de "actieve" dag die is
    // waarvan de blokken links in beeld staan.
    var probeX = sc.scrollLeft + STAGE_LABEL_WIDTH + HOUR_WIDTH * 0.5;
    var gHour = (probeX - STAGE_LABEL_WIDTH) / HOUR_WIDTH; // 0..59
    var dayId = gHour < 24 ? "vr" : (gHour < 48 ? "za" : "zo");
    setActiveDayBtn(dayId);
  }
  function setActiveDayBtn(dayId) {
    currentDay = dayId;
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-day") === dayId);
    });
  }

  // ======================================================================
  //  TAB 4: MIJN SCHEMA (favorieten)
  // ======================================================================
  function renderMySchedule() {
    currentView = "mijn";

    if (favs.length === 0) {
      el("view").innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state__emoji">❤️</div>' +
          '<h2>Nog geen favorieten</h2>' +
          '<p>Tik bij een artiest op het <span class="heart-inline">🤍 hartje</span> ' +
          'om ’m toe te voegen. Je favorieten verschijnen hier als persoonlijk tijdschema.</p>' +
          '<p class="muted">Ze worden op dit apparaat/deze browser opgeslagen.</p>' +
        '</div>';
      scrollTop();
      return;
    }

    // Verzamel favoriete slots (getimed) en favoriete artiesten zonder tijd
    var perDay = {};     // dayId -> [ {artist, slot, absStart, absEnd} ]
    var noTimeFavs = [];  // artiesten die favoriet zijn maar geen enkele getimede slot

    DAY_ORDER.forEach(function (d) { perDay[d] = []; });

    favs.forEach(function (id) {
      var a = byId[id];
      if (!a) return;
      var timedSlots = (a.slots || []).filter(function (s) {
        return s.start != null && s.end != null;
      });
      if (timedSlots.length === 0) {
        noTimeFavs.push(a);
        return;
      }
      timedSlots.forEach(function (s) {
        if (!perDay[s.day]) perDay[s.day] = [];
        perDay[s.day].push({
          artist: a, slot: s,
          absStart: absHour(s.start),
          absEnd: absEndHour(s.start, s.end)
        });
      });
    });

    var html = '';

    DAY_ORDER.forEach(function (dayId) {
      var items = perDay[dayId];
      if (!items || items.length === 0) return;
      items.sort(function (x, y) { return x.absStart - y.absStart; });

      // Overlap-detectie (chronologisch): markeer elke overlap met eerdere favoriet
      items.forEach(function (item, i) {
        item.overlaps = [];
        for (var j = 0; j < items.length; j++) {
          if (j === i) continue;
          var other = items[j];
          // overlap als start < other.end EN other.start < end
          if (item.absStart < other.absEnd && other.absStart < item.absEnd) {
            item.overlaps.push(other.artist.name);
          }
        }
      });

      var day = dayById[dayId];
      html += '<div class="myday"><div class="myday__head">' +
        escapeHtml(day.label) + ' · ' + escapeHtml(day.datum) + '</div>' +
        '<div class="timeline">';

      items.forEach(function (item) {
        var s = item.slot;
        var color = stageColor(s.stage);
        var overlapHtml = "";
        if (item.overlaps.length) {
          overlapHtml = '<div class="tl-overlap">⚠️ overlapt met ' +
            escapeHtml(item.overlaps.join(", ")) + '</div>';
        }
        var extras = "";
        if (s.live) extras += '<span class="tag-live">LIVE</span>';
        if (s.label) extras += '<span class="tag-label">' + escapeHtml(s.label) + '</span>';

        html += '<button class="tl-item" data-artist="' + escapeHtml(item.artist.id) +
          '" style="--stage-color:' + color + '">' +
          '<div class="tl-item__time">' + escapeHtml(s.start + "–" + s.end) +
            (isNight(s) ? '<br><small class="muted">’s nachts</small>' : '') + '</div>' +
          '<div class="tl-item__body">' +
            '<div class="tl-item__name">' + escapeHtml(item.artist.name) +
              (item.artist.tip ? '<span class="tip-badge">★</span>' : '') + extras + '</div>' +
            '<div class="tl-item__stage">📍 ' + escapeHtml(s.stage) + '</div>' +
            overlapHtml +
          '</div>' +
          '<span class="tl-heart">❤️</span>' +
        '</button>';
      });

      html += '</div></div>';
    });

    if (noTimeFavs.length) {
      noTimeFavs.sort(function (a, b) { return a.name.localeCompare(b.name, "nl"); });
      html += '<div class="myday no-time-fav-section">' +
        '<div class="myday__head">Nog geen tijd bekend</div>' +
        '<div class="no-time-chips">';
      noTimeFavs.forEach(function (a) {
        html += '<button class="no-time-chip is-fav" data-artist="' + escapeHtml(a.id) + '">' +
          (a.tip ? "★ " : "") + escapeHtml(a.name) + '</button>';
      });
      html += '</div></div>';
    }

    el("view").innerHTML = html;

    document.querySelectorAll("[data-artist]").forEach(function (b) {
      b.addEventListener("click", function () {
        location.hash = "artiest/" + b.getAttribute("data-artist");
      });
    });

    scrollTop();
  }

  // ---- Start ----
  if (!location.hash) {
    // Zet default-hash zonder history-entry; triggert hashchange -> route().
    location.replace("#artiesten");
  }
  // Render meteen de huidige (of zojuist gezette) hash.
  route();
})();
