export function normalizeSearch(value = "") {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/gu, " ").trim();
}

export function matchesArticle(article, query = "", tags = []) {
  const text = normalizeSearch(article.searchText);
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  const articleTags = article.tags.map(normalizeSearch);
  return words.every((word) => text.includes(word))
    && (!tags.length || tags.some((tag) => articleTags.includes(normalizeSearch(tag))));
}
