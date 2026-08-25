import { getStore } from "@netlify/blobs";
import seed from "../../src/data/tablero.json";
import { syncTablero } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const TOL = 0.01; // tolerancia para sumas de porcentaje por redondeo flotante

// ids antiguos que cambiaron de nombre entre versiones del esquema — se renombran en vez de
// duplicarse cuando más abajo se asegura que los conceptos protegidos existan
const RENOMBRAR_ID_COBRO = { "addon-1": "addon" };

const PLANTILLA = Object.values(seed)[0];

function sumPct(lugares) {
  return lugares.reduce((a, l) => a + Number(l.pct || 0), 0);
}

// completa/corrige los datos de UN campeonato (no el mapa completo) con la plantilla como respaldo
function normalizarUno(datos, plantilla) {
  const base = plantilla || PLANTILLA;
  const d = datos && typeof datos === "object" ? { ...datos } : {};
  d.premios = d.premios || base.premios;
  d.premios.porTorneo = d.premios.porTorneo || base.premios.porTorneo;
  d.premios.porCampeonato = d.premios.porCampeonato || base.premios.porCampeonato;
  d.puntos = d.puntos || base.puntos;
  d.puntos.asistencia = d.puntos.asistencia || base.puntos.asistencia;
  d.puntos.posiciones = Array.isArray(d.puntos.posiciones) ? d.puntos.posiciones : base.puntos.posiciones;
  if (typeof d.recomprasMax !== "number") d.recomprasMax = base.recomprasMax;
  if (typeof d.cuotaInscripcion !== "number") d.cuotaInscripcion = base.cuotaInscripcion;
  d.gastosCampeonato = Array.isArray(d.gastosCampeonato) ? d.gastosCampeonato : base.gastosCampeonato;
  d.cobrosPorTorneo = Array.isArray(d.cobrosPorTorneo) ? d.cobrosPorTorneo : base.cobrosPorTorneo;
  d.pagosPorTorneo = Array.isArray(d.pagosPorTorneo) ? d.pagosPorTorneo : base.pagosPorTorneo;

  d.cobrosPorTorneo = d.cobrosPorTorneo.map((c) => (RENOMBRAR_ID_COBRO[c.id] ? { ...c, id: RENOMBRAR_ID_COBRO[c.id] } : c));
  const idsVistos = new Set();
  d.cobrosPorTorneo = d.cobrosPorTorneo.filter((c) => {
    if (idsVistos.has(c.id)) return false;
    idsVistos.add(c.id);
    return true;
  });
  for (const req of (base.cobrosPorTorneo || []).filter((c) => c.protegido)) {
    const existente = d.cobrosPorTorneo.find((c) => c.id === req.id);
    if (!existente) d.cobrosPorTorneo.push({ ...req });
    else existente.protegido = true;
  }
  delete d.nombreCampeonato; // campo del esquema anterior (ahora el nombre es la llave del mapa)
  return d;
}

// completa/corrige el mapa completo { [campeonato]: datos }. Migra el esquema plano de versiones
// anteriores (un solo campeonato con "nombreCampeonato" y los campos al nivel raíz) envolviéndolo
// bajo su propio nombre como llave — así los datos ya guardados en Blobs no se pierden.
function normalizarMapa(raw) {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(seed);
  if (raw.premios || raw.nombreCampeonato) {
    const nombre = raw.nombreCampeonato && String(raw.nombreCampeonato).trim() ? String(raw.nombreCampeonato).trim() : Object.keys(seed)[0];
    return { [nombre]: normalizarUno(raw, PLANTILLA) };
  }
  const mapa = {};
  for (const [nombre, datos] of Object.entries(raw)) {
    mapa[nombre] = normalizarUno(datos, PLANTILLA);
  }
  if (Object.keys(mapa).length === 0) return structuredCloneSafe(seed);
  return mapa;
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function validarUno(data) {
  const pt = data.premios?.porTorneo;
  if (!pt || !Array.isArray(pt.lugares) || pt.lugares.length < 1 || pt.lugares.length > 10) {
    return "Premios por torneo: debe haber entre 1 y 10 lugares.";
  }
  if (typeof pt.pctAcumulado !== "number" || pt.pctAcumulado < 0 || pt.pctAcumulado > 100) {
    return "Premios por torneo: el % al acumulado debe estar entre 0 y 100.";
  }
  if (Math.abs(sumPct(pt.lugares) - 100) > TOL) {
    return "Premios por torneo: los lugares deben sumar 100%.";
  }

  const pc = data.premios?.porCampeonato;
  if (!pc || !Array.isArray(pc.lugares) || pc.lugares.length < 1 || pc.lugares.length > 10) {
    return "Premios por campeonato: debe haber entre 1 y 10 lugares.";
  }
  const reyKillers = pc.lugares.filter((l) => l.reyKiller);
  if (reyKillers.length !== 1) {
    return "Premios por campeonato: debe haber exactamente un lugar marcado como Rey Killer.";
  }
  if (Math.abs(sumPct(pc.lugares) - 100) > TOL) {
    return "Premios por campeonato: los lugares (incluyendo Rey Killer) deben sumar 100%.";
  }

  const pos = data.puntos?.posiciones;
  if (!Array.isArray(pos) || pos.length < 1 || pos.length > 15) {
    return "Puntos: debe haber entre 1 y 15 posiciones.";
  }
  if (!data.puntos?.asistencia || typeof data.puntos.asistencia.regular !== "number" || typeof data.puntos.asistencia.main !== "number") {
    return "Puntos: falta la asistencia (Regular / Main Event).";
  }

  if (typeof data.recomprasMax !== "number" || data.recomprasMax < 0) {
    return "Falta el número máximo de recompras (Re-buys) por jugador.";
  }
  if (typeof data.cuotaInscripcion !== "number" || data.cuotaInscripcion < 0) {
    return "Falta la cuota de inscripción por jugador.";
  }

  if (!Array.isArray(data.gastosCampeonato) || data.gastosCampeonato.length > 10) {
    return "Gastos del campeonato: máximo 10 conceptos.";
  }
  if (!Array.isArray(data.cobrosPorTorneo) || data.cobrosPorTorneo.length > 10) {
    return "Cobros por torneo: máximo 10 conceptos.";
  }
  const tieneBuyin = data.cobrosPorTorneo.some((c) => c.id === "buyin");
  const tieneRebuy = data.cobrosPorTorneo.some((c) => c.id === "rebuy");
  const tieneAddon = data.cobrosPorTorneo.some((c) => c.id === "addon");
  if (!tieneBuyin || !tieneRebuy || !tieneAddon) {
    return "Cobros por torneo: Buy-in, Re-buy y Add-on son obligatorios y no se pueden eliminar.";
  }
  if (!Array.isArray(data.pagosPorTorneo) || data.pagosPorTorneo.length > 10) {
    return "Pagos por torneo: máximo 10 conceptos.";
  }

  return null;
}

export default async (req) => {
  const store = getStore("tols-tablero");

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json" });
    const normalizado = normalizarMapa(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
      await syncTablero(normalizado);
    }
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }

    const raw = await store.get("data", { type: "json" });
    const mapa = normalizarMapa(raw);

    if (body?.accion === "guardar") {
      const campeonato = String(body.campeonato || "").trim();
      if (!campeonato) {
        return new Response(JSON.stringify({ error: "Falta el nombre del campeonato." }), { status: 400, headers: HEADERS });
      }
      const datos = normalizarUno(body.data, mapa[campeonato] || PLANTILLA);
      const problema = validarUno(datos);
      if (problema) {
        return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
      }
      mapa[campeonato] = datos;
    } else if (body?.accion === "renombrar") {
      const de = String(body.de || "").trim();
      const a = String(body.a || "").trim();
      if (!de || !a) {
        return new Response(JSON.stringify({ error: "Faltan los nombres para renombrar." }), { status: 400, headers: HEADERS });
      }
      if (!mapa[de]) {
        return new Response(JSON.stringify({ error: `No hay datos guardados para "${de}".` }), { status: 400, headers: HEADERS });
      }
      if (mapa[a] && a !== de) {
        return new Response(JSON.stringify({ error: `Ya existe un campeonato "${a}".` }), { status: 400, headers: HEADERS });
      }
      mapa[a] = mapa[de];
      if (a !== de) delete mapa[de];
    } else if (body?.accion === "eliminar") {
      const campeonato = String(body.campeonato || "").trim();
      if (!campeonato || !mapa[campeonato]) {
        return new Response(JSON.stringify({ error: "Ese campeonato no tiene datos guardados." }), { status: 400, headers: HEADERS });
      }
      if (Object.keys(mapa).length <= 1) {
        return new Response(JSON.stringify({ error: "Debe quedar al menos un campeonato con datos." }), { status: 400, headers: HEADERS });
      }
      delete mapa[campeonato];
    } else {
      return new Response(JSON.stringify({ error: "Acción no reconocida." }), { status: 400, headers: HEADERS });
    }

    await store.setJSON("data", mapa);
    await syncTablero(mapa);
    return new Response(JSON.stringify(mapa), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/tablero" };
