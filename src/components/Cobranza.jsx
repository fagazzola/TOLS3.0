import { useEffect, useMemo, useRef, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import { mapaNumeracionTorneos } from "../lib/gamenight.js";
// 104ª entrega: "Corte de cobranza" se copia como IMAGEN (no texto) para pegar directo en WhatsApp —
// html2canvas renderiza el <table> real a un <canvas>, que se manda al portapapeles con la Clipboard API.
import html2canvas from "html2canvas";
// 106ª entrega: botón de exportar a Excel en "Torneos publicados" y "Corte de cobranza", mismo patrón
// que ya usa Estadisticas.jsx para el torneo abierto.
import * as XLSX from "xlsx";

const API = "/api/cobranza";
const API_ENVIAR_SALDO = "/api/cobranza-enviar-saldo";
const API_ENVIAR_DATOSCUENTA = "/api/cobranza-enviar-datoscuenta"; // 89ª entrega
const API_ENVIAR_ESTADO = "/api/cobranza-enviar-estado"; // 99ª entrega
const API_TABLERO = "/api/tablero";
const API_CAL = "/api/calendario";
const API_CAMP = "/api/campeonatos";
const API_JUG = "/api/jugadores";
const API_EST = "/api/estadisticas";

// 106ª entrega: Federico pidió que TODAS las cifras de dinero del sitio siempre muestren 2 decimales
// ("$ #,000.00" / "($ #,000.00)"), sin importar si el monto es entero o no.
function money(n) {
  return "$ " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// 74ª entrega: mismo formato contable que ya usan Calendario.jsx/Estadisticas.jsx para negativos —
// "($ #,##0)" en vez de "-$ #,##0" — usado acá en la columna "Resultado" de "Resultados de Torneos".
function moneyContable(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// 98ª entrega: Federico pidió que "Finanzas generales" deje de verse como recuadros/tarjetas ("difícil de
// leer y seguir") y pase a una vista tipo hoja de trabajo/cuadrícula, como Excel. Estas tres filas armar la
// tabla reemplazan los antiguos .stats/.stat (recuadros) — mismo patrón de cuadrícula ya usado en "Pagos y
// depósitos confirmados"/"Estado de cuenta" (border 1px, celdas), nunca tarjetas.
function FilaSeccionFin({ label }) {
  return (
    <tr>
      <td
        colSpan={2}
        style={{
          border: "1px solid #ccc",
          background: "#e9edf1",
          padding: "6px 10px",
          fontWeight: 700,
          fontSize: 12.5,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </td>
    </tr>
  );
}
function FilaFin({ label, children, bold = false, sangria = false }) {
  return (
    <tr style={bold ? { background: "#f4f6f8" } : undefined}>
      <td
        style={{
          border: "1px solid #eee",
          padding: "6px 10px",
          paddingLeft: sangria ? 26 : 10,
          fontWeight: bold ? 700 : 400,
        }}
      >
        {label}
      </td>
      <td
        style={{
          border: "1px solid #eee",
          padding: "6px 10px",
          textAlign: "right",
          whiteSpace: "nowrap",
          fontWeight: bold ? 700 : 400,
        }}
      >
        {children}
      </td>
    </tr>
  );
}
function TablaFin({ children }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginBottom: 18 }}>
      <tbody>{children}</tbody>
    </table>
  );
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
// 103ª entrega: "fecha límite" por default en "Torneos publicados" (antes "Resultados de Torneos") — a
// pedido de Federico, el viernes de la semana EN CURSO (domingo..sábado), como texto ya armado para el
// cuerpo del correo de "Saldo Torneo" (reemplaza el "viernes de esta semana" fijo que tenía la plantilla).
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function viernesSemanaActualTexto() {
  const hoy = new Date();
  const viernes = new Date(hoy);
  viernes.setDate(hoy.getDate() + (5 - hoy.getDay()));
  return `viernes ${viernes.getDate()} de ${MESES_LARGOS[viernes.getMonth()]}`;
}
// 103ª/104ª entrega: "No. de Referencia" de "Corte de cobranza" — mismo número de registro que ya se usa
// en toda la app como `j.id`, con dos dígitos siempre ("00", "07", "12"...). La 103ª entrega lo había
// puesto en formato decimal (".00"); Federico corrigió en la 104ª a este formato de dos dígitos.
function refFmt(id) {
  return String(Math.round(Number(id) || 0)).padStart(2, "0");
}
// 104ª entrega: texto plano de un monto (mismo criterio de signo/centavos que <Monto/>, pero SIN la clase
// money-pos/money-neg) — la celda de Resultado de "Corte de cobranza" pinta su propio color de letra
// (blanco sobre el fondo intenso), y <Monto/> pisaría ese color porque sus clases fijan el color del
// <span> directamente. Usado solo ahí.
function montoPlano(n, centavos = false) {
  const v = Number(n) || 0;
  const plano = centavos ? moneyConCentavos(Math.abs(v)) : money(Math.abs(v));
  return v < 0 ? `(${plano})` : plano;
}
// 106ª entrega: texto de la columna Saldo de "Corte de cobranza" — reemplaza el criterio de la 105ª
// entrega (que ponía el No. de Referencia como "centavos" del Resultado cuando el jugador debía).
// Federico aclaró que esa referencia NUNCA es parte de la deuda, así que esta columna ahora es un
// espejo liso del Resultado del Torneo: Saldo = Ganancia + Deuda, sin ningún centavo de referencia
// mezclado — ver filasCorte() más arriba.
function textoSaldoCorte(f) {
  return montoPlano(f.saldo);
}

export default function Cobranza({ session, perfiles }) {
  const editable = puedeEditar(perfiles, session, "mod4");

  const [vista, setVista] = useState("resultado"); // "resultado" | "corte" | "movimientos" | "estado" | "finanzas"
  const [fechaSaldoSel, setFechaSaldoSel] = useState(""); // 74ª entrega: fecha del torneo elegido en "Torneos publicados" (antes "Resultados de Torneos")
  const [seleccionSaldo, setSeleccionSaldo] = useState(() => new Set());
  const [enviandoSaldo, setEnviandoSaldo] = useState(false);
  const [envioSaldoAviso, setEnvioSaldoAviso] = useState("");
  // 103ª entrega: fecha límite editable que va en el cuerpo del correo de "Saldo Torneo" — por default el
  // viernes de la semana en curso, el Tesorero la puede cambiar antes de enviar.
  const [fechaLimiteSaldo, setFechaLimiteSaldo] = useState(() => viernesSemanaActualTexto());
  // 103ª entrega: nuevo botón "Corte de cobranza" — combo propio (mismos torneos publicados). 104ª
  // entrega: el "copiado" pasó de texto a una IMAGEN de la tabla (html2canvas + Clipboard API) — `corteRef`
  // apunta al <table> real que se renderiza a canvas; `corteGenerando`/`corteAviso` son el estado de ese
  // proceso (puede tardar un segundo en armar la imagen, y puede terminar en "copiado" o, si el navegador
  // no soporta pegar imágenes desde JS, en una descarga de respaldo).
  const [fechaCorteSel, setFechaCorteSel] = useState("");
  // 106ª/107ª entrega: orden de la tabla de "Corte de cobranza" — "ref" (No. de Referencia, de siempre),
  // "estatus" (agrupado por si debe/pagó/cobra, 107ª entrega, reemplaza al botón "Saldo" de la 106ª) o
  // "saldo" (clickeando el propio encabezado de la columna Saldo, como en Clasificación General, con
  // `corteSaldoDir` para asc/desc). En los tres casos, el No. de Referencia ascendente es el criterio de
  // desempate.
  const [corteOrden, setCorteOrden] = useState("ref");
  const [corteSaldoDir, setCorteSaldoDir] = useState("desc");
  const [corteCopiado, setCorteCopiado] = useState(false);
  const [corteGenerando, setCorteGenerando] = useState(false);
  const [corteAviso, setCorteAviso] = useState("");
  const corteRef = useRef(null);
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

  // 89ª entrega: botón de "Registrar pagos y depósitos" para pedirle por correo al jugador sus datos de
  // cuenta de cobro (tipo de cuenta/cuenta/banco) cuando van incompletos y se está armando un Depósito —
  // ver más abajo, junto al bloque de datos de cuenta del formulario.
  const [solicitandoDatosCuenta, setSolicitandoDatosCuenta] = useState(false);
  const [avisoDatosCuenta, setAvisoDatosCuenta] = useState("");

  // 81ª entrega: agrupador de los totales de "Pagos y depósitos confirmados" — a pedido de Federico,
  // antes de la tabla de detalle, agrupables por Motivo o por Fecha.
  const [agruparPor, setAgruparPor] = useState("motivo"); // "motivo" | "fecha"

  const [excepcionModal, setExcepcionModal] = useState(null); // { correo, nombre }
  const [motivoExcepcion, setMotivoExcepcion] = useState("");

  // 99ª entrega: botón "Enviar por correo" en "Estado de cuenta" — a pedido de Federico. Reusa el
  // endpoint cobranza-enviar-estado.js / plantillaEstadoCuenta() que ya existía en el servidor (de una
  // entrega anterior) pero que ningún botón de la pantalla llamaba todavía: el Tesorero ve un borrador de
  // asunto/cuerpo pre-armado a partir de `estadoCuentaJugador`, lo puede editar libremente en el modal
  // (el servidor solo envía lo que ya fue aprobado acá, nunca decide el contenido) y recién ahí se manda.
  const [enviarEstadoModal, setEnviarEstadoModal] = useState(null); // null | { correo, nombre, asunto, cuerpo }
  const [enviandoEstado, setEnviandoEstado] = useState(false);
  const [errorEnviarEstado, setErrorEnviarEstado] = useState("");
  const [avisoEnviarEstado, setAvisoEnviarEstado] = useState("");

  useEffect(() => {
    cargar();
  }, []);

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

  // 51ª entrega: "Resultados de Torneos" — si se cambia de campeonato arriba mientras esta vista está
  // abierta, el torneo elegido ya no aplica (pertenece a otro campeonato) — se limpia solo para no dejar
  // un torneo "fantasma" seleccionado que en realidad es de otro campeonato. 74ª entrega: también se
  // limpia la selección de jugadores y el aviso de envío, por la misma razón.
  useEffect(() => {
    setFechaSaldoSel("");
    setSeleccionSaldo(new Set());
    setEnvioSaldoAviso("");
    setFechaCorteSel("");
    setCorteCopiado(false);
  }, [campeonatoSel]);

  // 74ª entrega: numeración cronológica 1..n de los torneos Regular/Main de cada campeonato (ver
  // src/lib/gamenight.js) — misma fuente que ya usan Calendario y Estadísticas, para que el número de un
  // torneo sea siempre el mismo en toda la app. Las partidas de práctica quedan fuera (no reparten Debe
  // real, así que no tiene sentido mandarles un "Saldo Torneo").
  const numeracion = useMemo(() => mapaNumeracionTorneos(torneosCal), [torneosCal]);

  // 74ª entrega: directorio "completo" (con id/aliasPokerStars, no solo correo+nombre) para armar la
  // tabla de "Resultados de Torneos"/"Corte de cobranza" — excluyendo solo "Usuario Domi" (cuenta de
  // pruebas del sitio). 106ª entrega: el nombre quedó de la entrega original, pero DEJÓ de filtrar por
  // "estatus === Activo" — Federico: un torneo ya publicado "debe permanecer inalterable en jugadores y
  // sus montos, incluso durante el proceso de cobranza"; si alguien pasa a Inactivo después de haber
  // jugado y pagado/cobrado en un torneo ya cerrado, esa deuda/cobro tiene que seguir viéndose en los
  // reportes de ESE torneo (si no, "nos descuadra las finanzas") — mismo criterio aplicado en
  // Estadisticas.jsx ("Clasificación general").
  const directorioActivo = useMemo(
    () => jugadoresSitio.filter((j) => norm(j.nombre) !== "usuario domi" && norm(nombreCorto(j)) !== "usuario domi"),
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

  // 81ª entrega: alias PokerStars por correo, sobre TODO el directorio de Jugadores (no solo
  // `directorioActivo`, porque un pago/depósito confirmado puede pertenecer a un jugador que ya no está
  // Activo) — a pedido de Federico, "Pagos y depósitos confirmados" muestra el Alias PS, no el nombre.
  const aliasPorCorreoMap = useMemo(() => {
    const m = {};
    for (const j of jugadoresSitio) m[j.correo] = nombreCorto(j);
    return m;
  }, [jugadoresSitio]);
  function aliasDeCorreo(correo) {
    return aliasPorCorreoMap[correo] || data?.resumen?.[correo]?.nombre || correo;
  }

  // 89ª entrega: datos de cuenta de cobro (tipo de cuenta/cuenta/banco — los mismos que se editan en Mi
  // Perfil) del jugador elegido en "+ Nuevo movimiento", para mostrarlos cuando el tipo es Depósito
  // (Federico: "despliega los datos de cuenta, tipo y banco del jugador a depositar"). Se busca sobre
  // TODO `jugadoresSitio`, no solo `directorioActivo`, por si alguna vez se deposita a alguien que ya no
  // está Activo.
  const jugadorDepositoSel =
    nuevoMov?.tipo === "deposito" && nuevoMov.correo ? jugadoresSitio.find((j) => j.correo === nuevoMov.correo) || null : null;
  const datosCuentaCompletos =
    !!jugadorDepositoSel && !!jugadorDepositoSel.tipoCuenta?.trim() && !!jugadorDepositoSel.cuenta?.trim() && !!jugadorDepositoSel.banco?.trim();

  async function solicitarDatosCuenta() {
    if (!jugadorDepositoSel) return;
    setSolicitandoDatosCuenta(true);
    setAvisoDatosCuenta("");
    try {
      const r = await fetch(API_ENVIAR_DATOSCUENTA, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo: jugadorDepositoSel.correo, nombre: jugadorDepositoSel.nombre }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo enviar el correo.");
      setAvisoDatosCuenta("Correo enviado correctamente.");
    } catch (e) {
      setAvisoDatosCuenta(e.message || "No se pudo enviar el correo.");
    } finally {
      setSolicitandoDatosCuenta(false);
    }
  }

  // 76ª entrega: los 3 conceptos de "Gastos del campeonato" del Tablero de Control — fuente del combo
  // de "motivo" cuando el tipo elegido es Depósito (Q3: "para estas 3 que mencionas, los montos
  // definidos en el tablero de control").
  const gastosCampeonatoActivo = tableroMapa?.[campeonatoSel]?.gastosCampeonato || [];
  // 87ª entrega: la Cuota de inscripción del Tablero de Control (Parámetros Generales) — a diferencia de
  // los "Gastos del campeonato", es un cargo fijo por jugador, una sola vez por campeonato, que el
  // jugador le paga a TOLS (no TOLS al jugador) — por eso es un motivo más del combo de PAGO, no de
  // Depósito. Pedido de Federico: "Necesitamos agregar un motivo más... para el tipo 'pago'. Es todo lo
  // del tablero de control, así es que nos faltó la inscripción."
  const cuotaInscripcionActiva = Number(tableroMapa?.[campeonatoSel]?.cuotaInscripcion) || 0;

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

  // 103ª entrega: filas de "Torneos publicados" (jugadores con saldo negativo en el torneo elegido) —
  // se saca del JSX (donde vivía como un `const filas = ...` dentro del IIFE de renderizado) a un
  // `useMemo` propio, para poder mostrar "xx correos enviados de yy" en el renglón del combo sin
  // duplicar este cálculo.
  const filasSaldo = useMemo(() => {
    if (!fechaSaldoSel) return [];
    const torneo = estData?.torneos?.[campeonatoSel]?.[fechaSaldoSel];
    return directorioActivo
      .map((j) => {
        const jt = jugadorEnTorneo(torneo, j);
        const resultado = jt ? (Number(jt.premioTotal) || 0) - (Number(jt.debeTotal) || 0) : 0;
        return { jugador: j, alias: nombreCorto(j), resultado };
      })
      .filter((f) => f.resultado < 0)
      .sort((a, b) => a.resultado - b.resultado);
  }, [fechaSaldoSel, campeonatoSel, estData, directorioActivo]);
  const totalCorreosSaldo = filasSaldo.length;
  const enviadosSaldo = filasSaldo.filter((f) => data?.enviosSaldo?.[`${campeonatoSel}|${fechaSaldoSel}|${f.jugador.correo}`]).length;

  // 103ª/106ª entrega: "Corte de cobranza" — radiografía de TODOS los jugadores que participaron en el
  // torneo elegido (no solo los que deben, a diferencia de "Torneos publicados"). 106ª entrega: Federico
  // aclaró el criterio de fondo — el No. de Referencia es solo para identificar depósitos, nunca parte de
  // la deuda real — y pidió que esta tabla sea "un espejo del Resultado del Torneo": Deuda = -debeTotal,
  // Ganancia = premioTotal, Saldo = Ganancia + Deuda, exactamente igual que resultadoTorneo()/
  // jugadorEnTorneo() en vez del monto real registrado (que traía los centavos de referencia). `pagado`/
  // `depositado` se conservan solo para decidir el color de la celda de Saldo (ver estiloResultadoCorte()).
  const filasCorte = useMemo(() => {
    if (!fechaCorteSel) return [];
    const torneo = estData?.torneos?.[campeonatoSel]?.[fechaCorteSel];
    return directorioActivo
      .map((j) => {
        const jt = jugadorEnTorneo(torneo, j);
        if (!jt) return null;
        const debeTotal = Number(jt.debeTotal) || 0;
        const premioTotal = Number(jt.premioTotal) || 0;
        const clave = `${campeonatoSel}|${fechaCorteSel}|${j.correo}`;
        const regPago = data?.pagosTorneo?.[clave];
        const regDeposito = data?.depositosTorneo?.[clave];
        return {
          jugador: j,
          deuda: -debeTotal,
          ganancia: premioTotal,
          saldo: premioTotal - debeTotal,
          pagado: !!regPago,
          depositado: !!regDeposito,
        };
      })
      .filter(Boolean);
  }, [fechaCorteSel, campeonatoSel, estData, directorioActivo, data]);
  // 107ª entrega: rango de "Estatus" — rojo (debe, no pagó) primero, verde (debe, ya pagó) después, y
  // ganancia (cobra, depositado o no) siempre al final. Usado solo por el orden "estatus".
  function rangoEstatusCorte(f) {
    if (f.saldo < 0) return f.pagado ? 1 : 0;
    return 2;
  }
  // 106ª/107ª entrega: orden de la tabla — "ref" (de siempre), "estatus" (107ª entrega, ver
  // rangoEstatusCorte) o "saldo" (clickeando el encabezado de la columna, con dirección en
  // `corteSaldoDir`). El No. de Referencia ascendente es siempre el criterio de desempate.
  const filasCorteOrdenadas = useMemo(() => {
    const arr = [...filasCorte];
    const porRef = (a, b) => (Number(a.jugador.id) || 0) - (Number(b.jugador.id) || 0);
    if (corteOrden === "saldo") {
      arr.sort((a, b) => (corteSaldoDir === "asc" ? a.saldo - b.saldo : b.saldo - a.saldo) || porRef(a, b));
    } else if (corteOrden === "estatus") {
      arr.sort((a, b) => rangoEstatusCorte(a) - rangoEstatusCorte(b) || porRef(a, b));
    } else {
      arr.sort(porRef);
    }
    return arr;
  }, [filasCorte, corteOrden, corteSaldoDir]);
  // 107ª entrega: click en el encabezado "Saldo" — primer click deja el orden en "saldo" (descendente,
  // mismo criterio de primer-click que ya usa Clasificación General); un click más, estando ya en
  // "saldo", solo invierte la dirección.
  function ordenarCortePorSaldo() {
    if (corteOrden === "saldo") setCorteSaldoDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setCorteOrden("saldo");
      setCorteSaldoDir("desc");
    }
  }
  // 104ª entrega: Federico pidió que el color de Saldo se vea "intenso" en TODA la celda (antes era
  // un tinte pastel, "se veía como verde claro y rosa") — ahora el fondo es el color sólido y la letra se
  // pone clara (blanca) para que siga siendo legible encima. Misma regla de siempre: deuda (saldo<0)
  // → verde si ya se registró el Pago, rojo si no; ganancia (saldo>=0) → azul si ya se registró el
  // Depósito, blanco (con letra oscura, no blanca sobre blanco) si no.
  function estiloResultadoCorte(f) {
    if (f.saldo < 0) return f.pagado ? { background: "#1e7d32", color: "#fff" } : { background: "#c62828", color: "#fff" };
    return f.depositado ? { background: "#0277bd", color: "#fff" } : { background: "#ffffff", color: "#222" };
  }
  // 106ª entrega: exporta "Corte de cobranza" del torneo elegido a Excel, mismo patrón que
  // Estadisticas.jsx -> exportarExcel().
  function exportarCorteExcel() {
    if (!fechaCorteSel || !filasCorteOrdenadas.length) return;
    const filas = filasCorteOrdenadas.map((f) => ({
      "No. Ref.": refFmt(f.jugador.id),
      "Nombre y Apellido": f.jugador.nombre,
      "Alias PokerStars": nombreCorto(f.jugador),
      Deuda: f.deuda,
      Ganancia: f.ganancia,
      Saldo: f.saldo,
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Corte de cobranza");
    XLSX.writeFile(libro, `CorteCobranza_${fechaCorteSel}.xlsx`);
  }
  // 104ª entrega: "Copiar para WhatsApp" pasó de texto a IMAGEN — Federico: "el copiado de la tabla tiene
  // que ser formato imagen para subirlo al WhatsApp". html2canvas renderiza el <table> real (`corteRef`,
  // con sus colores de celda ya puestos) a un <canvas>, que se convierte a PNG y se manda al portapapeles
  // con la Clipboard API (`ClipboardItem`) — así se puede pegar directo en un chat de WhatsApp Web/
  // escritorio con Ctrl+V, igual que una captura de pantalla. Si el navegador no soporta escribir imágenes
  // al portapapeles desde JS (Firefox/Safari viejos), se descarga el PNG como respaldo para adjuntarlo a
  // mano.
  async function copiarCorteWhatsApp() {
    if (!corteRef.current) return;
    setCorteGenerando(true);
    setCorteAviso("");
    try {
      const canvas = await html2canvas(corteRef.current, { backgroundColor: "#ffffff", scale: 2 });
      canvas.toBlob(async (blob) => {
        setCorteGenerando(false);
        if (!blob) {
          setCorteAviso("No se pudo generar la imagen.");
          return;
        }
        const puedeClipboard = navigator.clipboard && typeof window.ClipboardItem === "function";
        if (puedeClipboard) {
          try {
            await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
            setCorteCopiado(true);
            setTimeout(() => setCorteCopiado(false), 2500);
            return;
          } catch (e) {
            // cae al respaldo de descarga más abajo
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `corte-cobranza-${fechaCorteSel}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setCorteAviso("Tu navegador no deja copiar la imagen directo — se descargó el PNG para que lo adjuntes a mano en WhatsApp.");
      }, "image/png");
    } catch (e) {
      setCorteGenerando(false);
      setCorteAviso("No se pudo generar la imagen de la tabla.");
    }
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
  // 87ª entrega: opción de "Inscripción" en el combo de motivo de un Pago — solo aparece si el Tablero
  // de Control tiene una cuota de inscripción configurada (> 0) para el campeonato activo y ese jugador
  // todavía no tiene una inscripción confirmada en este campeonato (mismo criterio que el resto de los
  // combos: un motivo ya confirmado no vuelve a aparecer, para no duplicar una confirmación ya hecha).
  const opcionInscripcionPago =
    nuevoMov?.tipo === "pago" &&
    nuevoMov.correo &&
    cuotaInscripcionActiva > 0 &&
    !data?.pagosInscripcion?.[`${campeonatoSel}|inscripcion|${nuevoMov.correo}`];
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
  if (nuevoMov?.tipo === "pago" && nuevoMov.motivo === "inscripcion") {
    // 87ª entrega: motivo nuevo — Cuota de inscripción, monto fijo definido en Tablero de Control, sin
    // torneo asociado.
    montoEsperadoMov = cuotaInscripcionActiva;
    etiquetaMotivoMov = "Inscripción";
  } else if (nuevoMov?.tipo === "pago" && nuevoMov.motivo?.startsWith("torneo:")) {
    // 89ª entrega: sin fecha — ver nota de homologación más abajo, junto al combo de Motivo.
    const fecha = nuevoMov.motivo.slice("torneo:".length);
    const entry = torneosSaldoOpciones.find((t) => t.fecha === fecha);
    montoEsperadoMov = Math.abs(resultadoTorneo(nuevoMov.correo, fecha));
    etiquetaMotivoMov = entry ? `Torneo ${etiquetaCorta(entry)}` : fecha;
  } else if (nuevoMov?.tipo === "deposito" && nuevoMov.motivo?.startsWith("torneo:")) {
    const fecha = nuevoMov.motivo.slice("torneo:".length);
    const entry = torneosSaldoOpciones.find((t) => t.fecha === fecha);
    montoEsperadoMov = Math.abs(resultadoTorneo(nuevoMov.correo, fecha));
    etiquetaMotivoMov = entry ? `Torneo ${etiquetaCorta(entry)}` : fecha;
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
    // 87ª entrega: motivo nuevo de Pago — Cuota de inscripción (sin torneo/fecha propia asociada).
    for (const [clave, reg] of Object.entries(data?.pagosInscripcion || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const [, , correo] = clave.split("|");
      filas.push({
        clave,
        tipo: "Pago",
        tipoAccion: "pago",
        motivoTipo: "inscripcion",
        motivoId: "inscripcion",
        motivo: "Inscripción",
        correo,
        ...reg,
      });
    }
    for (const [clave, reg] of Object.entries(data?.depositosTorneo || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const [, fechaTorneo, correo] = clave.split("|");
      const entry = numeracion[`${campeonatoSel}|${fechaTorneo}`];
      // 89ª entrega: sin fecha, igual que el Pago del mismo torneo (ver nota de homologación en el combo
      // de Motivo) — antes el mismo "Torneo 1" salía con fecha acá y sin fecha en pagosTorneo, pareciendo
      // dos motivos distintos. La fecha de CUÁNDO se depositó ya tiene su propia columna ("Registrado").
      filas.push({
        clave,
        tipo: "Depósito",
        tipoAccion: "deposito",
        motivoTipo: "torneo",
        motivoId: fechaTorneo,
        motivo: `Torneo ${entry ? etiquetaCorta(entry) : ""}`,
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

  // 81ª entrega: totales de "Pagos y depósitos confirmados", a pedido de Federico — arriba de la tabla
  // de detalle, agrupables por Motivo o por Fecha (toggle `agruparPor`). Separados en Pagos/Depósitos
  // (igual que MontoPorTipo, nunca mezclados en una sola suma) más un total general, siempre desde la
  // perspectiva de TOLS (Pago = ingreso, Depósito = egreso) — igual que el resto de esta tabla.
  const totalesConfirmados = useMemo(() => {
    const grupos = new Map();
    for (const c of confirmadosCampeonato) {
      const etiqueta = agruparPor === "fecha" ? (c.fecha ? fechaFmt(c.fecha) : "Sin fecha") : c.motivo;
      if (!grupos.has(etiqueta)) grupos.set(etiqueta, { pagos: 0, depositos: 0 });
      const g = grupos.get(etiqueta);
      if (c.tipo === "Pago") g.pagos += Number(c.monto) || 0;
      else g.depositos += Number(c.monto) || 0;
    }
    // 89ª entrega: columna "Balance" por cada registro/grupo de la tabla, a pedido de Federico — Pago
    // (ingreso para TOLS) menos Depósito (egreso), igual criterio de perspectiva que ya rige el resto de
    // esta tabla (Pago = verde/positivo, Depósito = rojo/negativo).
    const filas = Array.from(grupos.entries())
      .map(([etiqueta, g]) => ({ etiqueta, ...g, balance: g.pagos - g.depositos }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
    const total = filas.reduce(
      (acc, f) => ({ pagos: acc.pagos + f.pagos, depositos: acc.depositos + f.depositos }),
      { pagos: 0, depositos: 0 }
    );
    total.balance = total.pagos - total.depositos;
    return { filas, total };
  }, [confirmadosCampeonato, agruparPor]);

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
    } else if (editandoPago.motivoTipo === "inscripcion") {
      // 87ª entrega
      montoEsperadoEdicion = cuotaInscripcionActiva;
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
        // 87ª entrega: se manda `motivoTipo`/`motivoId` (igual que ya hace un Depósito) para que el
        // servidor sepa si esto va a `pagosTorneo` (motivoTipo "torneo", como siempre) o a
        // `pagosInscripcion` (motivoTipo "inscripcion", motivo nuevo) — `fecha` se sigue mandando para
        // el caso "torneo" por compatibilidad con el esquema de siempre.
        body = {
          accion: "registrarPago",
          campeonato: campeonatoSel,
          motivoTipo: editandoPago.motivoTipo,
          motivoId: editandoPago.motivoId,
          fecha: editandoPago.motivoTipo === "torneo" ? editandoPago.motivoId : undefined,
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
      setErrorMov("Elegí un motivo.");
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
        // 87ª entrega: `nuevoMov.motivo` ahora puede ser "torneo:{fecha}" (como antes, solo que con el
        // prefijo que ya usaba Depósito) o el motivo fijo nuevo "inscripcion".
        const esInscripcion = nuevoMov.motivo === "inscripcion";
        const fechaTorneo = esInscripcion ? "" : nuevoMov.motivo.slice("torneo:".length);
        body = {
          accion: "registrarPago",
          campeonato: campeonatoSel,
          motivoTipo: esInscripcion ? "inscripcion" : "torneo",
          motivoId: esInscripcion ? "inscripcion" : fechaTorneo,
          fecha: esInscripcion ? undefined : fechaTorneo,
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

  // 99ª entrega: arma el borrador de asunto/cuerpo de "Estado de cuenta" en texto plano, a partir de
  // `estadoCuentaJugador` (mismos valores/colores con signo desde la perspectiva del jugador que ya
  // muestra la tabla en pantalla — ver el comentario de la 81ª entrega más abajo). El Tesorero puede
  // editar este texto a mano antes de mandarlo; plantillaEstadoCuenta() en el servidor solo le pone el
  // "sobre" visual del correo alrededor de los párrafos (separados por línea en blanco).
  function abrirEnviarEstado() {
    if (!correoEstado || !r) return;
    const nombreJug = r.nombre || nombreCorto({ correo: correoEstado }) || correoEstado;
    const lineas = estadoCuentaJugador.map((f) => {
      const fecha = f.fechaOrden ? fechaFmt(f.fechaOrden) : "—";
      const montoJugador = -f.montoFirmado; // perspectiva del jugador (81ª entrega): negado desde TOLS
      return `${fecha} — ${f.tipo} (${f.motivo}): ${moneyContable(montoJugador)} → saldo ${moneyContable(-f.saldoFinal)}`;
    });
    const saldoFinal = estadoCuentaJugador.length
      ? -estadoCuentaJugador[estadoCuentaJugador.length - 1].saldoFinal
      : 0;
    const cuerpo = [
      `Hola ${nombreJug}, este es tu estado de cuenta en TOLS 3.0 (campeonato ${campeonatoSel}).`,
      lineas.length ? lineas.join("\n") : "Todavía no hay pagos ni depósitos confirmados para este campeonato.",
      `Saldo actual: ${moneyContable(saldoFinal)}${saldoFinal < 0 ? " (lo que pagaste de más, a tu favor)" : saldoFinal > 0 ? " (lo que nos falta cobrarte)" : ""}.`,
    ].join("\n\n");
    setErrorEnviarEstado("");
    setAvisoEnviarEstado("");
    setEnviarEstadoModal({
      correo: correoEstado,
      nombre: nombreJug,
      asunto: `Estado de cuenta - TOLS 3.0`,
      cuerpo,
    });
  }

  async function enviarEstadoCuenta() {
    if (!enviarEstadoModal) return;
    if (!enviarEstadoModal.asunto.trim() || !enviarEstadoModal.cuerpo.trim()) {
      setErrorEnviarEstado("El asunto y el cuerpo del correo no pueden quedar vacíos.");
      return;
    }
    setEnviandoEstado(true);
    setErrorEnviarEstado("");
    try {
      const r2 = await fetch(API_ENVIAR_ESTADO, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          correo: enviarEstadoModal.correo,
          asunto: enviarEstadoModal.asunto,
          cuerpo: enviarEstadoModal.cuerpo,
        }),
      });
      const json = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(json.error || "No se pudo enviar el correo.");
      setEnviarEstadoModal(null);
      setAvisoEnviarEstado(`Correo enviado a ${enviarEstadoModal.nombre}.`);
    } catch (e) {
      setErrorEnviarEstado(e.message || "No se pudo enviar el correo.");
    } finally {
      setEnviandoEstado(false);
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
  const adeudaJugador = correoEstado ? data?.adeudos?.[correoEstado] : false;

  // 76ª entrega: totales de pagos/depósitos ya CONFIRMADOS por el Tesorero (los 3 mapas nuevos) —
  // desde la 96ª/97ª entrega, son la base de TODA "Finanzas generales" (ver más abajo), no solo de
  // "Estado de cuenta".
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

  const totalPagosConfirmados = sumaMapaConfirmado(data?.pagosTorneo);

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

  // 97ª entrega: "Finanzas generales" se vuelve a rediseñar, esta vez para calzar EXACTO con el Excel
  // que Federico adjuntó (hoja "Finanzas") — reemplaza el diseño de la 96ª entrega (3 cuadros + "Otros
  // ingresos" + "Gastos operativos" sobre depósitos confirmados + "Finanzas por categoría" con Buy-in/
  // Re-buys/Add-on, que no existe en el Excel y se eliminó). Sigue calculando todo sobre los mismos
  // mapas REALMENTE confirmados por el Tesorero (pagosTorneo/depositosTorneo/depositosGasto/
  // pagosInscripcion) y los montos que ya calcula Estadísticas por jugador y torneo — ver respuestas de
  // Federico a las 7 preguntas de aclaración (quedan documentadas en el mapa del proyecto, sección de
  // esta entrega) para el detalle de cada fórmula.

  // Inscripciones confirmadas (separadas de "Ingresos confirmados (pagos)" — ver más abajo, "Subtotal
  // ingresos" las vuelve a sumar junto con los pagos de torneo).
  const totalInscripcionesConfirmadas = sumaMapaConfirmado(data?.pagosInscripcion);

  // Ingresos confirmados (pagos) por tipo de torneo — Federico pidió mostrarlos por separado
  // ("torneos regulares" / "torneos main", como en el Excel).
  function totalPagosTorneoPorTipo() {
    const result = { Regular: 0, Main: 0 };
    const prefijo = `${campeonatoSel}|`;
    for (const [clave, reg] of Object.entries(data?.pagosTorneo || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const partes = clave.split("|");
      const fecha = partes[1];
      const torneo = estData?.torneos?.[campeonatoSel]?.[fecha];
      if (!torneo) continue;
      const tipo = torneo.tipo === "Main" ? "Main" : "Regular";
      result[tipo] += Number(reg.monto) || 0;
    }
    return result;
  }
  const { Regular: totalPagosRegular, Main: totalPagosMain } = totalPagosTorneoPorTipo();

  // Respuestas de Federico (preguntas 1 y 2): el 15% (Provisión para el acumulado) y el 85%
  // (Disponible para repartir) se calculan SOLO sobre pagos de torneos (regulares + main) — excluyen la
  // inscripción. `totalPagosConfirmados` (arriba, "Estado de cuenta") ya suma exactamente eso (todo
  // `pagosTorneo` del campeonato, sin tocar `pagosInscripcion`), así que no cambia la fórmula del fondo
  // reservado, ya estaba bien desde la 96ª entrega — solo se agrega "Disponible (85%)" como el
  // complemento, para mostrarlo en la vista.
  const pctAcumuladoActivo = Number(tableroMapa?.[campeonatoSel]?.premios?.porTorneo?.pctAcumulado) || 0;
  const fondoAcumuladoReservado = (totalPagosConfirmados * pctAcumuladoActivo) / 100; // "Provisión 15%"
  const disponiblePagosTorneo = totalPagosConfirmados - fondoAcumuladoReservado; // "Disponible (85%)"

  // "Subtotal ingresos" del Excel (A6: =B2+B4, pero en el archivo de Federico faltaba sumar B5/torneos
  // main — ejemplo en el que Main daba $0, así que el faltante no se notaba; acá se suma siempre).
  const subtotalIngresos = totalInscripcionesConfirmadas + totalPagosRegular + totalPagosMain;

  // Gastos operativos: a diferencia de la 96ª entrega (que mostraba lo ya DEPOSITADO y confirmado por
  // concepto), Federico aclaró (pregunta 3) que esto es el PRESUPUESTO fijo configurado en el Tablero de
  // Control (`gastosCampeonato` — Tesorero/Hosting fijos, Pulsera puede variar), no lo efectivamente
  // depositado — por eso ahora usa `g.monto` (el presupuesto) en vez de un total confirmado.
  const gastosOperativos = gastosCampeonatoActivo.map((g) => ({ concepto: g.concepto, total: Number(g.monto) || 0 }));
  const totalGastosOperativos = gastosOperativos.reduce((s, g) => s + g.total, 0);

  // Depósitos por premios de torneo (egresos), separados por tipo (Regular/Main) y por posición —
  // 1º/2º/3er lugar (cualquier otro lugar pagado cae en "otros", para no esconder dinero si el Tablero
  // llegara a configurar más de 3 lugares). Para Main, además de la posición se desglosan los dos bonos
  // fijos del torneo (burbuja / mejor mano) — Federico confirmó (pregunta 6) que esto YA se calcula bien
  // server-side (Estadísticas descuenta primero los 2 fijos y reparte el resto por %), así que acá solo
  // se re-categoriza lo que ya viene calculado por jugador, ahora separando el "lugar" del Main por
  // posición igual que en los torneos regulares (antes se juntaba todo en un solo cuadro).
  function categoriasDepositosTorneo() {
    const regular = { 1: 0, 2: 0, 3: 0, otros: 0 };
    const main = { 1: 0, 2: 0, 3: 0, otros: 0, burbuja: 0, mano: 0 };
    const prefijo = `${campeonatoSel}|`;
    for (const [clave, reg] of Object.entries(data?.depositosTorneo || {})) {
      if (!clave.startsWith(prefijo)) continue;
      const partes = clave.split("|");
      const fecha = partes[1];
      const correo = partes[partes.length - 1];
      const torneo = estData?.torneos?.[campeonatoSel]?.[fecha];
      const j = torneo ? jugadorEnTorneo(torneo, { correo }) : null;
      if (!j || !torneo) continue;
      const lugar = Number(j.lugar) || 0;
      const premioLugar = Number(j.premioLugar) || 0;
      const bucket = torneo.tipo === "Main" ? main : regular;
      if (lugar === 1) bucket[1] += premioLugar;
      else if (lugar === 2) bucket[2] += premioLugar;
      else if (lugar === 3) bucket[3] += premioLugar;
      else bucket.otros += premioLugar;
      if (torneo.tipo === "Main") {
        main.burbuja += Number(j.premioBurbuja) || 0;
        main.mano += Number(j.premioMano) || 0;
      }
    }
    return { regular, main };
  }
  const { regular: catPremiosRegular, main: catPremiosMain } = categoriasDepositosTorneo();
  const subtotalEgresosRegular = catPremiosRegular[1] + catPremiosRegular[2] + catPremiosRegular[3] + catPremiosRegular.otros;
  const subtotalEgresosMain =
    catPremiosMain[1] + catPremiosMain[2] + catPremiosMain[3] + catPremiosMain.otros + catPremiosMain.burbuja + catPremiosMain.mano;
  const subtotalEgresos = subtotalEgresosRegular + subtotalEgresosMain; // premios de torneo YA depositados/confirmados

  // "BALANCE GENERAL" / "Existente en la cuenta de banco" del Excel: en el archivo de Federico son
  // literalmente la misma fórmula (B23 y E17 ambas =B6+B21) — acá también se calculan una sola vez.
  const balanceGeneral = subtotalIngresos - subtotalEgresos;

  // Acum. Campeonato (al momento): el % por lugar configurado en el Tablero de Control
  // (premios.porCampeonato.lugares, incluye "Rey Killer" como un lugar más con su propio %) aplicado
  // sobre la Provisión del 15% ya reservada — pregunta 5 de Federico ("lo debe calcular automáticamente
  // el sitio, para validar la cuenta de banco"). Es el monto RESERVADO por lugar, no todavía un pago
  // confirmado (sigue sin existir una forma de registrar el pago real de este premio — ver nota al pie).
  const premiosCampeonatoConfig = tableroMapa?.[campeonatoSel]?.premios?.porCampeonato?.lugares || [];
  const acumCampeonatoPorLugar = premiosCampeonatoConfig.map((l) => ({
    label: l.label,
    reyKiller: Boolean(l.reyKiller),
    monto: (fondoAcumuladoReservado * (Number(l.pct) || 0)) / 100,
  }));
  const acumCampeonatoAlMomento = acumCampeonatoPorLugar.reduce((s, l) => s + l.monto, 0);

  // Centavos acumulados: Federico confirmó (pregunta 4) que se muestra en positivo (es un ingreso extra
  // a favor de TOLS, no un pasivo) — mismo cálculo que ya existía desde la 78ª entrega
  // (`centavosAcumuladosCampeonato()`/`centavosAcumulados`, definidos más arriba, no se repiten acá).

  // Validación de cuenta de banco (pregunta 5): "Existente en la cuenta de banco" (=balanceGeneral,
  // dinero real que ya entró y salió) menos lo que todavía hay que reservar (Provisión 15%) y los
  // gastos operativos presupuestados que todavía están pendientes de pagar — el remanente ("Diff") es
  // lo que debería quedar libre si se pagara todo lo pendiente ahora mismo.
  const reservarAcum = -fondoAcumuladoReservado;
  const gastosPendientes = -totalGastosOperativos;
  const diffCuenta = balanceGeneral + reservarAcum + gastosPendientes;

  const hoy = new Date();
  const fechaHoyStr = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Cobranza</h1>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {/* 103ª entrega: el combo de campeonato sube un renglón arriba de los botones, a la extrema derecha. */}
      <div className="filtro-estatus" style={{ display: "flex", marginTop: 20 }}>
        <select className="field" style={{ maxWidth: 220, marginLeft: "auto" }} value={campeonatoSel} onChange={(e) => setCampeonatoSel(e.target.value)}>
          {campeonatos.nombres.map((n) => (
            <option key={n} value={n}>
              {n}
              {n === campeonatos.activo ? " (activo)" : ""}
            </option>
          ))}
        </select>
      </div>
      {/* 106ª entrega: flexWrap para que los 5 botones bajen de renglón en vez de desbordar o cortarse
          en una laptop angosta (el body tiene overflow-x: hidden a propósito, así que lo que no entra se
          recorta, no se puede "hacer scroll" para verlo). */}
      <div className="filtro-estatus" style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {[
          ["resultado", "Enviar correos con deudas"],
          ["corte", "Corte de cobranza"],
          ["movimientos", "Registrar pagos y depósitos"],
          ["estado", "Estado de cuenta"],
          // 95ª entrega: "Finanzas generales" se reactivó a pedido de Federico (inhabilitada
          // temporalmente desde la 82ª entrega) — vuelve a ser un botón normal, sin deshabilitar.
          ["finanzas", "Finanzas generales"],
        ].map(([key, label, inhabilitado]) => (
          <button
            key={key}
            className={"btn btn-secondary btn-filtro" + (vista === key ? " active" : "")}
            disabled={inhabilitado}
            title={inhabilitado ? "Temporalmente inhabilitado" : undefined}
            onClick={() => !inhabilitado && setVista(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === "resultado" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Torneos publicados</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <select
              className="field"
              style={{ maxWidth: 280 }}
              value={fechaSaldoSel}
              onChange={(e) => {
                setFechaSaldoSel(e.target.value);
                setSeleccionSaldo(new Set());
                setEnvioSaldoAviso("");
                setFechaLimiteSaldo(viernesSemanaActualTexto());
              }}
            >
              <option value="">— elegir torneo —</option>
              {torneosSaldoOpciones.map((t) => (
                <option key={t.fecha} value={t.fecha}>
                  {etiquetaCorta(t)} ({fechaFmt(t.fecha)})
                </option>
              ))}
            </select>

            {/* 103ª entrega: aviso de cuántos correos de "Saldo Torneo" ya se enviaron para el torneo
                elegido — triángulo de warning si todavía falta alguno. 104ª entrega: palomita verde en vez
                del triángulo cuando ya se envió el 100%. */}
            {fechaSaldoSel && totalCorreosSaldo > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                {enviadosSaldo < totalCorreosSaldo ? (
                  <span style={{ fontSize: 16 }} title="Todavía no se enviaron todos los correos">⚠️</span>
                ) : (
                  <span style={{ fontSize: 16 }} title="Ya se enviaron todos los correos">✅</span>
                )}
                <span>{enviadosSaldo} correos enviados de {totalCorreosSaldo}</span>
              </span>
            )}

            {/* 103ª entrega: fecha límite editable para el cuerpo del correo — default el viernes de la
                semana en curso, a la derecha del mismo renglón. */}
            {fechaSaldoSel && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 12.5, color: "#667", whiteSpace: "nowrap" }}>Fecha límite:</label>
                <input
                  className="field"
                  style={{ maxWidth: 200 }}
                  value={fechaLimiteSaldo}
                  onChange={(e) => setFechaLimiteSaldo(e.target.value)}
                  placeholder="viernes xx de mmmm"
                />
              </div>
            )}
          </div>

          {torneosSaldoOpciones.length === 0 && (
            <p className="section-sub">Todavía no hay torneos publicados en Estadísticas para el campeonato ({campeonatoSel}).</p>
          )}
          {!fechaSaldoSel && torneosSaldoOpciones.length > 0 && (
            <p className="section-sub">Elegí un torneo ya publicado para ver los jugadores con saldo negativo.</p>
          )}

          {fechaSaldoSel && (() => {
            const entry = torneosSaldoOpciones.find((t) => t.fecha === fechaSaldoSel);
            const etiquetaSel = etiquetaCorta(entry);
            const filas = filasSaldo;

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
                      fechaLimite: fechaLimiteSaldo,
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
                    {/* 106ª entrega: homologado a "Saldo" (mismo nombre que usan Estadísticas/Corte de
                        cobranza), el valor sigue siendo Ganancia + Deuda de siempre. */}
                    <div>Saldo</div>
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

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {editable && (
                    <button className="btn btn-primary" disabled={enviandoSaldo || seleccionSaldo.size === 0} onClick={enviarSeleccionados}>
                      {enviandoSaldo ? "Enviando…" : `Enviar correo de saldo (${seleccionSaldo.size})`}
                    </button>
                  )}
                  {/* 106ª entrega: exportar a Excel, mismo patrón que "Corte de cobranza". */}
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const hoja = XLSX.utils.json_to_sheet(
                        filas.map((f) => ({ "Alias PokerStars": f.alias, Saldo: f.resultado }))
                      );
                      const libro = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(libro, hoja, "Torneos publicados");
                      XLSX.writeFile(libro, `TorneosPublicados_${fechaSaldoSel}.xlsx`);
                    }}
                  >
                    ⬇️ Exportar a Excel
                  </button>
                </div>
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

      {vista === "corte" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Corte de cobranza</div>
          </div>
          <select
            className="field"
            style={{ maxWidth: 280 }}
            value={fechaCorteSel}
            onChange={(e) => {
              setFechaCorteSel(e.target.value);
              setCorteCopiado(false);
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
          {!fechaCorteSel && torneosSaldoOpciones.length > 0 && (
            <p className="section-sub">Elegí un torneo ya publicado para ver la radiografía de cobranza.</p>
          )}

          {fechaCorteSel && (
            filasCorte.length === 0 ? (
              <p className="section-sub">Ningún jugador del directorio activo participó en ese torneo.</p>
            ) : (
              <>
                <div style={{ marginTop: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary" disabled={corteGenerando} onClick={copiarCorteWhatsApp}>
                    {corteGenerando ? "Generando imagen…" : "📋 Copiar imagen para WhatsApp"}
                  </button>
                  <button className="btn btn-secondary" onClick={exportarCorteExcel}>⬇️ Exportar a Excel</button>
                  {/* 106ª/107ª entrega: ordenar la tabla por No. de Referencia o por Estatus (reemplaza al
                      botón "Saldo" de la 106ª entrega — ordenar por Saldo ahora se hace clickeando el
                      propio encabezado de esa columna, como en Clasificación General). */}
                  <span style={{ fontSize: 12.5, color: "#667" }}>Ordenar por:</span>
                  <button
                    className={"btn btn-secondary" + (corteOrden === "ref" ? " active" : "")}
                    onClick={() => setCorteOrden("ref")}
                  >
                    No. de Referencia
                  </button>
                  <button
                    className={"btn btn-secondary" + (corteOrden === "estatus" ? " active" : "")}
                    onClick={() => setCorteOrden("estatus")}
                  >
                    Estatus
                  </button>
                  {corteCopiado && <span className="check-line check-ok">Copiado ✓</span>}
                  {corteAviso && <span className="section-sub" style={{ margin: 0 }}>{corteAviso}</span>}
                </div>
                {/* 104ª entrega: tabla cuadriculada real (mismo patrón que "Clasificación general" de
                    Estadísticas — <table>/<th>/<td> con border 1px en cada celda), no el grid de
                    .tbl/.trow de siempre (que solo tiene línea entre renglones, sin cuadrícula vertical).
                    `corteRef` es justo este <table> — lo que html2canvas convierte a imagen. 106ª entrega:
                    "Resultado" homologado a "Saldo", y la tabla puede desbordar horizontalmente si la
                    pantalla es angosta (overflowX: auto) en vez de forzar scroll lateral de toda la página. */}
                <div style={{ overflowX: "auto" }}>
                  <table ref={corteRef} style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0 12px", fontSize: 14, background: "#fff" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>No. Ref.</th>
                        <th style={{ textAlign: "left", border: "1px solid #ccc", padding: "6px 8px" }}>Nombre y Apellido</th>
                        <th style={{ textAlign: "left", border: "1px solid #ccc", padding: "6px 8px" }}>Alias PokerStars</th>
                        <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Deuda</th>
                        <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Ganancia</th>
                        {/* 107ª entrega: encabezado clickeable para ordenar por Saldo (asc/desc), igual que
                            Clasificación General — el No. de Referencia sigue siendo el desempate, nunca se
                            pierde el orden secundario. */}
                        <th
                          style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                          onClick={ordenarCortePorSaldo}
                        >
                          Saldo{corteOrden === "saldo" ? (corteSaldoDir === "desc" ? " ▼" : " ▲") : ""}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasCorteOrdenadas.map((f) => (
                        <tr key={f.jugador.correo}>
                          <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px" }}>{refFmt(f.jugador.id)}</td>
                          <td style={{ border: "1px solid #eee", padding: "6px 8px" }}>{f.jugador.nombre}</td>
                          <td style={{ border: "1px solid #eee", padding: "6px 8px" }}>{nombreCorto(f.jugador)}</td>
                          <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px" }}>
                            <Monto valor={f.deuda} />
                          </td>
                          <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px" }}>
                            <Monto valor={f.ganancia} />
                          </td>
                          <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", fontWeight: 700, ...estiloResultadoCorte(f) }}>
                            {textoSaldoCorte(f)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="section-sub" style={{ marginTop: 10 }}>
                  Saldo: verde = debe y ya pagó · rojo = debe y todavía no · azul = cobra y ya se le
                  depositó · blanco = cobra y todavía no se le depositó.
                </p>
              </>
            )
          )}
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
                    setNuevoMov({ tipo: "pago", correo: "", motivo: "", montoReal: "", fechaReal: "" });
                    setErrorMov("");
                    setAvisoDatosCuenta("");
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
                        onChange={(e) => {
                          setNuevoMov({ ...nuevoMov, tipo: e.target.value, motivo: "" });
                          setAvisoDatosCuenta("");
                        }}
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
                        onChange={(e) => {
                          setNuevoMov({ ...nuevoMov, correo: e.target.value, motivo: "" });
                          setAvisoDatosCuenta("");
                        }}
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

                  {/* 89ª entrega: datos de cuenta de cobro del jugador, solo para un Depósito (TOLS →
                      jugador) — Federico: "despliega los datos de cuenta, tipo y banco del jugador a
                      depositar. Si están incompletos, que aparezca un botón para... mandarle un correo...
                      solicitando los datos". */}
                  {jugadorDepositoSel && (
                    <div className="login-field-row" style={{ alignItems: "flex-start" }}>
                      <div className="login-field" style={{ flex: 2 }}>
                        <label>Datos de cuenta de {nombreCorto(jugadorDepositoSel)}</label>
                        {datosCuentaCompletos ? (
                          <div className="section-sub" style={{ marginTop: 2 }}>
                            {jugadorDepositoSel.tipoCuenta} — {jugadorDepositoSel.cuenta} — {jugadorDepositoSel.banco}
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                            <span className="login-error" style={{ margin: 0 }}>
                              Faltan sus datos de cuenta — no se le podrá depositar hasta que los complete.
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={solicitandoDatosCuenta}
                              onClick={solicitarDatosCuenta}
                            >
                              {solicitandoDatosCuenta ? "Enviando…" : "Solicitar datos por correo"}
                            </button>
                          </div>
                        )}
                        {avisoDatosCuenta && (
                          <div
                            className={avisoDatosCuenta.includes("No se pudo") ? "login-error" : "check-line check-ok"}
                            style={{ marginTop: 6 }}
                          >
                            {avisoDatosCuenta}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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
                        {nuevoMov.tipo === "pago" && (
                          <>
                            {/* 89ª entrega: sin fecha — a pedido de Federico, el mismo torneo (ej. "Torneo
                                1") aparecía con fecha para un Depósito y sin fecha para un Pago, dando la
                                impresión de ser dos cosas distintas. Se homologó para que ningún motivo de
                                torneo muestre fecha al registrarlo (la fecha de cuándo se recibió/depositó
                                ya tiene su propio campo más abajo). */}
                            {opcionesPago.map((t) => (
                              <option key={`torneo:${t.fecha}`} value={`torneo:${t.fecha}`}>
                                Torneo {etiquetaCorta(t)}
                              </option>
                            ))}
                            {/* 87ª entrega: motivo nuevo — Cuota de inscripción (Tablero de Control) */}
                            {opcionInscripcionPago && <option value="inscripcion">Inscripción</option>}
                          </>
                        )}
                        {nuevoMov.tipo === "deposito" && (
                          <>
                            {opcionesDepositoTorneo.map((t) => (
                              <option key={`torneo:${t.fecha}`} value={`torneo:${t.fecha}`}>
                                Torneo {etiquetaCorta(t)}
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
                        opcionesPago.length === 0 &&
                        !opcionInscripcionPago && (
                          <div className="section-sub" style={{ marginTop: 4 }}>
                            No hay pagos pendientes de confirmar para este jugador.
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
                          {/* 81ª entrega: sin el "0" fijo (se guarda como texto, no como número, para que
                              el recuadro arranque vacío de verdad), sin flechitas (.field-no-spin) y
                              admitiendo decimales (step="0.01") — a pedido de Federico. */}
                          <input
                            className="field field-no-spin"
                            type="number"
                            step="0.01"
                            min={0}
                            value={nuevoMov.montoReal}
                            onChange={(e) => setNuevoMov({ ...nuevoMov, montoReal: e.target.value })}
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
                    <button
                      className="btn btn-secondary"
                      disabled={guardandoMov}
                      onClick={() => {
                        setNuevoMov(null);
                        setErrorMov("");
                        setAvisoDatosCuenta("");
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="section-sub" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Pagos y depósitos confirmados</span>
            <span style={{ marginLeft: "auto" }}>Agrupar totales por:</span>
            <button
              className={"btn btn-secondary btn-filtro" + (agruparPor === "motivo" ? " active" : "")}
              onClick={() => setAgruparPor("motivo")}
            >
              Motivo
            </button>
            <button
              className={"btn btn-secondary btn-filtro" + (agruparPor === "fecha" ? " active" : "")}
              onClick={() => setAgruparPor("fecha")}
            >
              Fecha
            </button>
          </div>
          {/* 81ª entrega: totales de "Pagos y depósitos confirmados", arriba de la tabla de detalle,
              agrupados por Motivo o Fecha (toggle de arriba) — Pagos y Depósitos separados (nunca
              mezclados en una sola suma), más un total general. Perspectiva de TOLS, como el resto de
              esta tabla: Pago = ingreso (verde), Depósito = egreso (rojo). */}
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 16px", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", border: "1px solid #ccc", padding: "6px 8px" }}>
                  {agruparPor === "fecha" ? "Fecha" : "Motivo"}
                </th>
                <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", whiteSpace: "nowrap" }}>Total Pagos</th>
                <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", whiteSpace: "nowrap" }}>Total Depósitos</th>
                {/* 89ª entrega: columna Balance (Pago − Depósito), a pedido de Federico. */}
                <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", whiteSpace: "nowrap" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {totalesConfirmados.filas.map((f) => (
                <tr key={f.etiqueta}>
                  <td style={{ border: "1px solid #eee", padding: "6px 8px" }}>{f.etiqueta}</td>
                  <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={f.pagos} /></td>
                  <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={f.depositos} forzarNegativo /></td>
                  <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={f.balance} /></td>
                </tr>
              ))}
              {totalesConfirmados.filas.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", border: "1px solid #eee", padding: 12, color: "var(--ink-soft)" }}>
                    Sin datos.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: "bold" }}>
                <td style={{ border: "1px solid #ccc", padding: "6px 8px" }}>Total general</td>
                <td style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={totalesConfirmados.total.pagos} /></td>
                <td style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={totalesConfirmados.total.depositos} forzarNegativo /></td>
                <td style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={totalesConfirmados.total.balance} /></td>
              </tr>
            </tfoot>
          </table>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: "1.3fr 0.6fr 1fr 1.1fr 1.1fr 0.9fr 40px" }}>
              <div>Jugador</div><div>Tipo</div><div>Motivo</div><div>Esperado</div><div>Real</div><div>Registrado</div><div />
            </div>
            {confirmadosCampeonato.map((c) =>
              editandoPago?.clave === c.clave ? (
                <div
                  key={c.clave}
                  style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: "12px", borderBottom: "1px solid #eee" }}
                >
                  <div style={{ minWidth: 200, alignSelf: "center" }}>
                    <div>{aliasDeCorreo(c.correo)}</div>
                    <div className="section-sub" style={{ marginTop: 2 }}>{c.tipo} — {c.motivo}</div>
                  </div>
                  <div className="login-field" style={{ maxWidth: 160 }}>
                    <label>Monto esperado</label>
                    <input className="field" value={money(montoEsperadoEdicion)} disabled readOnly />
                  </div>
                  <div className="login-field" style={{ maxWidth: 160 }}>
                    <label>Monto real</label>
                    <input
                      className="field field-no-spin"
                      type="number"
                      step="0.01"
                      min={0}
                      value={editandoPago.monto}
                      onChange={(e) => setEditandoPago({ ...editandoPago, monto: e.target.value })}
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
                <div className="trow" style={{ gridTemplateColumns: "1.3fr 0.6fr 1fr 1.1fr 1.1fr 0.9fr 40px" }} key={c.clave}>
                  <div>{aliasDeCorreo(c.correo)}</div>
                  {/* 81ª entrega: "Tipo" sin óvalo/badge, texto normal, a pedido de Federico. */}
                  <div>{c.tipo}</div>
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
        </div>
      )}

      {vista === "estado" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Estado de cuenta</div>
            {/* 99ª entrega: "Agrega un botón para poder enviar el estado de cuenta por correo al jugador
                seleccionado" — a pedido de Federico. Solo se habilita con un jugador elegido en el combo
                de abajo; abre un modal con un borrador editable antes de mandar nada. */}
            {correoEstado && (
              <button className="btn btn-secondary" onClick={abrirEnviarEstado}>
                ✉ Enviar por correo
              </button>
            )}
          </div>
          {/* 80ª entrega: combo por Alias PokerStars, mismo criterio que los demás combos de la pantalla
              (ej. "Jugador" en "Registrar pagos y depósitos") — antes este combo mostraba nombre+correo,
              distinto al resto. */}
          <select
            className="field"
            style={{ maxWidth: 320 }}
            value={correoEstado}
            onChange={(e) => {
              setCorreoEstado(e.target.value);
              setAvisoEnviarEstado("");
            }}
          >
            <option value="">— elegir jugador —</option>
            {directorioActivo.map((j) => (
              <option key={j.correo} value={j.correo}>
                {nombreCorto(j)} (#{j.id})
              </option>
            ))}
          </select>
          {avisoEnviarEstado && (
            <p className="section-sub" style={{ color: "var(--ok, #2e7d32)", marginTop: 8 }}>{avisoEnviarEstado}</p>
          )}

          {correoEstado && (
            <>
              {r && adeudaJugador && (
                <div className="campeonato-banner campeonato-banner-alerta campeonato-banner-row" style={{ marginTop: 20 }}>
                  <span>⚠ Tiene un adeudo pendiente — no está habilitado para el próximo torneo ({data.proximaFecha}).</span>
                  {editable && (
                    <button className="btn btn-secondary" onClick={() => setExcepcionModal({ correo: r.correo, nombre: r.nombre })}>
                      Aprobar excepción
                    </button>
                  )}
                </div>
              )}

              {/* 79ª/80ª entrega: "Estado de cuenta" — saldo corrido de los Pagos/Depósitos ya
                  confirmados de este jugador en el campeonato activo, a pedido de Federico. Es la ÚNICA
                  tabla de la pantalla (se quitaron los stat tiles, la edición de cuenta/banco y el
                  historial viejo de Debe/Ganó que vivían acá antes) y usa el mismo formato de tabla
                  cuadriculada (sin óvalos/badges) que ya usan Calendario/Estadísticas.
                  81ª entrega: a diferencia de "Pagos y depósitos confirmados"/"Finanzas generales" (que
                  son reportes PARA TOLS — Pago = ingreso = verde, Depósito = egreso = rojo), "Estado de
                  cuenta" es el reporte de un jugador puntual, así que el color/signo acá se interpreta
                  DESDE SU perspectiva: un Pago le cuesta (rojo) y un Depósito es un ingreso para él
                  (verde) — exactamente lo opuesto. `estadoCuentaJugador` sigue calculando el saldo desde
                  la perspectiva de TOLS (sin tocar esa lógica, que también alimenta otras cuentas), así
                  que acá simplemente se niega el signo al mostrarlo — <Monto/> ya colorea por el signo
                  del valor que recibe, no hace falta un componente nuevo. */}
              <p className="section-sub" style={{ marginTop: 8 }}>
                Montos y saldo desde la perspectiva de {r?.nombre || "el jugador"}: lo que paga es un costo
                (rojo) y lo que recibe es un ingreso para él (verde).
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 12px", fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Fecha</th>
                    <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Tipo</th>
                    <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Motivo</th>
                    <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Saldo inicial</th>
                    <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Monto</th>
                    <th style={{ textAlign: "center", border: "1px solid #ccc", padding: "6px 8px" }}>Saldo final</th>
                  </tr>
                </thead>
                <tbody>
                  {estadoCuentaJugador.map((f) => (
                    <tr key={f.clave}>
                      <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px" }}>{f.fechaOrden ? fechaFmt(f.fechaOrden) : "—"}</td>
                      <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px" }}>{f.tipo}</td>
                      <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px" }}>{f.motivo}</td>
                      <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={-f.saldoInicial} /></td>
                      <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={-f.montoFirmado} /></td>
                      <td style={{ textAlign: "center", border: "1px solid #eee", padding: "6px 8px", whiteSpace: "nowrap" }}><Monto valor={-f.saldoFinal} /></td>
                    </tr>
                  ))}
                  {estadoCuentaJugador.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", border: "1px solid #eee", padding: 16, color: "var(--ink-soft)" }}>
                        Todavía no hay pagos ni depósitos confirmados para este jugador en este campeonato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {vista === "finanzas" && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Finanzas Generales (al {fechaHoyStr})</div>
          </div>

          <div className="finanzas-cols">
            {/* ───────── columna izquierda: INGRESOS / EGRESOS ───────── */}
            <div>
              <TablaFin>
                <FilaSeccionFin label="Ingresos" />
                <FilaFin label="Inscripciones reales"><Monto valor={totalInscripcionesConfirmadas} /></FilaFin>
                <FilaFin label="Ingresos confirmados — torneos regulares"><Monto valor={totalPagosRegular} /></FilaFin>
                <FilaFin label="Ingresos confirmados — torneos main"><Monto valor={totalPagosMain} /></FilaFin>
                <FilaFin label="Subtotal ingresos" bold><Monto valor={subtotalIngresos} /></FilaFin>
                <FilaFin label="Provisión para acum. Camp. (15%)"><Monto valor={fondoAcumuladoReservado} forzarNegativo /></FilaFin>

                <FilaSeccionFin label="Egresos" />
                <FilaFin label="Disponible (85%)"><Monto valor={disponiblePagosTorneo} /></FilaFin>

                <FilaFin label="Torneos regulares — 1er lugar" sangria><Monto valor={catPremiosRegular[1]} forzarNegativo /></FilaFin>
                <FilaFin label="Torneos regulares — 2do lugar" sangria><Monto valor={catPremiosRegular[2]} forzarNegativo /></FilaFin>
                <FilaFin label="Torneos regulares — 3er lugar" sangria><Monto valor={catPremiosRegular[3]} forzarNegativo /></FilaFin>
                {catPremiosRegular.otros > 0 && (
                  <FilaFin label="Torneos regulares — otros lugares pagados" sangria>
                    <Monto valor={catPremiosRegular.otros} forzarNegativo />
                  </FilaFin>
                )}

                <FilaFin label="Torneos main — 1er lugar" sangria><Monto valor={catPremiosMain[1]} forzarNegativo /></FilaFin>
                <FilaFin label="Torneos main — 2do lugar" sangria><Monto valor={catPremiosMain[2]} forzarNegativo /></FilaFin>
                <FilaFin label="Torneos main — 3er lugar" sangria><Monto valor={catPremiosMain[3]} forzarNegativo /></FilaFin>
                {catPremiosMain.otros > 0 && (
                  <FilaFin label="Torneos main — otros lugares pagados" sangria>
                    <Monto valor={catPremiosMain.otros} forzarNegativo />
                  </FilaFin>
                )}
                <FilaFin label="Torneos main — burbuja" sangria><Monto valor={catPremiosMain.burbuja} forzarNegativo /></FilaFin>
                <FilaFin label="Torneos main — mejor mano" sangria><Monto valor={catPremiosMain.mano} forzarNegativo /></FilaFin>

                <FilaFin label="Subtotal egresos" bold><Monto valor={subtotalEgresos} forzarNegativo /></FilaFin>
                <FilaFin label="Balance general" bold><Monto valor={balanceGeneral} /></FilaFin>
              </TablaFin>
              <div className="section-sub" style={{ marginTop: -8 }}>
                El 15%/85% se calcula solo sobre pagos de torneos (regulares + main) — excluye la inscripción.
              </div>
            </div>

            {/* ───────── columna derecha: GASTOS OPERATIVOS / ACUM. CAMPEONATO / VALIDACIÓN ───────── */}
            <div>
              <TablaFin>
                <FilaSeccionFin label="Gastos operativos (de la inscripción)" />
                {gastosOperativos.map((g) => (
                  <FilaFin key={g.concepto} label={g.concepto} sangria>
                    <Monto valor={g.total} forzarNegativo />
                  </FilaFin>
                ))}
                {gastosOperativos.length === 0 && (
                  <FilaFin label="Sin conceptos configurados" sangria>—</FilaFin>
                )}
                <FilaFin label="Subtotal gastos operativos" bold><Monto valor={totalGastosOperativos} forzarNegativo /></FilaFin>

                <FilaFin label="Centavos acumulados"><Monto valor={centavosAcumulados} centavos /></FilaFin>

                <FilaSeccionFin label="Reserva para el Campeonato" />
                <FilaFin label="Total reservado" bold><Monto valor={acumCampeonatoAlMomento} forzarNegativo /></FilaFin>
                {acumCampeonatoPorLugar.map((l, i) => (
                  <FilaFin key={i} label={l.reyKiller ? "Rey Killer" : l.label} sangria>
                    <Monto valor={l.monto} forzarNegativo />
                  </FilaFin>
                ))}
                {acumCampeonatoPorLugar.length === 0 && (
                  <FilaFin label="Sin lugares configurados" sangria>—</FilaFin>
                )}

                <FilaSeccionFin label="Pasivo" />
                <FilaFin label="Existente en la cuenta de banco"><Monto valor={balanceGeneral} /></FilaFin>
                <FilaFin label="Reservado"><Monto valor={reservarAcum} forzarNegativo /></FilaFin>
                <FilaFin label="Gastos pendientes"><Monto valor={gastosPendientes} forzarNegativo /></FilaFin>
                <FilaFin label="Remanente real" bold><Monto valor={diffCuenta} /></FilaFin>
              </TablaFin>
            </div>
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

      {enviarEstadoModal && (
        <div className="modal-backdrop" onClick={() => (enviandoEstado ? null : setEnviarEstadoModal(null))}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">✉</div>
            <div className="modal-title">Enviar estado de cuenta: {enviarEstadoModal.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Revisá o editá el asunto y el cuerpo antes de mandarlo a <b>{enviarEstadoModal.correo}</b>. El
              correo sale con el mismo diseño del resto del sitio, con este texto adentro.
            </p>
            <div className="login-field">
              <label>Asunto</label>
              <input
                className="field"
                value={enviarEstadoModal.asunto}
                onChange={(e) => setEnviarEstadoModal({ ...enviarEstadoModal, asunto: e.target.value })}
                disabled={enviandoEstado}
              />
            </div>
            <div className="login-field">
              <label>Cuerpo</label>
              <textarea
                className="field"
                rows={10}
                style={{ fontFamily: "inherit", resize: "vertical" }}
                value={enviarEstadoModal.cuerpo}
                onChange={(e) => setEnviarEstadoModal({ ...enviarEstadoModal, cuerpo: e.target.value })}
                disabled={enviandoEstado}
              />
            </div>
            {errorEnviarEstado && <div className="login-error">{errorEnviarEstado}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEnviarEstadoModal(null)} disabled={enviandoEstado}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={enviandoEstado} onClick={enviarEstadoCuenta}>
                {enviandoEstado ? "Enviando…" : "Enviar correo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
