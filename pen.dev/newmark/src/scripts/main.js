import { initPhoneMasks } from "./functions/initPhoneMasks";
import { initModals } from "./functions/initModals";
import { initSliders } from "./functions/initSliders";
import { initCreeperLines } from "./gsap/gsap-creeper-line";
import { initGsapCountdown } from "./gsap/gsap-countdown";
import { initGsapMenu } from "./gsap/gsap-menu";
import { initGsapScrollUpButton } from "./gsap/gsap-scroll-up-button";

[
	initCreeperLines,
	initGsapCountdown,
	initGsapMenu,
	initGsapScrollUpButton,
	initModals,
	initPhoneMasks,
	initSliders,
].forEach((init) => init());
