const showStatusModal = (status, trigger) => {
	document.dispatchEvent(new CustomEvent("modal:close"));
	document.dispatchEvent(
		new CustomEvent("modal:open", {
			detail: {
				id: "status",
				status,
				trigger,
			},
		}),
	);
};

const setSubmitState = (form, isSubmitting) => {
	const submitButton = form.querySelector("[type='submit']");

	if (!submitButton) {
		return;
	}

	submitButton.disabled = isSubmitting;
	submitButton.textContent = isSubmitting ? "Отправляем..." : submitButton.dataset.defaultText;
};

export const initFormValidation = () => {
	const forms = document.querySelectorAll("[data-request-form]");

	forms.forEach((form) => {
		const submitButton = form.querySelector("[type='submit']");
		if (submitButton) {
			submitButton.dataset.defaultText = submitButton.textContent;
		}

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			form.classList.add("is-validation-active");

			const firstInvalidField = form.querySelector(":invalid");

			if (!form.checkValidity() && firstInvalidField instanceof HTMLElement) {
				firstInvalidField.focus();
				return;
			}

			setSubmitState(form, true);

			try {
				const response = await fetch(form.action, {
					method: form.method || "POST",
					body: new FormData(form),
				});

				if (!response.ok) {
					throw new Error("Request failed");
				}

				form.reset();
				form.classList.remove("is-validation-active");
				showStatusModal("success", submitButton);
			} catch (error) {
				showStatusModal("error", submitButton);
			} finally {
				setSubmitState(form, false);
			}
		});
	});
};
