import { getStore } from "@netlify/blobs";
import seed from "../../src/data/campeonatos.json";
import { syncCampeonatos } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

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
