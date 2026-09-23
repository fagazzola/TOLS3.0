import { getStore } from "@netlify/blobs";
import seed from "../../src/data/jugadores.json";
import { syncJugadores, leerJugadoresDesdeExcel } from "./lib/msgraph.js";
import { validarCuentaCobro } from "../../src/lib/cobranza.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// mismo patrón defensivo del resto de los stores: rellena campos faltantes en vez de tronar.
// 66ª entrega: se eliminó por completo el concepto de "Host" (rol especial con acceso a Game Night) —
// Federico pidió quitar el perfil, la función de asignación y sus candados, ya que Game Night quedó
// oculto y se reemplazó por el flujo de archivos de Estadísticas. Los campos `host`/`hostFecha` ya no
// viven en el modelo de datos; las columnas Host/Host Fecha del Excel se dejan en su lugar (ver
// msgraph.js) pero siempre en blanco, para no correr las columnas que van después.
function normalizarUno(j) {
  return {
    id: Number(j?.id) || 0,
    nombre: String(j?.nombre || "").trim(),
    aliasJugador: String(j?.aliasJugador || "").trim(),
    aliasPokerStars: String(j?.aliasPokerStars || "").trim(),
    padrino: String(j?.padrino || "").trim(),
    telefono: String(j?.telefono || "").trim(),
    correo: String(j?.correo || "").trim().toLowerCase(),
    tipoUsuario: String(j?.tipoUsuario || "Jugador").trim(),
    fecNac: String(j?.fecNac || "").trim(),
    edad: Number(j?.edad) || 0,
    fechaRegistro: String(j?.fechaRegistro || "").trim(),
    estatus: String(j?.estatus || "Activo").trim(),
    // 35ª entrega: mano inicial de Texas Hold'em favorita del jugador (ej. "AKs", "77"), elegida desde
    // "Mi Perfil" con el selector de rango de manos — puramente informativo/de perfil, no afecta ningún
    // cálculo del sitio. Se sincroniza a la columna "Mano Favorita" (K) de la hoja Jugadores del Excel.
    manoFavorita: String(j?.manoFavorita || "").trim(),
    // 44ª entrega: datos de cobro para depositarle premios — antes vivían solo en tols-cobranza
    // (hoja Cobranza_Resumen), centralizados aquí junto con el resto del perfil del jugador a pedido de
    // Federico. `tipoCuenta` es "CLABE" o "Tarjeta de Débito" (ver TIPOS_CUENTA en src/lib/cobranza.js);
    // `cuenta` se valida con validarCuentaCobro() antes de guardarse (18 dígitos para CLABE, 16 para
    // tarjeta, solo numéricos) — ver la acción "autoeditar" más abajo.
    cuenta: String(j?.cuenta || "").trim(),
    banco: String(j?.banco || "").trim(),
    tipoCuenta: String(j?.tipoCuenta || "").trim(),
  };
}

export function normalizar(data) {
  const lista = Array.isArray(data?.jugadores) ? data.jugadores : Array.isArray(seed.jugadores) ? seed.jugadores : [];
  return { jugadores: lista.map(normalizarUno) };
}

// 35ª entrega: Federico reportó que en "Mi Perfil" faltaban Teléfono/Fecha de Nacimiento (y a veces los
// Alias) para jugadores cuyo dato real vive en el Excel (cargado ahí a mano) pero nunca se capturó en el
// sitio (cuentas de antes del autorregistro actual). Pidió explícitamente: "Los datos del jugador deben
// ser extraídos del Excel". Fix: en cada GET, si algún jugador tiene alguno de esos campos vacío, se hace
// una lectura best-effort de la hoja "Jugadores" (misma función que ya usa el botón "Importar desde
// Excel") y se rellenan SOLO los campos vacíos de cada jugador que sí tengan valor en Excel — nunca se
// pisa un dato que el jugador ya haya cargado desde el sitio. Si la lectura a Excel falla, no bloquea la
// carga (mismo criterio de tolerancia a fallos que el resto del sitio). Una vez relleno, se guarda en
// tols-jugadores para no tener que volver a leer el Excel en cada carga futura.
// una fecha se considera "buena" solo si ya viene en formato AAAA-MM-DD — cualquier otra cosa (vacío,
// o el número serial de Excel que se colaba antes del fix de fechaExcelAISO en msgraph.js) cuenta como
// faltante, para que una fecha que haya quedado mal guardada por versiones anteriores se autocorrija
// solo en el próximo GET, sin que Federico tenga que hacer nada.
function fecEsValida(f) {
  return /^\d{4}-\d{2}-\d{2}$/.test(f || "");
}

function faltanDatosBasicos(jugadores) {
  return jugadores.some((j) => !j.telefono || !fecEsValida(j.fecNac) || !j.aliasJugador || !j.aliasPokerStars);
}

async function backfillDesdeExcel(jugadores) {
  try {
    const filasExcel = await leerJugadoresDesdeExcel();
    const porCorreo = new Map(filasExcel.map((f) => [f.correo, f]));
    let cambio = false;
    const rellenos = jugadores.map((j) => {
      const ex = porCorreo.get(j.correo);
      if (!ex) return j;
      const r = { ...j };
      if (!r.aliasJugador && ex.aliasJugador) { r.aliasJugador = ex.aliasJugador; cambio = true; }
      if (!r.aliasPokerStars && ex.aliasPokerStars) { r.aliasPokerStars = ex.aliasPokerStars; cambio = true; }
      if (!r.telefono && ex.telefono) { r.telefono = ex.telefono; cambio = true; }
      if (!fecEsValida(r.fecNac) && fecEsValida(ex.fecNac)) {
        r.fecNac = ex.fecNac;
        if (!r.edad && ex.edad) r.edad = ex.edad;
        cambio = true;
      }
      if (!r.manoFavorita && ex.manoFavorita) { r.manoFavorita = ex.manoFavorita; cambio = true; }
      return r;
    });
    return { cambio, jugadores: rellenos };
  } catch (e) {
    console.error("[jugadores] backfill desde Excel falló (no bloquea la carga):", e.message || e);
    return { cambio: false, jugadores };
  }
}

// calcula edad a partir de la fecha de nacimiento (YYYY-MM-DD) — se usa cuando el propio jugador
// edita su FecNac desde "Mi Perfil", para que Edad nunca quede desincronizada de lo que escribió
function edadDesdeFecNac(fecNac) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecNac || "")) return null;
  const nacimiento = new Date(fecNac + "T00:00:00");
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const noHaCumplido = hoy.getMonth() < nacimiento.getMonth() || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (noHaCumplido) edad -= 1;
  return edad >= 0 ? edad : null;
}

export default async (req) => {
  const store = getStore({ name: "tols-jugadores", consistency: "strong" });

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json", consistency: "strong" });
    let normalizado = normalizar(raw);

    let cambioBackfill = false;
    if (faltanDatosBasicos(normalizado.jugadores)) {
      const backfill = await backfillDesdeExcel(normalizado.jugadores);
      if (backfill.cambio) {
        normalizado = { jugadores: backfill.jugadores };
        cambioBackfill = true;
      }
    }

    if (!raw || cambioBackfill || JSON.stringify(raw) !== JSON.stringify(normalizado)) {
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
    let actual = normalizar(raw);

    // accion "autoeditar": el propio jugador actualiza su registro desde "Mi Perfil" (rol Jugador).
    // Se busca por correo (no por id, para no depender de que el jugador conozca su id interno).
    // Campos que NUNCA se tocan por esta vía: id, nombre, correo, tipoUsuario, fechaRegistro, estatus
    // (de solo administración) y Padrino (lo asigna el administrador, no se autodeclara). La Edad se
    // recalcula sola si mandan FecNac nueva.
    if (body?.accion === "autoeditar") {
      const correo = String(body.correo || "").trim().toLowerCase();
      const idx = actual.jugadores.findIndex((j) => j.correo === correo);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: "No se encontró un jugador con ese correo." }), { status: 404, headers: HEADERS });
      }
      const editable = { ...actual.jugadores[idx] };
      if (body.aliasJugador !== undefined) editable.aliasJugador = String(body.aliasJugador || "").trim();
      if (body.aliasPokerStars !== undefined) editable.aliasPokerStars = String(body.aliasPokerStars || "").trim();
      if (body.telefono !== undefined) editable.telefono = String(body.telefono || "").trim();
      if (body.fecNac !== undefined) {
        editable.fecNac = String(body.fecNac || "").trim();
        const edadCalc = edadDesdeFecNac(editable.fecNac);
        if (edadCalc !== null) editable.edad = edadCalc;
      }
      if (body.manoFavorita !== undefined) editable.manoFavorita = String(body.manoFavorita || "").trim();
      // 44ª entrega: datos de cobro (CLABE/Tarjeta) — se validan aquí también (no solo en el navegador)
      // para que nunca quede guardado algo que no sea el número exacto de dígitos, aunque el cliente
      // falle. Esta misma acción la usa tanto Mi Perfil (el propio jugador, con su correo) como el
      // Tesorero desde Cobranza (editando en nombre de otro jugador por su correo) — "autoeditar" en el
      // nombre es histórico, no implica que solo el dueño de la cuenta pueda llamarla.
      if (body.cuenta !== undefined || body.banco !== undefined || body.tipoCuenta !== undefined) {
        const nuevaCuenta = body.cuenta !== undefined ? String(body.cuenta || "").trim() : editable.cuenta;
        const nuevoBanco = body.banco !== undefined ? String(body.banco || "").trim() : editable.banco;
        const nuevoTipo = body.tipoCuenta !== undefined ? String(body.tipoCuenta || "").trim() : editable.tipoCuenta;
        const errorCuenta = validarCuentaCobro(nuevaCuenta, nuevoTipo);
        if (errorCuenta) {
          return new Response(JSON.stringify({ error: errorCuenta }), { status: 400, headers: HEADERS });
        }
        editable.cuenta = nuevaCuenta;
        editable.banco = nuevoBanco;
        editable.tipoCuenta = nuevoTipo;
      }
      actual.jugadores[idx] = editable;
      await store.setJSON("data", actual);
      await syncJugadores(actual.jugadores);
      return new Response(JSON.stringify(actual), { headers: HEADERS });
    }

    // solo permite editar Padrino y Estatus de un jugador ya existente — el resto de los campos
    // quedan fijos porque el jugador los llenó él mismo al autorregistrarse
    const { id, padrino, estatus } = body || {};
    const idx = actual.jugadores.findIndex((j) => j.id === Number(id));
    if (idx === -1) {
      return new Response(JSON.stringify({ error: "No se encontró ese jugador." }), { status: 404, headers: HEADERS });
    }
    if (padrino !== undefined) actual.jugadores[idx].padrino = String(padrino || "").trim();
    if (estatus !== undefined) actual.jugadores[idx].estatus = String(estatus || "Activo").trim();
    await store.setJSON("data", actual);
    await syncJugadores(actual.jugadores);
    return new Response(JSON.stringify(actual), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/jugadores" };
