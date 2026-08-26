import { getStore } from "@netlify/blobs";
import { normalizar as normalizarPerfiles, validar as validarPerfiles } from "./perfiles.js";
import { syncPerfiles } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

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
  const codigo = String(body?.codigo || "").trim();
  const nuevaPassword = String(body?.nuevaPassword || "");

  if (!correo || !codigo) {
    return new Response(JSON.stringify({ error: "Falta el correo o el código." }), { status: 400, headers: HEADERS });
  }
  if (nuevaPassword.length < 6) {
    return new Response(JSON.stringify({ error: "La nueva contraseña debe tener al menos 6 caracteres." }), { status: 400, headers: HEADERS });
  }

  const verifStore = getStore("tols-verificacion-reset");
  const registro = await verifStore.get(correo, { type: "json" });

  if (!registro) {
    return new Response(JSON.stringify({ error: "No hay un código pendiente para ese correo. Solicita uno nuevo." }), { status: 400, headers: HEADERS });
  }
  if (Date.now() > registro.expira) {
    return new Response(JSON.stringify({ error: "El código expiró. Solicita uno nuevo.", expirado: true }), { status: 400, headers: HEADERS });
  }
  if (registro.codigo !== codigo) {
    return new Response(JSON.stringify({ error: "El código no coincide.", incorrecto: true }), { status: 400, headers: HEADERS });
  }

  const perfilesStore = getStore("tols-perfiles");
  const raw = await perfilesStore.get("data", { type: "json" });
  const data = normalizarPerfiles(raw);
  const idx = data.usuarios.findIndex((u) => String(u.correo || "").trim().toLowerCase() === correo);

  if (idx === -1) {
    return new Response(JSON.stringify({ error: "No encontramos una cuenta con ese correo en TOLS 3.0." }), { status: 404, headers: HEADERS });
  }

  data.usuarios[idx].password = nuevaPassword;
  const problema = validarPerfiles(data);
  if (problema) {
    return new Response(JSON.stringify({ error: "No se pudo actualizar la contraseña: " + problema }), { status: 500, headers: HEADERS });
  }
  await perfilesStore.setJSON("data", data);
  await syncPerfiles(data);
  await verifStore.delete(correo);

  const usuario = data.usuarios[idx];
  return new Response(
    JSON.stringify({ ok: true, session: { usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol } }),
    { headers: HEADERS }
  );
};

export const config = { path: "/api/reset-confirmar" };
