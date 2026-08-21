import { gsap } from "gsap";

const internalSettings = {
	initializedDataKey: "countdownInitialized",
	initializedValue: "true",
	durationAttribute: "countdownDuration",
	deadlineAttribute: "countdownDeadline",
	unitAttribute: "countdownUnit",
	valueAttribute: "countdownValue",
	labelAttribute: "countdownLabel",
	valueInnerClass: "countdown__value-inner",
	valueCharClass: "countdown__value-char",
	valuePreviousClass: "countdown__value-inner--previous",
	valueCurrentClass: "countdown__value-inner--current",
	ariaLiveAttribute: "aria-live",
	ariaLiveValue: "polite",
	ariaLabelAttribute: "aria-label",
	secondDuration: 1000,
	minuteDuration: 60,
	hourDuration: 60,
	dayDuration: 24,
	emptyValue: 0,
	minCountdownValue: 0,
	twoDigitLength: 2,
	padCharacter: "0",
	initialYPercent: 100,
	exitYPercent: -100,
	visibleYPercent: 0,
	hiddenAutoAlpha: 0,
	visibleAutoAlpha: 1,
	clearPropsValue: "all",
};

const unitForms = {
	days: ["день", "дня", "дней"],
	hours: ["час", "часа", "часов"],
	minutes: ["минута", "минуты", "минут"],
	seconds: ["секунда", "секунды", "секунд"],
};

/**
 * @typedef {Object} GsapCountdownOptions
 * @property {string} rootSelector - Селектор корневого элемента таймера / Selector of the countdown root element.
 * @property {string} itemSelector - Селектор элемента единицы времени / Selector of a time unit item.
 * @property {string} valueSelector - Селектор значения внутри единицы времени / Selector of the value inside a time unit.
 * @property {string} labelSelector - Селектор подписи внутри единицы времени / Selector of the label inside a time unit.
 * @property {number} tickDelay - Частота обновления в миллисекундах / Update interval in milliseconds.
 * @property {number} duration - Длительность смены цифр в секундах / Digit change duration in seconds.
 * @property {string} ease - Easing смены цифр / Digit change easing.
 */

/** @type {GsapCountdownOptions} */
const defaultOptions = {
	rootSelector: ".countdown",
	itemSelector: ".countdown__item",
	valueSelector: "[data-countdown-value]",
	labelSelector: "[data-countdown-label]",
	tickDelay: 1000,
	duration: 0.45,
	ease: "power2.out",
};

const getPluralForm = (value, forms) => {
	const absoluteValue = Math.abs(value);
	const lastTwoDigits = absoluteValue % 100;
	const lastDigit = absoluteValue % 10;

	if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
		return forms[2];
	}

	if (lastDigit === 1) {
		return forms[0];
	}

	if (lastDigit >= 2 && lastDigit <= 4) {
		return forms[1];
	}

	return forms[2];
};

const getDeadline = (root) => {
	const deadlineValue = root.dataset[internalSettings.deadlineAttribute];

	if (deadlineValue) {
		const deadlineTime = new Date(deadlineValue).getTime();

		if (!Number.isNaN(deadlineTime)) {
			return deadlineTime;
		}
	}

	const durationValue = Number.parseInt(
		root.dataset[internalSettings.durationAttribute],
		10,
	);

	if (Number.isNaN(durationValue)) {
		return Date.now();
	}

	return Date.now() + durationValue * internalSettings.secondDuration;
};

const getTimeParts = (deadline) => {
	const totalSeconds = Math.max(
		internalSettings.minCountdownValue,
		Math.floor((deadline - Date.now()) / internalSettings.secondDuration),
	);
	const secondsInHour =
		internalSettings.minuteDuration * internalSettings.hourDuration;
	const secondsInDay = secondsInHour * internalSettings.dayDuration;
	const days = Math.floor(totalSeconds / secondsInDay);
	const hours = Math.floor((totalSeconds % secondsInDay) / secondsInHour);
	const minutes = Math.floor(
		(totalSeconds % secondsInHour) / internalSettings.minuteDuration,
	);
	const seconds = totalSeconds % internalSettings.minuteDuration;

	return {
		days,
		hours,
		minutes,
		seconds,
		totalSeconds,
	};
};

const formatValue = (value) => {
	return String(value).padStart(
		internalSettings.twoDigitLength,
		internalSettings.padCharacter,
	);
};

const createValueInner = (value) => {
	const inner = document.createElement("span");
	inner.classList.add(
		internalSettings.valueInnerClass,
		internalSettings.valueCurrentClass,
	);

	formatValue(value)
		.split("")
		.forEach((char) => {
			const charElement = document.createElement("span");
			charElement.classList.add(internalSettings.valueCharClass);
			charElement.textContent = char;
			inner.append(charElement);
		});

	return inner;
};

const setValue = (valueElement, nextValue, settings, shouldAnimate) => {
	const nextFormattedValue = formatValue(nextValue);

	if (valueElement.dataset.currentValue === nextFormattedValue) {
		return;
	}

	const previousInner = valueElement.querySelector(
		`.${internalSettings.valueInnerClass}`,
	);
	const nextInner = createValueInner(nextValue);

	valueElement.dataset.currentValue = nextFormattedValue;
	valueElement.textContent = "";

	if (!previousInner || !shouldAnimate) {
		valueElement.append(nextInner);
		return;
	}

	previousInner.classList.remove(internalSettings.valueCurrentClass);
	previousInner.classList.add(internalSettings.valuePreviousClass);
	valueElement.append(previousInner, nextInner);

	gsap.fromTo(
		nextInner.children,
		{
			yPercent: internalSettings.initialYPercent,
			autoAlpha: internalSettings.hiddenAutoAlpha,
		},
		{
			yPercent: internalSettings.visibleYPercent,
			autoAlpha: internalSettings.visibleAutoAlpha,
			duration: settings.duration,
			ease: settings.ease,
			stagger: settings.duration / internalSettings.dayDuration,
		},
	);

	gsap.to(previousInner.children, {
		yPercent: internalSettings.exitYPercent,
		autoAlpha: internalSettings.hiddenAutoAlpha,
		duration: settings.duration,
		ease: settings.ease,
		stagger: settings.duration / internalSettings.dayDuration,
		onComplete: () => {
			previousInner.remove();
			gsap.set(nextInner.children, {
				clearProps: internalSettings.clearPropsValue,
			});
		},
	});
};

export const initGsapCountdown = (options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};
	const countdowns = document.querySelectorAll(settings.rootSelector);

	countdowns.forEach((root) => {
		if (
			root.dataset[internalSettings.initializedDataKey] ===
			internalSettings.initializedValue
		) {
			return;
		}

		root.dataset[internalSettings.initializedDataKey] =
			internalSettings.initializedValue;
		root.setAttribute(
			internalSettings.ariaLiveAttribute,
			internalSettings.ariaLiveValue,
		);

		const deadline = getDeadline(root);
		const items = Array.from(root.querySelectorAll(settings.itemSelector)).map(
			(item) => {
				return {
					unit: item.dataset[internalSettings.unitAttribute],
					value: item.querySelector(settings.valueSelector),
					label: item.querySelector(settings.labelSelector),
				};
			},
		);

		const render = (shouldAnimate = true) => {
			const timeParts = getTimeParts(deadline);

			items.forEach((item) => {
				if (!item.unit || !item.value || !item.label) {
					return;
				}

				const value = timeParts[item.unit] ?? internalSettings.emptyValue;
				const forms = unitForms[item.unit];

				setValue(item.value, value, settings, shouldAnimate);

				if (forms) {
					item.label.textContent = getPluralForm(value, forms);
				}
			});

			root.setAttribute(
				internalSettings.ariaLabelAttribute,
				`${timeParts.days} ${getPluralForm(timeParts.days, unitForms.days)}, ${timeParts.hours} ${getPluralForm(timeParts.hours, unitForms.hours)}, ${timeParts.minutes} ${getPluralForm(timeParts.minutes, unitForms.minutes)}, ${timeParts.seconds} ${getPluralForm(timeParts.seconds, unitForms.seconds)}`,
			);

			if (timeParts.totalSeconds <= internalSettings.minCountdownValue) {
				clearInterval(timer);
			}
		};

		const timer = setInterval(render, settings.tickDelay);

		render(false);
	});
};
