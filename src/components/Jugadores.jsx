import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";

const API = "/api/jugadores";
const API_IMPORTAR = "/api/jugadores-importar-excel";
// 66ª entrega: se quitó la columna Host (el concepto de Host desapareció por completo del sitio —
// ver netlify/functions/jugadores.js). Vuelve a ser 6 columnas de contenido.
const COLS = "56px 1.3fr 1fr 1.9fr 1fr 0.95fr";

// Pantalla de solo consulta del directorio de jugadores (los datos personales los llena cada jugador
// al autorregistrarse, o llegan importados desde la hoja Jugadores del Excel). Únicamente se pueden
// editar Padrino y Estatus desde aquí — el resto se muestra sin poder tocarse.
export default function Jugadores({ session, perfiles, onPerfilesChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null); // { id, padrino, estatus }
  const [guardando, setGuardando] = useState(false);
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
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la lista de jugadores (HTTP " + r.status + ").");
        return r.json();
      })
      .then((jugadores) => setData(jugadores))
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

  async function handleImportarExcel() {
    setImportando(true);
    setImportError("");
    setImportOk(false);
    try {
      const r = await fetch(API_IMPORTAR, { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo importar desde el Excel.");
      const { perfiles: perfilesActualizados, ...jugadoresJson } = json;
      setData(jugadoresJson);
      if (perfilesActualizados && onPerfilesChange) onPerfilesChange(perfilesActualizados);
      setImportOk(true);
    } catch (e) {
      setImportError(e.message || "No se pudo importar desde el Excel.");
    } finally {
      setImportando(false);
      setConfirmarImportar(false);
    }
  }

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
            Directorio de jugadores. Solo se pueden editar Padrino y Estatus.
          </p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {puedeEscribir && (
        <div className="tablero-savebar">
          <button className="btn btn-secondary" onClick={() => setConfirmarImportar(true)} disabled={importando}>
            {importando ? "Importando…" : "Importar desde Excel"}
          </button>
          {importOk && <div className="check-line check-ok" style={{ margin: 0 }}>✓ Jugadores y Usuarios actualizados desde el Excel.</div>}
        </div>
      )}
      {puedeEscribir && importError && <div className="login-error">{importError}</div>}

      {loading ? (
        <p className="subtitle">Cargando…</p>
      ) : (
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
              <div>Reg</div><div>Nombre</div><div>Alias PokerStars</div><div>Correo electrónico</div><div>Padrino</div><div>Estatus</div>
            </div>
            {jugadoresFiltrados.map((j) => {
              const enEdicion = editando?.id === j.id;
              return (
                <div className="trow" style={{ gridTemplateColumns: COLS }} key={j.id}>
                  <div className="num">{String(j.id).padStart(2, "0")}</div>
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
      )}

      {confirmarImportar && (
        <div className="modal-backdrop" onClick={() => !importando && setConfirmarImportar(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">📥</div>
            <div className="modal-title">Importar desde Excel</div>
            <p className="section-sub">
              Vas a reemplazar los jugadores <b>y los usuarios/permisos</b> guardados en el sitio con lo que haya{" "}
              <b>ahora mismo</b> en la hoja Jugadores (y Permisos) del Excel — Jugadores y Usuarios comparten la
              misma base de datos. Cualquier cambio hecho desde el sitio que no esté también en el Excel se va a
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
