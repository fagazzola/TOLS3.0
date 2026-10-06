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

// bug encontrado tras la 70ª entrega — Federico reportó que al abrir un torneo publicado la tabla ya
// no traía los puntos calculados al subirlo. Causa: `normalizarJugadorEst()` de arriba está pensada
// para sanear el INPUT del administrador ANTES de calcular (ahí los campos calculados nunca deben venir
// del cliente, así que se descartan a propósito) — pero `normalizarTorneoEst()` reutilizaba esa misma
// función para sanear los datos YA GUARDADOS al leerlos, así que en cada GET se borraban Puntos/
// Debe/Premio/Saldo/Campeón/Burbuja de la copia en memoria, y como el GET vuelve a guardar en Blobs en
// cuanto detecta una diferencia (`JSON.stringify(raw) !== JSON.stringify(normalizado)`), esa pérdida
// quedaba persistida de forma permanente la primera vez que alguien abría la pantalla después de
// publicar. Fix: función aparte para los datos ya guardados, que conserva los campos calculados.
function normalizarJugadorEstGuardado(j) {
  return {
    ...normalizarJugadorEst(j),
    esCampeon: Boolean(j?.esCampeon),
    esBurbuja: Boolean(j?.esBurbuja),
    debeBuyIn: Number(j?.debeBuyIn) || 0,
    debeRebuys: Number(j?.debeRebuys) || 0,
    debeAddon: Number(j?.debeAddon) || 0,
    debeTotal: Number(j?.debeTotal) || 0,
    premioLugar: Number(j?.premioLugar) || 0,
    premioBurbuja: Number(j?.premioBurbuja) || 0,
    premioMano: Number(j?.premioMano) || 0,
    premioTotal: Number(j?.premioTotal) || 0,
    puntos: Number(j?.puntos) || 0,
  };
}

function normalizarTorneoEst(t) {
  const jugadores = {};
  for (const [clave, j] of Object.entries(t?.jugadores || {})) {
    jugadores[clave] = normalizarJugadorEstGuardado(j);
  }
  return {
    tipo: String(t?.tipo || "Regular").trim(),
    publicado: Boolean(t?.publicado),
    subidoEn: String(t?.subidoEn || "").trim(),
    publicadoEn: String(t?.publicadoEn || "").trim(),
    jugadores,
    logKillersNoResueltos: Array.isArray(t?.logKillersNoResueltos) ? t.logKillersNoResueltos : [],
    // 97ª entrega: corrección manual del administrador general sobre el total de Kills de cada jugador,
    // una vez publicado el torneo — Federico reportó quejas de jugadores sobre ese número y pidió poder
    // ajustarlo directamente (acción "editarKills" más abajo), acotado entre 0 y (jugadores del
    // torneo - 1). Cuando un alias tiene entrada acá, pisa el tally calculado a partir de `eliminadoPor`/
    // `logKillersNoResueltos` (ver `killsPorAliasTorneo` en Estadisticas.jsx) — el resto de los alias
    // sigue mostrando el tally calculado sin cambios.
    killsManual: Object.fromEntries(
      Object.entries(t?.killsManual || {})
        .map(([alias, n]) => [String(alias || "").trim(), Math.max(0, Math.round(Number(n) || 0))])
        .filter(([alias]) => alias)
    ),
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
        fecha: fechaKey,
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

    // accion "editarKills" (97ª entrega): el administrador general corrige a mano el total de Kills de
    // un jugador en un torneo YA PUBLICADO (ver comentario en normalizarTorneoEst). `kills` debe ser un
    // entero entre 0 y (cantidad de jugadores del torneo - 1) — nunca puede haber más kills que
    // eliminaciones posibles en la mesa. El chequeo de rol ("Administrador General") es responsabilidad
    // del cliente (Estadisticas.jsx), mismo criterio que el resto del sitio — ver "Nota de permisos" en
    // tablero.js.
    if (body?.accion === "editarKills") {
      const campKey = String(body.campeonato || "").trim();
      const fechaKey = String(body.fecha || "").trim();
      const alias = String(body.alias || "").trim();
      const torneo = actual.torneos[campKey]?.[fechaKey];
      if (!torneo) {
        return new Response(JSON.stringify({ error: "No se encontró ese torneo." }), { status: 404, headers: HEADERS });
      }
      if (!torneo.publicado) {
        return new Response(JSON.stringify({ error: "El torneo todavía no está publicado." }), { status: 400, headers: HEADERS });
      }
      const totalJugadores = Object.keys(torneo.jugadores || {}).length;
      const existeAlias = Object.values(torneo.jugadores || {}).some((j) => j.alias === alias);
      if (!alias || !existeAlias) {
        return new Response(JSON.stringify({ error: "No se encontró ese jugador en el torneo." }), { status: 400, headers: HEADERS });
      }
      const maximo = Math.max(0, totalJugadores - 1);
      const kills = Math.round(Number(body.kills));
      if (!Number.isFinite(kills) || kills < 0 || kills > maximo) {
        return new Response(
          JSON.stringify({ error: `El número de kills debe estar entre 0 y ${maximo}.` }),
          { status: 400, headers: HEADERS }
        );
      }
      torneo.killsManual = { ...(torneo.killsManual || {}), [alias]: kills };
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
