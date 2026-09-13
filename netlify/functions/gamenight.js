import { getStore } from "@netlify/blobs";
import { syncGameNight } from "./lib/msgraph.js";
import { upsertVariosDesdeGameNight } from "./cobranza.js";
import { calcularAmonestado, tipoDeFecha, estadoTorneo } from "../../src/lib/gamenight.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

function normalizarJugadorGN(j) {
  return {
    nombre: String(j?.nombre || "").trim(),
    checkin: Boolean(j?.checkin),
    manual: Boolean(j?.manual),
    amonestado: Boolean(j?.amonestado),
    horaCheckin: String(j?.horaCheckin || "").trim(),
    buyIn: Boolean(j?.buyIn),
    rebuys: Math.max(0, Number(j?.rebuys) || 0),
    addon: Boolean(j?.addon),
    eliminadoPor: String(j?.eliminadoPor || "").trim().toLowerCase(),
    horaEliminacion: String(j?.horaEliminacion || "").trim(),
    mejorMano: Boolean(j?.mejorMano),
    actualizado: String(j?.actualizado || "").trim(),
  };
}

function normalizarTorneo(t) {
  const jugadores = {};
  for (const [correo, j] of Object.entries(t?.jugadores || {})) {
    jugadores[String(correo).trim().toLowerCase()] = normalizarJugadorGN(j);
  }
  return { horaInicio: String(t?.horaInicio || "").trim(), jugadores };
}

function normalizarMapa(raw) {
  const mapa = {};
  if (!raw || typeof raw !== "object") return mapa;
  for (const [campeonato, fechas] of Object.entries(raw)) {
    mapa[campeonato] = {};
    for (const [fecha, torneo] of Object.entries(fechas || {})) {
      mapa[campeonato][fecha] = normalizarTorneo(torneo);
    }
  }
  return mapa;
}

async function tableroMapaActual() {
  try {
    const store = getStore("tols-tablero");
    return (await store.get("data", { type: "json" })) || {};
  } catch (e) {
    return {};
  }
}

async function calendarioTorneos() {
  try {
    const store = getStore("tols-calendario");
    const data = await store.get("data", { type: "json" });
    return data?.torneos || [];
  } catch (e) {
    return [];
  }
}

function getTorneo(mapa, campeonato, fecha) {
  if (!mapa[campeonato]) mapa[campeonato] = {};
  if (!mapa[campeonato][fecha]) mapa[campeonato][fecha] = { horaInicio: "", jugadores: {} };
  return mapa[campeonato][fecha];
}

// refleja el torneo completo (todos sus jugadores) en Cobranza — se llama después de cualquier acción
// que pueda mover subtotales o posiciones, para que el Tesorero siempre vea lo mismo que se vivió en
// la mesa sin depender de que alguien copie datos a mano de un módulo a otro
async function espejarEnCobranza(campeonato, fecha, torneo, tableroMapa, tipo) {
  const estado = estadoTorneo({ jugadoresState: torneo.jugadores, tableroMapa, campeonato, tipo });
  // se espejan TODOS los jugadores que ya tuvieron alguna vez un registro en este torneo, no solo los
  // que siguen con check-in activo — así, si el Host quita un check-in por error, el movimiento que ya
  // se había reflejado en Cobranza también se pone en $0 en vez de quedarse con el valor viejo
  const lista = Object.entries(estado.porJugador)
    .map(([correo, j]) => ({
      correo,
      nombre: j.nombre,
      buyInPagado: j.buyIn,
      rebuys: j.rebuys,
      addonComprado: j.addon,
      lugar: j.lugar,
      premioPartida: j.premioTotal,
    }));
  return upsertVariosDesdeGameNight(campeonato, fecha, lista);
}

export default async (req) => {
  const store = getStore("tols-gamenight");

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json" });
    const normalizado = normalizarMapa(raw);
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }

    const campeonato = String(body.campeonato || "").trim();
    const fecha = String(body.fecha || "").trim();
    if (!campeonato || !fecha) {
      return new Response(JSON.stringify({ error: "Falta el campeonato o la fecha del torneo." }), { status: 400, headers: HEADERS });
    }

    const raw = await store.get("data", { type: "json" });
    const mapa = normalizarMapa(raw);
    const torneo = getTorneo(mapa, campeonato, fecha);
    const ahora = new Date().toISOString();

    const [tableroMapa, torneosCal] = await Promise.all([tableroMapaActual(), calendarioTorneos()]);
    const tipo = tipoDeFecha(torneosCal, fecha);
    const toleranciaMin = tableroMapa?.[campeonato]?.toleranciaCheckinMin ?? 10;
    const recomprasMax = tableroMapa?.[campeonato]?.recomprasMax ?? 0;

    let avisoAmonestacion = "";

    if (body.accion === "iniciar") {
      if (!torneo.horaInicio) torneo.horaInicio = ahora;
    } else if (body.accion === "checkin") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!correo) return new Response(JSON.stringify({ error: "Falta el correo del jugador." }), { status: 400, headers: HEADERS });
      const manual = Boolean(body.manual);
      const amonestado = calcularAmonestado({ manual, horaInicio: torneo.horaInicio, toleranciaMin });
      torneo.jugadores[correo] = normalizarJugadorGN({
        ...torneo.jugadores[correo],
        nombre: body.nombre || torneo.jugadores[correo]?.nombre || "",
        checkin: true,
        manual,
        amonestado,
        horaCheckin: ahora,
        buyIn: true,
        actualizado: ahora,
      });
      if (amonestado) avisoAmonestacion = "Se activó con amonestación: perdió el punto de asistencia por hacer check-in manual fuera del tiempo de tolerancia.";
    } else if (body.accion === "quitarCheckin") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (torneo.jugadores[correo]) {
        torneo.jugadores[correo] = normalizarJugadorGN({ nombre: torneo.jugadores[correo].nombre, actualizado: ahora });
      }
    } else if (body.accion === "buyin") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!torneo.jugadores[correo]) return new Response(JSON.stringify({ error: "Ese jugador no tiene check-in." }), { status: 400, headers: HEADERS });
      torneo.jugadores[correo] = { ...torneo.jugadores[correo], buyIn: Boolean(body.valor), actualizado: ahora };
    } else if (body.accion === "rebuy") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!torneo.jugadores[correo]) return new Response(JSON.stringify({ error: "Ese jugador no tiene check-in." }), { status: 400, headers: HEADERS });
      const actual = torneo.jugadores[correo].rebuys || 0;
      const nuevo = Math.max(0, Math.min(recomprasMax, actual + (Number(body.delta) || 0)));
      torneo.jugadores[correo] = { ...torneo.jugadores[correo], rebuys: nuevo, actualizado: ahora };
    } else if (body.accion === "addon") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!torneo.jugadores[correo]) return new Response(JSON.stringify({ error: "Ese jugador no tiene check-in." }), { status: 400, headers: HEADERS });
      torneo.jugadores[correo] = { ...torneo.jugadores[correo], addon: Boolean(body.valor), actualizado: ahora };
    } else if (body.accion === "killer") {
      const victima = String(body.victima || "").trim().toLowerCase();
      const verdugo = String(body.verdugo || "").trim().toLowerCase();
      if (!torneo.jugadores[victima]) return new Response(JSON.stringify({ error: "Ese jugador no tiene check-in." }), { status: 400, headers: HEADERS });
      if (victima === verdugo) return new Response(JSON.stringify({ error: "Un jugador no puede eliminarse a sí mismo." }), { status: 400, headers: HEADERS });
      torneo.jugadores[victima] = { ...torneo.jugadores[victima], eliminadoPor: verdugo, horaEliminacion: ahora, actualizado: ahora };
    } else if (body.accion === "quitarKiller") {
      const victima = String(body.victima || "").trim().toLowerCase();
      if (torneo.jugadores[victima]) {
        torneo.jugadores[victima] = { ...torneo.jugadores[victima], eliminadoPor: "", horaEliminacion: "", actualizado: ahora };
      }
    } else if (body.accion === "mejorMano") {
      const correo = String(body.correo || "").trim().toLowerCase();
      const valor = Boolean(body.valor);
      for (const c of Object.keys(torneo.jugadores)) {
        if (valor && c === correo) torneo.jugadores[c] = { ...torneo.jugadores[c], mejorMano: true, actualizado: ahora };
        else if (torneo.jugadores[c].mejorMano) torneo.jugadores[c] = { ...torneo.jugadores[c], mejorMano: false, actualizado: ahora };
      }
    } else {
      return new Response(JSON.stringify({ error: "Acción no reconocida." }), { status: 400, headers: HEADERS });
    }

    await store.setJSON("data", mapa);
    await syncGameNight(mapa);
    // el reflejo en Cobranza se guarda con su propio store/sync — si por lo que sea falla, no debe
    // tumbar la respuesta de Game Night (el Host ya vio su cambio aplicado en el tablero)
    try {
      await espejarEnCobranza(campeonato, fecha, torneo, tableroMapa, tipo);
    } catch (e) {
      console.error("[gamenight] no se pudo espejar en Cobranza:", e.message || e);
    }

    return new Response(JSON.stringify({ ...mapa, avisoAmonestacion }), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/gamenight" };
