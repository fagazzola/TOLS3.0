import { getStore } from "@netlify/blobs";
import seed from "../../src/data/jugadores.json";
import { syncJugadores } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// mismo patrón defensivo del resto de los stores: rellena campos faltantes en vez de tronar
function normalizarUno(j) {
  return {
    id: Number(j?.id) || 0,
    nombre: String(j?.nombre || "").trim(),
    aliasJugador: String(j?.aliasJugador || "").trim(),
    aliasPokerStars: String(j?.aliasPokerStars || "").trim(),
    padrino: String(j?.padrino || "").trim(),
    telefono: String(j?.telefono || "").trim(),
    correo: String(j?.correo || "").trim().toLowerCase(),
    tipoUsuario: String(j?.tipoUsuario || "Jugador").trim(),
    fecNac: String(j?.fecNac || "").trim(),
    edad: Number(j?.edad) || 0,
    emoticon: String(j?.emoticon || "🎲"),
    fechaRegistro: String(j?.fechaRegistro || "").trim(),
    estatus: String(j?.estatus || "Activo").trim(),
  };
}

function normalizar(data) {
  const lista = Array.isArray(data?.jugadores) ? data.jugadores : Array.isArray(seed.jugadores) ? seed.jugadores : [];
  return { jugadores: lista.map(normalizarUno) };
}

export default async (req) => {
  const store = getStore("tols-jugadores");

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json" });
    const normalizado = normalizar(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
    }
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  // solo permite editar Padrino y Estatus de un jugador ya existente — el resto de los campos
  // quedan fijos porque el jugador los llenó él mismo al autorregistrarse
  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }
    const { id, padrino, estatus } = body || {};
    const raw = await store.get("data", { type: "json" });
    const actual = normalizar(raw);
    const idx = actual.jugadores.findIndex((j) => j.id === Number(id));
    if (idx === -1) {
      return new Response(JSON.stringify({ error: "No se encontró ese jugador." }), { status: 404, headers: HEADERS });
    }
    if (padrino !== undefined) actual.jugadores[idx].padrino = String(padrino || "").trim();
    if (estatus !== undefined) actual.jugadores[idx].estatus = String(estatus || "Activo").trim();
    await store.setJSON("data", actual);
    await syncJugadores(actual.jugadores);
    return new Response(JSON.stringify(actual), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/jugadores" };
