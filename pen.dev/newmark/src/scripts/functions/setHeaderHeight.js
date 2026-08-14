export const setHeaderHeight = () => {
	const header = document.querySelector(".header");
	if (!header) return Promise.resolve(false);

	const setHeight = (height) => {
		const pageHeadOffset = height + 40;
		const breadcrumbsOffset = height + 20;

		document.documentElement.style.setProperty(
			"--header-height",
			`${height + 24}px`,
		);
		document.documentElement.style.setProperty(
			"--page-head-section-offset",
			`${pageHeadOffset}px`,
		);
		document.documentElement.style.setProperty(
			"--breadcrumbs-section-offset",
			`${breadcrumbsOffset}px`,
		);

		document.querySelectorAll(".page-head").forEach((pageHead) => {
			const section = pageHead.closest("section");
			const target = section || pageHead;

			target.style.paddingTop = `${pageHeadOffset}px`;
		});

		document.querySelectorAll(".breadcrumbs").forEach((breadcrumbs) => {
			breadcrumbs.style.top = `${breadcrumbsOffset}px`;
		});
	};

	const initialHeight = header.getBoundingClientRect().height;

	if (initialHeight) {
		setHeight(initialHeight);
	}

	const observer = new ResizeObserver(([entry]) => {
		setHeight(entry.contentRect.height);
	});

	observer.observe(header);

	return Promise.resolve(true);
};
