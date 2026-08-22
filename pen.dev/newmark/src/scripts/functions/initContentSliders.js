import Swiper from "swiper";
import { A11y, FreeMode } from "swiper/modules";
import "swiper/css";
import "swiper/css/free-mode";

const internalSettings = {
	initializedDataKey: "contentSliderInitialized",
	initializedValue: "true",
};

const defaultOptions = {
	rootSelector: "[data-content-slider]",
	spaceBetween: 16,
};

export const initContentSliders = (options = {}) => {
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
			modules: [A11y, FreeMode],
			slidesPerView: "auto",
			spaceBetween: settings.spaceBetween,
			freeMode: {
				enabled: true,
				momentumRatio: 0.72,
			},
			a11y: {
				enabled: true,
			},
		});
	});
};
