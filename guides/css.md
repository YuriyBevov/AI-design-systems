# Гайд по CSS

Этот документ описывает правила написания CSS в проекте. Он дополняет гайды по HTML-разметке и именованию классов: HTML отвечает за структуру, гайд по классам — за имена, а CSS — за внешний вид, адаптивность и предсказуемое поведение интерфейса.

Цель CSS — сделать стили компонентными, переиспользуемыми и безопасными для изменений без лишней зависимости от текущей DOM-структуры.

## Основные принципы

CSS должен:

- следовать компонентной структуре проекта;
- использовать классы из HTML и БЭМ-логику;
- хранить стили рядом с ответственностью компонента;
- избегать глобальных переопределений без необходимости;
- не зависеть от случайной вложенности HTML;
- не требовать лишних HTML-оберток и классов;
- не дублировать одинаковые правила в разных местах;
- использовать CSS-переменные для токенов дизайн-системы.

Стили пишутся от общего к частному: сначала reset и токены, затем базовые правила, layout, компоненты, страницы и редкие utilities.

## Чётные значения размеров

В CSS не используются нечётные значения в `px` для размеров, отступов, координат, ширин, высот и типографики. Если в макете указано нечётное значение, при переносе в код оно приводится к ближайшему меньшему чётному значению.

Примеры:

- `font-size: 19px` → `font-size: 18px`;
- `padding: 13px 22px` → `padding: 12px 22px`;
- `width: 3px` → `width: 2px`.

Исключение допускается только для технических hairline-значений `1px` в `border`, `outline` и скрытых accessibility-паттернах, где уменьшение до `0px` удалит линию или сломает техническое поведение.

## Размер шрифта

Минимальный размер шрифта в интерфейсе — `12px`. Не используем текст меньше `12px` даже если в макете он выглядит мельче.

Рекомендуемый размер основного текстового контента — `16px`. Меньшие значения используем только для служебных подписей, меток, юридического текста и компактных элементов интерфейса, где это действительно предусмотрено макетом.

## Кнопки

Кнопки по умолчанию должны иметь `min-height: 40px`. Не уменьшаем базовую высоту кнопки ниже `40px`, чтобы сохранять удобную область нажатия и визуальную консистентность с интерактивными элементами интерфейса.

Контекстные варианты кнопок могут менять отступы, ширину, цвет и иконку, но не должны делать кнопку ниже `40px`.

## Textarea

Для `textarea` всегда задаем `resize: none;`.

Не оставляем браузерное изменение размера по умолчанию и не используем `resize: vertical`, `resize: horizontal` или `resize: both`. Размер текстового поля должен контролироваться стилями проекта, а не ручным растягиванием пользователем.

## Файловая структура

Если проект использует обычный CSS без сборки, стили всё равно разделяются по зонам ответственности. Один файл должен решать одну понятную задачу.

Рекомендуемая структура:

```text
index.html

src/
  design/
    index-page.pen
    images/

  fonts/

  styles/
    main.css

    abstracts/
      tokens.css

    base/
      reset.css
      fonts.css
      global.css
      typography.css

    layout/
      container.css
      section.css
      header.css
      footer.css
      grid.css

    components/
      button.css
      logo.css
      card.css
      product-card.css
      section-header.css
      form.css
      field.css
      modal.css
      tabs.css
      accordion.css

    pages/
      home.css
      catalog.css
      contacts.css

    utilities/
      visually-hidden.css
      helpers.css
```

`src` хранит исходники и ассеты проекта: дизайн-данные, изображения, шрифты и стили. HTML-файлы могут оставаться в корне страницы, но все пути к стилям, изображениям и шрифтам должны указывать на актуальные файлы внутри `src`.

`src/styles/main.css` подключает файлы в правильном порядке и не содержит стили компонентов.

```css
@import url("./abstracts/tokens.css");

@import url("./base/reset.css");
@import url("./base/fonts.css");
@import url("./base/global.css");
@import url("./base/typography.css");

@import url("./layout/container.css");
@import url("./layout/section.css");
@import url("./layout/header.css");
@import url("./layout/footer.css");
@import url("./layout/grid.css");

@import url("./components/button.css");
@import url("./components/logo.css");
@import url("./components/product-card.css");
@import url("./components/section-header.css");
@import url("./components/form.css");

@import url("./pages/home.css");
```

Если проект не использует `@import`, допускается подключать несколько CSS-файлов в HTML, но порядок должен оставаться тем же: токены, base, layout, components, pages, utilities.

## Назначение папок

### abstracts

Здесь хранятся CSS-переменные дизайн-системы. Файл токенов подключается до всех остальных стилей.

```css
:root {
	--container-width: 1280px;
	--radius-sm: 4px;
	--radius-md: 8px;
	--space-md: 16px;
	--space-lg: 24px;
	--color-text: #111111;
	--color-background: #ffffff;
	--color-accent: #ff8400;
}
```

### base

Базовые стили проекта:

- reset;
- подключение шрифтов;
- глобальные правила для `html`, `body`;
- базовая типографика;
- базовые правила для ссылок, кнопок, списков и изображений.

В `base` не пишутся стили конкретных компонентов.

### layout

Layout-файлы отвечают за крупную сетку и структурные блоки:

- контейнер;
- секция;
- шапка;
- футер;
- общие сетки;
- повторяемые layout-паттерны.

```css
.container {
	width: min(100% - 32px, var(--container-width));
	margin-inline: auto;
}

.section {
	padding-block: var(--space-section);
}

.grid-layout {
	display: grid;
	gap: var(--space-lg);
}
```

### components

Здесь лежат стили самостоятельных компонентов:

- кнопки;
- логотипы;
- карточки;
- формы;
- поля;
- табы;
- модальные окна;
- секционные заголовки;
- карточки товаров;
- карточки преимуществ.

Каждый компонент описывается в отдельном файле.

```css
.logo {
	display: inline-flex;
}

.logo__image {
	display: block;
}

.logo--header {
	/* только отличия логотипа в шапке, если они действительно нужны */
}
```

### pages

Файлы страниц нужны только для уникальной композиции конкретной страницы.

В `pages` допустимо описывать:

- порядок секций;
- уникальные расстояния между крупными блоками;
- редкие исключения, которые не принадлежат компоненту.

В `pages` не нужно переписывать внутренние стили компонентов.

### Граница между components, layout и pages

Перед созданием CSS-файла нужно определить ответственность блока:

- `components/` — переиспользуемые самостоятельные сущности, которые можно перенести на другую страницу без изменения внутренней структуры: `button`, `product-card`, `section-header`, `form`, `social-list`;
- `layout/` — общие структурные правила и крупные зоны раскладки: `container`, `section`, `header`, `footer`, `grid`;
- `pages/` — уникальная композиция конкретной страницы, которая не предполагается как общий паттерн. Например, `hero` главной страницы остается в `pages/home.css`, если такой hero не используется повторно на других страницах.

Если блок начинает повторяться на нескольких страницах и сохраняет одинаковую внутреннюю структуру, его нужно вынести из `pages/` в `components/`.

### utilities

Здесь хранятся маленькие вспомогательные классы, которые выполняют одну техническую задачу.

```css
.visually-hidden {}
.is-hidden {}
.no-scroll {}
```

Utility-классы не заменяют компоненты и не должны превращаться в набор визуальных атомов для всей верстки.

## Компонентный подход

Каждый компонент стилизуется через свой базовый класс.

CSS не должен провоцировать лишние HTML-обертки. Если стиль можно применить к существующему компоненту, элементу или layout-классу, не нужно добавлять новый wrapper только ради CSS.

Дополнительная обертка допустима, только если без нее нельзя корректно:

- сгруппировать элементы;
- создать независимую сетку;
- ограничить ширину;
- настроить позиционирование;
- сделать контейнер для изображения;
- подключить JS-hook или accessibility-структуру;
- реализовать нужную стилизацию компонента.

```css
.product-card {
	display: flex;
	flex-direction: column;
	gap: var(--space-lg);
}

.product-card__image-wrapper {
	aspect-ratio: 4 / 3;
	overflow: hidden;
}

.product-card__image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.product-card__title {
	font-size: 24px;
	line-height: 1.2;
}
```

Если обертка нужна только для одного изображения, используется элемент `block__image-wrapper`. Элемент `block__media` не используется для простой обертки вокруг `img`.

```css
.product-card__image-wrapper {
	aspect-ratio: 4 / 3;
	overflow: hidden;
}

.product-card__image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
```

Элемент `block__media` допустим только для сложной медиа-зоны: видео, галерея, изображение с подписью, контролы или смешанный медиа-контент.

Компонент не должен зависеть от страницы.

Плохо:

```css
.home-page .product-card {
	margin-top: 80px;
}
```

Лучше:

```css
.product-section {
	padding-block: 96px;
}

.product-section__grid {
	display: grid;
	gap: var(--space-lg);
}
```

Элемент не должен отталкивать сам себя от вышестоящего блока через `margin-top`.

Плохо:

```css
.product-card {
	margin-top: 40px;
}
```

Лучше управлять расстоянием на уровне родителя:

```css
.product-section__grid {
	display: grid;
	gap: 40px;
}
```

Если нужно отделить секцию от соседних блоков, это делается через `padding-block`, `gap` родительского layout или отдельное правило композиции страницы.

## БЭМ в CSS

CSS должен сохранять БЭМ-логику из HTML:

- блок пишется как самостоятельный селектор;
- элементы пишутся полным классом `block__element`;
- модификаторы пишутся полным классом `block--modifier`;
- модификатор не должен жить отдельно от базового класса в HTML;
- в имени класса допускается только один `__`;
- формат `block__element__subelement` не используется в проекте.

Хорошо:

```css
.card {
	padding: var(--space-lg);
	border-radius: var(--radius-md);
}

.card__body {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.card__content-title {
	font-size: 20px;
	line-height: 1.25;
}

.card--featured {
	background-color: var(--color-surface-accent);
}
```

Запрещено:

```css
.card__body__title {
	font-size: 20px;
}
```

Если название получается слишком длинным, нужно пересмотреть HTML-структуру или выделить вложенный компонент.

## Вложенность и каскад

Даже если проект поддерживает native CSS nesting, по умолчанию селекторы пишутся плоско: так проще читать, искать и переносить компоненты.

Хорошо:

```css
.card {}
.card__body {}
.card__title {}
.card--featured {}
```

Плохо:

```css
.section .container .card .card__body .card__title {
	font-size: 20px;
}
```

Глубокие селекторы делают стили зависимыми от текущего HTML и усложняют переиспользование компонентов.

## Контекстные стили

Контекст может управлять расположением компонента, но не должен переписывать его внутреннюю структуру.

Допустимо:

```css
.grid-layout {
	display: grid;
	gap: var(--space-lg);
}

.catalog-group__grid {
	grid-template-columns: repeat(3, 1fr);
}
```

Нежелательно:

```css
.catalog-section .product-card__title {
	font-size: 32px;
}
```

Если компоненту нужен другой вариант, используйте модификатор:

```css
.product-card--compact {
	gap: 16px;
}
```

Для сеток используется общий класс `grid-layout`. Если общей сетки достаточно, второй класс в HTML не добавляется.

```html
<div class="grid-layout">...</div>
```

Если конкретной секции действительно нужна своя отличающаяся раскладка, можно добавить элемент секции или группы:

```html
<div class="grid-layout catalog-group__grid">...</div>
```

```css
.catalog-group__grid {
	grid-template-columns: repeat(3, 1fr);
}
```

Контекстная раскладка может управлять только композицией: колонками, `gap`, выравниванием, порядком, `grid-column` и `grid-row`. Она не должна менять внутренние элементы карточек.

## Общие компоненты

Если один и тот же визуально-структурный паттерн повторяется в разных местах, для него создается общий компонент или общий класс.

```css
.section-header {
	display: flex;
	flex-direction: column;
	gap: var(--space-lg);
	margin-bottom: 32px;
}

.card-description {
	font-size: 16px;
	line-height: 1.5;
	color: var(--color-text-muted);
}
```

Не нужно дублировать одинаковые правила:

```css
.product-card p,
.feature-card p,
.service-card p {
	font-size: 16px;
	line-height: 1.5;
}
```

Лучше дать общему элементу понятный класс в HTML и стилизовать его один раз.

Одинаковые структурные части внутри одного компонента тоже стилизуются через один общий класс.

```css
.footer__column {
	display: flex;
	flex-direction: column;
	gap: var(--space-md);
}
```

## Типографика

Базовые стили `h1`, `h2`, `p`, `a`, `ul`, `ol` задаются в `base/typography.css`.

Компонентные заголовки стилизуются через классы:

```css
.page-title {}
.section-title {}
.card__title {}
.product-card__title {}
.form__title {}
```

Не нужно использовать классы, которые описывают только размер:

```css
.title-lg {}
.subtitle-sm {}
.h3-title {}
```

Размер — это CSS-решение, а не смысловая роль класса. Если один и тот же небольшой заголовок повторяется в разных компонентах, используется роль компонента или общий класс с понятным назначением:

```css
.card-title {}
.list-title {}
.form-title {}
```

Визуальный капс задается CSS, а не текстом в HTML:

```css
.button {
	text-transform: uppercase;
}
```

Ручные переносы через `<br>` не используются для дизайна. Если нужен перенос, управляйте шириной, `max-width`, `display`, `text-wrap`, `white-space` или layout-правилами.

## Декоративные элементы

Статический декор реализуется через CSS, а не через пустые HTML-элементы.

Линии, разделители, декоративные плашки, фоновые акценты и похожий декор создаются через:

- `border`;
- `background`;
- `box-shadow`;
- `outline`;
- `::before` / `::after`;
- gradients;
- masks, если они действительно нужны.

Плохо:

```html
<div class="hero__divider" aria-hidden="true"></div>
```

Хорошо:

```css
.hero__title::after {
	content: "";
	display: block;
	width: 92px;
	height: 2px;
	background-color: var(--color-accent);
}
```

Исключение допустимо только тогда, когда декоративный элемент действительно нужен как часть поведения: например, является отдельной целью для анимации, используется библиотекой вроде GSAP, управляется JavaScript или не может быть корректно реализован средствами CSS без ухудшения структуры.

## Изображения и медиа

Базовое поведение изображений можно задать глобально:

```css
img,
picture,
video,
canvas,
svg {
	display: block;
	max-width: 100%;
}
```

Размеры и кадрирование задаются в компоненте:

```css
.media-card__image {
	width: 100%;
	height: 280px;
	object-fit: cover;
}
```

В HTML у изображений всегда должны быть указаны `width` и `height`, а CSS отвечает за адаптивное отображение и кадрирование.

## Адаптивность

Адаптивные правила пишутся рядом с компонентом, к которому относятся.

Проект верстается по принципу mobile-first: базовые стили описывают мобильную версию, а расширение интерфейса для планшетов и десктопа добавляется через `min-width` media queries.

```css
.product-card {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--space-lg);
}

@media (min-width: 1024px) {
	.product-card {
		grid-template-columns: 1fr 1fr;
	}
}
```

Не нужно собирать все media queries проекта в одном отдельном файле. Так сложнее понять, какой компонент меняется на каком breakpoint.

## Container Queries

Container queries используются для компонентной адаптивности, когда поведение блока зависит от ширины его контейнера, а не от ширины окна браузера.

Важно: контейнер не может менять сам себя через собственный `@container`. Container query применяется к потомкам контейнера. Если нужно менять сам компонент, контейнером должен быть его родитель или дополнительная обертка.

Плохо:

```css
.product-card {
	container-type: inline-size;
	container-name: product-card;
}

@container product-card (max-width: 480px) {
	.product-card {
		grid-template-columns: 1fr;
	}
}
```

Хорошо:

```html
<div class="product-card-container">
	<article class="product-card">
		...
	</article>
</div>
```

```css
.product-card-container {
	container-type: inline-size;
	container-name: product-card;
}

@container product-card (max-width: 480px) {
	.product-card {
		grid-template-columns: 1fr;
	}
}
```

Также допустимо объявлять контейнером layout-элемент компонента или секции:

```css
.catalog-section__grid {
	container-type: inline-size;
	container-name: catalog-grid;
}

@container catalog-grid (max-width: 640px) {
	.product-card {
		grid-template-columns: 1fr;
	}
}
```

`@media` отвечает за крупные сценарии страницы и viewport, а `@container` — за внутреннюю адаптацию компонента в конкретном контейнере.

## Состояния

Для состояний используются классы состояния или БЭМ-модификаторы.

```css
.modal {
	opacity: 0;
	pointer-events: none;
}

.modal.is-open {
	opacity: 1;
	pointer-events: auto;
}

.field--error .field__control {
	border-color: var(--color-danger);
}
```

Классы состояния должны быть понятными:

```css
.is-open {}
.is-active {}
.is-disabled {}
.is-hidden {}
.has-error {}
```

## Модификаторы

Модификатор описывает вариант компонента, а не отдельное CSS-свойство.

Хорошо:

```css
.button--primary {}
.button--secondary {}
.button--small {}
.button--large {}
```

Плохо:

```css
.button--red {}
.button--margin-top-40 {}
.button--font-18 {}
```

Если модификатор начинает описывать конкретное свойство, лучше проверить, не нужен ли токен, utility-класс или изменение структуры компонента.

## Селекторы

Предпочтительный тип селектора — класс.

Допустимо:

```css
.button {}
.button__icon {}
.button--primary {}
```

Нежелательно:

```css
section div ul li a {}
.section > .container > .card > span {}
#header {}
```

Селекторы не должны быть слишком специфичными. Чем выше специфичность, тем сложнее поддерживать стили.

Не используйте селекторы по id для стилизации.

## Запрет на !important

В проекте не используется `!important`.

Если правило не применяется без `!important`, нужно исправить причину:

- уменьшить специфичность конфликтующего селектора;
- перенести стиль в правильный файл;
- проверить порядок подключения CSS-файлов;
- добавить корректный модификатор или класс состояния;
- убрать лишний глобальный селектор.

`!important` скрывает проблему архитектуры стилей и быстро делает компонентную систему непредсказуемой.

## Глобальные стили

Глобальные стили допустимы только для:

- reset;
- базовой типографики;
- CSS-переменных;
- `html` и `body`;
- технических helper-классов;
- нормализации медиа.

Глобальные селекторы не должны управлять внутренним видом компонентов.

Плохо:

```css
section p {
	margin-bottom: 24px;
}
```

Лучше:

```css
.section-description {
	margin: 0;
}
```

## CSS-переменные

Все дизайн-токены задаются через CSS custom properties.

```css
:root {
	--color-primary: #111111;
	--color-secondary: #666666;
	--color-muted: #999999;
	--color-black: #000000;
	--color-white: #ffffff;
	--color-dark: #111111;
	--color-light: #f5f5f5;
	--color-accent: #ffcc00;
	--color-danger: #d92d20;
	--color-warning: #f79009;
	--color-success: #12b76a;

	--color-text: var(--color-dark);
	--color-text-muted: var(--color-secondary);
	--color-text-inverse: var(--color-white);
	--color-link: var(--color-primary);
	--color-background: var(--color-white);
	--color-surface: var(--color-light);
	--color-surface-muted: #eeeeee;
	--color-surface-accent: var(--color-accent);
	--color-border: #dddddd;
	--color-border-muted: #eeeeee;
	--color-focus: var(--color-accent);
	--color-overlay: rgb(0 0 0 / 60%);

	--container-width: 1280px;

	--radius-xs: 2px;
	--radius-sm: 4px;
	--radius-md: 8px;
	--radius-lg: 16px;
	--radius-round: 999px;

	--space-2xs: 4px;
	--space-xs: 8px;
	--space-sm: 12px;
	--space-md: 16px;
	--space-lg: 24px;
	--space-xl: 32px;
	--space-2xl: 48px;
	--space-section: 96px;
	--space-card: 24px;

	--duration-fast: 0.15s;
	--duration-base: 0.2s;
	--duration-slow: 0.35s;
	--ease-base: ease;
	--transition-delay: 0.04s;
	--transition-base: var(--duration-base) var(--ease-base) var(--transition-delay);

	--z-header: 100;
	--z-dropdown: 200;
	--z-modal: 500;
}
```

### Цветовые переменные

В проекте должен быть базовый набор цветовых токенов:

```css
--color-primary
--color-secondary
--color-muted
--color-black
--color-white
--color-dark
--color-light
--color-accent
--color-danger
--color-warning
--color-success
```

Дополнительно рекомендуется использовать семантические alias-переменные:

```css
--color-text
--color-text-muted
--color-text-inverse
--color-link
--color-background
--color-surface
--color-surface-muted
--color-surface-accent
--color-border
--color-border-muted
--color-focus
--color-overlay
```

Базовые токены отвечают на вопрос "какой это цвет", а семантические токены отвечают на вопрос "где этот цвет используется".

### Размерные и motion-переменные

Все стандартные и переиспользуемые значения выносятся в переменные.

Это касается:

- ширины контейнера;
- базовых отступов;
- скруглений;
- длительности анимаций;
- easing;
- transition;
- z-index уровней;
- повторяемых размеров элементов.

Плохо:

```css
.button {
	border-radius: 8px;
	transition: color 0.2s ease, background-color 0.2s ease;
}
```

Хорошо:

```css
.button {
	border-radius: var(--radius-md);
	transition:
		color var(--transition-base),
		background-color var(--transition-base);
}
```

Если значение используется в нескольких местах или является частью дизайн-системы, оно должно быть токеном.

В компонентах предпочтительно использовать семантические токены:

```css
.card {
	padding: var(--space-card);
	color: var(--color-text);
	background-color: var(--color-surface);
	border-color: var(--color-border);
}
```

## Шрифты

`@font-face` описывается централизованно в `base/fonts.css`. Не дублируйте подключение шрифтов в компонентных файлах.

```css
@font-face {
	font-family: "Inter";
	src:
		url("../fonts/inter-regular.woff2") format("woff2"),
		url("../fonts/inter-regular.woff") format("woff");
	font-weight: 400;
	font-style: normal;
	font-display: swap;
}
```

## Порядок свойств

Внутри селектора свойства желательно группировать по смыслу:

1. позиционирование;
2. layout;
3. размеры;
4. отступы;
5. типографика;
6. фон и цвета;
7. рамки и радиусы;
8. эффекты;
9. переходы и анимации.

```css
.card {
	position: relative;
	display: flex;
	flex-direction: column;
	width: 100%;
	padding: var(--space-lg);
	font-size: 16px;
	color: var(--color-text);
	background-color: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
	transition: border-color var(--transition-base);
}
```

Не обязательно фанатично сортировать каждую строку, но внутри проекта порядок должен быть предсказуемым.

## Запрещенные практики

Не используем:

- глубокие селекторы, завязанные на случайную DOM-структуру;
- селекторы по id для стилизации;
- формат БЭМ-элементов `block__element__subelement`;
- классы, описывающие случайный внешний вид;
- глобальные обертки всей страницы вроде `page-wrapper`;
- лишние обертки без явной структурной, layout, styling, accessibility или JS-необходимости;
- лишние классы "на будущее";
- стили компонентов в файлах страниц без необходимости;
- самоотталкивание элемента от родителя через `margin-top`;
- `!important`;
- дублирование одинаковых CSS-блоков вместо общего класса;
- пустые HTML-элементы ради декора;
- `<br>` ради визуального переноса текста;
- `textarea` без `resize: none;`.

## Чеклист перед завершением

Перед завершением CSS-проверки нужно убедиться, что:

- файлы разделены по зонам ответственности;
- `main.css` только подключает файлы или содержит минимальный порядок импорта;
- селекторы основаны на классах;
- селекторы не завязаны на случайную вложенность HTML;
- в имени класса есть не больше одного `__`;
- БЭМ-структура не содержит формат `block__element__subelement`;
- повторяемые стили вынесены в общий компонент или общий класс;
- стандартные размеры, скругления, transition, duration, easing и z-index вынесены в CSS-переменные;
- HTML не содержит оберток или классов, созданных только ради удобства CSS;
- стили страницы не ломают внутренности компонентов;
- адаптивные правила лежат рядом с компонентами;
- базовые стили написаны для мобильной версии, расширения добавлены через mobile-first media queries;
- container queries меняют потомков контейнера, а не сам контейнер;
- `@font-face` подключается централизованно;
- внешние расстояния задаются родителем через `gap`, `padding` или layout-композицию;
- в стилях нет `!important`;
- глобальные правила не управляют конкретными блоками;
- модификаторы описывают варианты, а не отдельные свойства;
- статический декор реализован через CSS, а не пустые HTML-элементы;
- у каждого `textarea` задано `resize: none;`.
