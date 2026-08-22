# История переписки и работы над проектом newmark

Файл фиксирует рабочую историю проекта: ключевые вопросы, принятые правила, внесенные изменения и текущую логику структуры. Это не дословная стенограмма, а сжатая проектная память по нашей переписке и выполненным правкам.

## Стартовая задача

Работа началась с вопроса о том, как читать и понимать `pen.dev` файл с макетом. После этого был проверен файл:

`/Users/yuriybevov/Desktop/local-projects/AI-design-systems/pen.dev/newmark/index.html`

Целью стало привести HTML и SCSS к макету, внутренним гайдам и единой логике именования.

## Пересборка index.html

По запросу текущий `index.html` был переименован в `_index.html`, после чего был создан новый `index.html` с рабочей семантической структурой страницы.

В процессе были исправлены подходы к разметке:

- Заголовки не дробятся на множество мелких `span` ради управления переносами.
- Если нужно выделить цветом часть текста, оборачивается только отличающийся фрагмент.
- Если внутри строки один отличающийся фрагмент, дополнительный класс для `span` не добавляется.
- Переносы текста должны решаться шириной контейнера и CSS, а не искусственными строками в HTML.
- Пустые декоративные элементы удаляются из разметки.
- Декоративные линии и визуальные элементы делаются через CSS-псевдоэлементы.
- Исключение для декоративных DOM-элементов возможно только когда элемент действительно нужен как часть анимации, например для GSAP.

## Правила HTML и контента

В гайды были добавлены и уточнены правила:

- Текст из макета, даже если он набран заглавными буквами, в HTML переводится в обычный регистр.
- Заглавной остается только первая буква в начале предложения.
- Сокращения и технические аббревиатуры могут оставаться заглавными: `ТПЛ`, `ПВХ`, `ГОСТ` и похожие.
- `<br>` по умолчанию запрещен и используется только в крайних случаях.
- Неразрывные пробелы ставятся только в видимых областях сайта.
- Внутри `head`, `meta`, `title`, технических атрибутов и метатегов неразрывные пробелы не используются.
- Неразрывный пробел нужен после коротких предлогов и союзов, включая `в`, `и`, `с`, `а`, `а также`, `или`.
- Неразрывный пробел также нужен после `не`, между числами и единицами измерения, в числовых диапазонах и в похожих местах, где нельзя допускать висячие части строки.

## Правила классов и компонентов

В ходе работы были уточнены правила именования:

- Если для нескольких кнопок нужна обертка, класс обертки должен быть `button-row`.
- Не добавляем элементу лишние классы без явной необходимости.
- Если дополнительный класс понадобится позже для стилизации, его добавляем в момент реальной необходимости.
- Одинаковые карточки должны быть одним переиспользуемым компонентом.
- В каталоге были сведены к одному компоненту карточки, которые раньше назывались по-разному: `product-card` и `print-card`.
- `print-card` был удален как отдельный компонент.
- Если в одном месте есть `section-title` и `section-description`, а в другом только `section-title`, заголовок все равно помещается в `section-header` для консистентности.
- Нельзя добавлять в футере или других областях видимые названия разделов, которых нет в макете.

## Структура SCSS

Была зафиксирована логика структуры:

- `components/` — переиспользуемые элементы: `button`, `product-card`, `section-header`, `form`, `social-list`.
- `layout/` — общая структура: `container`, `section`, `header`, `footer`, `grid`.
- `pages/` — уникальная композиция конкретной страницы, например `hero` главной страницы.

Позже был поднят вопрос, почему в SCSS не используется вложенность. Было подтверждено правило: вложенность допустима до третьего уровня, если она улучшает читаемость и не создает тяжелые селекторы.

После этого SCSS был приведен к вложенной структуре в основных файлах:

- `components/_mobile-menu.scss`
- `layout/_header.scss`
- `layout/_footer.scss`
- `components/_button.scss`
- `components/_product-card.scss`
- `components/_catalog-group.scss`
- `components/_cta.scss`
- `components/_form.scss`
- `components/_benefit-card.scss`
- `components/_feature-card.scss`
- `components/_nav.scss`
- `components/_social-list.scss`
- `components/_link-list.scss`
- `components/_creeper-line.scss`
- `components/_burger-button.scss`
- `layout/_grid.scss`
- `layout/_section.scss`
- `pages/_home.scss`

Плоскими оставлены только общие типографические группировки, где разные блоки объединены по общей роли.

## CSS-гайд

По запросу был создан `guides/css.md` на основе гайда по SCSS.

В CSS/SCSS-гайды были добавлены правила:

- `textarea` всегда должен иметь `resize: none`.
- Минимальный размер шрифта — `12px`.
- Рекомендуемый размер основного текста — `16px`.
- Нечетные pixel-значения для размеров не используются: значение приводится к меньшему четному числу.
- Исключение возможно для `1px`, например для border, outline и похожих технических линий.
- Кнопки по умолчанию имеют `min-height: 40px`.
- Кнопки по умолчанию имеют `min-width: 160px`.
- Для переходов используется токен `--transition-base`.
- В `--transition-base` была добавлена небольшая задержка через `--transition-delay: 0.04s`, чтобы hover-анимации не дергались при быстром движении курсора.

## Шрифты

Из макета были определены шрифты:

- `Manrope` — основной текстовый шрифт.
- `Oswald` — акцентный шрифт для крупных заголовков, кнопок и акцентов.
- `IBM Plex Sans` — найден в экспорте как единичный артефакт.

В `agent-suggestions.md` был добавлен список шрифтов из макета. Позже `Manrope` был добавлен локально, и шрифты подключены через `@font-face`.

Текущие токены:

```scss
--font-primary: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-accent: "Oswald", "Arial Narrow", var(--font-primary);
```

## Блок hero

В hero были внесены правки:

- Исправлена структура заголовка: вместо множества строковых `span` используется один `span` для отличающегося фрагмента.
- Декоративная линия заголовка перенесена в CSS через псевдоэлемент.
- Исправлено направление градиента.
- Для заголовка задан `line-height: 1.15`.
- Размер заголовка сделан адаптивным: `clamp(32px, 8vw, 64px)`.
- Для изображения добавлена максимальная высота до десктопного перестроения: `max-height: 320px`.
- На десктопе hero перестраивается в две колонки.
- Кнопки в hero на ширине до `440px` становятся на `100%`.

## Бегущая строка каталога

Между hero и следующим блоком был добавлен блок будущей бегущей строки с разделами каталога:

- клейкая лента;
- стрейч-пленка;
- малярная лента;
- изоляционная лента;
- клейкая лента с логотипом;
- упаковочная лента;
- ТПЛ;
- спец. ленты;
- сигнальные ленты;
- термостойкая малярная лента;
- ленты с нанесением;
- аксессуары.

Разметка добавлена без JS-анимации. Логика: пока это одна строка, позже можно добавить JS-анимацию.

## Блок «Почему сотрудничать с нами выгодно»

Была исправлена сетка:

- Если в последнем ряду меньше трех элементов, они делят доступное место поровну.
- Для этого использована flex-сетка, а не жесткая grid-сетка.
- Карточки преимуществ приведены ближе к макету.
- Паддинги в карточках сделаны адаптивными через `clamp`.

## Блок «Что мы предлагаем»

Были исправлены проблемы соответствия макету:

- Убраны лишние бордеры там, где их нет в макете.
- Удален контент, которого нет в макете.
- Исправлено расположение элементов внутри карточек.
- Кнопки перехода приведены к единому тексту: `Перейти в раздел каталога`.
- Все кнопки перехода в разделы получили класс `button button--secondary`.
- Все карточки каталога используют один компонент `product-card`.
- Текст в карточках приведен к `var(--color-text-muted)`.
- Размер заголовков карточек уменьшен до `22px`, а у `catalog-group__title` на мобильных до `20px`.
- Для списков `feature-list` и `catalog-group__features-item` псевдоэлементы выровнены и получают `height: 100%`.
- Для `catalog-group__features` padding сделан адаптивным от `16px`.
- На ширине до `534px` кнопки в карточках становятся на `100%`.

## Блок «Преимущества, которые работают»

Раздел был проверен на соответствие макету и существенно скорректирован:

- Исправлены карточки.
- Исправлены изображения, оверлеи и декоративные линии.
- Паддинги карточек сделаны через `clamp`.
- Сетка приведена к логике макета.

## Блок «Готовы оформить заказ?»

Были внесены правки:

- Проверены цвета, отступы и композиция.
- Перенос заголовка сделан через ограничение ширины, а не через `<br>`.
- Текст заменен с `Успейте отправить заявку и получите скидку 20%` на `Успейте отправить заявку и получить выгодное предложение`.
- Для `.cta__content` padding сделан через `clamp` от `24px`.
- Кнопка формы на ширине до `440px` становится на `100%`.
- Для textarea добавлено правило `resize: none`.

## Header

По header были выполнены правки:

- Проверены размеры и отступы кнопки.
- Название `ТПЛ` приведено к заглавному написанию как сокращение.
- Навигационные ссылки получили:

```scss
display: flex;
align-items: center;
min-height: 32px;
```

- На ширине `320-639px` кнопка обратного звонка отображается без текста и стрелки, только с иконкой телефона.
- Размер мобильной кнопки обратного звонка: `40x40px`.
- Соцсети скрываются до ширины `534px`.
- С ширины `640px` в кнопке обратного звонка показывается текст.
- С ширины `1140px` показывается навигация и скрывается burger.
- Кнопка обратного звонка не должна иметь стрелку.
- Был удален остаточный `header__callback::after`, который добавлял стрелку.

## Mobile Menu

Было добавлено мобильное меню до ширины `1140px`.

Состав меню:

- overlay над всем сайтом с полупрозрачным фоном и blur;
- панель меню шириной `95%`, max-width `720px`;
- шапка меню: логотип и кнопка закрытия с крестиком;
- декоративная линия под шапкой;
- навигация;
- футер меню с контактами, соцсетями и кнопкой обратного звонка без иконки.

Дальнейшие уточнения:

- Панель меню должна скроллиться при недостаточной высоте.
- Скроллбар сделан прозрачным.
- Шапка меню сделана `sticky`.
- Скроллящийся контент не должен быть виден под sticky-шапкой.
- Padding убран с `.mobile-menu__panel`.
- Отступы задаются отдельно для `.mobile-menu__header`, `.mobile-menu__nav`, `.mobile-menu__footer`.
- Линия под шапкой и линия над футером сделаны псевдоэлементами.
- Линии начинаются от левого паддинга и имеют ширину `100% - 2 * padding`, реализовано через `left/right: var(--mobile-menu-padding-inline)`.

## Кнопки и иконки

Была уточнена логика иконки стрелки:

- Если кнопка является переходом и содержит смысл `перейти`, `смотреть в каталоге`, `подробнее`, у нее должна быть иконка стрелки.
- У остальных кнопок стрелку нужно убрать.
- Отдельный модификатор для стрелки не нужен.
- В текущей реализации стрелка включается для ссылок-кнопок через `a.button::after`.
- Кнопки типа `button` стрелку не получают.
- Кнопка обратного звонка в header и mobile menu не содержит стрелку.

## Footer

Футер был проверен по цветам и отступам:

- Убраны добавленные названия разделов, которых не было в макете.
- Три одинаковые колонки приведены к одному повторяемому компонентному паттерну.
- Цвета и отступы приведены ближе к макету.
- Padding контейнера футера сделан адаптивным от `24px`.

## Адаптив и горизонтальный скролл

Была найдена причина горизонтального скролла на ширине `320px`:

- В `html` стояло `min-width: 320px`.
- На viewport меньше 320 это создавало горизонтальный скролл.
- Правило было удалено.

Также были сделаны правки:

- `--space-section` стал `clamp(36px, 6vw, 72px)`.
- Убрано отдельное desktop-правило для `.section`, потому что один `clamp` покрывает адаптив.
- Текст на мобильных приведен к `16px` через `clamp`, где это нужно.
- Проверена органичность адаптивных размеров шрифтов.

## Изображения

Сначала изображения были перенесены из папки:

`pen.dev/newmark/src/design/images/`

в папку:

`pen.dev/newmark/src/images/`

Пути были обновлены в:

- `index.html`
- `src/design/index-page.json`
- `src/design/index-page.pen`
- `agent-suggestions.md`

Изначально часть изображений получила длинные предметные имена, например `product-heat-resistant-masking-tape.png`. После уточнения правила было принято:

- для серийных карточек использовать только шаблонные имена;
- не использовать длинные предметные названия;
- именовать по шаблону `product-image-1.png`, `product-image-2.png` и так далее.

Текущие имена product-изображений:

- `product-image-1.png`
- `product-image-2.png`
- `product-image-3.png`
- `product-image-4.png`
- `product-image-5.png`
- `product-image-6.png`
- `product-image-7.png`
- `product-image-8.png`
- `product-image-9.png`
- `product-image-10.png`

Остальные изображения:

- `logo.png`
- `hero-img.png`
- `hero-img-source.png`
- `benefits-image-1.png`
- `benefits-image-2.png`
- `benefits-image-3.png`
- `benefits-image-4.png`
- `benefits-image-5.png`

## Добавление сборки проекта

Следующим этапом начата локальная сборка именно внутри проекта `pen.dev/newmark/`, а не в корне репозитория. Это сделано потому, что у разных проектов в будущем могут отличаться сборщики, шаблонизаторы, обработка изображений и набор плагинов.

Добавлены файлы:

- `package.json`;
- `vite.config.js`;
- `postcss.config.js`;
- `.browserslistrc`;
- `src/scripts/main.js`;
- `scripts/convert-images.mjs`;
- `src/sprite/*.svg`.

В качестве основы выбран Vite:

- HTML остается entry-файлом проекта;
- SCSS подключается через `src/scripts/main.js`;
- CSS собирается Vite из `src/styles/main.scss`;
- PostCSS и Autoprefixer используют `last 5 versions` и `not dead` из `.browserslistrc`;
- изображения конвертируются в WebP отдельным скриптом на `sharp`;
- SVG-иконки собираются в `sprite.svg` через `vite-plugin-svg-spritemap`.

Также установлены зависимости, которые понадобятся дальше:

- `imask`;
- `swiper`;
- `@fancyapps/ui`;
- `gsap`.

Inline SVG в разметке социальных ссылок и управляющих кнопок был заменен на использование SVG-спрайта:

```html
<svg class="social-list__icon" aria-hidden="true">
	<use href="/sprite.svg#telegram"></use>
</svg>
```

Картинки в рабочей разметке переключены на WebP-версии из `src/images/webp/`, а PNG остаются исходниками для конвертации.

После добавления сборки выполнена production-сборка:

```bash
npm run build
```

Сборка прошла успешно. Dev-сервер Vite не удалось запустить в текущей sandbox-среде из-за ошибки доступа к порту `127.0.0.1:5173`, но production build работает.

## Правка футера после добавления сборки

Футер был уточнен по стилям:

```scss
.footer {
	padding-block: var(--space-2xl);
	background-color: var(--color-dark-soft);
}
```

Это заменило прежний `padding-bottom` на симметричный вертикальный отступ и добавило фон всей футерной области.

Позже были уточнены отступы нижней строки футера:

- у `.footer__bottom` задан `gap: 12px var(--space-lg)`;
- на ширине от `900px` добавлен `flex-wrap: wrap`;
- у `.footer__legal` задан `gap: 8px var(--space-lg)`.

## Правка секции advantages

Для секции `.advantages` добавлен фон:

```scss
.advantages {
	background-color: var(--color-dark-soft);
}
```

После изменения выполнена production-сборка `npm run build`, сборка прошла успешно.

## Адаптация GSAP-скрипта бегущей строки

В проект был добавлен скрипт бегущей строки из другого проекта. После адаптации файл переименован в `src/scripts/gsap/gsap-creeper-line.js`, чтобы имя явно отражало связь с GSAP и назначение скрипта:

- старые классы `crawl-line__viewport`, `crawl-line__track`, `crawl-line__item` заменены на `creeper-line__track`, `creeper-line__list`, `creeper-line__item`;
- ожидание глобального `window.gsap` заменено на модульный импорт `gsap` из npm-пакета;
- скрипт подключен в `src/scripts/main.js`;
- для `.creeper-line__list` добавлено `will-change: transform`.

После изменения выполнена production-сборка `npm run build`, сборка прошла успешно. Старые классы `crawl-line` в рабочих скриптах и стилях больше не используются.

Скрипт дополнительно сделан универсальным:

- селекторы viewport, track и item вынесены в объект настроек;
- скорость анимации `speed` вынесена в тот же объект;
- добавлены настройки `initializedDataKey`, `cloneAttribute` и `resizeDelay`;
- `initCreeperLines(options)` теперь можно переиспользовать для других бегущих строк;
- проектные классы `creeper-line` передаются при инициализации в `src/scripts/main.js`.

Компонент бегущей строки также переименован из контекстного названия в универсальный `creeper-line`. Для текущего каталожного использования в HTML добавлен модификатор `creeper-line--catalog`, который задает цветовую схему конкретного контекста.

Для объекта настроек скрипта добавлен JSDoc-комментарий `CreeperLineOptions`, чтобы назначение каждого поля было понятно вверху файла и поддерживалось IDE-подсказками.

После проверки скрипта на магические значения дополнительные настройки были вынесены в `defaultOptions`: frame rate, media query, selector для изображений, имена событий, transform property, computed style properties, технические атрибуты, маркеры состояния, стартовая позиция, fallback-ширина, минимальное количество элементов и параметры клонирования.

В `guides/agent.md` добавлено правило: в JavaScript, TypeScript, конфигурационных файлах и скриптах сборки не оставлять магические числа, строки и булевы значения внутри логики, если их назначение неочевидно. Такие значения нужно выносить в `options`, `defaultOptions`, `config` или именованные константы.

JSDoc-описания настроек в `gsap-creeper-line.js` переведены в двуязычный формат: сначала русское описание, затем через `/` английское. В `guides/agent.md` добавлено правило применять такой формат к новым и редактируемым техническим комментариям, если рядом используется английское описание.

## Проверки

В процессе работы регулярно выполнялись проверки:

- компиляция SCSS в CSS:

```bash
npx --no-install sass pen.dev/newmark/src/styles/main.scss pen.dev/newmark/src/styles/main.css
```

- поиск старых классов и путей через `rg`;
- проверка горизонтального скролла;
- проверка существования файлов изображений;
- `git diff --check` после крупных SCSS-правок.

## Текущее состояние проекта

На момент создания этого файла:

- основной файл страницы: `pen.dev/newmark/index.html`;
- стили находятся в `pen.dev/newmark/src/styles/`;
- изображения находятся в `pen.dev/newmark/src/images/`;
- дизайн-данные лежат в `pen.dev/newmark/src/design/`;
- рабочие подсказки и статус проекта лежат в `pen.dev/newmark/agent-suggestions.md`;
- гайды обновлены в `guides/html.md`, `guides/css.md`, `guides/scss.md` и связанных файлах.

## Важные договоренности на будущее

- Разметку не засорять декоративными элементами.
- Не добавлять видимый контент, которого нет в макете.
- Не добавлять лишние классы заранее.
- Повторяемые сущности оформлять как один компонент.
- Использовать `section-header` для заголовков секций консистентно.
- Использовать `button-row` для группы кнопок.
- Использовать SCSS-вложенность до третьего уровня, когда она улучшает читаемость.
- Для серийных ассетов использовать шаблонные имена: `product-image-1`, `benefits-image-1` и похожие.
- Для видимого русского текста следить за неразрывными пробелами.
- Не использовать `<br>` без крайней необходимости.
- Кнопки перехода могут иметь стрелку; обычные action-кнопки стрелку не получают.

## Адаптация GSAP-скрипта мобильного меню

Файл `src/scripts/gsap/menu.js`, добавленный из другого проекта, адаптирован под текущую разметку Newmark и переименован в `src/scripts/gsap/gsap-menu.js`, чтобы название соответствовало принятому принципу для GSAP-модулей.

Что изменено:

- старые селекторы `.menu`, `.menu__wrapper`, `.burger-btn--opener`, `.burger-btn--closer` заменены на текущие классы `.mobile-menu`, `.mobile-menu__panel`, `.mobile-menu__overlay`, `.burger-button`, `.mobile-menu__close`;
- скрипт сделан универсальным через `initGsapMenu(options)`;
- селекторы, класс состояния, breakpoint, aria-атрибуты, события, длительность, easing, значения GSAP и параметры блокировки body вынесены в `defaultOptions`;
- к настройкам добавлен двуязычный JSDoc: сначала русское описание, затем английское через `/`;
- меню подключено в `src/scripts/main.js`;
- из SCSS убран CSS-переезд панели в открытом состоянии, чтобы transform-анимацией управлял GSAP без конфликта с transition;
- сохранены состояния доступности: `aria-hidden` на меню и `aria-expanded` на burger-кнопке;
- добавлено закрытие по overlay, кнопке закрытия, Escape и клику по ссылке меню;
- при открытом меню блокируется прокрутка body с восстановлением прежнего inline-значения `overflow` после закрытия.

Также упрощена стилизация компонента `component-library/gsap-creeper-line`: из примера удалены проектные CSS-переменные и контекстный модификатор каталога. В библиотечном варианте оставлены только минимальные стили, необходимые для просмотра и работы бегущей строки.

Проверки:

```bash
npm run build
npx --no-install sass src/styles/main.scss src/styles/main.css
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-menu.js pen.dev/newmark/src/scripts/main.js pen.dev/newmark/src/styles/components/_mobile-menu.scss component-library/gsap-creeper-line/css.css component-library/gsap-creeper-line/html.html component-library/gsap-creeper-line/readme.md
```

Production-сборка прошла успешно.

## Коррекция transform у мобильного меню

После проверки анимации мобильного меню из `_mobile-menu.scss` удален исходный `transform: translateX(100%)` у `.mobile-menu__panel`. Закрытое и открытое положения панели теперь задаются только через GSAP в `src/scripts/gsap/gsap-menu.js`, чтобы в открытом состоянии панель приходила к `translate(0px, 0px)` без конфликта CSS-transform и JS-анимации.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
git diff --check -- pen.dev/newmark/src/styles/components/_mobile-menu.scss pen.dev/newmark/src/styles/main.css pen.dev/newmark/src/scripts/gsap/gsap-menu.js
```

## Исправление скачка страницы при блокировке body и оптимизация overlay меню

Чтобы сайт не прыгал при открытии мобильного меню и скрытии скролла, добавлен `scrollbar-gutter: stable` для `html` в `src/styles/base/_global.scss`. Дополнительно обновлена функция `bodyLocker`: перед установкой `overflow: hidden` она сохраняет текущее inline-значение `overflow` и `scrollbarGutter`, выставляет стабильный gutter, а при разблокировке возвращает прежние значения.

`src/scripts/gsap/gsap-menu.js` теперь использует общий `bodyLocker`, а настройки `bodySelector`, `scrollRootSelector`, `lockedBodyOverflowValue` и `stableScrollbarGutterValue` передаются из `defaultOptions`.

Из стилей мобильного меню удален `backdrop-filter: blur(8px)`, потому что он вызывал дергание анимации. Также из `_mobile-menu.scss` убраны CSS-transition у элементов меню; анимация открытия и закрытия остается на уровне GSAP.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
rg -n "backdrop-filter|transition|scrollbar-gutter|bodyLocker|overflow = \"auto\"" pen.dev/newmark/src/styles/components/_mobile-menu.scss pen.dev/newmark/src/styles/base/_global.scss pen.dev/newmark/src/scripts
```

## Уточнение настройки Escape в GSAP-меню

В `src/scripts/gsap/gsap-menu.js` удалены дублирующие настройки `escapeKeyName` и `escapeKeyCode`, потому что обе были равны `"Escape"` и не разделяли реальные сущности. Оставлена одна настройка `escapeKey`, а закрытие меню по клавиатуре проверяется через `evt.key === settings.escapeKey`.

Проверки:

```bash
rg -n "escapeKeyName|escapeKeyCode|escapeKey" pen.dev/newmark/src/scripts/gsap/gsap-menu.js
npm run build
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-menu.js
```

## Цвет декоративных линий в мобильном меню

В `src/styles/components/_mobile-menu.scss` цвет декоративных линий в шапке и перед футером мобильного меню заменен с `var(--color-border)` на `var(--color-accent)`.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
git diff --check -- pen.dev/newmark/src/styles/components/_mobile-menu.scss pen.dev/newmark/src/styles/main.css
```

## Стилизация корневого scrollbar при `scrollbar-gutter`

После добавления `scrollbar-gutter: stable` у корневого скролла появилась светлая браузерная полоса. В `src/styles/base/_global.scss` для `html` добавлен темный `background-color`, а также стили scrollbar:

- `scrollbar-color` и `scrollbar-width` для Firefox;
- `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, `::-webkit-scrollbar-thumb` для Chromium/Safari.

Трек скролла теперь использует `var(--color-background)`, а ползунок — `var(--color-border-strong)`.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
git diff --check -- pen.dev/newmark/src/styles/base/_global.scss pen.dev/newmark/src/styles/main.css
```

## Hover/focus-состояния кнопок открытия и закрытия меню

У кнопок `.burger-button` и `.mobile-menu__close` убраны эффекты смены цвета, фона и бордера при наведении и фокусе. Вместо этого для `:hover` и `:focus-visible` добавлено единое состояние:

```scss
opacity: 0.6;
```

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
git diff --check -- pen.dev/newmark/src/styles/components/_burger-button.scss pen.dev/newmark/src/styles/components/_mobile-menu.scss pen.dev/newmark/src/styles/main.css
```

## Очистка публичных options в GSAP-компонентах

В `src/scripts/gsap/gsap-menu.js` и `src/scripts/gsap/gsap-creeper-line.js` пересмотрены `defaultOptions`. Из публичных настроек удалены служебные значения, которые не должны настраиваться программистом при обычном подключении компонента: имена событий, `aria`-атрибуты, dataset-ключи, значения `true/false`, технические параметры GSAP, названия DOM-атрибутов и прочие внутренние константы.

Теперь:

- `defaultOptions` содержит только реально вариативные настройки компонента;
- служебные значения вынесены в отдельный внутренний объект `internalSettings`;
- `component-library/gsap-creeper-line/js.js` синхронизирован с рабочим скриптом проекта;
- `component-library/gsap-creeper-line/readme.md` обновлен и больше не перечисляет внутренние технические значения как публичный API.

Проверки:

```bash
npm run build
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-menu.js pen.dev/newmark/src/scripts/gsap/gsap-creeper-line.js component-library/gsap-creeper-line/js.js component-library/gsap-creeper-line/readme.md
```

## Уточнение единиц измерения в JSDoc GSAP-меню

В `src/scripts/gsap/gsap-menu.js` для числовых настроек JSDoc уточнены единицы измерения:

- `panelClosedXPercent` — проценты;
- `duration` — секунды;
- `panelStartDelay` — секунды.

Проверки:

```bash
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-menu.js
npm run build
```

## Компонент GSAP Menu в библиотеке компонентов

В `component-library` добавлен новый компонент `gsap-menu` с данными мобильного меню:

- `html.html` — пример разметки с burger-кнопкой, overlay, panel, header, nav и footer;
- `scss.scss` — исходные SCSS-стили компонента;
- `css.css` — скомпилированные CSS-стили для быстрого просмотра;
- `js.js` — переносимая версия `initGsapMenu(options)` на GSAP без импорта внутренних файлов проекта;
- `readme.md` — описание компонента, подключение, options и поведение.

Для существующего компонента `component-library/gsap-creeper-line` добавлен файл `scss.scss`, а `readme.md` обновлен: теперь рядом с `css.css` всегда должен быть исходный SCSS-файл.

В `guides/agent.md` добавлено правило про структуру библиотеки готовых компонентов:

- каждый компонент хранится в собственной папке;
- минимальный состав: `html.html`, `scss.scss`, `css.css`, `js.js`, `readme.md`;
- если у компонента есть CSS, рядом обязательно создается `scss.scss`;
- библиотечные стили должны быть простыми, понятными и не привязанными к конкретному проекту;
- библиотечный JavaScript должен быть переносимым и не импортировать внутренние файлы конкретного проекта.

Проверки:

```bash
npx --no-install sass ../../component-library/gsap-menu/scss.scss ../../component-library/gsap-menu/css.css --no-source-map
npx --no-install sass ../../component-library/gsap-creeper-line/scss.scss ../../component-library/gsap-creeper-line/css.css --no-source-map
git diff --check -- component-library/gsap-menu component-library/gsap-creeper-line guides/agent.md
```

## Адаптация GSAP Scroll Up Button

В проект был добавлен модуль `src/scripts/gsap/scroll-up-btn.js` из другого проекта. Файл переименован в `src/scripts/gsap/gsap-scroll-up-button.js` и адаптирован под текущие правила:

- убрана запись `window.gsap` и событие `gsap:ready`;
- убрана автоинициализация внутри модуля;
- экспортируется функция `initGsapScrollUpButton(options)`;
- публичные `defaultOptions` оставлены только для реально вариативных настроек: контейнер, класс кнопки, aria-label, порог показа, сдвиг скрытого состояния, длительности и easing;
- служебные значения вынесены в `internalSettings`;
- старые классы `scroll-up-btn` и `main-btn` заменены на компонентный класс `scroll-up-button`;
- модуль подключен в `src/scripts/main.js`;
- добавлен SCSS-компонент `src/styles/components/_scroll-up-button.scss` и подключен в `src/styles/main.scss`.

В `component-library` добавлен новый готовый компонент `gsap-scroll-up-button`:

- `html.html` — заметка, что кнопка создается JavaScript автоматически;
- `scss.scss` — исходные SCSS-стили;
- `css.css` — скомпилированные CSS-стили;
- `js.js` — переносимый JS-модуль;
- `readme.md` — описание, подключение, options и поведение.

Проверки:

```bash
npx --no-install sass ../../component-library/gsap-scroll-up-button/scss.scss ../../component-library/gsap-scroll-up-button/css.css --no-source-map
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
rg -n "scroll-up-btn|main-btn|window\\.gsap|gsap:ready|initScrollUpBtn|scroll-up-button|initGsapScrollUpButton" pen.dev/newmark/src component-library/gsap-scroll-up-button
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-scroll-up-button.js pen.dev/newmark/src/scripts/main.js pen.dev/newmark/src/styles/main.scss pen.dev/newmark/src/styles/main.css pen.dev/newmark/src/styles/components/_scroll-up-button.scss component-library/gsap-scroll-up-button
```

## Позиционирование Scroll Up Button

В `src/styles/components/_scroll-up-button.scss` изменено позиционирование кнопки возврата наверх:

```scss
right: clamp(24px, 3vw, 32px);
bottom: 60px;
```

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
git diff --check -- pen.dev/newmark/src/styles/components/_scroll-up-button.scss pen.dev/newmark/src/styles/main.css
```

## Устранение Sass legacy JS API warning

При сборке Vite выводил предупреждение:

```text
Deprecation Warning [legacy-js-api]: The legacy JS API is deprecated and will be removed in Dart Sass 2.0.0.
```

В `vite.config.js` для SCSS включен modern Sass API:

```js
css: {
  preprocessorOptions: {
    scss: {
      api: "modern-compiler",
    },
  },
},
```

После изменения `npm run build` прошел успешно без этого предупреждения.

## Подключение новых иконок burger и close из SVG-спрайта

В `src/sprite` добавлены новые иконки `icon-burger.svg` и `icon-cross.svg`. В `index.html` кнопка открытия мобильного меню переведена с `#menu` на `#icon-burger`, а кнопка закрытия — с `#close` на `#icon-cross`. Для SVG указаны корректные `viewBox` из исходных файлов:

- burger: `0 0 17 12`;
- close: `0 0 17 17`.

В стилях добавлено правило `fill: var(--color-white)` для иконок внутри кнопок:

- `.button__icon`;
- `.burger-button__icon`;
- `.mobile-menu__close-icon`.

Позже для иконок открытия и закрытия меню уточнены отдельные значения: `.burger-button__icon` получила размер `20px` на `20px`, `.mobile-menu__close-icon` — `16px` на `16px`; обе иконки используют `fill: var(--color-accent)`, а общее белое заполнение осталось для обычных `.button__icon`.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
rg -n "icon-burger|icon-cross|#menu|#close" pen.dev/newmark/index.html pen.dev/newmark/dist/index.html pen.dev/newmark/dist/sprite.svg
rg -n "button__icon|burger-button__icon|mobile-menu__close-icon|fill: var\\(--color-white\\)" pen.dev/newmark/src/styles/main.css pen.dev/newmark/src/styles/components
git diff --check -- pen.dev/newmark/index.html pen.dev/newmark/src/styles/components/_button.scss pen.dev/newmark/src/styles/components/_burger-button.scss pen.dev/newmark/src/styles/components/_mobile-menu.scss pen.dev/newmark/src/styles/main.css
```

## Подключение новых иконок соцсетей из SVG-спрайта

В `src/sprite` добавлены новые иконки соцсетей: `icon-vk.svg` и `icon-max.svg`. Также актуальные иконки Telegram и WhatsApp теперь лежат как `icon-tg.svg` и `icon-whatsapp.svg`.

В `index.html` обновлены все списки `.social-list` в шапке, мобильном меню и футере:

- Telegram использует `#icon-tg`;
- WhatsApp использует `#icon-whatsapp`;
- ВКонтакте использует `#icon-vk`;
- Max использует `#icon-max`.

Для каждой иконки указан `viewBox` из исходного SVG. В `src/styles/components/_social-list.scss` добавлено `fill: currentColor` для `.social-list__icon`, чтобы filled-иконки красились от состояния ссылки.

Позже для VK-иконки добавлен отдельный модификатор `.social-list__icon--vk`: SVG в шапке, мобильном меню и футере получил `width="28"` и `height="28"`, а в SCSS задан размер `28px` на `28px`.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
rg -n "#telegram|#whatsapp|#vk|#icon-tg|#icon-whatsapp|#icon-vk|#icon-max" pen.dev/newmark/index.html pen.dev/newmark/dist/index.html pen.dev/newmark/dist/sprite.svg
rg -o "id=\"icon-(tg|whatsapp|vk|max)\"" pen.dev/newmark/dist/sprite.svg
git diff --check -- pen.dev/newmark/index.html pen.dev/newmark/src/styles/components/_social-list.scss pen.dev/newmark/src/styles/main.css
```

## Замена иконки телефона в кнопке обратного звонка

В `src/sprite` добавлена новая иконка `icon-phone.svg`. В `index.html` кнопка обратного звонка в шапке переведена со старого `#phone` на `#icon-phone`.

Позже иконка телефона в кнопке обратного звонка увеличена до `28px` на `28px`: в `index.html` обновлены атрибуты `width` и `height`, а в `src/styles/components/_button.scss` добавлен модификатор `.button__icon--phone`.

Для `.button__icon--phone` добавлено `fill: currentColor`, чтобы иконка наследовала цвет кнопки: в обычном состоянии она остается белой, а при hover primary-кнопки становится акцентной.

## Замена стрелки в кнопках на `long-arrow` из SVG-спрайта

Старый механизм стрелки через `.button::after` и CSS-mask удален из `src/styles/components/_button.scss`. Во все ссылки-кнопки, где стрелка должна быть видимой (`Перейти`, `Подробнее`, `Смотреть в каталоге`), добавлена SVG-иконка:

```html
<svg class="button__icon button__icon--arrow" width="72" height="19" viewBox="0 0 72 19" aria-hidden="true">
  <use href="/sprite.svg#long-arrow"></use>
</svg>
```

Для `.button__icon--arrow` в SCSS задан размер `72px` на `19px` и `fill: currentColor`, чтобы цвет стрелки наследовался от состояния кнопки.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
rg -n "button::after|a\\.button::after|button__icon--arrow|long-arrow" pen.dev/newmark/index.html pen.dev/newmark/src/styles/components/_button.scss pen.dev/newmark/src/styles/main.css pen.dev/newmark/dist/index.html pen.dev/newmark/dist/sprite.svg
rg -c "button__icon--arrow" pen.dev/newmark/index.html pen.dev/newmark/dist/index.html
git diff --check -- pen.dev/newmark/index.html pen.dev/newmark/src/styles/components/_button.scss pen.dev/newmark/src/styles/main.css
```

Проверки:

```bash
npm run build
rg -n "#phone|#icon-phone" pen.dev/newmark/index.html pen.dev/newmark/dist/index.html pen.dev/newmark/dist/sprite.svg
rg -o "id=\"icon-phone\"" pen.dev/newmark/dist/sprite.svg
git diff --check -- pen.dev/newmark/index.html
```

## Компонент GSAP Countdown

Статичный счетчик в CTA-форме заменен на самостоятельный компонент `.countdown`, чтобы его можно было переиспользовать вне конкретной формы или проекта.

Что сделано:

- добавлен модуль `src/scripts/gsap/gsap-countdown.js`;
- добавлен SCSS-компонент `src/styles/components/_countdown.scss`;
- компонент подключен в `src/scripts/main.js` через `initGsapCountdown()`;
- в `src/styles/main.scss` подключен `components/countdown`;
- разметка CTA переведена с контекстных классов `cta__countdown-*` на самостоятельные классы `countdown__*`;
- в CTA оставлен только контекстный класс `cta__countdown` для позиционирования;
- добавлена поддержка `data-countdown-duration` и `data-countdown-deadline`;
- подписи единиц времени меняются с учетом русских падежей: `1 час`, `3 часа`, `5 часов`;
- цифры при изменении разбиваются на отдельные символы и плавно анимируются через GSAP.

От `SplitText` отказались: для цифр достаточно локального разбиения строки на символы внутри компонента, без зависимости от дополнительного GSAP-плагина.

В `component-library` добавлен готовый компонент `gsap-countdown`:

- `html.html`;
- `scss.scss`;
- `css.css`;
- `js.js`;
- `readme.md`.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npx --no-install sass ../../component-library/gsap-countdown/scss.scss ../../component-library/gsap-countdown/css.css --no-source-map
npm run build
```

## Исправление resize-логики GSAP Creeper Line

В `src/scripts/gsap/gsap-creeper-line.js` исправлена причина скачка бегущей строки при изменении высоты экрана. Обработчик `resize` теперь сравнивает текущую ширину viewport с предыдущей и запускает пересчет только если ширина уменьшилась.

Такая же правка внесена в библиотечный компонент `component-library/gsap-creeper-line/js.js`, а в `readme.md` добавлено пояснение: изменение высоты viewport игнорируется, чтобы мобильные браузерные панели не дергали ленту.

Проверки:

```bash
npm run build
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-creeper-line.js component-library/gsap-creeper-line/js.js component-library/gsap-creeper-line/readme.md pen.dev/newmark/agent-conversation-history.md
```

## Исправление точности GSAP Countdown

В `src/scripts/gsap/gsap-countdown.js` исправлена логика обновления секунд. Предыдущая версия использовала фиксированный `setInterval(1000)` и расчет через `Math.floor((deadline - Date.now()) / 1000)`. Из-за дрейфа интервала относительно реальных секундных границ значение могло повториться, а затем перескочить через секунду.

Теперь компонент:

- считает оставшееся время в миллисекундах;
- переводит его в секунды через `Math.ceil`, чтобы не терять текущую секунду раньше времени;
- вместо фиксированного интервала планирует следующий `setTimeout` по времени до ближайшей секундной границы;
- добавляет небольшой буфер после границы, чтобы тик не сработал слишком рано.

Такая же правка внесена в `component-library/gsap-countdown/js.js`, а `readme.md` обновлен: компонент явно не использует фиксированный `setInterval(1000)`.

Проверки:

```bash
npm run build
rg -n "tickDelay|setInterval|Math\\.floor\\(\\(deadline|secondBoundaryDelay|getNextDelay|setTimeout" pen.dev/newmark/src/scripts/gsap/gsap-countdown.js component-library/gsap-countdown/js.js component-library/gsap-countdown/readme.md
git diff --check -- pen.dev/newmark/src/scripts/gsap/gsap-countdown.js component-library/gsap-countdown/js.js component-library/gsap-countdown/readme.md pen.dev/newmark/agent-conversation-history.md
```

## Маска телефона через IMask

Для поля телефона в форме заявки подключена маска через `imask`.

Что сделано:

- добавлен модуль `src/scripts/functions/initPhoneMasks.js`;
- модуль подключен в `src/scripts/main.js`;
- поле телефона получило атрибут `data-phone-mask`;
- placeholder приведен к формату маски: `+7 (900) 000 - 00 - 00`;
- маска задана как `+{7} (000) 000 - 00 - 00`.

Проверки:

```bash
npm run build
git diff --check -- pen.dev/newmark/index.html pen.dev/newmark/src/scripts/main.js pen.dev/newmark/src/scripts/functions/initPhoneMasks.js pen.dev/newmark/agent-conversation-history.md
```

## Компонент уточнения для условий в карточках

Текст условий в карточках товара вынесен из элемента `product-card__conditions` в самостоятельный компонент `.clarification`.

Что изменено:

- условия перенесены под список `feature-list`;
- текст приведен к формату со звездочкой в начале и значениями через запятую;
- старый разделитель `·` заменен на запятую;
- добавлено уточнение `срок производства`;
- стили вынесены в `src/styles/components/_clarification.scss`;
- размер текста задан `12px`;
- текст сделан курсивным;
- старый элемент `product-card__conditions` удален из разметки и SCSS;
- примеры в `guides/html.md` и `guides/agent.md` обновлены на компонент `.clarification`.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
rg -n "product-card__conditions|clarification" pen.dev/newmark/index.html pen.dev/newmark/src/styles guides
```

## ТЗ на дальнейшее развитие сайта-каталога

По запросу подготовлено отдельное ТЗ `technical-task.md` для следующего этапа развития Newmark.

В документе описаны:

- шаблон статичной страницы;
- страница каталога;
- шаблон страницы раздела каталога;
- детальная страница товара;
- рекомендуемая файловая модель данных;
- правила AI-наполнения страниц;
- вопросы, которые ИИ должен задавать при добавлении статичной страницы, раздела или товара;
- критерии приемки и этапы реализации.

Главная идея ТЗ: сайт должен наполняться через единые шаблоны и структурированные данные, а ИИ должен работать по пошаговым гайдам, запрашивая недостающий контент у пользователя и сохраняя единообразие страниц.

## Подключение Astro и проектные AI-гайды

Принято решение подключать Astro как базовый стек для дальнейшего развития Newmark.

Что изменено:

- установлен `astro`;
- команды `dev`, `build` и `preview` переключены на Astro;
- добавлен `astro.config.mjs` с текущими настройками SCSS и SVG-спрайта;
- текущая главная страница перенесена в `src/pages/index.astro`;
- создана внутренняя папка `pen.dev/newmark/guides/` для AI-инструкций именно этого проекта;
- добавлены `guides/README.md` и `guides/ai-content-global.md` внутри Newmark;
- в корневой `guides/agent.md` добавлено правило: перед началом работы агент ищет проектные инструкции в папке текущего проекта и применяет их вместе с общими гайдами.

Проектные AI-инструкции не смешиваются с общими гайдами репозитория.

## Исправление подключения шрифтов после перехода на Astro

После подключения Astro шрифты переведены на стабильную публичную схему подключения:

- файлы `.woff2` скопированы в `public/fonts/`;
- `@font-face` теперь использует абсолютные пути `/fonts/...`;
- это убирает зависимость от того, откуда именно импортируется SCSS, и делает подключение одинаковым для Astro dev, build и preview.

Проверки:

```bash
npx --no-install sass src/styles/main.scss src/styles/main.css
npm run build
```

## Шаблон статичных страниц на Astro

Создана первая версия шаблона статичных страниц.

Что добавлено:

- `src/layouts/BaseLayout.astro` - общая HTML-оболочка с header, footer, meta-тегами, стилями и клиентским JS;
- `src/components/Header.astro` и `src/components/Footer.astro` - общие компоненты шапки и подвала для новых Astro-страниц;
- `src/templates/StaticPage.astro` - шаблон статичной страницы;
- `src/pages/[...slug].astro` - динамический роут для страниц из `src/content/pages/`;
- `src/content/pages/delivery.json` - первая контентная страница для проверки шаблона;
- `src/styles/components/_breadcrumbs.scss` - компонент хлебных крошек;
- `src/styles/pages/_static-page.scss` - стили статичной страницы и контентных блоков;
- `guides/ai-static-page.md` - проектная инструкция для ИИ по созданию статичных страниц.

Шаблон поддерживает блоки `text`, `image`, `list`, `steps`, `table`, `faq`, `contacts` и отдельный CTA-блок.
