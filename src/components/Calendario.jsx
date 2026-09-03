import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import { MoneyBadge } from "./PokerArt.jsx";

const API = "/api/calendario";
const API_CAMP = "/api/campeonatos";

const diasCortos = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const mesesLargos = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// arma la cuadrícula completa del mes: semanas de domingo a sábado, incluyendo
// los días de relleno de los meses anterior/siguiente, como en una vista mensual normal
function buildGrid(viewMonth) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(last);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const weeks = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === viewMonth.getMonth() });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function Calendario({ session, perfiles }) {
  const editable = puedeEditar(perfiles, session, "mod1");
  const [data, setData] = useState(null);
  const [campeonatos, setCampeonatos] = useState([]);
  // el campeonato "activo" es el que gobierna el sitio — el mismo que se ve/edita en el Tablero de
  // Control (tols-campeonatos). El Calendario ya no lo adivina por su cuenta a partir de las fechas.
  const [campeonatoActivo, setCampeonatoActivo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [modal, setModal] = useState(null); // { fechaOriginal, fecha, hora, main, temporada, isNew }
  const [pagoModal, setPagoModal] = useState(null); // { fecha, nota }

  useEffect(() => {
    Promise.all([
      fetch(API).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el calendario (HTTP " + r.status + ").");
        return r.json();
      }),
      fetch(API_CAMP).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la lista de campeonatos (HTTP " + r.status + ").");
        return r.json();
      }),
    ])
      .then(([cal, camp]) => {
        const nombres = Array.isArray(camp?.nombres) ? camp.nombres : [];
        const activo = camp?.activo || nombres[0] || "";
        setCampeonatos(nombres);
        setCampeonatoActivo(activo);
        // fechas guardadas antes de que existiera el campo "temporada" (o que por algún motivo se
        // quedaron sin campeonato asignado) se completan aquí mismo, en el navegador, con el
        // campeonato activo — y se guardan de una vez, para que no se sigan viendo "huérfanas" cada
        // vez que alguien entre al Calendario como Administrador. No depende de que el auto-completado
        // del servidor (`conTemporadaCompletada` en calendario.js) se dispare correctamente.
        const faltan = editable && activo && (cal?.torneos || []).some((t) => !t.temporada);
        if (faltan) {
          const corregido = { ...cal, torneos: cal.torneos.map((t) => (t.temporada ? t : { ...t, temporada: activo })) };
          setData(corregido);
          fetch(API, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(corregido),
          })
            .then((r) => r.json())
            .then((json) => { if (!json.error) setData(json); })
            .catch(() => {});
        } else {
          setData(cal);
        }
      })
      .catch((e) => setLoadError(e.message || "Error al cargar el calendario."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="subtitle">Cargando calendario…</p>;
  if (loadError || !data) {
    return (
      <div>
        <p className="subtitle">No se pudo cargar el calendario: {loadError}</p>
        <p className="section-sub">
          Si el sitio se acaba de desplegar, confirma que la función <code>/api/calendario</code> y el paquete{" "}
          <code>@netlify/blobs</code> están publicados.
        </p>
      </div>
    );
  }

  const weeks = buildGrid(viewMonth);
  const today = new Date();
  const todayIso = iso(today);

  function torneosDe(d) {
    const key = iso(d);
    return data.torneos.filter((t) => t.fecha === key);
  }

  function esPagoFinal(d) {
    return data.pagoFinal?.fecha === iso(d);
  }

  function openModal(d, existing) {
    if (!editable) return;
    if (esPagoFinal(d) && !existing) {
      // el día de pago final no crea un torneo; se edita aparte
      return;
    }
    setSaveError("");
    // el campeonato de cualquier fecha, nueva o existente, siempre es el "activo" que gobierna el
    // sitio (definido en el Tablero de Control) — ya no se elige por torneo desde aquí, para que no
    // haya manera de que una fecha quede "desincronizada" del campeonato vigente.
    setModal({
      fechaOriginal: existing ? existing.fecha : null,
      fecha: iso(d),
      hora: existing ? existing.hora : data.defaultHora,
      main: existing ? existing.main : false,
      temporada: campeonatoActivo,
      isNew: !existing,
    });
  }

  function openPagoModal() {
    if (!editable) return;
    setSaveError("");
    setPagoModal({ fecha: data.pagoFinal?.fecha || "", nota: data.pagoFinal?.nota || "" });
  }

  async function persist(newState) {
    setSaving(true);
    setSaveError("");
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newState),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setData(json);
      setModal(null);
      setPagoModal(null);
    } catch (e) {
      setSaveError(e.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  function handleGuardar() {
    if (!modal.fecha || !modal.hora) {
      setSaveError("Completa fecha y hora.");
      return;
    }
    if (!modal.temporada.trim()) {
      setSaveError("No hay ningún campeonato activo definido en el Tablero de Control todavía — créalo ahí primero.");
      return;
    }
    let torneos = data.torneos.filter((t) => t.fecha !== modal.fechaOriginal);
    torneos.push({ n: 0, fecha: modal.fecha, hora: modal.hora, main: modal.main, temporada: modal.temporada.trim() });
    persist({ ...data, torneos });
  }

  function handleEliminar() {
    const torneos = data.torneos.filter((t) => t.fecha !== modal.fechaOriginal);
    persist({ ...data, torneos });
  }

  function handleGuardarPago() {
    if (!pagoModal.fecha) {
      setSaveError("Indica la fecha de pago final.");
      return;
    }
    persist({ ...data, pagoFinal: { fecha: pagoModal.fecha, nota: pagoModal.nota } });
  }

  const dPago = data.pagoFinal?.fecha ? new Date(data.pagoFinal.fecha + "T00:00:00") : null;

  // todo el resumen (fechas, Main Events, jugadas, avance) se calcula solo sobre las fechas del
  // campeonato activo — si por algo no hay ninguno definido, se cae a todas las fechas para no
  // mostrar ceros por un problema de configuración
  const torneosActivo = campeonatoActivo ? data.torneos.filter((t) => t.temporada === campeonatoActivo) : data.torneos;
  const mainCount = torneosActivo.filter((t) => t.main).length;
  const jugadosCount = torneosActivo.filter((t) => t.fecha < todayIso).length;
  const avancePct = torneosActivo.length > 0 ? Math.round((jugadosCount / torneosActivo.length) * 100) : 0;

  // estatus del torneo, en función de cuántas fechas ya pasaron respecto al total
  function estatusTorneo() {
    if (torneosActivo.length === 0) return { texto: "Sin fechas", clase: "badge-pendiente" };
    if (jugadosCount === 0) return { texto: "No iniciado", clase: "badge-pendiente" };
    if (jugadosCount === torneosActivo.length) return { texto: "Terminado", clase: "badge-efectuado" };
    return { texto: "En curso", clase: "badge-nivel-lectura" };
  }

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
          <h1>Calendario</h1>
        </div>
      </div>

      {/* mismo bloque para Administrador y Jugador — se asume que los administradores también son
          jugadores de la liga; compacto a propósito para dejarle más espacio a la cuadrícula (modo
          administrador) o a la lista de fechas (modo jugador) que vienen justo debajo */}
      <div className="cal-resumen-sticky">
        <div className="campeonato-banner campeonato-banner-row">
          <div>
            {campeonatoActivo ? <>Campeonato: <strong>{campeonatoActivo}</strong></> : "Todavía no hay un campeonato definido."}
            {" "}
            <span className={"badge " + estatusTorneo().clase}>{estatusTorneo().texto}</span>
          </div>
          <div className="campeonato-banner-jugador">{session.nombre}</div>
        </div>

        <div className="stats stats-compact">
          <div className="stat">
            <div className="stat-label">Fechas</div>
            <div className="stat-value">{torneosActivo.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Main Events</div>
            <div className="stat-value">{mainCount} <small>de {torneosActivo.length}</small></div>
          </div>
          <div className="stat">
            <div className="stat-label">Jugadas</div>
            <div className="stat-value">{jugadosCount} <small>de {torneosActivo.length}</small></div>
          </div>
          <div className="stat">
            <div className="stat-label">Avance del torneo</div>
            <div className="stat-value">{avancePct}%</div>
          </div>
          <div className="stat">
            <div className="stat-label">Puntos en el torneo</div>
            <div className="stat-value stat-value-proximamente">Próximamente</div>
          </div>
          <div className="stat">
            <div className="stat-label">Posición en la tabla</div>
            <div className="stat-value stat-value-proximamente">Próximamente</div>
          </div>
        </div>
      </div>

      {editable ? (
        <>
          <div className="cal-toolbar cal-toolbar-compact">
            <button className="btn btn-secondary" onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
              Hoy
            </button>
            <div className="cal-nav">
              <button className="cal-nav-btn" aria-label="Mes anterior" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>‹</button>
              <div className="cal-month-label">{cap(mesesLargos[viewMonth.getMonth()])} {viewMonth.getFullYear()}</div>
              <button className="cal-nav-btn" aria-label="Mes siguiente" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>›</button>
            </div>
            <button className="btn btn-secondary cal-toolbar-pago" onClick={openPagoModal} title="Editar fecha de pago final">
              <MoneyBadge size={14} style={{ marginRight: 5, verticalAlign: "-2px" }} />
              Pago final: {dPago ? `${dPago.getDate()} ${mesesLargos[dPago.getMonth()].slice(0, 3)} ${dPago.getFullYear()}` : "sin definir"}
            </button>
          </div>

          <div className="cal-grid">
            <div className="cal-row cal-row-head">
              {diasCortos.map((d) => <div className="cal-headcell" key={d}>{d}</div>)}
            </div>
            {weeks.map((week, wi) => (
              <div className="cal-row" key={wi}>
                {week.map((cell) => {
                  const eventos = torneosDe(cell.date);
                  const isToday = sameDay(cell.date, today);
                  const esPago = esPagoFinal(cell.date);
                  return (
                    <div
                      key={iso(cell.date)}
                      className={"cal-cell" + (cell.inMonth ? "" : " cal-cell-out") + (editable && (eventos.length || !esPago) ? " cal-cell-clickable" : "")}
                      onClick={() => openModal(cell.date, eventos[0])}
                    >
                      <div className={"cal-daynum" + (isToday ? " cal-daynum-today" : "")}>{cell.date.getDate()}</div>
                      {eventos.map((ev) => (
                        <div className="cal-chip" key={ev.fecha + ev.hora}>
                          <div className="cal-chip-row">
                            <span className="cal-chip-dot" aria-hidden="true" />
                            <span className="cal-chip-hora">{ev.hora}</span>
                            <span className={ev.main ? "cal-chip-tag cal-chip-tag-main" : "cal-chip-tag cal-chip-tag-regular"}>
                              {ev.main ? "Main" : "Regular"}
                            </span>
                          </div>
                          {ev.temporada && <div className="cal-chip-temporada">{ev.temporada}</div>}
                        </div>
                      ))}
                      {esPago && (
                        <div
                          className="cal-chip cal-chip-pago"
                          onClick={(e) => { e.stopPropagation(); openPagoModal(); }}
                        >
                          <MoneyBadge size={14} />
                          <span>Pago final</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="cal-list">
          {torneosActivo
            .slice()
            .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
            .map((t) => {
              const d = new Date(t.fecha + "T00:00:00");
              const pasado = t.fecha < todayIso;
              const esHoy = t.fecha === todayIso;
              return (
                <div className={"cal-list-item" + (pasado ? " cal-list-item-pasado" : "") + (esHoy ? " cal-list-item-hoy" : "")} key={t.fecha + t.hora}>
                  <div className="cal-list-date">
                    <div className="cal-list-day">{diasCortos[d.getDay()]} {d.getDate()}</div>
                    <div className="cal-list-mes">{mesesLargos[d.getMonth()].slice(0, 3)}</div>
                  </div>
                  <div className="cal-list-info">
                    <div className="cal-list-info-row">
                      <div className="cal-list-hora">
                        {t.hora}
                        {esHoy && <span className="cal-list-hoy-tag">Hoy</span>}
                      </div>
                      <div className="cal-list-badges">
                        <span className={t.main ? "badge badge-main" : "badge badge-regular"}>{t.main ? "Main Event" : "Regular"}</span>
                        <span className={pasado ? "badge badge-efectuado" : "badge badge-pendiente"}>{pasado ? "Efectuado" : "Pendiente"}</span>
                      </div>
                    </div>
                    <div className="cal-list-resultado">
                      <span>Posición: <span className="stat-value-proximamente">Próximamente (Game Night)</span></span>
                      <span>Puntos: <span className="stat-value-proximamente">Próximamente (Game Night)</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          {data.pagoFinal?.fecha && (
            <div className="cal-list-item cal-list-item-pago">
              <div className="cal-list-date">
                <MoneyBadge size={18} />
              </div>
              <div className="cal-list-info">
                <div className="cal-list-hora">Pago final — {new Date(data.pagoFinal.fecha + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</div>
                {data.pagoFinal.nota && <div className="section-note">{data.pagoFinal.nota}</div>}
              </div>
            </div>
          )}
          {torneosActivo.length === 0 && <p className="section-sub">Todavía no hay torneos programados para este campeonato.</p>}
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={() => !saving && setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modal.isNew ? "Nuevo torneo" : "Editar torneo"}</div>
            <div className="login-field">
              <label>Fecha</label>
              <input
                type="date"
                className="field"
                value={modal.fecha}
                onChange={(e) => setModal({ ...modal, fecha: e.target.value })}
              />
            </div>
            <div className="login-field">
              <label>Hora</label>
              <input
                type="time"
                className="field"
                value={modal.hora}
                onChange={(e) => setModal({ ...modal, hora: e.target.value })}
              />
            </div>
            <div className="login-field">
              <label>Campeonato</label>
              <div className="field field-readonly" title="Lo define el combo del Tablero de Control — no se elige por fecha.">
                {modal.temporada || "(sin campeonato activo — créalo en el Tablero de Control)"}
              </div>
            </div>
            <label className="chk-inline">
              <input
                type="checkbox"
                checked={modal.main}
                onChange={(e) => setModal({ ...modal, main: e.target.checked })}
              />
              Main Event
            </label>
            {saveError && <div className="login-error">{saveError}</div>}
            <div className="modal-actions">
              {!modal.isNew && (
                <button className="btn btn-secondary" onClick={handleEliminar} disabled={saving}>
                  Eliminar
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleGuardar} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pagoModal && (
        <div className="modal-backdrop" onClick={() => !saving && setPagoModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><MoneyBadge size={16} style={{ marginRight: 6, verticalAlign: "-2px" }} />Día de pago final</div>
            <div className="login-field">
              <label>Fecha</label>
              <input
                type="date"
                className="field"
                value={pagoModal.fecha}
                onChange={(e) => setPagoModal({ ...pagoModal, fecha: e.target.value })}
              />
            </div>
            <div className="login-field">
              <label>Nota</label>
              <input
                type="text"
                className="field"
                value={pagoModal.nota}
                onChange={(e) => setPagoModal({ ...pagoModal, nota: e.target.value })}
              />
            </div>
            {saveError && <div className="login-error">{saveError}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPagoModal(null)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleGuardarPago} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
