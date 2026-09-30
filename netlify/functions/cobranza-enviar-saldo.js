import { enviarCorreo, plantillaSaldoTorneo } from "./lib/resend.js";
import { marcarSaldoEnviado } from "./cobranza.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// 74ª entrega: dispara el correo de "Saldo Torneo" para UN jugador (el Tesorero puede llamarlo varias
// veces seguidas, una por jugador seleccionado, desde "Resultados de Torneos" en Cobranza). El asunto y
// el cuerpo los arma esta función servidor — a diferencia de "Estado de cuenta" (cobranza-enviar-
// estado.js), acá el Tesorero no redacta texto libre, solo elige jugadores y aprueba el envío; el
// contenido siempre sale de plantillaSaldoTorneo() con el mismo formato para todos.
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
  const campeonato = String(body?.campeonato || "").trim();
  const fecha = String(body?.fecha || "").trim();
  const torneoLabel = String(body?.torneoLabel || "").trim();
  const monto = Number(body?.monto);
  const numeroRegistro = body?.numeroRegistro;

  if (!correo || !campeonato || !fecha || !torneoLabel || !Number.isFinite(monto) || numeroRegistro === undefined || numeroRegistro === null) {
    return new Response(JSON.stringify({ error: "Faltan datos del jugador o del torneo para armar el correo." }), { status: 400, headers: HEADERS });
  }

  try {
    await enviarCorreo({
      to: correo,
      subject: `Saldo Torneo ${torneoLabel} - TOLS 3.0`,
      html: plantillaSaldoTorneo(nombre, torneoLabel, monto, numeroRegistro),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "No se pudo enviar el correo." }), { status: 502, headers: HEADERS });
  }

  const completa = await marcarSaldoEnviado(campeonato, fecha, correo);
  return new Response(JSON.stringify({ ok: true, enviosSaldo: completa.enviosSaldo }), { headers: HEADERS });
};

export const config = { path: "/api/cobranza-enviar-saldo" };
