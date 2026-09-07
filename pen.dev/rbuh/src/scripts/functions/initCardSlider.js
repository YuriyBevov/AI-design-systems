import Swiper from "swiper";
import { A11y, Navigation, Pagination } from "swiper/modules";
import "swiper/css";

export const initCardSlider = (slider, kind) => {
  if (slider.swiper) return;

  return new Swiper(slider, {
    modules: [A11y, Navigation, Pagination],
    slidesPerView: 1,
    spaceBetween: 16,
    autoHeight: false,
    breakpoints: {
      768: {
        slidesPerView: 2,
        spaceBetween: 24,
      },
    },
    navigation: {
      prevEl: slider.querySelector(`[data-${kind}-prev]`),
      nextEl: slider.querySelector(`[data-${kind}-next]`),
    },
    pagination: {
      el: slider.querySelector(`[data-${kind}-pagination]`),
      clickable: true,
    },
    a11y: {
      enabled: true,
    },
  });
};
