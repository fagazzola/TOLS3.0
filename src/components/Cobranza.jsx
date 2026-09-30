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

function movimientoVacio(campeonato, correo) {
  return {
    id: "",
    campeonato,
    fecha: "",
    correo: correo || "",
    buyInPagado: true,
    rebuys: 0,
    addonComprado: false,
    pagado: false,
    fechaPago: "",
    lugar: "",
    premioPartida: 0,
    premioCampeonato: 0,
  };
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

  const [draft, setDraft] = useState(null); // movimiento en edición (form de arriba)
  const [nombreNuevo, setNombreNuevo] = useState(""); // por si el correo del draft es nuevo

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

  const fechasDelCampeonato = useMemo(
    () => torneosCal.filter((t) => t.temporada === campeonatoSel).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [torneosCal, campeonatoSel]
  );

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

  const recomprasMax = tableroMapa?.[campeonatoSel]?.recomprasMax ?? 2;

  async function guardarMovimiento() {
    if (!draft) return;
    setGuardando(true);
    setError("");
    try {
      const correo = draft.correo.trim().toLowerCase();
      if (!correo || !draft.fecha) throw new Error("Elegí un jugador y una fecha.");
      // si el correo no existe todavía en el directorio de Cobranza, se da de alta con el nombre
      // que se haya escrito al lado del selector
      if (!data.jugadores[correo] && !directorio.find((d) => d.correo === correo)?.nombre && !nombreNuevo.trim()) {
        throw new Error("Ese correo es nuevo — escribí el nombre del jugador antes de guardar.");
      }
      if (!data.jugadores[correo]) {
        const r1 = await fetch(API, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accion: "guardarJugador", correo, nombre: nombreNuevo.trim() || directorio.find((d) => d.correo === correo)?.nombre || "" }),
        });
        if (!r1.ok) throw new Error((await r1.json()).error || "No se pudo registrar al jugador.");
      }
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "guardarMovimiento", movimiento: { ...draft, correo } }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar el movimiento.");
      setData(json);
      setDraft(null);
      setNombreNuevo("");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
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
                        <div className="num right">{moneyContable(f.resultado)}</div>
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
              {!draft ? (
                <button className="btn btn-primary btn-add" onClick={() => setDraft(movimientoVacio(campeonatoSel, ""))}>
                  + Nuevo movimiento
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="login-field-row">
                    <div className="login-field" style={{ flex: 2 }}>
                      <label>Jugador (correo)</label>
                      <input
                        className="field"
                        list="cobranza-directorio"
                        value={draft.correo}
                        onChange={(e) => setDraft({ ...draft, correo: e.target.value })}
                        placeholder="correo@ejemplo.com"
                      />
                      <datalist id="cobranza-directorio">
                        {directorio.map((d) => (
                          <option key={d.correo} value={d.correo}>
                            {d.nombre}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    {!data.jugadores[draft.correo.trim().toLowerCase()] && (
                      <div className="login-field" style={{ flex: 1 }}>
                        <label>Nombre (jugador nuevo en Cobranza)</label>
                        <input className="field" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Nombre y apellido" />
                      </div>
                    )}
                    <div className="login-field" style={{ flex: 1 }}>
                      <label>Fecha</label>
                      <select className="field" value={draft.fecha} onChange={(e) => setDraft({ ...draft, fecha: e.target.value })}>
                        <option value="">— elegir —</option>
                        {fechasDelCampeonato.map((t) => (
                          <option key={t.fecha} value={t.fecha}>
                            {t.fecha} {t.main ? "(Main)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="login-field-row">
                    <label className="chk-inline">
                      <input type="checkbox" checked={draft.buyInPagado} onChange={(e) => setDraft({ ...draft, buyInPagado: e.target.checked })} />
                      Buy-in
                    </label>
                    <div className="login-field" style={{ maxWidth: 140 }}>
                      <label>Rebuys (0–{recomprasMax})</label>
                      <input
                        className="field"
                        type="number"
                        min={0}
                        max={recomprasMax}
                        value={draft.rebuys}
                        onChange={(e) => setDraft({ ...draft, rebuys: Math.max(0, Math.min(recomprasMax, Number(e.target.value) || 0)) })}
                      />
                    </div>
                    <label className="chk-inline">
                      <input type="checkbox" checked={draft.addonComprado} onChange={(e) => setDraft({ ...draft, addonComprado: e.target.checked })} />
                      Add-on
                    </label>
                    <label className="chk-inline">
                      <input type="checkbox" checked={draft.pagado} onChange={(e) => setDraft({ ...draft, pagado: e.target.checked })} />
                      Pagado al tesorero
                    </label>
                    {draft.pagado && (
                      <div className="login-field" style={{ maxWidth: 160 }}>
                        <label>Fecha de pago</label>
                        <input className="field" type="date" value={draft.fechaPago} onChange={(e) => setDraft({ ...draft, fechaPago: e.target.value })} />
                      </div>
                    )}
                  </div>

                  <div className="login-field-row">
                    <div className="login-field" style={{ maxWidth: 120 }}>
                      <label>Lugar (opcional)</label>
                      <input className="field" type="number" min={1} value={draft.lugar} onChange={(e) => setDraft({ ...draft, lugar: e.target.value })} />
                    </div>
                    <div className="login-field" style={{ maxWidth: 160 }}>
                      <label>Premio de partida ($)</label>
                      <input className="field" type="number" min={0} value={draft.premioPartida} onChange={(e) => setDraft({ ...draft, premioPartida: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="login-field" style={{ maxWidth: 200 }}>
                      <label>Premio de campeonato ($, solo última fecha)</label>
                      <input className="field" type="number" min={0} value={draft.premioCampeonato} onChange={(e) => setDraft({ ...draft, premioCampeonato: Number(e.target.value) || 0 })} />
                    </div>
                  </div>

                  <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="btn btn-primary" disabled={guardando} onClick={guardarMovimiento}>
                      {guardando ? "Guardando…" : "Guardar movimiento"}
                    </button>
                    <button className="btn btn-secondary" disabled={guardando} onClick={() => { setDraft(null); setNombreNuevo(""); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  <div className="stat-value">{money(r.pago)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total ganado</div>
                  <div className="stat-value">{money(r.deposito)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Saldo</div>
                  <div className="stat-value">{money(r.saldo)}</div>
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

              <div className="tbl" style={{ marginTop: 16 }}>
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
              <div className="stat-value">{money(finanzas.recaudadoCobrado)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Recaudado pendiente</div>
              <div className="stat-value">{money(finanzas.recaudadoPendiente)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Premios pagados</div>
              <div className="stat-value">{money(finanzas.premiosPagados)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Gastos fijos del campeonato</div>
              <div className="stat-value">{money(finanzas.gastosFijos)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Fondo acumulado estimado</div>
              <div className="stat-value">{money(finanzas.fondoAcumuladoEstimado)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Saldo neto de la liga</div>
              <div className="stat-value">{money(finanzas.saldoNeto)}</div>
            </div>
          </div>
          <div className="section-sub">
            "Recaudado" solo cuenta lo marcado como pagado al tesorero. El fondo acumulado es una estimación
            (% configurado en el Tablero de Control sobre lo ya cobrado) — el monto real depende de cuánto
            se termine recaudando en cada fecha.
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
