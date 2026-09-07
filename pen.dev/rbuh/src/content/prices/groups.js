export const priceUpdatedAt = "Полный прайс готовится";

export const priceGroups = [
  {
    id: "concrete",
    serviceId: "concrete",
    title: "Производство и доставка бетона",
    description: "Марки, классы и характеристики будут добавлены после утверждения полного перечня.",
    rows: [
      { id: "concrete-request", name: "Бетон — характеристики уточняются", unit: "—", priceLabel: "По запросу", note: "Расчёт по параметрам заказа" },
    ],
  },
  {
    id: "laboratory",
    serviceId: "laboratory",
    title: "Лабораторное сопровождение",
    description: "Состав работ определяется под задачу объекта.",
    rows: [
      { id: "laboratory-request", name: "Лабораторное сопровождение", unit: "услуга", priceLabel: "По запросу", note: "После согласования состава работ" },
    ],
  },
  {
    id: "pump",
    serviceId: "pump",
    title: "Услуги автобетононасоса",
    description: "Тариф зависит от условий площадки и параметров заказа.",
    rows: [
      { id: "pump-request", name: "Работа автобетононасоса", unit: "—", priceLabel: "По запросу", note: "Условия уточняются до выезда" },
    ],
  },
  {
    id: "aggregates",
    serviceId: "aggregates",
    title: "Доставка щебня, песка, мешанки, отсева",
    description: "Наличие, характеристики и единицы расчёта подтверждаются при заказе.",
    rows: [
      { id: "crushed-stone", name: "Щебень", unit: "—", priceLabel: "По запросу", note: "С доставкой по согласованному направлению" },
      { id: "sand", name: "Песок", unit: "—", priceLabel: "По запросу", note: "С доставкой по согласованному направлению" },
      { id: "mixture", name: "Мешанка", unit: "—", priceLabel: "По запросу", note: "С доставкой по согласованному направлению" },
      { id: "screenings", name: "Отсев", unit: "—", priceLabel: "По запросу", note: "С доставкой по согласованному направлению" },
    ],
  },
];

export const getPriceGroupsByServiceId = (serviceId) => priceGroups.filter((group) => group.serviceId === serviceId);
