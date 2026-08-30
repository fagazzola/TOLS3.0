import { getStore } from "@netlify/blobs";
import seed from "../../src/data/jugadores.json";
import { syncJugadores } from "./lib/msgraph.js";
import { enviarCorreo, plantillaHost } from "./lib/resend.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// mismo patrón defensivo del resto de los stores: rellena campos faltantes en vez de tronar.
// host/hostFecha: el jugador asignado como Host del próximo Game Night (solo puede haber uno a la vez
// en toda la liga) y la fecha del torneo para el que quedó asignado — ver auto-expiración más abajo.
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
    host: Boolean(j?.host),
    hostFecha: String(j?.hostFecha || "").trim(),
  };
}

function normalizar(data) {
  const lista = Array.isArray(data?.jugadores) ? data.jugadores : Array.isArray(seed.jugadores) ? seed.jugadores : [];
  return { jugadores: lista.map(normalizarUno) };
}

// al terminar el torneo (la fecha para la que se asignó ya pasó) la marca de Host se desactiva sola —
// no hay un botón de "terminar torneo" en el sitio, así que esto se revisa cada vez que se leen los
// datos, comparando hostFecha contra la fecha de hoy (servidor)
function conHostExpirado(data) {
  const hoy = new Date().toISOString().slice(0, 10);
  let cambio = false;
  const jugadores = data.jugadores.map((j) => {
    if (j.host && j.hostFecha && j.hostFecha < hoy) {
      cambio = true;
      return { ...j, host: false, hostFecha: "" };
    }
    return j;
  });
  return { cambio, data: { jugadores } };
}

export default async (req) => {
  const store = getStore("tols-jugadores");

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json" });
    let normalizado = normalizar(raw);
    const { cambio, data: sinHostVencido } = conHostExpirado(normalizado);
    if (cambio) normalizado = sinHostVencido;
    if (!raw || cambio || JSON.stringify(raw) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
      if (cambio) await syncJugadores(normalizado.jugadores);
    }
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }

    const raw = await store.get("data", { type: "json" });
    let actual = normalizar(raw);
    const expirado = conHostExpirado(actual);
    if (expirado.cambio) actual = expirado.data;

    // accion "host": asigna (o quita) al Host del próximo Game Night. Solo puede haber uno a la vez en
    // toda la liga, así que asignar uno nuevo desasigna automáticamente al anterior. Al asignar se manda
    // un correo avisándole al jugador.
    if (body?.accion === "host") {
      const { id, host, fecha } = body;
      const idx = actual.jugadores.findIndex((j) => j.id === Number(id));
      if (idx === -1) {
        return new Response(JSON.stringify({ error: "No se encontró ese jugador." }), { status: 404, headers: HEADERS });
      }
      if (host) {
        actual.jugadores = actual.jugadores.map((j, i) => (i === idx ? { ...j, host: true, hostFecha: String(fecha || "").trim() } : { ...j, host: false, hostFecha: "" }));
      } else {
        actual.jugadores[idx] = { ...actual.jugadores[idx], host: false, hostFecha: "" };
      }
      await store.setJSON("data", actual);
      await syncJugadores(actual.jugadores);
      if (host) {
        const asignado = actual.jugadores[idx];
        try {
          await enviarCorreo({
            to: asignado.correo,
            subject: "Eres el Host del próximo Game Night — TOLS 3.0",
            html: plantillaHost(asignado.nombre, asignado.hostFecha),
          });
        } catch (e) {
          // el jugador ya quedó asignado como Host aunque el correo falle (ej. Resend en sandbox) —
          // se informa el problema pero no se revierte la asignación
          return new Response(JSON.stringify({ ...actual, avisoCorreo: "Se asignó el Host, pero no se pudo enviar el correo: " + (e.message || e) }), { headers: HEADERS });
        }
      }
      return new Response(JSON.stringify(actual), { headers: HEADERS });
    }

    // solo permite editar Padrino y Estatus de un jugador ya existente — el resto de los campos
    // quedan fijos porque el jugador los llenó él mismo al autorregistrarse
    const { id, padrino, estatus } = body || {};
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
