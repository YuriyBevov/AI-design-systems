import { initCardSlider } from "./initCardSlider";

export const initServicesSlider = () => {
  document.querySelectorAll("[data-services-slider]").forEach((slider) => {
    initCardSlider(slider, "services");
  });
};
