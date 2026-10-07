import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { estadoTorneoDesdeLugares, tipoDeFecha, PRACTICA_CAMPEONATO, mapaNumeracionTorneos, etiquetaNumerada } from "../lib/gamenight.js";
import { extraerKillersDeChat } from "../lib/killersChat.js";

// 66ª entrega: pantalla nueva "Estadísticas" — reemplaza el seguimiento en vivo de Game Night (que
// queda oculta del menú, sin borrarse) por un flujo semanal de archivos: el administrador sube, por
// cada torneo, el Excel de PokerStars que ya se usaba en "Importar resultados (Excel)" de Game Night
// (mismo formato — se reutiliza aquí una copia propia de ese parser, sin tocar GameNight.jsx) y el
// .txt exportado del chat de WhatsApp de la liga, de donde se sacan los Killers
// (src/lib/killersChat.js). Cualquier jugador ve, en esta misma pantalla, botones por cada torneo ya
// publicado y la tabla de resultados de ese torneo (mismo formato que "Jugadores habilitados" de Game
// Night). Solo un administrador ve la sección "Subir resultados".

const API_EST = "/api/estadisticas";
const API_CAMP = "/api/campeonatos";
const API_CAL = "/api/calendario";
const API_JUG = "/api/jugadores";
const API_TABLERO = "/api/tablero";

function esAdmin(rol) {
  return rol === "Administrador General" || rol === "Administrador";
}
// 90ª entrega: el botón "Por resultado" de "Clasificación general" muestra montos de dinero (Debe/Premio
// por jugador) — a pedido de Federico, solo administradores y el Tesorero pueden verlo/usarlo; el
// jugador solo ve "Por puntos"/"Por killers". Mismo criterio que ya usa `puedeAlternarVistaJugador()` en
// App.jsx (esAdmin(rol) || rol === "Tesorero") — se repite acá en vez de importarlo porque ese helper es
// local a App.jsx y no está exportado.
function puedeVerPorResultado(rol) {
  return esAdmin(rol) || rol === "Tesorero";
}
// 98ª entrega: Federico pidió que la corrección manual de Kills quede reservada al "administrador
// general" específicamente — a diferencia del resto de esta pantalla ("Subir resultados"/"Exportar a
// Excel"/editar Kills hasta la 97ª entrega), que usan `esAdmin()` (Administrador General O
// Administrador). Este helper exclusivo solo se usa para el gate de edición de Kills, nada más.
function esAdminGeneral(rol) {
  return rol === "Administrador General";
}
// 98ª entrega: colores de podio (oro/plata/bronce) para los renglones de 1°/2°/3° lugar de "Clasificación
// general" — a propósito, un fondo tenue (no un color lleno, para no tapar los números) + un borde/texto
// más saturado del mismo tono, distinto del dorado que ya usan las columnas de torneo Main (`#b8860b`)
// para no confundir las dos cosas a simple vista.
const PODIO_CLASIF = [
  { fondo: "#fff8e1", borde: "#c9971e" }, // 1° — oro
  { fondo: "#f2f2f2", borde: "#9a9a9a" }, // 2° — plata
  { fondo: "#fbe9dc", borde: "#b5692f" }, // 3° — bronce
];

function money(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("en-US");
}
function moneyFirmado(n) {
  const v = Math.round(Number(n || 0));
  return (v < 0 ? "-" : "") + "$ " + Math.abs(v).toLocaleString("en-US");
}
// 72ª entrega: formato contable pedido por Federico para montos en negativo — "($ #,##0)" en vez de
// "-$ #,##0" — usado en Estadísticas para Debe/Saldo/Resultado, igual que en Calendario.jsx.
function moneyContable(n) {
  const v = Math.round(Number(n || 0));
  const abs = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($ ${abs})` : `$ ${abs}`;
}
function fechaFmt(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso || "";
}
function nombreCorto(j) {
  return (j.aliasPokerStars || "").trim() || j.nombre;
}
function norm(s) {
  return (s || "").trim().toLowerCase();
}

// copia propia (no importada de GameNight.jsx, a propósito — ver comentario de arriba) del parser del
// Excel de resultados de PokerStars ya usado en "Importar resultados (Excel)" de Game Night: dos filas
// de encabezado (Place/User ID arriba, Rebuys/Addons abajo) y una fila por jugador hasta "SUMMARY".
function leerExcelResultadosPokerStars(filas) {
  let filaHeader = -1;
  let filaSubHeader = -1;
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i] || [];
    const textos = fila.map((c) => String(c ?? "").trim().toLowerCase());
    if (textos.includes("place") && textos.includes("user id")) {
      filaHeader = i;
      filaSubHeader = i + 1;
      break;
    }
  }
  if (filaHeader < 0) return { jugadores: [], error: 'No se encontraron las columnas "Place" / "User ID" en el archivo — ¿es el Excel de resultados que exporta PokerStars?' };

  const header = (filas[filaHeader] || []).map((c) => String(c ?? "").trim().toLowerCase());
  const sub = (filas[filaSubHeader] || []).map((c) => String(c ?? "").trim().toLowerCase());
  const colPlace = header.indexOf("place");
  const colAlias = header.indexOf("user id");
  const colRebuys = sub.findIndex((c) => c === "rebuys");
  const colAddon = sub.findIndex((c) => c === "addons" || c === "addon");

  const jugadores = [];
  for (let i = filaSubHeader + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const placeTexto = String(fila[colPlace] ?? "").replace(/ /g, " ").trim();
    if (placeTexto.toLowerCase() === "summary") break;
    const alias = String(fila[colAlias] ?? "").replace(/ /g, " ").trim();
    const place = Number(placeTexto) || null;
    if (!alias || !place) continue;
    const rebuys = colRebuys >= 0 ? Number(String(fila[colRebuys] ?? "").trim()) || 0 : 0;
    const addon = colAddon >= 0 ? Number(String(fila[colAddon] ?? "").trim()) === 1 : false;
    jugadores.push({ alias, place, rebuys, addon });
  }
  return { jugadores, error: jugadores.length ? "" : "El archivo no trae ningún jugador reconocible." };
}

// 85ª entrega (bugfix de fondo): hasta la 84ª, este parser decidía SOLO cuáles eran las columnas de
// "Alias"/"Referencia" por palabras clave fijas en el encabezado — y cada vez que Federico cambiaba el
// formato real de su archivo (pasó de "Referencia1/2/3" a "Chat"/"Apodo", y después ni siquiera esas
// palabras alcanzaron para su archivo más reciente), el reconocimiento volvía a fallar en silencio o con
// un error genérico, sin mostrar nunca qué había en el archivo de verdad. Pedido explícito de Federico:
// "Olvida los formatos previos... siempre que lo cargue, tráeme y muéstrame las columnas del archivo, y a
// partir de ahí, guardas y comparas." Se abandona por completo la idea de ADIVINAR y aceptar el archivo
// de una — ahora SIEMPRE se muestran las columnas reales (ver el paso nuevo "Mapear columnas" en el
// render, y `onApodosExcelSeleccionado` más abajo) y el administrador elige a mano, en cada carga, cuál
// columna es el Alias PokerStars y cuáles son de referencia — sin importar cómo se llamen ni cuántas
// haya. Esta función ya no decide nada por su cuenta: sigue existiendo solo para proponer una selección
// inicial razonable (que el administrador ve y puede cambiar antes de confirmar), nunca como la decisión
// final.
function adivinarColumnasApodos(header) {
  const limpio = (header || []).map((c) => String(c ?? "").trim().toLowerCase());
  const colAlias = limpio.findIndex((c) => c.includes("alias"));
  const colsRef = [];
  limpio.forEach((c, i) => {
    if (i !== colAlias && (c.includes("referencia") || c.includes("chat") || c.includes("apodo"))) colsRef.push(i);
  });
  return { colAlias, colsRef };
}

// arma el borrador del editor (mismo criterio de "siempre reemplaza" desde la 82ª entrega) a partir de
// las filas crudas del archivo y la columna de Alias / columnas de referencia que el administrador haya
// confirmado en el paso de mapeo — ya no hay ninguna palabra clave de por medio acá, son índices de
// columna elegidos a mano.
function construirApodosDesdeMapeo(filasCrudas, colAlias, colsRef, directorio) {
  const base = {};
  for (const j of directorio) {
    const alias = nombreCorto(j);
    if (alias) base[alias] = ["", "", ""];
  }
  for (let i = 1; i < filasCrudas.length; i++) {
    const fila = filasCrudas[i] || [];
    const alias = String(fila[colAlias] ?? "").trim();
    if (!alias) continue;
    const referencias = colsRef.map((c) => String(fila[c] ?? "").trim()).filter(Boolean);
    base[alias] = [referencias[0] || "", referencias[1] || "", referencias[2] || ""];
  }
  return base;
}

function etiquetaTipo(campeonato, tipo) {
  if (campeonato === PRACTICA_CAMPEONATO) return "Práctica";
  return tipo === "Main" ? "Main Event" : "Regular";
}

// 72ª entrega: tally de kills HECHOS por cada alias en un torneo ya publicado — misma lógica que ya
// usaba killsPorAliasTorneo (más abajo, para la tabla de un torneo puntual), factoreada aparte para
// poder reutilizarla también en el bloque de "Clasificación general" (vista "por killers"), que necesita
// este mismo cálculo repetido para cada torneo publicado del campeonato, no solo el que está abierto.
function killsTallyDeTorneo(torneo) {
  const tally = {};
  Object.values(torneo?.jugadores || {}).forEach((j) => {
    if (j.eliminadoPor) tally[j.eliminadoPor] = (tally[j.eliminadoPor] || 0) + 1;
  });
  (torneo?.logKillersNoResueltos || []).forEach((l) => {
    if (l.asignadoA) tally[l.asignadoA] = (tally[l.asignadoA] || 0) + 1;
  });
  return tally;
}

// 72ª entrega: busca el registro de UN jugador del directorio dentro de un torneo ya publicado —
// `estadisticas.js` guarda cada jugador bajo la clave `correo || alias` (ver Estadisticas.jsx, armado
// del preview más abajo), así que primero se prueba esa misma clave y, si no aparece (por ejemplo un
// torneo viejo guardado con un alias que después cambió), se cae a buscar por alias o correo entre
// todos los valores — igual que hace nombreKillerEnTorneo() más abajo para el nombre visible.
function jugadorEnTorneo(torneo, jugadorDir) {
  if (!torneo) return null;
  const clave = jugadorDir.correo || nombreCorto(jugadorDir);
  if (torneo.jugadores?.[clave]) return torneo.jugadores[clave];
  return (
    Object.values(torneo.jugadores || {}).find(
      (j) => norm(j.alias) === norm(nombreCorto(jugadorDir)) || (jugadorDir.correo && norm(j.correo) === norm(jugadorDir.correo))
    ) || null
  );
}

export default function Estadisticas({ session }) {
  const admin = esAdmin(session?.rol);
  const adminGeneral = esAdminGeneral(session?.rol); // 98ª entrega: solo este rol puede editar Kills

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [campeonatos, setCampeonatos] = useState({ nombres: [], activo: "" });
  const [torneosCal, setTorneosCal] = useState([]);
  const [directorio, setDirectorio] = useState([]);
  const [tableroMapa, setTableroMapa] = useState({});
  const [estData, setEstData] = useState({ torneos: {}, apodos: {} });

  const [torneoAbierto, setTorneoAbierto] = useState(null); // { campeonato, fecha }

  // ───────── 72ª entrega: "Clasificación general" ─────────
  // 72ª entrega (ajuste): Federico pidió que la tabla siempre se muestre completa (todos los torneos,
  // izquierda a derecha, aunque haya que hacer scroll horizontal) — se quitó el botón/estado de ocultar
  // torneos individuales que existía en la primera versión de este bloque.
  const [vistaClasificacion, setVistaClasificacion] = useState("puntos"); // "puntos" | "killers" | "resultado"
  const [ordenClasif, setOrdenClasif] = useState({ col: "total", dir: "desc" }); // default: Total descendente

  // 90ª entrega: si la vista queda en "resultado" (Tesorero la elige y después usa "Ver como jugador" en
  // Mi Perfil, que cambia `session.rol` sin recargar el componente) se vuelve a "puntos" — nunca se deja
  // a un jugador viendo la vista de dinero aunque ya no tenga el botón para volver a elegirla a mano.
  useEffect(() => {
    if (vistaClasificacion === "resultado" && !puedeVerPorResultado(session?.rol)) setVistaClasificacion("puntos");
  }, [session?.rol, vistaClasificacion]);

  // ───────── admin: subir resultados ─────────
  const [torneoAdminSel, setTorneoAdminSel] = useState(""); // clave "campeonato|fecha"
  const [excelJugadores, setExcelJugadores] = useState(null);
  const [excelNombreArchivo, setExcelNombreArchivo] = useState("");
  const [excelError, setExcelError] = useState("");
  const [chatTexto, setChatTexto] = useState("");
  const [chatNombreArchivo, setChatNombreArchivo] = useState("");
  const [preview, setPreview] = useState(null);
  const [publicando, setPublicando] = useState(false);
  // asignación manual del administrador para los killers "dudosos" (sin víctima confirmada): clave =
  // índice dentro de preview.logNoResueltos, valor = Alias PokerStars al que se le acredita ese kill.
  // Arranca en el killerAlias que ya resolvió extraerKillersDeChat() cuando lo hay (el remitente del
  // mensaje) y el administrador puede corregirlo o dejarlo "Sin asignar" si prefiere no contarlo.
  const [dudososAsignacion, setDudososAsignacion] = useState({});
  const excelRef = useRef(null);
  const chatRef = useRef(null);
  const apodosExcelRef = useRef(null);

  // ───────── admin: editor de apodos de chat ─────────
  const [editorApodos, setEditorApodos] = useState(false);
  const [apodosBorrador, setApodosBorrador] = useState({});
  const [guardandoApodos, setGuardandoApodos] = useState(false);
  // 85ª entrega: paso nuevo de "Mapear columnas" — antes de construir la tabla de apodos, se muestran las
  // columnas reales del archivo subido (nombre de encabezado + una muestra de la primera fila) y el
  // administrador confirma a mano cuál es el Alias PokerStars y cuáles son de referencia, en vez de que
  // el código intente adivinarlo. `apodosMapColAlias`/`apodosMapColsRef` arrancan con una propuesta
  // (misma heurística de siempre, ver adivinarColumnasApodos) pero son completamente editables antes de
  // confirmar con "Usar estas columnas".
  const [apodosMapeo, setApodosMapeo] = useState(false);
  const [apodosHeader, setApodosHeader] = useState([]); // encabezado real del archivo, tal cual viene
  const [apodosMuestra, setApodosMuestra] = useState([]); // primera fila de datos, para mostrar un ejemplo por columna
  const [apodosFilasCrudas, setApodosFilasCrudas] = useState([]);
  const [apodosNombreArchivo, setApodosNombreArchivo] = useState("");
  const [apodosMapColAlias, setApodosMapColAlias] = useState(-1);
  const [apodosMapColsRef, setApodosMapColsRef] = useState([]);

  useEffect(() => {
    cargarTodo();
  }, []);

  function cargarTodo() {
    setCargando(true);
    setError("");
    Promise.all([
      fetch(API_CAMP).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_CAL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_JUG).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_TABLERO).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(API_EST).then((r) => (r.ok ? r.json() : { torneos: {}, apodos: {} })).catch(() => ({ torneos: {}, apodos: {} })),
    ])
      .then(([camp, cal, jug, tablero, est]) => {
        setCampeonatos(camp || { nombres: [], activo: "" });
        setTorneosCal(cal?.torneos || []);
        // 72ª entrega: "Usuario Domi" es una cuenta de pruebas del sitio — a pedido de Federico se omite
        // del directorio que alimenta la "Clasificación general" (y de paso, de todo lo demás que ya usa
        // este `directorio`, ya que no tiene sentido mostrarlo en ningún lado de Estadísticas).
        setDirectorio(
          (jug?.jugadores || []).filter(
            (j) => j.estatus === "Activo" && norm(j.nombre) !== "usuario domi" && norm(nombreCorto(j)) !== "usuario domi"
          )
        );
        setTableroMapa(tablero || {});
        setEstData(est || { torneos: {}, apodos: {} });
      })
      .catch((e) => setError(e.message || "No se pudo cargar Estadísticas."))
      .finally(() => setCargando(false));
  }

  // ───────── lista de torneos publicados (todos los roles) ─────────
  const torneosPublicados = useMemo(() => {
    const lista = [];
    for (const [campeonato, fechas] of Object.entries(estData.torneos || {})) {
      for (const [fecha, torneo] of Object.entries(fechas || {})) {
        if (torneo.publicado) lista.push({ campeonato, fecha, tipo: torneo.tipo });
      }
    }
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [estData]);

  // 72ª entrega: numeración cronológica 1..n de los torneos Regular/Main de cada campeonato (ver
  // src/lib/gamenight.js) — se calcula sobre TODAS las fechas del Calendario, publicadas o no, para que
  // el número de un torneo sea estable. `etiquetaTorneo()` arma el rótulo completo pedido por Federico:
  // "N - Regular (dd/mm/yyyy)" / "N - Main (dd/mm/yyyy)", o "Práctica (dd/mm/yyyy)" para una práctica.
  const numeracion = useMemo(() => mapaNumeracionTorneos(torneosCal), [torneosCal]);
  function etiquetaTorneo(campeonato, fecha, tipoFallback) {
    if (campeonato === PRACTICA_CAMPEONATO) return `Práctica (${fechaFmt(fecha)})`;
    const base = etiquetaNumerada(numeracion[`${campeonato}|${fecha}`], tipoFallback || "Regular");
    return `${base} (${fechaFmt(fecha)})`;
  }

  // 70ª entrega: a pedido de Federico, ya NO se preselecciona el torneo más reciente al entrar — la
  // pantalla solo muestra los botones de "Torneos publicados"; los resultados se despliegan recién
  // cuando el usuario elige uno.

  const torneoActual = torneoAbierto ? estData.torneos?.[torneoAbierto.campeonato]?.[torneoAbierto.fecha] : null;
  const esMainActual = torneoActual?.tipo === "Main";

  const jugadoresTorneoActual = useMemo(() => {
    if (!torneoActual) return [];
    return Object.values(torneoActual.jugadores || {}).sort((a, b) => {
      if (a.lugar && b.lugar) return a.lugar - b.lugar;
      if (a.lugar) return -1;
      if (b.lugar) return 1;
      return norm(a.nombre).localeCompare(norm(b.nombre));
    });
  }, [torneoActual]);

  function nombreKillerEnTorneo(alias) {
    if (!alias) return "";
    const encontrado = jugadoresTorneoActual.find((j) => j.alias === alias);
    return encontrado ? encontrado.alias || encontrado.nombre : alias;
  }

  // total de kills hechos por cada jugador en el torneo ya publicado: los confirmados en la tabla más los
  // "dudosos" que el administrador ya dejó asignados al publicar (campo `asignadoA`, guardado desde la
  // 68ª entrega — un torneo publicado antes de esa entrega simplemente no tiene ese campo y no suma nada).
  // 97ª entrega: si el administrador general ya corrigió el total a mano para ese alias (`killsManual`,
  // ver estadisticas.js), ese valor pisa el tally calculado — el resto de los alias sigue con el cálculo
  // de siempre.
  const killsPorAliasTorneo = useMemo(() => {
    const tally = {};
    for (const j of jugadoresTorneoActual) {
      if (j.eliminadoPor) tally[j.eliminadoPor] = (tally[j.eliminadoPor] || 0) + 1;
    }
    (torneoActual?.logKillersNoResueltos || []).forEach((l) => {
      if (l.asignadoA) tally[l.asignadoA] = (tally[l.asignadoA] || 0) + 1;
    });
    for (const [alias, n] of Object.entries(torneoActual?.killsManual || {})) {
      tally[alias] = n;
    }
    return tally;
  }, [jugadoresTorneoActual, torneoActual]);

  // ───────── 97ª entrega: corrección manual de Kills (post-publicación) ─────────
  const [editandoKills, setEditandoKills] = useState(null); // alias en edición, o null
  const [borradorKills, setBorradorKills] = useState("");
  const [guardandoKills, setGuardandoKills] = useState(false);
  const [errorKills, setErrorKills] = useState("");
  const maxKillsTorneoActual = Math.max(0, jugadoresTorneoActual.length - 1);

  // al cambiar de torneo abierto se descarta cualquier edición de Kills en curso (evita dejar el input
  // abierto sobre un jugador de otro torneo si el administrador cambia de pestaña a mitad de edición).
  useEffect(() => {
    setEditandoKills(null);
    setErrorKills("");
  }, [torneoAbierto?.campeonato, torneoAbierto?.fecha]);

  async function guardarKillsManual(alias) {
    const kills = Math.round(Number(borradorKills));
    if (!Number.isFinite(kills) || kills < 0 || kills > maxKillsTorneoActual) {
      setErrorKills(`El número de kills debe estar entre 0 y ${maxKillsTorneoActual}.`);
      return;
    }
    setErrorKills("");
    setGuardandoKills(true);
    try {
      const r = await fetch(API_EST, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accion: "editarKills",
          campeonato: torneoAbierto.campeonato,
          fecha: torneoAbierto.fecha,
          alias,
          kills,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar.");
      setEstData(j);
      setEditandoKills(null);
    } catch (e) {
      setErrorKills(e.message || "No se pudo guardar.");
    } finally {
      setGuardandoKills(false);
    }
  }

  // fila de totales al pie de la tabla publicada: Buy-ins, Re-buys, Add-ons, Debe, Premios y Saldo
  const totalesTorneo = useMemo(() => {
    if (!jugadoresTorneoActual.length) return null;
    return jugadoresTorneoActual.reduce(
      (t, j) => ({
        buyIns: t.buyIns + (j.buyIn ? 1 : 0),
        rebuys: t.rebuys + (j.rebuys || 0),
        addons: t.addons + (j.addon ? 1 : 0),
        debe: t.debe + (j.debeTotal || 0),
        premio: t.premio + (j.premioTotal || 0),
        saldo: t.saldo + ((j.premioTotal || 0) - (j.debeTotal || 0)),
      }),
      { buyIns: 0, rebuys: 0, addons: 0, debe: 0, premio: 0, saldo: 0 }
    );
  }, [jugadoresTorneoActual]);

  function exportarExcel() {
    if (!torneoAbierto || !jugadoresTorneoActual.length) return;
    const filas = jugadoresTorneoActual.map((j) => ({
      "Alias PokerStars": j.alias || j.nombre,
      "Buy-in": j.buyIn ? 1 : 0,
      "Re-buys": j.rebuys || 0,
      "Add-on": j.addon ? 1 : 0,
      Killer: nombreKillerEnTorneo(j.eliminadoPor),
      Lugar: j.lugar || "",
      ...(esMainActual ? { "Mejor mano": j.mejorMano ? "Sí" : "No" } : {}),
      Puntos: j.puntos ?? 0,
      "Debe": -(j.debeTotal || 0),
      "Premio": j.premioTotal || 0,
      Saldo: (j.premioTotal || 0) - (j.debeTotal || 0),
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Resultados");
    const nombre = `Resultados_${torneoAbierto.fecha}_${etiquetaTipo(torneoAbierto.campeonato, torneoAbierto.tipo).replace(/\s+/g, "")}.xlsx`;
    XLSX.writeFile(libro, nombre);
  }

  // ───────── admin: combo de torneos habilitados (práctica + campeonato activo) ─────────
  const opcionesTorneoAdmin = useMemo(() => {
    const activo = campeonatos.activo || campeonatos.nombres?.[0] || "";
    const practicas = torneosCal
      .filter((t) => t.practica && t.fecha)
      .map((t) => ({ campeonato: PRACTICA_CAMPEONATO, fecha: t.fecha, tipo: "Regular" }));
    const delCampeonato = torneosCal
      .filter((t) => !t.practica && t.temporada === activo && t.fecha)
      .map((t) => ({ campeonato: activo, fecha: t.fecha, tipo: tipoDeFecha(torneosCal, t.fecha) }));
    // orden del combo invertido a pedido de Federico: antes bajaba de la fecha más reciente a la más
    // antigua, ahora sube de la más antigua a la más reciente.
    return [...delCampeonato, ...practicas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [torneosCal, campeonatos]);

  useEffect(() => {
    if (!torneoAdminSel && opcionesTorneoAdmin.length) {
      // 70ª entrega: por default selecciona el torneo que sigue cronológicamente al último ya publicado
      // — no simplemente "el más reciente del combo" (que antes de tener resultados es el mismo torneo
      // que ya se acaba de publicar). Si no hay ninguno posterior al último publicado (falta cargar
      // fechas nuevas en el Calendario, o ya se publicó todo), cae de vuelta al más reciente disponible.
      const ultimaFechaPublicada = torneosPublicados.reduce((mas, t) => (t.fecha > mas ? t.fecha : mas), "");
      const siguientes = opcionesTorneoAdmin.filter((o) => o.fecha > ultimaFechaPublicada);
      const o = siguientes.length
        ? siguientes.reduce((min, cur) => (cur.fecha < min.fecha ? cur : min), siguientes[0])
        : opcionesTorneoAdmin.reduce((mas, cur) => (cur.fecha > mas.fecha ? cur : mas), opcionesTorneoAdmin[0]);
      setTorneoAdminSel(`${o.campeonato}|${o.fecha}`);
    }
  }, [opcionesTorneoAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const torneoAdminInfo = useMemo(() => {
    const [campeonato, fecha] = String(torneoAdminSel || "").split("|");
    const opcion = opcionesTorneoAdmin.find((o) => o.campeonato === campeonato && o.fecha === fecha);
    if (!opcion) return null;
    const yaGuardado = estData.torneos?.[campeonato]?.[fecha] || null;
    return { ...opcion, yaGuardado };
  }, [torneoAdminSel, opcionesTorneoAdmin, estData]);

  // ───────── 72ª entrega: datos de "Clasificación general" ─────────
  // columnas: torneos Regular/Main del campeonato activo, numerados y en orden cronológico, marcando
  // cuáles ya están publicados (los únicos que entran en las tablas — "Lo demás en cero").
  const campeonatoActivoNombre = campeonatos.activo || campeonatos.nombres?.[0] || "";
  const torneosClasifCampeonato = useMemo(() => {
    return torneosCal
      .filter((t) => !t.practica && t.temporada === campeonatoActivoNombre && t.fecha)
      .map((t) => ({ fecha: t.fecha, ...(numeracion[`${campeonatoActivoNombre}|${t.fecha}`] || {}) }))
      .filter((t) => t.numero)
      .sort((a, b) => a.numero - b.numero)
      .map((t) => ({ ...t, torneo: estData.torneos?.[campeonatoActivoNombre]?.[t.fecha] || null }));
  }, [torneosCal, campeonatoActivoNombre, numeracion, estData]);
  // 72ª entrega (ajuste pedido por Federico): la tabla muestra SIEMPRE todos los torneos Regular/Main
  // numerados del campeonato activo, publicados o no — antes solo aparecían como columna los ya
  // publicados. Un torneo todavía no publicado simplemente queda en cero en todas las vistas (ver
  // `filasClasificacion` más abajo, que solo lee valores de un torneo si `torneo.publicado` es true).
  const columnasClasif = torneosClasifCampeonato;

  // columna lumped "Práctica" (solo vista Puntos) — suma de TODAS las partidas de práctica publicadas,
  // indistintamente del campeonato (mismo criterio que ya usa el Calendario para puntos de práctica).
  const torneosPracticaPublicados = useMemo(() => {
    return torneosCal
      .filter((t) => t.practica && t.fecha)
      .map((t) => estData.torneos?.[PRACTICA_CAMPEONATO]?.[t.fecha] || null)
      .filter((t) => t?.publicado);
  }, [torneosCal, estData]);

  const filasClasificacion = useMemo(() => {
    return directorio.map((j) => {
      const alias = nombreCorto(j);
      const valores = {};
      columnasClasif.forEach((c) => {
        const publicado = Boolean(c.torneo?.publicado);
        const jt = publicado ? jugadorEnTorneo(c.torneo, j) : null;
        let v = 0;
        if (publicado) {
          if (vistaClasificacion === "puntos") v = Number(jt?.puntos) || 0;
          else if (vistaClasificacion === "killers") v = killsTallyDeTorneo(c.torneo)[alias] || 0;
          else v = jt ? (Number(jt.premioTotal) || 0) - (Number(jt.debeTotal) || 0) : 0;
        }
        valores[c.fecha] = v;
      });
      const practica =
        vistaClasificacion === "puntos"
          ? torneosPracticaPublicados.reduce((s, t) => s + (Number(jugadorEnTorneo(t, j)?.puntos) || 0), 0)
          : 0;
      const total = Object.values(valores).reduce((s, v) => s + v, 0) + practica;
      return { jugador: j, alias, valores, practica, total };
    });
  }, [directorio, columnasClasif, torneosPracticaPublicados, vistaClasificacion]);

  const filasClasifOrdenadas = useMemo(() => {
    const arr = [...filasClasificacion];
    arr.sort((a, b) => {
      const va = ordenClasif.col === "total" ? a.total : ordenClasif.col === "practica" ? a.practica : a.valores[ordenClasif.col] || 0;
      const vb = ordenClasif.col === "total" ? b.total : ordenClasif.col === "practica" ? b.practica : b.valores[ordenClasif.col] || 0;
      return ordenClasif.dir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [filasClasificacion, ordenClasif]);

  function ordenarClasifPor(col) {
    setOrdenClasif((prev) => (prev.col === col ? { col, dir: prev.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" }));
  }

  function fmtClasifValor(v) {
    return vistaClasificacion === "resultado" ? moneyContable(v) : v;
  }

  function reiniciarSubida() {
    setExcelJugadores(null);
    setExcelNombreArchivo("");
    setExcelError("");
    setChatTexto("");
    setChatNombreArchivo("");
    setPreview(null);
    if (excelRef.current) excelRef.current.value = "";
    if (chatRef.current) chatRef.current.value = "";
  }

  async function onExcelSeleccionado(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setExcelError("");
    try {
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null });
      const { jugadores, error: err } = leerExcelResultadosPokerStars(filas);
      if (err) {
        setExcelError(err);
        setExcelJugadores(null);
        return;
      }
      setExcelJugadores(jugadores);
      setExcelNombreArchivo(archivo.name);
    } catch {
      setExcelError("No se pudo leer el archivo. ¿Seguro que es un .xlsx exportado de PokerStars?");
      setExcelJugadores(null);
    }
  }

  async function onChatSeleccionado(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    try {
      const texto = await archivo.text();
      setChatTexto(texto);
      setChatNombreArchivo(archivo.name);
    } catch {
      setExcelError("No se pudo leer el archivo de chat (.txt).");
    }
  }

  // arma el preview en cuanto ambos archivos están cargados: matchea el Excel contra el directorio de
  // Jugadores, extrae los Killers del chat (armarIndiceNombres usa Alias/Nombre + apodos guardados) y
  // vuelca el resultado de cada kill resuelto sobre el registro de la víctima, como `eliminadoPor`
  // (mismo campo que usa Game Night) — igual que ahí, un kill sin víctima reconocible se cuenta a favor
  // de quien lo escribió pero queda en el log para que el administrador lo revise antes de publicar.
  useEffect(() => {
    if (!excelJugadores?.length || !chatTexto) {
      setPreview(null);
      return;
    }
    const matched = {};
    const sinMatchExcel = [];
    for (const fila of excelJugadores) {
      const sitio = directorio.find((j) => norm(nombreCorto(j)) === norm(fila.alias) || norm(j.aliasPokerStars) === norm(fila.alias));
      const alias = sitio ? nombreCorto(sitio) : fila.alias;
      const clave = sitio?.correo || alias;
      if (!sitio) sinMatchExcel.push(fila.alias);
      matched[clave] = {
        alias,
        nombre: sitio?.nombre || fila.alias,
        correo: sitio?.correo || "",
        buyIn: true,
        rebuys: fila.rebuys,
        addon: fila.addon,
        lugar: fila.place,
        eliminadoPor: "",
        mejorMano: false,
      };
    }
    const { resueltos, noResueltos } = extraerKillersDeChat(chatTexto, directorio, estData.apodos || {});
    for (const k of resueltos) {
      const claveVictima = Object.keys(matched).find((c) => matched[c].alias === k.victimaAlias);
      if (claveVictima) matched[claveVictima].eliminadoPor = k.killerAlias;
    }
    setPreview({ porJugador: matched, sinMatchExcel, logNoResueltos: noResueltos });
  }, [excelJugadores, chatTexto, estData.apodos, directorio]);

  // sincroniza la asignación manual de los "dudosos" cada vez que cambia el preview (nuevo torneo, nuevo
  // archivo, o apodos recién guardados que resuelven más kills): conserva lo que el administrador ya
  // corrigió a mano y solo rellena los índices nuevos con el killerAlias que resolvió el chat, si lo hay.
  useEffect(() => {
    if (!preview) {
      setDudososAsignacion({});
      return;
    }
    setDudososAsignacion((prev) => {
      const next = {};
      preview.logNoResueltos.forEach((l, i) => {
        next[i] = prev[i] !== undefined ? prev[i] : (l.killerAlias || "");
      });
      return next;
    });
  }, [preview]);

  const previewCalculado = useMemo(() => {
    if (!preview || !torneoAdminInfo) return null;
    const tipoParaCalculo = torneoAdminInfo.campeonato === PRACTICA_CAMPEONATO ? "Regular" : torneoAdminInfo.tipo;
    return estadoTorneoDesdeLugares({
      jugadoresState: preview.porJugador,
      tableroMapa,
      campeonato: torneoAdminInfo.campeonato,
      tipo: tipoParaCalculo,
      fecha: torneoAdminInfo.fecha,
    });
  }, [preview, tableroMapa, torneoAdminInfo]);

  const filasPreview = useMemo(() => {
    if (!previewCalculado) return [];
    return Object.values(previewCalculado.porJugador).sort((a, b) => {
      if (a.lugar && b.lugar) return a.lugar - b.lugar;
      if (a.lugar) return -1;
      if (b.lugar) return 1;
      return norm(a.nombre).localeCompare(norm(b.nombre));
    });
  }, [previewCalculado]);

  function nombreKillerEnPreview(alias) {
    if (!alias) return "";
    const encontrado = filasPreview.find((j) => j.alias === alias);
    return encontrado ? encontrado.alias || encontrado.nombre : alias;
  }

  // total de kills HECHOS por cada jugador (a quién eliminó, no quién lo eliminó a él): suma los kills ya
  // confirmados en la tabla (el "eliminadoPor" de cada víctima) más los "dudosos" que el administrador
  // asignó a mano (o que ya venían con killerAlias resuelto y no se desasignaron).
  const killsPorAliasPreview = useMemo(() => {
    const tally = {};
    for (const j of filasPreview) {
      if (j.eliminadoPor) tally[j.eliminadoPor] = (tally[j.eliminadoPor] || 0) + 1;
    }
    if (preview) {
      preview.logNoResueltos.forEach((l, i) => {
        const alias = dudososAsignacion[i];
        if (alias) tally[alias] = (tally[alias] || 0) + 1;
      });
    }
    return tally;
  }, [filasPreview, preview, dudososAsignacion]);

  // fila de totales al pie del preview: Buy-ins, Re-buys, Add-ons, Debe, Premios y Saldo
  const totalesPreview = useMemo(() => {
    if (!filasPreview.length) return null;
    return filasPreview.reduce(
      (t, j) => ({
        buyIns: t.buyIns + (j.buyIn ? 1 : 0),
        rebuys: t.rebuys + (j.rebuys || 0),
        addons: t.addons + (j.addon ? 1 : 0),
        debe: t.debe + (j.debeTotal || 0),
        premio: t.premio + (j.premioTotal || 0),
        saldo: t.saldo + ((j.premioTotal || 0) - (j.debeTotal || 0)),
      }),
      { buyIns: 0, rebuys: 0, addons: 0, debe: 0, premio: 0, saldo: 0 }
    );
  }, [filasPreview]);

  async function publicar() {
    if (!previewCalculado || !torneoAdminInfo) return;
    if (torneoAdminInfo.yaGuardado?.publicado) {
      const ok = window.confirm("Este torneo ya tiene resultados publicados — al continuar se van a reemplazar por completo. ¿Continuar?");
      if (!ok) return;
    }
    setPublicando(true);
    setError("");
    try {
      const r = await fetch(API_EST, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accion: "guardarTorneo",
          campeonato: torneoAdminInfo.campeonato,
          fecha: torneoAdminInfo.fecha,
          tipo: torneoAdminInfo.campeonato === PRACTICA_CAMPEONATO ? "Regular" : torneoAdminInfo.tipo,
          jugadores: Object.values(previewCalculado.porJugador),
          // se guarda junto con cada entrada a quién quedó acreditado el kill (por default el killerAlias
          // que ya resolvió el chat, o lo que el administrador haya corregido a mano) — así la vista del
          // jugador puede mostrar el mismo total de kills por jugador sin tener que volver a calcularlo.
          logKillersNoResueltos: preview.logNoResueltos.map((l, i) => ({ ...l, asignadoA: dudososAsignacion[i] || "" })),
          publicar: true,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo publicar el resultado.");
      setEstData(json);
      setAviso(`Resultado de ${fechaFmt(torneoAdminInfo.fecha)} publicado correctamente.`);
      setTorneoAbierto({ campeonato: torneoAdminInfo.campeonato, fecha: torneoAdminInfo.fecha });
      reiniciarSubida();
    } catch (e) {
      setError(e.message || "No se pudo publicar el resultado.");
    } finally {
      setPublicando(false);
    }
  }

  // ───────── admin: editor de apodos de chat ─────────
  // 82ª entrega: el botón manual "Apodos de chat" (que abría este editor con lo ya guardado,
  // pre-cargado) se eliminó a pedido de Federico — "Excel Referencias" pasó a ser la única vía para
  // cargar/editar estos datos, y siempre reemplaza lo guardado (ver onApodosExcelSeleccionado más abajo),
  // así que ya no hace falta "sembrar" el borrador con lo previo.
  function cambiarApodo(alias, i, valor) {
    setApodosBorrador((prev) => {
      const fila = [...(prev[alias] || ["", "", ""])];
      fila[i] = valor;
      return { ...prev, [alias]: fila };
    });
  }

  // 82ª entrega: a pedido de Federico, "Excel Referencias" ahora SIEMPRE reemplaza lo que haya guardado
  // en el portal — ya no se fusiona de forma no-destructiva con lo previo (ese era el comportamiento de
  // hasta la 68ª/81ª entrega, cuando todavía existía el botón manual "Apodos de chat" para cargar/editar
  // a mano). El borrador se reconstruye desde cero en cada import: cada Alias PokerStars del directorio
  // arranca en blanco, y solo los que aparecen en el archivo quedan con sus referencias — nunca se
  // conserva un valor que ya estuviera guardado del lado del servidor si el archivo no lo repite. Se
  // muestra de inmediato en formato tabla (el mismo editor de siempre); sigue haciendo falta tocar
  // "Guardar apodos" para confirmar el reemplazo contra el servidor.
  // 85ª entrega: ya no se intenta leer/aceptar el archivo de una — se lee nada más para mostrar sus
  // columnas reales (encabezado + un ejemplo de la primera fila) y se abre el paso de mapeo
  // (`apodosMapeo`). Nada se guarda ni se reemplaza todavía en este paso.
  async function onApodosExcelSeleccionado(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError("");
    try {
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null });
      if (!filasCrudas.length) {
        setError("El archivo está vacío.");
        return;
      }
      const header = filasCrudas[0] || [];
      if (!header.length) {
        setError("No se encontró ninguna columna en la primera fila del archivo.");
        return;
      }
      const { colAlias, colsRef } = adivinarColumnasApodos(header);
      setApodosHeader(header);
      setApodosMuestra(filasCrudas[1] || []);
      setApodosFilasCrudas(filasCrudas);
      setApodosNombreArchivo(archivo.name);
      setApodosMapColAlias(colAlias);
      setApodosMapColsRef(colsRef);
      setApodosMapeo(true);
    } catch {
      setError("No se pudo leer el archivo de referencias. ¿Seguro que es un .xlsx?");
    }
  }

  function alternarColRef(i) {
    setApodosMapColsRef((prev) => (prev.includes(i) ? prev.filter((c) => c !== i) : [...prev, i].sort((a, b) => a - b)));
  }

  // 85ª entrega: confirma el mapeo elegido a mano y recién ahí arma el borrador (mismo criterio de
  // "siempre reemplaza" desde la 82ª entrega) — este es el único lugar donde el archivo efectivamente se
  // usa para construir la tabla editable de apodos.
  function confirmarMapeoApodos() {
    if (apodosMapColAlias < 0) {
      setError("Elegí cuál columna es el Alias PokerStars antes de continuar.");
      return;
    }
    const base = construirApodosDesdeMapeo(apodosFilasCrudas, apodosMapColAlias, apodosMapColsRef, directorio);
    setApodosBorrador(base);
    setApodosMapeo(false);
    setEditorApodos(true);
    setAviso(`Referencias importadas de "${apodosNombreArchivo}" — reemplazaron lo que había guardado. Revisá y guardá para confirmar.`);
  }

  function cancelarMapeoApodos() {
    setApodosMapeo(false);
    setApodosHeader([]);
    setApodosMuestra([]);
    setApodosFilasCrudas([]);
    setApodosNombreArchivo("");
  }
  async function guardarApodos() {
    setGuardandoApodos(true);
    setError("");
    try {
      const r = await fetch(API_EST, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "guardarApodos", apodos: apodosBorrador }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudieron guardar los apodos.");
      setEstData(json);
      setEditorApodos(false);
      setAviso("Apodos de chat guardados.");
    } catch (e) {
      setError(e.message || "No se pudieron guardar los apodos.");
    } finally {
      setGuardandoApodos(false);
    }
  }

  if (cargando) {
    return (
      <div>
        <div className="eyebrow">♠ Torrente On Line Series - TOLS 3.0</div>
        <h1>Estadísticas</h1>
        <p className="subtitle">Cargando…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow">♠ Torrente On Line Series - TOLS 3.0</div>
      <h1>Estadísticas</h1>

      {error && <div className="section-sub" style={{ color: "#b00020" }}>{error}</div>}
      {aviso && <div className="section-sub" style={{ color: "#2e7d32" }}>{aviso}</div>}

      <div className="section">
        <div className="section-head">
          <div className="section-title">Clasificación general</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 0" }}>
          {[
            ["puntos", "Por puntos"],
            ["killers", "Por killers"],
            // 90ª entrega: "Por resultado" muestra Debe/Premio en dinero — solo administradores y Tesorero.
            ...(puedeVerPorResultado(session?.rol) ? [["resultado", "Por resultado"]] : []),
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={"btn " + (vistaClasificacion === key ? "btn-primary" : "btn-secondary")}
              onClick={() => setVistaClasificacion(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 72ª entrega (ajuste pedido por Federico): tabla completa, con TODAS las columnas de torneos de
            izquierda a derecha (publicados o no, en cero los que faltan) y la de Total siempre visible —
            si no entra en el ancho de pantalla, se hace scroll horizontal en vez de ocultar columnas.
            Diseño de cuadrícula (bordes en todas las celdas), números centrados, "Lugar" como primera
            columna fija (posición 1..n según el orden actual, nunca se mueve ni se puede ordenar por
            ella) y los torneos Main resaltados en otro color para diferenciarlos de los Regular. */}
        {columnasClasif.length === 0 && torneosPracticaPublicados.length === 0 ? (
          <div className="section-sub" style={{ padding: 16 }}>Todavía no hay torneos registrados para el campeonato activo.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Lugar</th>
                  <th style={{ textAlign: "left", border: "1px solid #ccc", padding: "6px 8px" }}>Alias PokerStars</th>
                  {columnasClasif.map((c) => (
                    <th
                      key={c.fecha}
                      title={`${c.tipo} · ${fechaFmt(c.fecha)}`}
                      style={{
                        textAlign: "center",
                        // 98ª/99ª entrega: el color/negrita de siempre en el encabezado de un torneo Main se
                        // completa con UN SOLO recuadro externo alrededor de toda la columna (encabezado +
                        // cuerpo) — Federico aclaró en la 99ª entrega que el pedido original ("pon todas esas
                        // columnas con un recuadro alrededor") era ese marco exterior, no un recuadro por
                        // celda (lo que la 98ª entrega había hecho, con `border` grueso en cada celda, dando
                        // una grilla de cajitas en vez de un solo rectángulo). El encabezado lleva los 4 lados
                        // gruesos (tapa superior del marco); el cuerpo solo lleva los lados IZQUIERDO/DERECHO
                        // gruesos en cada fila (más ABAJO gruesa en la última fila, ver el `<tbody>`) — así el
                        // marco queda continuo de arriba a abajo, con las líneas finas normales entre filas.
                        border: c.tipo === "Main" ? "2px solid #b8860b" : "1px solid #ccc",
                        padding: "6px 8px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        color: c.tipo === "Main" ? "#b8860b" : undefined,
                        fontWeight: c.tipo === "Main" ? 700 : undefined,
                      }}
                      onClick={() => ordenarClasifPor(c.fecha)}
                    >
                      {c.numero}{ordenClasif.col === c.fecha ? (ordenClasif.dir === "desc" ? " ▼" : " ▲") : ""}
                    </th>
                  ))}
                  {vistaClasificacion === "puntos" && (
                    <th
                      style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                      onClick={() => ordenarClasifPor("practica")}
                    >
                      Práctica{ordenClasif.col === "practica" ? (ordenClasif.dir === "desc" ? " ▼" : " ▲") : ""}
                    </th>
                  )}
                  <th
                    style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                    onClick={() => ordenarClasifPor("total")}
                  >
                    Total{ordenClasif.col === "total" ? (ordenClasif.dir === "desc" ? " ▼" : " ▲") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 98ª entrega: los renglones de 1°/2°/3° lugar (oro/plata/bronce) y los números de cada
                    columna Main (coloreados + recuadrados, igual que su propio encabezado) son pedidos
                    explícitos de Federico ("me gusta mucho esta tabla... pon todas esas columnas con un
                    recuadro... los renglones de 1°/2°/3° hazlos visiblemente distintos, como oro/plata/
                    bronce"). `PODIO[i]` es `undefined` del 4º lugar en adelante — sin cambio ahí. */}
                {filasClasifOrdenadas.map((f, i) => {
                  const podio = PODIO_CLASIF[i];
                  return (
                    <tr key={f.jugador.correo || f.alias} style={podio ? { background: podio.fondo } : undefined}>
                      <td
                        style={{
                          padding: "6px 8px",
                          border: podio ? `2px solid ${podio.borde}` : "1px solid #eee",
                          textAlign: "center",
                          fontWeight: podio ? 700 : undefined,
                          color: podio ? podio.borde : undefined,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td style={{ padding: "6px 8px", border: "1px solid #eee", fontWeight: podio ? 700 : undefined }}>
                        {f.alias}
                      </td>
                      {columnasClasif.map((c) => {
                        const esMainCol = c.tipo === "Main";
                        const esUltimaFila = i === filasClasifOrdenadas.length - 1;
                        return (
                          <td
                            key={c.fecha}
                            style={
                              esMainCol
                                ? {
                                    padding: "6px 8px",
                                    textAlign: "center",
                                    color: "#b8860b",
                                    fontWeight: 700,
                                    // 99ª entrega: solo el marco EXTERIOR de la columna — grueso a los
                                    // costados en toda fila, y grueso abajo únicamente en la última fila
                                    // (el grueso de arriba lo aporta el borde inferior del encabezado,
                                    // que "gana" sobre el borde fino de esta primera fila al colapsar).
                                    borderLeft: "2px solid #b8860b",
                                    borderRight: "2px solid #b8860b",
                                    borderTop: "1px solid #eee",
                                    borderBottom: esUltimaFila ? "2px solid #b8860b" : "1px solid #eee",
                                  }
                                : { padding: "6px 8px", border: "1px solid #eee", textAlign: "center" }
                            }
                          >
                            {fmtClasifValor(f.valores[c.fecha] || 0)}
                          </td>
                        );
                      })}
                      {vistaClasificacion === "puntos" && (
                        <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "center" }}>{f.practica}</td>
                      )}
                      <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "center", fontWeight: "bold" }}>
                        {fmtClasifValor(f.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">Resultados Torneos</div>
        </div>
        {torneosPublicados.length === 0 ? (
          <div className="section-sub" style={{ padding: 16 }}>Todavía no hay ningún torneo publicado.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0" }}>
            {torneosPublicados.map((t) => {
              const activo = torneoAbierto && torneoAbierto.campeonato === t.campeonato && torneoAbierto.fecha === t.fecha;
              return (
                <button
                  key={`${t.campeonato}|${t.fecha}`}
                  type="button"
                  className={"btn " + (activo ? "btn-primary" : "btn-secondary")}
                  onClick={() => setTorneoAbierto(activo ? null : t)}
                >
                  {etiquetaTorneo(t.campeonato, t.fecha, t.tipo)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {torneoActual && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">
              Resultados torneo {etiquetaTorneo(torneoAbierto.campeonato, torneoAbierto.fecha, torneoActual.tipo)}
            </div>
            {admin && (
              <button type="button" className="btn btn-secondary btn-filtro" onClick={exportarExcel}>
                📤 Exportar a Excel
              </button>
            )}
          </div>
          {/* 70ª entrega: a pedido de Federico, esta tabla dejó de usar la grilla con badges/óvalos
              (🏆/🫧, "Lugar N") y pasó al mismo formato plano que ya usaba el preview del administrador
              antes de publicar — a todo el ancho de página, sin recuadros. */}
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Alias PokerStars</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Buy-in</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Re-buys</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Add-on</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Killer</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Lugar</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Kills</th>
                {esMainActual && <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Mejor mano</th>}
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Puntos</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Debe</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Premio</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {jugadoresTorneoActual.map((j) => {
                const saldo = (j.premioTotal || 0) - (j.debeTotal || 0);
                return (
                  <tr key={j.correo || j.alias}>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>
                      {j.alias || j.nombre}{j.esCampeon ? " (Campeón)" : ""}{j.esBurbuja ? " (Burbuja)" : ""}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.buyIn ? 1 : 0}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.rebuys || 0}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.addon ? 1 : 0}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>{nombreKillerEnTorneo(j.eliminadoPor)}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.lugar || ""}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>
                      {adminGeneral && editandoKills === j.alias ? (
                        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="number"
                            min={0}
                            max={maxKillsTorneoActual}
                            value={borradorKills}
                            onChange={(e) => setBorradorKills(e.target.value)}
                            style={{ width: 56, textAlign: "right" }}
                            disabled={guardandoKills}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "2px 6px" }}
                            disabled={guardandoKills}
                            onClick={() => guardarKillsManual(j.alias)}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "2px 6px" }}
                            disabled={guardandoKills}
                            onClick={() => { setEditandoKills(null); setErrorKills(""); }}
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <span>
                          {killsPorAliasTorneo[j.alias] || 0}
                          {adminGeneral && (
                            <button
                              type="button"
                              title="Corregir kills"
                              className="btn btn-secondary"
                              style={{ padding: "0 4px", marginLeft: 6, fontSize: 11 }}
                              onClick={() => {
                                setEditandoKills(j.alias);
                                setBorradorKills(String(killsPorAliasTorneo[j.alias] || 0));
                                setErrorKills("");
                              }}
                            >
                              ✎
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    {esMainActual && <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>{j.mejorMano ? "Sí" : "No"}</td>}
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.puntos ?? 0}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{moneyContable(-(j.debeTotal || 0))}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{money(j.premioTotal)}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{moneyContable(saldo)}</td>
                  </tr>
                );
              })}
            </tbody>
            {totalesTorneo && (
              <tfoot>
                <tr style={{ fontWeight: "bold" }}>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}>Totales</td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{totalesTorneo.buyIns}</td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{totalesTorneo.rebuys}</td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{totalesTorneo.addons}</td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>
                    {Object.values(killsPorAliasTorneo).reduce((s, n) => s + n, 0)}
                  </td>
                  {esMainActual && <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>}
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{moneyContable(-totalesTorneo.debe)}</td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{money(totalesTorneo.premio)}</td>
                  <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{moneyContable(totalesTorneo.saldo)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {errorKills && <div className="section-sub" style={{ color: "#b00020" }}>{errorKills}</div>}
          {torneoActual.logKillersNoResueltos?.length > 0 && (
            <details style={{ margin: "8px 0" }}>
              <summary>
                {torneoActual.logKillersNoResueltos.length} killer(s) del chat sin víctima confirmada (se cuentan igual a favor de quien los escribió)
              </summary>
              <ul>
                {torneoActual.logKillersNoResueltos.map((l, i) => (
                  <li key={i} style={{ fontSize: 13 }}>
                    [{l.fecha} {l.hora}] {l.remitente}: "{l.mensaje}" — {l.motivo}
                    {l.asignadoA ? <> (asignado a {l.asignadoA})</> : <> (sin asignar)</>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {admin && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Subir resultados</div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "8px 0" }}>
            <label className="campo-label">
              Torneo:&nbsp;
              <select value={torneoAdminSel} onChange={(e) => { setTorneoAdminSel(e.target.value); reiniciarSubida(); }}>
                {opcionesTorneoAdmin.map((o) => {
                  const guardado = estData.torneos?.[o.campeonato]?.[o.fecha];
                  const estadoTxt = guardado?.publicado ? " (ya publicado)" : guardado ? " (cargado, sin publicar)" : "";
                  return (
                    <option key={`${o.campeonato}|${o.fecha}`} value={`${o.campeonato}|${o.fecha}`}>
                      {etiquetaTorneo(o.campeonato, o.fecha, o.tipo)}{estadoTxt}
                    </option>
                  );
                })}
              </select>
            </label>
            {/* 82ª entrega: botones renombrados a pedido de Federico — "Excel PokerStars"/"Txt WhatsApp"/
                "Excel Referencias" en vez de los nombres largos de antes; el botón "Apodos de chat" (que
                abría el editor vacío/con lo ya guardado para editar a mano) se eliminó — "Excel
                Referencias" pasó a ser la única vía para cargar estos datos (ver más abajo). */}
            <button type="button" className="btn btn-secondary" onClick={() => excelRef.current?.click()}>
              📥 {excelNombreArchivo || "Excel PokerStars"}
            </button>
            <input ref={excelRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onExcelSeleccionado} />
            <button type="button" className="btn btn-secondary" onClick={() => chatRef.current?.click()}>
              💬 {chatNombreArchivo || "Txt WhatsApp"}
            </button>
            <input ref={chatRef} type="file" accept=".txt" style={{ display: "none" }} onChange={onChatSeleccionado} />
            {(excelNombreArchivo || chatNombreArchivo) && (
              <button type="button" className="btn btn-secondary" onClick={reiniciarSubida}>✕ Quitar archivos</button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => apodosExcelRef.current?.click()}>
              📥 Excel Referencias
            </button>
            <input ref={apodosExcelRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onApodosExcelSeleccionado} />
          </div>
          {excelError && <div className="section-sub" style={{ color: "#b00020" }}>{excelError}</div>}
          {/* 84ª entrega (bugfix): el error de "Excel Referencias" se guarda en el mismo estado `error`
              genérico de toda la pantalla, que solo se mostraba hasta arriba de todo (junto al título) —
              muy lejos de este botón, que vive más abajo en "Subir resultados". Si el archivo fallaba al
              leerse (columnas no reconocidas, archivo vacío, etc.), el aviso SÍ aparecía, pero fuera de
              la vista de quien recién apretó el botón, dando la impresión de que "no pasó nada". Se
              repite el mismo aviso acá, justo debajo del botón, para que sea imposible no verlo. */}
          {error && <div className="section-sub" style={{ color: "#b00020" }}>{error}</div>}

          {preview && (
            <>
              {preview.sinMatchExcel.length > 0 && (
                <div className="section-sub" style={{ color: "#b00020" }}>
                  No se reconocieron en el directorio de Jugadores: {preview.sinMatchExcel.join(", ")}. Esos jugadores no van a quedar en la tabla — revisa el Alias PokerStars en "Jugadores".
                </div>
              )}
              {preview.logNoResueltos.length > 0 && (
                <details style={{ margin: "8px 0" }} open>
                  <summary>{preview.logNoResueltos.length} killer(s) del chat sin víctima confirmada (se cuentan igual a favor de quien los escribió)</summary>
                  <p className="section-sub" style={{ margin: "6px 0" }}>
                    Cada uno ya se cuenta a favor de quien escribió el mensaje cuando se lo reconoce — revisá o corregí a quién se le acredita antes de publicar.
                  </p>
                  <ul>
                    {preview.logNoResueltos.map((l, i) => (
                      <li key={i} style={{ fontSize: 13, marginBottom: 6, listStyle: "none" }}>
                        [{l.fecha} {l.hora}] {l.remitente}: "{l.mensaje}" — {l.motivo}
                        <br />
                        Asignar kill a:&nbsp;
                        <select
                          value={dudososAsignacion[i] || ""}
                          onChange={(e) => setDudososAsignacion((prev) => ({ ...prev, [i]: e.target.value }))}
                        >
                          <option value="">Sin asignar</option>
                          {directorio.map((j) => {
                            const a = nombreCorto(j);
                            return a ? <option key={a} value={a}>{a}</option> : null;
                          })}
                        </select>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Preview de revisión del administrador antes de publicar: tabla plana, sin badges ni
                  cajas de color (pedido explícito de Federico), para que se lea como una planilla común
                  y se note claramente que es un borrador, no la vista final que ven los jugadores. */}
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Alias PokerStars</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Buy-in</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Re-buys</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Add-on</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Killer</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Lugar</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Kills</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Puntos</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Debe</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Premio</th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {filasPreview.map((j) => (
                    <tr key={j.correo || j.alias}>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>{j.alias || j.nombre}{j.esCampeon ? " (Campeón)" : ""}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.buyIn ? 1 : 0}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.rebuys || 0}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.addon ? 1 : 0}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>{nombreKillerEnPreview(j.eliminadoPor)}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.lugar || ""}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{killsPorAliasPreview[j.alias] || 0}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{j.puntos ?? 0}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{moneyContable(-(j.debeTotal || 0))}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{money(j.premioTotal)}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{moneyContable((j.premioTotal || 0) - (j.debeTotal || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                {totalesPreview && (
                  <tfoot>
                    <tr style={{ fontWeight: "bold" }}>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}>Totales</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{totalesPreview.buyIns}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{totalesPreview.rebuys}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{totalesPreview.addons}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>
                        {Object.values(killsPorAliasPreview).reduce((s, n) => s + n, 0)}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999" }}></td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{moneyContable(-totalesPreview.debe)}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{money(totalesPreview.premio)}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{moneyContable(totalesPreview.saldo)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>

              <button type="button" className="btn btn-primary" disabled={publicando} onClick={publicar}>
                {publicando ? "Publicando…" : "Publicar"}
              </button>
            </>
          )}
        </div>
      )}

      {admin && apodosMapeo && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Mapear columnas — "{apodosNombreArchivo}"</div>
          </div>
          <p className="section-sub">
            Estas son las columnas reales que trae el archivo. Elegí cuál es el Alias PokerStars (una sola)
            y cuáles son de referencia (las que quieras, pueden ser más o menos de 3) — nada se guarda
            todavía.
          </p>
          <div className="tbl" style={{ overflowX: "auto" }}>
            <div className="trow thead" style={{ gridTemplateColumns: "80px 1fr 1fr 90px 90px" }}>
              <div>Columna</div><div>Encabezado</div><div>Ejemplo (fila 1)</div><div>Alias</div><div>Referencia</div>
            </div>
            {apodosHeader.map((col, i) => (
              <div className="trow" style={{ gridTemplateColumns: "80px 1fr 1fr 90px 90px" }} key={i}>
                <div className="section-note">Col. {i + 1}</div>
                <div>{String(col ?? "").trim() || <span className="section-note">(sin nombre)</span>}</div>
                <div className="section-note">{String(apodosMuestra[i] ?? "").trim() || "—"}</div>
                <div>
                  <input
                    type="radio"
                    name="apodos-col-alias"
                    checked={apodosMapColAlias === i}
                    onChange={() => setApodosMapColAlias(i)}
                  />
                </div>
                <div>
                  <input
                    type="checkbox"
                    checked={apodosMapColsRef.includes(i)}
                    onChange={() => alternarColRef(i)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 0" }}>
            <button type="button" className="btn btn-primary" onClick={confirmarMapeoApodos}>Usar estas columnas</button>
            <button type="button" className="btn btn-secondary" onClick={cancelarMapeoApodos}>Cancelar</button>
          </div>
        </div>
      )}

      {admin && editorApodos && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Apodos de chat</div>
          </div>
          <p className="section-sub">
            Hasta 3 nombres o apodos con los que un jugador puede aparecer firmando mensajes en el chat de WhatsApp, además de su Alias PokerStars y su Nombre. Se usan para reconocer quién mató a quién. "Excel Referencias" siempre reemplaza lo que ya estaba guardado — recordá tocar "Guardar apodos" para confirmar el reemplazo.
          </p>
          <div className="tbl" style={{ overflowX: "auto" }}>
            <div className="trow thead" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 1fr" }}>
              <div>Alias PokerStars</div><div>Referencia 1</div><div>Referencia 2</div><div>Referencia 3</div>
            </div>
            {Object.keys(apodosBorrador).sort((a, b) => a.localeCompare(b)).map((alias) => (
              <div className="trow" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 1fr" }} key={alias}>
                <div>{alias}</div>
                {[0, 1, 2].map((i) => (
                  <div key={i}>
                    <input
                      type="text"
                      value={apodosBorrador[alias]?.[i] || ""}
                      onChange={(e) => cambiarApodo(alias, i, e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 0" }}>
            <button type="button" className="btn btn-primary" disabled={guardandoApodos} onClick={guardarApodos}>
              {guardandoApodos ? "Guardando…" : "Guardar apodos"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditorApodos(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
