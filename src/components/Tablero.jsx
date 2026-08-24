import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";

const API = "/api/tablero";

function money(n) {
  return "$" + Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 });
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

export default function Tablero({ session }) {
  const editable = puedeEditar(session, "mod2");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el tablero (HTTP " + r.status + ").");
        return r.json();
      })
      .then((json) => {
        setData(json);
        setDraft(json);
      })
      .catch((e) => setLoadError(e.message || "Error al cargar el tablero."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="subtitle">Cargando tablero…</p>;
  if (loadError || !draft) {
    return (
      <div>
        <p className="subtitle">No se pudo cargar el tablero: {loadError}</p>
        <p className="section-sub">
          Si el sitio se acaba de desplegar, confirma que la función <code>/api/tablero</code> y el paquete{" "}
          <code>@netlify/blobs</code> están publicados.
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

  function validarLocal(d) {
    if (d.premios.porTorneo.lugares.length < 1) return "Premios por torneo: debe haber al menos 1 lugar.";
    if (Math.abs(sumPct(d.premios.porTorneo.lugares) - 100) > 0.01) return "Premios por torneo: los lugares deben sumar 100%.";
    if (d.premios.porCampeonato.lugares.length < 1) return "Premios por campeonato: debe haber al menos 1 lugar.";
    if (!d.premios.porCampeonato.lugares.some((l) => l.reyKiller)) return "Premios por campeonato: falta el % de Rey Killer.";
    if (Math.abs(sumPct(d.premios.porCampeonato.lugares) - 100) > 0.01) return "Premios por campeonato: los lugares (con Rey Killer) deben sumar 100%.";
    if (d.puntos.posiciones.length < 1) return "Puntos: debe haber al menos 1 posición.";
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
        body: JSON.stringify(draft),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setData(json);
      setDraft(json);
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

  const sumTorneo = sumPct(draft.premios.porTorneo.lugares);
  const sumCampeonato = sumPct(draft.premios.porCampeonato.lugares);

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Tablero</h1>
          <p className="subtitle">
            Reglas paramétricas de la liga: reparto de premios, puntos por posición, costos de inscripción y pagos
            adicionales. {editable ? "Edita los valores y da clic en Guardar cambios." : "Vista de solo lectura — tu perfil no tiene permiso para modificarlo."}
          </p>
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
        <div className="section-head"><div className="section-title">Asignación de premios</div></div>

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
        <div className="section-head"><div className="section-title">Asignación de puntos</div></div>
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

      {/* ───────── Costos ───────── */}
      <div className="section">
        <div className="section-head"><div className="section-title">Costos</div></div>

        <div className="login-field" style={{ maxWidth: 220 }}>
          <label>Recompras (Re-buys) máximas por jugador</label>
          <input type="number" min="0" className="field" disabled={!editable} value={draft.recomprasMax}
            onChange={(e) => set((d) => { d.recomprasMax = Number(e.target.value); })} />
        </div>
        <div className="section-sub">Se define una sola vez por campeonato. No es un costo — limita cuántas veces puede recomprar cada jugador.</div>

        <div className="subhead">Costos únicos por campeonato — se cobran una sola vez y se extraen al final del acumulado</div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: editable ? "1fr 120px 40px" : "1fr 110px" }}>
            <div>Concepto</div><div className="right">Monto</div>{editable && <div />}
          </div>
          {draft.costosUnicos.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: editable ? "1fr 120px 40px" : "1fr 110px" }} key={i}>
              {editable ? (
                <input className="field" value={row.concepto}
                  onChange={(e) => set((d) => { d.costosUnicos[i].concepto = e.target.value; })} />
              ) : <div>{row.concepto}</div>}
              {editable ? (
                <input type="number" className="field right" value={row.monto}
                  onChange={(e) => set((d) => { d.costosUnicos[i].monto = Number(e.target.value); })} />
              ) : <div className="right num">{money(row.monto)}</div>}
              {editable && (
                <button className="btn-icon-remove" title="Quitar concepto" disabled={draft.costosUnicos.length <= 1}
                  onClick={() => set((d) => { d.costosUnicos.splice(i, 1); })}>✕</button>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button className="btn btn-secondary btn-add" disabled={draft.costosUnicos.length >= 10}
            onClick={() => set((d) => { d.costosUnicos.push({ concepto: "Nuevo concepto", monto: 0 }); })}>
            + Agregar concepto
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
        <div className="section-sub">Buy-in (único, obligatorio) y Re-buy (hasta el máximo de arriba) no se pueden eliminar; Add-on y cualquier cobro adicional son opcionales.</div>

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
    </div>
  );
}
