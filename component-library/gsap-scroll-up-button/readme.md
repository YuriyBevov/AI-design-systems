# GSAP Scroll Up Button

Кнопка возврата к началу страницы. Компонент сам создает кнопку внутри выбранного контейнера, показывает ее после заданного порога прокрутки и плавно скроллит страницу вверх.

## Файлы

- `html.html` — примечание по разметке.
- `scss.scss` — исходные стили компонента.
- `css.css` — скомпилированные стили для быстрого подключения.
- `js.js` — переносимый JS-модуль.

## Подключение

```js
import { initGsapScrollUpButton } from "./js.js";

initGsapScrollUpButton();
```

## Options

```js
initGsapScrollUpButton({
	parentSelector: "body",
	buttonClass: "scroll-up-button",
	ariaLabel: "В начало страницы",
	thresholdRatio: 1.3,
	hiddenY: 150,
	showDuration: 0.7,
	hideDuration: 0.5,
	showEase: "back.out(1.7)",
	hideEase: "power1.out",
});
```
