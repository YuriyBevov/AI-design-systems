const speed = 40;

const initCreeperLines = (gsap) => {
	const creeperLines = document.querySelectorAll(".crawl-line__viewport");
	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);

	creeperLines.forEach((viewport) => {
		if (viewport.dataset.creeperInitialized === "true") {
			return;
		}

		viewport.dataset.creeperInitialized = "true";

		const track = viewport.querySelector(".crawl-line__track");
		const originalItems = track
			? Array.from(track.querySelectorAll(".crawl-line__item"))
			: [];

		if (!track || originalItems.length === 0) {
			return;
		}

		let x = 0;
		let ticker = null;
		let resizeTimer = null;

		const clearClones = () => {
			track.querySelectorAll("[data-creeper-clone]").forEach((clone) => {
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
			const gap = Number.parseFloat(styles.columnGap || styles.gap);

			return Number.isNaN(gap) ? 0 : gap;
		};

		const getItemWidth = (item) => item.getBoundingClientRect().width + getGap();

		const getOriginalWidth = () => {
			const gap = getGap();
			const itemsWidth = originalItems.reduce((width, item) => {
				return width + item.getBoundingClientRect().width;
			}, 0);

			return itemsWidth + gap * Math.max(originalItems.length - 1, 0);
		};

		const fillTrack = () => {
			const minWidth = viewport.offsetWidth + getOriginalWidth();

			while (track.scrollWidth < minWidth) {
				originalItems.forEach((item) => {
					const clone = item.cloneNode(true);
					clone.removeAttribute("id");
					clone.setAttribute("aria-hidden", "true");
					clone.setAttribute("data-creeper-clone", "");
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
			x = 0;
			gsap.set(track, { x });

			if (
				prefersReducedMotion.matches ||
				getOriginalWidth() <= viewport.offsetWidth
			) {
				return;
			}

			fillTrack();

			ticker = () => {
				x -= (speed * gsap.ticker.deltaRatio(60)) / 60;
				recycleItems();
				gsap.set(track, { x });
			};
			gsap.ticker.add(ticker);
		};

		start();

		track.querySelectorAll("img").forEach((image) => {
			if (!image.complete) {
				image.addEventListener("load", start, { once: true });
			}
		});

		window.addEventListener("resize", () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(start, 150);
		});

		if (prefersReducedMotion.addEventListener) {
			prefersReducedMotion.addEventListener("change", start);
		} else {
			prefersReducedMotion.addListener(start);
		}
	});
};

if (window.gsap) {
	initCreeperLines(window.gsap);
} else {
	window.addEventListener("gsap:ready", () => {
		initCreeperLines(window.gsap);
	});
}
