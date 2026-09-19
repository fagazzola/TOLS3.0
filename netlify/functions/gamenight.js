import { getStore } from "@netlify/blobs";
import { syncGameNight } from "./lib/msgraph.js";
import { upsertVariosDesdeGameNight } from "./cobranza.js";
import { tipoDeFecha, estadoTorneo, PRACTICA_CAMPEONATO, horaInicioProgramada, torneoCalendarioDe, recomprasMaxEfectivo } from "../../src/lib/gamenight.js";

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
  const ordenEliminados = Array.isArray(t?.ordenEliminados)
    ? t.ordenEliminados.map((c) => String(c || "").trim().toLowerCase()).filter(Boolean)
    : [];
  return { horaInicio: String(t?.horaInicio || "").trim(), jugadores, ordenEliminados };
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
    const store = getStore({ name: "tols-tablero", consistency: "strong" });
    return (await store.get("data", { type: "json", consistency: "strong" })) || {};
  } catch (e) {
    return {};
  }
}

async function calendarioTorneos() {
  try {
    const store = getStore({ name: "tols-calendario", consistency: "strong" });
    const data = await store.get("data", { type: "json", consistency: "strong" });
    return data?.torneos || [];
  } catch (e) {
    return [];
  }
}

function getTorneo(mapa, campeonato, fecha) {
  if (!mapa[campeonato]) mapa[campeonato] = {};
  if (!mapa[campeonato][fecha]) mapa[campeonato][fecha] = { horaInicio: "", jugadores: {}, ordenEliminados: [] };
  return mapa[campeonato][fecha];
}

// refleja el torneo completo (todos sus jugadores) en Cobranza — se llama después de cualquier acción
// que pueda mover subtotales o posiciones, para que el Tesorero siempre vea lo mismo que se vivió en
// la mesa sin depender de que alguien copie datos a mano de un módulo a otro
async function espejarEnCobranza(campeonato, fecha, torneo, tableroMapa, tipo) {
  const estado = estadoTorneo({ jugadoresState: torneo.jugadores, tableroMapa, campeonato, tipo, ordenEliminados: torneo.ordenEliminados });
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

// usada por campeonatos.js al renombrar un campeonato: mueve la clave del mapa de "de" a "a" —
// tols-gamenight está indexado como { [campeonato]: { [fecha]: {...} } }.
export async function renombrarCampeonatoEnGameNight(de, a) {
  const store = getStore({ name: "tols-gamenight", consistency: "strong" });
  const raw = await store.get("data", { type: "json", consistency: "strong" });
  const mapa = normalizarMapa(raw);
  if (!mapa[de]) return;
  if (mapa[a]) {
    // ya había datos bajo el nombre nuevo (caso raro) — se fusionan por fecha en vez de perder alguno
    mapa[a] = { ...mapa[de], ...mapa[a] };
  } else {
    mapa[a] = mapa[de];
  }
  delete mapa[de];
  await store.setJSON("data", mapa);
  await syncGameNight(mapa);
}

export default async (req) => {
  const store = getStore({ name: "tols-gamenight", consistency: "strong" });

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json", consistency: "strong" });
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

    const raw = await store.get("data", { type: "json", consistency: "strong" });
    const mapa = normalizarMapa(raw);
    const torneo = getTorneo(mapa, campeonato, fecha);
    const ahora = new Date().toISOString();

    const [tableroMapa, torneosCal] = await Promise.all([tableroMapaActual(), calendarioTorneos()]);
    const tipo = tipoDeFecha(torneosCal, fecha);
    // 48ª entrega: la tolerancia de check-in ya solo se usa para mostrarle un mensaje informativo al
    // Host (se calcula y se manda en `avisoTolerancia`) — ya no amonesta a nadie automáticamente.
    const toleranciaMin = tableroMapa?.[campeonato]?.toleranciaCheckinMin ?? 10;
    const recomprasMax = recomprasMaxEfectivo(tableroMapa, campeonato);

    // 45ª entrega: ya no existe un botón "Iniciar torneo" — la hora de inicio para medir la tolerancia
    // de check-in sale directo de la fecha/hora que ya está guardada en el Calendario para este torneo
    // (se recalcula en cada acción, así que si Federico corrige la hora en el Calendario después, el
    // cambio se refleja solo). Se sigue guardando en `torneo.horaInicio` únicamente para mostrarla y
    // para el histórico que se sincroniza a `GameNight_Sesiones` en Excel.
    const torneoCalActual = torneoCalendarioDe(torneosCal, campeonato, fecha);
    const horaInicio = horaInicioProgramada(torneoCalActual);
    if (horaInicio) torneo.horaInicio = horaInicio;

    let avisoAmonestacion = "";

    if (body.accion === "checkin") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!correo) return new Response(JSON.stringify({ error: "Falta el correo del jugador." }), { status: 400, headers: HEADERS });
      const manual = Boolean(body.manual);
      // 48ª entrega: la activación ya NO amonesta sola por pasarse del tiempo de tolerancia — Federico
      // pidió que el tiempo sea "simplemente ilustrativo". El Host decide a mano con la acción
      // "amonestar" si corresponde o no. Se conserva el valor de amonestado que ya tuviera el jugador
      // (por si el Host ya lo había marcado antes de quitarle el check-in por error).
      torneo.jugadores[correo] = normalizarJugadorGN({
        ...torneo.jugadores[correo],
        nombre: body.nombre || torneo.jugadores[correo]?.nombre || "",
        checkin: true,
        manual,
        horaCheckin: ahora,
        buyIn: true,
        actualizado: ahora,
      });
    } else if (body.accion === "checkinMasivo") {
      // activación manual de varios jugadores al mismo tiempo (45ª entrega) — sin amonestación
      // automática (48ª entrega), igual que la activación individual.
      const lista = Array.isArray(body.jugadores) ? body.jugadores : [];
      if (!lista.length) return new Response(JSON.stringify({ error: "No se seleccionó ningún jugador." }), { status: 400, headers: HEADERS });
      for (const j of lista) {
        const correo = String(j?.correo || "").trim().toLowerCase();
        if (!correo) continue;
        torneo.jugadores[correo] = normalizarJugadorGN({
          ...torneo.jugadores[correo],
          nombre: j.nombre || torneo.jugadores[correo]?.nombre || "",
          checkin: true,
          manual: true,
          horaCheckin: ahora,
          buyIn: true,
          actualizado: ahora,
        });
      }
    } else if (body.accion === "amonestar") {
      // 48ª entrega: toggle manual del Host — reemplaza el cálculo automático por tolerancia.
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!torneo.jugadores[correo]) return new Response(JSON.stringify({ error: "Ese jugador no tiene check-in." }), { status: 400, headers: HEADERS });
      torneo.jugadores[correo] = { ...torneo.jugadores[correo], amonestado: Boolean(body.valor), actualizado: ahora };
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
      if (!torneo.ordenEliminados.includes(victima)) torneo.ordenEliminados.push(victima);
    } else if (body.accion === "quitarKiller") {
      const victima = String(body.victima || "").trim().toLowerCase();
      if (torneo.jugadores[victima]) {
        torneo.jugadores[victima] = { ...torneo.jugadores[victima], eliminadoPor: "", horaEliminacion: "", actualizado: ahora };
      }
      torneo.ordenEliminados = torneo.ordenEliminados.filter((c) => c !== victima);
    } else if (body.accion === "moverLugar") {
      // 48ª entrega: el Host puede corregir a mano el lugar de salida de un jugador ya eliminado —
      // por experiencia, el orden real de la mesa a veces no coincide con la hora exacta registrada de
      // cada eliminación, y el lugar de salida sí afecta premios. Al mover uno, los demás se reajustan
      // solos porque el lugar de TODOS sale de su índice en `ordenEliminados` (ver src/lib/gamenight.js).
      const correo = String(body.correo || "").trim().toLowerCase();
      const nuevoLugar = Number(body.lugar);
      if (!torneo.jugadores[correo]) return new Response(JSON.stringify({ error: "Ese jugador no tiene check-in." }), { status: 400, headers: HEADERS });
      if (!torneo.ordenEliminados.includes(correo)) {
        return new Response(JSON.stringify({ error: "Ese jugador no ha sido eliminado todavía." }), { status: 400, headers: HEADERS });
      }
      const totalHabilitados = Object.values(torneo.jugadores).filter((j) => j.checkin).length;
      // lugar = total - índice → índice = total - lugar. El campeón (lugar 1) no vive en este arreglo.
      const nuevoIndice = totalHabilitados - nuevoLugar;
      if (!Number.isFinite(nuevoIndice) || nuevoIndice < 0 || nuevoIndice >= torneo.ordenEliminados.length) {
        return new Response(JSON.stringify({ error: "Ese lugar no es válido para este torneo." }), { status: 400, headers: HEADERS });
      }
      torneo.ordenEliminados = torneo.ordenEliminados.filter((c) => c !== correo);
      torneo.ordenEliminados.splice(nuevoIndice, 0, correo);
      torneo.jugadores[correo] = { ...torneo.jugadores[correo], actualizado: ahora };
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
    // tumbar la respuesta de Game Night (el Host ya vio su cambio aplicado en el tablero). Las
    // partidas de práctica (43ª entrega) NUNCA se reflejan en Cobranza: no pertenecen a ningún
    // campeonato real, así que no deben generar movimientos de cobro ni premio.
    if (campeonato !== PRACTICA_CAMPEONATO) {
      try {
        await espejarEnCobranza(campeonato, fecha, torneo, tableroMapa, tipo);
      } catch (e) {
        console.error("[gamenight] no se pudo espejar en Cobranza:", e.message || e);
      }
    }

    return new Response(JSON.stringify({ ...mapa, avisoAmonestacion }), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/gamenight" };
