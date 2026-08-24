export const initFormValidation = () => {
	const forms = document.querySelectorAll(".request-form");

	forms.forEach((form) => {
		form.addEventListener("submit", (event) => {
			form.classList.add("is-validation-active");

			if (form.checkValidity()) {
				return;
			}

			event.preventDefault();

			const firstInvalidField = form.querySelector(":invalid");

			if (firstInvalidField instanceof HTMLElement) {
				firstInvalidField.focus();
			}
		});
	});
};
