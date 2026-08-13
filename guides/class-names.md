# Гайд по именованию классов

Этот документ описывает правила именования классов в HTML-разметке. Он дополняет гайд по HTML-верстке и используется вместе с компонентным подходом.

Цель именования — сделать разметку понятной, переиспользуемой и устойчивой к изменениям дизайна.

## Основные принципы

Классы должны быть:

- простыми;
- понятными без контекста макета;
- общепринятыми для веб-интерфейсов;
- компонентными;
- переиспользуемыми там, где это уместно;
- не привязанными к случайной позиции на странице;
- не описывающими внешний вид, если это не utility-класс или модификатор состояния.

Хорошее имя говорит, что это за блок и какую роль он выполняет.

На этапе верстки не нужно давать одному элементу лишние классы без явной необходимости. У элемента должен быть минимальный набор классов, достаточный для его текущей роли: блок, элемент, обязательный модификатор, общий layout-класс или JS-hook.

Не добавляйте классы "на будущее". Если дополнительный класс понадобится позже в процессе стилизации, его можно добавить в момент, когда появилась конкретная задача и понятно, почему существующих классов недостаточно.

Плохо:

```html
<div class="orange-block-left-2">
	<div class="home-big-text-wrapper">
		<div class="second-section-card"></div>
	</div>
</div>
```

Хорошо:

```html
<section class="section">
	<div class="section-header">
		<article class="product-card"></article>
	</div>
</section>
```

Плохо:

```html
<article class="product-card product-card--compact catalog-group__card custom-card">
	...
</article>
```

Хорошо:

```html
<article class="product-card">
	...
</article>
```

## БЭМ как базовая методология

В проекте используется БЭМ-логика:

- блок — самостоятельный компонент;
- элемент — часть блока;
- модификатор — вариант блока или элемента.

Формат:

```html
block block__element block--modifier block__element--modifier
```

Пример:

```html
<article class="product-card product-card--featured">
	<div class="product-card__image-wrapper">
		<img class="product-card__image" src="" alt="" width="320" height="240" />
	</div>
	<div class="product-card__body">
		<span class="product-card__title">Упаковочная лента</span>
		<p class="card-description">Описание товара</p>
	</div>
</article>
```

## Блок

Блок — самостоятельная сущность интерфейса.

Примеры блоков:

```html
header footer main-nav hero section section-header product-card feature-card
request-form button field tabs accordion modal
```

Блок можно перенести в другое место страницы без изменения его внутренней структуры.

## Элемент

Элемент принадлежит блоку и не используется отдельно.

Примеры:

```html
header__inner header__actions hero__content hero__image-wrapper logo logo__image
product-card__body product-card__title product-card__image request-form__actions
```

В имени класса допускается только один `__`. Формат `block__element__subelement` не используется в проекте.

Запрещено:

```html
card__body__title header__nav__item__link
```

Если нужно показать вложенную роль внутри элемента, используйте дефис в имени элемента или выделяйте вложенный фрагмент в отдельный блок.

Допустимо:

```html
card__content-title header__nav-link
```

Если вложенность можно упростить, лучше оставить прямой элемент блока:

```html
card__title nav__link
```

## Модификатор

Модификатор описывает вариант блока или элемента.

Примеры:

```html
button--primary button--secondary button--large product-card--horizontal
section--dark section--light field--error modal--open
```

Модификатор всегда используется вместе с базовым классом.

Плохо:

```html
<a class="button--primary">...</a>
```

Хорошо:

```html
<a class="button button--primary">...</a>
```

## Абстрактные классы

Абстрактные классы нужны для повторяющихся структурных ролей.

Их можно использовать, когда одинаковый паттерн встречается в разных компонентах.

Примеры:

```html
container section section-header section-title section-description grid-layout
button-row card-description form-row field field__label field__control
```

Абстрактный класс не должен быть слишком общим.

Плохо:

```html
box text image wrapper content
```

Допустимо, если роль ясна из контекста:

```html
section-header card-description button-row form-row grid-layout media-block
```

## Когда использовать абстрактный класс

Используйте абстрактный класс, если:

- блоки выполняют одинаковую роль;
- структура повторяется;
- стили и поведение должны быть едиными;
- класс не зависит от конкретной страницы;
- имя понятно без визуального макета.

Пример:

```html
<div class="catalog-section-header">...</div>
<div class="packaging-section-header">...</div>
<div class="special-section-header">...</div>
```

Если это один и тот же паттерн, лучше:

```html
<div class="catalog-section-header">...</div>
<div class="catalog-section-header">...</div>
<div class="catalog-section-header">...</div>
```

Или, если паттерн используется не только в каталоге:

```html
<div class="section-header">...</div>
```

Одинаковые структурные части внутри одного компонента тоже получают одинаковый класс. Не называйте повторяемые колонки по их содержанию, если их роль в структуре одна и та же.

Плохо:

```html
<div class="footer__nav">...</div>
<div class="footer__delivery">...</div>
<div class="footer__contacts">...</div>
```

Хорошо:

```html
<div class="footer__column">...</div>
<div class="footer__column">...</div>
<div class="footer__column">...</div>
```

## Когда не использовать абстрактный класс

Не используйте общий класс, если:

- блоки похожи только внешне;
- у них разная смысловая роль;
- общий класс делает HTML менее понятным;
- имя получается слишком размытым;
- блок уникален для одной секции.

Плохо:

```html
<div class="content">...</div>
<div class="content">...</div>
<div class="content">...</div>
```

Лучше:

```html
<div class="hero__content">...</div>
<div class="product-card__body">...</div>
<div class="footer__content">...</div>
```

## Не называйте классы по внешнему виду

Класс не должен описывать цвет, размер или позицию, если это не осознанный utility-класс.

Плохо:

```html
orange-button big-title left-card black-section top-block
```

Лучше:

```html
button button--primary page-title feature-card section section--dark hero
```

## Не называйте классы по порядку на странице

Порядок секций может измениться. Имя класса не должно ломаться от перестановки.

Плохо:

```html
section-1 second-block third-card bottom-section
```

Лучше:

```html
hero benefits-section catalog-section cta-section footer
```

## Декоративные элементы

Для статического декора не создаются отдельные HTML-элементы и классы. Линии, разделители, декоративные плашки и фоновые акценты реализуются через CSS на существующих смысловых блоках или через псевдоэлементы.

Отдельный элемент с классом допустим только если декор нужен как самостоятельная часть поведения: например, является целью JS-анимации, используется GSAP или управляется скриптом.

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

## Не используйте названия из дизайна без адаптации

Названия слоев из Figma, Pencil или другого редактора часто описывают визуальное расположение, а не структуру сайта.

Имя слоя, фрейма, группы или колонки не является видимым контентом. Его нельзя превращать в HTML-элемент с текстом. Такие названия помогают выбрать класс или понять структуру, но не создают новые заголовки, подписи и пункты интерфейса.

Плохо:

```html
hero-left-frame orange-line-3 wrapper-copy-main-final
```

Лучше:

```html
hero__content section-divider section-header
```

Плохо:

```html
<div class="footer__delivery">
	<span class="footer__nav-title">Доставка</span>
	<ul class="link-list">...</ul>
</div>
```

Хорошо, если в макете нет отдельного текстового слоя `Доставка`:

```html
<div class="footer__delivery">
	<ul class="link-list">...</ul>
</div>
```

## Основные компоненты сайта

Ниже приведены рекомендуемые базовые имена для типовых компонентов.

### Обертки страницы

Не оборачивайте весь контент страницы в глобальную обертку вроде `page-wrapper`, `site-wrapper`, `content-wrapper`.

Обертки должны находиться внутри своих смысловых блоков. Типовой паттерн:

```html
<section class="section">
	<div class="container">...</div>
</section>
```

Если блоку нужен внутренний слой, используйте элемент этого блока:

```html
<header class="header">
	<div class="header__inner">...</div>
</header>
```

Внутренние обертки создаются только при явной необходимости. Классы `block__inner`, `block__body`, `block__content`, `block__top`, `block__bottom`, `block__brand` допустимы только тогда, когда этот слой действительно группирует элементы или нужен для layout/styling-задачи, которую нельзя решить без него.

Плохо:

```html
<div class="footer__inner">
	<div class="footer__brand">
		<a class="logo" href="/">...</a>
	</div>
</div>
```

Хорошо:

```html
<footer class="footer">
	<div class="container">
		<a class="logo" href="/">...</a>
	</div>
</footer>
```

Для базовых блоков шапки и футера используем простые классы `header` и `footer`. Дополнительный префикс не нужен, если в проекте нет нескольких разных типов шапок или футеров.

### Layout

```html
container section section__inner section-header section-title
section-description section-actions
```

### Header

```html
header header__inner header__nav header__actions header__button
logo logo__image logo--header
```

Логотип обычно является отдельным компонентом `logo`, а не элементом шапки. В шапке используется базовый блок с контекстным модификатором.

```html
<a class="logo logo--header" href="/" aria-label="Название компании">
	<img class="logo__image" src="" alt="Название компании" width="120" height="48" />
</a>
```

### Navigation

```html
nav nav__list nav__item nav__link main-nav footer-nav breadcrumbs
breadcrumbs__item breadcrumbs__link
```

### Hero

```html
hero hero__inner hero__content hero__title hero__description hero__actions
hero__image-wrapper hero__image
```

### Buttons

```html
button button--primary button--secondary button--ghost button--link
button--small button--large button--disabled button__icon button__text
button-row
```

Если для нескольких кнопок или ссылок-кнопок нужна общая обертка, она именуется `button-row`. Контекстный класс секции можно добавить вторым классом, но не заменять им `button-row`.

```html
<div class="button-row hero__actions">
	<button class="button button--primary" type="button">Оставить заявку</button>
	<a class="button button--secondary" href="/catalog">Перейти в каталог</a>
</div>
```

### Cards

```html
card card__image-wrapper card__image card__body card__title card__description card__meta
card__actions card--horizontal card--featured card-description
```

### Grid Layout

```html
grid-layout catalog-section__grid catalog-group__grid benefits-section__grid
product-section__grid
```

`grid-layout` — общий переиспользуемый layout-класс для сетки. Он не должен описывать конкретный контент внутри.

Плохо:

```html
cards-grid products-grid benefits-cards-grid
```

Хорошо:

```html
<div class="grid-layout">...</div>
```

Секция или группа может добавлять свой элемент для конкретной раскладки только тогда, когда общей сетки недостаточно. Такой элемент отвечает за количество колонок, расстояния и правила размещения, но не за внутренние стили карточек.

```html
<div class="grid-layout catalog-group__grid">...</div>
```

### Product Cards

```html
product-card product-card__image-wrapper product-card__image product-card__body
product-card__title product-card__description product-card__price
product-card__meta product-card__actions product-card--compact
product-card--horizontal
```

### Feature / Benefit Cards

```html
feature-card feature-card__icon feature-card__image-wrapper feature-card__body
feature-card__title feature-card__description benefit-card benefit-card__number
benefit-card__image-wrapper benefit-card__title benefit-card__description
```

Если обертка нужна только для одного изображения, используйте `block__image-wrapper`. Класс `block__media` не используется для простой обертки вокруг `img`.

```html
<div class="product-card__image-wrapper">
	<img class="product-card__image" src="" alt="" width="540" height="360" />
</div>
```

`block__media` допустим только для сложной медиа-зоны: видео, галерея, изображение с подписью, контролы или смешанный медиа-контент.

### Media Blocks

```html
media-block media-block__content media-block__media media-block__image
media-block__title media-block__description media-block--reverse
```

### Lists

```html
list list__item check-list check-list__item link-list link-list__item
link-list__link social-list social-list__item social-list__link
```

### Forms

```html
form form__body form__row form__actions field field__label field__control
field__hint field__error field--error request-form request-form__body
request-form__actions
```

### Inputs

```html
input textarea select checkbox radio switch
```

Если используются кастомные поля, они оформляются как компоненты:

```html
custom-select custom-select__button custom-select__list custom-select__option
```

### Tabs

```html
tabs tabs__list tabs__tab tabs__panel tabs__tab--active tabs__panel--active
```

### Accordion

```html
accordion accordion__item accordion__button accordion__content
accordion__item--open
```

### Modal

```html
modal modal__overlay modal__dialog modal__header modal__title modal__body
modal__footer modal__close modal--open
```

### Footer

```html
footer footer__inner footer__column footer__socials
footer__legal footer__copyright logo logo__image logo--footer
```

В футере используется тот же компонент `logo`, при необходимости с модификатором `logo--footer`.

### CTA

```html
cta cta__inner cta__content cta__title cta__description cta__actions cta__form
```

### Tables

```html
table table__head table__body table__row table__cell table__cell--numeric
```

### Badges and Tags

```html
badge badge--success badge--warning badge--danger tag tag-list tag-list__item
```

### Pagination

```html
pagination pagination__list pagination__item pagination__link
pagination__link--current
```

## Заголовки

В HTML по умолчанию используются только `h1` и `h2`.

Для крупных смысловых заголовков используйте классы, которые описывают роль блока:

```html
page-title
section-title
section-description
```

Если в проекте используется `section-header`, секционный заголовок `section-title` всегда размещается внутри него, даже когда у секции нет `section-description`. Это сохраняет единый HTML-паттерн для всех заголовочных зон секций.

```html
<div class="section-header">
	<h2 class="section-title">Почему сотрудничать с нами выгодно</h2>
</div>
```

Не создавайте дополнительные элементы или классы ради ручного управления переносом строки. Визуальные переносы задаются CSS, а тег `<br>` по умолчанию запрещен.

Плохо:

```html
<h2 class="section-title">Преимущества,<br />которые работают</h2>
```

Хорошо:

```html
<h2 class="section-title">Преимущества, которые работают</h2>
```

Остальные визуальные заголовки создаются через `span` с классом компонента:

```html
<span class="card__title">Название карточки</span>
<span class="feature-card__title">Название преимущества</span>
```

Такие `span` добавляются только для реальных текстовых слоёв из макета или текста из ТЗ. Нельзя создавать `footer-nav__title`, `footer__nav-title` или похожий элемент только потому, что колонка или группа в макете имеет имя `Разделы`, `Доставка`, `Контакты`.

Не используйте слишком общие классы без контекста:

```html
title
subtitle
```

Такие классы быстро становятся неоднозначными: непонятно, это заголовок страницы, секции, карточки, формы или футера.

Если внутри строки или заголовка есть только один фрагмент с отличающимся цветом, для него не нужен отдельный класс. Достаточно обычного `span` внутри родительского класса.

```html
<h1 class="hero__title">Клейкая лента <span>для упаковки</span></h1>
```

Не используйте размерные модификаторы для смысловых заголовков:

```html
subtitle--xl
subtitle--lg
subtitle--md
subtitle--sm
subtitle--xs
```

Размер относится к типографической шкале или CSS-токенам, а не к смысловой HTML-разметке. Если нужна отдельная utility-система для размеров текста, она описывается отдельно и не смешивается с компонентным именованием.

Рекомендуемый подход:

```html
<h1 class="page-title">Главный заголовок страницы</h1>
<h2 class="section-title">Что мы предлагаем</h2>
<p class="section-description">Описание секции</p>

<span class="card__title">Упаковочная лента</span>
<p class="card-description">Описание карточки</p>
```

Не используйте `h3`, `h4`, `h5`, `h6` для визуальных подзаголовков карточек и мелких блоков.

## Состояния

Состояние можно описывать модификатором или ARIA-атрибутом.

Примеры классов:

```html
is-active is-open is-hidden is-disabled is-loading has-error
```

Примеры:

```html
<button class="tabs__tab is-active" aria-selected="true">Каталог</button>
<div class="accordion__item is-open">...</div>
<label class="field has-error">...</label>
```

Состояния должны быть общими и понятными. Не нужно создавать уникальное состояние для каждого компонента, если можно использовать общепринятое.

## JavaScript hooks

Если JavaScript нужен для поиска элемента, лучше использовать отдельный hook-класс или data-атрибут.

Допустимо:

```html
<button
	class="button button--primary js-modal-open"
	data-modal-target="request"
>
	Оставить заявку
</button>
```

JS-классы не должны использоваться для стилизации.

## Чеклист именования

- Класс описывает роль элемента, а не внешний вид.
- Блок можно перенести в другое место без переименования.
- Элементы принадлежат своему блоку.
- Модификаторы не используются без базового класса.
- Одинаковые структурные блоки имеют общий класс.
- Абстрактный класс не слишком общий.
- Нет глобальной обертки всей страницы вроде `page-wrapper`; обертки находятся внутри своих блоков.
- Нет лишних оберток без явной структурной, семантической, styling, layout, accessibility или JS-необходимости.
- Нет классов по цвету, размеру или порядку секции.
- В имени класса есть не больше одного `__`; формат `block__element__subelement` не используется.
- Вложенная роль пишется через дефис: `block__element-part`, либо выносится в отдельный блок.
- Для состояний используются понятные `is-*` / `has-*`.
- Для JavaScript используются отдельные hooks или data-атрибуты.
