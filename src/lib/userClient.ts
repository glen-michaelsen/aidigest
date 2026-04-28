/**
 * Client-side user state: anonymous UID, likes, saved filters.
 * Runs in the browser only.
 */

const UID_KEY = "aidigest:uid";

function getUid(): string {
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    uid = crypto.randomUUID();
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

async function toggleLike(articleId: string): Promise<boolean> {
  const res = await fetch("/api/likes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: getUid(), article_id: articleId }),
  });
  const data = await res.json();
  return data.liked === true;
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
      const isNowLiked = await toggleLike(id);
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

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function init() {
  // Seed UID early
  getUid();
  const liked = await fetchLikes();
  initLikeButtons(liked);
  initLikedToggle();
  await initSavedFilters();
  await initSaveCurrentView();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
