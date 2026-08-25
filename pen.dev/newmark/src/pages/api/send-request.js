import nodemailer from "nodemailer";

const recipientEmail = "yuriybevov@gmail.com";
const maxFieldLength = 2000;
const maxAttachmentSize = 10 * 1024 * 1024;
const maxAttachmentCount = 10;

const fieldLabels = {
	formType: "Тип формы",
	name: "Ваше имя",
	company: "Название компании",
	email: "Эл. почта",
	phone: "Телефон",
	comment: "Комментарий",
	product: "Товар",
	agreement: "Согласие на обработку персональных данных",
};

const requiredFieldsByFormType = {
	modal: ["name", "phone", "agreement"],
	request: ["name", "phone", "agreement"],
};

const sanitizeValue = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxFieldLength);
const escapeHtml = (value) =>
	sanitizeValue(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const getTransportConfig = () => {
	const host = process.env.SMTP_HOST;
	const port = Number(process.env.SMTP_PORT ?? 465);
	const user = process.env.SMTP_USER;
	const pass = process.env.SMTP_PASS;

	if (!host || !user || !pass) {
		return null;
	}

	return {
		host,
		port,
		secure: String(process.env.SMTP_SECURE ?? "true") === "true",
		auth: {
			user,
			pass,
		},
	};
};

const getMessageHtml = (payload) => {
	const rows = Object.entries(fieldLabels)
		.map(([field, label]) => {
			const value = sanitizeValue(payload[field]);

			if (!value) {
				return "";
			}

			return `<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:700;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(value)}</td></tr>`;
		})
		.filter(Boolean)
		.join("");

	return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">${rows}</table>`;
};

const getPayloadFromFormData = (formData) => {
	const payload = {};

	Object.keys(fieldLabels).forEach((field) => {
		const value = formData.get(field);

		if (typeof value === "string") {
			payload[field] = value;
		}
	});

	return payload;
};

const getAttachments = async (formData) => {
	const files = formData
		.getAll("attachment")
		.filter((file) => file && typeof file === "object" && typeof file.arrayBuffer === "function" && file.size > 0)
		.slice(0, maxAttachmentCount);

	if (files.length === 0) {
		return [];
	}

	return Promise.all(
		files.map(async (file) => {
			if (file.size > maxAttachmentSize) {
				throw new Error("attachment_too_large");
			}

			return {
				filename: sanitizeValue(file.name) || "attachment",
				content: Buffer.from(await file.arrayBuffer()),
				contentType: file.type || undefined,
			};
		}),
	);
};

export const POST = async ({ request }) => {
	try {
		const formData = await request.formData();
		const payload = getPayloadFromFormData(formData);
		const formType = sanitizeValue(payload.formType) || "modal";
		const requiredFields = requiredFieldsByFormType[formType] ?? requiredFieldsByFormType.modal;
		const missingField = requiredFields.find((field) => !sanitizeValue(payload[field]));

		if (missingField) {
			return new Response(JSON.stringify({ ok: false, error: "validation" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const attachments = await getAttachments(formData);

		const transportConfig = getTransportConfig();

		if (!transportConfig) {
			return new Response(JSON.stringify({ ok: false, error: "smtp_config" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		const transporter = nodemailer.createTransport(transportConfig);
		const product = sanitizeValue(payload.product);
		const subject = product ? `Заявка с сайта Newmark: ${product}` : "Заявка с сайта Newmark";

		await transporter.sendMail({
			from: process.env.SMTP_FROM || transportConfig.auth.user,
			to: recipientEmail,
			replyTo: sanitizeValue(payload.email) || undefined,
			subject,
			attachments: attachments.length > 0 ? attachments : undefined,
			text: Object.entries(fieldLabels)
				.map(([field, label]) => {
					const value = sanitizeValue(payload[field]);
					return value ? `${label}: ${value}` : "";
				})
				.filter(Boolean)
				.join("\n"),
			html: getMessageHtml(payload),
		});

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(JSON.stringify({ ok: false, error: "send_failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
