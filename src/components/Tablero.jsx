import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import seed from "../data/tablero.json";
import { PUNTOS_PRACTICA_KEY } from "../lib/gamenight.js";

const API = "/api/tablero";
const API_CAMP = "/api/campeonatos";
const API_CAL = "/api/calendario";
const API_PARAM = "/api/parametros";

function isoHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// mismo criterio que usa el Calendario (estatusTorneo en Calendario.jsx) para saber si un campeonato
// ya empezó a jugarse: "en-curso" si algunas fechas ya pasaron y otras no — mientras esté así, no se
// permite cambiar cuál es el campeonato activo del sitio desde aquí, para no interrumpir una temporada
// a medias.
function estatusCampeonato(nombre, torneosCal) {
  if (!nombre) return "sin-fechas";
  const fechas = (torneosCal || []).filter((t) => t.temporada === nombre);
  if (fechas.length === 0) return "sin-fechas";
  const hoy = isoHoy();
  const jugadas = fechas.filter((t) => t.fecha < hoy).length;
  if (jugadas === 0) return "no-iniciado";
  if (jugadas === fechas.length) return "terminado";
  return "en-curso";
}

const PLANTILLA = Object.values(seed)[0];

// ids antiguos que cambiaron de nombre entre versiones del esquema — se renombran en vez de
// duplicarse cuando más abajo se asegura que los conceptos protegidos existan
const RENOMBRAR_ID_COBRO = { "addon-1": "addon" };

function money(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("en-US");
}
function pct(n) {
  return Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 }) + "%";
}
function sumPct(arr) {
  return arr.reduce((a, l) => a + Number(l.pct || 0), 0);
}
function nuevoId() {
  return "custom-" + Math.random().toString(36).slice(2, 9);
}
function fechaFmt(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso || "";
}
// 91ª entrega: para mostrar cuándo terminó "Exportar todo a Excel" — a diferencia de fechaFmt() (una
// fecha simple "yyyy-mm-dd" del Calendario/Tablero), esto formatea un timestamp ISO completo (con hora),
// como el que guarda `terminadoEn` en exportar-excel-background.js, en la hora local del navegador.
function fechaHoraFmt(isoDatetime) {
  const d = new Date(isoDatetime);
  if (Number.isNaN(d.getTime())) return isoDatetime || "";
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}
// puntos de respaldo para un torneo de práctica que todavía no tiene su propia configuración guardada
// — mismo default que usaba la tabla fija de antes de esta entrega (ver src/lib/gamenight.js).
function puntosPracticaDefault() {
  return [{ pos: 1, puntos: 3 }, { pos: 2, puntos: 2 }, { pos: 3, puntos: 1 }];
}

// un campeonato NUEVO arranca de cero — nunca hereda los valores de otro campeonato. Se conserva la
// estructura mínima obligatoria (un lugar en cada reparto de premios, Rey Killer, y los 3 cobros
// protegidos) para que la pantalla no se rompa, pero todos los montos/puntos empiezan en 0.
function plantillaEnBlanco() {
  return {
    premios: {
      porTorneo: { pctAcumulado: 0, lugares: [{ label: "Lugar 1", pct: 100 }] },
      porCampeonato: { lugares: [{ label: "Rey Killer", pct: 100, reyKiller: true }] },
    },
    puntos: {
      asistencia: { regular: 0, main: 0 },
      posiciones: [{ pos: 1, regular: 0, main: 0 }],
    },
    recomprasMax: 0,
    cuotaInscripcion: 0,
    toleranciaCheckinMin: 10,
    gastosCampeonato: [],
    cobrosPorTorneo: [
      { id: "buyin", nombre: "Buy-in", regular: 0, main: 0, protegido: true },
      { id: "rebuy", nombre: "Re-buy (c/u)", regular: 0, main: 0, protegido: true },
      { id: "addon", nombre: "Add-on", regular: 0, main: 0, protegido: true },
    ],
    pagosPorTorneo: [],
  };
}

// red de seguridad del lado del navegador: si el backend devuelve algo incompleto (por ejemplo,
// datos guardados con un esquema anterior), se completa con la plantilla en vez de tronar la pantalla
function normalizar(datos, plantilla) {
  const base = plantilla || PLANTILLA;
  const d = datos && typeof datos === "object" ? structuredClone(datos) : {};
  d.premios = d.premios || structuredClone(base.premios);
  d.premios.porTorneo = d.premios.porTorneo || structuredClone(base.premios.porTorneo);
  d.premios.porCampeonato = d.premios.porCampeonato || structuredClone(base.premios.porCampeonato);
  d.puntos = d.puntos || structuredClone(base.puntos);
  d.puntos.asistencia = d.puntos.asistencia || structuredClone(base.puntos.asistencia);
  d.puntos.posiciones = Array.isArray(d.puntos.posiciones) ? d.puntos.posiciones : structuredClone(base.puntos.posiciones);
  if (typeof d.recomprasMax !== "number") d.recomprasMax = base.recomprasMax;
  if (typeof d.cuotaInscripcion !== "number") d.cuotaInscripcion = base.cuotaInscripcion;
  if (typeof d.toleranciaCheckinMin !== "number") d.toleranciaCheckinMin = base.toleranciaCheckinMin;
  d.gastosCampeonato = Array.isArray(d.gastosCampeonato) ? d.gastosCampeonato : structuredClone(base.gastosCampeonato);
  d.cobrosPorTorneo = Array.isArray(d.cobrosPorTorneo) ? d.cobrosPorTorneo : structuredClone(base.cobrosPorTorneo);
  d.pagosPorTorneo = Array.isArray(d.pagosPorTorneo) ? d.pagosPorTorneo : structuredClone(base.pagosPorTorneo);

  d.cobrosPorTorneo = d.cobrosPorTorneo.map((c) => (RENOMBRAR_ID_COBRO[c.id] ? { ...c, id: RENOMBRAR_ID_COBRO[c.id] } : c));
  const idsVistos = new Set();
  d.cobrosPorTorneo = d.cobrosPorTorneo.filter((c) => {
    if (idsVistos.has(c.id)) return false;
    idsVistos.add(c.id);
    return true;
  });
  for (const req of (base.cobrosPorTorneo || []).filter((c) => c.protegido)) {
    const existente = d.cobrosPorTorneo.find((c) => c.id === req.id);
    if (!existente) d.cobrosPorTorneo.push({ ...req });
    else existente.protegido = true;
  }
  delete d.nombreCampeonato;
  return d;
}

export default function Tablero({ session, perfiles }) {
  const editable = puedeEditar(perfiles, session, "mod2");

  const [campeonatos, setCampeonatos] = useState([]);
  const [campeonatoSel, setCampeonatoSel] = useState("");
  const [torneosCal, setTorneosCal] = useState([]);
  const [tableroMap, setTableroMap] = useState(null);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  // 59ª entrega: "Parámetros Generales" — a diferencia de todo lo demás en esta pantalla, esto NO es
  // por campeonato, es global al sitio completo (por eso vive en su propio estado/endpoint, no dentro
  // de `data`/`draft`). Por ahora solo el interruptor de acceso al portal.
  const [parametros, setParametros] = useState(null);
  const [paramGuardando, setParamGuardando] = useState(false);
  const [paramError, setParamError] = useState("");
  const [confirmPortal, setConfirmPortal] = useState(false);

  // 83ª entrega: "Exportar todo a Excel" — a pedido de Federico, regenera el archivo completo a demanda
  // desde Blobs en vez de depender de la sincronización automática silenciosa de siempre (ver
  // netlify/functions/lib/exportar-excel.js). Igual que Parámetros Generales, esto NO depende del
  // campeonato elegido arriba: toca TODOS los módulos del sitio de una sola vez.
  // 84ª entrega (bugfix): la exportación real ahora corre en segundo plano (ver
  // exportar-excel-background.js) — `exportando` sigue significando "hay una exportación en curso", pero
  // ahora se arma a partir de sondear el estado guardado en Blobs, no de esperar una sola respuesta larga.
  const [exportando, setExportando] = useState(false);
  const [reporteExport, setReporteExport] = useState(null); // { resultados: [{modulo, ok, error}], ok, exportadoEn }
  const [confirmExport, setConfirmExport] = useState(false);
  // 90ª entrega: avance en vivo mientras la exportación corre en segundo plano ({ etapa, moduloActual,
  // indice, total, resultados } — tal cual lo va guardando exportar-excel-background.js en Blobs, ver
  // ese archivo). Separado de `reporteExport` a propósito: ese solo se usa para el resultado FINAL
  // (listo/error), este para lo que va pasando mientras sigue "en-curso".
  const [progresoExport, setProgresoExport] = useState(null);

  const [gestionAbierta, setGestionAbierta] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [renombres, setRenombres] = useState({});
  const [campSaving, setCampSaving] = useState(false);
  const [campActionError, setCampActionError] = useState("");
  const [confirmModal, setConfirmModal] = useState(null); // { tipo: "nuevo" | "eliminar" | "cambiar", nombre }

  // 70ª entrega: "Puntos para torneos de práctica" — igual que Parámetros Generales, esto NO depende
  // del campeonato elegido en el combo de arriba: cada torneo de práctica (identificado por su fecha en
  // el Calendario) tiene su propia configuración de puntos, independiente de las demás — aunque esos
  // puntos sí se suman dentro del campeonato en curso, porque las prácticas son parte de él. Se guarda
  // bajo PUNTOS_PRACTICA_KEY (ver src/lib/gamenight.js), fuera de `tableroMap[campeonato]`.
  const [borradorPractica, setBorradorPractica] = useState({}); // fecha -> [{ pos, puntos }, ...]
  const [guardandoPractica, setGuardandoPractica] = useState({}); // fecha -> bool
  const [erroresPractica, setErroresPractica] = useState({}); // fecha -> string

  useEffect(() => {
    Promise.all([
      fetch(API_CAMP).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la lista de campeonatos (HTTP " + r.status + ").");
        return r.json();
      }),
      fetch(API).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el tablero (HTTP " + r.status + ").");
        return r.json();
      }),
      // el Calendario es "best effort" aquí — solo se usa para saber si el campeonato activo ya está
      // en curso (y por lo tanto bloquear el cambio); si falla, simplemente no se bloquea nada
      fetch(API_CAL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      // Parámetros Generales también es "best effort" — si falla, el interruptor simplemente no se
      // muestra en vez de tronar toda la pantalla del Tablero.
      fetch(API_PARAM).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([camp, tab, cal, param]) => {
        const nombres = camp.nombres || [];
        setCampeonatos(nombres);
        setTableroMap(tab || {});
        setTorneosCal(Array.isArray(cal?.torneos) ? cal.torneos : []);
        if (param) setParametros(param);
        // el campeonato que gobierna el sitio es "activo" (guardado en tols-campeonatos) — el Tablero
        // arranca mostrando ese, no simplemente el primero de la lista, para que Calendario y cualquier
        // otra pantalla que dependa de "cuál es el torneo vigente" siempre coincidan con esto
        const inicial = camp.activo || nombres[0] || Object.keys(tab || {})[0] || "";
        setCampeonatoSel(inicial);
        const normalizado = normalizar(tab?.[inicial], Object.values(tab || {})[0]);
        setData(normalizado);
        setDraft(normalizado);
      })
      .catch((e) => setLoadError(e.message || "Error al cargar el tablero."))
      .finally(() => setLoading(false));
  }, []);

  // 85ª entrega (bugfix, corregido de nuevo en esta misma ronda): si Federico recarga la pantalla
  // mientras una exportación sigue corriendo en segundo plano, retoma el sondeo en vez de dejarlo
  // huérfano — una sola consulta al entrar, silenciosa si no hay nada en curso.
  //
  // CRÍTICO — por qué este hook tiene que vivir ACÁ y no más abajo, junto a `exportarExcel()`: este
  // componente tiene dos `return` tempranos más abajo (`if (loading) return ...`, `if (loadError ||
  // !draft) return ...`), y React exige llamar exactamente los mismos hooks, en el mismo orden, en
  // CADA render. Un `useEffect` colocado después de esos `return` (como había quedado en el primer
  // intento de este fix) nunca se ejecuta mientras `loading` es `true` — pero en cuanto los datos
  // terminan de cargar y `loading` pasa a `false`, el render siguiente SÍ llega hasta ese `useEffect` y
  // lo llama por primera vez: React detecta que se llamaron más hooks que en el render anterior y
  // truena con "Rendered more hooks than during the previous render". Como el sitio no tiene ningún
  // Error Boundary, ese error no se recupera — tira abajo TODO el árbol de React, dejando solo el
  // fondo de la página (el verde de la mesa) sin nada encima. Esto es exactamente lo que Federico
  // reportó ("se ve que carga, pero de repente se queda la pantalla en verde") y afectaba a CUALQUIER
  // usuario que entrara a Tablero de Control (la pestaña por default al iniciar sesión), no solo a
  // quien tocara "Exportar todo a Excel". Lección: cualquier hook nuevo en un componente con
  // `return` condicionales tempranos va SIEMPRE junto a los demás hooks, antes de esos `return` —
  // nunca más abajo, aunque temáticamente encaje mejor cerca del código que usa.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}?estadoExportarExcel=1`);
        const json = await r.json();
        if (json.estado === "en-curso") {
          setExportando(true);
          setProgresoExport(json);
          consultarEstadoExport();
        } else if (json.estado === "listo" || json.estado === "error") {
          // 91ª entrega (bugfix): Federico reportó que, si la exportación terminaba mientras había
          // cambiado de pantalla (o cerrado/recargado el navegador), al volver a Tablero de Control no
          // quedaba ningún rastro de que algo había corrido — "si cambio de página y la exportación se
          // concluyó, cuando vuelvo se perdió el avance". Causa: `reporteExport` es estado de React, así
          // que se pierde al desmontar el componente (cambiar de pestaña) o al recargar la página — este
          // sondeo de montaje SOLO retomaba el caso "en-curso" (si la exportación seguía corriendo),
          // nunca restauraba el ÚLTIMO resultado ya terminado que seguía disponible en Blobs. Como
          // `tols-exportar-estado` ya guarda el reporte final hasta que corra la próxima exportación (no
          // se borra solo), alcanza con leerlo acá también para "listo"/"error" — sin volver a disparar
          // ningún sondeo, porque ya no hay nada corriendo.
          setReporteExport(json);
        }
      } catch (e) {
        // sin red o endpoint no disponible todavía — no hay nada que retomar, se ignora
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // siembra el borrador de "Puntos para torneos de práctica" en cuanto están cargados tanto el
  // Calendario (de ahí salen las fechas de práctica) como el Tablero (de ahí lo ya guardado bajo
  // PUNTOS_PRACTICA_KEY) — conserva lo que el administrador ya esté editando y solo rellena fechas
  // nuevas que todavía no tengan un borrador en pantalla.
  useEffect(() => {
    if (!tableroMap || !torneosCal.length) return;
    const fechasPractica = torneosCal.filter((t) => t.practica && t.fecha).map((t) => t.fecha);
    if (!fechasPractica.length) return;
    setBorradorPractica((prev) => {
      let cambio = false;
      const next = { ...prev };
      for (const fecha of fechasPractica) {
        if (next[fecha]) continue;
        const guardado = tableroMap[PUNTOS_PRACTICA_KEY]?.[fecha];
        next[fecha] = guardado && guardado.length ? structuredClone(guardado) : puntosPracticaDefault();
        cambio = true;
      }
      return cambio ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableroMap, torneosCal]);

  function cambiarPuntoPractica(fecha, i, valor) {
    setBorradorPractica((prev) => {
      const fila = [...(prev[fecha] || [])];
      fila[i] = { ...fila[i], puntos: Number(valor) };
      return { ...prev, [fecha]: fila };
    });
  }
  function agregarLugarPractica(fecha) {
    setBorradorPractica((prev) => {
      const fila = [...(prev[fecha] || [])];
      fila.push({ pos: fila.length + 1, puntos: 0 });
      return { ...prev, [fecha]: fila };
    });
  }
  function quitarLugarPractica(fecha, i) {
    setBorradorPractica((prev) => {
      const fila = [...(prev[fecha] || [])];
      fila.splice(i, 1);
      fila.forEach((p, j) => (p.pos = j + 1));
      return { ...prev, [fecha]: fila };
    });
  }
  async function guardarPuntosPractica(fecha) {
    const lista = borradorPractica[fecha] || [];
    if (!lista.length) {
      setErroresPractica((prev) => ({ ...prev, [fecha]: "Debe haber al menos 1 lugar." }));
      return;
    }
    setGuardandoPractica((prev) => ({ ...prev, [fecha]: true }));
    setErroresPractica((prev) => ({ ...prev, [fecha]: "" }));
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "guardarPuntosPractica", fecha, lista }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudieron guardar los puntos.");
      setTableroMap(json);
    } catch (e) {
      setErroresPractica((prev) => ({ ...prev, [fecha]: e.message || "No se pudieron guardar los puntos." }));
    } finally {
      setGuardandoPractica((prev) => ({ ...prev, [fecha]: false }));
    }
  }

  if (loading) return <p className="subtitle">Cargando tablero…</p>;
  if (loadError || !draft) {
    return (
      <div>
        <p className="subtitle">No se pudo cargar el tablero: {loadError}</p>
        <p className="section-sub">
          Si el sitio se acaba de desplegar, confirma que las funciones <code>/api/tablero</code> y{" "}
          <code>/api/campeonatos</code>, y el paquete <code>@netlify/blobs</code>, están publicados.
        </p>
      </div>
    );
  }

  const dirty = JSON.stringify(data) !== JSON.stringify(draft);

  function set(updater) {
    setSaveOk(false);
    setDraft((prev) => {
      const next = structuredClone(prev);
      updater(next);
      return next;
    });
  }

  async function seleccionarCampeonato(nombre) {
    setCampeonatoSel(nombre);
    const normalizado = normalizar(tableroMap?.[nombre], Object.values(tableroMap || {})[0]);
    setData(normalizado);
    setDraft(normalizado);
    setSaveError("");
    setSaveOk(false);
    setCampActionError("");
    // el combo del Tablero es quien gobierna el sitio: cambiar aquí persiste el campeonato "activo" en
    // tols-campeonatos, para que el Calendario (y a futuro cualquier otra pantalla) siempre muestren el
    // mismo campeonato que este, en vez de cada uno adivinarlo por su cuenta. Se espera la respuesta (ya
    // no es "dispara y olvida") y si falla se avisa claramente — antes un error aquí quedaba en silencio
    // y el combo se veía cambiado en pantalla aunque el sitio siguiera gobernado por el campeonato viejo.
    setCampSaving(true);
    try {
      const r = await fetch(API_CAMP, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombres: campeonatos, activo: nombre }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar el campeonato activo.");
      setCampeonatos(json.nombres);
    } catch (e) {
      setCampActionError(
        "No se pudo guardar \"" + nombre + "\" como campeonato activo del sitio (" + (e.message || e) +
        "). El Calendario puede seguir mostrando el campeonato anterior hasta que esto se resuelva — vuelve a intentar cambiando el combo."
      );
    } finally {
      setCampSaving(false);
    }
  }

  // punto de entrada del combo de campeonato: nunca cambia el activo directamente — primero revisa si
  // el campeonato que se está dejando ya está "en curso" (bloquea del todo) y si tiene fechas
  // registradas en el Calendario (pide confirmación, porque esas fechas van a dejar de contarse como
  // "vigentes" en el resto del sitio aunque no se borran).
  function intentarSeleccionarCampeonato(nombre) {
    if (nombre === campeonatoSel) return;
    setCampActionError("");
    const estatus = estatusCampeonato(campeonatoSel, torneosCal);
    if (estatus === "en-curso") {
      setCampActionError(
        `No puedes cambiar el campeonato activo mientras "${campeonatoSel}" está en curso (ya tiene fechas jugadas y otras pendientes en el Calendario). Termina las fechas que faltan, o edítalas desde el Calendario, antes de cambiar de campeonato.`
      );
      return;
    }
    const hayFechas = torneosCal.some((t) => t.temporada === campeonatoSel);
    if (hayFechas) {
      setConfirmModal({ tipo: "cambiar", nombre, origen: campeonatoSel });
      return;
    }
    seleccionarCampeonato(nombre);
  }

  function validarLocal(d) {
    if (d.premios.porTorneo.lugares.length < 1) return "Premios por torneo: debe haber al menos 1 lugar.";
    if (Math.abs(sumPct(d.premios.porTorneo.lugares) - 100) > 0.01) return "Premios por torneo: los lugares deben sumar 100%.";
    if (d.premios.porCampeonato.lugares.length < 1) return "Premios por campeonato: debe haber al menos 1 lugar.";
    if (!d.premios.porCampeonato.lugares.some((l) => l.reyKiller)) return "Premios por campeonato: falta el % de Rey Killer.";
    if (Math.abs(sumPct(d.premios.porCampeonato.lugares) - 100) > 0.01) return "Premios por campeonato: los lugares (con Rey Killer) deben sumar 100%.";
    if (d.puntos.posiciones.length < 1) return "Puntos: debe haber al menos 1 posición.";
    const tieneBuyin = d.cobrosPorTorneo.some((c) => c.id === "buyin");
    const tieneRebuy = d.cobrosPorTorneo.some((c) => c.id === "rebuy");
    const tieneAddon = d.cobrosPorTorneo.some((c) => c.id === "addon");
    if (!tieneBuyin || !tieneRebuy || !tieneAddon) return "Buy-in, Re-buy y Add-on son obligatorios.";
    return null;
  }

  async function handleGuardar() {
    const problema = validarLocal(draft);
    if (problema) {
      setSaveError(problema);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "guardar", campeonato: campeonatoSel, data: draft }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setTableroMap(json);
      const normalizado = normalizar(json[campeonatoSel], Object.values(json)[0]);
      setData(normalizado);
      setDraft(normalizado);
      setSaveOk(true);
    } catch (e) {
      setSaveError(e.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelar() {
    setDraft(data);
    setSaveError("");
    setSaveOk(false);
  }

  // apagar el portal bloquea a todos los jugadores de inmediato (App.jsx revisa esto en cada carga) —
  // se pide confirmación antes de apagarlo por lo delicado que es; encenderlo no necesita confirmación.
  function pedirCambiarPortal() {
    if (!parametros) return;
    if (parametros.portalActivo) {
      setConfirmPortal(true);
    } else {
      cambiarPortal(true);
    }
  }

  async function cambiarPortal(nuevoValor) {
    setParamGuardando(true);
    setParamError("");
    try {
      const r = await fetch(API_PARAM, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "guardar", portalActivo: nuevoValor }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setParametros(json);
    } catch (e) {
      setParamError(e.message || "No se pudo guardar el estado del portal.");
    } finally {
      setParamGuardando(false);
      setConfirmPortal(false);
    }
  }

  // 83ª entrega: a diferencia del portal (que solo tiene 2 valores posibles), acá no hace falta
  // confirmar "sí/no" — solo advertir, una vez, que esto va a reemplazar lo que haya en el Excel. Por
  // eso el modal de confirmación se abre siempre, nunca se dispara directo como `cambiarPortal(true)`.
  function pedirExportarExcel() {
    setConfirmExport(true);
  }

  // 84ª entrega (bugfix): hasta la 83ª, este botón esperaba una sola respuesta larga del servidor (que
  // corría los 10 módulos de la exportación de punta a punta antes de responder) — eso superaba el
  // tiempo máximo que Netlify permite para una función síncrona, y lo que volvía era una página de error
  // HTML en vez de JSON ("Unexpected token '<'..."), el bug que reportó Federico. Ahora la exportación
  // real corre en segundo plano (ver exportar-excel-background.js); este botón solo la DISPARA y, en
  // cuanto el servidor confirma que arrancó, empieza a consultar el estado cada 3 segundos
  // (`?estadoExportarExcel=1`) hasta ver "listo" o "error" — sin mantener ninguna petición abierta por
  // mucho tiempo, que era justo lo que fallaba.
  async function exportarExcel() {
    setExportando(true);
    setReporteExport(null);
    setProgresoExport(null);
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "exportarExcel" }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo iniciar la exportación.");
      if (json.estado === "error") throw new Error(json.error || "No se pudo iniciar la exportación.");
      consultarEstadoExport();
    } catch (e) {
      setReporteExport({ resultados: [], ok: false, error: e.message || "No se pudo exportar a Excel." });
      setExportando(false);
      setConfirmExport(false);
    }
  }

  // 90ª entrega (bugfix de fondo): el `return` de la rama "en-curso" vivía DENTRO del `try`, así que el
  // `finally` de abajo (que hacía `setExportando(false)`/`setConfirmExport(false)`) se ejecutaba en
  // CADA vuelta del sondeo — no solo al terminar. El resultado: a los ~3 segundos de arrancar, el botón
  // volvía a su estado normal y el modal de confirmación se cerraba solo, aunque la exportación seguía
  // corriendo de fondo (el `setTimeout(poll, 3000)` seguía reprogramándose) — exactamente lo que
  // Federico reportó ("no muestra avance... y si bien dice que terminando dirá el resultado, no lo he
  // visto"): no había avance visible porque la UI ya se veía "normal" segundos después de arrancar, y el
  // resultado final, aunque sí se guardaba en `reporteExport` al terminar, aparecía sin ningún aviso
  // nuevo (el botón ya no decía "Exportando…", así que nada indicaba que valía la pena mirar hacia
  // abajo). Fix: `setExportando`/`setConfirmExport` solo se tocan cuando el sondeo de verdad termina
  // (estado "listo"/"error"/excepción) — mientras sigue "en-curso" solo se actualiza `progresoExport`,
  // que la pantalla usa para mostrar en qué módulo va (ver el JSX de la sección "Excel" más abajo).
  function consultarEstadoExport() {
    (async function poll() {
      try {
        const r = await fetch(`${API}?estadoExportarExcel=1`);
        const json = await r.json();
        if (json.estado === "en-curso") {
          setProgresoExport(json);
          setTimeout(poll, 3000);
          return;
        }
        // "listo" o "error" (o cualquier otro valor inesperado): se da por terminada la espera
        setProgresoExport(null);
        setReporteExport(json);
        setExportando(false);
        setConfirmExport(false);
      } catch (e) {
        setProgresoExport(null);
        setReporteExport({ resultados: [], ok: false, error: "No se pudo consultar el estado de la exportación." });
        setExportando(false);
        setConfirmExport(false);
      }
    })();
  }

  function pedirAgregarCampeonato() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    if (campeonatos.includes(nombre)) {
      setCampActionError(`Ya existe un campeonato "${nombre}".`);
      return;
    }
    // un campeonato nuevo se vuelve "activo" de inmediato (ver agregarCampeonato) — mismo bloqueo que
    // al cambiar de campeonato existente: no se puede mientras el actual está en curso.
    if (estatusCampeonato(campeonatoSel, torneosCal) === "en-curso") {
      setCampActionError(
        `No puedes crear un campeonato nuevo (se volvería el activo de inmediato) mientras "${campeonatoSel}" está en curso. Termina las fechas que faltan antes de crear uno nuevo.`
      );
      return;
    }
    setCampActionError("");
    setConfirmModal({ tipo: "nuevo", nombre, origen: campeonatoSel });
  }

  async function agregarCampeonato(nombre, modo) {
    setCampSaving(true);
    setCampActionError("");
    try {
      const r = await fetch(API_CAMP, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombres: [...campeonatos, nombre], activo: nombre }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo agregar el campeonato.");
      setCampeonatos(json.nombres);
      setNuevoNombre("");
      setCampeonatoSel(nombre);
      // "copiar": parte de los valores del campeonato que estaba activo (mismo punto de partida, editable
      // de ahí en adelante). "cero": arranca en blanco, sin heredar nada.
      const inicial = modo === "copiar" && data ? normalizar(data, data) : normalizar(plantillaEnBlanco(), plantillaEnBlanco());
      setData(inicial);
      setDraft(inicial);
      setSaveError("");
      setSaveOk(false);
    } catch (e) {
      setCampActionError(e.message || "No se pudo agregar el campeonato.");
    } finally {
      setCampSaving(false);
      setConfirmModal(null);
    }
  }

  async function renombrarCampeonato(de, aRaw) {
    const a = aRaw.trim();
    if (!a || a === de) {
      setRenombres((r) => { const c = { ...r }; delete c[de]; return c; });
      return;
    }
    if (campeonatos.includes(a)) {
      setCampActionError(`Ya existe un campeonato "${a}".`);
      return;
    }
    // no se permite renombrar un campeonato que ya está en curso (algunas fechas jugadas, otras no) —
    // partiría en dos una temporada a medias en Calendario, Cobranza y Game Night
    if (estatusCampeonato(de, torneosCal) === "en-curso") {
      setCampActionError(`No puedes renombrar "${de}" mientras está en curso.`);
      return;
    }
    setCampSaving(true);
    setCampActionError("");
    try {
      // un solo endpoint hace todo el trabajo: renombra en tols-campeonatos y en cascada en Tablero,
      // Calendario, Cobranza y Game Night — antes esto se hacía en dos pasos (nombres + tablero) y las
      // otras pantallas se quedaban con el nombre viejo
      const r = await fetch(API_CAMP, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "renombrar", de, a }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo renombrar el campeonato.");
      setCampeonatos(j.nombres);
      if (j.avisos?.length) {
        setCampActionError(`Se renombró, pero con avisos: ${j.avisos.join(" · ")}`);
      }

      const rt = await fetch(API);
      const nuevoMapa = await rt.json();
      setTableroMap(nuevoMapa);

      setRenombres((r2) => { const c = { ...r2 }; delete c[de]; return c; });
      if (campeonatoSel === de) {
        setCampeonatoSel(a);
        const normalizado = normalizar(nuevoMapa?.[a], Object.values(nuevoMapa || {})[0]);
        setData(normalizado);
        setDraft(normalizado);
      }
    } catch (e) {
      setCampActionError(e.message || "No se pudo renombrar el campeonato.");
    } finally {
      setCampSaving(false);
    }
  }

  function pedirEliminarCampeonato(nombre) {
    if (campeonatos.length <= 1) {
      setCampActionError("Debe quedar al menos un campeonato.");
      return;
    }
    if (nombre === campeonatoSel && estatusCampeonato(campeonatoSel, torneosCal) === "en-curso") {
      setCampActionError(`No puedes eliminar "${nombre}" mientras está en curso — es el campeonato activo del sitio.`);
      return;
    }
    setCampActionError("");
    setConfirmModal({ tipo: "eliminar", nombre });
  }

  async function eliminarCampeonato(nombre) {
    setCampSaving(true);
    setCampActionError("");
    try {
      const nuevaLista = campeonatos.filter((n) => n !== nombre);
      const rc = await fetch(API_CAMP, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombres: nuevaLista }),
      });
      const jc = await rc.json();
      if (!rc.ok) throw new Error(jc.error || "No se pudo eliminar el campeonato.");
      setCampeonatos(jc.nombres);

      const tieneDatos = tableroMap && Object.prototype.hasOwnProperty.call(tableroMap, nombre);
      let nuevoMapa = tableroMap;
      // PUNTOS_PRACTICA_KEY (ver src/lib/gamenight.js) siempre está presente en tableroMap y no es un
      // campeonato — se excluye del conteo, igual que en el backend, para no confundir "queda 1
      // campeonato real" con "quedan 2 llaves".
      const campeonatosConDatos = Object.keys(tableroMap || {}).filter((k) => k !== PUNTOS_PRACTICA_KEY);
      if (tieneDatos && campeonatosConDatos.length > 1) {
        const rt = await fetch(API, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accion: "eliminar", campeonato: nombre }),
        });
        const jt = await rt.json();
        if (!rt.ok) throw new Error(jt.error || "No se pudo eliminar los datos del campeonato.");
        nuevoMapa = jt;
        setTableroMap(jt);
      }

      if (campeonatoSel === nombre) {
        const siguiente = jc.nombres[0];
        setCampeonatoSel(siguiente);
        const normalizado = normalizar(nuevoMapa?.[siguiente], Object.values(nuevoMapa || {})[0]);
        setData(normalizado);
        setDraft(normalizado);
      }
    } catch (e) {
      setCampActionError(e.message || "No se pudo eliminar el campeonato.");
    } finally {
      setCampSaving(false);
      setConfirmModal(null);
    }
  }

  const sumTorneo = sumPct(draft.premios.porTorneo.lugares);
  const sumCampeonato = sumPct(draft.premios.porCampeonato.lugares);

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Tablero de Control</h1>
          <p className="subtitle">
            Reglas paramétricas de la liga: reparto de premios, puntos por posición, costos de inscripción y pagos
            adicionales. {editable ? "Edita los valores y da clic en Guardar cambios." : "Vista de solo lectura — tu perfil no tiene permiso para modificarlo."}
          </p>
        </div>
      </div>

      {/* ───────── Parámetros Generales ───────── */}
      {parametros && (
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-head"><div className="section-title">Parámetros Generales</div></div>
          <div className="section-sub" style={{ marginTop: 0 }}>
            A diferencia del resto de esta pantalla, esto no depende del campeonato — aplica a todo el sitio.
          </div>
          <div className="login-field-row" style={{ alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>Acceso al portal</div>
              <div className="section-note">
                {parametros.portalActivo
                  ? "Encendido — todos los jugadores pueden entrar normalmente."
                  : "Apagado — los jugadores ven un aviso de mantenimiento y no pueden entrar. Los administradores sí pueden."}
              </div>
            </div>
            {editable && (
              <button
                type="button"
                className={"btn " + (parametros.portalActivo ? "btn-secondary" : "btn-primary")}
                disabled={paramGuardando}
                onClick={pedirCambiarPortal}
              >
                {paramGuardando ? "Un momento…" : parametros.portalActivo ? "Apagar portal (ON)" : "Encender portal (OFF)"}
              </button>
            )}
          </div>
          {paramError && <div className="login-error">{paramError}</div>}
        </div>
      )}

      {/* 83ª entrega: "Exportar todo a Excel" — a pedido de Federico, botón que regenera el archivo
          completo a demanda desde Blobs (ver netlify/functions/lib/exportar-excel.js), en vez de
          depender de la sincronización automática silenciosa de siempre. Igual que Parámetros
          Generales, no depende del campeonato elegido arriba: toca todos los módulos de una sola vez. */}
      {editable && (
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-head"><div className="section-title">Excel</div></div>
          <div className="login-field-row" style={{ alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>Exportar todo a Excel</div>
              <div className="section-note">
                Regenera el archivo completo a demanda, módulo por módulo, directamente desde lo que hay
                guardado ahora mismo en el sitio — reemplaza lo que haya en cada hoja. Úsalo si sospechas
                que la sincronización automática (la que corre sola cada vez que alguien guarda algo) se
                quedó atrás en algún módulo. Antes de escribir nada, deja una copia de respaldo del
                archivo tal cual está, en la misma carpeta. Corre en segundo plano — podés seguir usando
                el sitio mientras tanto, el resultado aparece acá cuando termina.
              </div>
            </div>
            <button type="button" className="btn btn-secondary" disabled={exportando} onClick={pedirExportarExcel}>
              {exportando ? "Exportando…" : "Exportar todo a Excel"}
            </button>
          </div>
          {/* 90ª entrega: avance en vivo mientras `progresoExport` sigue "en-curso" (ver el bugfix de
              `consultarEstadoExport()` más arriba) — barra simple con el módulo que está corriendo (o el
              que acaba de terminar) y una tabla con los módulos ya resueltos hasta ahora, para que se vea
              que algo está pasando en vez de un botón "Exportando…" sin más información durante los
              minutos que puede tardar la corrida completa. */}
          {progresoExport && (
            <div style={{ marginTop: 12 }}>
              <div className="section-note">
                {progresoExport.etapa === "respaldo"
                  ? "Creando copia de respaldo del Excel actual…"
                  : `Sincronizando "${progresoExport.moduloActual}"… (${Math.min(
                      progresoExport.indice + (progresoExport.etapa === "terminado" ? 1 : 0),
                      progresoExport.total
                    )} de ${progresoExport.total} módulos)`}
              </div>
              <div style={{ background: "#eee", borderRadius: 6, height: 8, marginTop: 6, overflow: "hidden" }}>
                <div
                  style={{
                    background: "#2e7d32",
                    height: "100%",
                    width: `${Math.round(
                      (Math.min(
                        progresoExport.indice + (progresoExport.etapa === "terminado" ? 1 : 0),
                        progresoExport.total
                      ) /
                        Math.max(progresoExport.total, 1)) *
                        100
                    )}%`,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              {progresoExport.resultados?.length > 0 && (
                <div className="tbl" style={{ marginTop: 10 }}>
                  <div className="trow thead" style={{ gridTemplateColumns: "1fr 100px" }}>
                    <div>Módulo</div><div>Estado</div>
                  </div>
                  {progresoExport.resultados.map((r) => (
                    <div className="trow" style={{ gridTemplateColumns: "1fr 100px" }} key={r.modulo}>
                      <div>{r.modulo}</div>
                      <div>{r.ok ? "✓ OK" : "✕ Falló"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {reporteExport && (
            <div style={{ marginTop: 12 }}>
              <div className="section-note" style={{ fontWeight: 600 }}>
                {reporteExport.error
                  ? "No se pudo completar la exportación."
                  : reporteExport.ok
                  ? "Exportación completa — todos los módulos se sincronizaron bien."
                  : "Exportación terminada con errores en algunos módulos (detalle abajo)."}
              </div>
              {reporteExport.error && <div className="login-error">{reporteExport.error}</div>}
              {/* 91ª entrega: Federico preguntó a qué archivo y en qué ruta quedaba la exportación —
                  nunca se mostraba en pantalla, aunque siempre fue el mismo archivo "base" de OneDrive de
                  siempre. Se muestra acá junto con la fecha/hora en que terminó, y queda visible aunque
                  se cambie de pantalla y se vuelva después (ver el fix del sondeo de montaje, más arriba)
                  — ya no depende de quedarse mirando la pantalla mientras corre. */}
              {reporteExport.archivoInfo && (
                <div className="section-sub" style={{ marginTop: 4 }}>
                  Archivo: <b>{reporteExport.archivoInfo.archivo}</b> — carpeta (OneDrive):{" "}
                  <b>{reporteExport.archivoInfo.carpeta}</b>
                  {reporteExport.archivoInfo.webUrl && (
                    <>
                      {" "}
                      (<a href={reporteExport.archivoInfo.webUrl} target="_blank" rel="noreferrer">
                        abrir en OneDrive
                      </a>)
                    </>
                  )}
                </div>
              )}
              {reporteExport.terminadoEn && (
                <div className="section-sub" style={{ marginTop: 2 }}>
                  Terminó: <b>{fechaHoraFmt(reporteExport.terminadoEn)}</b>
                </div>
              )}
              {reporteExport.backup && (
                <div className="section-sub" style={{ marginTop: 4 }}>
                  {reporteExport.backup.ok
                    ? `Respaldo creado: "${reporteExport.backup.nombre}" (misma carpeta de OneDrive).`
                    : `⚠ No se pudo crear la copia de respaldo: ${reporteExport.backup.error} (la exportación igual continuó).`}
                </div>
              )}
              {reporteExport.resultados?.length > 0 && (
                <div className="tbl" style={{ marginTop: 6 }}>
                  <div className="trow thead" style={{ gridTemplateColumns: "1fr 100px 1fr" }}>
                    <div>Módulo</div><div>Estado</div><div>Detalle</div>
                  </div>
                  {reporteExport.resultados.map((r) => (
                    <div className="trow" style={{ gridTemplateColumns: "1fr 100px 1fr" }} key={r.modulo}>
                      <div>{r.modulo}</div>
                      <div>{r.ok ? "✓ OK" : "✕ Falló"}</div>
                      <div className="section-note">{r.ok ? "" : r.error}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {confirmExport && (
        // 90ª entrega: antes de este fix, `confirmExport` solo se cerraba sin querer por el mismo bug
        // de `consultarEstadoExport()` (ver más arriba) — nunca de verdad, porque el backdrop y el
        // botón "Cancelar" quedaban `disabled`/sin efecto mientras `exportando` era true. Con el bug ya
        // corregido, `exportando` se mantiene true por los minutos reales que dura la corrida — así que
        // ahora SÍ hace falta poder cerrar este modal mientras exporta (tal como el propio texto del
        // modal ya decía: "podés cerrar esta pantalla... mientras tanto"), sin que eso cancele nada del
        // lado del servidor (la corrida sigue de fondo, independiente de este modal; el avance queda
        // visible de todas formas en la sección "Excel" de abajo).
        <div className="modal-backdrop" onClick={() => setConfirmExport(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">⚠</div>
            <div className="modal-title">Exportar todo a Excel</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Esto va a <b>reemplazar</b> el contenido de todas las hojas del Excel con lo que hay guardado
              ahora mismo en el sitio (se deja antes una copia de respaldo del archivo actual). Corre en
              segundo plano — podés cerrar esta pantalla o seguir usando el sitio mientras tanto, el
              resultado va a estar disponible acá la próxima vez que entres a Tablero de Control.
            </p>
            {exportando && progresoExport && (
              <p className="section-sub" style={{ marginTop: 0, fontWeight: 600 }}>
                {progresoExport.etapa === "respaldo"
                  ? "Creando copia de respaldo del Excel actual…"
                  : `Sincronizando "${progresoExport.moduloActual}"… (${Math.min(
                      progresoExport.indice + (progresoExport.etapa === "terminado" ? 1 : 0),
                      progresoExport.total
                    )} de ${progresoExport.total} módulos)`}
              </p>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmExport(false)}>
                {exportando ? "Cerrar (sigue en curso)" : "Cancelar"}
              </button>
              <button className="btn btn-danger" disabled={exportando} onClick={exportarExcel}>
                {exportando ? "Exportando…" : "Sí, exportar todo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPortal && (
        <div className="modal-backdrop" onClick={() => !paramGuardando && setConfirmPortal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">⚠</div>
            <div className="modal-title">Apagar el portal</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Vas a dejar TOLS 3.0 en <b>mantenimiento</b>: ningún jugador va a poder entrar hasta que lo
              vuelvas a encender desde aquí. Los administradores sí van a poder seguir entrando.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmPortal(false)} disabled={paramGuardando}>
                Cancelar
              </button>
              <button className="btn btn-danger" disabled={paramGuardando} onClick={() => cambiarPortal(false)}>
                {paramGuardando ? "Un momento…" : "Sí, apagar el portal"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: 24 }}>
        <div className="login-field" style={{ maxWidth: 320 }}>
          <label>Campeonato</label>
          <select
            className="field"
            value={campeonatoSel}
            disabled={!editable || dirty || campSaving}
            onChange={(e) => intentarSeleccionarCampeonato(e.target.value)}
          >
            {campeonatos.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="campeonato-banner">
          Estás viendo y editando: <strong>{campeonatoSel || "—"}</strong> — todo lo de esta pantalla (premios, puntos y costos) es específico de este campeonato.
        </div>
        {dirty && <div className="section-note" style={{ marginTop: 6 }}>Guarda o cancela tus cambios de abajo antes de cambiar de campeonato.</div>}

        {editable && (
          <>
            <button
              className="btn btn-secondary btn-add"
              onClick={() => setGestionAbierta((v) => !v)}
              disabled={dirty}
            >
              {gestionAbierta ? "Ocultar gestión de campeonatos" : "Agregar, renombrar o eliminar campeonatos"}
            </button>

            {gestionAbierta && (
              <div className="tbl" style={{ marginTop: 10, maxWidth: 420 }}>
                {campeonatos.map((n) => {
                  const valorActual = renombres[n] ?? n;
                  const cambiado = valorActual.trim() && valorActual.trim() !== n;
                  const enCurso = estatusCampeonato(n, torneosCal) === "en-curso";
                  return (
                    <div className="trow" style={{ gridTemplateColumns: "1fr 34px 34px" }} key={n}>
                      <input
                        className="field"
                        value={valorActual}
                        disabled={campSaving || enCurso}
                        title={enCurso ? "No se puede renombrar: está en curso." : undefined}
                        onChange={(e) => setRenombres((r) => ({ ...r, [n]: e.target.value }))}
                      />
                      <button
                        className="btn-icon-confirm"
                        title={enCurso ? "No se puede renombrar mientras está en curso." : "Guardar nuevo nombre"}
                        disabled={campSaving || !cambiado || enCurso}
                        onClick={() => renombrarCampeonato(n, valorActual)}
                      >✓</button>
                      <button
                        className="btn-icon-remove"
                        title="Eliminar campeonato"
                        disabled={campSaving || campeonatos.length <= 1}
                        onClick={() => pedirEliminarCampeonato(n)}
                      >✕</button>
                    </div>
                  );
                })}
                <div className="trow" style={{ gridTemplateColumns: "1fr 76px" }}>
                  <input
                    className="field"
                    placeholder="Nuevo campeonato (ej. 2027-I)"
                    value={nuevoNombre}
                    disabled={campSaving}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                  />
                  <button className="btn btn-primary" disabled={campSaving || !nuevoNombre.trim()} onClick={pedirAgregarCampeonato}>
                    + Agregar
                  </button>
                </div>
              </div>
            )}
            {campActionError && <div className="login-error">{campActionError}</div>}
          </>
        )}

        <div className="section-sub">
          Los premios, puntos y costos de esta pantalla se guardan por campeonato — cambia el combo para ver o
          editar otro. Usa el mismo nombre que la temporada del Calendario (ej. <code>2026-I</code>) para que quede
          claro a cuál corresponde.
        </div>
      </div>

      {editable && (
        <div className="tablero-savebar">
          {saveError && <div className="login-error" style={{ margin: 0 }}>{saveError}</div>}
          {saveOk && !dirty && <div className="check-line check-ok" style={{ margin: 0 }}>✓ Cambios guardados.</div>}
          {dirty && !saveError && <div className="section-note">Tienes cambios sin guardar.</div>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleCancelar} disabled={saving || !dirty}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}

      {/* ───────── Premios por torneo ───────── */}
      <div className="section">
        <div className="section-head"><div className="section-title">Asignación de premios <span className="section-title-campeonato">· {campeonatoSel}</span></div></div>

        <div className="subhead">
          Por torneo — % que va al fondo acumulado del campeonato
        </div>
        <div className="login-field" style={{ maxWidth: 220 }}>
          <label>% al acumulado</label>
          <input
            type="number" min="0" max="100" step="0.01" className="field" disabled={!editable}
            value={draft.premios.porTorneo.pctAcumulado}
            onChange={(e) => set((d) => { d.premios.porTorneo.pctAcumulado = Number(e.target.value); })}
          />
        </div>

        <div className="subhead">
          El resto ({pct(100 - draft.premios.porTorneo.pctAcumulado)}) se reparte así — "% del diferencial"
        </div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "1fr 110px 40px" : "1fr 90px" }}>
            <div>Lugar</div><div className="right">% del diferencial</div>{editable && <div />}
          </div>
          {draft.premios.porTorneo.lugares.map((l, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "1fr 110px 40px" : "1fr 90px" }} key={i}>
              {editable ? (
                <input className="field" value={l.label}
                  onChange={(e) => set((d) => { d.premios.porTorneo.lugares[i].label = e.target.value; })} />
              ) : <div>{l.label}</div>}
              {editable ? (
                <input type="number" step="0.01" className="field right" value={l.pct}
                  onChange={(e) => set((d) => { d.premios.porTorneo.lugares[i].pct = Number(e.target.value); })} />
              ) : <div className="right num">{pct(l.pct)}</div>}
              {editable && (
                <button className="btn-icon-remove" title="Quitar lugar" disabled={draft.premios.porTorneo.lugares.length <= 1}
                  onClick={() => set((d) => { d.premios.porTorneo.lugares.splice(i, 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.premios.porTorneo.lugares.length >= 10}
            onClick={() => set((d) => { d.premios.porTorneo.lugares.push({ label: `Lugar ${d.premios.porTorneo.lugares.length + 1}`, pct: 0 }); })}>
            + Agregar lugar
          </button>
        )}
        <div className={"check-line " + (Math.abs(sumTorneo - 100) < 0.01 ? "check-ok" : "check-bad")}>
          {Math.abs(sumTorneo - 100) < 0.01 ? "✓ suma 100% del diferencial" : `⚠ suma ${pct(sumTorneo)} — debería sumar 100%`}
        </div>

        <div className="subhead">Por campeonato — con el fondo acumulado de toda la temporada (incluye Rey Killer)</div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "1fr 110px 40px" : "1fr 90px" }}>
            <div>Lugar</div><div className="right">% del acumulado</div>{editable && <div />}
          </div>
          {draft.premios.porCampeonato.lugares.map((l, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "1fr 110px 40px" : "1fr 90px" }} key={i}>
              {editable && !l.reyKiller ? (
                <input className="field" value={l.label}
                  onChange={(e) => set((d) => { d.premios.porCampeonato.lugares[i].label = e.target.value; })} />
              ) : (
                <div>{l.reyKiller ? <span className="badge badge-main">Rey Killer</span> : l.label}</div>
              )}
              {editable ? (
                <input type="number" step="0.01" className="field right" value={l.pct}
                  onChange={(e) => set((d) => { d.premios.porCampeonato.lugares[i].pct = Number(e.target.value); })} />
              ) : <div className="right num">{pct(l.pct)}</div>}
              {editable && (
                <button className="btn-icon-remove" title="Quitar lugar" disabled={l.reyKiller || draft.premios.porCampeonato.lugares.length <= 1}
                  onClick={() => set((d) => { d.premios.porCampeonato.lugares.splice(i, 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.premios.porCampeonato.lugares.length >= 10}
            onClick={() => set((d) => { d.premios.porCampeonato.lugares.splice(d.premios.porCampeonato.lugares.length - 1, 0, { label: `Lugar ${d.premios.porCampeonato.lugares.length}`, pct: 0 }); })}>
            + Agregar lugar
          </button>
        )}
        <div className={"check-line " + (Math.abs(sumCampeonato - 100) < 0.01 ? "check-ok" : "check-bad")}>
          {Math.abs(sumCampeonato - 100) < 0.01 ? "✓ suma 100% del acumulado" : `⚠ suma ${pct(sumCampeonato)} — debería sumar 100%`}
        </div>
        <div className="section-sub">
          El % de <b>Rey Killer</b> es obligatorio y forma parte del 100% del acumulado — se otorga al jugador con más
          "kills" (eliminaciones capturadas por el anfitrión) acumulados en toda la temporada. La regla completa de
          cómo se otorgan los kills se define en <b>Game Night</b>.
        </div>
      </div>

      {/* ───────── Puntos ───────── */}
      <div className="section">
        <div className="section-head"><div className="section-title">Asignación de puntos <span className="section-title-campeonato">· {campeonatoSel}</span></div></div>
        <div className="login-field-row">
          <div className="login-field" style={{ maxWidth: 180 }}>
            <label>Asistencia · Regular</label>
            <input type="number" className="field" disabled={!editable} value={draft.puntos.asistencia.regular}
              onChange={(e) => set((d) => { d.puntos.asistencia.regular = Number(e.target.value); })} />
          </div>
          <div className="login-field" style={{ maxWidth: 180 }}>
            <label>Asistencia · Main Event</label>
            <input type="number" className="field" disabled={!editable} value={draft.puntos.asistencia.main}
              onChange={(e) => set((d) => { d.puntos.asistencia.main = Number(e.target.value); })} />
          </div>
        </div>
        <div className="section-sub">Se otorga solo por presentarse, independiente de la posición final.</div>

        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "60px 1fr 100px 100px 40px" : "60px 1fr 100px 100px" }}>
            <div>Pos.</div><div /><div className="right">Regular</div><div className="right">Main Event</div>{editable && <div />}
          </div>
          {draft.puntos.posiciones.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "60px 1fr 100px 100px 40px" : "60px 1fr 100px 100px" }} key={i}>
              <div className="num">{i + 1}º</div><div />
              {editable ? (
                <input type="number" className="field right" value={row.regular}
                  onChange={(e) => set((d) => { d.puntos.posiciones[i].regular = Number(e.target.value); })} />
              ) : <div className="right num">{row.regular}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.main}
                  onChange={(e) => set((d) => { d.puntos.posiciones[i].main = Number(e.target.value); })} />
              ) : <div className="right num">{row.main}</div>}
              {editable && (
                <button className="btn-icon-remove" title="Quitar posición" disabled={draft.puntos.posiciones.length <= 1}
                  onClick={() => set((d) => { d.puntos.posiciones.splice(i, 1); d.puntos.posiciones.forEach((p, j) => p.pos = j + 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.puntos.posiciones.length >= 15}
            onClick={() => set((d) => { d.puntos.posiciones.push({ pos: d.puntos.posiciones.length + 1, regular: 0, main: 0 }); })}>
            + Agregar posición
          </button>
        )}
      </div>

      {/* ───────── Puntos para torneos de práctica (70ª entrega) — independiente del combo de
          campeonato de arriba: cada torneo de práctica del Calendario tiene su propia configuración,
          y esos puntos se suman dentro del campeonato en curso porque las prácticas son parte de él. ───────── */}
      <div className="section">
        <div className="section-head"><div className="section-title">Puntos para torneos de práctica</div></div>
        <div className="section-sub">
          Independiente del campeonato seleccionado arriba — cada torneo de práctica del Calendario otorga sus propios
          puntos y su propio número de lugares. Esos puntos se cuentan dentro del campeonato en curso, ya que las
          prácticas son parte de él.
        </div>
        {torneosCal.filter((t) => t.practica && t.fecha).length === 0 ? (
          <div className="section-sub" style={{ padding: 16 }}>Todavía no hay ningún torneo de práctica en el Calendario.</div>
        ) : (
          torneosCal
            .filter((t) => t.practica && t.fecha)
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map((t) => {
              const fecha = t.fecha;
              const filas = borradorPractica[fecha] || [];
              return (
                <div key={fecha} style={{ margin: "12px 0", paddingTop: 12, borderTop: "1px solid #eee" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{fechaFmt(fecha)}</div>
                  <div className="tbl">
                    <div className="trow thead" style={{ gridTemplateColumns: editable ? "60px 100px 40px" : "60px 100px" }}>
                      <div>Lugar</div><div className="right">Puntos</div>{editable && <div />}
                    </div>
                    {filas.map((row, i) => (
                      <div className="trow" style={{ gridTemplateColumns: editable ? "60px 100px 40px" : "60px 100px" }} key={i}>
                        <div className="num">{row.pos}º</div>
                        {editable ? (
                          <input type="number" className="field right" value={row.puntos}
                            onChange={(e) => cambiarPuntoPractica(fecha, i, e.target.value)} />
                        ) : <div className="right num">{row.puntos}</div>}
                        {editable && (
                          <button className="btn-icon-remove" title="Quitar lugar" disabled={filas.length <= 1}
                            onClick={() => quitarLugarPractica(fecha, i)}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {editable && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-add" disabled={filas.length >= 15}
                        onClick={() => agregarLugarPractica(fecha)}>
                        + Agregar lugar
                      </button>
                      <button className="btn btn-primary" disabled={guardandoPractica[fecha]}
                        onClick={() => guardarPuntosPractica(fecha)}>
                        {guardandoPractica[fecha] ? "Guardando…" : "Guardar"}
                      </button>
                      {erroresPractica[fecha] && <span style={{ color: "#b00020", fontSize: 13 }}>{erroresPractica[fecha]}</span>}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {/* ───────── Costos ───────── */}
      <div className="section">
        <div className="section-head"><div className="section-title">Costos <span className="section-title-campeonato">· {campeonatoSel}</span></div></div>

        <div className="login-field-row">
          <div className="login-field" style={{ maxWidth: 220 }}>
            <label>Cuota de inscripción (por jugador)</label>
            <input type="number" min="0" className="field" disabled={!editable} value={draft.cuotaInscripcion}
              onChange={(e) => set((d) => { d.cuotaInscripcion = Number(e.target.value); })} />
            {!editable && <div className="section-note">{money(draft.cuotaInscripcion)}</div>}
          </div>
          <div className="login-field" style={{ maxWidth: 220 }}>
            <label>Recompras (Re-buys) máximas por jugador</label>
            <input type="number" min="0" className="field" disabled={!editable} value={draft.recomprasMax}
              onChange={(e) => set((d) => { d.recomprasMax = Number(e.target.value); })} />
          </div>
          <div className="login-field" style={{ maxWidth: 260 }}>
            <label>Tolerancia de check-in (minutos) — Game Night</label>
            <input type="number" min="0" className="field" disabled={!editable} value={draft.toleranciaCheckinMin}
              onChange={(e) => set((d) => { d.toleranciaCheckinMin = Number(e.target.value); })} />
          </div>
        </div>
        <div className="section-sub">
          La cuota de inscripción y las recompras máximas se definen una sola vez por campeonato. La cuota de
          inscripción se le cobra a cada jugador (una vez, no es un gasto del acumulado); las recompras máximas
          no son un costo, solo un límite. La tolerancia de check-in es el tiempo, en minutos desde que el Host
          inicia el torneo en Game Night, dentro del cual el Host todavía puede activar manualmente a un
          jugador que no hizo su check-in sin que se le genere una amonestación.
        </div>

        <div className="subhead">Gastos del campeonato — se extraen del acumulado y se descuentan del monto a repartir</div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "1fr 120px 40px" : "1fr 110px" }}>
            <div>Concepto</div><div className="right">Monto</div>{editable && <div />}
          </div>
          {draft.gastosCampeonato.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "1fr 120px 40px" : "1fr 110px" }} key={i}>
              {editable ? (
                <input className="field" value={row.concepto}
                  onChange={(e) => set((d) => { d.gastosCampeonato[i].concepto = e.target.value; })} />
              ) : <div>{row.concepto}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.monto}
                  onChange={(e) => set((d) => { d.gastosCampeonato[i].monto = Number(e.target.value); })} />
              ) : <div className="right num">{money(row.monto)}</div>}
              {editable && (
                <button className="btn-icon-remove" title="Quitar concepto" disabled={draft.gastosCampeonato.length <= 1}
                  onClick={() => set((d) => { d.gastosCampeonato.splice(i, 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.gastosCampeonato.length >= 10}
            onClick={() => set((d) => { d.gastosCampeonato.push({ concepto: "Nuevo gasto", monto: 0 }); })}>
            + Agregar gasto
          </button>
        )}

        <div className="subhead">Cobros por torneo — se cobran a cada jugador y se abonan por torneo</div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "1fr 100px 100px 40px" : "1fr 100px 100px" }}>
            <div>Concepto</div><div className="right">Regular</div><div className="right">Main Event</div>{editable && <div />}
          </div>
          {draft.cobrosPorTorneo.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "1fr 100px 100px 40px" : "1fr 100px 100px" }} key={row.id}>
              {editable ? (
                <input className="field" value={row.nombre}
                  onChange={(e) => set((d) => { d.cobrosPorTorneo[i].nombre = e.target.value; })} />
              ) : <div>{row.nombre}{row.protegido && <span className="section-note" style={{ marginLeft: 6 }}>· obligatorio</span>}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.regular}
                  onChange={(e) => set((d) => { d.cobrosPorTorneo[i].regular = Number(e.target.value); })} />
              ) : <div className="right num">{money(row.regular)}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.main}
                  onChange={(e) => set((d) => { d.cobrosPorTorneo[i].main = Number(e.target.value); })} />
              ) : <div className="right num">{money(row.main)}</div>}
              {editable && (
                <button className="btn-icon-remove" title={row.protegido ? "Obligatorio — no se puede quitar" : "Quitar concepto"}
                  disabled={row.protegido}
                  onClick={() => set((d) => { d.cobrosPorTorneo.splice(i, 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.cobrosPorTorneo.length >= 10}
            onClick={() => set((d) => { d.cobrosPorTorneo.push({ id: nuevoId(), nombre: "Nuevo cobro", regular: 0, main: 0, protegido: false }); })}>
            + Agregar cobro
          </button>
        )}
        <div className="section-sub">Buy-in (único), Re-buy (hasta el máximo de arriba) y Add-on siempre están presentes y no se pueden eliminar; solo los montos son editables. Cualquier cobro adicional que agregues sí se puede quitar.</div>

        <div className="subhead">Pagos por torneo — se le pagan a jugadores con lo recabado en el torneo</div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "1fr 100px 100px 40px" : "1fr 100px 100px" }}>
            <div>Concepto</div><div className="right">Regular</div><div className="right">Main Event</div>{editable && <div />}
          </div>
          {draft.pagosPorTorneo.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "1fr 100px 100px 40px" : "1fr 100px 100px" }} key={i}>
              {editable ? (
                <input className="field" value={row.nombre}
                  onChange={(e) => set((d) => { d.pagosPorTorneo[i].nombre = e.target.value; })} />
              ) : <div>{row.nombre}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.regular}
                  onChange={(e) => set((d) => { d.pagosPorTorneo[i].regular = Number(e.target.value); })} />
              ) : <div className="right num">{money(row.regular)}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.main}
                  onChange={(e) => set((d) => { d.pagosPorTorneo[i].main = Number(e.target.value); })} />
              ) : <div className="right num">{money(row.main)}</div>}
              {editable && (
                <button className="btn-icon-remove" title="Quitar concepto" disabled={draft.pagosPorTorneo.length <= 1}
                  onClick={() => set((d) => { d.pagosPorTorneo.splice(i, 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.pagosPorTorneo.length >= 10}
            onClick={() => set((d) => { d.pagosPorTorneo.push({ nombre: "Nuevo pago", regular: 0, main: 0 }); })}>
            + Agregar pago
          </button>
        )}
      </div>

      {confirmModal && confirmModal.tipo === "nuevo" && (
        <div className="modal-backdrop" onClick={() => !campSaving && setConfirmModal(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">⚠</div>
            <div className="modal-title">Nuevo campeonato: {confirmModal.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Vas a crear el campeonato <b>{confirmModal.nombre}</b>. Todos sus campos (premios, puntos, cuota
              de inscripción, gastos, cobros y pagos) van a inicializarse.
              {confirmModal.origen
                ? <> ¿Deseas copiar los valores del campeonato <b>{confirmModal.origen}</b> o prefieres inicializar todos los parámetros?</>
                : " No hay otro campeonato del cual copiar valores, así que va a inicializar todos los parámetros."}
            </p>
            {confirmModal.origen && torneosCal.some((t) => t.temporada === confirmModal.origen) && (
              <p className="login-error" style={{ marginTop: 0 }}>
                ⚠ Además, <b>{confirmModal.nombre}</b> se va a volver el campeonato activo del sitio de inmediato.
                Las fechas que ya tienes en el Calendario bajo <b>{confirmModal.origen}</b> van a dejar de aparecer
                en las vistas normales del sitio (resumen del Calendario, Jugadores, Host, etc.) — siguen guardadas
                y visibles en la cuadrícula completa del Administrador, pero el sitio deja de operar sobre ellas.
              </p>
            )}
            <div className="modal-choice-row">
              {confirmModal.origen && (
                <button
                  className="modal-choice-btn"
                  disabled={campSaving}
                  onClick={() => agregarCampeonato(confirmModal.nombre, "copiar")}
                >
                  <span className="modal-choice-title">Copiar valores de {confirmModal.origen}</span>
                  <span className="modal-choice-desc">Empieza con los mismos premios, puntos y costos de {confirmModal.origen} — los editas desde aquí si algo cambia.</span>
                </button>
              )}
              <button
                className="modal-choice-btn"
                disabled={campSaving}
                onClick={() => agregarCampeonato(confirmModal.nombre, "cero")}
              >
                <span className="modal-choice-title">Inicializar todos los parámetros</span>
                <span className="modal-choice-desc">Empieza en cero — sin heredar nada, defines cada valor desde aquí antes de poder guardar.</span>
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)} disabled={campSaving}>
                {campSaving ? "Un momento…" : "Cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && confirmModal.tipo === "cambiar" && (
        <div className="modal-backdrop" onClick={() => !campSaving && setConfirmModal(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">⚠</div>
            <div className="modal-title">Cambiar campeonato activo a: {confirmModal.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Vas a hacer que <b>{confirmModal.nombre}</b> sea el campeonato que gobierna todo el sitio, en vez de{" "}
              <b>{confirmModal.origen}</b>.
            </p>
            <p className="login-error" style={{ marginTop: 0 }}>
              ⚠ Las fechas que ya tienes en el Calendario bajo <b>{confirmModal.origen}</b> van a dejar de
              aparecer en las vistas normales del sitio (resumen del Calendario, Jugadores, asignación de Host,
              etc.) — no se borran, siguen guardadas y visibles en la cuadrícula completa del Administrador, pero
              el sitio deja de operar sobre ellas. Esto puede afectar la operación en curso de la liga.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)} disabled={campSaving}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={campSaving}
                onClick={() => { seleccionarCampeonato(confirmModal.nombre); setConfirmModal(null); }}
              >
                {campSaving ? "Un momento…" : "Sí, cambiar de campeonato"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && confirmModal.tipo === "eliminar" && (
        <div className="modal-backdrop" onClick={() => !campSaving && setConfirmModal(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">⚠</div>
            <div className="modal-title">Eliminar campeonato: {confirmModal.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Se va a borrar <b>TODA</b> la información asociada al campeonato <b>{confirmModal.nombre}</b> —
              premios, puntos, costos y, cuando existan, cobranza, estadísticas y sesiones de Game Night — de
              forma <b>permanente</b>. No se va a poder recuperar.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)} disabled={campSaving}>
                Cancelar
              </button>
              <button className="btn btn-danger" disabled={campSaving} onClick={() => eliminarCampeonato(confirmModal.nombre)}>
                {campSaving ? "Un momento…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
