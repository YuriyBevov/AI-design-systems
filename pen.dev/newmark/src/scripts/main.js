import { initPhoneMasks } from "./functions/initPhoneMasks";
import { initContentSliders } from "./functions/initContentSliders";
import { initCreeperLines } from "./gsap/gsap-creeper-line";
import { initGsapCountdown } from "./gsap/gsap-countdown";
import { initGsapMenu } from "./gsap/gsap-menu";
import { initGsapScrollUpButton } from "./gsap/gsap-scroll-up-button";

initCreeperLines({
	viewportSelector: ".creeper-line__track",
	trackSelector: ".creeper-line__list",
	itemSelector: ".creeper-line__item",
	speed: 40,
});

initGsapMenu();
initGsapCountdown();
initGsapScrollUpButton();
initPhoneMasks();
initContentSliders();
