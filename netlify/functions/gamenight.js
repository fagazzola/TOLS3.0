import { getStore } from "@netlify/blobs";
import { syncGameNight } from "./lib/msgraph.js";
import { upsertVariosDesdeGameNight, eliminarMovimientosDeGameNight, registrarCierreTorneo } from "./cobranza.js";
import { tipoDeFecha, estadoTorneo, PRACTICA_CAMPEONATO, horaInicioProgramada, torneoCalendarioDe, recomprasMaxEfectivo, torneoBloqueante } from "../../src/lib/gamenight.js";

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
    // 50ª entrega: "caché" del último resultado calculado (lugar de salida, premio total, puntos) —
    // se recalcula y se vuelve a guardar en cada acción sobre ESTE torneo (ver el bloque que llama a
    // `estadoTorneo()` justo antes de guardar, en el handler principal), así que para un torneo ya
    // Concluido queda congelado con sus cifras finales sin necesidad de rehacer el cálculo cada vez
    // que se sincroniza a Excel. Nunca se edita a mano — es puramente derivado.
    lugar: j?.lugar ? Number(j.lugar) : null,
    premioTotal: Number(j?.premioTotal) || 0,
    puntos: Number(j?.puntos) || 0,
    esCampeon: Boolean(j?.esCampeon),
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
  // 50ª entrega: una vez "Concluida" (acción `"concluir"`), el torneo queda cerrado formalmente — el
  // servidor rechaza cualquier otra acción sobre él (ver el guardia al principio del PUT/POST) y el
  // combo de campeonato en el cliente usa este mismo campo para saber qué ya se puede dar por jugado.
  return {
    horaInicio: String(t?.horaInicio || "").trim(),
    jugadores,
    ordenEliminados,
    concluido: Boolean(t?.concluido),
    concluidoEn: String(t?.concluidoEn || "").trim(),
  };
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

// 51ª entrega: hace falta saber cuál es el campeonato "activo" para aplicar el mismo orden
// cronológico obligatorio (`torneoBloqueante()`) también del lado del servidor — antes solo se
// aplicaba en el cliente (deshabilitando el combo), pero eso no evita que un PUT directo a este
// endpoint (o un bug futuro en la pantalla) se salte el orden.
async function campeonatoActivoActual() {
  try {
    const store = getStore({ name: "tols-campeonatos", consistency: "strong" });
    const data = await store.get("data", { type: "json", consistency: "strong" });
    return String(data?.activo || "").trim();
  } catch (e) {
    return "";
  }
}

// 49ª entrega: Federico reportó que, después de mover Re-buys/Add-on varias veces seguidas y rápido,
// "se borró todo y se inicializó" — el torneo completo (y potencialmente TODOS los campeonatos/fechas
// guardados en este store) volvió a cero. Causa más probable: aunque el store se abre con
// `consistency: "strong"` desde la 47ª entrega, una lectura ocasional todavía puede devolver `null`
// justo después de un guardado muy reciente (retraso de réplica). Como cada acción reconstruye y vuelve
// a guardar el mapa COMPLETO (todos los campeonatos, no solo el que se está tocando), una sola lectura
// nula tratada como "no hay nada guardado todavía" provoca que el siguiente guardado sobreescriba TODO
// el store con un mapa casi vacío — no solo pierde el torneo actual, pierde los de cualquier otro
// campeonato también. Fix: reintentar la lectura un par de veces antes de asumir que el store
// genuinamente está vacío (primer uso).
async function leerMapaConReintento(store) {
  for (let intento = 0; intento < 3; intento++) {
    const raw = await store.get("data", { type: "json", consistency: "strong" });
    if (raw) return raw;
    if (intento < 2) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null; // después de 3 intentos seguidos en null, se asume que de verdad no hay datos aún
}

function getTorneo(mapa, campeonato, fecha) {
  if (!mapa[campeonato]) mapa[campeonato] = {};
  if (!mapa[campeonato][fecha]) {
    mapa[campeonato][fecha] = { horaInicio: "", jugadores: {}, ordenEliminados: [], concluido: false, concluidoEn: "" };
  }
  return mapa[campeonato][fecha];
}

// refleja el torneo completo (todos sus jugadores) en Cobranza — se llama después de cualquier acción
// que pueda mover subtotales o posiciones, para que el Tesorero siempre vea lo mismo que se vivió en
// la mesa sin depender de que alguien copie datos a mano de un módulo a otro. Recibe `estado` ya
// calculado (50ª entrega) para no recalcularlo dos veces — el handler principal ya lo necesita para
// "congelar" lugar/premio/puntos en cada jugador antes de guardar.
async function espejarEnCobranza(campeonato, fecha, estado) {
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

    const ahora = new Date().toISOString();

    // 49ª entrega: se piden PRIMERO los datos de otros stores (Tablero, Calendario) — que no cambian
    // seguido y no hace falta que estén "frescos al segundo" — para que la lectura del propio store de
    // Game Night quede lo más pegada posible al guardado que viene después. Antes esta lectura y el
    // guardado final quedaban separados por dos round-trips de red completos (Tablero + Calendario), lo
    // que ampliaba la ventana en la que dos acciones casi simultáneas (ej. dos clics rápidos de Re-buy)
    // podían leer la misma versión vieja y una terminar pisando a la otra al guardar.
    const [tableroMapa, torneosCal, campeonatoActivo] = await Promise.all([
      tableroMapaActual(),
      calendarioTorneos(),
      campeonatoActivoActual(),
    ]);
    const tipo = tipoDeFecha(torneosCal, fecha);
    // 48ª entrega: la tolerancia de check-in ya solo se usa para mostrarle un mensaje informativo al
    // Host (se calcula y se manda en `avisoTolerancia`) — ya no amonesta a nadie automáticamente.
    const toleranciaMin = tableroMapa?.[campeonato]?.toleranciaCheckinMin ?? 10;
    const recomprasMax = recomprasMaxEfectivo(tableroMapa, campeonato);

    const raw = await leerMapaConReintento(store);
    const mapa = normalizarMapa(raw);
    const torneo = getTorneo(mapa, campeonato, fecha);

    // 45ª entrega: ya no existe un botón "Iniciar torneo" — la hora de inicio para medir la tolerancia
    // de check-in sale directo de la fecha/hora que ya está guardada en el Calendario para este torneo
    // (se recalcula en cada acción, así que si Federico corrige la hora en el Calendario después, el
    // cambio se refleja solo). Se sigue guardando en `torneo.horaInicio` únicamente para mostrarla y
    // para el histórico que se sincroniza a `GameNight_Sesiones` en Excel.
    const torneoCalActual = torneoCalendarioDe(torneosCal, campeonato, fecha);
    const horaInicio = horaInicioProgramada(torneoCalActual);
    if (horaInicio) torneo.horaInicio = horaInicio;

    let avisoAmonestacion = "";

    // 50ª entrega: un torneo ya "Concluido" queda cerrado formalmente y su acción no se puede
    // deshacer — el servidor rechaza cualquier otra acción sobre él, salvo "reiniciarTorneo" (limpieza
    // administrativa explícita, ver más abajo), para que quede protegido incluso si alguien deja
    // abierta la pantalla de Game Night en ese torneo.
    if (torneo.concluido && body.accion !== "reiniciarTorneo") {
      return new Response(
        JSON.stringify({ error: "Este torneo ya quedó concluido y no se puede modificar." }),
        { status: 409, headers: HEADERS }
      );
    }

    // 51ª entrega: el mismo orden cronológico obligatorio que aplica el combo de Game Night en el
    // cliente (`torneoBloqueante()`) se aplica también aquí — si hay una partida pendiente (del
    // campeonato activo o de práctica) por concluir y es ANTERIOR, por calendario, a la que se está
    // por tocar, se rechaza cualquier acción salvo "reiniciarTorneo" (limpieza administrativa, que debe
    // poder usarse sobre cualquier fecha para deshacer datos mezclados, esté o no bloqueada).
    const bloqueante = torneoBloqueante(torneosCal, mapa, campeonatoActivo);
    if (bloqueante && body.accion !== "reiniciarTorneo" && (bloqueante.campeonato !== campeonato || bloqueante.fecha !== fecha)) {
      return new Response(
        JSON.stringify({
          error: `Hay que jugar/concluir primero la partida del ${bloqueante.fecha} antes de trabajar en esta.`,
        }),
        { status: 409, headers: HEADERS }
      );
    }

    if (body.accion === "concluir") {
      // cierra formalmente el torneo con las cifras que ya están calculadas en este momento (lugares,
      // premios, killers, etc. — todo ya vive en `torneo`, no hace falta recalcular nada especial) y
      // dispara un último sync a Excel para dejar esas cifras finales registradas ahí también.
      torneo.concluido = true;
      torneo.concluidoEn = ahora;
    } else if (body.accion === "reiniciarTorneo") {
      // 49ª/50ª entrega: limpieza administrativa explícita — Federico la pidió para poder deshacer un
      // torneo cuyos datos quedaron mezclados con otro por el bug de lectura en null de la 47ª/48ª
      // entrega. Deja el torneo como si nunca se hubiera tocado. Es la única acción que se permite
      // incluso sobre un torneo ya Concluido, precisamente para poder deshacer un cierre hecho por error.
      //
      // 57ª entrega: Federico pidió borrar por completo un torneo de práctica de "cualquier parte que
      // exista en el Excel" porque lo iba a volver a crear de cero — al probarlo se encontró que esta
      // acción, hasta ahora, solo VACIABA los campos del torneo (`torneo.jugadores = {}`, etc.) pero
      // dejaba la llave `mapa[campeonato][fecha]` viva en el store, así que `GameNight_Sesiones` en
      // Excel seguía sincronizando un renglón "fantasma" para esa fecha (sesión vacía, sin jugadores)
      // para siempre, sin ninguna acción que lo hiciera desaparecer. Ahora se borra la llave del mapa
      // por completo — `getTorneo()` (arriba) ya sabe recrear una entrada vacía sola la próxima vez que
      // alguien la necesite (ej. si Federico vuelve a usar la misma fecha), así que no hace falta dejar
      // un objeto vacío de relleno. El resto del código de abajo (espejo hacia Cobranza, sync a Excel)
      // sigue funcionando igual porque sigue teniendo la referencia a `torneo` en esta variable, aunque
      // ya no esté colgada del mapa.
      delete mapa[campeonato][fecha];
      if (Object.keys(mapa[campeonato]).length === 0) delete mapa[campeonato];
    } else if (body.accion === "checkin") {
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!correo) return new Response(JSON.stringify({ error: "Falta el correo del jugador." }), { status: 400, headers: HEADERS });
      const manual = Boolean(body.manual);
      // 48ª entrega: la activación ya NO amonesta sola por pasarse del tiempo de tolerancia — Federico
      // pidió que el tiempo sea "simplemente ilustrativo".
      // 51ª entrega: Federico confirmó la regla que habíamos quedado — si el Host tiene que activar a
      // mano a un jugador (`manual: true`, botón "Activar (manual)"/"Activar seleccionados"), eso en sí
      // ya significa que no hizo su propio check-in a tiempo, así que queda amonestado automáticamente
      // (pierde el punto de asistencia). El check-in de autoservicio del propio jugador (`manual:
      // false`, el botón "Hacer mi check-in") nunca amonesta solo. El toggle "Amonestar" de la tabla
      // sigue existiendo como corrección manual, por si el Host necesita revertir un caso puntual (ej.
      // activó manual por error, o el jugador sí avisó a tiempo por otro medio).
      torneo.jugadores[correo] = normalizarJugadorGN({
        ...torneo.jugadores[correo],
        nombre: body.nombre || torneo.jugadores[correo]?.nombre || "",
        checkin: true,
        manual,
        amonestado: manual ? true : Boolean(torneo.jugadores[correo]?.amonestado),
        horaCheckin: ahora,
        buyIn: true,
        actualizado: ahora,
      });
    } else if (body.accion === "checkinMasivo") {
      // activación manual de varios jugadores al mismo tiempo (45ª entrega) — desde la 51ª entrega
      // también amonesta automáticamente a cada uno, igual que la activación individual manual (ver
      // nota arriba), porque `checkinMasivo` siempre es una activación hecha por el Host, nunca
      // autoservicio.
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
          amonestado: true,
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

    // 50ª entrega: se calcula el estado derivado (lugar de salida, premio total, puntos, campeón,
    // burbuja) UNA sola vez aquí y se "congela" en cada jugador antes de guardar — así, cuando el
    // torneo quede Concluido, `GameNight_Jugadores` en Excel ya trae esas cifras finales sin depender
    // de que alguien vuelva a tocar el torneo para que se recalculen. Se salta para "reiniciarTorneo"
    // porque ese torneo ya quedó vacío (nada que calcular).
    let estado = null;
    if (body.accion !== "reiniciarTorneo") {
      estado = estadoTorneo({ jugadoresState: torneo.jugadores, tableroMapa, campeonato, tipo, ordenEliminados: torneo.ordenEliminados });
      for (const correo of Object.keys(torneo.jugadores)) {
        const j = estado.porJugador[correo];
        if (!j) continue;
        torneo.jugadores[correo] = {
          ...torneo.jugadores[correo],
          lugar: j.lugar || null,
          premioTotal: j.premioTotal || 0,
          puntos: j.puntos || 0,
          esCampeon: Boolean(j.esCampeon),
        };
      }
    }

    await store.setJSON("data", mapa);

    // 50ª entrega: Federico reportó que un solo clic de Re-buy/Add-on "se demora mucho" — la causa es
    // que cada acción espera a que termine de escribirse en Excel (reescribe hojas completas vía Graph
    // API) antes de responder. `syncGameNight` y el espejo en Cobranza escriben hojas DISTINTAS del
    // mismo Excel, así que no hace falta esperar a que termine una para empezar la otra — lanzarlas en
    // paralelo (en vez de una tras otra, como antes) recorta a la mitad esa espera para cualquier
    // torneo de un campeonato real. `syncGameNight` ya nunca tira error (usa `safe()` internamente);
    // el espejo en Cobranza sí se protege aquí para no tumbar la respuesta de Game Night si falla. Las
    // partidas de práctica (43ª entrega) NUNCA se reflejan en Cobranza: no pertenecen a ningún
    // campeonato real, así que no deben generar movimientos de cobro ni premio.
    const tareasSync = [syncGameNight(mapa)];
    if (body.accion === "reiniciarTorneo") {
      // limpieza administrativa: también hay que borrar el espejo viejo en Cobranza para esa fecha,
      // sea cual sea el campeonato (incluida una práctica, por si alguna vez llegó a espejarse por
      // error) — nunca generar uno nuevo a partir del torneo ya vacío.
      tareasSync.push(
        eliminarMovimientosDeGameNight(campeonato, fecha).catch((e) => {
          console.error("[gamenight] no se pudo limpiar el espejo en Cobranza:", e.message || e);
        })
      );
    } else if (campeonato !== PRACTICA_CAMPEONATO) {
      tareasSync.push(
        espejarEnCobranza(campeonato, fecha, estado).catch((e) => {
          console.error("[gamenight] no se pudo espejar en Cobranza:", e.message || e);
        })
      );
      // 51ª entrega: al confirmar "Jugada Concluida", además del espejo en vivo de siempre, se agrega
      // un registro permanente/auditable en la hoja "Cobranza_Cierres" (ver `registrarCierreTorneo()`
      // en cobranza.js) — a diferencia del espejo, este historial nunca se vuelve a escribir para un
      // torneo ya cerrado, ni siquiera si después se usa "Reiniciar este torneo" sobre esa misma fecha.
      // No aplica a partidas de práctica (nunca generan cobros/premios reales, ver arriba).
      if (body.accion === "concluir") {
        tareasSync.push(
          registrarCierreTorneo(campeonato, fecha, tipo, estado, ahora).catch((e) => {
            console.error("[gamenight] no se pudo registrar el cierre auditable en Cobranza:", e.message || e);
          })
        );
      }
    }
    await Promise.all(tareasSync);

    return new Response(JSON.stringify({ ...mapa, avisoAmonestacion }), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/gamenight" };
