import { initCardSlider } from "./initCardSlider";

export const initReviewsSlider = () => {
  document.querySelectorAll("[data-reviews-slider]").forEach((slider) => {
    initCardSlider(slider, "reviews");
  });
};
