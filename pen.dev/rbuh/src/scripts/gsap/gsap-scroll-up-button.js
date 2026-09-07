import { gsap } from "gsap";

export const initGsapScrollUpButton = () => {
	const parent = document.body;

	if (parent.dataset.scrollUpInitialized === "true") return;
	parent.dataset.scrollUpInitialized = "true";

	const button = document.createElement("button");
	button.className = "scroll-up-button";
	button.type = "button";
	button.setAttribute("aria-label", "В начало страницы");
	parent.append(button);

	let isVisible = false;
	gsap.set(button, { autoAlpha: 0, y: 120 });

	const update = () => {
		const shouldShow = window.scrollY > document.documentElement.clientHeight * 1.3;

		if (shouldShow === isVisible) return;
		isVisible = shouldShow;
		gsap.to(button, {
			autoAlpha: shouldShow ? 1 : 0,
			y: shouldShow ? 0 : 120,
			duration: shouldShow ? 0.55 : 0.35,
			ease: shouldShow ? "back.out(1.5)" : "power1.out",
		});
	};

	button.addEventListener("click", () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	});
	window.addEventListener("scroll", update, { passive: true });
	update();
};
