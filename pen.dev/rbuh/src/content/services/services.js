import concreteImage from "../../images/webp/production-fleet.webp";
import laboratoryImage from "../../images/webp/laboratory-control.webp";
import pumpImage from "../../images/webp/concrete-pump.webp";
import aggregatesImage from "../../images/webp/aggregates-delivery.webp";

export const services = [
  {
    id: "concrete",
    slug: "proizvodstvo-i-dostavka-betona",
    title: "Производство и доставка бетона",
    shortDescription: "Приготовление бетонной смеси и организация доставки на строительный объект.",
    image: {
      src: concreteImage,
      alt: "Автобетоносмесители РБУ «Хаджох» на территории производства",
      source: "provided",
    },
    detail: {
      lead: "Бетон с производства РБУ «Хаджох» с доставкой по выбранному направлению.",
      description: [
        "Принимаем заявки на производство и доставку бетонной смеси для строительных работ. Параметры состава, объём и график поставки согласовываются перед оформлением заказа.",
        "Полный перечень марок и характеристик будет добавлен после утверждения прайс-листа. Сейчас расчёт выполняется по запросу.",
      ],
      features: [
        { label: "Производство", value: "РБУ «Хаджох»" },
        { label: "Доставка", value: "По согласованному направлению" },
        { label: "Стоимость", value: "По запросу" },
      ],
      faqIds: ["order-data", "concrete-selection", "delivery", "price"],
      mapEnabled: true,
    },
    seo: {
      title: "Производство и доставка бетона — РБУ «Хаджох»",
      description: "Заказать производство и доставку бетона в РБУ «Хаджох». Расчёт стоимости по параметрам заказа и направлению доставки.",
    },
  },
  {
    id: "laboratory",
    slug: "laboratornoe-soprovozhdenie",
    title: "Лабораторное сопровождение",
    shortDescription: "Сопровождение бетонных работ и контроль параметров по согласованной программе.",
    image: {
      src: laboratoryImage,
      alt: "Специалист проверяет образец бетона в лаборатории",
      source: "generated",
    },
    detail: {
      lead: "Лабораторное сопровождение для задач, связанных с бетонными работами.",
      description: [
        "Состав лабораторных работ определяется по требованиям объекта и согласовывается до начала сопровождения.",
        "Чтобы получить расчёт, опишите объект, планируемые работы и необходимый результат контроля.",
      ],
      features: [
        { label: "Состав работ", value: "По задаче объекта" },
        { label: "Порядок", value: "После согласования" },
        { label: "Стоимость", value: "По запросу" },
      ],
      faqIds: ["laboratory-scope", "order-data", "price"],
      mapEnabled: true,
    },
    seo: {
      title: "Лабораторное сопровождение — РБУ «Хаджох»",
      description: "Лабораторное сопровождение бетонных работ от РБУ «Хаджох». Состав работ и стоимость рассчитываются по запросу.",
    },
  },
  {
    id: "pump",
    slug: "uslugi-avtobetononasosa",
    title: "Услуги автобетононасоса",
    shortDescription: "Подача бетонной смеси на объекте с предварительным согласованием условий работы техники.",
    image: {
      src: pumpImage,
      alt: "Автобетононасос подаёт смесь на строительной площадке",
      source: "generated",
    },
    detail: {
      lead: "Автобетононасос для подачи смеси к месту выполнения бетонных работ.",
      description: [
        "Перед заказом согласовываются адрес, дата, объём работ, условия подъезда и безопасного размещения техники.",
        "Параметры техники и полный тариф будут добавлены после утверждения прайс-листа.",
      ],
      features: [
        { label: "Выезд", value: "По согласованию" },
        { label: "Условия площадки", value: "Уточняются до выезда" },
        { label: "Стоимость", value: "По запросу" },
      ],
      faqIds: ["pump-order", "order-data", "delivery", "price"],
      mapEnabled: true,
    },
    seo: {
      title: "Услуги автобетононасоса — РБУ «Хаджох»",
      description: "Заказать автобетононасос в РБУ «Хаджох». Согласование площадки, направления и стоимости по заявке.",
    },
  },
  {
    id: "aggregates",
    slug: "dostavka-inertnyh-materialov",
    title: "Доставка щебня, песка, мешанки, отсева",
    shortDescription: "Инертные материалы с доставкой по согласованному направлению и объёму.",
    image: {
      src: aggregatesImage,
      alt: "Самосвал рядом со складом щебня на территории производства",
      source: "provided",
    },
    detail: {
      lead: "Щебень, песок, мешанка и отсев с доставкой на объект.",
      description: [
        "Подберём материал под задачу и рассчитаем доставку с учётом направления и объёма заказа.",
        "Характеристики материалов, наличие и единицы расчёта подтверждаются перед оформлением заявки.",
      ],
      features: [
        { label: "Материалы", value: "Щебень, песок, мешанка, отсев" },
        { label: "Доставка", value: "По согласованному направлению" },
        { label: "Стоимость", value: "По запросу" },
      ],
      faqIds: ["aggregates", "order-data", "delivery", "price"],
      mapEnabled: true,
    },
    seo: {
      title: "Доставка щебня, песка, мешанки и отсева — РБУ «Хаджох»",
      description: "Заказать доставку щебня, песка, мешанки и отсева в РБУ «Хаджох». Стоимость рассчитывается по направлению и объёму.",
    },
  },
];

export const serviceBySlug = new Map(services.map((service) => [service.slug, service]));
export const serviceById = new Map(services.map((service) => [service.id, service]));
