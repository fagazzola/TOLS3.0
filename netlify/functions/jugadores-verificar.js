import { getStore } from "@netlify/blobs";
import jugadoresSeed from "../../src/data/jugadores.json";
import { normalizar as normalizarPerfiles, validar as validarPerfiles } from "./perfiles.js";
import { syncJugadores, syncPerfiles } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const EMOTICONES = ["🃏", "♠️", "♣️", "♥️", "♦️", "🎲", "🍺", "🥃", "🍕", "🌮", "🔥", "💰"];

function calcularEdad(fecNac) {
  const nac = new Date(fecNac + "T00:00:00");
  if (Number.isNaN(nac.getTime())) return 0;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return Math.max(0, edad);
}

function validarDatos(d) {
  if (!d.nombre || d.nombre.trim().length < 3) return "El nombre y apellido es obligatorio.";
  if (!d.aliasJugador || !d.aliasJugador.trim()) return "El alias del jugador es obligatorio.";
  if (!d.aliasPokerStars || !d.aliasPokerStars.trim()) return "El alias de PokerStars es obligatorio.";
  if (!/^\d{10}$/.test(String(d.telefono || "").trim())) return "El teléfono debe tener 10 dígitos.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.correo || "").trim())) return "El correo electrónico no es válido.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecNac || "").trim())) return "La fecha de nacimiento no es válida.";
  if (!d.password || d.password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  if (!d.emoticon || !EMOTICONES.includes(d.emoticon)) return "Elige un emoticón de la lista.";
  return null;
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
  const codigo = String(body?.codigo || "").trim();

  if (!correo || !codigo) {
    return new Response(JSON.stringify({ error: "Falta el correo o el código." }), { status: 400, headers: HEADERS });
  }

  const verifStore = getStore("tols-verificacion-jugadores");
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

  const problema = validarDatos(body);
  if (problema) {
    return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
  }

  // -- crea el jugador en tols-jugadores --
  const jugadoresStore = getStore("tols-jugadores");
  const dataJugadores = (await jugadoresStore.get("data", { type: "json" })) || jugadoresSeed;
  const lista = Array.isArray(dataJugadores.jugadores) ? dataJugadores.jugadores : [];

  if (lista.some((j) => String(j.correo || "").toLowerCase() === correo)) {
    return new Response(JSON.stringify({ error: "Ese correo ya está registrado como jugador." }), { status: 400, headers: HEADERS });
  }

  const nuevoId = lista.reduce((max, j) => Math.max(max, Number(j.id) || 0), 0) + 1;
  const nuevoJugador = {
    id: nuevoId,
    nombre: String(body.nombre).trim(),
    aliasJugador: String(body.aliasJugador).trim(),
    aliasPokerStars: String(body.aliasPokerStars).trim(),
    padrino: "",
    telefono: String(body.telefono).trim(),
    correo,
    tipoUsuario: "Jugador",
    fecNac: String(body.fecNac).trim(),
    edad: calcularEdad(body.fecNac),
    emoticon: body.emoticon,
    fechaRegistro: new Date().toISOString().slice(0, 10),
    estatus: "Activo",
  };
  lista.push(nuevoJugador);
  await jugadoresStore.setJSON("data", { jugadores: lista });
  await syncJugadores(lista);

  // -- crea el usuario ligado en tols-perfiles, reutilizando las mismas reglas que Perfiles.jsx --
  const perfilesStore = getStore("tols-perfiles");
  const rawPerfiles = await perfilesStore.get("data", { type: "json" });
  const dataPerfiles = normalizarPerfiles(rawPerfiles);

  if (dataPerfiles.usuarios.some((u) => String(u.correo || "").toLowerCase() === correo)) {
    return new Response(JSON.stringify({ error: "Ese correo ya tiene una cuenta en TOLS 3.0." }), { status: 400, headers: HEADERS });
  }

  dataPerfiles.usuarios.push({
    nombre: nuevoJugador.nombre,
    usuario: correo,
    correo,
    password: String(body.password),
    rol: "Jugador",
  });

  const problemaPerfiles = validarPerfiles(dataPerfiles);
  if (problemaPerfiles) {
    return new Response(JSON.stringify({ error: "No se pudo crear tu cuenta: " + problemaPerfiles }), { status: 500, headers: HEADERS });
  }
  await perfilesStore.setJSON("data", dataPerfiles);
  await syncPerfiles(dataPerfiles);

  await verifStore.delete(correo);

  return new Response(
    JSON.stringify({ ok: true, session: { usuario: correo, nombre: nuevoJugador.nombre, rol: "Jugador" } }),
    { headers: HEADERS }
  );
};

export const config = { path: "/api/jugadores-verificar" };
