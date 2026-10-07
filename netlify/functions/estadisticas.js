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
    // 101ª entrega: reemplaza por completo `killsManual` (97ª/98ª entrega) — Federico señaló que corregir
    // el NÚMERO total de Kills directamente estaba mal planteado: lo que hace falta es decir QUIÉN mató a
    // QUIÉN, y que el total se derive de ahí, igual que el tally normal a partir de `eliminadoPor`.
    // `killsAsignados` es un mapa víctima(alias) → killer(alias) — una asignación manual del administrador
    // general, posterior a la publicación, que PISA el `eliminadoPor` original de esa víctima (si tenía
    // uno) o simplemente se suma (si no tenía). Reasignar la misma víctima a otro killer reemplaza la
    // entrada — nunca convive más de un killer por víctima. Cualquier corrección vieja guardada en
    // `killsManual` (un número suelto, sin víctima asociada) no tiene cómo migrarse a este esquema nuevo
    // y se descarta al normalizar — si Federico la necesita de nuevo, se vuelve a asignar con el killer y
    // la víctima reales desde el botón "+ Agregar Killer".
    killsAsignados: Object.fromEntries(
      Object.entries(t?.killsAsignados || {})
        .map(([killed, killer]) => [String(killed || "").trim(), String(killer || "").trim()])
        .filter(([killed, killer]) => killed && killer)
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

    // accion "asignarKiller" (101ª entrega): reemplaza "editarKills" (97ª/98ª) — en vez de corregir el
    // NÚMERO total de Kills de un jugador a mano, el administrador general dice quién (`killer`) eliminó
    // a quién (`killed`), en un torneo YA PUBLICADO. Si `killed` ya tenía un killer asignado (manual o el
    // `eliminadoPor` original), esta asignación lo REEMPLAZA — nunca convive más de un killer por víctima,
    // así que el total del killer viejo baja solo y el del nuevo sube, sin tocar nada más. Si `killed` no
    // tenía ninguno, simplemente se agrega. El chequeo de rol ("Administrador General") es
    // responsabilidad del cliente (Estadisticas.jsx), mismo criterio que el resto del sitio — ver "Nota
    // de permisos" en tablero.js.
    if (body?.accion === "asignarKiller") {
      const campKey = String(body.campeonato || "").trim();
      const fechaKey = String(body.fecha || "").trim();
      const killer = String(body.killer || "").trim();
      const killed = String(body.killed || "").trim();
      const torneo = actual.torneos[campKey]?.[fechaKey];
      if (!torneo) {
        return new Response(JSON.stringify({ error: "No se encontró ese torneo." }), { status: 404, headers: HEADERS });
      }
      if (!torneo.publicado) {
        return new Response(JSON.stringify({ error: "El torneo todavía no está publicado." }), { status: 400, headers: HEADERS });
      }
      const jugadoresTorneo = Object.values(torneo.jugadores || {});
      const existeKiller = jugadoresTorneo.some((j) => j.alias === killer);
      const existeKilled = jugadoresTorneo.some((j) => j.alias === killed);
      if (!killer || !existeKiller || !killed || !existeKilled) {
        return new Response(JSON.stringify({ error: "No se encontró a ese killer o a esa víctima en el torneo." }), { status: 400, headers: HEADERS });
      }
      if (killer === killed) {
        return new Response(JSON.stringify({ error: "Un jugador no puede eliminarse a sí mismo." }), { status: 400, headers: HEADERS });
      }
      const totalJugadores = jugadoresTorneo.length;
      const maximo = Math.max(0, totalJugadores - 1);
      // tally efectivo DESPUÉS de la reasignación: se recorre todo el torneo usando, para cada víctima, la
      // asignación manual vigente si la hay (con `killed` ya apuntando al `killer` nuevo) o si no el
      // `eliminadoPor` original — exactamente la misma regla que usa `killsPorAliasTorneo` en
      // Estadisticas.jsx, para que el límite se valide contra el mismo número que se le muestra a Federico.
      const asignNueva = { ...(torneo.killsAsignados || {}), [killed]: killer };
      const tally = {};
      for (const j of jugadoresTorneo) {
        const k = Object.prototype.hasOwnProperty.call(asignNueva, j.alias) ? asignNueva[j.alias] : j.eliminadoPor;
        if (k) tally[k] = (tally[k] || 0) + 1;
      }
      (torneo.logKillersNoResueltos || []).forEach((l) => {
        if (l.asignadoA) tally[l.asignadoA] = (tally[l.asignadoA] || 0) + 1;
      });
      if ((tally[killer] || 0) > maximo) {
        return new Response(
          JSON.stringify({ error: `"${killer}" quedaría con ${tally[killer]} kills en este torneo — no puede superar ${maximo} (jugadores del torneo − 1).` }),
          { status: 400, headers: HEADERS }
        );
      }
      torneo.killsAsignados = asignNueva;
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
