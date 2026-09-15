import { getStore } from "@netlify/blobs";
import seed from "../../src/data/campeonatos.json";
import { syncCampeonatos } from "./lib/msgraph.js";
import { renombrarCampeonatoEnTablero } from "./tablero.js";
import { renombrarCampeonatoEnCalendario } from "./calendario.js";
import { renombrarCampeonatoEnCobranza } from "./cobranza.js";
import { renombrarCampeonatoEnGameNight } from "./gamenight.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

function isoHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// mismo criterio que usa el Tablero de Control (estatusCampeonato en Tablero.jsx) para saber si un
// campeonato ya empezó a jugarse — se reimplementa aquí porque esta validación tiene que vivir en el
// servidor (el cliente puede tener datos desactualizados) y no se puede importar un componente .jsx.
async function estaEnCurso(nombre) {
  try {
    const calStore = getStore("tols-calendario");
    const cal = await calStore.get("data", { type: "json" });
    const fechas = (cal?.torneos || []).filter((t) => t.temporada === nombre);
    if (fechas.length === 0) return false;
    const hoy = isoHoy();
    const jugadas = fechas.filter((t) => t.fecha < hoy).length;
    return jugadas > 0 && jugadas < fechas.length;
  } catch (e) {
    return false;
  }
}

// limpia la lista: quita espacios y duplicados, sin tronar si viene algo raro. "activo" es el
// campeonato que gobierna el sitio (el que se ve/edita en el Tablero de Control) — el mismo que debe
// reflejarse en el Calendario y en cualquier otra pantalla que necesite saber "cuál es el torneo vigente".
function normalizar(data) {
  const base = data && typeof data === "object" ? data : {};
  const origen = Array.isArray(base.nombres) ? base.nombres : Array.isArray(seed.nombres) ? seed.nombres : [];
  const limpios = [];
  for (const n of origen) {
    const t = String(n || "").trim();
    if (t && !limpios.includes(t)) limpios.push(t);
  }
  const nombres = limpios.length ? limpios : seed.nombres;
  let activo = String(base.activo || "").trim();
  if (!activo || !nombres.includes(activo)) activo = nombres[0] || "";
  return { nombres, activo };
}

function validar(data) {
  if (!data || !Array.isArray(data.nombres)) return "Formato inválido.";
  if (data.nombres.length < 1) return "Debe haber al menos un campeonato.";
  if (data.nombres.length > 20) return "Máximo 20 campeonatos.";
  const vistos = new Set();
  for (const n of data.nombres) {
    const t = String(n || "").trim();
    if (!t) return "El nombre del campeonato no puede estar vacío.";
    if (t.length > 40) return "El nombre del campeonato es demasiado largo.";
    const key = t.toLowerCase();
    if (vistos.has(key)) return `El campeonato "${t}" está repetido.`;
    vistos.add(key);
  }
  return null;
}

// campeonatos que existen con datos guardados en el Tablero (tols-tablero) pero que por algún motivo
// (un fallo a medias al agregar/renombrar, datos migrados de un esquema anterior, etc.) no quedaron
// en este registro — se agregan solos al final para que no queden "huérfanos" sin aparecer en el combo
async function conHuerfanosSanados(normalizado) {
  try {
    const tableroStore = getStore("tols-tablero");
    const tablero = await tableroStore.get("data", { type: "json" });
    if (!tablero || typeof tablero !== "object") return normalizado;
    const huerfanos = Object.keys(tablero).filter((n) => !normalizado.nombres.includes(n));
    if (huerfanos.length === 0) return normalizado;
    return { nombres: [...normalizado.nombres, ...huerfanos], activo: normalizado.activo };
  } catch (e) {
    // si el store del tablero no está disponible por lo que sea, no se bloquea el registro por eso
    return normalizado;
  }
}

export default async (req) => {
  const store = getStore("tols-campeonatos");

  if (req.method === "GET") {
    const data = await store.get("data", { type: "json" });
    let normalizado = normalizar(data);
    normalizado = await conHuerfanosSanados(normalizado);
    if (!data || JSON.stringify(data) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
      await syncCampeonatos(normalizado);
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

    // accion "renombrar": renombra un campeonato en un solo paso, en cascada a TODOS los módulos que
    // guardan su nombre (Tablero, Calendario, Cobranza y Game Night) — antes cada pantalla lo hacía por
    // su cuenta y Calendario/Cobranza/Game Night se quedaban con el nombre viejo. Bloqueado si el
    // campeonato ya está "en curso" (algunas fechas jugadas y otras no) para no partir una temporada
    // a medias.
    if (body?.accion === "renombrar") {
      const de = String(body.de || "").trim();
      const a = String(body.a || "").trim();
      if (!de || !a) {
        return new Response(JSON.stringify({ error: "Faltan los nombres para renombrar." }), { status: 400, headers: HEADERS });
      }
      const actual = normalizar(await store.get("data", { type: "json" }));
      if (!actual.nombres.includes(de)) {
        return new Response(JSON.stringify({ error: `No existe el campeonato "${de}".` }), { status: 400, headers: HEADERS });
      }
      if (a !== de && actual.nombres.includes(a)) {
        return new Response(JSON.stringify({ error: `Ya existe un campeonato "${a}".` }), { status: 400, headers: HEADERS });
      }
      if (a === de) {
        return new Response(JSON.stringify(actual), { headers: HEADERS });
      }
      if (await estaEnCurso(de)) {
        return new Response(JSON.stringify({ error: `No puedes renombrar "${de}" mientras está en curso.` }), { status: 400, headers: HEADERS });
      }

      const nuevo = normalizar({
        nombres: actual.nombres.map((n) => (n === de ? a : n)),
        activo: actual.activo === de ? a : actual.activo,
      });
      await store.setJSON("data", nuevo);
      await syncCampeonatos(nuevo);

      // cascada best-effort: si alguno de estos falla no se revierte el renombre principal (ya quedó
      // guardado arriba), pero se informan las advertencias para que Federico sepa qué revisar a mano
      const avisos = [];
      const cascada = [
        ["Tablero", () => renombrarCampeonatoEnTablero(de, a)],
        ["Calendario", () => renombrarCampeonatoEnCalendario(de, a)],
        ["Cobranza", () => renombrarCampeonatoEnCobranza(de, a)],
        ["Game Night", () => renombrarCampeonatoEnGameNight(de, a)],
      ];
      for (const [nombreModulo, fn] of cascada) {
        try {
          await fn();
        } catch (e) {
          avisos.push(`${nombreModulo}: ${e.message || e}`);
        }
      }

      return new Response(JSON.stringify({ ...nuevo, avisos }), { headers: HEADERS });
    }

    const nombresLimpio = { nombres: (Array.isArray(body?.nombres) ? body.nombres : []).map((n) => String(n || "").trim()) };
    const problema = validar(nombresLimpio);
    if (problema) {
      return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
    }
    // si el body trae "activo" explícito (ej. al cambiar el campeonato seleccionado en el Tablero) se
    // respeta ese valor; si no, se conserva el que ya estaba guardado — normalizar() cae a nombres[0]
    // si el activo actual ya no existe en la lista (ej. se acaba de eliminar ese campeonato)
    const actual = await store.get("data", { type: "json" });
    const activoDeseado = body?.activo !== undefined ? String(body.activo || "").trim() : normalizar(actual).activo;
    const limpio = normalizar({ nombres: nombresLimpio.nombres, activo: activoDeseado });
    await store.setJSON("data", limpio);
    await syncCampeonatos(limpio);
    return new Response(JSON.stringify(limpio), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/campeonatos" };
