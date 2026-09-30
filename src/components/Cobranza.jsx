import { useEffect, useMemo, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import { finanzasCampeonato, TIPOS_CUENTA, longitudEsperada, validarCuentaCobro } from "../lib/cobranza.js";
import { mapaNumeracionTorneos } from "../lib/gamenight.js";

const API = "/api/cobranza";
const API_ENVIAR = "/api/cobranza-enviar-estado";
const API_ENVIAR_SALDO = "/api/cobranza-enviar-saldo";
const API_TABLERO = "/api/tablero";
const API_CAL = "/api/calendario";
const API_CAMP = "/api/campeonatos";
const API_JUG = "/api/jugadores";
const API_EST = "/api/estadisticas";

function money(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("en-US");
}
// 74ª entrega: mismo formato contable que ya usan Calendario.jsx/Estadisticas.jsx para negativos —
// "($ #,##0)" en vez de "-$ #,##0" — usado acá en la columna "Resultado" de "Resultados de Torneos".
function moneyContable(n) {
  const v = Math.round(Number(n || 0));
  const abs = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($ ${abs})` : `$ ${abs}`;
}
// 78ª entrega: a diferencia de money() (que redondea a pesos enteros, el criterio de todo el resto del
// sitio), "Centavos acumulados" es la única cifra de Cobranza donde los centavos SON el dato — redondearla
// escondería justo lo que se está mostrando.
function moneyConCentavos(n) {
  return "$ " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// 79ª entrega: convención general de color para dinero, a pedido de Federico — "cuando hablemos de
// cantidades positivas, despliégalas en verde en formato $ #,##0 y las negativas en rojo y en formato
// ($ #,##0)". `forzarNegativo` es para un valor que SIEMPRE se guarda positivo en el store pero
// representa un egreso (ej. un Depósito, TOLS → jugador) — se pinta/formatea como negativo sin tocar
// el dato real. `centavos` usa moneyConCentavos() en vez de money() (ver 78ª entrega) para las pocas
// cifras donde los centavos son el dato (la columna "Real" de un Pago, que puede traer la referencia).
function Monto({ valor, forzarNegativo = false, centavos = false }) {
  const v = Number(valor) || 0;
  const negativo = forzarNegativo || v < 0;
  const plano = centavos ? moneyConCentavos(Math.abs(v)) : money(Math.abs(v));
  return <span className={negativo ? "money-neg" : "money-pos"}>{negativo ? `(${plano})` : plano}</span>;
}
// 79ª entrega: mismo criterio que <Monto/>, pero coloreado por TIPO de transacción (Pago = verde,
// ingreso para TOLS; Depósito = rojo, egreso) en vez de por el signo del número — los dos montos de
// "Pagos y depósitos confirmados" siempre se guardan positivos, así que el color tiene que venir del
// tipo de fila, no del valor.
function MontoPorTipo({ valor, tipo, centavos = false }) {
  const esPago = tipo === "Pago";
  const plano = centavos ? moneyConCentavos(Math.abs(Number(valor) || 0)) : money(Math.abs(Number(valor) || 0));
  return <span className={esPago ? "money-pos" : "money-neg"}>{esPago ? plano : `(${plano})`}</span>;
}
function norm(s) {
  return (s || "").trim().toLowerCase();
}
function nombreCorto(j) {
  return (j.aliasPokerStars || "").trim() || j.nombre;
}
function fechaFmt(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso || "";
}
// 74ª entrega: mismo criterio que jugadorEnTorneo() de Estadisticas.jsx (copia propia, no importada, a
// propósito — cada pantalla que lee `estData.torneos` ya trae su copia de este helper) — busca el
// registro de un jugador del directorio dentro de un torneo ya publicado, primero por la clave real
// (correo || alias) y si no aparece, por alias/correo entre todos los valores.
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
// 74ª entrega: etiqueta corta del torneo para "Resultados de Torneos" — a diferencia de la etiqueta
// larga de Estadísticas ("N - Regular"/"N - Main"), Federico pidió acá que un Regular muestre solo el
// número ("1", "2"...) y un Main agregue "- Main" ("3 - Main") para diferenciarlo, sin "- Regular".
function etiquetaCorta(entry) {
  if (!entry) return "";
  return entry.tipo === "Main" ? `${entry.numero} - Main` : `${entry.numero}`;
}

function borradorEstadoCuenta(r, pendientes, proximaFecha) {
  const detalle = pendientes
    .map((m) => `• ${m.fecha} (${m.tipo}) — ${money(m.montoTotal)}`)
    .join("\n");
  const totalPendiente = pendientes.reduce((a, m) => a + m.montoTotal, 0);
  const cuerpo =
    `Hola ${r.nombre || ""},\n\n` +
    `Te escribimos desde la Tesorería de TOLS 3.0 porque tienes pagos pendientes de las siguientes fechas:\n\n` +
    `${detalle}\n\n` +
    `Total pendiente: ${money(totalPendiente)}\n\n` +
    `Te pedimos regularizar el pago antes del próximo torneo` +
    (proximaFecha ? ` (${proximaFecha})` : "") +
    `. Mientras el adeudo siga pendiente, no vas a estar habilitado para participar en el siguiente torneo, salvo que un administrador o el Tesorero apruebe una excepción.\n\n` +
    `Gracias por tu comprensión.`;
  return { asunto: "Pagos pendientes — TOLS 3.0", cuerpo };
}

export default function Cobranza({ session, perfiles }) {
  const editable = puedeEditar(perfiles, session, "mod4");

  const [vista, setVista] = useState("resultado"); // "resultado" | "movimientos" | "estado" | "finanzas"
  const [fechaSaldoSel, setFechaSaldoSel] = useState(""); // 74ª entrega: fecha del torneo elegido en "Resultados de Torneos"
  const [seleccionSaldo, setSeleccionSaldo] = useState(() => new Set());
  const [enviandoSaldo, setEnviandoSaldo] = useState(false);
  const [envioSaldoAviso, setEnvioSaldoAviso] = useState("");
  const [data, setData] = useState(null); // { jugadores, movimientos, resumen, adeudos, proximaFecha, enviosSaldo }
  const [tableroMapa, setTableroMapa] = useState({});
  const [torneosCal, setTorneosCal] = useState([]);
  const [campeonatos, setCampeonatos] = useState({ nombres: [], activo: "" });
  const [jugadoresSitio, setJugadoresSitio] = useState([]);
  const [estData, setEstData] = useState({ torneos: {}, apodos: {} }); // 74ª entrega: /api/estadisticas, para "Resultados de Torneos"
  const [campeonatoSel, setCampeonatoSel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // 76ª entrega: "Registrar pagos y depósitos" rediseñado — ya no se CREA un movimiento manual desde
  // acá (el Debe/Premio de cada torneo lo sigue calculando Estadísticas, automático desde la 72ª/74ª
  // entrega), este formulario solo CONFIRMA que un pago o un depósito puntual efectivamente ocurrió.
  // `motivo` guarda: la fecha del torneo directo para un Pago; "torneo:{fecha}" o "gasto:{concepto}"
  // para un Depósito (un solo combo unificado, como pidió Federico).
  const [nuevoMov, setNuevoMov] = useState(null); // null | { tipo, correo, motivo, montoReal, fechaReal }
  const [guardandoMov, setGuardandoMov] = useState(false);
  const [errorMov, setErrorMov] = useState("");

  // pedido extra de Federico: permitir editar (monto y/o fecha) un pago/depósito ya confirmado, desde
  // la propia tabla de "Pagos y depósitos confirmados" — reusa las mismas acciones del servidor
  // (misma clave = sobrescribe en vez de duplicar), solo que acá el motivo/jugador ya están fijos (no
  // se puede cambiar de torneo/concepto/jugador editando, solo corregir monto/fecha).
  const [editandoPago, setEditandoPago] = useState(null); // null | { clave, tipoAccion, motivoTipo, motivoId, correo, monto, fecha }
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState("");

  const [correoEstado, setCorreoEstado] = useState("");
  const [borrador, setBorrador] = useState(null); // { asunto, cuerpo }
  const [enviando, setEnviando] = useState(false);
  const [envioAviso, setEnvioAviso] = useState("");

  const [excepcionModal, setExcepcionModal] = useState(null); // { correo, nombre }
  const [motivoExcepcion, setMotivoExcepcion] = useState("");

  // 44ª entrega: cuenta/banco/tipoCuenta ahora viven en tols-jugadores (centralizados, editables desde
  // Mi Perfil) — este mini-formulario deja al Tesorero editarlos en nombre de otro jugador desde acá,
  // con la misma validación de CLABE (18 dígitos)/Tarjeta de Débito (16 dígitos). Estado local propio
  // (no controlado directo por `data.resumen`) para poder mostrar el error antes de guardar.
  const [cuentaForm, setCuentaForm] = useState({ cuenta: "", banco: "", tipoCuenta: "" });
  const [cuentaError, setCuentaError] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const r = correoEstado ? data?.resumen?.[correoEstado] : null;
    setCuentaForm({ cuenta: r?.cuenta || "", banco: r?.banco || "", tipoCuenta: r?.tipoCuenta || "" });
    setCuentaError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correoEstado]);

  function cargar() {
    setLoading(true);
    setError("");
    Promise.all([
      fetch(API).then((r) => r.json()),
      fetch(API_TABLERO).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(API_CAL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_CAMP).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_JUG).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_EST).then((r) => (r.ok ? r.json() : { torneos: {}, apodos: {} })).catch(() => ({ torneos: {}, apodos: {} })),
    ])
      .then(([cob, tablero, cal, camp, jug, est]) => {
        setData(cob);
        setTableroMapa(tablero || {});
        setTorneosCal(cal?.torneos || []);
        setCampeonatos(camp || { nombres: [], activo: "" });
        setJugadoresSitio(jug?.jugadores || []);
        setEstData(est || { torneos: {}, apodos: {} });
        setCampeonatoSel((prev) => prev || camp?.activo || (camp?.nombres || [])[0] || "");
      })
      .catch((e) => setError(e.message || "No se pudo cargar Cobranza."))
      .finally(() => setLoading(false));
  }

  const directorio = useMemo(() => {
    // combina el directorio de Jugadores del sitio con el de Cobranza (jugadores que no se
    // autorregistraron pero el Tesorero ya cargó a mano) — la fuente de verdad del nombre es Cobranza
    // una vez que existe ahí, porque es lo que edita el Tesorero
    const porCorreo = {};
    for (const j of jugadoresSitio) porCorreo[j.correo] = { correo: j.correo, nombre: j.nombre };
    for (const [correo, j] of Object.entries(data?.jugadores || {})) {
      porCorreo[correo] = { correo, nombre: j.nombre || porCorreo[correo]?.nombre || "" };
    }
    return Object.values(porCorreo).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [jugadoresSitio, data]);

  // 51ª entrega: "Resultados de Torneos" — si se cambia de campeonato arriba mientras esta vista está
  // abierta, el torneo elegido ya no aplica (pertenece a otro campeonato) — se limpia solo para no dejar
  // un torneo "fantasma" seleccionado que en realidad es de otro campeonato. 74ª entrega: también se
  // limpia la selección de jugadores y el aviso de envío, por la misma razón.
  useEffect(() => {
    setFechaSaldoSel("");
    setSeleccionSaldo(new Set());
    setEnvioSaldoAviso("");
  }, [campeonatoSel]);

  // 74ª entrega: numeración cronológica 1..n de los torneos Regular/Main de cada campeonato (ver
  // src/lib/gamenight.js) — misma fuente que ya usan Calendario y Estadísticas, para que el número de un
  // torneo sea siempre el mismo en toda la app. Las partidas de práctica quedan fuera (no reparten Debe
  // real, así que no tiene sentido mandarles un "Saldo Torneo").
  const numeracion = useMemo(() => mapaNumeracionTorneos(torneosCal), [torneosCal]);

  // 74ª entrega: directorio "completo" (con id/aliasPokerStars, no solo correo+nombre) para armar la
  // tabla de "Resultados de Torneos" — mismo criterio que el `directorio` de Estadisticas.jsx: solo
  // jugadores Activos, excluyendo "Usuario Domi" (cuenta de pruebas del sitio).
  const directorioActivo = useMemo(
    () => jugadoresSitio.filter((j) => j.estatus === "Activo" && norm(j.nombre) !== "usuario domi" && norm(nombreCorto(j)) !== "usuario domi"),
    [jugadoresSitio]
  );

  // 74ª entrega: combo de "Resultados de Torneos" — solo torneos Regular/Main YA PUBLICADOS del
  // campeonato activo (nunca práctica, que no tiene Debe real que cobrar), en orden cronológico.
  const torneosSaldoOpciones = useMemo(() => {
    return torneosCal
      .filter((t) => !t.practica && t.temporada === campeonatoSel && t.fecha)
      .map((t) => ({ fecha: t.fecha, ...(numeracion[`${campeonatoSel}|${t.fecha}`] || {}) }))
      .filter((t) => t.numero && estData?.torneos?.[campeonatoSel]?.[t.fecha]?.publicado)
      .sort((a, b) => a.numero - b.numero);
  }, [torneosCal, campeonatoSel, numeracion, estData]);

  const movimientosDelCampeonato = useMemo(
    () => (data?.movimientos || []).filter((m) => m.campeonato === campeonatoSel).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.correo.localeCompare(b.correo)),
    [data, campeonatoSel]
  );

  // 76ª entrega: los 3 conceptos de "Gastos del campeonato" del Tablero de Control — fuente del combo
  // de "motivo" cuando el tipo elegido es Depósito (Q3: "para estas 3 que mencionas, los montos
  // definidos en el tablero de control").
  const gastosCampeonatoActivo = tableroMapa?.[campeonatoSel]?.gastosCampeonato || [];

  // 76ª entrega: resultado (premioTotal - debeTotal) de un jugador en un torneo puntual ya publicado —
  // mismo cálculo que ya usa "Resultados de Torneos" más arriba, reutilizado acá para decidir el "monto
  // esperado" de un Pago (resultado negativo = debe) o de un Depósito por torneo (resultado positivo =
  // le deben premio).
  function resultadoTorneo(correo, fecha) {
    const torneo = estData?.torneos?.[campeonatoSel]?.[fecha];
    const jug = directorioActivo.find((j) => j.correo === correo);
    if (!torneo || !jug) return 0;
    const jt = jugadorEnTorneo(torneo, jug);
    return jt ? (Number(jt.premioTotal) || 0) - (Number(jt.debeTotal) || 0) : 0;
  }

  // 76ª entrega: opciones del combo de "motivo" según el tipo y el jugador elegidos en `nuevoMov` — un
  // torneo/gasto ya confirmado (con registro en pagosTorneo/depositosTorneo/depositosGasto) no vuelve a
  // aparecer, para no duplicar una confirmación ya hecha.
  const opcionesPago =
    nuevoMov?.tipo === "pago" && nuevoMov.correo
      ? torneosSaldoOpciones
          .filter((t) => resultadoTorneo(nuevoMov.correo, t.fecha) < 0)
          .filter((t) => !data?.pagosTorneo?.[`${campeonatoSel}|${t.fecha}|${nuevoMov.correo}`])
      : [];
  const opcionesDepositoTorneo =
    nuevoMov?.tipo === "deposito" && nuevoMov.correo
      ? torneosSaldoOpciones
          .filter((t) => resultadoTorneo(nuevoMov.correo, t.fecha) > 0)
          .filter((t) => !data?.depositosTorneo?.[`${campeonatoSel}|${t.fecha}|${nuevoMov.correo}`])
      : [];
  const opcionesDepositoGasto =
    nuevoMov?.tipo === "deposito" && nuevoMov.correo
      ? gastosCampeonatoActivo.filter(
          (g) => g.concepto && !data?.depositosGasto?.[`${campeonatoSel}|${g.concepto}|${nuevoMov.correo}`]
        )
      : [];

  // 76ª entrega: "monto esperado" (recuadro inactivo) y etiqueta legible del motivo elegido — se
  // recalculan en cada render a partir de `nuevoMov.motivo`, nunca se guardan en el estado (para que
  // siempre reflejen el dato más reciente de Estadísticas/Tablero).
  let montoEsperadoMov = 0;
  let etiquetaMotivoMov = "";
  if (nuevoMov?.tipo === "pago" && nuevoMov.motivo) {
    const entry = torneosSaldoOpciones.find((t) => t.fecha === nuevoMov.motivo);
    montoEsperadoMov = Math.abs(resultadoTorneo(nuevoMov.correo, nuevoMov.motivo));
    etiquetaMotivoMov = entry ? `Torneo ${etiquetaCorta(entry)} (${fechaFmt(entry.fecha)})` : nuevoMov.motivo;
  } else if (nuevoMov?.tipo === "deposito" && nuevoMov.motivo?.startsWith("torneo:")) {
    const fecha = nuevoMov.motivo.slice("torneo:".length);
    const entry = torneosSaldoOpciones.find((t) => t.fecha === fecha);
    montoEsperadoMov = Math.abs(resultadoTorneo(nuevoMov.correo, fecha));
    etiquetaMotivoMov = entry ? `Torneo ${etiquetaCorta(entry)} (${fechaFmt(entry.fecha)})` : fecha;
  } else if (nuevoMov?.tipo === "deposito" && nuevoMov.motivo?.startsWith("gasto:")) {
    const concepto = nuevoMov.motivo.slice("gasto:".length);
    const g = gastosCampeonatoActivo.find((x) => x.concepto === concepto);
    montoEsperadoMov = Number(g?.monto) || 0;
    etiquetaMotivoMov = concepto;
  }

  // 76ª entrega: tabla de pagos/depósitos ya confirmados para el campeonato activo, juntando los 3
  // mapas del backend en una sola lista (más reciente primero). Cada fila guarda además `tipoAccion`/
  // `motivoTipo`/`motivoId` — no se muestran en la tabla, pero son lo que hace falta para poder
  // reenviar la misma acción del servidor al EDITAR (ver `guardarEdicionPago()`), ya que el motivo/
  // jugador de un registro ya confirmado no vienen de los combos filtrados de `nuevoMov`.
  const confirmadosCampeonato = useMemo(() => {
    const filas = [];
    const prefijo = `${campeonatoSel}|`;
    for (const [clave, reg] of Object.entries(data?.pagosTorneo || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const [, fechaTorneo, correo] = clave.split("|");
      const entry = numeracion[`${campeonatoSel}|${fechaTorneo}`];
      // 79ª entrega: a pedido de Federico, el Motivo de un Pago en esta tabla se acorta a "Torneo N"
      // (sin fecha) — la fecha de CUÁNDO se recibió ya tiene su propia columna ("Registrado").
      filas.push({
        clave,
        tipo: "Pago",
        tipoAccion: "pago",
        motivoTipo: "torneo",
        motivoId: fechaTorneo,
        motivo: `Torneo ${entry ? etiquetaCorta(entry) : ""}`,
        correo,
        ...reg,
      });
    }
    for (const [clave, reg] of Object.entries(data?.depositosTorneo || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const [, fechaTorneo, correo] = clave.split("|");
      const entry = numeracion[`${campeonatoSel}|${fechaTorneo}`];
      filas.push({
        clave,
        tipo: "Depósito",
        tipoAccion: "deposito",
        motivoTipo: "torneo",
        motivoId: fechaTorneo,
        motivo: `Torneo ${entry ? etiquetaCorta(entry) : ""} (${fechaFmt(fechaTorneo)})`,
        correo,
        ...reg,
      });
    }
    for (const [clave, reg] of Object.entries(data?.depositosGasto || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const [, concepto, correo] = clave.split("|");
      filas.push({
        clave,
        tipo: "Depósito",
        tipoAccion: "deposito",
        motivoTipo: "gasto",
        motivoId: concepto,
        motivo: concepto,
        correo,
        ...reg,
      });
    }
    return filas.sort((a, b) => (b.registradoEn || "").localeCompare(a.registradoEn || ""));
  }, [data, campeonatoSel, numeracion]);

  // 79ª entrega: "Estado de cuenta" — a pedido de Federico, tabla de saldo corrido (Fecha/Tipo/Motivo/
  // Saldo inicial/Monto/Saldo final) para el jugador elegido, armada sobre los mismos registros
  // confirmados de `confirmadosCampeonato` (Pagos y Depósitos), en orden cronológico ascendente (el más
  // viejo primero, para que el saldo corrido tenga sentido de arriba hacia abajo). El primer renglón
  // siempre arranca en Saldo inicial = 0, como pidió Federico. El signo del Monto sigue el mismo criterio
  // que "ponlos en verde... es ingreso para TOLS" / depósito = egreso: un Pago SUMA al saldo (ingreso
  // para TOLS), un Depósito RESTA (egreso de TOLS) — aunque en `pagosTorneo`/`depositosTorneo`/
  // `depositosGasto` ambos se guarden siempre como números positivos. Se ordena por la fecha que el
  // Tesorero dejó asentada (`fecha`, opcional en un Pago) y, si no la hay, por la fecha del propio
  // `registradoEn` (timestamp real del servidor) — nunca se deja un registro sin orden.
  const estadoCuentaJugador = useMemo(() => {
    if (!correoEstado) return [];
    const filas = confirmadosCampeonato
      .filter((c) => c.correo === correoEstado)
      .map((c) => ({
        ...c,
        fechaOrden: c.fecha || (c.registradoEn || "").slice(0, 10),
        montoFirmado: c.tipo === "Pago" ? Number(c.monto) || 0 : -(Number(c.monto) || 0),
      }))
      .sort((a, b) => a.fechaOrden.localeCompare(b.fechaOrden) || (a.registradoEn || "").localeCompare(b.registradoEn || ""));
    let saldo = 0;
    return filas.map((f) => {
      const saldoInicial = saldo;
      saldo += f.montoFirmado;
      return { ...f, saldoInicial, saldoFinal: saldo };
    });
  }, [confirmadosCampeonato, correoEstado]);

  // 76ª entrega: "monto esperado" del registro que se está editando — se recalcula igual que
  // `montoEsperadoMov` (nunca se confía en el valor guardado, por si Estadísticas/Tablero cambiaron
  // desde que se confirmó por primera vez).
  let montoEsperadoEdicion = 0;
  if (editandoPago) {
    if (editandoPago.motivoTipo === "torneo") {
      montoEsperadoEdicion = Math.abs(resultadoTorneo(editandoPago.correo, editandoPago.motivoId));
    } else {
      const g = gastosCampeonatoActivo.find((x) => x.concepto === editandoPago.motivoId);
      montoEsperadoEdicion = Number(g?.monto) || 0;
    }
  }

  async function guardarEdicionPago() {
    if (!editandoPago) return;
    setErrorEdicion("");
    const monto = Number(editandoPago.monto);
    if (!(monto > 0)) {
      setErrorEdicion("Ingresá un monto mayor a 0.");
      return;
    }
    if (editandoPago.tipoAccion === "deposito" && !editandoPago.fecha) {
      setErrorEdicion("La fecha es obligatoria para un depósito.");
      return;
    }
    setGuardandoEdicion(true);
    try {
      let body;
      if (editandoPago.tipoAccion === "pago") {
        body = {
          accion: "registrarPago",
          campeonato: campeonatoSel,
          fecha: editandoPago.motivoId,
          correo: editandoPago.correo,
          montoEsperado: montoEsperadoEdicion,
          monto,
          fechaRegistro: editandoPago.fecha,
        };
      } else {
        body = {
          accion: "registrarDeposito",
          campeonato: campeonatoSel,
          motivoTipo: editandoPago.motivoTipo,
          motivoId: editandoPago.motivoId,
          correo: editandoPago.correo,
          montoEsperado: montoEsperadoEdicion,
          monto,
          fechaRegistro: editandoPago.fecha,
        };
      }
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setData(json);
      setEditandoPago(null);
    } catch (e) {
      setErrorEdicion(e.message || "No se pudo guardar.");
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function confirmarNuevoMov() {
    if (!nuevoMov) return;
    setErrorMov("");
    const correo = nuevoMov.correo.trim().toLowerCase();
    if (!correo) {
      setErrorMov("Elegí un jugador.");
      return;
    }
    if (!nuevoMov.motivo) {
      setErrorMov(nuevoMov.tipo === "pago" ? "Elegí un torneo." : "Elegí un motivo.");
      return;
    }
    const monto = Number(nuevoMov.montoReal);
    if (!(monto > 0)) {
      setErrorMov("Ingresá el monto real " + (nuevoMov.tipo === "pago" ? "recibido." : "depositado."));
      return;
    }
    if (nuevoMov.tipo === "deposito" && !nuevoMov.fechaReal) {
      setErrorMov("La fecha es obligatoria para un depósito.");
      return;
    }
    setGuardandoMov(true);
    try {
      let body;
      if (nuevoMov.tipo === "pago") {
        body = {
          accion: "registrarPago",
          campeonato: campeonatoSel,
          fecha: nuevoMov.motivo,
          correo,
          montoEsperado: montoEsperadoMov,
          monto,
          fechaRegistro: nuevoMov.fechaReal,
        };
      } else {
        const esTorneo = nuevoMov.motivo.startsWith("torneo:");
        body = {
          accion: "registrarDeposito",
          campeonato: campeonatoSel,
          motivoTipo: esTorneo ? "torneo" : "gasto",
          motivoId: esTorneo ? nuevoMov.motivo.slice("torneo:".length) : nuevoMov.motivo.slice("gasto:".length),
          correo,
          montoEsperado: montoEsperadoMov,
          monto,
          fechaRegistro: nuevoMov.fechaReal,
        };
      }
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setData(json);
      setNuevoMov(null);
    } catch (e) {
      setErrorMov(e.message || "No se pudo guardar.");
    } finally {
      setGuardandoMov(false);
    }
  }

  async function eliminarMovimiento(id) {
    setGuardando(true);
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "eliminarMovimiento", id }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo eliminar.");
      setData(json);
    } catch (e) {
      setError(e.message || "No se pudo eliminar.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarDatosJugador(correo, cambios) {
    setGuardando(true);
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "guardarJugador", correo, ...cambios }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setData(json);
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  // 44ª entrega: guarda cuenta/banco/tipoCuenta en /api/jugadores (accion "autoeditar", por correo) en
  // vez de /api/cobranza — ahí es donde vive esa información desde esta entrega. Solo tiene sentido
  // cuando el correo ya tiene un registro real en Jugadores (ver `tieneRegistroJugador` en el render).
  async function guardarCuentaCobro(correo) {
    const errorValidacion = validarCuentaCobro(cuentaForm.cuenta, cuentaForm.tipoCuenta);
    if (errorValidacion) {
      setCuentaError(errorValidacion);
      return;
    }
    setCuentaError("");
    setGuardando(true);
    try {
      const r = await fetch(API_JUG, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "autoeditar", correo, ...cuentaForm }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setJugadoresSitio(json.jugadores || []);
      // el resumen de Cobranza saca cuenta/banco/tipoCuenta del directorio de Jugadores (44ª entrega) —
      // se refresca para reflejar el cambio sin recargar toda la pantalla
      const cob = await fetch(API).then((rr) => rr.json());
      setData(cob);
    } catch (e) {
      setCuentaError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function aprobarExcepcion() {
    if (!excepcionModal || !data?.proximaFecha) return;
    setGuardando(true);
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "excepcion", correo: excepcionModal.correo, fecha: data.proximaFecha, motivo: motivoExcepcion }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo aprobar la excepción.");
      setData(json);
      setExcepcionModal(null);
      setMotivoExcepcion("");
    } catch (e) {
      setError(e.message || "No se pudo aprobar la excepción.");
    } finally {
      setGuardando(false);
    }
  }

  async function enviarEstadoCuenta() {
    if (!borrador || !correoEstado) return;
    setEnviando(true);
    setEnvioAviso("");
    try {
      const r = await fetch(API_ENVIAR, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo: correoEstado, asunto: borrador.asunto, cuerpo: borrador.cuerpo }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo enviar el correo.");
      setEnvioAviso("Correo enviado.");
      setBorrador(null);
    } catch (e) {
      setEnvioAviso("Error: " + (e.message || "no se pudo enviar."));
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
        <h1>Cobranza</h1>
        <p className="subtitle">Cargando…</p>
      </div>
    );
  }

  const r = correoEstado ? data?.resumen?.[correoEstado] : null;
  const movimientosJugador = correoEstado ? (data?.movimientos || []).filter((m) => m.correo === correoEstado).sort((a, b) => b.fecha.localeCompare(a.fecha)) : [];
  const pendientesJugador = movimientosJugador.filter((m) => !m.pagado && m.montoTotal > 0);
  const adeudaJugador = correoEstado ? data?.adeudos?.[correoEstado] : false;
  // 44ª entrega: cuenta/banco/tipoCuenta solo se pueden guardar para un correo que ya tiene un
  // registro real en Jugadores (ahí es donde viven) — un correo registrado únicamente en Cobranza (sin
  // Jugadores) no tiene dónde guardarlos.
  const tieneRegistroJugador = correoEstado ? jugadoresSitio.some((j) => j.correo === correoEstado) : false;

  const finanzas = campeonatoSel ? finanzasCampeonato(campeonatoSel, data?.movimientos || [], tableroMapa) : null;

  // 76ª entrega: totales de pagos/depósitos ya CONFIRMADOS por el Tesorero (los 3 mapas nuevos),
  // separados a propósito de las cifras históricas/estáticas que ya traían "Estado de cuenta" y
  // "Finanzas generales" (r.pago/r.deposito y finanzas.recaudadoCobrado/premiosPagados/gastosFijos
  // siguen viniendo de `movimientos`/Tablero, sin tocar, para no romper nada que ya funcionaba).
  function sumaMapaConfirmado(mapa, filtroCorreo) {
    const prefijo = `${campeonatoSel}|`;
    let total = 0;
    for (const [clave, reg] of Object.entries(mapa || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const partes = clave.split("|");
      const correo = partes[partes.length - 1];
      if (filtroCorreo && correo !== filtroCorreo) continue;
      total += Number(reg.monto) || 0;
    }
    return total;
  }

  const confirmadoPagadoJugador = correoEstado ? sumaMapaConfirmado(data?.pagosTorneo, correoEstado) : 0;
  const confirmadoDepositadoJugador = correoEstado
    ? sumaMapaConfirmado(data?.depositosTorneo, correoEstado) + sumaMapaConfirmado(data?.depositosGasto, correoEstado)
    : 0;

  const totalPagosConfirmados = sumaMapaConfirmado(data?.pagosTorneo);
  const totalDepositosConfirmados = sumaMapaConfirmado(data?.depositosTorneo) + sumaMapaConfirmado(data?.depositosGasto);

  // 78ª entrega: "Centavos acumulados" — los jugadores pagan su Debe + su Número de Referencia como
  // centavos (ej. Debe $900, referencia 15 → paga $900.15), para que el Tesorero pueda identificar quién
  // depositó. Esos centavos nunca están incluidos en el Debe que calcula Estadísticas, así que quedan
  // como remanente en cada Pago — a pedido de Federico, se acumulan solos como un ingreso extra de TOLS,
  // sin pedirle nada nuevo al Tesorero. Se calcula SOLO de Pagos confirmados del campeonato activo (nunca
  // de Depósitos — ahí la diferencia sería un error de depósito, no un centavo de referencia) y SOLO el
  // remanente a favor de TOLS (si por algún motivo el Tesorero registra un monto real MENOR al esperado,
  // eso es un faltante, no "centavos negativos" — no resta de este total). Es un cálculo puramente
  // derivado, aditivo — no se guarda nada nuevo en Blobs, se recalcula de `pagosTorneo` en cada render.
  function centavosAcumuladosCampeonato() {
    const prefijo = `${campeonatoSel}|`;
    let total = 0;
    for (const [clave, reg] of Object.entries(data?.pagosTorneo || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const remanente = (Number(reg.monto) || 0) - (Number(reg.montoEsperado) || 0);
      if (remanente > 0) total += remanente;
    }
    return total;
  }
  const centavosAcumulados = centavosAcumuladosCampeonato();

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Cobranza</h1>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="filtro-estatus" style={{ display: "flex", gap: 6, marginTop: 20 }}>
        {[
          ["resultado", "Resultados de Torneos"],
          ["movimientos", "Registrar pagos y depósitos"],
          ["estado", "Estado de cuenta"],
          ["finanzas", "Finanzas generales"],
        ].map(([key, label]) => (
          <button key={key} className={"btn btn-secondary btn-filtro" + (vista === key ? " active" : "")} onClick={() => setVista(key)}>
            {label}
          </button>
        ))}
        <select className="field" style={{ maxWidth: 220, marginLeft: "auto" }} value={campeonatoSel} onChange={(e) => setCampeonatoSel(e.target.value)}>
          {campeonatos.nombres.map((n) => (
            <option key={n} value={n}>
              {n}
              {n === campeonatos.activo ? " (activo)" : ""}
            </option>
          ))}
        </select>
      </div>

      {vista === "resultado" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Resultados de Torneos</div>
          </div>
          <select
            className="field"
            style={{ maxWidth: 280 }}
            value={fechaSaldoSel}
            onChange={(e) => {
              setFechaSaldoSel(e.target.value);
              setSeleccionSaldo(new Set());
              setEnvioSaldoAviso("");
            }}
          >
            <option value="">— elegir torneo —</option>
            {torneosSaldoOpciones.map((t) => (
              <option key={t.fecha} value={t.fecha}>
                {etiquetaCorta(t)} ({fechaFmt(t.fecha)})
              </option>
            ))}
          </select>

          {torneosSaldoOpciones.length === 0 && (
            <p className="section-sub">Todavía no hay torneos publicados en Estadísticas para el campeonato ({campeonatoSel}).</p>
          )}
          {!fechaSaldoSel && torneosSaldoOpciones.length > 0 && (
            <p className="section-sub">Elegí un torneo ya publicado para ver los jugadores con saldo negativo.</p>
          )}

          {fechaSaldoSel && (() => {
            const entry = torneosSaldoOpciones.find((t) => t.fecha === fechaSaldoSel);
            const torneo = estData?.torneos?.[campeonatoSel]?.[fechaSaldoSel];
            const etiquetaSel = etiquetaCorta(entry);

            // 74ª entrega: "prácticamente la tabla de Clasificación General, solo con la columna
            // Resultado" — mismo cálculo de resultado (premioTotal - debeTotal) que ya usa Estadísticas,
            // pero acotado a un único torneo, filtrado a saldos negativos y ordenado de menor a mayor
            // (el más endeudado primero) para que el Tesorero valide de arriba hacia abajo.
            const filas = directorioActivo
              .map((j) => ({ jugador: j, alias: nombreCorto(j), resultado: (() => {
                const jt = jugadorEnTorneo(torneo, j);
                return jt ? (Number(jt.premioTotal) || 0) - (Number(jt.debeTotal) || 0) : 0;
              })() }))
              .filter((f) => f.resultado < 0)
              .sort((a, b) => a.resultado - b.resultado);

            if (!filas.length) {
              return <p className="section-sub">Ningún jugador tiene saldo negativo en el torneo {etiquetaSel} ({fechaFmt(fechaSaldoSel)}).</p>;
            }

            const todosSeleccionados = filas.every((f) => seleccionSaldo.has(f.jugador.correo));

            function toggleTodos() {
              setSeleccionSaldo(todosSeleccionados ? new Set() : new Set(filas.map((f) => f.jugador.correo)));
            }
            function toggleUno(correo) {
              setSeleccionSaldo((prev) => {
                const next = new Set(prev);
                if (next.has(correo)) next.delete(correo);
                else next.add(correo);
                return next;
              });
            }

            async function enviarSeleccionados() {
              setEnviandoSaldo(true);
              setEnvioSaldoAviso("");
              let ok = 0;
              const fallidos = [];
              for (const f of filas) {
                if (!seleccionSaldo.has(f.jugador.correo)) continue;
                try {
                  const r = await fetch(API_ENVIAR_SALDO, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      correo: f.jugador.correo,
                      nombre: f.jugador.nombre,
                      campeonato: campeonatoSel,
                      fecha: fechaSaldoSel,
                      torneoLabel: etiquetaSel,
                      monto: f.resultado,
                      numeroRegistro: f.jugador.id,
                    }),
                  });
                  const json = await r.json();
                  if (!r.ok) throw new Error(json.error || "No se pudo enviar.");
                  setData((prev) => ({ ...prev, enviosSaldo: json.enviosSaldo || prev.enviosSaldo }));
                  ok++;
                } catch (e) {
                  fallidos.push(f.alias);
                }
              }
              setEnviandoSaldo(false);
              setSeleccionSaldo(new Set());
              setEnvioSaldoAviso(
                fallidos.length
                  ? `Se enviaron ${ok} correo(s). No se pudo con: ${fallidos.join(", ")}.`
                  : `Se enviaron ${ok} correo(s) correctamente.`
              );
            }

            return (
              <>
                <div className="tbl" style={{ marginTop: 16 }}>
                  <div className="trow thead" style={{ gridTemplateColumns: "40px 0.6fr 1.4fr 0.9fr 1fr" }}>
                    <div>
                      <input type="checkbox" checked={todosSeleccionados} onChange={toggleTodos} title="Seleccionar todos" />
                    </div>
                    <div>Lugar</div>
                    <div>Alias PokerStars</div>
                    <div>Resultado</div>
                    <div>Correo enviado</div>
                  </div>
                  {filas.map((f, i) => {
                    const clave = `${campeonatoSel}|${fechaSaldoSel}|${f.jugador.correo}`;
                    const enviado = data?.enviosSaldo?.[clave];
                    return (
                      <div className="trow" style={{ gridTemplateColumns: "40px 0.6fr 1.4fr 0.9fr 1fr" }} key={f.jugador.correo}>
                        <div>
                          <input type="checkbox" checked={seleccionSaldo.has(f.jugador.correo)} onChange={() => toggleUno(f.jugador.correo)} />
                        </div>
                        <div className="num">{i + 1}</div>
                        <div>{f.alias}</div>
                        <div className="num right"><Monto valor={f.resultado} /></div>
                        <div>
                          <span className={"badge " + (enviado ? "badge-nivel-escritura" : "badge-nivel-ninguno")}>{enviado ? "Sí" : "No"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {editable && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" disabled={enviandoSaldo || seleccionSaldo.size === 0} onClick={enviarSeleccionados}>
                      {enviandoSaldo ? "Enviando…" : `Enviar correo de saldo (${seleccionSaldo.size})`}
                    </button>
                  </div>
                )}
                {envioSaldoAviso && (
                  <div className={envioSaldoAviso.includes("No se pudo") ? "login-error" : "check-line check-ok"} style={{ marginTop: 8 }}>
                    {envioSaldoAviso}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {vista === "movimientos" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Registrar pagos y depósitos — {campeonatoSel}</div>
          </div>

          {editable && (
            <div className="tbl" style={{ padding: 16, marginBottom: 16 }}>
              {!nuevoMov ? (
                <button
                  className="btn btn-primary btn-add"
                  onClick={() => {
                    setNuevoMov({ tipo: "pago", correo: "", motivo: "", montoReal: 0, fechaReal: "" });
                    setErrorMov("");
                  }}
                >
                  + Nuevo movimiento
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="login-field-row">
                    <div className="login-field" style={{ maxWidth: 200 }}>
                      <label>Tipo</label>
                      <select
                        className="field"
                        value={nuevoMov.tipo}
                        onChange={(e) => setNuevoMov({ ...nuevoMov, tipo: e.target.value, motivo: "" })}
                      >
                        <option value="pago">Pago (jugador → TOLS)</option>
                        <option value="deposito">Depósito (TOLS → jugador)</option>
                      </select>
                    </div>
                    <div className="login-field" style={{ flex: 2 }}>
                      <label>Jugador (Alias PokerStars / Nº de referencia)</label>
                      <select
                        className="field"
                        value={nuevoMov.correo}
                        onChange={(e) => setNuevoMov({ ...nuevoMov, correo: e.target.value, motivo: "" })}
                      >
                        <option value="">— elegir jugador —</option>
                        {directorioActivo.map((j) => (
                          <option key={j.correo} value={j.correo}>
                            {nombreCorto(j)} (#{j.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="login-field-row">
                    <div className="login-field" style={{ flex: 2 }}>
                      <label>Motivo</label>
                      <select
                        className="field"
                        value={nuevoMov.motivo}
                        disabled={!nuevoMov.correo}
                        onChange={(e) => setNuevoMov({ ...nuevoMov, motivo: e.target.value })}
                      >
                        <option value="">— elegir —</option>
                        {nuevoMov.tipo === "pago" &&
                          opcionesPago.map((t) => (
                            <option key={t.fecha} value={t.fecha}>
                              Torneo {etiquetaCorta(t)} ({fechaFmt(t.fecha)})
                            </option>
                          ))}
                        {nuevoMov.tipo === "deposito" && (
                          <>
                            {opcionesDepositoTorneo.map((t) => (
                              <option key={`torneo:${t.fecha}`} value={`torneo:${t.fecha}`}>
                                Torneo {etiquetaCorta(t)} ({fechaFmt(t.fecha)})
                              </option>
                            ))}
                            {opcionesDepositoGasto.map((g) => (
                              <option key={`gasto:${g.concepto}`} value={`gasto:${g.concepto}`}>
                                {g.concepto}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      {nuevoMov.correo &&
                        nuevoMov.tipo === "pago" &&
                        opcionesPago.length === 0 && (
                          <div className="section-sub" style={{ marginTop: 4 }}>
                            No hay torneos con pago pendiente de confirmar para este jugador.
                          </div>
                        )}
                      {nuevoMov.correo &&
                        nuevoMov.tipo === "deposito" &&
                        opcionesDepositoTorneo.length === 0 &&
                        opcionesDepositoGasto.length === 0 && (
                          <div className="section-sub" style={{ marginTop: 4 }}>
                            No hay depósitos pendientes de confirmar para este jugador.
                          </div>
                        )}
                    </div>
                  </div>

                  {nuevoMov.motivo && (
                    <>
                      <div className="login-field-row">
                        <div className="login-field" style={{ maxWidth: 220 }}>
                          <label>Monto esperado a {nuevoMov.tipo === "pago" ? "recibir" : "depositar"}</label>
                          <input className="field" value={money(montoEsperadoMov)} disabled readOnly />
                        </div>
                        <div className="login-field" style={{ maxWidth: 220 }}>
                          <label>Monto realmente {nuevoMov.tipo === "pago" ? "recibido" : "depositado"}</label>
                          <input
                            className="field"
                            type="number"
                            min={0}
                            value={nuevoMov.montoReal}
                            onChange={(e) => setNuevoMov({ ...nuevoMov, montoReal: Number(e.target.value) || 0 })}
                          />
                        </div>
                      </div>

                      <div className="login-field-row">
                        <div className="login-field" style={{ maxWidth: 180 }}>
                          <label>
                            Fecha {nuevoMov.tipo === "pago" ? "de recibido (opcional)" : "de depósito"}
                          </label>
                          <input
                            className="field"
                            type="date"
                            value={nuevoMov.fechaReal}
                            onChange={(e) => setNuevoMov({ ...nuevoMov, fechaReal: e.target.value })}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {errorMov && <div className="login-error">{errorMov}</div>}

                  <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="btn btn-primary" disabled={guardandoMov} onClick={confirmarNuevoMov}>
                      {guardandoMov ? "Guardando…" : "Confirmar"}
                    </button>
                    <button className="btn btn-secondary" disabled={guardandoMov} onClick={() => { setNuevoMov(null); setErrorMov(""); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="section-sub">Pagos y depósitos confirmados</div>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: "1.4fr 0.7fr 1.3fr 0.9fr 0.9fr 1fr 40px" }}>
              <div>Jugador</div><div>Tipo</div><div>Motivo</div><div>Esperado</div><div>Real</div><div>Registrado</div><div />
            </div>
            {confirmadosCampeonato.map((c) =>
              editandoPago?.clave === c.clave ? (
                <div
                  key={c.clave}
                  style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: "12px", borderBottom: "1px solid #eee" }}
                >
                  <div style={{ minWidth: 200, alignSelf: "center" }}>
                    <div>{data.resumen[c.correo]?.nombre || c.correo}</div>
                    <div className="section-sub" style={{ marginTop: 2 }}>{c.tipo} — {c.motivo}</div>
                  </div>
                  <div className="login-field" style={{ maxWidth: 160 }}>
                    <label>Monto esperado</label>
                    <input className="field" value={money(montoEsperadoEdicion)} disabled readOnly />
                  </div>
                  <div className="login-field" style={{ maxWidth: 160 }}>
                    <label>Monto real</label>
                    <input
                      className="field"
                      type="number"
                      min={0}
                      value={editandoPago.monto}
                      onChange={(e) => setEditandoPago({ ...editandoPago, monto: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="login-field" style={{ maxWidth: 170 }}>
                    <label>Fecha {editandoPago.tipoAccion === "pago" ? "(opcional)" : ""}</label>
                    <input
                      className="field"
                      type="date"
                      value={editandoPago.fecha}
                      onChange={(e) => setEditandoPago({ ...editandoPago, fecha: e.target.value })}
                    />
                  </div>
                  {errorEdicion && <div className="login-error">{errorEdicion}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" disabled={guardandoEdicion} onClick={guardarEdicionPago}>
                      {guardandoEdicion ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={guardandoEdicion}
                      onClick={() => { setEditandoPago(null); setErrorEdicion(""); }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="trow" style={{ gridTemplateColumns: "1.4fr 0.7fr 1.3fr 0.9fr 0.9fr 1fr 40px" }} key={c.clave}>
                  <div>{data.resumen[c.correo]?.nombre || c.correo}</div>
                  <div><span className={"badge " + (c.tipo === "Pago" ? "badge-regular" : "badge-main")}>{c.tipo}</span></div>
                  <div>{c.motivo}</div>
                  <div className="num center"><MontoPorTipo valor={c.montoEsperado} tipo={c.tipo} /></div>
                  {/* 79ª entrega: "Real" con centavos (moneyConCentavos) — con money() (redondea a pesos
                      enteros) el monto editado se veía idéntico al Esperado cuando el jugador paga con la
                      referencia como centavos, dando la impresión de que la edición "no se desplegaba". */}
                  <div className="num center"><MontoPorTipo valor={c.monto} tipo={c.tipo} centavos /></div>
                  <div className="num">{c.fecha ? fechaFmt(c.fecha) : "—"}</div>
                  <div>
                    {editable && (
                      <button
                        className="btn-icon-remove"
                        title="Editar"
                        onClick={() => {
                          setEditandoPago({
                            clave: c.clave,
                            tipoAccion: c.tipoAccion,
                            motivoTipo: c.motivoTipo,
                            motivoId: c.motivoId,
                            correo: c.correo,
                            monto: c.monto,
                            fecha: c.fecha || "",
                          });
                          setErrorEdicion("");
                        }}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
            {confirmadosCampeonato.length === 0 && (
              <div className="section-sub" style={{ padding: 16 }}>Todavía no hay pagos ni depósitos confirmados para este campeonato.</div>
            )}
          </div>

          <div className="section-sub" style={{ marginTop: 20 }}>Historial de movimientos (Debe/Ganó por torneo)</div>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: "1fr 1.4fr 0.7fr 0.9fr 0.9fr 0.9fr 0.7fr 0.9fr 40px" }}>
              <div>Fecha</div><div>Jugador</div><div>Tipo</div><div>Debe</div><div>Ganó</div><div>Balance</div><div>Pagado</div><div>Lugar</div><div />
            </div>
            {movimientosDelCampeonato.map((m) => (
              <div className="trow" style={{ gridTemplateColumns: "1fr 1.4fr 0.7fr 0.9fr 0.9fr 0.9fr 0.7fr 0.9fr 40px" }} key={m.id}>
                <div className="num">{m.fecha}</div>
                <div>{data.resumen[m.correo]?.nombre || m.correo}</div>
                <div><span className={"badge " + (m.tipo === "Main" ? "badge-main" : "badge-regular")}>{m.tipo}</span></div>
                <div className="num right">{money(m.montoTotal)}</div>
                <div className="num right">{money(m.totalGanado)}</div>
                <div className={"num right " + (m.balanceNeto < 0 ? "" : "")}>{money(m.balanceNeto)}</div>
                <div>
                  <span className={"badge " + (m.pagado ? "badge-nivel-escritura" : "badge-nivel-ninguno")}>{m.pagado ? "Sí" : "No"}</span>
                </div>
                <div className="num">{m.lugar ?? "—"}</div>
                <div>
                  {editable && (
                    <button className="btn-icon-remove" title="Eliminar" onClick={() => eliminarMovimiento(m.id)}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {movimientosDelCampeonato.length === 0 && <div className="section-sub" style={{ padding: 16 }}>Todavía no hay movimientos cargados para este campeonato.</div>}
          </div>
        </div>
      )}

      {vista === "estado" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Estado de cuenta por jugador</div>
          </div>
          <select className="field" style={{ maxWidth: 320 }} value={correoEstado} onChange={(e) => { setCorreoEstado(e.target.value); setBorrador(null); setEnvioAviso(""); }}>
            <option value="">— elegir jugador —</option>
            {directorio.map((d) => (
              <option key={d.correo} value={d.correo}>
                {d.nombre} ({d.correo})
              </option>
            ))}
          </select>

          {r && (
            <>
              <div className="stats stats-compact" style={{ marginTop: 20 }}>
                <div className="stat">
                  <div className="stat-label">Total debido</div>
                  <div className="stat-value"><Monto valor={r.pago} /></div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total ganado</div>
                  <div className="stat-value"><Monto valor={r.deposito} forzarNegativo /></div>
                </div>
                <div className="stat">
                  <div className="stat-label">Saldo</div>
                  <div className="stat-value"><Monto valor={r.saldo} /></div>
                </div>
                <div className="stat">
                  <div className="stat-label">Pagado confirmado</div>
                  <div className="stat-value"><Monto valor={confirmadoPagadoJugador} /></div>
                </div>
                <div className="stat">
                  <div className="stat-label">Depositado confirmado</div>
                  <div className="stat-value"><Monto valor={confirmadoDepositadoJugador} forzarNegativo /></div>
                </div>
              </div>

              {adeudaJugador && (
                <div className="campeonato-banner campeonato-banner-alerta campeonato-banner-row">
                  <span>⚠ Tiene un adeudo pendiente — no está habilitado para el próximo torneo ({data.proximaFecha}).</span>
                  {editable && (
                    <button className="btn btn-secondary" onClick={() => setExcepcionModal({ correo: r.correo, nombre: r.nombre })}>
                      Aprobar excepción
                    </button>
                  )}
                </div>
              )}

              {editable && (
                <div style={{ marginTop: 16 }}>
                  {!tieneRegistroJugador ? (
                    <div className="section-sub" style={{ marginTop: 0 }}>
                      Este correo no tiene un registro en Jugadores — los datos de cobro (CLABE/Tarjeta) solo
                      se pueden guardar para jugadores ya registrados en el sitio.
                    </div>
                  ) : (
                    <>
                      <div className="login-field-row">
                        <div className="login-field" style={{ maxWidth: 200 }}>
                          <label>Tipo de cuenta</label>
                          <select
                            className="field"
                            value={cuentaForm.tipoCuenta}
                            onChange={(e) => { setCuentaForm({ ...cuentaForm, tipoCuenta: e.target.value }); setCuentaError(""); }}
                          >
                            <option value="">— elegir —</option>
                            {TIPOS_CUENTA.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div className="login-field" style={{ maxWidth: 220 }}>
                          <label>
                            {cuentaForm.tipoCuenta ? `${cuentaForm.tipoCuenta} (${longitudEsperada(cuentaForm.tipoCuenta)} dígitos)` : "Número de cuenta"}
                          </label>
                          <input
                            className="field"
                            inputMode="numeric"
                            maxLength={longitudEsperada(cuentaForm.tipoCuenta) || 20}
                            value={cuentaForm.cuenta}
                            onChange={(e) => { setCuentaForm({ ...cuentaForm, cuenta: e.target.value.replace(/\D/g, "") }); setCuentaError(""); }}
                          />
                        </div>
                        <div className="login-field" style={{ maxWidth: 220 }}>
                          <label>Banco</label>
                          <input
                            className="field"
                            value={cuentaForm.banco}
                            onChange={(e) => setCuentaForm({ ...cuentaForm, banco: e.target.value })}
                          />
                        </div>
                      </div>
                      {cuentaError && <div className="login-error">{cuentaError}</div>}
                      <button className="btn btn-secondary btn-filtro" disabled={guardando} onClick={() => guardarCuentaCobro(r.correo)}>
                        {guardando ? "Guardando…" : "Guardar cuenta de cobro"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* 79ª entrega: "Estado de cuenta" — saldo corrido de los Pagos/Depósitos ya confirmados
                  de este jugador en el campeonato activo, a pedido de Federico. Un Pago SUMA al saldo
                  (ingreso para TOLS), un Depósito RESTA (egreso de TOLS) — arranca en 0 y el Saldo final
                  de un renglón es el Saldo inicial del siguiente. */}
              <div className="section-sub" style={{ marginTop: 20 }}>Estado de cuenta — {campeonatoSel}</div>
              <div className="tbl">
                <div className="trow thead" style={{ gridTemplateColumns: "1fr 0.7fr 1.2fr 1fr 1fr 1fr" }}>
                  <div>Fecha</div><div>Tipo</div><div>Motivo</div><div>Saldo inicial</div><div>Monto</div><div>Saldo final</div>
                </div>
                {estadoCuentaJugador.map((f) => (
                  <div className="trow" style={{ gridTemplateColumns: "1fr 0.7fr 1.2fr 1fr 1fr 1fr" }} key={f.clave}>
                    <div className="num">{f.fechaOrden ? fechaFmt(f.fechaOrden) : "—"}</div>
                    <div><span className={"badge " + (f.tipo === "Pago" ? "badge-regular" : "badge-main")}>{f.tipo}</span></div>
                    <div>{f.motivo}</div>
                    <div className="num center"><Monto valor={f.saldoInicial} /></div>
                    <div className="num center"><Monto valor={f.montoFirmado} /></div>
                    <div className="num center"><Monto valor={f.saldoFinal} /></div>
                  </div>
                ))}
                {estadoCuentaJugador.length === 0 && (
                  <div className="section-sub" style={{ padding: 16 }}>Todavía no hay pagos ni depósitos confirmados para este jugador en este campeonato.</div>
                )}
              </div>

              <div className="section-sub" style={{ marginTop: 20 }}>Historial de movimientos (Debe/Ganó por torneo)</div>
              <div className="tbl">
                <div className="trow thead" style={{ gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 0.9fr 0.7fr" }}>
                  <div>Fecha</div><div>Tipo</div><div>Debe</div><div>Ganó</div><div>Balance</div><div>Pagado</div>
                </div>
                {movimientosJugador.map((m) => (
                  <div className="trow" style={{ gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 0.9fr 0.7fr" }} key={m.id}>
                    <div className="num">{m.campeonato} — {m.fecha}</div>
                    <div><span className={"badge " + (m.tipo === "Main" ? "badge-main" : "badge-regular")}>{m.tipo}</span></div>
                    <div className="num right">{money(m.montoTotal)}</div>
                    <div className="num right">{money(m.totalGanado)}</div>
                    <div className="num right">{money(m.balanceNeto)}</div>
                    <div><span className={"badge " + (m.pagado ? "badge-nivel-escritura" : "badge-nivel-ninguno")}>{m.pagado ? "Sí" : "No"}</span></div>
                  </div>
                ))}
              </div>

              {editable && pendientesJugador.length > 0 && !borrador && (
                <button className="btn btn-secondary btn-add" onClick={() => setBorrador(borradorEstadoCuenta(r, pendientesJugador, data.proximaFecha))}>
                  Redactar estado de cuenta por correo
                </button>
              )}

              {borrador && (
                <div className="tbl" style={{ padding: 16, marginTop: 12 }}>
                  <div className="section-sub" style={{ marginTop: 0 }}>
                    Revisá y editá el mensaje antes de enviarlo — se manda tal cual quede acá.
                  </div>
                  <div className="login-field">
                    <label>Asunto</label>
                    <input className="field" value={borrador.asunto} onChange={(e) => setBorrador({ ...borrador, asunto: e.target.value })} />
                  </div>
                  <div className="login-field">
                    <label>Cuerpo del mensaje</label>
                    <textarea
                      className="field"
                      rows={10}
                      value={borrador.cuerpo}
                      onChange={(e) => setBorrador({ ...borrador, cuerpo: e.target.value })}
                      style={{ fontFamily: "inherit", resize: "vertical" }}
                    />
                  </div>
                  <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="btn btn-primary" disabled={enviando} onClick={enviarEstadoCuenta}>
                      {enviando ? "Enviando…" : "Aprobar y enviar"}
                    </button>
                    <button className="btn btn-secondary" disabled={enviando} onClick={() => setBorrador(null)}>
                      Cancelar
                    </button>
                  </div>
                  {envioAviso && <div className={envioAviso.startsWith("Error") ? "login-error" : "check-line check-ok"}>{envioAviso}</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {vista === "finanzas" && finanzas && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Finanzas generales — {campeonatoSel}</div>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Recaudado (cobrado)</div>
              <div className="stat-value"><Monto valor={finanzas.recaudadoCobrado} /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Recaudado pendiente</div>
              <div className="stat-value">{money(finanzas.recaudadoPendiente)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Premios pagados</div>
              <div className="stat-value"><Monto valor={finanzas.premiosPagados} forzarNegativo /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Gastos fijos del campeonato</div>
              <div className="stat-value"><Monto valor={finanzas.gastosFijos} forzarNegativo /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Fondo acumulado estimado</div>
              <div className="stat-value"><Monto valor={finanzas.fondoAcumuladoEstimado} /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Saldo neto de la liga</div>
              <div className="stat-value"><Monto valor={finanzas.saldoNeto} /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Pagos confirmados (Cobranza)</div>
              <div className="stat-value"><Monto valor={totalPagosConfirmados} /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Depósitos confirmados (Cobranza)</div>
              <div className="stat-value"><Monto valor={totalDepositosConfirmados} forzarNegativo /></div>
            </div>
            <div className="stat">
              <div className="stat-label">Centavos acumulados</div>
              <div className="stat-value"><Monto valor={centavosAcumulados} centavos /></div>
            </div>
          </div>
          <div className="section-sub">
            "Recaudado" solo cuenta lo marcado como pagado al tesorero. El fondo acumulado es una estimación
            (% configurado en el Tablero de Control sobre lo ya cobrado) — el monto real depende de cuánto
            se termine recaudando en cada fecha. "Pagos/Depósitos confirmados" son los registros confirmados
            desde "Registrar pagos y depósitos" (76ª entrega) y todavía no se mezclan en el Saldo neto de
            arriba. "Centavos acumulados" (78ª entrega) es el remanente de los Pagos confirmados de este
            campeonato por encima del Debe esperado — los centavos que cada jugador agrega como Número de
            Referencia para identificar su depósito — y tampoco se mezcla con el Saldo neto.
          </div>
        </div>
      )}

      {excepcionModal && (
        <div className="modal-backdrop" onClick={() => setExcepcionModal(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">⚠</div>
            <div className="modal-title">Aprobar excepción: {excepcionModal.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Vas a habilitar a <b>{excepcionModal.nombre}</b> para jugar el torneo del <b>{data?.proximaFecha}</b> a
              pesar del adeudo pendiente. Esto no borra la deuda, solo la excepciona para esa fecha.
            </p>
            <div className="login-field">
              <label>Motivo (opcional, para el registro)</label>
              <input className="field" value={motivoExcepcion} onChange={(e) => setMotivoExcepcion(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setExcepcionModal(null)} disabled={guardando}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={guardando} onClick={aprobarExcepcion}>
                {guardando ? "Un momento…" : "Aprobar excepción"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
