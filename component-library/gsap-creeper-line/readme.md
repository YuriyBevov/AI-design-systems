# GSAP Creeper Line

Бесконечная бегущая строка на GSAP. Компонент клонирует элементы, двигает ленту через `gsap.ticker` и пересчитывается при загрузке изображений, изменении размера окна и изменении `prefers-reduced-motion`.

При событии `resize` пересчет запускается только если уменьшилась ширина viewport. Изменение высоты экрана игнорируется, чтобы мобильные браузерные панели не вызывали скачок ленты.

## Файлы

- `html.html` — пример разметки.
- `scss.scss` — исходные стили компонента.
- `css.css` — скомпилированные стили для быстрого подключения.
- `js.js` — переносимый JS-модуль.

## Подключение

```js
import { initCreeperLines } from "./js.js";

initCreeperLines();
```

## Options

```js
initCreeperLines({
	viewportSelector: ".creeper-line__track",
	trackSelector: ".creeper-line__list",
	itemSelector: ".creeper-line__item",
	speed: 40,
	resizeDelay: 150,
});
```

`speed` задается в пикселях в секунду, `resizeDelay` — в миллисекундах.
