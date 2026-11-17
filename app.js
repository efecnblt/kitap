(() => {
  "use strict";

  const GENRES = {
    polisiye: { label: "Polisiye", emoji: "🔍", subjects: ["detective_and_mystery_stories", "mystery", "crime"] },
    ask: { label: "Aşk", emoji: "❤️", subjects: ["love_stories", "romance"] },
    drama: { label: "Drama", emoji: "🎭", subjects: ["domestic_fiction", "psychological_fiction", "family_saga"] },
  };

const BOOKMARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z"/></svg>`;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---- Durum ----
  let books = (window.CURATED_BOOKS || []).map((b) => ({
    id: "c-" + b.isbn,
    genre: b.g,
    title: b.t,
    author: b.a,
    summary: b.s,
    cover: `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg?default=false`,
    link: `https://openlibrary.org/isbn/${b.isbn}`,
    live: false,
  }));
  // Daha önce internetten keşfedilen kitapları geri yükle
  const savedLive = store.get("liveBooks", []);
  books = books.concat(savedLive.filter((b) => !books.some((x) => x.id === b.id)));

  let filter = "all";
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

  function hydrateCovers(root, getBook) {
    $$(".cover", root).forEach((el) => {
      const img = el.querySelector("img");
      if (!img) return;
      const b = getBook(el);
      if (!b.cover) return fakeCover(el, b);
      img.onload = () => {
        // Open Library bazen 1x1 boş görsel döndürür
        if (img.naturalWidth < 10) return fakeCover(el, b);
        img.classList.add("loaded");
        el.querySelector(".shimmer")?.remove();
      };
      img.onerror = () => fakeCover(el, b);
      img.src = img.dataset.src;
    });
  }

  // ---- Liste ----
  function visibleBooks() {
    const q = norm(query.trim());
    return books.filter((b) =>
      (filter === "all" || b.genre === filter) &&
      (!showFavs || favs.has(b.id)) &&
      (!q || norm(b.title + " " + b.author).includes(q))
    );
  }

  function render() {
    const list = visibleBooks();
    const grid = $("#grid");
    const gLabel = filter === "all" ? "Tüm türler" : GENRES[filter].label;
    $("#listTitle").textContent = showFavs
      ? `Okuma listem · ${list.length} kitap`
      : `${gLabel} · ${list.length} kitap`;

    if (!list.length) {
      grid.innerHTML = showFavs
        ? `<div class="empty"><b>Listen henüz boş</b>Kapakların köşesindeki işarete dokunarak kitap ekleyebilirsin.</div>`
        : `<div class="empty"><b>Sonuç yok</b>Bu aramayla eşleşen kitap bulunamadı.</div>`;
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
    const pool = books.filter((b) => diceGenre === "all" || b.genre === diceGenre);
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

  // ---- Başlat ----
  books = shuffle(books.slice());
  updateFavBadge(false);
  render();
})();
