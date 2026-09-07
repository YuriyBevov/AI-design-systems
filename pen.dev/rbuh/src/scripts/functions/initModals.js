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

const getFocusableElements = (container) =>
	Array.from(container.querySelectorAll(focusableSelector)).filter((element) => element.offsetParent !== null);

const focusFirstElement = () => {
	const focusableElements = getFocusableElements(activeDialog);
	const firstElement = focusableElements[0] ?? activeDialog;

	firstElement.focus();
};

const closeModal = ({ shouldRestoreFocus = true } = {}) => {
	if (!activeModal || !activeDialog) {
		return;
	}

	const modal = activeModal;
	const trigger = activeTrigger;

	activeModal.classList.remove("is-open");
	activeModal.setAttribute("aria-hidden", "true");
	bodyLocker(false);

	if (shouldRestoreFocus && trigger instanceof HTMLElement) {
		trigger.focus();
	}

	activeModal = null;
	activeDialog = null;
	activeTrigger = null;
};

const openModal = (modal, trigger = document.activeElement) => {
	if (activeModal) {
		closeModal({ shouldRestoreFocus: false });
	}

	activeModal = modal;
	activeDialog = modal.querySelector(".modal__dialog");
	activeTrigger = trigger;

	if (!activeDialog) {
		return;
	}

	modal.classList.add("is-open");
	modal.setAttribute("aria-hidden", "false");
	bodyLocker(true);
	focusFirstElement();
};

const setStatusModalContent = (modal, status) => {
	const statusTitle = modal.querySelector("[data-modal-status-title]");
	const statusText = modal.querySelector("[data-modal-status-text]");
	const isSuccess = status === "success";

	if (statusTitle) {
		statusTitle.textContent = isSuccess ? "Заявка отправлена" : "Ошибка отправки";
	}

	if (statusText) {
		statusText.textContent = isSuccess
			? "Спасибо! Ваша заявка успешно отправлена."
			: "Отправка пока недоступна. Позвоните нам: 8 (929) 840-40-44.";
	}
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
	document.addEventListener("modal:open", (event) => {
		const modal = modals.get(event.detail?.id);

		if (!modal) {
			return;
		}

		if (event.detail?.status) {
			setStatusModalContent(modal, event.detail.status);
		}

		openModal(modal, event.detail?.trigger);
	});
	document.addEventListener("modal:close", () => {
		closeModal({ shouldRestoreFocus: false });
	});
};
