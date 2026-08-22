import Swiper from "swiper";
import { A11y } from "swiper/modules";
import "swiper/css";

const internalSettings = {
	initializedDataKey: "sliderInitialized",
	initializedValue: "true",
};

const defaultOptions = {
	rootSelector: "[data-slider]",
	spaceBetween: 16,
};

export const initSliders = (options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};

	document.querySelectorAll(settings.rootSelector).forEach((slider) => {
		if (
			slider.dataset[internalSettings.initializedDataKey] ===
			internalSettings.initializedValue
		) {
			return;
		}

		slider.dataset[internalSettings.initializedDataKey] =
			internalSettings.initializedValue;

		new Swiper(slider, {
			modules: [A11y],
			slidesPerView: "auto",
			spaceBetween: settings.spaceBetween,
			a11y: {
				enabled: true,
			},
		});
	});
};
