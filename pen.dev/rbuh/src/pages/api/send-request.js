import nodemailer from "nodemailer";

const maxFieldLength = 2000;
const fieldLabels = {
  formType: "Тип формы",
  name: "Имя",
  phone: "Телефон",
  comment: "Комментарий",
  consent: "Согласие на обработку персональных данных",
};

const jsonResponse = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

const sanitizeValue = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxFieldLength);
const escapeHtml = (value) => sanitizeValue(value)
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
    auth: { user, pass },
  };
};

const getPayload = (formData) => Object.fromEntries(
  Object.keys(fieldLabels).map((field) => {
    const value = formData.get(field);
    return [field, typeof value === "string" ? sanitizeValue(value) : ""];
  }),
);

const getMessageHtml = (payload) => {
  const rows = Object.entries(fieldLabels).map(([field, label]) => {
    const value = payload[field];
    return value
      ? `<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:700">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(value)}</td></tr>`
      : "";
  }).filter(Boolean).join("");

  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows}</table>`;
};

export const POST = async ({ request }) => {
  let formData;

  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_form_data" }, 400);
  }

  try {
    const payload = getPayload(formData);

    if (!payload.name || !payload.phone || payload.consent !== "yes") {
      return jsonResponse({ ok: false, error: "validation" }, 400);
    }

    const transportConfig = getTransportConfig();
    const recipientEmail = process.env.SMTP_TO;

    if (!transportConfig || !recipientEmail) {
      return jsonResponse({ ok: false, error: "smtp_config" }, 503);
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const subject = "Заявка с сайта РБУ «Хаджох»";

    await transporter.sendMail({
      from: process.env.SMTP_FROM || transportConfig.auth.user,
      to: recipientEmail,
      subject,
      text: Object.entries(fieldLabels).map(([field, label]) => payload[field] ? `${label}: ${payload[field]}` : "").filter(Boolean).join("\n"),
      html: getMessageHtml(payload),
    });

    return jsonResponse({ ok: true }, 200);
  } catch {
    return jsonResponse({ ok: false, error: "send_failed" }, 500);
  }
};
