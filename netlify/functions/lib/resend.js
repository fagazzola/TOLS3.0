const RESEND_API = "https://api.resend.com/emails";

// envía un correo transaccional vía Resend (API-key simple, sin OAuth).
// EMAIL_RESEND_API nunca debe viajar por el chat con Claude — se agrega directo en Netlify.
export async function enviarCorreo({ to, subject, html }) {
  const apiKey = process.env.EMAIL_RESEND_API;
  if (!apiKey) throw new Error("Falta configurar EMAIL_RESEND_API en Netlify.");
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

export function plantillaReset(codigo, nombre) {
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; background:#0f1720; padding:32px; color:#e8edf2;">
    <div style="max-width:420px; margin:0 auto; background:#182430; border-radius:14px; padding:28px; border:1px solid #2a3a4a;">
      <div style="font-size:13px; letter-spacing:.06em; color:#8fd694; text-transform:uppercase; margin-bottom:8px;">♣ Torrente On Line Series - TOLS 3.0</div>
      <h2 style="margin:0 0 12px; color:#fff;">Recupera tu contraseña</h2>
      <p style="margin:0 0 20px; color:#b6c2cd; font-size:14px;">
        Hola${nombre ? " " + nombre : ""}, usa este código para definir una nueva contraseña en TOLS 3.0.
        Es válido por <strong>5 minutos</strong>.
      </p>
      <div style="font-size:34px; font-weight:700; letter-spacing:.3em; text-align:center; background:#0f1720; border-radius:10px; padding:16px; color:#8fd694; border:1px solid #2a3a4a;">
        ${codigo}
      </div>
      <p style="margin:20px 0 0; color:#7c8a97; font-size:12px;">
        Si no pediste este código, puedes ignorar este correo — tu contraseña actual sigue funcionando.
      </p>
    </div>
  </div>`;
}

export function plantillaHost(nombre, fecha) {
  const fechaTexto = fecha
    ? new Date(fecha + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; background:#0f1720; padding:32px; color:#e8edf2;">
    <div style="max-width:420px; margin:0 auto; background:#182430; border-radius:14px; padding:28px; border:1px solid #2a3a4a;">
      <div style="font-size:13px; letter-spacing:.06em; color:#8fd694; text-transform:uppercase; margin-bottom:8px;">♠ Torrente On Line Series - TOLS 3.0</div>
      <h2 style="margin:0 0 12px; color:#fff;">¡Eres el Host del próximo Game Night!</h2>
      <p style="margin:0 0 16px; color:#b6c2cd; font-size:14px;">
        Hola${nombre ? " " + nombre : ""}, un administrador te asignó como <strong>Host</strong>
        ${fechaTexto ? `del torneo del <strong>${fechaTexto}</strong>` : "del próximo torneo"} de la liga.
      </p>
      <p style="margin:0 0 20px; color:#b6c2cd; font-size:14px;">
        Como Host eres responsable de la ejecución de ese Game Night. La próxima vez que entres al sitio
        vas a ver una marca de "Modo Host" — si ya tenías una sesión abierta, sal y vuelve a entrar para
        que se actualice.
      </p>
      <p style="margin:0; color:#7c8a97; font-size:12px;">
        Si crees que esto es un error, contacta a un administrador de la liga.
      </p>
    </div>
  </div>`;
}

// envuelve el mensaje que el Tesorero ya redactó y aprobó (texto plano, con saltos de línea en
// blanco entre párrafos) en el mismo diseño de correo del resto del sitio — no es una plantilla fija
// de texto, es solo el "sobre" visual alrededor de lo que el Tesorero escribió
export function plantillaEstadoCuenta(asunto, cuerpoTexto) {
  const parrafos = String(cuerpoTexto || "")
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px; color:#b6c2cd; font-size:14px; white-space:pre-line;">${p}</p>`)
    .join("");
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; background:#0f1720; padding:32px; color:#e8edf2;">
    <div style="max-width:480px; margin:0 auto; background:#182430; border-radius:14px; padding:28px; border:1px solid #2a3a4a;">
      <div style="font-size:13px; letter-spacing:.06em; color:#8fd694; text-transform:uppercase; margin-bottom:8px;">♦ Torrente On Line Series - TOLS 3.0</div>
      <h2 style="margin:0 0 16px; color:#fff;">${asunto}</h2>
      ${parrafos}
      <p style="margin:20px 0 0; color:#7c8a97; font-size:12px;">
        Si ya realizaste este pago o tienes dudas, contacta directamente al Tesorero de la liga.
      </p>
    </div>
  </div>`;
}

export function plantillaRegistroExitoso(nombre, numeroRegistro) {
  const num = String(numeroRegistro).padStart(2, "0");
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; background:#0f1720; padding:32px; color:#e8edf2;">
    <div style="max-width:460px; margin:0 auto; background:#182430; border-radius:14px; padding:28px; border:1px solid #2a3a4a;">
      <div style="font-size:13px; letter-spacing:.06em; color:#8fd694; text-transform:uppercase; margin-bottom:8px;">♥ Torrente On Line Series - TOLS 3.0</div>
      <h2 style="margin:0 0 12px; color:#fff;">¡Tu registro quedó completo!</h2>
      <p style="margin:0 0 16px; color:#b6c2cd; font-size:14px;">
        Hola${nombre ? " " + nombre : ""}, tu cuenta en TOLS 3.0 ya está activa. Bienvenido a la liga.
      </p>
      <p style="margin:0 0 8px; color:#b6c2cd; font-size:14px;">
        Tu <strong>número de registro</strong> es:
      </p>
      <div style="font-size:34px; font-weight:700; letter-spacing:.2em; text-align:center; background:#0f1720; border-radius:10px; padding:16px; color:#8fd694; border:1px solid #2a3a4a;">
        ${num}
      </div>
      <p style="margin:20px 0 8px; color:#b6c2cd; font-size:14px;">
        Guárdalo bien: cada vez que hagas un depósito relacionado con la liga (inscripción, buy-in, re-buy, etc.),
        debes agregar este número como los <strong>centavos</strong> del monto que transfieras. Así el Tesorero
        puede identificar de quién es cada depósito.
      </p>
      <div style="margin:0 0 16px; background:#0f1720; border-radius:10px; padding:16px; border:1px solid #2a3a4a;">
        <p style="margin:0 0 8px; color:#8fd694; font-size:13px; font-weight:600;">Ejemplos con tu número (${num}):</p>
        <p style="margin:0 0 6px; color:#b6c2cd; font-size:14px;">
          Si la inscripción es de <strong>$400</strong>, depositas <strong>$400.${num}</strong>
        </p>
        <p style="margin:0; color:#b6c2cd; font-size:14px;">
          Si depositas buy-in + re-buy de un torneo regular (<strong>$300 + $250 = $550</strong>), depositas <strong>$550.${num}</strong>
        </p>
      </div>
      <p style="margin:0; color:#7c8a97; font-size:12px;">
        Si tienes dudas sobre tu número de registro o algún depósito, contacta a un administrador de la liga.
      </p>
    </div>
  </div>`;
}

export function plantillaCodigo(codigo, nombre) {
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; background:#0f1720; padding:32px; color:#e8edf2;">
    <div style="max-width:420px; margin:0 auto; background:#182430; border-radius:14px; padding:28px; border:1px solid #2a3a4a;">
      <div style="font-size:13px; letter-spacing:.06em; color:#8fd694; text-transform:uppercase; margin-bottom:8px;">♣ Torrente On Line Series - TOLS 3.0</div>
      <h2 style="margin:0 0 12px; color:#fff;">Confirma tu correo</h2>
      <p style="margin:0 0 20px; color:#b6c2cd; font-size:14px;">
        Hola${nombre ? " " + nombre : ""}, este es tu código para completar tu registro en TOLS 3.0.
        Es válido por <strong>5 minutos</strong> — ingrésalo apenas lo veas.
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
