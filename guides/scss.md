# Гайд по SCSS

Этот документ описывает правила написания SCSS в проекте. Он дополняет гайды по HTML-разметке и именованию классов: HTML отвечает за структуру, гайд по классам — за имена, а SCSS — за модульную организацию, стилизацию компонентов и предсказуемую поддержку интерфейса.

Цель SCSS — сделать стили компонентными, переиспользуемыми и безопасными для изменений.

## Основные принципы

SCSS должен:

- следовать компонентной структуре проекта;
- использовать БЭМ-селекторы;
- хранить стили рядом с ответственностью компонента;
- избегать глобальных переопределений без необходимости;
- не зависеть от случайной вложенности HTML;
- не дублировать одинаковые правила в разных компонентах;
- быть разделен на понятные модули.

Стили пишутся от общего к частному: сначала базовые настройки и токены, затем layout, затем компоненты, затем точечные исключения.

## Чётные значения размеров

В SCSS не используются нечётные значения в `px` для размеров, отступов, координат, ширин, высот и типографики. Если в макете указано нечётное значение, при переносе в код оно приводится к ближайшему меньшему чётному значению.

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

## Модульная система

SCSS разбивается на отдельные файлы по зонам ответственности. Один файл должен решать одну понятную задачу.

Не нужно хранить всю страницу в одном большом файле. Если компонент самостоятельный, у него должен быть свой SCSS-модуль.

Плохо:

```scss
// main.scss
.header {}
.hero {}
.button {}
.product-card {}
.footer {}
```

Хорошо:

```scss
// components/_button.scss
.button {}

// components/_product-card.scss
.product-card {}

// layout/_header.scss
.header {}
```

## Рекомендуемая структура файлов

Базовая структура проекта:

```text
index.html

src/
  design/
    index-page.pen
    images/

  fonts/

  styles/
    main.scss

    abstracts/
      _variables.scss
      _tokens.scss
      _mixins.scss
      _functions.scss

    base/
      _reset.scss
      _fonts.scss
      _global.scss
      _typography.scss

    layout/
      _container.scss
      _section.scss
      _header.scss
      _footer.scss
      _grid.scss

    components/
      _button.scss
      _card.scss
      _product-card.scss
      _section-header.scss
      _form.scss
      _field.scss
      _modal.scss
      _tabs.scss
      _accordion.scss

    pages/
      _home.scss
      _catalog.scss
      _contacts.scss

    utilities/
      _visually-hidden.scss
      _helpers.scss
```

`src` хранит исходники и ассеты проекта: дизайн-данные, изображения, шрифты и стили. HTML-файлы могут оставаться в корне страницы, но все пути к стилям, изображениям и шрифтам должны указывать на актуальные файлы внутри `src`.

`src/styles/main.scss` только подключает модули и не содержит стили компонентов.

Пример:

```scss
@use "abstracts/variables";
@use "abstracts/tokens";
@use "abstracts/mixins";

@use "base/reset";
@use "base/fonts";
@use "base/global";
@use "base/typography";

@use "layout/container";
@use "layout/section";
@use "layout/header";
@use "layout/footer";

@use "components/button";
@use "components/card";
@use "components/product-card";
@use "components/section-header";
@use "components/form";

@use "pages/home";
```

## Назначение папок

### abstracts

Здесь хранятся переменные, токены, функции и миксины. Эти файлы не должны генерировать CSS сами по себе.

Примеры:

```scss
$container-width: 1280px;
$radius-sm: 4px;
$radius-md: 8px;

@mixin media($breakpoint) {
	@media (max-width: $breakpoint) {
		@content;
	}
}
```

### base

Базовые стили проекта:

- reset;
- подключение шрифтов;
- глобальные правила для `html`, `body`;
- базовая типографика;
- базовые правила для ссылок, кнопок, изображений.

В `base` не пишутся стили конкретных компонентов.

### layout

Layout-файлы отвечают за крупную сетку и структурные блоки:

- контейнер;
- секция;
- шапка;
- футер;
- сетки;
- общие layout-паттерны.

Пример:

```scss
.container {
	width: min(100% - 32px, 1280px);
	margin-inline: auto;
}

.section {
	padding-block: 96px;
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

Логотип выносится в отдельный компонентный файл, например `components/_logo.scss`. Не нужно стилизовать один и тот же брендовый элемент через классы конкретных секций, если это общий компонент.

```scss
.logo {
	display: inline-flex;

	&__image {
		display: block;
	}

	&--header {}
	&--footer {}
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

Перед созданием SCSS-файла нужно определить ответственность блока:

- `components/` — переиспользуемые самостоятельные сущности, которые можно перенести на другую страницу без изменения внутренней структуры: `button`, `product-card`, `section-header`, `form`, `social-list`;
- `layout/` — общие структурные правила и крупные зоны раскладки: `container`, `section`, `header`, `footer`, `grid`;
- `pages/` — уникальная композиция конкретной страницы, которая не предполагается как общий паттерн. Например, `hero` главной страницы остается в `pages/_home.scss`, если такой hero не используется повторно на других страницах.

Если блок начинает повторяться на нескольких страницах и сохраняет одинаковую внутреннюю структуру, его нужно вынести из `pages/` в `components/`.

### utilities

Здесь хранятся маленькие вспомогательные классы, которые выполняют одну техническую задачу.

Примеры:

```scss
.visually-hidden {}
.is-hidden {}
.no-scroll {}
```

Utility-классы не заменяют компоненты и не должны превращаться в набор визуальных атомов для всей верстки.

## Компонентный подход в SCSS

Каждый компонент стилизуется через свой базовый класс.

SCSS не должен провоцировать лишние HTML-обертки. Если стиль можно применить к существующему компоненту, элементу или layout-классу, не нужно добавлять новый wrapper только ради CSS.

Дополнительная обертка допустима, если без нее нельзя корректно:

- сгруппировать элементы;
- создать независимую сетку;
- ограничить ширину;
- настроить позиционирование;
- сделать контейнер для изображения;
- подключить JS-хук или accessibility-структуру;
- реализовать нужную стилизацию компонента.

Пример:

```scss
.product-card {
	display: flex;
	flex-direction: column;
	gap: var(--space-lg);

	&__image-wrapper {
		aspect-ratio: 4 / 3;
		overflow: hidden;
	}

	&__image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	&__title {
		font-size: 24px;
		line-height: 1.2;
	}
}
```

Если обертка нужна только для одного изображения, в SCSS используется элемент `&__image-wrapper`. Элемент `&__media` не используется для простой обертки вокруг `img`.

```scss
.product-card {
	&__image-wrapper {
		aspect-ratio: 4 / 3;
		overflow: hidden;
	}

	&__image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}
```

Элемент `&__media` допустим только для сложной медиа-зоны: видео, галерея, изображение с подписью, контролы или смешанный медиа-контент.

Компонент не должен зависеть от страницы:

Плохо:

```scss
.home-page .product-card {
	margin-top: 80px;
}
```

Лучше:

```scss
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

```scss
.product-card {
	margin-top: 40px;
}
```

Лучше управлять расстоянием на уровне родителя:

```scss
.product-section__grid {
	display: grid;
	gap: 40px;
}
```

Если нужно отделить секцию от соседних блоков, это делается через `padding-block`, `gap` родительского layout или отдельное правило композиции страницы.

## БЭМ в SCSS

SCSS должен сохранять БЭМ-логику из HTML:

- блок пишется как самостоятельный селектор;
- элементы пишутся через `&__element`;
- модификаторы пишутся через `&--modifier`;
- модификатор не должен жить отдельно от базового класса в HTML;
- в имени класса допускается только один `__`;
- формат `block__element__subelement` не используется в проекте.

Хорошо:

```scss
.card {
	padding: var(--space-lg);
	border-radius: var(--radius-md);

	&__body {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	&__content-title {
		font-size: 20px;
		line-height: 1.25;
	}

	&--featured {
		background-color: var(--color-surface-accent);
	}
}
```

Запрещено:

```scss
.card {
	&__body {
		&__title {
			font-size: 20px;
		}
	}
}
```

Если название получается слишком длинным, нужно пересмотреть HTML-структуру или выделить вложенный компонент.

## Уровень вложенности

Максимальный уровень вложенности в SCSS — три уровня.

Допустимо:

```scss
.card {
	&__body {
		display: flex;
	}

	&__title {
		font-size: 20px;
	}
}
```

Допустимо для состояния:

```scss
.tabs {
	&__button {
		color: var(--color-text-muted);

		&.is-active {
			color: var(--color-text);
		}
	}
}
```

Плохо:

```scss
.section {
	.container {
		.card {
			.card__body {
				.card__title {
					font-size: 20px;
				}
			}
		}
	}
}
```

Глубокая вложенность делает стили зависимыми от текущего HTML и усложняет переиспользование компонентов.

## Контекстные стили

Контекст может управлять расположением компонента, но не должен переписывать его внутреннюю структуру.

Допустимо:

```scss
.grid-layout {
	display: grid;
	gap: var(--space-lg);
}

.catalog-section__grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: var(--space-lg);
}
```

Нежелательно:

```scss
.catalog-section .product-card__title {
	font-size: 32px;
}
```

Если компоненту нужен другой вариант, используйте модификатор:

```scss
.product-card {
	&--compact {
		gap: 16px;
	}
}
```

Для сеток используется общий класс `grid-layout`. Конкретная секция может управлять раскладкой через свой элемент:

```html
<div class="grid-layout catalog-group__grid">...</div>
```

```scss
.grid-layout {
	display: grid;
	gap: var(--space-lg);
}

.catalog-group__grid {
	grid-template-columns: repeat(3, 1fr);
}

.benefits-section__grid {
	grid-template-columns: repeat(2, 1fr);
}
```

Контекстный селектор тоже допустим для layout-настроек:

```scss
.catalog-section .grid-layout {
	grid-template-columns: repeat(3, 1fr);
}
```

Но предпочтительно использовать элемент секции или группы, если сетка является частью этой секции: `catalog-section__grid`, `catalog-group__grid`, `benefits-section__grid`, `product-section__grid`.

Контекстная раскладка может управлять только композицией: колонками, `gap`, выравниванием, порядком, `grid-column` и `grid-row`. Она не должна менять внутренние элементы карточек.

## Общие компоненты

Если один и тот же визуально-структурный паттерн повторяется в разных местах, для него создается общий компонент или общий класс.

Пример:

```scss
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

```scss
.product-card p,
.feature-card p,
.service-card p {
	font-size: 16px;
	line-height: 1.5;
}
```

Лучше дать общему элементу понятный класс в HTML и стилизовать его один раз.

## Типографика

Базовые стили `h1`, `h2`, `p`, `a`, `ul`, `ol` задаются в `base/_typography.scss`.

Компонентные заголовки стилизуются через классы:

```scss
.page-title {}
.section-title {}
.card__title {}
.product-card__title {}
.form__title {}
```

Не нужно использовать классы, которые описывают только размер:

```scss
.title-lg {}
.subtitle-sm {}
.h3-title {}
```

Размер — это CSS-решение, а не смысловая роль класса. Если один и тот же небольшой заголовок повторяется в разных компонентах, используется роль компонента или общий класс с понятным назначением:

```scss
.card-title {}
.list-title {}
.form-title {}
```

## Изображения и медиа

Базовое поведение изображений можно задать глобально:

```scss
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

```scss
.media-card {
	&__image {
		width: 100%;
		height: 280px;
		object-fit: cover;
	}
}
```

В HTML у изображений всегда должны быть указаны `width` и `height`, а SCSS отвечает за адаптивное отображение и кадрирование.

## Адаптивность

Адаптивные правила пишутся рядом с компонентом, к которому относятся.

Проект верстается по принципу mobile-first: базовые стили описывают мобильную версию, а расширение интерфейса для планшетов и десктопа добавляется через min-width media queries.

Хорошо:

```scss
.product-card {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--space-lg);

	@include media(1024px) {
		grid-template-columns: 1fr 1fr;
	}
}
```

Не нужно собирать все медиа-запросы проекта в одном отдельном файле. Так сложнее понять, какой компонент меняется на каком breakpoint.

## Container queries

Container queries используются для компонентной адаптивности, когда поведение блока зависит от ширины его контейнера, а не от ширины окна браузера.

Важно: контейнер не может менять сам себя через собственный `@container`. Container query применяется к потомкам контейнера. Если нужно менять сам компонент, контейнером должен быть его родитель или дополнительная обертка.

Плохо:

```scss
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

Такой код не решает задачу изменения самой `.product-card`, потому что `.product-card` одновременно объявлена контейнером и выбрана как изменяемый элемент.

Хорошо:

```html
<div class="product-card-container">
	<article class="product-card">
		...
	</article>
</div>
```

```scss
.product-card-container {
	container-type: inline-size;
	container-name: product-card;
}

@include container(product-card, 480px) {
	.product-card {
		grid-template-columns: 1fr;
	}
}
```

Также допустимо объявлять контейнером layout-элемент компонента или секции:

```scss
.catalog-section__grid {
	container-type: inline-size;
	container-name: catalog-grid;
}

@include container(catalog-grid, 640px) {
	.product-card {
		grid-template-columns: 1fr;
	}
}
```

Container queries уместны для:

- карточек;
- форм;
- сайдбаров;
- медиа-блоков;
- секционных шапок;
- компонентов, которые используются в разных сетках и колонках.

`@media` отвечает за крупные сценарии страницы и viewport, а `@container` — за внутреннюю адаптацию компонента в конкретном контейнере.

## Состояния

Для состояний используются классы состояния или БЭМ-модификаторы.

Примеры:

```scss
.modal {
	opacity: 0;
	pointer-events: none;

	&.is-open {
		opacity: 1;
		pointer-events: auto;
	}
}

.field {
	&--error {
		.field__control {
			border-color: var(--color-danger);
		}
	}
}
```

Классы состояния должны быть понятными:

```scss
.is-open
.is-active
.is-disabled
.is-hidden
.has-error
```

## Модификаторы

Модификатор описывает вариант компонента, а не отдельное CSS-свойство.

Хорошо:

```scss
.button {
	&--primary {}
	&--secondary {}
	&--small {}
	&--large {}
}
```

Плохо:

```scss
.button--red {}
.button--margin-top-40 {}
.button--font-18 {}
```

Если модификатор начинает описывать конкретное свойство, лучше проверить, не нужен ли токен, utility-класс или изменение структуры компонента.

## Селекторы

Предпочтительный тип селектора — класс.

Допустимо:

```scss
.button {}
.button__icon {}
.button--primary {}
```

Нежелательно:

```scss
section div ul li a {}
.section > .container > .card > span {}
#header {}
```

Селекторы не должны быть слишком специфичными. Чем выше специфичность, тем сложнее поддерживать стили.

## Запрет на !important

В проекте не используется `!important`.

Если правило не применяется без `!important`, нужно исправить причину:

- уменьшить специфичность конфликтующего селектора;
- перенести стиль в правильный компонентный файл;
- проверить порядок подключения модулей;
- добавить корректный модификатор или класс состояния;
- убрать лишний глобальный селектор.

`!important` скрывает проблему архитектуры стилей и быстро делает компонентную систему непредсказуемой.

## Глобальные стили

Глобальные стили допустимы только для:

- reset;
- базовой типографики;
- CSS-переменных;
- body/html;
- технических helper-классов;
- нормализации медиа.

Глобальные селекторы не должны управлять внутренним видом компонентов.

Плохо:

```scss
section p {
	margin-bottom: 24px;
}
```

Лучше:

```scss
.section-description {
	margin: 0;
}
```

## CSS-переменные и SCSS-переменные

SCSS-переменные подходят для значений, которые нужны на этапе сборки:

```scss
$breakpoint-tablet: 1024px;
$container-width: 1280px;
```

CSS-переменные подходят для дизайн-токенов, темизации и значений, которые могут меняться в браузере:

```scss
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

### Обязательные цветовые переменные

В проекте должен быть базовый набор цветовых токенов:

```scss
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

Эти переменные описывают базовую палитру проекта. Они задаются в `abstracts/_tokens.scss` или в отдельном файле токенов, который подключается до компонентов.

Дополнительно рекомендуется использовать семантические alias-переменные:

```scss
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

### Обязательные размерные и motion-переменные

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

Примеры обязательных токенов:

```scss
--container-width

--radius-xs
--radius-sm
--radius-md
--radius-lg
--radius-round

--space-xs
--space-sm
--space-md
--space-lg
--space-xl
--space-section
--space-card

--duration-fast
--duration-base
--duration-slow
--ease-base
--transition-delay
--transition-base

--z-header
--z-dropdown
--z-modal
```

Плохо:

```scss
.button {
	border-radius: 8px;
	transition: color 0.2s ease, background-color 0.2s ease;
}
```

Хорошо:

```scss
.button {
	border-radius: var(--radius-md);
	transition:
		color var(--transition-base),
		background-color var(--transition-base);
}
```

Если значение используется в нескольких местах или является частью дизайн-системы, оно должно быть токеном.

В компонентах предпочтительно использовать семантические токены:

```scss
.card {
	padding: var(--space-card);
	color: var(--color-text);
	background-color: var(--color-surface);
	border-color: var(--color-border);
}
```

## Миксины

Миксины используются для повторяемой логики, а не для скрытия обычных CSS-свойств.

В проекте обязательны миксины для:

- media queries;
- container queries;
- подключения шрифтов через `@font-face`.

`@media`, `@container` и `@font-face` не пишутся вручную в компонентных файлах. Для них используются единые миксины из `abstracts/_mixins.scss`.

Хорошо:

```scss
@mixin media($breakpoint) {
	@media (min-width: $breakpoint) {
		@content;
	}
}

@mixin container($name, $width) {
	@container #{$name} (max-width: #{$width}) {
		@content;
	}
}

@mixin font-face($font-family, $file-path, $font-weight: 400, $font-style: normal, $font-display: swap) {
	@font-face {
		font-family: $font-family;
		src:
			url("#{$file-path}.woff2") format("woff2"),
			url("#{$file-path}.woff") format("woff");
		font-weight: $font-weight;
		font-style: $font-style;
		font-display: $font-display;
	}
}
```

Использование:

```scss
.product-card {
	display: grid;
	grid-template-columns: 1fr;

	@include media(1024px) {
		grid-template-columns: 1fr 1fr;
	}
}

@include font-face("Inter", "../fonts/inter-regular", 400);
```

Плохо:

```scss
@mixin flex-center {
	display: flex;
	align-items: center;
	justify-content: center;
}
```

Если миксин просто прячет три понятных свойства, чаще лучше написать эти свойства явно.

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

Пример:

```scss
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

- глубокую вложенность больше трех уровней;
- селекторы по id для стилизации;
- формат БЭМ-элементов `block__element__subelement`;
- классы, описывающие случайный внешний вид;
- глобальные обертки всей страницы вроде `page-wrapper`;
- лишние обертки без явной структурной, layout, styling, accessibility или JS-необходимости;
- стили компонентов в файлах страниц без необходимости;
- ручное написание `@media`, `@container` и `@font-face` вне обязательных миксинов;
- самоотталкивание элемента от родителя через `margin-top`;
- `!important`;
- стилизацию по случайной DOM-структуре;
- дублирование одинаковых CSS-блоков вместо общего класса;
- `textarea` без `resize: none;`.

## Чеклист перед завершением

Перед завершением SCSS-проверки нужно убедиться, что:

- каждый компонент лежит в своем файле;
- `main.scss` только подключает модули;
- вложенность не глубже трех уровней;
- селекторы основаны на классах;
- в имени класса есть не больше одного `__`;
- БЭМ-структура не содержит формат `block__element__subelement`;
- повторяемые стили вынесены в общий компонент или общий класс;
- стандартные размеры, скругления, transition, duration, easing и z-index вынесены в переменные;
- HTML не содержит оберток, созданных только ради удобства написания CSS;
- стили страницы не ломают внутренности компонентов;
- адаптивные правила лежат рядом с компонентами;
- базовые стили написаны для мобильной версии, расширения добавлены через mobile-first media queries;
- container queries меняют потомков контейнера, а не сам контейнер;
- у каждого `textarea` задано `resize: none;`;
- media queries, container queries и font-face подключаются через обязательные миксины;
- внешние расстояния задаются родителем через `gap`, `padding` или layout-композицию;
- в стилях нет `!important`;
- глобальные правила не управляют конкретными блоками;
- модификаторы описывают варианты, а не отдельные свойства.
