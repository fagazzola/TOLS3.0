import { getStore } from "@netlify/blobs";
import seed from "../../src/data/tablero.json";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const TOL = 0.01; // tolerancia para sumas de porcentaje por redondeo flotante

function sumPct(lugares) {
  return lugares.reduce((a, l) => a + Number(l.pct || 0), 0);
}

// ids antiguos que cambiaron de nombre entre versiones del esquema — se renombran en vez de
// duplicarse cuando más abajo se asegura que los conceptos protegidos existan
const RENOMBRAR_ID_COBRO = { "addon-1": "addon" };

// completa cualquier campo faltante (con los valores de la semilla) cuando lo guardado en Blobs
// viene de una versión anterior del esquema — evita que la pantalla truene por un campo undefined
function normalizar(data) {
  const d = data && typeof data === "object" ? { ...data } : {};
  if (typeof d.nombreCampeonato !== "string") d.nombreCampeonato = seed.nombreCampeonato;
  d.premios = d.premios || seed.premios;
  d.premios.porTorneo = d.premios.porTorneo || seed.premios.porTorneo;
  d.premios.porCampeonato = d.premios.porCampeonato || seed.premios.porCampeonato;
  d.puntos = d.puntos || seed.puntos;
  d.puntos.asistencia = d.puntos.asistencia || seed.puntos.asistencia;
  d.puntos.posiciones = Array.isArray(d.puntos.posiciones) ? d.puntos.posiciones : seed.puntos.posiciones;
  if (typeof d.recomprasMax !== "number") d.recomprasMax = seed.recomprasMax;
  if (typeof d.cuotaInscripcion !== "number") d.cuotaInscripcion = seed.cuotaInscripcion;
  d.gastosCampeonato = Array.isArray(d.gastosCampeonato) ? d.gastosCampeonato : seed.gastosCampeonato;
  d.cobrosPorTorneo = Array.isArray(d.cobrosPorTorneo) ? d.cobrosPorTorneo : seed.cobrosPorTorneo;
  d.pagosPorTorneo = Array.isArray(d.pagosPorTorneo) ? d.pagosPorTorneo : seed.pagosPorTorneo;

  // migra ids viejos a los nuevos, y quita duplicados por id (se queda con la primera aparición) —
  // así no se duplica un concepto protegido al renombrarlo entre versiones
  d.cobrosPorTorneo = d.cobrosPorTorneo.map((c) => (RENOMBRAR_ID_COBRO[c.id] ? { ...c, id: RENOMBRAR_ID_COBRO[c.id] } : c));
  const idsVistos = new Set();
  d.cobrosPorTorneo = d.cobrosPorTorneo.filter((c) => {
    if (idsVistos.has(c.id)) return false;
    idsVistos.add(c.id);
    return true;
  });

  // Buy-in, Re-buy y Add-on siempre deben existir y estar protegidos contra borrado
  for (const req of seed.cobrosPorTorneo.filter((c) => c.protegido)) {
    const existente = d.cobrosPorTorneo.find((c) => c.id === req.id);
    if (!existente) d.cobrosPorTorneo.push({ ...req });
    else existente.protegido = true;
  }
  delete d.costosUnicos; // campo del esquema anterior, ya no se usa
  return d;
}

function validar(data) {
  if (!data || typeof data !== "object") return "Formato inválido.";

  if (typeof data.nombreCampeonato !== "string" || !data.nombreCampeonato.trim()) {
    return "Falta el nombre del campeonato.";
  }

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
    let data = await store.get("data", { type: "json" });
    const normalizado = normalizar(data || seed);
    // si lo guardado venía incompleto (esquema anterior) o no existía, se re-guarda ya corregido
    if (!data || JSON.stringify(data) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
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
    const normalizado = normalizar(body);
    const problema = validar(normalizado);
    if (problema) {
      return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
    }
    await store.setJSON("data", normalizado);
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/tablero" };
