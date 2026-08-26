import { getStore } from "@netlify/blobs";
import { enviarCorreo, plantillaCodigo } from "./lib/resend.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const DURACION_MS = 30_000; // 30 segundos, tal como lo pidió Federico — es corto, hay que ingresarlo rápido

function generarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return new Response(JSON.stringify({ error: "Correo electrónico inválido." }), { status: 400, headers: HEADERS });
  }

  // evita mandar un código si ese correo ya está registrado (como usuario o como jugador)
  try {
    const perfilesStore = getStore("tols-perfiles");
    const perfiles = await perfilesStore.get("data", { type: "json" });
    const yaExiste = (perfiles?.usuarios || []).some((u) => String(u.correo || "").trim().toLowerCase() === correo);
    if (yaExiste) {
      return new Response(JSON.stringify({ error: "Ese correo ya tiene una cuenta en TOLS 3.0." }), { status: 400, headers: HEADERS });
    }
  } catch (e) {
    // si el store de perfiles no responde, se sigue igual — la verificación final vuelve a checar
  }

  const codigo = generarCodigo();
  const verifStore = getStore("tols-verificacion-jugadores");
  await verifStore.setJSON(correo, { codigo, expira: Date.now() + DURACION_MS });

  try {
    await enviarCorreo({
      to: correo,
      subject: "Tu código de verificación — TOLS 3.0",
      html: plantillaCodigo(codigo, nombre),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo enviar el correo: " + (e.message || e) }), { status: 500, headers: HEADERS });
  }

  return new Response(JSON.stringify({ ok: true, expiraEn: DURACION_MS }), { headers: HEADERS });
};

export const config = { path: "/api/jugadores-codigo" };
