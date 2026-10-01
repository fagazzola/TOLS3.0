import { getStore } from "@netlify/blobs";
import seed from "../../src/data/cobranza.json";
import { syncCobranza, syncCierres } from "./lib/msgraph.js";
import { conMontos, resumenPorJugador, tieneAdeudoBloqueante } from "../../src/lib/cobranza.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// 44ª entrega: cuenta/banco/tipoCuenta se centralizaron en tols-jugadores (editables desde Mi Perfil,
// con validación de CLABE/Tarjeta — ver src/lib/cobranza.js y netlify/functions/jugadores.js). El
// registro propio de Cobranza (tols-cobranza.jugadores) ya solo guarda lo que es genuinamente de
// Cobranza: el nombre de respaldo para un correo que el Tesorero registró a mano sin que exista todavía
// en Jugadores, y las excepciones de adeudo aprobadas.
function normalizarJugador(j) {
  return {
    nombre: String(j?.nombre || "").trim(),
    excepciones: Array.isArray(j?.excepciones) ? j.excepciones.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)) : [],
  };
}

// lee el directorio de Jugadores (tols-jugadores) por correo, para sacar de ahí cuenta/banco/tipoCuenta
// al armar el resumen de Cobranza — best-effort: si falla, el resumen simplemente muestra esos tres
// campos vacíos en vez de tronar.
async function directorioJugadoresActual() {
  try {
    const store = getStore({ name: "tols-jugadores", consistency: "strong" });
    const raw = await store.get("data", { type: "json", consistency: "strong" });
    const lista = Array.isArray(raw?.jugadores) ? raw.jugadores : [];
    const porCorreo = {};
    for (const j of lista) porCorreo[String(j.correo || "").trim().toLowerCase()] = j;
    return porCorreo;
  } catch (e) {
    return {};
  }
}

// arma, para cada correo que aparece en Cobranza (registro propio o con algún movimiento) o en el
// directorio de Jugadores, el dict que espera resumenPorJugador()/tieneAdeudoBloqueante(): nombre y
// cuenta/banco/tipoCuenta salen del directorio de Jugadores cuando existe (fuente de verdad desde la
// 44ª entrega); excepciones y el nombre de respaldo salen del propio registro de Cobranza.
function jugadoresParaResumen(cobranzaJugadores, directorio) {
  const correos = new Set([...Object.keys(cobranzaJugadores || {}), ...Object.keys(directorio || {})]);
  const out = {};
  for (const correo of correos) {
    const cj = cobranzaJugadores?.[correo] || {};
    const dj = directorio?.[correo] || {};
    out[correo] = {
      nombre: dj.nombre || cj.nombre || "",
      cuenta: dj.cuenta || "",
      banco: dj.banco || "",
      tipoCuenta: dj.tipoCuenta || "",
      excepciones: cj.excepciones || [],
    };
  }
  return out;
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

// 74ª entrega: `enviosSaldo` registra, por "campeonato|fecha|correo", cuándo (ISO) se le mandó al
// jugador el correo de "Saldo Torneo" desde "Resultados de Torneos" — así la tabla puede mostrar "ya se
// envió" sin depender de nada que viva solo en la sesión del navegador del Tesorero.
function normalizarEnviosSaldo(v) {
  const out = {};
  if (v && typeof v === "object") {
    for (const [clave, fecha] of Object.entries(v)) {
      if (typeof fecha === "string" && fecha) out[clave] = fecha;
    }
  }
  return out;
}

// 76ª entrega: un registro de pago/depósito confirmado — "monto esperado" (lo que el torneo o el gasto
// del Tablero dice que corresponde) vs "monto" (lo que el Tesorero realmente registra que se recibió o
// se depositó, editable porque puede no coincidir centavo a centavo con lo esperado). `fecha`/`hora` son
// el día/hora que el Tesorero quiso dejar asentado (no necesariamente "ahora"); `registradoEn` es el
// timestamp real del servidor al momento de guardar, para auditoría.
function normalizarRegistroPago(v) {
  return {
    montoEsperado: Math.max(0, Number(v?.montoEsperado) || 0),
    monto: Math.max(0, Number(v?.monto) || 0),
    fecha: String(v?.fecha || "").trim(),
    hora: String(v?.hora || "").trim(),
    registradoEn: String(v?.registradoEn || "").trim() || new Date().toISOString(),
  };
}
function normalizarMapaPagos(v) {
  const out = {};
  if (v && typeof v === "object") {
    for (const [clave, reg] of Object.entries(v)) {
      if (reg && typeof reg === "object") out[clave] = normalizarRegistroPago(reg);
    }
  }
  return out;
}

// 83ª entrega: exportada (junto con respuestaCompleta/filasParaExcel más abajo) para que
// lib/exportar-excel.js pueda reconstruir exactamente las mismas filas que ya arma esta pantalla al
// guardar, en vez de reimplementar la lógica de Cobranza por su cuenta.
export function normalizar(data) {
  const base = data && typeof data === "object" ? data : {};
  const jugadores = {};
  for (const [correo, j] of Object.entries(base.jugadores || (Array.isArray(seed.jugadores) ? {} : seed.jugadores) || {})) {
    jugadores[String(correo).trim().toLowerCase()] = normalizarJugador(j);
  }
  const movimientos = (Array.isArray(base.movimientos) ? base.movimientos : seed.movimientos || []).map(normalizarMovimiento);
  const enviosSaldo = normalizarEnviosSaldo(base.enviosSaldo);
  // 76ª entrega: "Registrar pagos y depósitos" rediseñado — tres mapas nuevos, cada uno keyed por una
  // clave estable que identifica de forma única una combinación jugador+motivo, para que reconfirmar el
  // mismo pago/depósito sobrescriba el registro anterior en vez de duplicarlo:
  //   pagosTorneo:     "campeonato|fecha|correo"          (el jugador le pagó a TOLS su Debe de ese torneo)
  //   depositosTorneo: "campeonato|fecha|correo"          (TOLS le depositó al jugador su Premio de ese torneo)
  //   depositosGasto:  "campeonato|concepto|correo"       (TOLS le depositó a un jugador un gasto del Tablero)
  const pagosTorneo = normalizarMapaPagos(base.pagosTorneo);
  const depositosTorneo = normalizarMapaPagos(base.depositosTorneo);
  const depositosGasto = normalizarMapaPagos(base.depositosGasto);
  return { jugadores, movimientos, enviosSaldo, pagosTorneo, depositosTorneo, depositosGasto };
}

// próxima fecha (hoy o después) del campeonato activo — mismo criterio que usa Jugadores.jsx para el
// Host, para que "próximo torneo" signifique lo mismo en toda la app
async function proximaFechaActiva() {
  try {
    const [calStore, campStore] = [getStore({ name: "tols-calendario", consistency: "strong" }), getStore({ name: "tols-campeonatos", consistency: "strong" })];
    const [cal, camp] = await Promise.all([
      calStore.get("data", { type: "json", consistency: "strong" }),
      campStore.get("data", { type: "json", consistency: "strong" }),
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
    const store = getStore({ name: "tols-tablero", consistency: "strong" });
    return (await store.get("data", { type: "json", consistency: "strong" })) || {};
  } catch (e) {
    return {};
  }
}

// arma la respuesta completa que consume el frontend: datos crudos + todo ya calculado, para que
// Cobranza.jsx y Jugadores.jsx no tengan que reimplementar la lógica de cobranza.js
export async function respuestaCompleta(data) {
  const [tableroMapa, { fecha: proximaFecha, torneos }, directorio] = await Promise.all([
    tableroMapaActual(),
    proximaFechaActiva(),
    directorioJugadoresActual(),
  ]);
  const movimientos = conMontos(data.movimientos, tableroMapa, torneos);
  const jugadoresResumen = jugadoresParaResumen(data.jugadores, directorio);
  const resumen = resumenPorJugador(movimientos, jugadoresResumen);
  const adeudos = {};
  for (const correo of Object.keys(resumen)) {
    adeudos[correo] = tieneAdeudoBloqueante(correo, movimientos, jugadoresResumen, proximaFecha);
  }
  return {
    jugadores: data.jugadores,
    movimientos,
    resumen,
    adeudos,
    proximaFecha,
    enviosSaldo: data.enviosSaldo || {},
    pagosTorneo: data.pagosTorneo || {},
    depositosTorneo: data.depositosTorneo || {},
    depositosGasto: data.depositosGasto || {},
  };
}

// 74ª entrega: usada por netlify/functions/cobranza-enviar-saldo.js justo después de mandar el correo de
// "Saldo Torneo" — marca esa combinación campeonato+fecha+correo como enviada (con la hora ISO) para que
// "Resultados de Torneos" pueda mostrar "ya se envió" en la tabla sin depender de estado local del
// navegador del Tesorero. Nunca se llama si el envío del correo falló.
export async function marcarSaldoEnviado(campeonato, fecha, correo) {
  const store = getStore({ name: "tols-cobranza", consistency: "strong" });
  const raw = await store.get("data", { type: "json", consistency: "strong" });
  const actual = normalizar(raw);
  const clave = `${campeonato}|${fecha}|${String(correo).trim().toLowerCase()}`;
  actual.enviosSaldo[clave] = new Date().toISOString();
  await store.setJSON("data", actual);
  return respuestaCompleta(actual);
}

export function filasParaExcel({ movimientos, resumen }) {
  // 58ª entrega: Federico pidió quitar Cuenta/Banco/Tipo de Cuenta de "Cobranza_Resumen" — ese dato
  // (con el fix de la 56ª, `celdaTexto()`) ya solo vive en la hoja "Jugadores"
  // (`filasJugadoresUnificadas()` en msgraph.js), que es donde se edita desde Mi Perfil/Cobranza. Tenerlo
  // en dos hojas era justo lo que Federico no quería. `syncCobranza()` en msgraph.js limpia las columnas
  // C/D/E que antes ocupaban estos tres campos (`minClearCols: 8`) para que no se queden con el último
  // valor que alcanzaron a tener.
  const resumenRows = Object.values(resumen)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((r) => [r.correo, r.nombre, r.pago, r.deposito, r.saldo]);
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
  const store = getStore({ name: "tols-cobranza", consistency: "strong" });
  const raw = await store.get("data", { type: "json", consistency: "strong" });
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

// 50ª entrega: usada por la acción "reiniciarTorneo" de Game Night — al reiniciar un torneo desde cero
// (limpieza administrativa, ej. datos que quedaron mezclados entre dos fechas por el bug de la 47ª/48ª
// entrega), hay que borrar también los movimientos que ya se habían espejado en Cobranza para ese
// campeonato+fecha (`gn-{campeonato}-{fecha}-{correo}`) — si no, quedarían "huérfanos" mostrando
// buy-in/premios de la partida que se acaba de invalidar.
export async function eliminarMovimientosDeGameNight(campeonato, fecha) {
  const store = getStore({ name: "tols-cobranza", consistency: "strong" });
  const raw = await store.get("data", { type: "json", consistency: "strong" });
  const actual = normalizar(raw);
  const prefijo = `gn-${campeonato}-${fecha}-`;
  const antes = actual.movimientos.length;
  actual.movimientos = actual.movimientos.filter((m) => !String(m.id || "").startsWith(prefijo));
  if (actual.movimientos.length === antes) return; // nada que borrar, no hace falta re-guardar
  await store.setJSON("data", actual);
  const completa = await respuestaCompleta(actual);
  await syncCobranza(filasParaExcel(completa));
}

// 51ª entrega: Federico pidió que, al confirmar "Jugada Concluida" en Game Night, quede un registro
// financiero AUDITABLE en Excel para el Tesorero — a quién hay que cobrarle y a quién hay que pagarle,
// con las cifras exactas del cierre. A diferencia del espejo en vivo de Cobranza (`upsertVariosDesde
// GameNight`, que se reescribe completo en cada acción y se puede vaciar con "Reiniciar este torneo"),
// este historial vive en su propio store (`tols-cierres`) y solo CRECE: cada llamada agrega un
// registro por jugador al final de la lista que ya había, nunca modifica ni borra los de un cierre
// anterior — ni siquiera si ese mismo torneo se reinicia después (el reinicio limpia el espejo en vivo
// de Cobranza, pero el cierre que ya quedó auditado aquí se conserva tal cual se vio en su momento).
// Se llama una sola vez, desde la acción "concluir" de Game Night, con el `estado` ya calculado
// (mismo objeto que se usa para congelar lugar/premio/puntos en cada jugador antes de guardar).
export async function registrarCierreTorneo(campeonato, fecha, tipo, estado, concluidoEn) {
  const store = getStore({ name: "tols-cierres", consistency: "strong" });
  const raw = await store.get("data", { type: "json", consistency: "strong" });
  const actual = Array.isArray(raw?.registros) ? raw.registros : [];

  const nuevos = Object.entries(estado.porJugador || {}).map(([correo, j]) => {
    const balance = Math.round(((j.premioTotal || 0) - (j.debeTotal || 0)) * 100) / 100;
    return {
      campeonato,
      fecha,
      tipo,
      correo,
      nombre: j.nombre || "",
      buyIn: Boolean(j.buyIn),
      rebuys: Number(j.rebuys) || 0,
      addon: Boolean(j.addon),
      debeBuyIn: j.debeBuyIn || 0,
      debeRebuys: j.debeRebuys || 0,
      debeAddon: j.debeAddon || 0,
      debeTotal: j.debeTotal || 0,
      lugar: j.lugar || null,
      esCampeon: Boolean(j.esCampeon),
      premioLugar: j.premioLugar || 0,
      premioBurbuja: j.premioBurbuja || 0,
      premioMano: j.premioMano || 0,
      premioTotal: j.premioTotal || 0,
      balance,
      accion: balance > 0 ? "Pagar al jugador" : balance < 0 ? "Cobrar al jugador" : "Sin movimiento",
      concluidoEn,
    };
  });

  const actualizado = [...actual, ...nuevos];
  await store.setJSON("data", { registros: actualizado });
  await syncCierres(actualizado);
  return actualizado;
}

// usada por campeonatos.js al renombrar un campeonato: remapea movimientos[].campeonato de "de" a "a".
// También renombra el id de los movimientos generados por Game Night (`gn-{campeonato}-{fecha}-{correo}`)
// para que sigan siendo el mismo registro la próxima vez que se guarde ese Game Night con el nombre nuevo
// — si no se renombrara el id, upsertVariosDesdeGameNight generaría un id distinto y duplicaría la fila.
// 76ª entrega: las claves de enviosSaldo/pagosTorneo/depositosTorneo/depositosGasto empiezan todas con
// "{campeonato}|" — remapearlas en un renombre es el mismo criterio que ya se aplicaba a
// movimientos[].campeonato, solo que acá el nombre vive DENTRO de la clave del mapa en vez de en un
// campo aparte.
function remapearClavesCampeonato(mapa, de, a) {
  const out = {};
  let cambio = false;
  for (const [clave, val] of Object.entries(mapa || {})) {
    if (clave.startsWith(`${de}|`)) {
      out[`${a}|${clave.slice(de.length + 1)}`] = val;
      cambio = true;
    } else {
      out[clave] = val;
    }
  }
  return { mapa: out, cambio };
}

export async function renombrarCampeonatoEnCobranza(de, a) {
  const store = getStore({ name: "tols-cobranza", consistency: "strong" });
  const raw = await store.get("data", { type: "json", consistency: "strong" });
  const actual = normalizar(raw);
  const r1 = remapearClavesCampeonato(actual.enviosSaldo, de, a);
  const r2 = remapearClavesCampeonato(actual.pagosTorneo, de, a);
  const r3 = remapearClavesCampeonato(actual.depositosTorneo, de, a);
  const r4 = remapearClavesCampeonato(actual.depositosGasto, de, a);
  const cambia = actual.movimientos.some((m) => m.campeonato === de) || r1.cambio || r2.cambio || r3.cambio || r4.cambio;
  if (!cambia) return;
  const prefijoViejo = `gn-${de}-`;
  actual.movimientos = actual.movimientos.map((m) => {
    if (m.campeonato !== de) return m;
    const nuevoId = m.id.startsWith(prefijoViejo) ? `gn-${a}-${m.id.slice(prefijoViejo.length)}` : m.id;
    return { ...m, campeonato: a, id: nuevoId };
  });
  actual.enviosSaldo = r1.mapa;
  actual.pagosTorneo = r2.mapa;
  actual.depositosTorneo = r3.mapa;
  actual.depositosGasto = r4.mapa;
  await store.setJSON("data", actual);
  const completa = await respuestaCompleta(actual);
  await syncCobranza(filasParaExcel(completa));
}

export default async (req) => {
  const store = getStore({ name: "tols-cobranza", consistency: "strong" });

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json", consistency: "strong" });
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

    const raw = await store.get("data", { type: "json", consistency: "strong" });
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
    } else if (body?.accion === "registrarPago") {
      // 76ª entrega: confirma que un jugador pagó a TOLS el Debe de un torneo ya publicado en
      // Estadísticas — el monto esperado/el propio torneo lo calcula el cliente (ya tiene los datos de
      // Estadísticas cargados); acá solo se valida y persiste. Ojo: `fecha` es la fecha DEL TORNEO (la
      // clave del registro), no la fecha en que el Tesorero recibió el pago — esa es `fechaRegistro`,
      // un campo aparte (para no pisar uno con el otro).
      const campeonato = String(body.campeonato || "").trim();
      const fecha = String(body.fecha || "").trim();
      const correo = String(body.correo || "").trim().toLowerCase();
      if (!campeonato || !fecha || !correo) {
        return new Response(JSON.stringify({ error: "Falta el campeonato, el torneo o el jugador del pago." }), { status: 400, headers: HEADERS });
      }
      const clave = `${campeonato}|${fecha}|${correo}`;
      actual.pagosTorneo[clave] = normalizarRegistroPago({
        montoEsperado: body.montoEsperado,
        monto: body.monto,
        fecha: body.fechaRegistro,
        hora: body.horaRegistro,
      });
    } else if (body?.accion === "registrarDeposito") {
      // 76ª entrega: confirma que TOLS le depositó a un jugador — por el Premio de un torneo ya
      // publicado ("motivoTipo":"torneo", "motivoId": fecha del torneo) o por un gasto del Tablero de
      // Control ("motivoTipo":"gasto", "motivoId": concepto). `fechaRegistro` (la fecha en que se hizo el
      // depósito, distinta de `motivoId` cuando el motivo es un torneo) es obligatoria para un depósito
      // — a diferencia de un pago —, como pidió Federico.
      const campeonato = String(body.campeonato || "").trim();
      const motivoTipo = body.motivoTipo === "gasto" ? "gasto" : body.motivoTipo === "torneo" ? "torneo" : "";
      const motivoId = String(body.motivoId || "").trim();
      const correo = String(body.correo || "").trim().toLowerCase();
      const fechaRegistro = String(body.fechaRegistro || "").trim();
      if (!campeonato || !motivoTipo || !motivoId || !correo) {
        return new Response(JSON.stringify({ error: "Falta el campeonato, el motivo o el jugador del depósito." }), { status: 400, headers: HEADERS });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRegistro)) {
        return new Response(JSON.stringify({ error: "La fecha del depósito es obligatoria (AAAA-MM-DD)." }), { status: 400, headers: HEADERS });
      }
      const mapa = motivoTipo === "gasto" ? "depositosGasto" : "depositosTorneo";
      const clave = `${campeonato}|${motivoId}|${correo}`;
      actual[mapa][clave] = normalizarRegistroPago({
        montoEsperado: body.montoEsperado,
        monto: body.monto,
        fecha: fechaRegistro,
        hora: body.horaRegistro,
      });
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
