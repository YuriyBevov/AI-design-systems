const moscowOffset = 3 * 60 * 60 * 1000;
const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

const unitForms = {
	days: ["день", "дня", "дней"],
	hours: ["час", "часа", "часов"],
	minutes: ["минута", "минуты", "минут"],
	seconds: ["секунда", "секунды", "секунд"],
};

const getPlural = (value, forms) => {
	const lastTwo = value % 100;
	const last = value % 10;

	if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
	if (last === 1) return forms[0];
	if (last >= 2 && last <= 4) return forms[1];
	return forms[2];
};

export const getDailyRemaining = (timestamp = Date.now()) => {
	const moscowDate = new Date(timestamp + moscowOffset);
	const currentTime = moscowDate.getUTCHours() * hour + moscowDate.getUTCMinutes() * minute + moscowDate.getUTCSeconds() * second + moscowDate.getUTCMilliseconds();
	const startTime = 8 * hour;
	const endTime = 21 * hour;

	if (currentTime < startTime || currentTime >= endTime) return 0;

	const deadlineInMoscow = Date.UTC(
		moscowDate.getUTCFullYear(),
		moscowDate.getUTCMonth(),
		moscowDate.getUTCDate(),
		21,
		0,
		0,
	);

	return Math.max(0, deadlineInMoscow - moscowOffset - timestamp);
};

const getTimeParts = (remaining) => ({
	days: Math.floor(remaining / day),
	hours: Math.floor((remaining % day) / hour),
	minutes: Math.floor((remaining % hour) / minute),
	seconds: Math.floor((remaining % minute) / second),
});

const renderCountdown = (root) => {
	const render = () => {
		const remaining = getDailyRemaining();
		const values = getTimeParts(remaining);

		root.querySelectorAll("[data-countdown-unit]").forEach((item) => {
			const unit = item.dataset.countdownUnit;
			const value = values[unit] ?? 0;
			const valueElement = item.querySelector("[data-countdown-value]");
			const labelElement = item.querySelector("[data-countdown-label]");

			if (valueElement) valueElement.textContent = String(value).padStart(2, "0");
			if (labelElement && unitForms[unit]) labelElement.textContent = getPlural(value, unitForms[unit]);
		});
	};

	render();
	window.setInterval(render, second);
};

export const initCountdown = () => {
	document.querySelectorAll("[data-countdown]").forEach((root) => {
		if (root.dataset.countdownInitialized === "true") return;
		root.dataset.countdownInitialized = "true";
		renderCountdown(root);
	});
};
