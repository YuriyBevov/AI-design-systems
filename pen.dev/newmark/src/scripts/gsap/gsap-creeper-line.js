import { gsap } from "gsap";

const internalSettings = {
	initializedDataKey: "creeperInitialized",
	initializedValue: "true",
	cloneAttribute: "data-creeper-clone",
	cloneAttributeValue: "",
	frameRate: 60,
	initialPosition: 0,
	emptyWidth: 0,
	minItemsCount: 1,
	singleItemGapOffset: 1,
	reducedMotionQuery: "(prefers-reduced-motion: reduce)",
	imageSelector: "img",
	loadEventName: "load",
	resizeEventName: "resize",
	mediaChangeEventName: "change",
	transformProperty: "x",
	scrollRootSelector: "html",
	clientWidthProperty: "clientWidth",
	columnGapProperty: "columnGap",
	gapProperty: "gap",
	idAttribute: "id",
	ariaHiddenAttribute: "aria-hidden",
	ariaHiddenValue: "true",
	cloneWithChildren: true,
	onceEventListener: true,
};

/**
 * @typedef {Object} CreeperLineOptions
 * @property {string} viewportSelector - Селектор видимой обертки с overflow / Selector of the visible overflow wrapper.
 * @property {string} trackSelector - Селектор движущегося элемента внутри обертки / Selector of the moving element inside viewport.
 * @property {string} itemSelector - Селектор повторяемых элементов внутри ленты / Selector of repeated items inside track.
 * @property {number} speed - Скорость движения в пикселях в секунду / Movement speed in pixels per second.
 * @property {number} resizeDelay - Задержка пересчета при изменении размера в миллисекундах / Resize recalculation delay in milliseconds.
 */

/** @type {CreeperLineOptions} */
const defaultOptions = {
	viewportSelector: ".creeper-line__track",
	trackSelector: ".creeper-line__list",
	itemSelector: ".creeper-line__item",
	speed: 40,
	resizeDelay: 150,
};

export const initCreeperLines = (options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};
	const creeperLines = document.querySelectorAll(settings.viewportSelector);
	const prefersReducedMotion = window.matchMedia(
		internalSettings.reducedMotionQuery,
	);

	creeperLines.forEach((viewport) => {
		if (
			viewport.dataset[internalSettings.initializedDataKey] ===
			internalSettings.initializedValue
		) {
			return;
		}

		viewport.dataset[internalSettings.initializedDataKey] =
			internalSettings.initializedValue;

		const track = viewport.querySelector(settings.trackSelector);
		const originalItems = track
			? Array.from(track.querySelectorAll(settings.itemSelector))
			: [];

		if (!track || originalItems.length < internalSettings.minItemsCount) {
			return;
		}

		let x = internalSettings.initialPosition;
		let ticker = null;
		let resizeTimer = null;
		let lastViewportWidth =
			document.querySelector(internalSettings.scrollRootSelector)?.[
				internalSettings.clientWidthProperty
			] || window.innerWidth;

		const clearClones = () => {
			track
				.querySelectorAll(`[${internalSettings.cloneAttribute}]`)
				.forEach((clone) => {
					clone.remove();
				});
		};

		const restoreOriginalOrder = () => {
			originalItems.forEach((item) => {
				track.appendChild(item);
			});
		};

		const getGap = () => {
			const styles = window.getComputedStyle(track);
			const gap = Number.parseFloat(
				styles[internalSettings.columnGapProperty] ||
					styles[internalSettings.gapProperty],
			);

			return Number.isNaN(gap) ? internalSettings.emptyWidth : gap;
		};

		const getItemWidth = (item) => item.getBoundingClientRect().width + getGap();

		const getOriginalWidth = () => {
			const gap = getGap();
			const itemsWidth = originalItems.reduce((width, item) => {
				return width + item.getBoundingClientRect().width;
			}, internalSettings.emptyWidth);

			return (
				itemsWidth +
				gap *
					Math.max(
						originalItems.length - internalSettings.singleItemGapOffset,
						internalSettings.emptyWidth,
					)
			);
		};

		const fillTrack = () => {
			const minWidth = viewport.offsetWidth + getOriginalWidth();

			while (track.scrollWidth < minWidth) {
				originalItems.forEach((item) => {
					const clone = item.cloneNode(internalSettings.cloneWithChildren);
					clone.removeAttribute(internalSettings.idAttribute);
					clone.setAttribute(
						internalSettings.ariaHiddenAttribute,
						internalSettings.ariaHiddenValue,
					);
					clone.setAttribute(
						internalSettings.cloneAttribute,
						internalSettings.cloneAttributeValue,
					);
					track.appendChild(clone);
				});
			}
		};

		const stop = () => {
			if (ticker) {
				gsap.ticker.remove(ticker);
				ticker = null;
			}
		};

		const recycleItems = () => {
			let firstItem = track.firstElementChild;

			while (firstItem && Math.abs(x) >= getItemWidth(firstItem)) {
				const itemWidth = getItemWidth(firstItem);
				track.appendChild(firstItem);
				x += itemWidth;
				firstItem = track.firstElementChild;
			}
		};

		const start = () => {
			stop();
			clearClones();
			restoreOriginalOrder();
			x = internalSettings.initialPosition;
			gsap.set(track, { [internalSettings.transformProperty]: x });

			if (
				prefersReducedMotion.matches ||
				getOriginalWidth() <= viewport.offsetWidth
			) {
				return;
			}

			fillTrack();

			ticker = () => {
				x -=
					(settings.speed *
						gsap.ticker.deltaRatio(internalSettings.frameRate)) /
					internalSettings.frameRate;
				recycleItems();
				gsap.set(track, { [internalSettings.transformProperty]: x });
			};
			gsap.ticker.add(ticker);
		};

		start();

		track.querySelectorAll(internalSettings.imageSelector).forEach((image) => {
			if (!image.complete) {
				image.addEventListener(internalSettings.loadEventName, start, {
					once: internalSettings.onceEventListener,
				});
			}
		});

		window.addEventListener(internalSettings.resizeEventName, () => {
			const currentViewportWidth =
				document.querySelector(internalSettings.scrollRootSelector)?.[
					internalSettings.clientWidthProperty
				] || window.innerWidth;

			if (currentViewportWidth >= lastViewportWidth) {
				lastViewportWidth = currentViewportWidth;
				return;
			}

			lastViewportWidth = currentViewportWidth;
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(start, settings.resizeDelay);
		});

		if (prefersReducedMotion.addEventListener) {
			prefersReducedMotion.addEventListener(
				internalSettings.mediaChangeEventName,
				start,
			);
		} else {
			prefersReducedMotion.addListener(start);
		}
	});
};
