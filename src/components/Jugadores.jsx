import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";

const API = "/api/jugadores";
const API_CAL = "/api/calendario";
const API_CAMP = "/api/campeonatos";
const API_IMPORTAR = "/api/jugadores-importar-excel";
const COLS = "repeat(6, 1fr)";

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Pantalla de solo consulta del directorio de jugadores (los datos personales los llena cada jugador
// al autorregistrarse, o llegan importados desde la hoja Jugadores del Excel). Únicamente se pueden
// editar Padrino, Estatus y Host desde aquí — el resto se muestra sin poder tocarse.
export default function Jugadores({ session, perfiles }) {
  const [data, setData] = useState(null);
  const [proximoTorneo, setProximoTorneo] = useState(null); // { fecha, ... } | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null); // { id, padrino, estatus }
  const [guardando, setGuardando] = useState(false);
  const [hostGuardando, setHostGuardando] = useState(null); // id del jugador en proceso
  const [hostAviso, setHostAviso] = useState("");
  const [confirmarHost, setConfirmarHost] = useState(null); // { id, nombre, habiaOtro }
  const [filtroEstatus, setFiltroEstatus] = useState("Todos"); // "Todos" | "Activo" | "Inactivo"
  const [importando, setImportando] = useState(false);
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState(false);
  const [confirmarImportar, setConfirmarImportar] = useState(false);

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

  async function handleImportarExcel() {
    setImportando(true);
    setImportError("");
    setImportOk(false);
    try {
      const r = await fetch(API_IMPORTAR, { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo importar desde el Excel.");
      setData(json);
      setImportOk(true);
    } catch (e) {
      setImportError(e.message || "No se pudo importar desde el Excel.");
    } finally {
      setImportando(false);
      setConfirmarImportar(false);
    }
  }

  const hostActual = data?.jugadores?.find((j) => j.host);
  const jugadoresFiltrados = (data?.jugadores || []).filter(
    (j) => filtroEstatus === "Todos" || j.estatus === filtroEstatus
  );

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Jugadores</h1>
          <p className="subtitle">
            Directorio de jugadores. Solo se pueden editar Padrino, Estatus y Host — el resto de los datos los
            llena cada jugador al autorregistrarse, o se importan desde la hoja Jugadores del Excel.
          </p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {puedeEscribir && (
        <div className="tablero-savebar">
          <button className="btn btn-secondary" onClick={() => setConfirmarImportar(true)} disabled={importando}>
            {importando ? "Importando…" : "Importar desde Excel"}
          </button>
          {importOk && <div className="check-line check-ok" style={{ margin: 0 }}>✓ Jugadores actualizados desde el Excel.</div>}
        </div>
      )}
      {puedeEscribir && importError && <div className="login-error">{importError}</div>}

      {loading ? (
        <p className="subtitle">Cargando…</p>
      ) : (
        <>
          {puedeEscribir && proximoTorneo && (
            <div className={"campeonato-banner" + (!hostActual ? " campeonato-banner-alerta" : "")}>
              {hostActual ? (
                <>Próximo torneo — {proximoTorneo.fecha} — Host asignado: <strong>{hostActual.nombre}</strong></>
              ) : (
                <>⚠ No hay Host asignado para el próximo torneo ({proximoTorneo.fecha}). Sin Host no se puede iniciar el Game Night — asígnalo abajo.</>
              )}
            </div>
          )}
          {hostAviso && <div className="login-error" style={{ marginTop: 10 }}>{hostAviso}</div>}

          <div className="section">
            <div className="section-head">
              <div className="section-title">Jugadores</div>
              <div className="filtro-estatus" style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {["Activos", "Inactivos", "Todos"].map((op) => {
                  const valor = op === "Activos" ? "Activo" : op === "Inactivos" ? "Inactivo" : "Todos";
                  return (
                    <button
                      key={op}
                      className={"btn btn-secondary btn-filtro" + (filtroEstatus === valor ? " active" : "")}
                      onClick={() => setFiltroEstatus(valor)}
                    >
                      {op}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="tbl tbl-compacta">
              <div className="trow thead" style={{ gridTemplateColumns: COLS }}>
                <div>Nombre</div><div>Alias PokerStars</div><div>Correo electrónico</div><div>Padrino</div><div>Estatus</div><div>Host</div>
              </div>
              {jugadoresFiltrados.map((j) => {
                const enEdicion = editando?.id === j.id;
                return (
                  <div className="trow" style={{ gridTemplateColumns: COLS }} key={j.id}>
                    <div>{j.nombre}</div>
                    <div>{j.aliasPokerStars}</div>
                    <div>{j.correo}</div>
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
                            onClick={() => setConfirmarHost({ id: j.id, nombre: j.nombre, habiaOtro: !!hostActual && hostActual.id !== j.id })}
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
            {data?.jugadores?.length > 0 && jugadoresFiltrados.length === 0 && (
              <div className="section-sub">No hay jugadores que coincidan con este filtro.</div>
            )}
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
              enviar un correo avisándole.{" "}
              {confirmarHost.habiaOtro
                ? <>El Host que estaba asignado antes se quita automáticamente.</>
                : null}
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

      {confirmarImportar && (
        <div className="modal-backdrop" onClick={() => !importando && setConfirmarImportar(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">📥</div>
            <div className="modal-title">Importar desde Excel</div>
            <p className="section-sub">
              Vas a reemplazar los jugadores guardados en el sitio con lo que haya <b>ahora mismo</b> en la hoja
              Jugadores del Excel. Cualquier cambio hecho desde el sitio que no esté también en el Excel se va a
              perder. Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmarImportar(false)} disabled={importando}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={handleImportarExcel} disabled={importando}>
                {importando ? "Importando…" : "Sí, importar y reemplazar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
