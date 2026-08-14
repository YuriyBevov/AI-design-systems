import { gsap } from "gsap";

const internalSettings = {
	initializedDataKey: "scrollUpInitialized",
	initializedValue: "true",
	buttonTypeAttribute: "type",
	buttonTypeValue: "button",
	ariaLabelAttribute: "aria-label",
	clickEventName: "click",
	scrollEventName: "scroll",
	topPosition: 0,
	scrollBehavior: "smooth",
	hiddenAutoAlpha: 0,
	visibleAutoAlpha: 1,
};

/**
 * @typedef {Object} GsapScrollUpButtonOptions
 * @property {string} parentSelector - Селектор контейнера, куда добавляется кнопка / Selector of the container where the button is appended.
 * @property {string} buttonClass - Класс создаваемой кнопки / Class of the created button.
 * @property {string} ariaLabel - Подпись кнопки для доступности / Accessible button label.
 * @property {number} thresholdRatio - Порог показа в высотах viewport / Show threshold in viewport heights.
 * @property {number} hiddenY - Сдвиг кнопки в скрытом состоянии в пикселях / Button shift in hidden state, in pixels.
 * @property {number} showDuration - Длительность появления в секундах / Show animation duration, in seconds.
 * @property {number} hideDuration - Длительность скрытия в секундах / Hide animation duration, in seconds.
 * @property {string} showEase - Easing появления / Show animation easing.
 * @property {string} hideEase - Easing скрытия / Hide animation easing.
 */

/** @type {GsapScrollUpButtonOptions} */
const defaultOptions = {
	parentSelector: "body",
	buttonClass: "scroll-up-button",
	ariaLabel: "В начало страницы",
	thresholdRatio: 1.3,
	hiddenY: 150,
	showDuration: 0.7,
	hideDuration: 0.5,
	showEase: "back.out(1.7)",
	hideEase: "power1.out",
};

export const initGsapScrollUpButton = (options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};
	const parent = document.querySelector(settings.parentSelector);

	if (
		!parent ||
		parent.dataset[internalSettings.initializedDataKey] ===
			internalSettings.initializedValue
	) {
		return;
	}

	parent.dataset[internalSettings.initializedDataKey] =
		internalSettings.initializedValue;

	const button = document.createElement("button");
	let isActive = false;

	button.classList.add(settings.buttonClass);
	button.setAttribute(
		internalSettings.buttonTypeAttribute,
		internalSettings.buttonTypeValue,
	);
	button.setAttribute(internalSettings.ariaLabelAttribute, settings.ariaLabel);
	parent.append(button);

	gsap.set(button, {
		autoAlpha: internalSettings.hiddenAutoAlpha,
		y: settings.hiddenY,
	});

	const showButton = () => {
		gsap.to(button, {
			autoAlpha: internalSettings.visibleAutoAlpha,
			y: internalSettings.topPosition,
			duration: settings.showDuration,
			ease: settings.showEase,
		});
	};

	const hideButton = () => {
		gsap.to(button, {
			autoAlpha: internalSettings.hiddenAutoAlpha,
			y: settings.hiddenY,
			duration: settings.hideDuration,
			ease: settings.hideEase,
		});
	};

	const onScroll = () => {
		const viewportHeight = document.documentElement.clientHeight;
		const shouldShow = window.scrollY > viewportHeight * settings.thresholdRatio;

		if (shouldShow && !isActive) {
			isActive = true;
			showButton();
			return;
		}

		if (!shouldShow && isActive) {
			isActive = false;
			hideButton();
		}
	};

	const onClick = () => {
		window.scrollTo({
			top: internalSettings.topPosition,
			behavior: internalSettings.scrollBehavior,
		});
	};

	window.addEventListener(internalSettings.scrollEventName, onScroll);
	button.addEventListener(internalSettings.clickEventName, onClick);
	onScroll();
};
