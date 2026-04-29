/**
 * Client-side user state: anonymous UID, likes, saved filters.
 * Runs in the browser only.
 */

const UID_KEY = "aiwatchly:uid";
const UID_KEY_LEGACY = "aidigest:uid"; // pre-rename key — migrate on first read

function getUid(): string {
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    // Carry forward any anonymous ID created before the rename
    uid = localStorage.getItem(UID_KEY_LEGACY) ?? crypto.randomUUID();
    localStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

async function fetchLikes(): Promise<Set<string>> {
  try {
    const res = await fetch(`/api/likes?user_id=${getUid()}`);
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.articles ?? []);
  } catch {
    return new Set();
  }
}

async function toggleLike(
  articleId: string,
  tags: Record<string, string[]> = {},
): Promise<boolean> {
  const res = await fetch("/api/likes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: getUid(), article_id: articleId, tags }),
  });
  const data = await res.json();
  return data.liked === true;
}

async function fetchScores(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`/api/scores?user_id=${getUid()}`);
    if (!res.ok) return {};
    const data = await res.json();
    return data.scores ?? {};
  } catch {
    return {};
  }
}

type SavedFilter = { id: string; name: string; query: { axis: string; tag: string } };

async function fetchFilters(): Promise<SavedFilter[]> {
  try {
    const res = await fetch(`/api/filters?user_id=${getUid()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.filters ?? [];
  } catch {
    return [];
  }
}

async function saveFilter(name: string, query: SavedFilter["query"]): Promise<SavedFilter | null> {
  const res = await fetch("/api/filters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: getUid(), name, query }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function deleteFilter(id: string): Promise<boolean> {
  const res = await fetch(`/api/filters?user_id=${getUid()}&id=${id}`, { method: "DELETE" });
  return res.ok;
}

function initLikeButtons(liked: Set<string>) {
  document.querySelectorAll<HTMLButtonElement>(".like-btn").forEach((btn) => {
    const id = btn.dataset.articleId;
    if (!id) return;
    const card = btn.closest<HTMLElement>(".card");
    if (liked.has(id)) {
      btn.classList.add("liked");
      btn.setAttribute("aria-pressed", "true");
      card?.classList.add("is-liked");
    }
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      // Pull tags from the card's data-modal so scores stay in sync
      const tags: Record<string, string[]> =
        card?.dataset.modal ? (JSON.parse(card.dataset.modal).tags ?? {}) : {};
      const isNowLiked = await toggleLike(id, tags);
      btn.classList.toggle("liked", isNowLiked);
      btn.setAttribute("aria-pressed", String(isNowLiked));
      card?.classList.toggle("is-liked", isNowLiked);
      btn.disabled = false;
    });
  });
}

function initLikedToggle() {
  const btn = document.querySelector<HTMLButtonElement>("#liked-only-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const on = document.body.classList.toggle("show-liked-only");
    btn.classList.toggle("active", on);
    btn.textContent = on ? "★ Showing liked" : "☆ Liked only";
  });
}

async function initSavedFilters() {
  const list = document.querySelector<HTMLElement>("#saved-filters-list");
  if (!list) return;

  async function refresh() {
    if (!list) return;
    const filters = await fetchFilters();
    if (filters.length === 0) {
      list.innerHTML = `<span class="muted-note">No saved views yet — save one from a tag page.</span>`;
      return;
    }
    list.innerHTML = filters
      .map(
        (f) => `
        <span class="saved-chip">
          <a href="/tag/${f.query.axis}/${f.query.tag}">${escape(f.name)}</a>
          <button type="button" class="saved-del" data-id="${f.id}" aria-label="Remove">×</button>
        </span>`,
      )
      .join("");
    list.querySelectorAll<HTMLButtonElement>(".saved-del").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id;
        if (!id) return;
        b.disabled = true;
        await deleteFilter(id);
        refresh();
      });
    });
  }

  await refresh();
}

async function initSaveCurrentView() {
  const btn = document.querySelector<HTMLButtonElement>("#save-view-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const axis = btn.dataset.axis;
    const tag = btn.dataset.tag;
    if (!axis || !tag) return;
    const name = prompt("Name this saved view:", `${axis}: ${tag}`);
    if (!name) return;
    btn.disabled = true;
    const saved = await saveFilter(name, { axis, tag });
    btn.disabled = false;
    if (saved) {
      btn.textContent = "✓ Saved";
      setTimeout(() => (btn.textContent = "★ Save this view"), 2000);
    }
  });
}

/**
 * Re-order cards inside .grid by the user's learned tag preferences.
 * Only runs on date pages (/ and /YYYY-MM-DD). No-op if user has no scores yet.
 */
function rerankGrid(scores: Record<string, number>): void {
  // Only apply on date-filtered pages, not tag or search pages
  const path = window.location.pathname;
  const isDatePage = path === "/" || /^\/\d{4}-\d{2}-\d{2}\/?$/.test(path);
  if (!isDatePage) return;

  const hasPreferences = Object.values(scores).some((s) => s > 0);
  if (!hasPreferences) return;

  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return;

  const cards = [...grid.querySelectorAll<HTMLElement>(".card")];
  if (cards.length < 2) return;

  const scored = cards.map((card) => {
    let score = 0;
    if (card.dataset.modal) {
      const data = JSON.parse(card.dataset.modal);
      const tags: Record<string, string[]> = data.tags ?? {};
      for (const [axis, tagList] of Object.entries(tags)) {
        for (const tag of tagList as string[]) {
          score += scores[`${axis}:${tag}`] ?? 0;
        }
      }
    }
    return { card, score };
  });

  // Stable sort: higher score first, original order for ties
  scored.sort((a, b) => b.score - a.score);

  for (const { card } of scored) {
    grid.appendChild(card); // moves existing nodes — preserves event listeners
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function initUserMenu() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return;
  const { user } = await res.json();

  const loginLink = document.getElementById("user-login-link");
  const loggedIn = document.getElementById("user-loggedin");
  const emailEl = document.getElementById("user-email");
  const logoutBtn = document.getElementById("user-logout");

  if (user?.email) {
    loginLink?.setAttribute("hidden", "");
    if (loggedIn) loggedIn.removeAttribute("hidden");
    if (emailEl) emailEl.textContent = user.email;
    logoutBtn?.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    });
  }
}

async function init() {
  getUid();
  const [liked, scores] = await Promise.all([
    fetchLikes(),
    fetchScores(),
    initUserMenu(),
  ]);
  initLikeButtons(liked);
  initLikedToggle();
  rerankGrid(scores);
  // These are now no-ops on pages without the removed UI elements
  await initSavedFilters();
  await initSaveCurrentView();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
