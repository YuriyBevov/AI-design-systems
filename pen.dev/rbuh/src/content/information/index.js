import { prepareArticles } from "./model.js";

const modules = import.meta.glob("./*.md", { eager: true });
let articlesPromise;

export function getArticles() {
  articlesPromise ??= Promise.all(
    Object.entries(modules)
      .filter(([path, module]) => !path.split("/").pop().startsWith("_") && module.frontmatter.draft !== true)
      .map(async ([path, module]) => ({
        path, frontmatter: module.frontmatter,
        body: module.rawContent(), html: await module.compiledContent(),
      })),
  ).then(prepareArticles);
  return articlesPromise;
}
