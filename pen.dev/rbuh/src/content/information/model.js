import { normalizeSearch } from "./search.js";

export function prepareArticles(entries) {
  const slugs = new Set();
  const tagLabels = new Map();
  return entries
    .filter(({ path, frontmatter }) => !path.split("/").pop().startsWith("_") && frontmatter.draft !== true)
    .map(({ path, frontmatter: data, body, html }) => {
      const required = ["slug", "title", "description"];
      for (const key of required) {
        if (typeof data[key] !== "string" || !data[key].trim()) throw new Error(`${path}: требуется поле ${key}`);
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || slugs.has(data.slug)) {
        throw new Error(`${path}: некорректный или повторяющийся slug ${data.slug}`);
      }
      slugs.add(data.slug);
      if (!Array.isArray(data.tags) || !data.tags.length || data.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
        throw new Error(`${path}: tags должен содержать один или несколько непустых тегов`);
      }
      if (/<h1(?:\s|>)/i.test(html)) throw new Error(`${path}: заголовок h1 создаёт шаблон; начинайте текст с ##`);
      const tags = [...new Set(data.tags.map((tag) => {
        const key = normalizeSearch(tag);
        if (!tagLabels.has(key)) tagLabels.set(key, tag.trim().replace(/\s+/gu, " "));
        return tagLabels.get(key);
      }))];
      return {
        slug: data.slug, title: data.title.trim(), description: data.description.trim(), tags, html,
        seoTitle: data.seoTitle || `${data.title.trim()} — РБУ «Хаджох»`,
        searchText: [data.title, data.description, ...tags, body.replace(/<!--[\s\S]*?-->/g, "")].join(" "),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}
