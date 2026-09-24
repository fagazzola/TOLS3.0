import { getStore } from "@netlify/blobs";
import { syncEstadisticas } from "./lib/msgraph.js";
import { estadoTorneoDesdeLugares, PRACTICA_CAMPEONATO } from "../../src/lib/gamenight.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// 66ª entrega — MOD 7 "Estadísticas": reemplaza el flujo en vivo de Game Night (que queda oculto, sin
// borrarse) por un flujo de archivos que el administrador sube una vez por torneo: un Excel de
// PokerStars con el orden final (Place/User ID/Rebuys/Addons — el parseo ocurre en el cliente, igual
// que ya hacía "Importar resultados (Excel)" en Game Night) y un .txt con el chat de WhatsApp de la
// liga, de donde se extraen los Killers (ver src/lib/killersChat.js, también en el cliente). El
// servidor recibe ya los datos parseados (jugadores con buyIn/rebuys/addon/lugar/killerAlias/
// mejorMano) y aquí calcula la parte "oficial": Puntos/Debe/Premio/Saldo, con la misma matemática que
// usa Game Night (`estadoTorneoDesdeLugares`, misma fuente de verdad — Tablero de Control).

function normalizarJugadorEst(j) {
  return {
    alias: String(j?.alias || "").trim(),
    nombre: String(j?.nombre || "").trim(),
    correo: String(j?.correo || "").trim().toLowerCase(),
    buyIn: Boolean(j?.buyIn ?? true),
    rebuys: Math.max(0, Number(j?.rebuys) || 0),
    addon: Boolean(j?.addon),
    lugar: j?.lugar ? Number(j.lugar) : null,
    // igual que `eliminadoPor` en Game Night (netlify/functions/gamenight.js, acción "killer"): el
    // alias PokerStars de quien lo eliminó — se arma en el cliente a partir de lo que resuelve
    // `extraerKillersDeChat()` (src/lib/killersChat.js) sobre el .txt de WhatsApp.
    eliminadoPor: String(j?.eliminadoPor || "").trim(),
    mejorMano: Boolean(j?.mejorMano),
  };
}

function normalizarTorneoEst(t) {
  const jugadores = {};
  for (const [clave, j] of Object.entries(t?.jugadores || {})) {
    jugadores[clave] = normalizarJugadorEst(j);
  }
  return {
    tipo: String(t?.tipo || "Regular").trim(),
    publicado: Boolean(t?.publicado),
    subidoEn: String(t?.subidoEn || "").trim(),
    publicadoEn: String(t?.publicadoEn || "").trim(),
    jugadores,
    logKillersNoResueltos: Array.isArray(t?.logKillersNoResueltos) ? t.logKillersNoResueltos : [],
  };
}

function normalizar(raw) {
  const torneos = {};
  for (const [campeonato, fechas] of Object.entries(raw?.torneos || {})) {
    torneos[campeonato] = {};
    for (const [fecha, torneo] of Object.entries(fechas || {})) {
      torneos[campeonato][fecha] = normalizarTorneoEst(torneo);
    }
  }
  const apodos = {};
  for (const [alias, lista] of Object.entries(raw?.apodos || {})) {
    const limpio = String(alias || "").trim();
    if (!limpio) continue;
    apodos[limpio] = (Array.isArray(lista) ? lista : []).map((a) => String(a || "").trim()).filter(Boolean).slice(0, 3);
  }
  return { torneos, apodos };
}

export default async (req) => {
  const store = getStore({ name: "tols-estadisticas", consistency: "strong" });

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json", consistency: "strong" });
    const normalizado = normalizar(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
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

    const raw = await store.get("data", { type: "json", consistency: "strong" });
    const actual = normalizar(raw);

    // accion "guardarApodos": el administrador reemplaza la tabla completa de apodos de chat (hasta 3
    // por jugador) — ya sea editada a mano o sembrada al importar el Excel de referencias.
    if (body?.accion === "guardarApodos") {
      const nuevoApodos = {};
      for (const [alias, lista] of Object.entries(body.apodos || {})) {
        const limpio = String(alias || "").trim();
        if (!limpio) continue;
        nuevoApodos[limpio] = (Array.isArray(lista) ? lista : []).map((a) => String(a || "").trim()).filter(Boolean).slice(0, 3);
      }
      actual.apodos = nuevoApodos;
      await store.setJSON("data", actual);
      await syncEstadisticas(actual.torneos, actual.apodos);
      return new Response(JSON.stringify(actual), { headers: HEADERS });
    }

    // accion "guardarTorneo": sube (o reemplaza) el resultado de un torneo puntual — campeonato+fecha
    // ya resuelven de forma estable (PRACTICA_CAMPEONATO para partidas de práctica, igual que Game
    // Night). `publicar: true` lo hace visible para cualquier jugador de inmediato; `publicar: false`
    // (o ausente) lo deja guardado pero sin publicar, por si el administrador quiere revisarlo primero
    // en otra sesión antes de confirmar. El Puntos/Debe/Premio/Saldo de cada jugador SIEMPRE se
    // recalculan aquí server-side (nunca se confía en lo que mande el cliente) para que la fuente de
    // verdad sea siempre la misma configuración del Tablero de Control que usa el resto del sitio.
    if (body?.accion === "guardarTorneo") {
      const { campeonato, fecha, tipo, jugadores, logKillersNoResueltos, publicar } = body;
      const campKey = String(campeonato || "").trim();
      const fechaKey = String(fecha || "").trim();
      if (!campKey || !fechaKey) {
        return new Response(JSON.stringify({ error: "Falta campeonato o fecha." }), { status: 400, headers: HEADERS });
      }
      if (!Array.isArray(jugadores) || jugadores.length === 0) {
        return new Response(JSON.stringify({ error: "No hay jugadores en el resultado a guardar." }), { status: 400, headers: HEADERS });
      }

      const tableroStore = getStore({ name: "tols-tablero", consistency: "strong" });
      const tableroMapa = (await tableroStore.get("data", { type: "json", consistency: "strong" })) || {};

      const jugadoresState = {};
      for (const j of jugadores) {
        const clave = String(j.correo || j.alias || "").trim().toLowerCase() || j.alias;
        jugadoresState[clave] = normalizarJugadorEst(j);
      }
      const resultado = estadoTorneoDesdeLugares({
        jugadoresState,
        tableroMapa,
        campeonato: campKey,
        tipo: String(tipo || "Regular"),
      });

      const yaExistia = actual.torneos[campKey]?.[fechaKey];
      const ahora = new Date().toISOString();
      if (!actual.torneos[campKey]) actual.torneos[campKey] = {};
      actual.torneos[campKey][fechaKey] = {
        tipo: String(tipo || "Regular").trim(),
        publicado: Boolean(publicar),
        subidoEn: ahora,
        publicadoEn: publicar ? ahora : yaExistia?.publicadoEn || "",
        jugadores: resultado.porJugador,
        logKillersNoResueltos: Array.isArray(logKillersNoResueltos) ? logKillersNoResueltos : [],
      };

      await store.setJSON("data", actual);
      await syncEstadisticas(actual.torneos, actual.apodos);
      return new Response(JSON.stringify(actual), { headers: HEADERS });
    }

    // accion "publicar": marca como publicado un torneo que ya se había guardado sin publicar.
    if (body?.accion === "publicar") {
      const campKey = String(body.campeonato || "").trim();
      const fechaKey = String(body.fecha || "").trim();
      const torneo = actual.torneos[campKey]?.[fechaKey];
      if (!torneo) {
        return new Response(JSON.stringify({ error: "No se encontró ese torneo." }), { status: 404, headers: HEADERS });
      }
      torneo.publicado = true;
      torneo.publicadoEn = new Date().toISOString();
      await store.setJSON("data", actual);
      await syncEstadisticas(actual.torneos, actual.apodos);
      return new Response(JSON.stringify(actual), { headers: HEADERS });
    }

    return new Response(JSON.stringify({ error: "Acción no reconocida." }), { status: 400, headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no soportado." }), { status: 405, headers: HEADERS });
};

export { PRACTICA_CAMPEONATO };

// FALTABA en la 66ª/67ª entrega: sin este `config`, Netlify Functions v2 solo expone esta función en
// `/.netlify/functions/estadisticas`, no en `/api/estadisticas` (a diferencia de TODAS las demás
// funciones del sitio — jugadores.js, tablero.js, calendario.js, etc. — que sí lo tienen). Sin la ruta
// `/api/*` reconocida, cualquier método que no fuera un GET normal (como el PUT de "guardarApodos" o
// "guardarTorneo") caía en el redirect estático `/* -> /index.html` de netlify.toml, que para un método
// distinto de GET/HEAD devuelve un 405 "Method not allowed" en texto plano — de ahí el error
// "Unexpected token 'M' ... is not valid JSON" que vio Federico al intentar guardar los apodos. Con esta
// línea la función queda expuesta en `/api/estadisticas` igual que el resto del sitio.
export const config = { path: "/api/estadisticas" };
