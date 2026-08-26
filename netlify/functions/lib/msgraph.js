import { getStore } from "@netlify/blobs";
import { NIVEL_LABEL } from "../../../src/lib/permisos.js";

const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPE = "Files.ReadWrite offline_access";
const EXCEL_PATH = process.env.MS_EXCEL_PATH || "Personal/MX/TOLS/TOLS 3.0/TOLS3.0-Base-de-Datos.xlsx";

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
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

// intercambia el refresh_token guardado por un access_token fresco — Microsoft rota el refresh_token
// en cada uso, así que el nuevo se vuelve a guardar cada vez (si no se hace, deja de servir en unos días)
async function getAccessToken() {
  const store = getStore("tols-ms-token");
  const saved = await store.get("data", { type: "json" });
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
async function writeSheetTable(sheetName, values, { startRow = 2, maxRows = 400 } = {}) {
  const numCols = values[0] ? values[0].length : 1;
  const lastCol = colLetter(numCols);
  const clearRange = `A${startRow}:${lastCol}${startRow + maxRows - 1}`;
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
    const filas = (jugadores || []).map((j) => [
      j.id,
      j.nombre,
      j.aliasJugador,
      j.aliasPokerStars,
      j.padrino || "",
      j.telefono,
      j.correo,
      j.tipoUsuario,
      j.fecNac,
      j.edad,
      j.emoticon,
      j.fechaRegistro || "",
      j.estatus || "Activo",
    ]);
    await writeSheetTable("Jugadores", filas);
  });
}

export function syncPerfiles(data) {
  return safe(async () => {
    const usuarios = (data.usuarios || []).map((u) => [u.nombre, u.usuario, u.correo || "", u.password, u.rol]);
    await writeSheetTable("Usuarios", usuarios);

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
