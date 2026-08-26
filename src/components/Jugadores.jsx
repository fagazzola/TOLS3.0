import { useEffect, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";

const API = "/api/jugadores";

export default function Jugadores({ session, perfiles }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null); // { id, padrino, estatus }
  const [guardando, setGuardando] = useState(false);

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
      .then((json) => setData(json))
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
        <div className="section">
          <div className="section-head"><div className="section-title">Jugadores registrados ({data?.jugadores?.length || 0})</div></div>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: "40px 1.4fr 1fr 1fr 1fr 1fr 0.8fr 0.9fr" }}>
              <div /><div>Nombre</div><div>Alias</div><div>PokerStars</div><div>Correo</div><div>Padrino</div><div>Edad</div><div>Estatus</div>
            </div>
            {(data?.jugadores || []).map((j) => {
              const enEdicion = editando?.id === j.id;
              return (
                <div className="trow" style={{ gridTemplateColumns: "40px 1.4fr 1fr 1fr 1fr 1fr 0.8fr 0.9fr" }} key={j.id}>
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
                </div>
              );
            })}
          </div>
          {(!data?.jugadores || data.jugadores.length === 0) && (
            <div className="section-sub">Todavía no hay jugadores registrados. Compárteles la liga de autorregistro.</div>
          )}
        </div>
      )}
    </div>
  );
}
