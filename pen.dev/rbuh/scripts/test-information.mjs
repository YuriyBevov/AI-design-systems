import test from "node:test";
import assert from "node:assert/strict";
import { prepareArticles } from "../src/content/information/model.js";
import { matchesArticle } from "../src/content/information/search.js";

const entry = (slug, overrides = {}) => ({
  path: `./${slug}.md`, frontmatter: { slug, title: "Бетон", description: "Описание", tags: ["Бетон"], ...overrides },
  body: "Контроль объёма смеси", html: "<p>Контроль объёма смеси</p>",
});

test("поиск учитывает основной текст, регистр, ё/е и порядок слов", () => {
  const [article] = prepareArticles([entry("beton")]);
  assert.equal(matchesArticle(article, " ОБЪЕМА   контроль "), true);
  assert.equal(matchesArticle(article, "несуществующее"), false);
});
test("текст и теги пересекаются; несколько тегов объединяются", () => {
  const [article] = prepareArticles([entry("beton", { tags: ["Бетон", "Прочность"] })]);
  assert.equal(matchesArticle(article, "контроль", ["Бетон"]), true);
  assert.equal(matchesArticle(article, "контроль", ["Лаборатория", "Прочность"]), true);
  assert.equal(matchesArticle(article, "контроль", ["Лаборатория"]), false);
  assert.equal(matchesArticle(article, "песок", ["Бетон"]), false);
});
test("пустой запрос показывает все записи; неизвестный тег даёт пустую выдачу", () => {
  const [article] = prepareArticles([entry("beton")]);
  assert.equal(matchesArticle(article, "  ", []), true);
  assert.equal(matchesArticle(article, "", ["нет такого тега"]), false);
});
test("дубликаты тегов и варианты регистра объединяются", () => {
  const articles = prepareArticles([entry("one", { tags: [" Бетон ", "бетон"] }), entry("two", { tags: ["БЕТОН"] })]);
  assert.deepEqual(articles.map((article) => article.tags), [["Бетон"], ["Бетон"]]);
});
test("черновики не попадают в публикации", () => {
  assert.equal(prepareArticles([entry("one", { draft: true }), { ...entry("two"), path: "./_two.md" }]).length, 0);
});
test("невалидные записи и дублирующиеся URL останавливают сборку", () => {
  assert.throws(() => prepareArticles([entry("bad/slug")]), /slug/);
  assert.throws(() => prepareArticles([entry("one"), entry("one")]), /slug/);
  for (const tags of [[], "Бетон", [""]]) assert.throws(() => prepareArticles([entry("one", { tags })]), /tags/);
  assert.throws(() => prepareArticles([entry("one", { title: "" })]), /title/);
  assert.throws(() => prepareArticles([{ ...entry("one"), html: "<h1>Лишний заголовок</h1>" }]), /h1/);
});
test("редакторские комментарии не участвуют в поиске", () => {
  const [article] = prepareArticles([{ ...entry("one"), body: "Бетон <!-- секретныйчерновик -->" }]);
  assert.equal(matchesArticle(article, "секретныйчерновик"), false);
});
