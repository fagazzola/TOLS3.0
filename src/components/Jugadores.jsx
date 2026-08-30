import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";

const API = "/api/jugadores";
const API_CAL = "/api/calendario";
const API_CAMP = "/api/campeonatos";

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Jugadores({ session, perfiles }) {
  const [data, setData] = useState(null);
  const [proximoTorneo, setProximoTorneo] = useState(null); // { fecha, ... } | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null); // { id, padrino, estatus }
  const [guardando, setGuardando] = useState(false);
  const [hostGuardando, setHostGuardando] = useState(null); // id del jugador en proceso
  const [hostAviso, setHostAviso] = useState("");
  const [confirmarHost, setConfirmarHost] = useState(null); // { id, nombre }

  const puedeEscribir = puedeEditar(perfiles, session, "mod6");

  useEffect(() => {
    cargar();
  }, []);

  function cargar() {
    setLoading(true);
    setError("");
    Promise.all([
      fetch(API).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la lista de jugadores (HTTP " + r.status + ").");
        return r.json();
      }),
      fetch(API_CAL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_CAMP).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([jugadores, cal, camp]) => {
        setData(jugadores);
        // el "próximo torneo" es la fecha más cercana (hoy o después) del campeonato activo — es la fecha
        // para la que se necesita un Host asignado
        const activo = camp?.activo || "";
        const hoy = iso(new Date());
        const torneos = (cal?.torneos || []).filter((t) => (activo ? t.temporada === activo : true) && t.fecha >= hoy);
        torneos.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
        setProximoTorneo(torneos[0] || null);
      })
      .catch((e) => setError(e.message || "Error al cargar jugadores."))
      .finally(() => setLoading(false));
  }

  async function guardarFila() {
    if (!editando) return;
    setGuardando(true);
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editando),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setData(json);
      setEditando(null);
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function asignarHost(id) {
    setHostGuardando(id);
    setHostAviso("");
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "host", id, host: true, fecha: proximoTorneo?.fecha || "" }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo asignar el Host.");
      setData(json);
      setHostAviso(json.avisoCorreo || "");
    } catch (e) {
      setError(e.message || "No se pudo asignar el Host.");
    } finally {
      setHostGuardando(null);
      setConfirmarHost(null);
    }
  }

  async function quitarHost(id) {
    setHostGuardando(id);
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "host", id, host: false }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo quitar el Host.");
      setData(json);
    } catch (e) {
      setError(e.message || "No se pudo quitar el Host.");
    } finally {
      setHostGuardando(null);
    }
  }

  const hostActual = data?.jugadores?.find((j) => j.host);

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Jugadores</h1>
          <p className="subtitle">
            Directorio de jugadores dados de alta desde la pantalla de autorregistro. Los datos personales los
            llena cada jugador; aquí solo se administran el Padrino y el Estatus.
          </p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Cargando…</p>
      ) : (
        <>
          {puedeEscribir && (
            <div className={"campeonato-banner" + (!hostActual && proximoTorneo ? " campeonato-banner-alerta" : "")}>
              {proximoTorneo ? (
                hostActual ? (
                  <>Próximo torneo — {proximoTorneo.fecha} — Host asignado: <strong>{hostActual.nombre}</strong></>
                ) : (
                  <>⚠ No hay Host asignado para el próximo torneo ({proximoTorneo.fecha}). Sin Host no se puede iniciar el Game Night — asígnalo abajo.</>
                )
              ) : (
                "No hay ningún torneo próximo programado en el Calendario todavía."
              )}
            </div>
          )}
          {hostAviso && <div className="login-error" style={{ marginTop: 10 }}>{hostAviso}</div>}

          <div className="section">
            <div className="section-head"><div className="section-title">Jugadores registrados ({data?.jugadores?.length || 0})</div></div>
            <div className="tbl">
              <div className="trow thead" style={{ gridTemplateColumns: "40px 1.3fr 1fr 1fr 1fr 1fr 0.7fr 0.9fr 110px" }}>
                <div /><div>Nombre</div><div>Alias</div><div>PokerStars</div><div>Correo</div><div>Padrino</div><div>Edad</div><div>Estatus</div><div>Host</div>
              </div>
              {(data?.jugadores || []).map((j) => {
                const enEdicion = editando?.id === j.id;
                return (
                  <div className="trow" style={{ gridTemplateColumns: "40px 1.3fr 1fr 1fr 1fr 1fr 0.7fr 0.9fr 110px" }} key={j.id}>
                    <div style={{ fontSize: 18 }}>{j.emoticon}</div>
                    <div>{j.nombre}</div>
                    <div>{j.aliasJugador}</div>
                    <div>{j.aliasPokerStars}</div>
                    <div style={{ fontSize: 12 }}>{j.correo}</div>
                    <div>
                      {puedeEscribir && enEdicion ? (
                        <input
                          className="field"
                          value={editando.padrino}
                          onChange={(e) => setEditando({ ...editando, padrino: e.target.value })}
                        />
                      ) : (
                        j.padrino || "—"
                      )}
                    </div>
                    <div>{j.edad}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {puedeEscribir && enEdicion ? (
                        <>
                          <select
                            className="field"
                            value={editando.estatus}
                            onChange={(e) => setEditando({ ...editando, estatus: e.target.value })}
                          >
                            <option value="Activo">Activo</option>
                            <option value="Inactivo">Inactivo</option>
                          </select>
                          <button className="btn-icon-confirm" title="Guardar" disabled={guardando} onClick={guardarFila}>✓</button>
                          <button className="btn-icon-remove" title="Cancelar" onClick={() => setEditando(null)}>✕</button>
                        </>
                      ) : (
                        <>
                          <span className={"badge " + (j.estatus === "Activo" ? "badge-nivel-escritura" : "badge-nivel-ninguno")}>{j.estatus}</span>
                          {puedeEscribir && (
                            <button
                              className="btn-icon-eye"
                              title="Editar padrino/estatus"
                              onClick={() => setEditando({ id: j.id, padrino: j.padrino, estatus: j.estatus })}
                            >
                              ✎
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div>
                      {j.host ? (
                        <span className="badge badge-host">🎙 Host</span>
                      ) : null}
                      {puedeEscribir && (
                        j.host ? (
                          <button
                            className="btn-icon-remove"
                            title="Quitar Host"
                            style={{ marginLeft: 6 }}
                            disabled={hostGuardando === j.id}
                            onClick={() => quitarHost(j.id)}
                          >
                            ✕
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-host-asignar"
                            disabled={hostGuardando === j.id || !proximoTorneo}
                            title={!proximoTorneo ? "No hay un próximo torneo programado" : "Asignar como Host del próximo torneo"}
                            onClick={() => setConfirmarHost({ id: j.id, nombre: j.nombre })}
                          >
                            Asignar
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {(!data?.jugadores || data.jugadores.length === 0) && (
              <div className="section-sub">Todavía no hay jugadores registrados. Compárteles la liga de autorregistro.</div>
            )}
            <div className="section-sub">
              El <b>Host</b> es responsable de la ejecución del Game Night del próximo torneo — solo puede haber uno a
              la vez en toda la liga. Al asignarlo se le manda un correo avisándole. Un jugador puede repetir como
              Host en varios torneos; la marca se desactiva sola al pasar la fecha de ese torneo. Si ya había iniciado
              sesión cuando se le asigna, debe salir y volver a entrar para ver la marca de "Modo Host".
            </div>
          </div>
        </>
      )}

      {confirmarHost && (
        <div className="modal-backdrop" onClick={() => hostGuardando === null && setConfirmarHost(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">🎙</div>
            <div className="modal-title">Asignar Host: {confirmarHost.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              <b>{confirmarHost.nombre}</b> quedará como Host del torneo del <b>{proximoTorneo?.fecha}</b>. Se le va a
              enviar un correo avisándole. Si alguien más ya era Host, se le quita automáticamente.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmarHost(null)} disabled={hostGuardando !== null}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={hostGuardando !== null} onClick={() => asignarHost(confirmarHost.id)}>
                {hostGuardando !== null ? "Un momento…" : "Sí, asignar y avisarle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
