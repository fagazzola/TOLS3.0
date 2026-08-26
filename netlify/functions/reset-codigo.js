import { getStore } from "@netlify/blobs";
import { normalizar as normalizarPerfiles } from "./perfiles.js";
import { enviarCorreo, plantillaReset } from "./lib/resend.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const DURACION_MS = 5 * 60 * 1000; // 5 minutos — más holgado que el de alta porque aquí no se pidió un límite específico

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
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return new Response(JSON.stringify({ error: "Correo electrónico inválido." }), { status: 400, headers: HEADERS });
  }

  const perfilesStore = getStore("tols-perfiles");
  const raw = await perfilesStore.get("data", { type: "json" });
  const data = normalizarPerfiles(raw);
  const usuario = data.usuarios.find((u) => String(u.correo || "").trim().toLowerCase() === correo);

  if (!usuario) {
    return new Response(JSON.stringify({ error: "No encontramos una cuenta con ese correo en TOLS 3.0." }), { status: 404, headers: HEADERS });
  }

  const codigo = generarCodigo();
  const verifStore = getStore("tols-verificacion-reset");
  await verifStore.setJSON(correo, { codigo, expira: Date.now() + DURACION_MS });

  try {
    await enviarCorreo({
      to: correo,
      subject: "Recupera tu contraseña — TOLS 3.0",
      html: plantillaReset(codigo, usuario.nombre),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo enviar el correo: " + (e.message || e) }), { status: 500, headers: HEADERS });
  }

  return new Response(JSON.stringify({ ok: true, expiraEn: DURACION_MS }), { headers: HEADERS });
};

export const config = { path: "/api/reset-codigo" };
