const defaultOptions = {
	bodySelector: "body",
	scrollRootSelector: "html",
	lockedOverflowValue: "hidden",
	stableScrollbarGutterValue: "stable",
};

let previousBodyOverflow = "";
let previousScrollbarGutter = "";

export const bodyLocker = (isLocked, options = {}) => {
	const settings = {
		...defaultOptions,
		...options,
	};
	const body = document.querySelector(settings.bodySelector);
	const scrollRoot = document.querySelector(settings.scrollRootSelector);

	if (!body) {
		return;
	}

	if (isLocked) {
		previousBodyOverflow = body.style.overflow;
		previousScrollbarGutter = scrollRoot?.style.scrollbarGutter || "";

		if (scrollRoot) {
			scrollRoot.style.scrollbarGutter = settings.stableScrollbarGutterValue;
		}

		body.style.overflow = settings.lockedOverflowValue;
		return;
	}

	if (scrollRoot) {
		scrollRoot.style.scrollbarGutter = previousScrollbarGutter;
	}

	body.style.overflow = previousBodyOverflow;
};
