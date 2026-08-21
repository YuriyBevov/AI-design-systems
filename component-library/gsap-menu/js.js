import { gsap } from "gsap";

const internalSettings = {
	initializedDataKey: "menuInitialized",
	initializedValue: "true",
	ariaExpandedAttribute: "aria-expanded",
	ariaHiddenAttribute: "aria-hidden",
	ariaOpenedValue: "true",
	ariaClosedValue: "false",
	clickEventName: "click",
	keydownEventName: "keydown",
	mediaChangeEventName: "change",
	escapeKey: "Escape",
	blankTargetValue: "_blank",
	primaryPointerButton: 0,
	reducedMotionQuery: "(prefers-reduced-motion: reduce)",
	reducedMotionDuration: 0,
	rootHiddenAutoAlpha: 0,
	rootVisibleAutoAlpha: 1,
	overlayHiddenAutoAlpha: 0,
	overlayVisibleAutoAlpha: 1,
	panelVisibleAutoAlpha: 1,
	panelOpenedXPercent: 0,
	timelineStartPosition: 0,
	reverseCompleteCallbackName: "onReverseComplete",
	clearPropsValue: "all",
	bodySelector: "body",
	scrollRootSelector: "html",
	lockedBodyOverflowValue: "hidden",
	stableScrollbarGutterValue: "stable",
};

const bodyLockerState = {
	overflow: "",
	scrollbarGutter: "",
	isLocked: false,
};

const bodyLocker = (isLocked) => {
	const body = document.querySelector(internalSettings.bodySelector);
	const scrollRoot = document.querySelector(internalSettings.scrollRootSelector);

	if (!body || !scrollRoot) {
		return;
	}

	if (isLocked && !bodyLockerState.isLocked) {
		bodyLockerState.overflow = body.style.overflow;
		bodyLockerState.scrollbarGutter = scrollRoot.style.scrollbarGutter;
		body.style.overflow = internalSettings.lockedBodyOverflowValue;
		scrollRoot.style.scrollbarGutter =
			internalSettings.stableScrollbarGutterValue;
		bodyLockerState.isLocked = true;
		return;
	}

	if (!isLocked && bodyLockerState.isLocked) {
		body.style.overflow = bodyLockerState.overflow;
		scrollRoot.style.scrollbarGutter = bodyLockerState.scrollbarGutter;
		bodyLockerState.isLocked = false;
	}
};

/**
 * @typedef {Object} GsapMenuOptions
 * @property {string} menuSelector - Селектор корневого элемента меню / Selector of the menu root element.
 * @property {string} panelSelector - Селектор панели меню / Selector of the menu panel.
 * @property {string} overlaySelector - Селектор подложки меню / Selector of the menu overlay.
 * @property {string} openerSelector - Селектор кнопки открытия меню / Selector of the menu opener button.
 * @property {string} closerSelector - Селектор кнопки закрытия меню / Selector of the menu close button.
 * @property {string} linkSelector - Селектор ссылок, закрывающих меню / Selector of links that close the menu.
 * @property {string} activeClass - Класс открытого состояния меню / Class used for the opened menu state.
 * @property {string} mediaQuery - Media query, в которой работает меню / Media query where the menu is active.
 * @property {number} panelClosedXPercent - Сдвиг панели в закрытом состоянии в процентах / Panel shift in closed state, in percent.
 * @property {number} duration - Длительность анимации в секундах / Animation duration, in seconds.
 * @property {number} panelStartDelay - Задержка старта анимации панели в секундах / Delay before panel animation starts, in seconds.
 * @property {string} ease - Easing анимации / Animation easing.
 * @property {boolean} shouldLockBody - Нужно ли блокировать прокрутку body / Whether body scrolling should be locked.
 * @property {boolean} shouldFocusCloser - Нужно ли фокусировать кнопку закрытия после открытия / Whether close button should be focused after opening.
 * @property {boolean} shouldFocusOpener - Нужно ли возвращать фокус на кнопку открытия после закрытия / Whether opener button should be focused after closing.
 */

/** @type {GsapMenuOptions} */
const defaultOptions = {
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
};

export const initGsapMenu = (options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};

	const menu = document.querySelector(settings.menuSelector);
	const panel = menu?.querySelector(settings.panelSelector);
	const overlay = menu?.querySelector(settings.overlaySelector);
	const opener = document.querySelector(settings.openerSelector);
	const closer = menu?.querySelector(settings.closerSelector);

	if (
		!menu ||
		!panel ||
		!overlay ||
		!opener ||
		!closer ||
		menu.dataset[internalSettings.initializedDataKey] ===
			internalSettings.initializedValue
	) {
		return;
	}

	menu.dataset[internalSettings.initializedDataKey] =
		internalSettings.initializedValue;

	const media = window.matchMedia(settings.mediaQuery);
	const prefersReducedMotion = window.matchMedia(
		internalSettings.reducedMotionQuery,
	);
	let isMenuOpen = false;
	let timeline = null;

	const getMenuLinks = () => Array.from(menu.querySelectorAll(settings.linkSelector));

	const setBodyLocked = (isLocked) => {
		if (settings.shouldLockBody) {
			bodyLocker(isLocked);
		}
	};

	const setAriaState = (isOpened) => {
		const menuValue = isOpened
			? internalSettings.ariaClosedValue
			: internalSettings.ariaOpenedValue;
		const openerValue = isOpened
			? internalSettings.ariaOpenedValue
			: internalSettings.ariaClosedValue;

		menu.setAttribute(internalSettings.ariaHiddenAttribute, menuValue);
		opener.setAttribute(internalSettings.ariaExpandedAttribute, openerValue);
	};

	const createTimeline = () => {
		const duration = prefersReducedMotion.matches
			? internalSettings.reducedMotionDuration
			: settings.duration;

		gsap.set(menu, { autoAlpha: internalSettings.rootHiddenAutoAlpha });
		gsap.set(overlay, { autoAlpha: internalSettings.overlayHiddenAutoAlpha });
		gsap.set(panel, {
			autoAlpha: internalSettings.panelVisibleAutoAlpha,
			xPercent: settings.panelClosedXPercent,
		});

		return gsap
			.timeline({
				paused: true,
				defaults: {
					duration,
					ease: settings.ease,
				},
			})
			.to(
				menu,
				{ autoAlpha: internalSettings.rootVisibleAutoAlpha },
				settings.panelStartDelay,
			)
			.to(
				overlay,
				{ autoAlpha: internalSettings.overlayVisibleAutoAlpha },
				settings.panelStartDelay,
			)
			.to(
				panel,
				{ xPercent: internalSettings.panelOpenedXPercent },
				settings.panelStartDelay,
			);
	};

	const closeMenu = (afterClose) => {
		if (!isMenuOpen || !timeline) {
			return;
		}

		isMenuOpen = false;
		setAriaState(false);

		timeline.eventCallback(internalSettings.reverseCompleteCallbackName, () => {
			menu.classList.remove(settings.activeClass);
			setBodyLocked(false);
			timeline.eventCallback(
				internalSettings.reverseCompleteCallbackName,
				null,
			);

			if (settings.shouldFocusOpener) {
				opener.focus();
			}

			if (typeof afterClose === "function") {
				afterClose();
			}
		});
		timeline.reverse();
	};

	const openMenu = () => {
		if (isMenuOpen || !timeline) {
			return;
		}

		isMenuOpen = true;
		menu.classList.add(settings.activeClass);
		setAriaState(true);
		setBodyLocked(true);
		timeline.play(internalSettings.timelineStartPosition);

		if (settings.shouldFocusCloser) {
			closer.focus();
		}
	};

	const onOverlayClick = (evt) => {
		if (evt.target === overlay) {
			closeMenu();
		}
	};

	const onCloseButtonClick = () => {
		closeMenu();
	};

	const onKeydown = (evt) => {
		if (evt.key === internalSettings.escapeKey) {
			closeMenu();
		}
	};

	const onMenuLinkClick = (evt) => {
		const link = evt.currentTarget;
		const href = link.href;

		if (
			evt.defaultPrevented ||
			evt.button !== internalSettings.primaryPointerButton ||
			evt.metaKey ||
			evt.ctrlKey ||
			evt.shiftKey ||
			evt.altKey ||
			link.target === internalSettings.blankTargetValue ||
			!href
		) {
			return;
		}

		evt.preventDefault();
		closeMenu(() => {
			if (href !== window.location.href) {
				window.location.href = href;
			}
		});
	};

	const addListeners = () => {
		opener.addEventListener(internalSettings.clickEventName, openMenu);
		closer.addEventListener(internalSettings.clickEventName, onCloseButtonClick);
		overlay.addEventListener(internalSettings.clickEventName, onOverlayClick);
		window.addEventListener(internalSettings.keydownEventName, onKeydown);
		getMenuLinks().forEach((link) => {
			link.addEventListener(internalSettings.clickEventName, onMenuLinkClick);
		});
	};

	const removeListeners = () => {
		opener.removeEventListener(internalSettings.clickEventName, openMenu);
		closer.removeEventListener(
			internalSettings.clickEventName,
			onCloseButtonClick,
		);
		overlay.removeEventListener(
			internalSettings.clickEventName,
			onOverlayClick,
		);
		window.removeEventListener(internalSettings.keydownEventName, onKeydown);
		getMenuLinks().forEach((link) => {
			link.removeEventListener(
				internalSettings.clickEventName,
				onMenuLinkClick,
			);
		});
	};

	const enable = () => {
		timeline = createTimeline();
		addListeners();
		setAriaState(false);
	};

	const disable = () => {
		if (isMenuOpen) {
			isMenuOpen = false;
			setBodyLocked(false);
		}

		removeListeners();
		menu.classList.remove(settings.activeClass);
		setAriaState(false);
		timeline?.kill();
		timeline = null;
		gsap.set([menu, overlay, panel], {
			clearProps: internalSettings.clearPropsValue,
		});
	};

	const onMediaChange = (evt) => {
		if (evt.matches) {
			enable();
			return;
		}

		disable();
	};

	if (media.matches) {
		enable();
	}

	if (media.addEventListener) {
		media.addEventListener(internalSettings.mediaChangeEventName, onMediaChange);
	} else {
		media.addListener(onMediaChange);
	}
};
