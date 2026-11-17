(() => {
  "use strict";

  const GENRES = {
    polisiye: { label: "Polisiye", emoji: "🔍", subjects: ["detective_and_mystery_stories", "mystery", "crime"] },
    ask: { label: "Aşk", emoji: "❤️", subjects: ["love_stories", "romance"] },
    drama: { label: "Drama", emoji: "🎭", subjects: ["domestic_fiction", "psychological_fiction", "family_saga"] },
  };

  const TOPICS = {
    turk: "Türk edebiyatı", klasik: "Klasik", dedektif: "Dedektif", "seri-katil": "Seri katil",
    psikolojik: "Psikolojik", gerilim: "Gerilim", kapali: "Kapalı mekân gizemi", iskandinav: "İskandinav",
    mahkeme: "Hukuk & mahkeme", casus: "Casusluk", gercek: "Gerçek olay", tarihi: "Tarihi",
    ilk: "İlk aşk", ayrilik: "Ayrılık", yasak: "Yasak aşk", imkansiz: "İmkânsız aşk", ikinci: "İkinci şans",
    komedi: "Eğlenceli", huzun: "Hüzünlü", genc: "Gençlik", aile: "Aile", savas: "Savaş", yas: "Kayıp & yas",
    varolus: "Varoluş & anlam", toplum: "Toplumsal", buyume: "Büyüme", goc: "Göç", kadin: "Kadın hikâyeleri",
    dostluk: "Dostluk", hayatta: "Hayatta kalma",
  };
  const BOOKMARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z"/></svg>`;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---- Durum ----
  const slug = (s) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const DATA = window.BOOK_DATA || {};
  let books = Object.keys(DATA).flatMap((g) => DATA[g].map(([t, a, o, isbn, k, s]) => ({
    id: "c-" + (isbn || slug(t + "-" + a)),
    genre: g,
    title: t,
    author: a,
    orig: o || t,
    summary: s,
    tags: k.split(",").filter(Boolean),
    cover: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null,
    needsLookup: !isbn,
    link: `https://www.google.com/search?q=${encodeURIComponent(t + " " + a + " kitap")}`,
    live: false,
  })));
  // Daha önce internetten keşfedilen kitapları geri yükle
  const savedLive = store.get("liveBooks", []);
  books = books.concat(savedLive.filter((b) => !books.some((x) => x.id === b.id)));

  let filter = "all";
  const topics = new Set();
  let query = "";
  let showFavs = false;
  let favs = new Set(store.get("favs", []));
  const livePage = store.get("livePage", {});

  // ---- Yardımcılar ----
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function coverHTML(b) {
    return `<div class="cover">
      <div class="shimmer"></div>
      <img alt="${esc(b.title)} kapağı" loading="lazy" decoding="async" data-src="${esc(b.cover)}" />
    </div>`;
  }

  function fakeCover(el, b) {
    el.querySelector(".shimmer")?.remove();
    el.querySelector("img")?.remove();
    if (el.querySelector(".fake-cover")) return;
    const d = document.createElement("div");
    d.className = "fake-cover " + b.genre;
    d.innerHTML = `<span class="ft">${esc(b.title)}</span><span class="fa">${esc(b.author)}</span>`;
    el.appendChild(d);
  }

  // ---- Kapak bulma: ISBN'i olmayan kitaplar için Open Library'de isimle ara ----
  const coverCache = store.get("coverCache2", {});
  const lookupQueue = [];
  let lookupsRunning = 0;
  function lookupCover(b) {
    if (b.id in coverCache) return Promise.resolve(coverCache[b.id]);
    if (b._lookup) return b._lookup;
    b._lookup = new Promise((resolve) => { lookupQueue.push({ b, resolve }); pumpLookups(); });
    return b._lookup;
  }
  function pumpLookups() {
    while (lookupsRunning < 4 && lookupQueue.length) {
      const { b, resolve } = lookupQueue.shift();
      lookupsRunning++;
      (async () => {
        let id = 0;
        let failed = false;
        const surname = b.author.split(" ").pop();
        const tries = [
          `title=${encodeURIComponent(b.orig)}&author=${encodeURIComponent(surname)}`,
          b.orig !== b.title ? `title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(surname)}` : null,
        ].filter(Boolean);
        for (const q of tries) {
          try {
            const r = await fetchJSON(`https://openlibrary.org/search.json?${q}&limit=5&fields=cover_i`, 10000);
            const hit = (r.docs || []).find((d) => d.cover_i);
            if (hit) { id = hit.cover_i; break; }
          } catch { failed = true; }
        }
        // Ağ hatasında önbelleğe yazma, sonra tekrar denensin
        if (!failed || id) { coverCache[b.id] = id; store.set("coverCache2", coverCache); }
        resolve(id);
      })().finally(() => { lookupsRunning--; pumpLookups(); });
    }
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      if (en.target._start) en.target._start();
    });
  }, { rootMargin: "400px 0px" }) : null;

  function hydrateCovers(root, getBook) {
    $$(".cover", root).forEach((el) => {
      const img = el.querySelector("img");
      if (!img) return;
      const b = getBook(el);
      if (b.needsLookup && !b.cover) {
        const start = () => lookupCover(b).then((cid) => {
          if (!cid) return fakeCover(el, b);
          b.cover = `https://covers.openlibrary.org/b/id/${cid}-M.jpg`;
          img.dataset.src = b.cover;
          loadImg(el, img, b);
        });
        if (io) { el._start = start; io.observe(el); } else start();
        return;
      }
      if (!b.cover) return fakeCover(el, b);
      loadImg(el, img, b);
    });
  }
  function loadImg(el, img, b) {
    {
      img.onload = () => {
        // Open Library bazen 1x1 boş görsel döndürür
        if (img.naturalWidth < 10) return fakeCover(el, b);
        img.classList.add("loaded");
        el.querySelector(".shimmer")?.remove();
      };
      img.onerror = () => fakeCover(el, b);
      img.src = img.dataset.src;
    }
  }

  // ---- Liste ----
  function visibleBooks() {
    const q = norm(query.trim());
    return books.filter((b) =>
      (filter === "all" || b.genre === filter) &&
      matchTopics(b) &&
      (!showFavs || favs.has(b.id)) &&
      (!q || norm(b.title + " " + b.author).includes(q))
    );
  }

  const matchTopics = (b) => [...topics].every((t) => b.tags && b.tags.includes(t));

  function renderTopics() {
    const base = books.filter((b) => (filter === "all" || b.genre === filter) && (!showFavs || favs.has(b.id)));
    const counts = {};
    base.forEach((b) => (b.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    const keys = Object.keys(TOPICS).filter((t) => counts[t] || topics.has(t));
    const rank = (t) => (topics.has(t) ? 0 : t === "turk" ? 1 : 2);
    keys.sort((a, b) => rank(a) - rank(b) || (counts[b] || 0) - (counts[a] || 0));
    const pool = base.filter(matchTopics);
    const el = $("#topics");
    el.innerHTML = keys.map((t) => {
      const on = topics.has(t);
      const n = on ? pool.length : pool.filter((b) => b.tags && b.tags.includes(t)).length;
      if (!on && !n) return "";
      return `<button class="topic ${on ? "active" : ""}" data-t="${t}">${TOPICS[t]}<span>${n}</span></button>`;
    }).join("");
    el.scrollLeft = 0;
    $("#clearTopics").hidden = !topics.size;
  }

  function render() {
    renderTopics();
    const list = visibleBooks();
    const grid = $("#grid");
    const gLabel = (filter === "all" ? "Tüm türler" : GENRES[filter].label) + [...topics].map((t) => " · " + TOPICS[t]).join("");
    $("#listTitle").textContent = showFavs
      ? `Okuma listem · ${list.length} kitap`
      : `${gLabel} · ${list.length} kitap`;

    if (!list.length) {
      grid.innerHTML = showFavs
        ? `<div class="empty"><b>Listen henüz boş</b>Kapakların köşesindeki işarete dokunarak kitap ekleyebilirsin.</div>`
        : `<div class="empty"><b>Sonuç yok</b>Bu filtrelerle eşleşen kitap bulunamadı. Bir konuyu kaldırmayı dene.</div>`;
      return;
    }

    grid.innerHTML = list.map((b, i) => `
      <article class="card" data-id="${esc(b.id)}" style="--i:${Math.min(i, 14)}" tabindex="0">
        <button class="fav-btn ${favs.has(b.id) ? "on" : ""}" data-fav="${esc(b.id)}" aria-label="Okuma listesine ekle">${BOOKMARK}</button>
        ${coverHTML(b)}
        <div class="info">
          <span class="genre-label"><span class="dot ${b.genre}"></span>${GENRES[b.genre].label}</span>
          <h3>${esc(b.title)}</h3>
          <span class="author">${esc(b.author)}</span>
          <p class="sum">${esc(b.summary)}</p>
          ${b.live ? `<span class="live-dot">Open Library'den</span>` : ""}
        </div>
      </article>`).join("");

    hydrateCovers(grid, (el) => byId(el.closest(".card").dataset.id));
  }

  const favBtnInner = (on) => `${BOOKMARK}${on ? "Listemde" : "Listeme ekle"}`;
  const byId = (id) => books.find((b) => b.id === id);

  // ---- Okuma listesi ----
  function updateFavBadge(pop) {
    const badge = $("#favCount");
    badge.textContent = favs.size;
    badge.classList.toggle("show", favs.size > 0);
    if (pop) { badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop"); }
  }

  function toggleFav(id) {
    const had = favs.has(id);
    had ? favs.delete(id) : favs.add(id);
    store.set("favs", [...favs]);
    // Okuma listesindeki canlı kitapları kalıcı tut
    persistLive();
    updateFavBadge(true);
    toast(had ? "Listeden çıkarıldı" : "Okuma listene eklendi");
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((btn) => {
      btn.classList.toggle("on", !had);
      if (btn.classList.contains("btn")) btn.innerHTML = favBtnInner(!had);
    });
    if (showFavs) render();
  }

  // ---- Detay paneli ----
  function openSheet(b) {
    $("#sheetBody").innerHTML = `
      <div class="detail-top">
        ${coverHTML(b)}
        <div>
          <span class="genre-label"><span class="dot ${b.genre}"></span>${GENRES[b.genre].label}</span>
          <h2 id="sheetTitle">${esc(b.title)}</h2>
          <div class="author">${esc(b.author)}</div>
        </div>
      </div>
      <p class="detail-sum">${esc(b.summary)}</p>
      <div class="detail-actions">
        <button class="btn ${favs.has(b.id) ? "on" : ""}" data-fav="${esc(b.id)}">${favBtnInner(favs.has(b.id))}</button>
        <a class="btn primary" href="${esc(b.link)}" target="_blank" rel="noopener">Kitaba göz at</a>
      </div>`;
    hydrateCovers($("#sheetBody"), () => b);
    $("#sheet").classList.add("open");
    $("#sheetBackdrop").classList.add("open");
    document.body.classList.add("lock");
  }
  function closeSheet() {
    $("#sheet").classList.remove("open");
    $("#sheetBackdrop").classList.remove("open");
    if (!$("#diceModal").classList.contains("open")) document.body.classList.remove("lock");
  }

  // Aşağı kaydırarak kapatma
  (() => {
    const sheet = $("#sheet");
    let y0 = null, dy = 0;
    sheet.addEventListener("touchstart", (e) => { if (sheet.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) { sheet.style.transition = "none"; sheet.style.transform = `translateY(${dy}px)`; }
    }, { passive: true });
    sheet.addEventListener("touchend", () => {
      sheet.style.transition = ""; sheet.style.transform = "";
      if (dy > 110) closeSheet();
      y0 = null;
    });
  })();

  // ---- İnternetten keşif (Open Library) ----
  function persistLive() {
    // Son 120 canlı kitabı sakla (listeye eklenenler her zaman kalır)
    const live = books.filter((b) => b.live);
    const keep = live.filter((b) => favs.has(b.id)).concat(live.filter((b) => !favs.has(b.id)).slice(-120));
    store.set("liveBooks", keep);
  }

  function cleanText(t) {
    if (!t) return "";
    if (typeof t === "object") t = t.value || "";
    return t
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\r/g, "")
      .split(/\n-{3,}|\n\s*\n\(?source|\n\s*\n\*\*?|----------/i)[0]
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function shorten(t, n = 320) {
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const dot = cut.lastIndexOf(". ");
    return (dot > 140 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, "") + "…");
  }

  async function fetchJSON(url, ms = 12000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function discover(genre) {
    const g = GENRES[genre];
    const subject = g.subjects[(Math.random() * g.subjects.length) | 0];
    const key = genre + ":" + subject;
    const page = (livePage[key] || 0);
    livePage[key] = page + 1;
    store.set("livePage", livePage);

    const data = await fetchJSON(`https://openlibrary.org/subjects/${subject}.json?limit=24&offset=${page * 24}`);
    const works = shuffle((data.works || []).filter((w) => w.cover_id && w.title));
    const fresh = works.filter((w) => !books.some((b) => b.id === "ol-" + w.key || norm(b.title) === norm(w.title))).slice(0, 8);

    const results = await Promise.all(fresh.map(async (w) => {
      let summary = "";
      try {
        const det = await fetchJSON(`https://openlibrary.org${w.key}.json`, 9000);
        summary = cleanText(det.description) || cleanText(det.first_sentence);
      } catch {}
      if (!summary) return null; // Özetsiz kitapları gösterme
      return {
        id: "ol-" + w.key,
        genre,
        title: w.title,
        author: (w.authors || []).map((a) => a.name).slice(0, 2).join(", ") || "Bilinmeyen yazar",
        summary: shorten(summary),
        cover: `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`,
        link: `https://openlibrary.org${w.key}`,
        live: true,
      };
    }));
    return results.filter(Boolean);
  }

  async function loadMore() {
    const btn = $("#moreBtn"), note = $("#moreNote");
    btn.classList.add("loading");
    note.textContent = "Open Library'den kitaplar getiriliyor…";
    try {
      const genres = filter === "all" ? Object.keys(GENRES) : [filter];
      const batches = await Promise.allSettled(genres.map(discover));
      const added = batches.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      if (!added.length) {
        note.textContent = batches.every((r) => r.status === "rejected")
          ? "İnternet bağlantısı kurulamadı, biraz sonra tekrar dene."
          : "Bu sefer özeti olan yeni kitap çıkmadı, bir daha dene.";
      } else {
        // Yeni kitapları listenin başına ekle
        books = added.concat(books);
        persistLive();
        showFavs = false; $("#favToggle").classList.remove("on");
        render();
        note.textContent = `${added.length} yeni kitap eklendi. Bu kitapların özetleri orijinal dilinde olabilir.`;
        $("#grid").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (e) {
      note.textContent = "Kitaplar getirilemedi, tekrar dene.";
    } finally {
      btn.classList.remove("loading");
    }
  }

  // ---- Zar modu ----
  let diceGenre = "all";
  let rolling = false;
  let lastPick = null;
  let rot = { x: -22, y: 32 };
  const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };

  function openDice() {
    diceGenre = filter;
    $("#diceTopics").textContent = topics.size ? "Konular: " + [...topics].map((t) => TOPICS[t]).join(", ") : "";
    $$("#diceGenres .chip").forEach((c) => c.classList.toggle("active", c.dataset.g === diceGenre));
    $("#diceModal").classList.add("open");
    $("#diceModal").classList.remove("revealed");
    $("#diceResult").innerHTML = "";
    $("#rollLabel").textContent = "Zarı at";
    $("#cube").classList.add("idle");
    document.body.classList.add("lock");
    setTimeout(roll, 450);
  }
  function closeDice() {
    $("#diceModal").classList.remove("open");
    if (!$("#sheet").classList.contains("open")) document.body.classList.remove("lock");
  }

  function roll() {
    if (rolling) return;
    let pool = books.filter((b) => (diceGenre === "all" || b.genre === diceGenre) && matchTopics(b));
    if (!pool.length) {
      pool = books.filter((b) => diceGenre === "all" || b.genre === diceGenre);
      if (topics.size) toast("Seçili konularda kitap yok, türün tamamından atıldı");
    }
    if (!pool.length) return toast("Bu türde kitap yok");
    rolling = true;
    $("#rollAgain").disabled = true;

    const modal = $("#diceModal");
    const cube = $("#cube"), scene = $(".scene");
    if (modal.classList.contains("revealed")) {
      const card = $(".result-card");
      if (card) { card.style.transition = "opacity .25s, transform .25s"; card.style.opacity = "0"; card.style.transform = "translateY(20px) scale(.96)"; }
      modal.classList.remove("revealed");
    }

    let pick;
    do { pick = pool[(Math.random() * pool.length) | 0]; } while (pool.length > 1 && pick === lastPick);
    lastPick = pick;

    const face = 1 + ((Math.random() * 6) | 0);
    const [fx, fy] = FACE_ROT[face];
    // Her atışta birkaç tam tur ekle
    const spinsX = 2 + ((Math.random() * 2) | 0), spinsY = 2 + ((Math.random() * 2) | 0);
    rot.x = Math.ceil(rot.x / 360) * 360 + spinsX * 360 + fx - 18;
    rot.y = Math.ceil(rot.y / 360) * 360 + spinsY * 360 + fy + 22;

    cube.classList.remove("idle");
    void cube.offsetWidth;
    cube.classList.add("rolling");
    cube.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
    scene.classList.remove("bounce"); void scene.offsetWidth; scene.classList.add("bounce");
    if (navigator.vibrate) navigator.vibrate([20, 60, 20, 80, 15]);

    setTimeout(() => {
      cube.classList.remove("rolling");
      rolling = false;
      $("#rollAgain").disabled = false;
      $("#rollLabel").textContent = "Tekrar at";
      reveal(pick);
    }, 1650);
  }

  function reveal(b) {
    const modal = $("#diceModal");
    modal.classList.add("revealed");
    $("#diceResult").innerHTML = `
      <div class="result-card">
        <div class="kicker">Bugünün kitabı</div>
        ${coverHTML(b)}
        <span class="genre-label"><span class="dot ${b.genre}"></span>${GENRES[b.genre].label}</span>
        <h3>${esc(b.title)}</h3>
        <div class="author">${esc(b.author)}</div>
        <p>${esc(b.summary)}</p>
        <div class="detail-actions">
          <button class="btn ${favs.has(b.id) ? "on" : ""}" data-fav="${esc(b.id)}">${favBtnInner(favs.has(b.id))}</button>
          <a class="btn primary" href="${esc(b.link)}" target="_blank" rel="noopener">Göz at</a>
        </div>
      </div>`;
    hydrateCovers($("#diceResult"), () => b);
  }

  function confetti() {
    const box = $("#confetti");
    const colors = ["#ffb547", "#ff6b8b", "#b57bff", "#5b8cff", "#7ee2a8", "#fff"];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("i");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--x", (Math.random() * 200 - 100) + "px");
      c.style.setProperty("--r", (Math.random() * 1080 - 540) + "deg");
      c.style.setProperty("--d", (1.4 + Math.random() * 1.4) + "s");
      c.style.animationDelay = Math.random() * 0.3 + "s";
      if (Math.random() > .5) { c.style.width = "7px"; c.style.height = "7px"; c.style.borderRadius = "50%"; }
      frag.appendChild(c);
    }
    box.appendChild(frag);
    setTimeout(() => (box.innerHTML = ""), 3200);
  }

  // ---- Toast ----
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 1900);
  }

  // ---- Olaylar ----
  $("#topics").addEventListener("click", (e) => {
    const c = e.target.closest(".topic");
    if (!c || c.disabled) return;
    const t = c.dataset.t;
    topics.has(t) ? topics.delete(t) : topics.add(t);
    render();
  });
  $("#clearTopics").addEventListener("click", () => { topics.clear(); render(); });

  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    filter = c.dataset.g;
    $$("#chips .chip").forEach((x) => x.classList.toggle("active", x === c));
    c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    render();
  });

  let searchT;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { query = e.target.value; render(); }, 150);
  });

  document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
    const card = e.target.closest(".card");
    if (card) openSheet(byId(card.dataset.id));
  });
  $("#grid").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("card")) openSheet(byId(e.target.dataset.id));
  });

  $("#favToggle").addEventListener("click", () => {
    showFavs = !showFavs;
    $("#favToggle").classList.toggle("on", showFavs);
    render();
    window.scrollTo({ top: $(".chips").offsetTop - 70, behavior: "smooth" });
  });

  $("#sheetBackdrop").addEventListener("click", closeSheet);
  $("#moreBtn").addEventListener("click", loadMore);
  $("#rollBtn").addEventListener("click", openDice);
  $("#rollAgain").addEventListener("click", roll);
  $(".scene").addEventListener("click", roll);
  $("#diceClose").addEventListener("click", closeDice);
  $("#diceGenres").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    diceGenre = c.dataset.g;
    $$("#diceGenres .chip").forEach((x) => x.classList.toggle("active", x === c));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("#sheet").classList.contains("open")) closeSheet();
    else if ($("#diceModal").classList.contains("open")) closeDice();
  });

  // ---- Karşılama ve kaydırma ----
  const welcome = $("#welcome");
  if (welcome) {
    let seen = null; try { seen = sessionStorage.getItem("welcomed"); } catch {}
    setTimeout(() => welcome.classList.add("hide"), seen ? 50 : 1900);
    setTimeout(() => welcome.remove(), seen ? 700 : 2600);
    try { sessionStorage.setItem("welcomed", "1"); } catch {}
  }
  const top = $(".top");
  addEventListener("scroll", () => top.classList.toggle("scrolled", scrollY > 8), { passive: true });

  // ---- Fotoğraf gönder ----
  (() => {
    const file = $("#sendFile"), btn = $("#sendBtn"), status = $("#sendStatus");
    const preview = $("#sendPreview"), empty = $("#sendEmpty");
    let blob = null;

    // Fotoğrafı tarayıcıda küçült (en uzun kenar 1800px, JPEG)
    async function shrink(f) {
      const url = URL.createObjectURL(f);
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
      } finally { URL.revokeObjectURL(url); }
    }

    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      status.className = "send-status";
      status.textContent = "Hazırlanıyor…";
      btn.disabled = true;
      try {
        blob = await shrink(f);
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(blob);
        preview.hidden = false; empty.hidden = true;
        status.textContent = "";
        btn.disabled = false;
      } catch {
        blob = null;
        status.textContent = "Bu dosya açılamadı, başka bir fotoğraf dene.";
      }
    });

    btn.addEventListener("click", async () => {
      if (!blob) return;
      btn.disabled = true;
      btn.textContent = "Gönderiliyor…";
      status.className = "send-status";
      status.textContent = "";
      try {
        const r = await fetch("/api/upload", {
          method: "POST",
          headers: { "content-type": "image/jpeg", "x-not": encodeURIComponent($("#sendNote").value.trim()) },
          body: blob,
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Gönderilemedi");
        status.className = "send-status ok";
        status.textContent = "Gönderildi, teşekkürler!";
        toast("Fotoğraf gönderildi");
        blob = null; file.value = ""; $("#sendNote").value = "";
        preview.hidden = true; empty.hidden = false;
      } catch (e) {
        status.textContent = (e && e.message && e.message !== "Failed to fetch" ? e.message : "Gönderilemedi") + ". Biraz sonra tekrar dene.";
        btn.disabled = false;
      } finally {
        btn.textContent = "Gönder";
      }
    });
  })();

  // ---- Başlat ----
  books = shuffle(books.slice());
  updateFavBadge(false);
  render();
})();
