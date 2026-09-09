# Именование CSS-классов

Документ переносит правила именования, примененные в Newmark, в интерфейсы AI Assist. Исходная база: [`guides/class-names.md`](../../guides/class-names.md) и компонентные решения [`pen.dev/newmark/guides/architecture.md`](../../pen.dev/newmark/guides/architecture.md).

Гайд обязателен для Nuxt-панели, Vue-виджета, HTML fixtures и любых новых UI-компонентов AI Assist.

## 1. Основные принципы

Класс описывает сущность или роль, а не внешний вид, координату, содержимое поля или место на конкретной странице.

Классы должны быть:

- простыми и понятными без макета;
- написанными в lowercase kebab-case;
- компонентными и переносимыми;
- одинаковыми для одинаковых структурных ролей;
- минимальными: только реально используемый блок, элемент, модификатор, layout-класс или состояние;
- независимыми от случайной вложенности и порядка страницы.

Не добавлять классы «на будущее». Новый класс появляется, когда существует конкретная styling/layout/state-задача, которую нельзя ясно решить текущей структурой.

Плохо:

```html
<div class="right-blue-big-box second-settings-block custom-wrapper">...</div>
```

Хорошо:

```html
<section class="provider-settings">...</section>
```

## 2. БЭМ-логика

Формат:

```text
block
block__element
block--modifier
block__element--modifier
```

Пример:

```html
<article class="knowledge-card knowledge-card--draft">
  <div class="knowledge-card__body">
    <span class="knowledge-card__title">Условия доставки</span>
  </div>
  <div class="knowledge-card__actions">...</div>
</article>
```

### Блок

Самостоятельный компонент, который можно перенести без переименования:

```text
app-shell page-header sidebar button field data-table status-badge
prompt-editor knowledge-card crawl-job chat-widget chat-message modal
```

Имя Vue-компонента и корневого CSS-блока должны совпадать по смыслу:

```text
PromptEditor.vue  -> .prompt-editor
KnowledgeCard.vue -> .knowledge-card
ChatMessage.vue   -> .chat-message
```

Это не требует создавать CSS-класс для каждого технического Vue-компонента. Компонент без собственной визуальной/структурной роли может не иметь отдельного блока.

### Элемент

Часть блока, не используемая самостоятельно:

```text
prompt-editor__toolbar
prompt-editor__textarea
knowledge-card__title
crawl-job__progress
chat-message__content
```

В имени допускается только один `__`.

Запрещено:

```text
prompt-editor__toolbar__button
data-table__row__cell__value
```

Допустимо сократить роль через дефис или выделить самостоятельный блок:

```text
prompt-editor__toolbar-button
data-table__cell-value
button
```

### Модификатор

Вариант компонента/элемента, всегда вместе с базовым классом:

```html
<button class="button button--primary" type="button">Опубликовать</button>
<span class="status-badge status-badge--warning">Требует проверки</span>
```

Плохо:

```html
<button class="button--primary">Опубликовать</button>
```

Модификатор не должен дублировать кратковременное состояние, уже точно выраженное нативным/ARIA-атрибутом, если CSS может использовать этот атрибут.

## 3. Сущность вместо внешнего вида

Запрещены имена по:

- цвету: `blue-button`, `red-text`;
- размеру без принятой utility-системы: `big-title`, `small-card`;
- позиции: `left-panel`, `top-block`, `bottom-form`;
- порядку: `section-2`, `third-card`;
- странице, если компонент переносим: `provider-page-save-button`;
- содержимому повторяемой колонки: `footer__delivery`, когда все колонки структурно одинаковы;
- именам слоев дизайна: `frame-24`, `settings-final-copy`.

Использовать:

```text
button--primary
page-title
sidebar
form-section
knowledge-card
provider-settings
```

Название слоя/группы макета помогает понять структуру, но не становится автоматически классом или видимым текстом.

## 4. Абстрактные классы

Общий класс нужен, если паттерн действительно повторяется и изменения должны применяться совместно:

```text
container page-header page-title section-header section-title
button-row form-row field data-table empty-state pagination
```

Слишком общие имена запрещены:

```text
box item thing wrapper content text image
```

Имена `body`, `content`, `inner`, `top`, `bottom` допустимы только как элементы конкретного блока и только при реальной группирующей/layout-роли:

```text
modal__body
knowledge-card__content
sidebar__inner
```

Не оборачивать приложение в бессмысленные `page-wrapper`, `site-wrapper`, `content-wrapper`. Корневой layout имеет конкретную роль `app-shell`.

## 5. Повторяемые элементы

Одинаковые структурные части имеют один класс, а не названия по контенту.

Плохо:

```html
<div class="provider-settings__model">...</div>
<div class="provider-settings__temperature">...</div>
<div class="provider-settings__timeout">...</div>
```

Хорошо, если это одинаковые строки формы:

```html
<div class="form-row">...</div>
<div class="form-row">...</div>
<div class="form-row">...</div>
```

Не абстрагировать блоки только потому, что они случайно похожи визуально. Prompt revision, crawl job и provider credential остаются разными сущностями, если у них разная структура/поведение.

## 6. Контекст и самостоятельный компонент

Самостоятельный компонент сохраняет собственный класс. Контекстный класс можно добавить только для размещения, если общего layout API недостаточно.

```html
<div class="prompt-page__actions">
  <div class="button-row">...</div>
</div>
```

Если один DOM-узел выполняет обе роли и это действительно нужно:

```html
<div class="button-row prompt-page__actions">...</div>
```

Не превращать самостоятельный компонент в элемент страницы:

Плохо:

```html
<article class="knowledge-page__knowledge-card">...</article>
```

Хорошо:

```html
<article class="knowledge-card">...</article>
```

## 7. Состояния и атрибуты

Для общих UI-состояний допустимы:

```text
is-active is-open is-hidden is-loading is-disabled has-error
```

Состояние должно иметь единственный источник истины. Если оно уже выражено через `disabled`, `hidden`, `aria-expanded`, `aria-selected`, `aria-invalid` или `data-state`, стили предпочтительно привязывать к этому атрибуту, а не поддерживать параллельный класс вручную.

```html
<button class="accordion__button" type="button" aria-expanded="true">Настройки</button>
```

Не использовать цветовые модификаторы для доменных статусов. `status-badge--warning` описывает визуально-смысловой вариант design system, а `status-badge--crawl-partial` слишком связан с одним enum; доменное значение лучше передавать через `data-status="partial"` и маппить в компоненте.

## 8. JavaScript, Vue и тестовые hooks

- В Vue поведение связывается через props/events/refs, а не поиском styling-классов в DOM.
- Для интеграционного DOM-hook использовать именованный `data-*`, если ref/component API недостаточны.
- `js-*` не использовать для стилей; новые Vue-компоненты по умолчанию обходятся без `js-*`.
- E2E selector — `data-testid`, только если надежного role/label selector нет.
- `data-testid` не используется в CSS и бизнес-логике.
- ARIA/state атрибуты не превращаются в декоративные hooks без семантической корректности.

## 9. Widget и Shadow DOM

- Custom element снаружи называется `ai-assist`; внутренний корневой блок — `chat-widget`.
- Внутренние классы Shadow DOM не являются публичным theming API.
- Публичная настройка темы идет через документированные CSS custom properties на `ai-assist`.
- Не добавлять классы host-сайту и не рассчитывать на его классы.
- Не использовать глобальные имена вроде `.open`, `.message`, `.container` вне Shadow DOM без компонентного контекста.

Пример:

```html
<section class="chat-widget">
  <div class="chat-widget__panel">
    <ol class="message-list">
      <li class="message-list__item">
        <article class="chat-message chat-message--assistant">...</article>
      </li>
    </ol>
  </div>
</section>
```

## 10. Кнопки и иконки

Обычная кнопка или ссылка с внешним видом кнопки использует один базовый блок:

```html
<button class="button" type="button">Отмена</button>
<button class="button button--primary" type="submit">Сохранить</button>
<button class="button button--compact" type="button">Проверить</button>
```

Базовый `button` уже описывает нейтральный вариант. Модификатор добавляется только для реального визуального отличия: `button--primary`, `button--danger`, `button--ghost`, `button--text`, `button--compact`, `button--wide`, `button--with-icon`.

Кнопка только с иконкой всегда использует отдельный базовый блок `icon-button`:

```html
<button class="icon-button icon-button--compact" type="button" aria-label="Добавить">
  <svg class="ui-icon" aria-hidden="true">...</svg>
</button>
```

Размер, цвет, фон, рамка и форма icon-only кнопки задаются только абстрактными модификаторами `icon-button--*`. Контекстный класс вроде `document-tabs__add` допустим для поведения или размещения, но не содержит визуальные свойства самой кнопки. Если отдельной контекстной задачи нет, такой класс избыточен.

Если кнопка содержит иконку и видимый текст, базовым блоком остаётся `button`, а раскладка задаётся `button--with-icon`. Любая интерфейсная иконка выполняется контролируемым SVG с базовым классом `ui-icon`; Unicode-символы, emoji и icon-font не используются.

Специализированный составной контрол может иметь собственный блок, например `prompt-revision`, если его структура и поведение не являются вариантом обычной кнопки. Внешнее сходство само по себе не является основанием смешивать компоненты.

Согласованные варианты фиксируются в разделе панели `Компоненты` и используют там рабочие классы, а не отдельные демонстрационные копии.

## 11. Выпадающие списки

Одиночный dropdown — самостоятельный компонент `BaseSelect.vue` с корневым блоком `base-select`. Его trigger, список, option states и SVG-иконки реализуются внутри компонента и не переопределяются классами конкретной страницы.

```vue
<BaseSelect v-model="selectedValue" :options="options" label="Модель ответа" />
```

Внутренняя структура использует `base-select__value`, `base-select__icon`, `base-select__content`, `base-select__viewport`, `base-select__item`, `base-select__indicator`. Состояния оформляются через `data-state`, `data-highlighted`, `data-disabled` и нативный `disabled`, без параллельных контекстных state-классов.

Route page передаёт только значение, options, доступное имя и функциональные props. Нативный `<select>`, блоки вида `provider-model-select` и дублирующие реализации dropdown запрещены. Согласованные варианты показываются в разделе `Компоненты`.

## 12. Рекомендуемый словарь AI Assist

### Каркас панели

```text
app-shell app-shell__sidebar app-shell__main
sidebar sidebar__nav
page-header page-title page-description page-actions
section-header section-title section-description
```

### Формы и действия

```text
form-section form-row field field__label field__control field__hint field__error
base-select base-select__value base-select__icon base-select__content base-select__item
button button--primary button--danger button--ghost button--text button--compact button--wide
button--with-icon icon-button icon-button--compact icon-button--tiny icon-button--ghost ui-icon
button-row
```

### Данные и статусы

```text
data-table data-table__head data-table__body data-table__row data-table__cell
status-badge empty-state pagination alert toast progress
```

### Предметные компоненты

```text
prompt-editor prompt-revision prompt-diff
knowledge-card knowledge-preview source-form
crawl-job crawl-summary crawl-error-list
model-select provider-settings credential-status
playground retrieval-result
chat-widget message-list chat-message chat-composer citation-list
```

Словарь не является требованием заранее назначить все эти классы. Класс создается только вместе с реальным компонентом/ролью.

## 13. Чеклист

- [ ] Lowercase kebab-case и БЭМ-логика соблюдены.
- [ ] В имени не больше одного `__`.
- [ ] Модификатор не используется без базового класса.
- [ ] Имя описывает роль, а не цвет, размер, позицию, порядок или имя слоя.
- [ ] Компонент можно перенести без переименования.
- [ ] Повторяемые структуры используют общий класс.
- [ ] Обычные кнопки используют `button`, icon-only кнопки — `icon-button`, а визуальные различия выражены абстрактными модификаторами.
- [ ] Контекстный класс кнопки отвечает только за размещение/поведение и отсутствует, если отдельная задача не нужна.
- [ ] Иконки используют контролируемый SVG и базовый класс `ui-icon`, без текстовых символов и emoji.
- [ ] Все одиночные dropdown используют `BaseSelect`/`base-select`; нативных `<select>` и страничных копий компонента нет.
- [ ] Нет классов/оберток «на будущее».
- [ ] Состояние не дублируется несогласованно в class и ARIA/data.
- [ ] Styling-классы не используются как Vue/test hooks.
- [ ] Классы виджета не протекают на host page, а тема управляется публичными CSS variables.
