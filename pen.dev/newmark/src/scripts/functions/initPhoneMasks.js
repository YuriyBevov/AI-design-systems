import IMask from "imask";

const internalSettings = {
	initializedDataKey: "phoneMaskInitialized",
	initializedValue: "true",
};

/**
 * @typedef {Object} PhoneMaskOptions
 * @property {string} inputSelector - Селектор полей телефона / Selector of phone inputs.
 * @property {string} mask - Формат маски телефона / Phone mask pattern.
 */

/** @type {PhoneMaskOptions} */
const defaultOptions = {
	inputSelector: "[data-phone-mask]",
	mask: "+{7} (000) 000 - 00 - 00",
};

export const initPhoneMasks = (options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};
	const inputs = document.querySelectorAll(settings.inputSelector);

	inputs.forEach((input) => {
		if (
			input.dataset[internalSettings.initializedDataKey] ===
			internalSettings.initializedValue
		) {
			return;
		}

		input.dataset[internalSettings.initializedDataKey] =
			internalSettings.initializedValue;

		IMask(input, {
			mask: settings.mask,
		});
	});
};
