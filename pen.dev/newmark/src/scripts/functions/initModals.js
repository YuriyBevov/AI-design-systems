import { bodyLocker } from "./bodyLocker";

const focusableSelector = [
	"a[href]",
	"button:not([disabled])",
	"textarea:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

let activeModal = null;
let activeDialog = null;
let activeTrigger = null;
let closeCleanupTimer = null;

const getFocusableElements = (container) =>
	Array.from(container.querySelectorAll(focusableSelector)).filter((element) => element.offsetParent !== null);

const setProductField = (modal, productName) => {
	const productField = modal.querySelector("[data-modal-product-field]");
	const productControl = modal.querySelector("[data-modal-product-control]");

	if (!productField || !productControl) {
		return;
	}

	if (productName) {
		productField.hidden = false;
		productControl.value = productName;
		return;
	}

	productField.hidden = true;
	productControl.value = "";
};

const focusFirstElement = () => {
	const focusableElements = getFocusableElements(activeDialog);
	const firstElement = focusableElements[0] ?? activeDialog;

	firstElement.focus();
};

const resetProductFieldAfterClose = (modal) => {
	const resetProductField = () => {
		if (modal.classList.contains("is-open")) {
			return;
		}

		setProductField(modal, "");
	};

	const handleTransitionEnd = (event) => {
		if (event.target !== modal || event.propertyName !== "opacity") {
			return;
		}

		window.clearTimeout(closeCleanupTimer);
		closeCleanupTimer = null;
		modal.removeEventListener("transitionend", handleTransitionEnd);
		resetProductField();
	};

	modal.addEventListener("transitionend", handleTransitionEnd);
	closeCleanupTimer = window.setTimeout(() => {
		modal.removeEventListener("transitionend", handleTransitionEnd);
		resetProductField();
	}, 320);
};

const closeModal = () => {
	if (!activeModal || !activeDialog) {
		return;
	}

	const modal = activeModal;
	const trigger = activeTrigger;

	activeModal.classList.remove("is-open");
	activeModal.setAttribute("aria-hidden", "true");
	bodyLocker(false);

	if (trigger instanceof HTMLElement) {
		trigger.focus();
	}

	activeModal = null;
	activeDialog = null;
	activeTrigger = null;
	resetProductFieldAfterClose(modal);
};

const openModal = (modal, trigger) => {
	if (activeModal) {
		closeModal();
	}

	if (closeCleanupTimer) {
		window.clearTimeout(closeCleanupTimer);
		closeCleanupTimer = null;
	}

	activeModal = modal;
	activeDialog = modal.querySelector(".modal__dialog");
	activeTrigger = trigger;

	if (!activeDialog) {
		return;
	}

	setProductField(modal, trigger.dataset.modalProduct);
	modal.classList.add("is-open");
	modal.setAttribute("aria-hidden", "false");
	bodyLocker(true);
	focusFirstElement();
};

const handleKeydown = (event) => {
	if (!activeModal || !activeDialog) {
		return;
	}

	if (event.key === "Escape") {
		event.preventDefault();
		closeModal();
		return;
	}

	if (event.key !== "Tab") {
		return;
	}

	const focusableElements = getFocusableElements(activeDialog);

	if (focusableElements.length === 0) {
		event.preventDefault();
		activeDialog.focus();
		return;
	}

	const firstElement = focusableElements[0];
	const lastElement = focusableElements[focusableElements.length - 1];

	if (event.shiftKey && document.activeElement === firstElement) {
		event.preventDefault();
		lastElement.focus();
		return;
	}

	if (!event.shiftKey && document.activeElement === lastElement) {
		event.preventDefault();
		firstElement.focus();
	}
};

const handleFocusin = (event) => {
	if (!activeDialog || activeDialog.contains(event.target)) {
		return;
	}

	focusFirstElement();
};

export const initModals = () => {
	const modals = new Map(Array.from(document.querySelectorAll("[data-modal]")).map((modal) => [modal.dataset.modal, modal]));
	const triggers = document.querySelectorAll("[data-modal-open]");

	triggers.forEach((trigger) => {
		trigger.addEventListener("click", () => {
			const modal = modals.get(trigger.dataset.modalOpen);

			if (!modal) {
				return;
			}

			openModal(modal, trigger);
		});
	});

	modals.forEach((modal) => {
		modal.querySelectorAll("[data-modal-close]").forEach((closeButton) => {
			closeButton.addEventListener("click", closeModal);
		});
	});

	document.addEventListener("keydown", handleKeydown);
	document.addEventListener("focusin", handleFocusin);
};
