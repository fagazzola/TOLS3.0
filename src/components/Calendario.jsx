import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";

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
  const [modal, setModal] = useState(null); // { fechaOriginal, fecha, hora, main, isNew }

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

  function openModal(d, existing) {
    if (!editable) return;
    setSaveError("");
    setModal({
      fechaOriginal: existing ? existing.fecha : null,
      fecha: iso(d),
      hora: existing ? existing.hora : data.defaultHora,
      main: existing ? existing.main : false,
      isNew: !existing,
    });
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
    let torneos = data.torneos.filter((t) => t.fecha !== modal.fechaOriginal);
    torneos.push({ n: 0, fecha: modal.fecha, hora: modal.hora, main: modal.main });
    persist({ ...data, torneos });
  }

  function handleEliminar() {
    const torneos = data.torneos.filter((t) => t.fecha !== modal.fechaOriginal);
    persist({ ...data, torneos });
  }

  const mainCount = data.torneos.filter((t) => t.main).length;
  const dPago = data.pagoFinal.fecha ? new Date(data.pagoFinal.fecha + "T00:00:00") : null;

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♣ Torrente On Line Series · MOD 1</div>
          <h1>Calendario TOLS 3.0</h1>
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
        <div className="stat">
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
              return (
                <div
                  key={iso(cell.date)}
                  className={"cal-cell" + (cell.inMonth ? "" : " cal-cell-out") + (editable ? " cal-cell-clickable" : "")}
                  onClick={() => openModal(cell.date, eventos[0])}
                >
                  <div className={"cal-daynum" + (isToday ? " cal-daynum-today" : "")}>{cell.date.getDate()}</div>
                  {eventos.map((ev) => (
                    <div className={"cal-chip" + (ev.main ? " cal-chip-main" : "")} key={ev.fecha + ev.hora}>
                      <span className="cal-chip-dot" aria-hidden="true" />
                      {ev.hora} {ev.main ? "· Main" : ""}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Reglas del calendario</div></div>
        <div className="notes-grid">
          <div className="note-box">
            <div className="note-label">Hora límite · Mejor Mano</div>
            <div>Se recibe hasta las <b className="num">{data.horaLimiteMejorMano} hrs</b> el día del torneo.</div>
          </div>
          <div className="note-box">
            <div className="note-label">Día de pago final</div>
            <div>
              {dPago ? <><b>{dPago.getDate()} de {mesesLargos[dPago.getMonth()]}, {dPago.getFullYear()}</b> — {data.pagoFinal.nota}.</> : "–"}
            </div>
          </div>
        </div>
      </div>

      <footer className="page-footer">Fuente: torneos guardados en Netlify Blobs · MOD 1 · Liga Torrente</footer>

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
    </div>
  );
}
