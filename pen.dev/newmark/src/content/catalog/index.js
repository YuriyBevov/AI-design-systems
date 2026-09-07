import { categories, ROOT_CATEGORY_ID } from "./categories.js";
import { products } from "./products.js";

export { categories, products, ROOT_CATEGORY_ID };

export const categoryById = new Map(categories.map((category) => [category.id, category]));

export const productsByParentId = products.reduce((groups, product) => {
  const group = groups.get(product.parentId) ?? [];
  group.push(product);
  groups.set(product.parentId, group);

  return groups;
}, new Map());

export const productById = new Map(products.map((product) => [product.id, product]));

export const getCategoryById = (id) => categoryById.get(id);

export const getProductById = (id) => productById.get(id);

export const getCategoryAncestors = (category) => {
  const ancestors = [];
  let currentParentId = category.parentId;

  while (currentParentId && currentParentId !== ROOT_CATEGORY_ID) {
    const parent = getCategoryById(currentParentId);

    if (!parent) {
      break;
    }

    ancestors.unshift(parent);
    currentParentId = parent.parentId;
  }

  return ancestors;
};

export const getCategoryPath = (category) => [...getCategoryAncestors(category), category]
  .map((item) => item.slug)
  .join("/");

export const getCatalogHref = (category) => `/catalog/${getCategoryPath(category)}/`;

export const getCategoryChildren = (categoryId) => categories.filter((category) => category.parentId === categoryId);

export const getCategoryDescendantIds = (categoryId) => getCategoryChildren(categoryId).flatMap((child) => [
  child.id,
  ...getCategoryDescendantIds(child.id),
]);

export const getCategoryProducts = (categoryId) => [
  categoryId,
  ...getCategoryDescendantIds(categoryId),
].flatMap((id) => productsByParentId.get(id) ?? [])
  .filter((product) => !product.hidden);

export const getCatalogSectionBreadcrumbs = (category) => {
  const breadcrumbs = [
    {
      label: "Главная",
      href: "/",
    },
    {
      label: "Каталог",
      href: "/catalog/",
    },
  ];

  getCategoryAncestors(category).forEach((ancestor) => {
    breadcrumbs.push({
      label: ancestor.title,
      href: getCatalogHref(ancestor),
    });
  });

  breadcrumbs.push({
    label: category.title,
  });

  return breadcrumbs;
};

export const getProductBreadcrumbs = (product) => {
  const category = getCategoryById(product.parentId);
  const breadcrumbs = category ? getCatalogSectionBreadcrumbs(category) : [
    {
      label: "Главная",
      href: "/",
    },
    {
      label: "Каталог",
      href: "/catalog/",
    },
  ];

  return [
    ...breadcrumbs.map((item, index) => index === breadcrumbs.length - 1 && !item.href
      ? {
        ...item,
        href: category ? getCatalogHref(category) : "/catalog/",
      }
      : item),
    {
      label: product.title,
    },
  ];
};

export const catalogSections = categories.map((category) => ({
  ...category,
  path: getCategoryPath(category),
  href: getCatalogHref(category),
  subsections: getCategoryChildren(category.id).map((child) => ({
    label: child.title,
    href: getCatalogHref(child),
  })),
  products: getCategoryProducts(category.id),
}));
