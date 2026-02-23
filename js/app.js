import { openModal, closeModal } from "./ui.js";

const state = {
  toc: null,
  refs: null,
  route: { chapterId: null, page: 1 }
};

const els = {
  reader: document.getElementById("reader"),
  pageMeta: document.getElementById("pageMeta"),
  tocNav: document.getElementById("tocNav"),
  tocDrawer: document.getElementById("tocDrawer"),
  btnToc: document.getElementById("btnToc"),
  btnCloseToc: document.getElementById("btnCloseToc"),
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  progressText: document.getElementById("progressText"),
  modal: document.getElementById("modal"),
  modalClose: document.getElementById("modalClose"),
  btnTheme: document.getElementById("btnTheme"),
  btnFont: document.getElementById("btnFont")
};

init();

async function init(){
  restorePrefs();
  await registerSW();

  state.toc = await loadJSON("content/toc.json");
  state.refs = await loadJSON("content/refs.json").catch(() => ({}));

  buildTOC();
  bindUI();
  restoreRouteFromStorageOrHash();
  await render();
}

function restorePrefs(){
  const fontSize = localStorage.getItem("ebook:fontSize");
  if (fontSize) document.documentElement.style.setProperty("--base-size", `${fontSize}px`);
  const theme = localStorage.getItem("ebook:theme");
  if (theme === "dark") document.body.classList.add("dark");
}

async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("./js/sw.js", { scope: "./" });
  }catch(e){
    console.warn("SW não registrado:", e);
  }
}

function bindUI(){
  window.addEventListener("hashchange", async () => {
    parseHashToRoute();
    await render();
  });

  els.btnPrev.addEventListener("click", () => nav(-1));
  els.btnNext.addEventListener("click", () => nav(1));

  els.btnToc.addEventListener("click", () => openToc(true));
  els.btnCloseToc.addEventListener("click", () => openToc(false));

  els.modal.addEventListener("click", (e) => {
    const close = e.target?.dataset?.close === "1";
    if (close) closeModal();
  });
  els.modalClose.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") nav(-1);
    if (e.key === "ArrowRight") nav(1);
  });

  els.btnTheme.addEventListener("click", toggleTheme);
  els.btnFont.addEventListener("click", cycleFontSize);
}

function openToc(open){
  els.tocDrawer.classList.toggle("open", open);
  els.tocDrawer.setAttribute("aria-hidden", open ? "false" : "true");
}

function buildTOC(){
  const nav = document.createElement("div");
  nav.className = "toc";

  state.toc.chapters.forEach(ch => {
    const a = document.createElement("a");
    a.href = routeToHash({ chapterId: ch.id, page: 1 });
    a.textContent = ch.title;
    a.dataset.chapter = ch.id;
    nav.appendChild(a);
  });

  els.tocNav.innerHTML = "";
  els.tocNav.appendChild(nav);
}

function restoreRouteFromStorageOrHash(){
  if (location.hash?.length > 1){
    parseHashToRoute();
    return;
  }
  const saved = safeJSON(localStorage.getItem("ebook:lastRoute"));
  if (saved?.chapterId){
    state.route = saved;
    location.hash = routeToHash(saved);
  }else{
    const first = state.toc.chapters[0];
    state.route = { chapterId: first.id, page: 1 };
    location.hash = routeToHash(state.route);
  }
}

function parseHashToRoute(){
  const raw = location.hash.replace("#", "");
  const parts = raw.split("/").filter(Boolean);
  const chapterId = parts[0] ?? state.toc.chapters[0].id;
  const page = Math.max(1, parseInt(parts[1] ?? "1", 10));
  state.route = { chapterId, page };
}

function routeToHash({ chapterId, page }){
  return `#/${chapterId}/${page}`;
}

async function render(){
  const { chapterId, page } = state.route;

  const chapter = state.toc.chapters.find(c => c.id === chapterId) ?? state.toc.chapters[0];
  const maxPage = chapter.pages;

  const clampedPage = Math.min(Math.max(1, page), maxPage);
  if (clampedPage !== page){
    state.route.page = clampedPage;
    location.hash = routeToHash(state.route);
    return;
  }

  const path = `content/${chapterId}/p${String(clampedPage).padStart(2, "0")}.html`;

  const html = await fetchText(path).catch(() => `
    <h1>${chapter.title}</h1>
    <p>Arquivo não encontrado: <code>${path}</code></p>
  `);

  els.reader.innerHTML = html;
  attachReferenceClicks();
  attachFigureZoom();
  attachTimeline();
function attachTimeline(){
  document.querySelectorAll("[data-timeline='1']").forEach(btn => {
    btn.addEventListener("click", () => {
      const year = btn.dataset.year || "";
      const title = btn.dataset.title || "Evento";
      const img = btn.dataset.img || "";
      const desc = btn.dataset.desc || "";
      const refs = (btn.dataset.refs || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .map(n => `<sup class="ref"><a href="#ref-${n}" data-ref="${n}">${n}</a></sup>`)
        .join("");

      openModal(`
        <h2>${escapeHTML(year)} — ${escapeHTML(title)}</h2>
        <div class="timeline-panel" style="margin-top:12px;">
          <div>
            ${img ? `<img src="${img}" alt="${escapeHTML(title)}" />` : ""}
          </div>
          <div>
            <p class="timeline-panel__meta">Descrição técnica${refs ? ` ${refs}` : ""}</p>
            <p style="margin-top:10px;">${escapeHTML(desc)}</p>
          </div>
        </div>
      `);

      // reanexa refs dentro do modal (pra abrir a referência)
      attachReferenceClicks();
    }, { once: true });
  });
}
  updateUI(chapter, clampedPage);

  localStorage.setItem("ebook:lastRoute", JSON.stringify(state.route));
  els.reader.focus();
}

function updateUI(chapter, page){
  const maxPage = chapter.pages;
  els.pageMeta.textContent = `${chapter.title} • Página ${page} de ${maxPage}`;

  document.querySelectorAll(".toc a").forEach(a => {
    a.classList.toggle("active", a.dataset.chapter === chapter.id);
  });

  els.btnPrev.disabled = isAtStart();
  els.btnNext.disabled = isAtEnd();

  const totalPages = state.toc.chapters.reduce((sum, c) => sum + c.pages, 0);
  const currentIndex = computeLinearIndex(chapter.id, page);
  const pct = Math.round((currentIndex / totalPages) * 100);
  els.progressText.textContent = `${pct}%`;

  markRead(chapter.id, page);
}

function computeLinearIndex(chapterId, page){
  let idx = 0;
  for (const ch of state.toc.chapters){
    if (ch.id === chapterId){
      idx += page;
      break;
    }
    idx += ch.pages;
  }
  return idx;
}

function markRead(chapterId, page){
  const key = "ebook:read";
  const map = safeJSON(localStorage.getItem(key)) ?? {};
  map[chapterId] = Math.max(map[chapterId] ?? 0, page);
  localStorage.setItem(key, JSON.stringify(map));
}

function nav(dir){
  const { chapterId, page } = state.route;
  const chapters = state.toc.chapters;
  const chIndex = chapters.findIndex(c => c.id === chapterId);
  const ch = chapters[chIndex];
  const nextPage = page + dir;

  if (nextPage >= 1 && nextPage <= ch.pages){
    location.hash = routeToHash({ chapterId, page: nextPage });
    return;
  }

  const nextChIndex = chIndex + (dir > 0 ? 1 : -1);
  if (nextChIndex < 0 || nextChIndex >= chapters.length) return;

  const nextCh = chapters[nextChIndex];
  const targetPage = dir > 0 ? 1 : nextCh.pages;
  location.hash = routeToHash({ chapterId: nextCh.id, page: targetPage });
}

function isAtStart(){
  const chapters = state.toc.chapters;
  const chIndex = chapters.findIndex(c => c.id === state.route.chapterId);
  return chIndex === 0 && state.route.page === 1;
}
function isAtEnd(){
  const chapters = state.toc.chapters;
  const chIndex = chapters.findIndex(c => c.id === state.route.chapterId);
  const ch = chapters[chIndex];
  return chIndex === chapters.length - 1 && state.route.page === ch.pages;
}

function attachReferenceClicks(){
  document.querySelectorAll("[data-ref]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const id = el.dataset.ref;
      const refText = state.refs?.[id] ?? "Referência não encontrada no refs.json.";
      openModal(`
        <h2>Referência ${id}</h2>
        <p style="margin-top:12px">${escapeHTML(refText)}</p>
      `);
    }, { once: true });
  });
}

function attachFigureZoom(){
  document.querySelectorAll("img[data-zoom='1']").forEach(img => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => {
      const src = img.getAttribute("src");
      const alt = img.getAttribute("alt") || "Figura";
      openModal(`
        <figure class="figure">
          <img src="${src}" alt="${escapeHTML(alt)}" />
          <figcaption style="margin-top:10px;color:var(--muted)">${escapeHTML(alt)}</figcaption>
        </figure>
      `);
    }, { once: true });
  });
}

function toggleTheme(){
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("ebook:theme", isDark ? "dark" : "light");
}

function cycleFontSize(){
  const sizes = [17, 18, 19, 20];
  const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--base-size"), 10) || 18;
  const idx = sizes.indexOf(current);
  const next = sizes[(idx + 1 + sizes.length) % sizes.length];
  document.documentElement.style.setProperty("--base-size", `${next}px`);
  localStorage.setItem("ebook:fontSize", String(next));
}

async function loadJSON(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return await res.json();
}
async function fetchText(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return await res.text();
}
function safeJSON(s){
  try{ return JSON.parse(s); }catch{ return null; }
}
function escapeHTML(str){
  return String(str)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"quot;")
    .replaceAll("'","&#039;");
}
