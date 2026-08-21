# GSAP Countdown

Обратный отсчет с плавной GSAP-анимацией смены цифр и русскими падежами подписей: `1 час`, `3 часа`, `5 часов`.

Компонент работает с двумя режимами:

- `data-countdown-duration` — длительность в секундах от момента загрузки страницы;
- `data-countdown-deadline` — фиксированная дата окончания в формате, который понимает `new Date()`.

## Файлы

- `html.html` — пример разметки.
- `scss.scss` — исходные стили компонента.
- `css.css` — скомпилированные стили для быстрого подключения.
- `js.js` — переносимый JS-модуль.

## Подключение

```js
import { initGsapCountdown } from "./js.js";

initGsapCountdown();
```

## Options

```js
initGsapCountdown({
	rootSelector: ".countdown",
	itemSelector: ".countdown__item",
	valueSelector: "[data-countdown-value]",
	labelSelector: "[data-countdown-label]",
	tickDelay: 1000,
	duration: 0.45,
	ease: "power2.out",
});
```

Для каждой единицы времени укажите `data-countdown-unit`: `days`, `hours`, `minutes` или `seconds`.
