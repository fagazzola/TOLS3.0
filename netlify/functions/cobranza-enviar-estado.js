import { enviarCorreo, plantillaEstadoCuenta } from "./lib/resend.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// el Tesorero ya vio y editó el borrador en pantalla (asunto + cuerpo) — este endpoint solo envía lo
// que ya fue aprobado en la UI, nunca genera ni decide el contenido por su cuenta
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
  const asunto = String(body?.asunto || "").trim();
  const cuerpo = String(body?.cuerpo || "").trim();
  if (!correo || !asunto || !cuerpo) {
    return new Response(JSON.stringify({ error: "Faltan correo, asunto o cuerpo del mensaje." }), { status: 400, headers: HEADERS });
  }
  try {
    await enviarCorreo({ to: correo, subject: asunto, html: plantillaEstadoCuenta(asunto, cuerpo) });
    return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "No se pudo enviar el correo." }), { status: 502, headers: HEADERS });
  }
};

export const config = { path: "/api/cobranza-enviar-estado" };
