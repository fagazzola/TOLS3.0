import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { estadoTorneoDesdeLugares, tipoDeFecha, PRACTICA_CAMPEONATO } from "../lib/gamenight.js";
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

function money(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("en-US");
}
function moneyFirmado(n) {
  const v = Math.round(Number(n || 0));
  return (v < 0 ? "-" : "") + "$ " + Math.abs(v).toLocaleString("en-US");
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

// parser del Excel de referencias de chat que Federico ya tenía armado ("Referencias para Chat -
// Killers.xlsx"): una fila por jugador con su Alias PokerStars y hasta 3 columnas de referencia (el
// nombre/apodo con el que puede firmar en el chat de WhatsApp). El encabezado se busca por nombre de
// columna ("alias" / "referencia"), tolerando que el archivo real las nombre "Referencia1",
// "Referencia 2", "Referencia 3" (con o sin espacio, y numeración corrida).
function leerExcelApodos(filas) {
  if (!filas.length) return { filas: [], error: "El archivo está vacío." };
  const header = (filas[0] || []).map((c) => String(c ?? "").trim().toLowerCase());
  const colAlias = header.findIndex((c) => c.includes("alias"));
  const colsRef = [];
  header.forEach((c, i) => { if (c.includes("referencia")) colsRef.push(i); });
  if (colAlias < 0 || !colsRef.length) {
    return { filas: [], error: 'No se reconocieron las columnas "Alias PokerStars" / "Referencia" en el archivo.' };
  }
  const resultado = [];
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const alias = String(fila[colAlias] ?? "").trim();
    if (!alias) continue;
    const referencias = colsRef.map((c) => String(fila[c] ?? "").trim()).filter(Boolean);
    resultado.push({ alias, referencias });
  }
  return { filas: resultado, error: "" };
}

function etiquetaTipo(campeonato, tipo) {
  if (campeonato === PRACTICA_CAMPEONATO) return "Práctica";
  return tipo === "Main" ? "Main Event" : "Regular";
}

export default function Estadisticas({ session }) {
  const admin = esAdmin(session?.rol);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [campeonatos, setCampeonatos] = useState({ nombres: [], activo: "" });
  const [torneosCal, setTorneosCal] = useState([]);
  const [directorio, setDirectorio] = useState([]);
  const [tableroMapa, setTableroMapa] = useState({});
  const [estData, setEstData] = useState({ torneos: {}, apodos: {} });

  const [torneoAbierto, setTorneoAbierto] = useState(null); // { campeonato, fecha }

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
        setDirectorio((jug?.jugadores || []).filter((j) => j.estatus === "Activo"));
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

  useEffect(() => {
    if (!torneoAbierto && torneosPublicados.length) setTorneoAbierto(torneosPublicados[0]);
  }, [torneosPublicados]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const killsPorAliasTorneo = useMemo(() => {
    const tally = {};
    for (const j of jugadoresTorneoActual) {
      if (j.eliminadoPor) tally[j.eliminadoPor] = (tally[j.eliminadoPor] || 0) + 1;
    }
    (torneoActual?.logKillersNoResueltos || []).forEach((l) => {
      if (l.asignadoA) tally[l.asignadoA] = (tally[l.asignadoA] || 0) + 1;
    });
    return tally;
  }, [jugadoresTorneoActual, torneoActual]);

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
      // por default selecciona el torneo más reciente (aunque el combo se muestre de más cercano a más
      // lejano, el más útil para subir resultados suele ser el último jugado)
      const o = opcionesTorneoAdmin.reduce((mas, cur) => (cur.fecha > mas.fecha ? cur : mas), opcionesTorneoAdmin[0]);
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
  function seedApodosBorrador() {
    const borrador = {};
    for (const j of directorio) {
      const alias = nombreCorto(j);
      if (!alias) continue;
      const previos = estData.apodos?.[alias] || [];
      borrador[alias] = [previos[0] || "", previos[1] || "", previos[2] || ""];
    }
    return borrador;
  }
  function abrirEditorApodos() {
    setApodosBorrador(seedApodosBorrador());
    setEditorApodos(true);
  }
  function cambiarApodo(alias, i, valor) {
    setApodosBorrador((prev) => {
      const fila = [...(prev[alias] || ["", "", ""])];
      fila[i] = valor;
      return { ...prev, [alias]: fila };
    });
  }

  // Importa el Excel de referencias de chat que Federico ya tenía armado (Alias PokerStars + hasta 3
  // referencias) — a pedido explícito, esto NUNCA borra un apodo ya guardado: cada referencia del
  // archivo se agrega en el primer espacio libre de esa fila (sin duplicar una que ya esté), y un
  // jugador que no esté en el archivo mantiene intactos los apodos que ya tenía.
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
      const { filas, error: err } = leerExcelApodos(filasCrudas);
      if (err) {
        setError(err);
        return;
      }
      setEditorApodos(true);
      setApodosBorrador((prev) => {
        const base = Object.keys(prev).length ? { ...prev } : seedApodosBorrador();
        for (const { alias, referencias } of filas) {
          const actuales = [...(base[alias] || ["", "", ""])];
          for (const valor of referencias) {
            if (!valor || actuales.includes(valor)) continue;
            const idxVacio = actuales.findIndex((v) => !v);
            if (idxVacio >= 0) actuales[idxVacio] = valor;
          }
          base[alias] = actuales.slice(0, 3);
        }
        return base;
      });
      setAviso(`Referencias importadas de "${archivo.name}" — revisá y guardá para confirmar.`);
    } catch {
      setError("No se pudo leer el archivo de referencias. ¿Seguro que es un .xlsx?");
    }
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

  const colsResultados = esMainActual
    ? "1.3fr 0.6fr 0.7fr 0.6fr 1fr 0.6fr 0.6fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr"
    : "1.3fr 0.6fr 0.7fr 0.6fr 1fr 0.6fr 0.6fr 0.6fr 0.8fr 0.8fr 0.8fr";
  const anchoMinResultados = esMainActual ? 1040 : 940;

  return (
    <div>
      <div className="eyebrow">♠ Torrente On Line Series - TOLS 3.0</div>
      <h1>Estadísticas</h1>
      <p className="subtitle">Resultados de los torneos ya publicados por un administrador.</p>

      {error && <div className="section-sub" style={{ color: "#b00020" }}>{error}</div>}
      {aviso && <div className="section-sub" style={{ color: "#2e7d32" }}>{aviso}</div>}

      <div className="section">
        <div className="section-head">
          <div className="section-title">Torneos publicados</div>
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
                  onClick={() => setTorneoAbierto(t)}
                >
                  {fechaFmt(t.fecha)} · {etiquetaTipo(t.campeonato, t.tipo)}
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
              Resultados torneo {fechaFmt(torneoAbierto.fecha)} · {etiquetaTipo(torneoAbierto.campeonato, torneoAbierto.tipo)}
            </div>
            {admin && (
              <button type="button" className="btn btn-secondary btn-filtro" onClick={exportarExcel}>
                📤 Exportar a Excel
              </button>
            )}
          </div>
          <div className="tbl" style={{ overflowX: "auto" }}>
            <div className="trow thead" style={{ gridTemplateColumns: colsResultados, minWidth: anchoMinResultados }}>
              <div>Alias PokerStars</div><div>Buy-in</div><div>Re-buys</div><div>Add-on</div><div>Killer</div><div>Lugar</div><div>Kills</div>
              {esMainActual && <div>Mejor mano</div>}
              <div>Puntos</div><div>Debe (-)</div><div>Premio (+)</div><div>Saldo</div>
            </div>
            {jugadoresTorneoActual.map((j) => {
              const saldo = (j.premioTotal || 0) - (j.debeTotal || 0);
              return (
                <div className="trow" style={{ gridTemplateColumns: colsResultados, minWidth: anchoMinResultados }} key={j.correo || j.alias}>
                  <div>
                    {j.alias || j.nombre}
                    {j.esCampeon && <span className="badge badge-campeon" style={{ marginLeft: 6 }} title="Campeón">🏆</span>}
                    {j.esBurbuja && <span className="badge badge-burbuja" style={{ marginLeft: 6 }} title="Burbuja">🫧</span>}
                  </div>
                  <div>{j.buyIn ? "1" : "0"}</div>
                  <div className="num">{j.rebuys || 0}</div>
                  <div>{j.addon ? "1" : "0"}</div>
                  <div>{nombreKillerEnTorneo(j.eliminadoPor)}</div>
                  <div>{j.esCampeon ? <span className="badge badge-campeon">1</span> : j.lugar ? <span className="badge badge-regular">Lugar {j.lugar}</span> : <span className="muted">—</span>}</div>
                  <div className="num">{killsPorAliasTorneo[j.alias] || 0}</div>
                  {esMainActual && <div>{j.mejorMano ? "Sí" : "No"}</div>}
                  <div className="num right">{j.puntos ?? 0}</div>
                  <div className="num right">{moneyFirmado(-(j.debeTotal || 0))}</div>
                  <div className="num right">{money(j.premioTotal)}</div>
                  <div className="num right">{moneyFirmado(saldo)}</div>
                </div>
              );
            })}
            {totalesTorneo && (
              <div className="trow" style={{ gridTemplateColumns: colsResultados, minWidth: anchoMinResultados, fontWeight: "bold" }}>
                <div>Totales</div>
                <div>{totalesTorneo.buyIns}</div>
                <div className="num">{totalesTorneo.rebuys}</div>
                <div>{totalesTorneo.addons}</div>
                <div></div>
                <div></div>
                <div className="num">{Object.values(killsPorAliasTorneo).reduce((s, n) => s + n, 0)}</div>
                {esMainActual && <div></div>}
                <div></div>
                <div className="num right">{moneyFirmado(-totalesTorneo.debe)}</div>
                <div className="num right">{money(totalesTorneo.premio)}</div>
                <div className="num right">{moneyFirmado(totalesTorneo.saldo)}</div>
              </div>
            )}
          </div>
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
                      {fechaFmt(o.fecha)} · {etiquetaTipo(o.campeonato, o.tipo)}{estadoTxt}
                    </option>
                  );
                })}
              </select>
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => excelRef.current?.click()}>
              📥 {excelNombreArchivo || "Elegir Excel de resultados (PokerStars)"}
            </button>
            <input ref={excelRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onExcelSeleccionado} />
            <button type="button" className="btn btn-secondary" onClick={() => chatRef.current?.click()}>
              💬 {chatNombreArchivo || "Elegir chat de WhatsApp (.txt) con los Killers"}
            </button>
            <input ref={chatRef} type="file" accept=".txt" style={{ display: "none" }} onChange={onChatSeleccionado} />
            {(excelNombreArchivo || chatNombreArchivo) && (
              <button type="button" className="btn btn-secondary" onClick={reiniciarSubida}>✕ Quitar archivos</button>
            )}
            <button type="button" className="btn btn-secondary" onClick={abrirEditorApodos}>✎ Apodos de chat</button>
            <button type="button" className="btn btn-secondary" onClick={() => apodosExcelRef.current?.click()}>
              📥 Importar Excel de referencias
            </button>
            <input ref={apodosExcelRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onApodosExcelSeleccionado} />
          </div>
          {excelError && <div className="section-sub" style={{ color: "#b00020" }}>{excelError}</div>}

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
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{moneyFirmado(-(j.debeTotal || 0))}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{money(j.premioTotal)}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right" }}>{moneyFirmado((j.premioTotal || 0) - (j.debeTotal || 0))}</td>
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
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{moneyFirmado(-totalesPreview.debe)}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{money(totalesPreview.premio)}</td>
                      <td style={{ padding: "6px 8px", borderTop: "2px solid #999", textAlign: "right" }}>{moneyFirmado(totalesPreview.saldo)}</td>
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

      {admin && editorApodos && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Apodos de chat</div>
          </div>
          <p className="section-sub">
            Hasta 3 nombres o apodos con los que un jugador puede aparecer firmando mensajes en el chat de WhatsApp, además de su Alias PokerStars y su Nombre. Se usan para reconocer quién mató a quién. "Importar Excel de referencias" agrega lo que traiga el archivo sin borrar nada de lo que ya está cargado — recordá tocar "Guardar apodos" para confirmar los cambios.
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
