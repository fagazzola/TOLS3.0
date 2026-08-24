import { getStore } from "@netlify/blobs";
import seed from "../../src/data/tablero.json";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const TOL = 0.01; // tolerancia para sumas de porcentaje por redondeo flotante

function sumPct(lugares) {
  return lugares.reduce((a, l) => a + Number(l.pct || 0), 0);
}

function validar(data) {
  if (!data || typeof data !== "object") return "Formato inválido.";

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

  if (!Array.isArray(data.costosUnicos) || data.costosUnicos.length > 10) {
    return "Costos únicos por campeonato: máximo 10 conceptos.";
  }
  if (!Array.isArray(data.cobrosPorTorneo) || data.cobrosPorTorneo.length > 10) {
    return "Cobros por torneo: máximo 10 conceptos.";
  }
  const tieneBuyin = data.cobrosPorTorneo.some((c) => c.id === "buyin");
  const tieneRebuy = data.cobrosPorTorneo.some((c) => c.id === "rebuy");
  if (!tieneBuyin || !tieneRebuy) {
    return "Cobros por torneo: Buy-in y Re-buy son obligatorios y no se pueden eliminar.";
  }
  if (!Array.isArray(data.pagosPorTorneo) || data.pagosPorTorneo.length > 10) {
    return "Pagos por torneo: máximo 10 conceptos.";
  }

  return null;
}

export default async (req) => {
  const store = getStore("tols-tablero");

  if (req.method === "GET") {
    let data = await store.get("data", { type: "json" });
    if (!data) {
      data = seed;
      await store.setJSON("data", data);
    }
    return new Response(JSON.stringify(data), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }
    const problema = validar(body);
    if (problema) {
      return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
    }
    await store.setJSON("data", body);
    return new Response(JSON.stringify(body), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/tablero" };
