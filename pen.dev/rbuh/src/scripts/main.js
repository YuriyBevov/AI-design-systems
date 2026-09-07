import { initFaq } from "./functions/initFaq";
import { initFormValidation } from "./functions/initFormValidation";
import { initModals } from "./functions/initModals";
import { initPhoneMasks } from "./functions/initPhoneMasks";
import { initCountdown } from "./functions/initCountdown";
import { initReviewsSlider } from "./functions/initReviewsSlider";
import { initServicesSlider } from "./functions/initServicesSlider";
import { initGsapMenu } from "./gsap/gsap-menu";
import { initGsapScrollUpButton } from "./gsap/gsap-scroll-up-button";

[
  initGsapMenu,
  initGsapScrollUpButton,
  initCountdown,
  initReviewsSlider,
  initServicesSlider,
  initFaq,
  initFormValidation,
  initModals,
  initPhoneMasks,
].forEach((init) => init());
