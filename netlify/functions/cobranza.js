import { getStore } from "@netlify/blobs";
import seed from "../../src/data/cobranza.json";
import { syncCobranza } from "./lib/msgraph.js";
import { conMontos, resumenPorJugador, tieneAdeudoBloqueante } from "../../src/lib/cobranza.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

function normalizarJugador(j) {
  return {
    nombre: String(j?.nombre || "").trim(),
    cuenta: String(j?.cuenta || "").trim(),
    banco: String(j?.banco || "").trim(),
    tipoCuenta: String(j?.tipoCuenta || "").trim(),
    excepciones: Array.isArray(j?.excepciones) ? j.excepciones.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)) : [],
  };
}

function normalizarMovimiento(m) {
  return {
    id: String(m?.id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campeonato: String(m?.campeonato || "").trim(),
    fecha: String(m?.fecha || "").trim(),
    correo: String(m?.correo || "").trim().toLowerCase(),
    buyInPagado: Boolean(m?.buyInPagado),
    rebuys: Math.max(0, Number(m?.rebuys) || 0),
    addonComprado: Boolean(m?.addonComprado),
    pagado: Boolean(m?.pagado),
    fechaPago: String(m?.fechaPago || "").trim(),
    lugar: m?.lugar === "" || m?.lugar === null || m?.lugar === undefined ? null : Number(m.lugar) || null,
    premioPartida: Math.max(0, Number(m?.premioPartida) || 0),
    premioCampeonato: Math.max(0, Number(m?.premioCampeonato) || 0),
  };
}

function normalizar(data) {
  const base = data && typeof data === "object" ? data : {};
  const jugadores = {};
  for (const [correo, j] of Object.entries(base.jugadores || (Array.isArray(seed.jugadores) ? {} : seed.jugadores) || {})) {
    jugadores[String(correo).trim().toLowerCase()] = normalizarJugador(j);
  }
  const movimientos = (Array.isArray(base.movimientos) ? base.movimientos : seed.movimientos || []).map(normalizarMovimiento);
  return { jugadores, movimientos };
}

// próxima fecha (hoy o después) del campeonato activo — mismo criterio que usa Jugadores.jsx para el
// Host, para que "próximo torneo" signifique lo mismo en toda la app
async function proximaFechaActiva() {
  try {
    const [calStore, campStore] = [getStore("tols-calendario"), getStore("tols-campeonatos")];
    const [cal, camp] = await Promise.all([
      calStore.get("data", { type: "json" }),
      campStore.get("data", { type: "json" }),
    ]);
    const activo = camp?.activo || "";
    const hoy = new Date().toISOString().slice(0, 10);
    const torneos = (cal?.torneos || []).filter((t) => (activo ? t.temporada === activo : true) && t.fecha >= hoy);
    torneos.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    return { fecha: torneos[0]?.fecha || "", torneos: cal?.torneos || [] };
  } catch (e) {
    return { fecha: "", torneos: [] };
  }
}

async function tableroMapaActual() {
  try {
    const store = getStore("tols-tablero");
    return (await store.get("data", { type: "json" })) || {};
  } catch (e) {
    return {};
  }
}

// arma la respuesta completa que consume el frontend: datos crudos + todo ya calculado, para que
// Cobranza.jsx y Jugadores.jsx no tengan que reimplementar la lógica de cobranza.js
async function respuestaCompleta(data) {
  const [tableroMapa, { fecha: proximaFecha, torneos }] = await Promise.all([tableroMapaActual(), proximaFechaActiva()]);
  const movimientos = conMontos(data.movimientos, tableroMapa, torneos);
  const resumen = resumenPorJugador(movimientos, data.jugadores);
  const adeudos = {};
  for (const correo of Object.keys(resumen)) {
    adeudos[correo] = tieneAdeudoBloqueante(correo, movimientos, data.jugadores, proximaFecha);
  }
  return { jugadores: data.jugadores, movimientos, resumen, adeudos, proximaFecha };
}

function filasParaExcel({ movimientos, resumen }) {
  const resumenRows = Object.values(resumen)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((r) => [r.correo, r.nombre, r.cuenta, r.banco, r.tipoCuenta, r.pago, r.deposito, r.saldo]);
  const movimientoRows = [...movimientos]
    .sort((a, b) => (a.campeonato + a.fecha).localeCompare(b.campeonato + b.fecha))
    .map((m) => [
      m.campeonato, m.fecha, m.tipo, m.correo,
      m.buyInPagado ? "Sí" : "No", m.rebuys, m.addonComprado ? "Sí" : "No",
      m.montoBuyIn, m.montoRebuys, m.montoAddOn, m.montoTotal,
      m.pagado ? "Sí" : "No", m.fechaPago, m.lugar ?? "",
      m.premioPartida, m.premioCampeonato, m.balanceNeto,
    ]);
  return { resumenRows, movimientoRows };
}

// Punto de integración con Game Night (MOD 5): cada torneo en vivo llama a esto para reflejar en
// Cobranza, de una sola vez, el estado financiero de todos sus jugadores (buy-in, re-buys, add-on,
// lugar de salida y premio ganado) — un solo movimiento por jugador+torneo, identificado con el id
// estable `gn-{campeonato}-{fecha}-{correo}` para que actualizar el mismo torneo nunca duplique filas.
// Se hace en una sola lectura/escritura del store (no una por jugador) para no pisarse entre sí ni
// disparar una sincronización a Excel por cada jugador.
export async function upsertVariosDesdeGameNight(campeonato, fecha, lista) {
  const store = getStore("tols-cobranza");
  const raw = await store.get("data", { type: "json" });
  const actual = normalizar(raw);

  for (const it of lista || []) {
    const correo = String(it.correo || "").trim().toLowerCase();
    if (!correo) continue;
    if (!actual.jugadores[correo]) {
      actual.jugadores[correo] = normalizarJugador({ nombre: it.nombre || "" });
    } else if (!actual.jugadores[correo].nombre && it.nombre) {
      actual.jugadores[correo] = { ...actual.jugadores[correo], nombre: it.nombre };
    }
    const id = `gn-${campeonato}-${fecha}-${correo}`;
    const idx = actual.movimientos.findIndex((m) => m.id === id);
    const previo = idx === -1 ? {} : actual.movimientos[idx];
    const mov = normalizarMovimiento({
      ...previo,
      id,
      campeonato,
      fecha,
      correo,
      buyInPagado: it.buyInPagado,
      rebuys: it.rebuys,
      addonComprado: it.addonComprado,
      lugar: it.lugar,
      premioPartida: it.premioPartida,
    });
    if (idx === -1) actual.movimientos.push(mov);
    else actual.movimientos[idx] = mov;
  }

  await store.setJSON("data", actual);
  const completa = await respuestaCompleta(actual);
  await syncCobranza(filasParaExcel(completa));
  return completa;
}

// usada por campeonatos.js al renombrar un campeonato: remapea movimientos[].campeonato de "de" a "a".
// También renombra el id de los movimientos generados por Game Night (`gn-{campeonato}-{fecha}-{correo}`)
// para que sigan siendo el mismo registro la próxima vez que se guarde ese Game Night con el nombre nuevo
// — si no se renombrara el id, upsertVariosDesdeGameNight generaría un id distinto y duplicaría la fila.
export async function renombrarCampeonatoEnCobranza(de, a) {
  const store = getStore("tols-cobranza");
  const raw = await store.get("data", { type: "json" });
  const actual = normalizar(raw);
  const cambia = actual.movimientos.some((m) => m.campeonato === de);
  if (!cambia) return;
  const prefijoViejo = `gn-${de}-`;
  actual.movimientos = actual.movimientos.map((m) => {
    if (m.campeonato !== de) return m;
    const nuevoId = m.id.startsWith(prefijoViejo) ? `gn-${a}-${m.id.slice(prefijoViejo.length)}` : m.id;
    return { ...m, campeonato: a, id: nuevoId };
  });
  await store.setJSON("data", actual);
  const completa = await respuestaCompleta(actual);
  await syncCobranza(filasParaExcel(completa));
}

export default async (req) => {
  const store = getStore("tols-cobranza");

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json" });
    const normalizado = normalizar(raw);
    if (!raw) await store.setJSON("data", normalizado);
    const completa = await respuestaCompleta(normalizado);
    return new Response(JSON.stringify(completa), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }

    const raw = await store.get("data", { type: "json" });
    const actual = normalizar(raw);

    if (body?.accion === "guardarJugador") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!correo) return new Response(JSON.stringify({ error: "Falta el correo del jugador." }), { status: 400, headers: HEADERS });
      actual.jugadores[correo] = normalizarJugador({ ...actual.jugadores[correo], ...body });
    } else if (body?.accion === "guardarMovimiento") {
      const mov = normalizarMovimiento(body.movimiento);
      if (!mov.campeonato || !mov.fecha || !mov.correo) {
        return new Response(JSON.stringify({ error: "Faltan campeonato, fecha o correo del movimiento." }), { status: 400, headers: HEADERS });
      }
      const idx = actual.movimientos.findIndex((m) => m.id === mov.id);
      if (idx === -1) actual.movimientos.push(mov);
      else actual.movimientos[idx] = mov;
    } else if (body?.accion === "eliminarMovimiento") {
      actual.movimientos = actual.movimientos.filter((m) => m.id !== String(body.id));
    } else if (body?.accion === "excepcion") {
      const correo = String(body.correo || "").trim().toLowerCase();
      const fecha = String(body.fecha || "").trim();
      if (!correo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return new Response(JSON.stringify({ error: "Falta el correo o la fecha de la excepción." }), { status: 400, headers: HEADERS });
      }
      if (!actual.jugadores[correo]) actual.jugadores[correo] = normalizarJugador({});
      if (!actual.jugadores[correo].excepciones.includes(fecha)) {
        actual.jugadores[correo].excepciones = [...actual.jugadores[correo].excepciones, fecha];
      }
    } else if (body?.accion === "quitarExcepcion") {
      const correo = String(body.correo || "").trim().toLowerCase();
      const fecha = String(body.fecha || "").trim();
      if (actual.jugadores[correo]) {
        actual.jugadores[correo].excepciones = actual.jugadores[correo].excepciones.filter((f) => f !== fecha);
      }
    } else {
      return new Response(JSON.stringify({ error: "Acción no reconocida." }), { status: 400, headers: HEADERS });
    }

    await store.setJSON("data", actual);
    const completa = await respuestaCompleta(actual);
    await syncCobranza(filasParaExcel(completa));
    return new Response(JSON.stringify(completa), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/cobranza" };
