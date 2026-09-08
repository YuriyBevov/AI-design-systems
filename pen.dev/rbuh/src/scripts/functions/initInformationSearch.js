import { matchesArticle, normalizeSearch } from "../../content/information/search.js";

export function initInformationSearch() {
  const root = document.querySelector("[data-information-list]");
  if (!root || root.dataset.initialized) return;
  const form = root.querySelector("[data-information-form]");
  const input = root.querySelector("[data-information-query]");
  const filters = [...root.querySelectorAll("[data-information-tag]")];
  const items = [...root.querySelectorAll("[data-information-item]")].map((element) => ({
    element, searchText: element.dataset.searchText, tags: JSON.parse(element.dataset.tags),
  }));
  const status = root.querySelector("[data-information-status]");
  const empty = root.querySelector("[data-information-empty]");
  root.dataset.initialized = "true";

  function update(writeUrl = true) {
    const tags = filters.filter((filter) => filter.checked).map((filter) => filter.value);
    let count = 0;
    for (const item of items) {
      const visible = matchesArticle(item, input.value, tags);
      item.element.hidden = !visible;
      if (visible) count += 1;
    }
    status.textContent = `Найдено материалов: ${count}`;
    empty.hidden = count > 0;
    if (writeUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("tag");
      if (input.value.trim()) url.searchParams.set("q", input.value.trim());
      tags.forEach((tag) => url.searchParams.append("tag", tag));
      window.history.replaceState(null, "", url);
    }
  }
  function restore() {
    const params = new URLSearchParams(window.location.search);
    input.value = params.get("q") ?? "";
    const tags = params.getAll("tag");
    filters.forEach((filter) => { filter.checked = tags.some((tag) => normalizeSearch(tag) === normalizeSearch(filter.value)); });
    update(false);
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); update(); });
  input.addEventListener("input", () => update());
  filters.forEach((filter) => filter.addEventListener("change", () => update()));
  root.querySelector("[data-information-reset]").addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    input.value = "";
    filters.forEach((filter) => { filter.checked = false; });
    update();
    input.focus();
  });
  window.addEventListener("popstate", restore);
}
