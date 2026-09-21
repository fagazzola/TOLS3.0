import { getStore } from "@netlify/blobs";
import { NIVEL_LABEL } from "../../../src/lib/permisos.js";

const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPE = "Files.ReadWrite offline_access";
const EXCEL_PATH = process.env.MS_EXCEL_PATH || "Personal/MX/TOLS/TOLS 3.0/TOLS3.0-Base-de-Datos.xlsx";

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// inverso de NIVEL_LABEL (ej. "Sólo lectura" → "lectura") para importar la hoja Permisos de vuelta
const NIVEL_LABEL_INV = Object.fromEntries(Object.entries(NIVEL_LABEL).map(([k, v]) => [v, k]));

// 36ª entrega: Federico reportó que "Fecha de Nacimiento" nunca se recuperaba desde el Excel en Mi
// Perfil, aunque "Teléfono" sí. Causa: en la hoja real, "Fecha de Nacimiento" es una celda con formato
// de fecha de Excel (confirmado con openpyxl: `datetime.datetime(1973, 4, 14, 0, 0)`), y el endpoint de
// Graph que se usa para leer rangos (`range().values`) devuelve esas celdas como el número serial de
// Excel (días desde el 30/12/1899, arrastrando el bug del año bisiesto 1900 de Excel por compatibilidad
// — la misma fórmula que usa el propio Excel), no como texto "AAAA-MM-DD". `String(valor)` sobre ese
// número daba algo como "26768", que no calza con el formato que espera `<input type="date">` (por eso
// el campo se veía vacío en el sitio) ni con la validación `/^\d{4}-\d{2}-\d{2}$/` de `edadDesdeFecNac`.
// "Teléfono" sí se recuperaba porque esa columna es numérica simple (ej. 5555555555), no una fecha, así
// que `String(valor)` ya daba el resultado correcto.
function fechaExcelAISO(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "string") {
    const m = valor.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000;
    const fecha = new Date(ms);
    return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString().slice(0, 10);
  }
  return "";
}

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 56ª entrega: Federico reportó que la CLABE (18 dígitos) y el número de Tarjeta (16 dígitos) de
// "Cuenta de cobro" se seguían guardando en formato científico en el Excel y perdiendo dígitos —
// escribir un valor via `writeSheetTable()` (más abajo) manda el string tal cual dentro de `values`, y
// Excel, igual que si alguien lo tecleara a mano, interpreta un texto que "parece número" como número:
// con 16-18 dígitos eso excede la precisión de un `Number` normal (~15 dígitos significativos) y el
// formato General de la celda lo muestra en notación científica, perdiendo los dígitos de más.
// Solución que pidió Federico, la misma que se usa a mano en Excel: anteponer un apóstrofo (') al
// valor — Excel lo toma como señal de "esto es texto" y no lo vuelve a mostrar (no queda como parte
// del valor visible ni de lo que se copia). Solo tiene sentido para un string de puros dígitos; un
// nombre, una fecha ya formateada como texto, o un campo vacío se guardan bien tal cual.
export function celdaTexto(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  return /^\d+$/.test(s) ? "'" + s : s;
}

// intercambia el refresh_token guardado por un access_token fresco — Microsoft rota el refresh_token
// en cada uso, así que el nuevo se vuelve a guardar cada vez (si no se hace, deja de servir en unos días)
async function getAccessToken() {
  const store = getStore({ name: "tols-ms-token", consistency: "strong" });
  const saved = await store.get("data", { type: "json", consistency: "strong" });
  if (!saved?.refresh_token) {
    throw new Error("OneDrive no está conectado. Visita /api/auth-onedrive-start para autorizarlo una vez.");
  }
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: saved.refresh_token,
    scope: SCOPE,
  });
  const r = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const json = await r.json();
  if (!r.ok) throw new Error("No se pudo renovar el token de OneDrive: " + (json.error_description || json.error || r.status));
  await store.setJSON("data", { refresh_token: json.refresh_token || saved.refresh_token, updated_at: Date.now() });
  return json.access_token;
}

async function graphFetch(pathSuffix, options = {}) {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE}/me/drive/root:/${encodePath(EXCEL_PATH)}:${pathSuffix}`;
  const r = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Graph API ${r.status} en ${pathSuffix}: ${text}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

// escribe una tabla completa en una hoja: limpia un rango amplio (para que filas que ya no existen no
// se queden con datos viejos) y escribe los valores nuevos a partir de startRow. No toca el encabezado.
// `minClearCols` (58ª entrega): cuando una hoja pierde columnas de una entrega a otra (ej.
// Cobranza_Resumen, que dejó de mandar Cuenta/Banco/Tipo de Cuenta), el rango que se limpia por default
// solo cubre las columnas que se van a escribir AHORA — las columnas viejas que quedaron más a la
// derecha (con el pago/depósito/saldo corrido, en este caso) nunca se tocarían y se quedarían con datos
// obsoletos para siempre. Pasar `minClearCols` fuerza a limpiar por lo menos esa cantidad de columnas,
// aunque se estén escribiendo menos.
async function writeSheetTable(sheetName, values, { startRow = 2, maxRows = 400, minClearCols = 0 } = {}) {
  const numCols = values[0] ? values[0].length : 1;
  const lastCol = colLetter(numCols);
  const clearRange = `A${startRow}:${colLetter(Math.max(numCols, minClearCols))}${startRow + maxRows - 1}`;
  const sheet = encodeURIComponent(sheetName);

  await graphFetch(`/workbook/worksheets('${sheet}')/range(address='${clearRange}')/clear`, {
    method: "POST",
    body: JSON.stringify({ applyTo: "Contents" }),
  });

  if (values.length === 0) return;
  const endRow = startRow + values.length - 1;
  await graphFetch(`/workbook/worksheets('${sheet}')/range(address='A${startRow}:${lastCol}${endRow}')`, {
    method: "PATCH",
    body: JSON.stringify({ values }),
  });
}

// lee una hoja completa (incluye el encabezado en la fila 0) pidiendo un rango FIJO y generoso
// (A1:AF4000) en vez de usedRange. Se descubrió (2026-09-15, hoja "Jugadores" ya con datos reales)
// que usedRange truena con "RangeExceedsLimit" en cuanto una hoja alguna vez tuvo formato o selección
// aplicada más allá de sus datos reales (basta con haber seleccionado toda la fila/columna una vez en
// Excel) — Graph la sigue contando como "usada" para siempre. Un rango fijo nunca tiene ese problema;
// las filas vacías de más se descartan solas más abajo (los `.filter()` que ya exigían columnas clave
// no vacías antes de contar una fila como válida).
async function readSheetAcotado(sheetName, { maxRows = 4000, maxCols = 32 } = {}) {
  const sheet = encodeURIComponent(sheetName);
  const rango = `A1:${colLetter(maxCols)}${maxRows}`;
  const json = await graphFetch(`/workbook/worksheets('${sheet}')/range(address='${rango}')`, { method: "GET" });
  const valores = json?.values || [];
  // quita las filas totalmente vacías al final (el rango fijo trae de sobra) para no confundir a
  // quien llame .length esperando solo filas con datos
  let ultima = valores.length - 1;
  while (ultima >= 0 && valores[ultima].every((v) => v === "" || v === null || v === undefined)) ultima--;
  return valores.slice(0, ultima + 1);
}

// crea la hoja si todavía no existe en el Excel maestro y le escribe el encabezado — usado por Game
// Night (MOD 5), que es el primer módulo cuyas hojas no se arman a mano de antemano. El resto de los
// módulos (Cobranza, Tablero, etc.) siguen esperando que la hoja ya exista, como hasta ahora.
//
// 50ª entrega: a diferencia de esas otras hojas, "GameNight_Sesiones"/"GameNight_Jugadores" son 100%
// administradas por el sitio — Federico nunca las arma ni las edita a mano — así que, a diferencia del
// resto del Excel, aquí SÍ es seguro reescribir el encabezado cada vez que cambie (por ejemplo, al
// agregar columnas nuevas como "Concluido" o "Lugar"/"Premio"/"Puntos" en esta entrega): siempre se
// vuelve a escribir la fila 1 completa con el encabezado actual, no solo la primera vez que se crea la
// hoja. Así una hoja ya existente de una entrega anterior no se queda con columnas de datos nuevas sin
// encabezado.
async function asegurarHoja(sheetName, headers) {
  const existentes = await graphFetch(`/workbook/worksheets`, { method: "GET" });
  const yaExiste = (existentes?.value || []).some((h) => h.name === sheetName);
  if (!yaExiste) {
    await graphFetch(`/workbook/worksheets/add`, { method: "POST", body: JSON.stringify({ name: sheetName }) });
  }
  const lastCol = colLetter(headers.length);
  const sheet = encodeURIComponent(sheetName);
  await graphFetch(`/workbook/worksheets('${sheet}')/range(address='A1:${lastCol}1')`, {
    method: "PATCH",
    body: JSON.stringify({ values: [headers] }),
  });
}

// aplica un formato de número que oculta el valor real de una columna de texto (muestra siempre
// asteriscos) sin borrar el valor — al seleccionar la celda, Excel sigue mostrando el valor real en
// la barra de fórmulas. Solo sirve para columnas de texto (contraseñas), no para números.
async function ocultarColumnaTexto(sheetName, columna, startRow, endRow) {
  if (endRow < startRow) return;
  const filas = endRow - startRow + 1;
  const range = `${columna}${startRow}:${columna}${endRow}`;
  const sheet = encodeURIComponent(sheetName);
  await graphFetch(`/workbook/worksheets('${sheet}')/range(address='${range}')`, {
    method: "PATCH",
    body: JSON.stringify({ numberFormat: Array.from({ length: filas }, () => [';;;"********"']) }),
  });
}

// arma las filas de la hoja única "Jugadores" del Excel — combina el directorio de jugadores
// (tols-jugadores) con las cuentas de acceso (tols-perfiles) por Correo Electrónico. En la app siguen
// siendo 2 pantallas separadas (Jugadores y Usuarios), pero en el Excel es una sola tabla, como pidió
// Federico ("finalmente aplica como base de datos"). Una cuenta de acceso que no es de ningún jugador
// (ej. un administrador que nunca se autorregistró) se agrega igual, como fila aparte con los campos
// de jugador vacíos.
// Columnas de la hoja única "Jugadores" del Excel (0-indexed). Federico agregó a mano una columna
// nueva "Mano Favorita" en K (34ª entrega, 2026-09-16), lo que corrió una posición a la derecha todo
// lo que antes vivía de K en adelante (Fecha de Registro pasó de K a L, ... Contraseña de O a P,
// Perfil de P a Q) — confirmado leyendo el encabezado real del Excel que subió Federico, no adivinado:
// 0 Id, 1 Nombre y Apellido, 2 Alias Jugador, 3 Alias PokerStars, 4 Padrino, 5 Teléfono,
// 6 Correo Electrónico, 7 Tipo de Usuario, 8 Fecha de Nacimiento, 9 Edad, 10 Mano Favorita,
// 11 Fecha de Registro, 12 Estatus, 13 Host, 14 Host Fecha, 15 Contraseña, 16 Perfil.
// 45ª entrega (2026-09-19): se agregaron 3 columnas nuevas al final, confirmadas libres leyendo el
// encabezado real del Excel de Federico (R, S, T vacías hasta esta entrega) — 17 Cuenta, 18 Banco,
// 19 Tipo de Cuenta (CLABE/Tarjeta de Débito, centralizados en Jugadores desde la 44ª entrega).
function filasJugadoresUnificadas(jugadores, perfilesData) {
  const usuarios = perfilesData?.usuarios || [];
  const porCorreo = new Map();
  for (const u of usuarios) {
    const correo = String(u.correo || u.usuario || "").trim().toLowerCase();
    if (correo) porCorreo.set(correo, u);
  }
  const filas = [];
  const correosConJugador = new Set();
  for (const j of jugadores || []) {
    const correo = String(j.correo || "").trim().toLowerCase();
    correosConJugador.add(correo);
    const u = porCorreo.get(correo);
    filas.push([
      j.id, j.nombre, j.aliasJugador, j.aliasPokerStars, j.padrino || "", j.telefono,
      j.correo, j.tipoUsuario, j.fecNac, j.edad, j.manoFavorita || "", j.fechaRegistro || "",
      j.estatus || "Activo", j.host ? "Sí" : "No", j.hostFecha || "",
      u ? u.password : "", u ? u.rol : "",
      celdaTexto(j.cuenta), j.banco || "", j.tipoCuenta || "",
    ]);
  }
  for (const u of usuarios) {
    const correo = String(u.correo || u.usuario || "").trim().toLowerCase();
    if (correo && !correosConJugador.has(correo)) {
      filas.push(["", u.nombre || "", "", "", "", "", u.correo || u.usuario || "", "", "", "", "", "", "", "", "", u.password, u.rol, "", "", ""]);
    }
  }
  return filas;
}

async function escribirJugadoresUnificado(jugadores, perfilesData) {
  const filas = filasJugadoresUnificadas(jugadores, perfilesData);
  await writeSheetTable("Jugadores", filas);
  await ocultarColumnaTexto("Jugadores", "P", 2, 1 + filas.length); // P = Contraseña (columna 16) — corrida una posición desde que Federico insertó "Mano Favorita" en K
}

// lee la hoja única "Jugadores" (Correo Electrónico + Contraseña + Perfil) y la hoja Permisos del
// Excel y arma el mismo objeto {roles, usuarios} que usa el sitio — para cuando el Excel debe
// "mandar" sobre lo guardado (botón "Importar desde Excel" en Usuarios). Solo cuentan como cuenta de
// acceso las filas que tengan Correo Electrónico Y Perfil llenos — un jugador sin cuenta para entrar
// al sitio no genera un usuario.
export async function leerUsuariosYPermisosDesdeExcel() {
  const [filasJugadores, filasPermisos] = await Promise.all([
    readSheetAcotado("Jugadores"),
    readSheetAcotado("Permisos"),
  ]);

  // columnas (0-indexed, ver el mapa arriba): 1=Nombre y Apellido, 6=Correo Electrónico,
  // 15=Contraseña, 16=Perfil
  const usuarios = filasJugadores
    .slice(1)
    .filter((f) => f[6] && f[16])
    .map((f) => ({
      nombre: String(f[1] || "").trim(),
      usuario: String(f[6] || "").trim(),
      correo: String(f[6] || "").trim(),
      password: String(f[15] || ""),
      rol: String(f[16] || "").trim(),
    }));

  // Permisos: Perfil, Tablero de Control, Calendario, Cobranza, Usuarios, Game Night, Jugadores
  const roles = filasPermisos
    .slice(1)
    .filter((f) => f[0])
    .map((f) => ({
      tipo: String(f[0] || "").trim(),
      permisos: {
        mod2: NIVEL_LABEL_INV[f[1]] || "ninguno",
        mod1: NIVEL_LABEL_INV[f[2]] || "ninguno",
        mod4: NIVEL_LABEL_INV[f[3]] || "ninguno",
        mod3: NIVEL_LABEL_INV[f[4]] || "ninguno",
        mod5: NIVEL_LABEL_INV[f[5]] || "ninguno",
        mod6: NIVEL_LABEL_INV[f[6]] || "ninguno",
      },
    }));

  return { roles, usuarios };
}

// lee la hoja única "Jugadores" y arma la lista de jugadores (directorio de la pantalla Jugadores),
// sin tocar contraseña/perfil (eso lo sigue haciendo leerUsuariosYPermisosDesdeExcel, para Usuarios) —
// usado por el botón "Importar desde Excel" de la pantalla Jugadores. Una fila sin Correo Electrónico
// no genera jugador (es una cuenta de acceso sin jugador ligado, ej. un administrador).
export async function leerJugadoresDesdeExcel() {
  const filas = await readSheetAcotado("Jugadores");
  return filas
    .slice(1)
    .filter((f) => f[6])
    .map((f, i) => ({
      id: Number(f[0]) || i + 1,
      nombre: String(f[1] || "").trim(),
      aliasJugador: String(f[2] || "").trim(),
      aliasPokerStars: String(f[3] || "").trim(),
      padrino: String(f[4] || "").trim(),
      telefono: String(f[5] || "").trim(),
      correo: String(f[6] || "").trim().toLowerCase(),
      tipoUsuario: String(f[7] || "Jugador").trim() || "Jugador",
      fecNac: fechaExcelAISO(f[8]),
      edad: Number(f[9]) || 0,
      manoFavorita: String(f[10] || "").trim(),
      fechaRegistro: fechaExcelAISO(f[11]) || String(f[11] || "").trim(),
      estatus: String(f[12] || "Activo").trim() || "Activo",
      host: String(f[13] || "").trim().toLowerCase() === "sí" || String(f[13] || "").trim().toLowerCase() === "si",
      hostFecha: fechaExcelAISO(f[14]) || String(f[14] || "").trim(),
      // 45ª entrega: columnas 17/18/19 — cuenta/banco/tipoCuenta (CLABE o Tarjeta de Débito)
      cuenta: String(f[17] || "").trim(),
      banco: String(f[18] || "").trim(),
      tipoCuenta: String(f[19] || "").trim(),
    }));
}

// nunca deja que un problema de sincronización con el Excel tumbe un guardado del sitio
async function safe(fn) {
  try {
    await fn();
  } catch (e) {
    console.error("[msgraph] sync a Excel falló (no afecta el guardado en el sitio):", e.message || e);
  }
}

export function syncCampeonatos(data) {
  return safe(async () => {
    const rows = (data.nombres || []).map((n) => [n]);
    await writeSheetTable("Campeonatos", rows);
  });
}

export function syncTablero(mapa) {
  return safe(async () => {
    const nombres = Object.keys(mapa || {});
    const config = [];
    const premiosTorneo = [];
    const premiosCampeonato = [];
    const puntos = [];
    const gastos = [];
    const cobros = [];
    const pagos = [];

    for (const nombre of nombres) {
      const d = mapa[nombre];
      config.push([nombre, d.premios.porTorneo.pctAcumulado, d.puntos.asistencia.regular, d.puntos.asistencia.main, d.cuotaInscripcion, d.recomprasMax]);
      for (const l of d.premios.porTorneo.lugares) premiosTorneo.push([nombre, l.label, l.pct]);
      for (const l of d.premios.porCampeonato.lugares) premiosCampeonato.push([nombre, l.label, l.pct, l.reyKiller ? "Sí" : "No"]);
      for (const p of d.puntos.posiciones) puntos.push([nombre, p.pos, p.regular, p.main]);
      for (const g of d.gastosCampeonato) gastos.push([nombre, g.concepto, g.monto]);
      for (const c of d.cobrosPorTorneo) cobros.push([nombre, c.nombre, c.id, c.regular, c.main, c.protegido ? "Sí" : "No"]);
      for (const p of d.pagosPorTorneo) pagos.push([nombre, p.nombre, p.regular, p.main]);
    }

    await writeSheetTable("Tablero_Config", config);
    await writeSheetTable("Premios_Torneo", premiosTorneo);
    await writeSheetTable("Premios_Campeonato", premiosCampeonato);
    await writeSheetTable("Puntos_Posiciones", puntos);
    await writeSheetTable("Gastos_Campeonato", gastos);
    await writeSheetTable("Cobros_Torneo", cobros);
    await writeSheetTable("Pagos_Torneo", pagos);
  });
}

export function syncCalendario(data) {
  return safe(async () => {
    const filas = (data.torneos || [])
      .slice()
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
      .map((t) => [t.fecha, t.hora, t.main ? "Sí" : "No", t.temporada || ""]);
    await writeSheetTable("Calendario", filas);

    const config = [
      ["Fecha de Pago Final", data.pagoFinal?.fecha || ""],
      ["Nota de Pago Final", data.pagoFinal?.nota || ""],
      ["Hora por Defecto (torneo nuevo)", data.defaultHora || ""],
      ["Hora Límite Mejor Mano", data.horaLimiteMejorMano || ""],
    ];
    await writeSheetTable("Calendario_Config", config, { maxRows: 20 });
  });
}

export function syncJugadores(jugadores) {
  return safe(async () => {
    const perfilesStore = getStore({ name: "tols-perfiles", consistency: "strong" });
    const perfilesData = await perfilesStore.get("data", { type: "json", consistency: "strong" }).catch(() => null);
    await escribirJugadoresUnificado(jugadores, perfilesData);
  });
}

// espeja el módulo de Cobranza en las mismas 2 hojas que ya se armaron a mano en el Excel maestro
// (Cobranza_Resumen y Cobranza) — a partir de esta entrega esas hojas dejan de tener fórmulas propias
// y pasan a ser un espejo de solo lectura como el resto del sitio: cada guardado desde el Tesorero
// las vuelve a escribir completas con los valores ya calculados.
export function syncCobranza({ resumenRows, movimientoRows }) {
  return safe(async () => {
    // 58ª entrega: Federico pidió quitar Cuenta/Banco/Tipo de Cuenta de esta hoja — esos datos ya viven
    // (y se editan) solo en la hoja "Jugadores" (ver `filasJugadoresUnificadas()` más abajo). `resumenRows`
    // ya no trae esas 3 columnas (ver `filasParaExcel()` en cobranza.js), pero `minClearCols: 8` asegura
    // que las columnas C/D/E, que hasta la 57ª entrega tenían esos datos (y F/G/H el pago/depósito/saldo
    // corrido), queden vacías en vez de con lo último que se alcanzó a escribir ahí.
    await writeSheetTable("Cobranza_Resumen", resumenRows, { minClearCols: 8 });
    await writeSheetTable("Cobranza", movimientoRows);
  });
}

// Game Night (MOD 5): a diferencia del resto de los módulos, sus 2 hojas se crean solas la primera
// vez que hay algo que sincronizar (ver asegurarHoja arriba) — no dependen de que Federico las arme a
// mano en el Excel maestro de antemano. "GameNight_Sesiones" es una fila por torneo (campeonato+fecha)
// con su hora de inicio; "GameNight_Jugadores" es una fila por jugador+torneo con todo el detalle en
// vivo (check-in, amonestación, buy-in/re-buys/add-on, killer, lugar, mejor mano) y su timestamp de
// última actualización — la columna que permite reconciliar después contra lo que se vivió en la mesa.
export function syncGameNight(mapa) {
  return safe(async () => {
    const sesiones = [];
    const jugadores = [];
    for (const [campeonato, fechas] of Object.entries(mapa || {})) {
      for (const [fecha, torneo] of Object.entries(fechas || {})) {
        // 50ª entrega: "Concluido"/"Concluido En" quedan registrados en Excel apenas se cierra
        // formalmente el torneo (acción "concluir" en netlify/functions/gamenight.js) — antes de eso
        // van vacíos/en "No".
        sesiones.push([
          campeonato, fecha, torneo.horaInicio || "",
          torneo.concluido ? "Sí" : "No", torneo.concluidoEn || "",
        ]);
        for (const [correo, j] of Object.entries(torneo.jugadores || {})) {
          jugadores.push([
            campeonato, fecha, correo, j.nombre || "",
            j.checkin ? "Sí" : "No", j.manual ? "Sí" : "No", j.amonestado ? "Sí" : "No", j.horaCheckin || "",
            j.buyIn ? "Sí" : "No", j.rebuys || 0, j.addon ? "Sí" : "No",
            j.eliminadoPor || "", j.horaEliminacion || "", j.mejorMano ? "Sí" : "No",
            // 50ª entrega: Lugar/Premio/Puntos son el "resultado" ya calculado del torneo (congelado
            // por el servidor en cada guardado, ver `estadoTorneo()` en netlify/functions/gamenight.js)
            // — quedan aquí para que, al Concluir un torneo, sus cifras finales queden registradas en
            // Excel sin depender de recalcular nada desde esta hoja.
            j.lugar || "", j.premioTotal || 0, j.puntos || 0,
            j.actualizado || "",
          ]);
        }
      }
    }
    await asegurarHoja("GameNight_Sesiones", ["Campeonato", "Fecha", "Hora de Inicio", "Concluido", "Concluido En"]);
    await writeSheetTable("GameNight_Sesiones", sesiones);
    await asegurarHoja("GameNight_Jugadores", [
      "Campeonato", "Fecha", "Correo", "Nombre", "Check-in", "Manual", "Amonestado", "Hora Check-in",
      "Buy-in", "Re-buys", "Add-on", "Eliminado Por", "Hora Eliminación", "Mejor Mano",
      "Lugar", "Premio", "Puntos", "Actualizado",
    ]);
    await writeSheetTable("GameNight_Jugadores", jugadores, { maxRows: 600 });
  });
}

// 51ª entrega: Federico pidió que, al confirmar "Jugada Concluida" en Game Night, quede un registro
// AUDITABLE en Excel — a diferencia de "Cobranza"/"Cobranza_Resumen" (que son un espejo en vivo, se
// reescriben completas en cada acción y se pueden vaciar con "Reiniciar este torneo"), esta hoja solo
// ACUMULA: cada cierre de torneo agrega sus filas al final de la lista completa que ya se traía
// (`registros` en `tols-cierres`, ver `registrarCierreTorneo()` en `cobranza.js`) — las filas de un
// cierre anterior nunca se tocan ni se recalculan por acciones posteriores. Es el registro que el
// Tesorero puede usar después para auditar a quién había que cobrarle/pagarle al momento exacto en que
// se cerró cada torneo, sin depender de que nadie haya tocado nada después. Como la hoja crece con cada
// cierre (nunca se editan filas viejas), el `maxRows` de la limpieza se calcula sobre el tamaño real de
// la lista en cada llamada.
export function syncCierres(registros) {
  return safe(async () => {
    const filas = (registros || [])
      .slice()
      .sort((a, b) => (a.concluidoEn || "").localeCompare(b.concluidoEn || ""))
      .map((r) => [
        r.campeonato, r.fecha, r.tipo || "", r.correo, r.nombre || "",
        r.buyIn ? "Sí" : "No", r.rebuys || 0, r.addon ? "Sí" : "No",
        r.debeBuyIn || 0, r.debeRebuys || 0, r.debeAddon || 0, r.debeTotal || 0,
        r.lugar || "", r.esCampeon ? "Sí" : "No",
        r.premioLugar || 0, r.premioBurbuja || 0, r.premioMano || 0, r.premioTotal || 0,
        r.balance || 0, r.accion || "", r.concluidoEn || "",
      ]);
    await asegurarHoja("Cobranza_Cierres", [
      "Campeonato", "Fecha", "Tipo", "Correo", "Jugador",
      "Buy-in", "Re-buys", "Add-on",
      "$ Buy-in", "$ Re-buys", "$ Add-on", "$ Total a Cobrar",
      "Lugar", "Campeón",
      "Premio Lugar", "Premio Burbuja", "Premio Mejor Mano", "$ Premio Total",
      "Balance Neto", "Acción", "Concluido En",
    ]);
    await writeSheetTable("Cobranza_Cierres", filas, { maxRows: filas.length + 50 });
  });
}

export function syncPerfiles(data) {
  return safe(async () => {
    // la hoja "Usuarios" ya no existe por separado — las cuentas de acceso se escriben junto con el
    // directorio de jugadores en la hoja única "Jugadores" (ver escribirJugadoresUnificado arriba)
    const jugadoresStore = getStore({ name: "tols-jugadores", consistency: "strong" });
    const jugadoresData = await jugadoresStore.get("data", { type: "json", consistency: "strong" }).catch(() => null);
    await escribirJugadoresUnificado(jugadoresData?.jugadores || [], data);

    // orden de columnas fijo, igual al de la hoja Permisos: Tablero, Calendario, Cobranza, Usuarios, Game Night, Jugadores
    const permisos = (data.roles || []).map((r) => [
      r.tipo,
      NIVEL_LABEL[r.permisos?.mod2] || "Sin acceso",
      NIVEL_LABEL[r.permisos?.mod1] || "Sin acceso",
      NIVEL_LABEL[r.permisos?.mod4] || "Sin acceso",
      NIVEL_LABEL[r.permisos?.mod3] || "Sin acceso",
      NIVEL_LABEL[r.permisos?.mod5] || "Sin acceso",
      NIVEL_LABEL[r.permisos?.mod6] || "Sin acceso",
    ]);
    await writeSheetTable("Permisos", permisos, { maxRows: 30 });
  });
}
