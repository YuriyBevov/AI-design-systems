export const initFaq = () => {
  document.querySelectorAll("[data-faq-button]").forEach((button) => {
    if (button.dataset.faqInitialized === "true") {
      return;
    }

    button.dataset.faqInitialized = "true";
    button.addEventListener("click", () => {
      const content = document.getElementById(button.getAttribute("aria-controls"));
      const isExpanded = button.getAttribute("aria-expanded") === "true";

      button.setAttribute("aria-expanded", String(!isExpanded));
      button.closest(".faq-list__item")?.classList.toggle("is-open", !isExpanded);

      if (content) {
        content.hidden = isExpanded;
      }
    });
  });
};
