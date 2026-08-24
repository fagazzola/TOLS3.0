import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import { MoneyBadge } from "./PokerArt.jsx";

const API = "/api/calendario";

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

// sugiere la temporada por defecto: la del torneo existente más cercano en fecha,
// o si no hay ninguno, "<año>-I"
function sugerirTemporada(torneos, fechaRef) {
  if (torneos.length === 0) return `${new Date(fechaRef).getFullYear()}-I`;
  const ref = new Date(fechaRef + "T00:00:00").getTime();
  let mejor = torneos[0];
  let mejorDist = Infinity;
  for (const t of torneos) {
    const dist = Math.abs(new Date(t.fecha + "T00:00:00").getTime() - ref);
    if (dist < mejorDist) {
      mejorDist = dist;
      mejor = t;
    }
  }
  return mejor.temporada || `${new Date(fechaRef).getFullYear()}-I`;
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

export default function Calendario({ session }) {
  const editable = puedeEditar(session, "mod1");
  const [data, setData] = useState(null);
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
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el calendario (HTTP " + r.status + ").");
        return r.json();
      })
      .then((json) => setData(json))
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
    setModal({
      fechaOriginal: existing ? existing.fecha : null,
      fecha: iso(d),
      hora: existing ? existing.hora : data.defaultHora,
      main: existing ? existing.main : false,
      temporada: existing ? (existing.temporada || sugerirTemporada(data.torneos, iso(d))) : sugerirTemporada(data.torneos, iso(d)),
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
      setSaveError("Indica la temporada (por ejemplo 2026-I).");
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

  const mainCount = data.torneos.filter((t) => t.main).length;
  const dPago = data.pagoFinal?.fecha ? new Date(data.pagoFinal.fecha + "T00:00:00") : null;

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
          <h1>Calendario</h1>
          <p className="subtitle">
            {editable
              ? "Haz clic en cualquier día para crear, editar o borrar un torneo."
              : "Vista de solo lectura — tu perfil no tiene permiso para modificar el calendario."}
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Torneos</div>
          <div className="stat-value">{data.torneos.length} <small>fechas</small></div>
        </div>
        <div className="stat">
          <div className="stat-label">Main Events</div>
          <div className="stat-value">{mainCount} <small>de {data.torneos.length}</small></div>
        </div>
        <div
          className={"stat" + (editable ? " cal-cell-clickable" : "")}
          onClick={editable ? openPagoModal : undefined}
          title={editable ? "Editar fecha de pago final" : undefined}
        >
          <div className="stat-label">Pago final</div>
          <div className="stat-value">
            {dPago ? `${dPago.getDate()} ${mesesLargos[dPago.getMonth()].slice(0, 3)}` : "–"} <small>{dPago?.getFullYear()}</small>
          </div>
        </div>
      </div>

      <div className="cal-toolbar">
        <button className="btn btn-secondary" onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
          Hoy
        </button>
        <div className="cal-nav">
          <button className="cal-nav-btn" aria-label="Mes anterior" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>‹</button>
          <div className="cal-month-label">{cap(mesesLargos[viewMonth.getMonth()])} {viewMonth.getFullYear()}</div>
          <button className="cal-nav-btn" aria-label="Mes siguiente" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>›</button>
        </div>
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

      <div className="section">
        <div className="section-head"><div className="section-title">Reglas del calendario</div></div>
        <p className="section-sub">Recordatorio para los jugadores — la información oficial vive en el calendario de arriba.</p>
        <div className="notes-grid">
          <div className="note-box">
            <div className="note-label">Día de pago final</div>
            <div>
              {dPago ? <><b>{dPago.getDate()} de {mesesLargos[dPago.getMonth()]}, {dPago.getFullYear()}</b> — {data.pagoFinal.nota}.</> : "–"}
            </div>
          </div>
        </div>
      </div>


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
              <label>Temporada</label>
              <input
                type="text"
                className="field"
                placeholder="p. ej. 2026-I"
                value={modal.temporada}
                onChange={(e) => setModal({ ...modal, temporada: e.target.value })}
              />
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
