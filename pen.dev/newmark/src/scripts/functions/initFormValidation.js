const getFormPayload = (form) => {
	const formData = new FormData(form);
	const disabledProductControl = form.querySelector("[data-modal-product-control]");

	if (disabledProductControl?.value) {
		formData.set("product", disabledProductControl.value);
	}

	if (formData.has("agreement")) {
		formData.set("agreement", "Да");
	}

	return formData;
};

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

const updateFileLabel = (input) => {
	const label = input.closest(".file-button")?.querySelector("[data-file-button-label]");

	if (!label) {
		return;
	}

	if (!label.dataset.defaultText) {
		label.dataset.defaultText = label.textContent;
	}

	const fileNames = Array.from(input.files ?? []).map((file) => file.name);
	label.textContent = fileNames.length > 0 ? fileNames.join(", ") : label.dataset.defaultText;
	input.closest(".file-button")?.classList.toggle("is-has-file", fileNames.length > 0);
};

const initFileInputs = (form) => {
	const fileInputs = form.querySelectorAll(".file-button__input");

	fileInputs.forEach((input) => {
		updateFileLabel(input);
		input.addEventListener("change", () => updateFileLabel(input));
	});

	form.addEventListener("reset", () => {
		requestAnimationFrame(() => {
			fileInputs.forEach((input) => updateFileLabel(input));
		});
	});
};

export const initFormValidation = () => {
	const forms = document.querySelectorAll("[data-request-form]");

	forms.forEach((form) => {
		const submitButton = form.querySelector("[type='submit']");
		initFileInputs(form);

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
					body: getFormPayload(form),
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
