# GSAP Menu

Мобильное меню с overlay, выезжающей панелью, закрытием по overlay, кнопке, Escape и клику по ссылке. Компонент обновляет `aria-hidden` и `aria-expanded`, умеет блокировать прокрутку страницы и отключается за пределами заданного media query.

## Файлы

- `html.html` — пример разметки.
- `scss.scss` — исходные стили компонента.
- `css.css` — скомпилированные стили для быстрого подключения.
- `js.js` — переносимый JS-модуль.

## Подключение

```js
import { initGsapMenu } from "./js.js";

initGsapMenu();
```

## Options

```js
initGsapMenu({
	menuSelector: ".mobile-menu",
	panelSelector: ".mobile-menu__panel",
	overlaySelector: ".mobile-menu__overlay",
	openerSelector: ".burger-button",
	closerSelector: ".mobile-menu__close",
	linkSelector: ".mobile-menu__nav-link",
	activeClass: "is-open",
	mediaQuery: "(max-width: 1139px)",
	panelClosedXPercent: 100,
	duration: 0.42,
	panelStartDelay: 0,
	ease: "power2.out",
	shouldLockBody: true,
	shouldFocusCloser: true,
	shouldFocusOpener: true,
});
```

Разметка может быть изменена, если в options переданы соответствующие селекторы.
