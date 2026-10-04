import { enviarCorreo, plantillaSolicitarDatosCuenta } from "./lib/resend.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// 89ª entrega: dispara el correo "Nos faltan tus datos de cuenta para depositarte" para UN jugador,
// desde "Registrar pagos y depósitos" (Cobranza), cuando el Tesorero va a hacer un Depósito y los datos
// de cuenta de cobro del jugador (tipo de cuenta/cuenta/banco) todavía están incompletos. A diferencia de
// "Saldo Torneo" (cobranza-enviar-saldo.js), este correo no persiste ningún estado de "ya se envió" — el
// Tesorero puede volver a mandarlo cuantas veces haga falta mientras el jugador no complete sus datos.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
  }
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
  }

  const correo = String(body?.correo || "").trim().toLowerCase();
  const nombre = String(body?.nombre || "").trim();

  if (!correo) {
    return new Response(JSON.stringify({ error: "Falta el correo del jugador." }), { status: 400, headers: HEADERS });
  }

  try {
    await enviarCorreo({
      to: correo,
      subject: "Nos faltan tus datos de cuenta - TOLS 3.0",
      html: plantillaSolicitarDatosCuenta(nombre),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "No se pudo enviar el correo." }), { status: 502, headers: HEADERS });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
};

export const config = { path: "/api/cobranza-enviar-datoscuenta" };
