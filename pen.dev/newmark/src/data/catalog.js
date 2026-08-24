const createHref = (path) => `/catalog/${path}/`;

const catalogSectionDrafts = [
  {
    path: "stretch-plenka",
    title: "Стрейч-пленка",
    description: "Раздел каталога со стрейч-пленкой для фиксации грузов, паллетирования, хранения и перевозки продукции.",
    parentPath: null,
    childPaths: [],
  },
  {
    path: "kleikaya-lenta",
    title: "Клейкая лента",
    description: "Раздел каталога с упаковочными, малярными, брендированными, изоляционными и специальными клейкими лентами.",
    parentPath: null,
    childPaths: [
      "kleikaya-lenta/s-logotipom",
      "kleikaya-lenta/malyarnaya-lenta",
      "kleikaya-lenta/termostoykaya-malyarnaya",
      "kleikaya-lenta/tpl",
      "kleikaya-lenta/lenty-s-naneseniem",
      "kleikaya-lenta/izolyatsionnaya-lenta",
    ],
  },
  {
    path: "kleikaya-lenta/s-logotipom",
    title: "Клейкая лента с логотипом",
    description: "Раздел каталога с клейкой лентой с логотипом для брендированной упаковки, маркировки отправлений и ежедневных складских задач.",
    parentPath: "kleikaya-lenta",
    childPaths: [
      "kleikaya-lenta/s-logotipom/poverhnostnaya-pechat",
      "kleikaya-lenta/s-logotipom/mezhsloynaya-pechat",
    ],
  },
  {
    path: "kleikaya-lenta/s-logotipom/poverhnostnaya-pechat",
    title: "Поверхностная печать",
    description: "Подраздел клейкой ленты с логотипом с поверхностной печатью для быстрых тиражей и брендированной упаковки.",
    parentPath: "kleikaya-lenta/s-logotipom",
    childPaths: [],
  },
  {
    path: "kleikaya-lenta/s-logotipom/mezhsloynaya-pechat",
    title: "Межслойная печать",
    description: "Подраздел клейкой ленты с логотипом с межслойной печатью, где изображение защищено слоем пленки.",
    parentPath: "kleikaya-lenta/s-logotipom",
    childPaths: [],
  },
  {
    path: "kleikaya-lenta/malyarnaya-lenta",
    title: "Малярная лента",
    description: "Подраздел клейкой ленты для защиты поверхностей при отделочных, покрасочных и монтажных работах.",
    parentPath: "kleikaya-lenta",
    childPaths: [],
  },
  {
    path: "kleikaya-lenta/termostoykaya-malyarnaya",
    title: "Термостойкая малярная лента",
    description: "Подраздел термостойкой малярной ленты для задач, где материал должен выдерживать повышенные температуры.",
    parentPath: "kleikaya-lenta",
    childPaths: [],
  },
  {
    path: "kleikaya-lenta/tpl",
    title: "ТПЛ",
    description: "Подраздел тканевой полиэтиленовой ленты для ремонта, фиксации, упаковки и производственных задач.",
    parentPath: "kleikaya-lenta",
    childPaths: [],
  },
  {
    path: "kleikaya-lenta/lenty-s-naneseniem",
    title: "Ленты с нанесением",
    description: "Подраздел клейких лент с нанесением служебных, рекламных и информационных сообщений.",
    parentPath: "kleikaya-lenta",
    childPaths: [],
  },
  {
    path: "kleikaya-lenta/izolyatsionnaya-lenta",
    title: "Изоляционная лента",
    description: "Подраздел изоляционной ленты для электромонтажных работ, маркировки и защиты соединений.",
    parentPath: "kleikaya-lenta",
    childPaths: [],
  },
  {
    path: "signalnye-lenty",
    title: "Сигнальные ленты",
    description: "Раздел сигнальных лент для ограждения зон, маркировки опасных участков и организации пространства.",
    parentPath: null,
    childPaths: [],
  },
];

const draftByPath = new Map(catalogSectionDrafts.map((section) => [section.path, section]));

const createSubsections = (childPaths) => childPaths.map((path) => {
  const section = draftByPath.get(path);

  return {
    label: section.title,
    href: createHref(section.path),
  };
});

export const catalogSections = catalogSectionDrafts.map((section) => ({
  ...section,
  slug: section.path.split("/").at(-1),
  href: createHref(section.path),
  seo: {
    title: `${section.title} Newmark`,
    description: section.description,
  },
  subsections: createSubsections(section.childPaths),
  products: [],
}));

export const catalogSectionByPath = new Map(catalogSections.map((section) => [section.path, section]));

export const getCatalogSectionByPath = (path) => catalogSectionByPath.get(path);

export const getCatalogSectionBreadcrumbs = (section) => {
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

  const parents = [];
  let currentParentPath = section.parentPath;

  while (currentParentPath) {
    const parent = getCatalogSectionByPath(currentParentPath);

    if (!parent) {
      break;
    }

    parents.unshift(parent);
    currentParentPath = parent.parentPath;
  }

  parents.forEach((parent) => {
    breadcrumbs.push({
      label: parent.title,
      href: parent.href,
    });
  });

  breadcrumbs.push({
    label: section.title,
  });

  return breadcrumbs;
};
