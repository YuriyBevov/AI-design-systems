import "../styles/main.scss";
import { initCreeperLines } from "./gsap/gsap-creeper-line";
import { initGsapMenu } from "./gsap/gsap-menu";

initCreeperLines({
	viewportSelector: ".creeper-line__track",
	trackSelector: ".creeper-line__list",
	itemSelector: ".creeper-line__item",
	speed: 40,
});

initGsapMenu();
