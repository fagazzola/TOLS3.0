const RESEND_API = "https://api.resend.com/emails";

// envía un correo transaccional vía Resend (API-key simple, sin OAuth).
// RESEND_API_KEY nunca debe viajar por el chat con Claude — se agrega directo en Netlify.
export async function enviarCorreo({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Falta configurar RESEND_API_KEY en Netlify.");
  const from = process.env.MAIL_FROM || "TOLS 3.0 <onboarding@resend.dev>";
  const r = await fetch(RESEND_API, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `No se pudo enviar el correo (HTTP ${r.status}).`);
  return json;
}

export function plantillaCodigo(codigo, nombre) {
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; background:#0f1720; padding:32px; color:#e8edf2;">
    <div style="max-width:420px; margin:0 auto; background:#182430; border-radius:14px; padding:28px; border:1px solid #2a3a4a;">
      <div style="font-size:13px; letter-spacing:.06em; color:#8fd694; text-transform:uppercase; margin-bottom:8px;">♣ Torrente On Line Series - TOLS 3.0</div>
      <h2 style="margin:0 0 12px; color:#fff;">Confirma tu correo</h2>
      <p style="margin:0 0 20px; color:#b6c2cd; font-size:14px;">
        Hola${nombre ? " " + nombre : ""}, este es tu código para completar tu registro en TOLS 3.0.
        Es válido por <strong>30 segundos</strong> — ingrésalo apenas lo veas.
      </p>
      <div style="font-size:34px; font-weight:700; letter-spacing:.3em; text-align:center; background:#0f1720; border-radius:10px; padding:16px; color:#8fd694; border:1px solid #2a3a4a;">
        ${codigo}
      </div>
      <p style="margin:20px 0 0; color:#7c8a97; font-size:12px;">
        Si no solicitaste este código, puedes ignorar este correo.
      </p>
    </div>
  </div>`;
}
