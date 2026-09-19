import { useState } from "react";
import { MODULOS, NIVEL_LABEL } from "../lib/permisos.js";

const API = "/api/perfiles";
const API_IMPORTAR = "/api/perfiles-importar-excel";
const NIVELES = ["ninguno", "lectura", "escritura"];
// 42ª entrega: con contraseña (Administrador General) hay 5 columnas; sin ella (Administrador) son 4 —
// Administrador no puede ver ni tocar contraseñas, así que ni siquiera se le arma esa columna.
const USUARIOS_COLS_CON_PASS = "1fr 1.6fr 1fr 1.2fr 72px";
const USUARIOS_COLS_SIN_PASS = "1fr 1.8fr 1fr 72px";

// búsqueda tolerante a mayúsculas/acentos — así "jose" encuentra "José" o "JOSÉ"
const DIACRITICOS = new RegExp(String.fromCharCode(0x5b, 0x5c, 0x75, 0x30, 0x33, 0x30, 0x30, 0x2d, 0x5c, 0x75, 0x30, 0x33, 0x36, 0x66, 0x5d), "g");
function normalizarBusqueda(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase();
}

export default function Perfiles({ session, perfiles, onPerfilesChange }) {
  const isAdminGeneral = session.rol === "Administrador General";
  // 42ª entrega: Administrador (no solo Administrador General) ya puede entrar a esta pantalla, pero
  // nunca puede ver ni manipular contraseñas — eso sigue siendo exclusivo de Administrador General.
  const esAdmin = isAdminGeneral || session.rol === "Administrador";
  const USUARIOS_COLS = isAdminGeneral ? USUARIOS_COLS_CON_PASS : USUARIOS_COLS_SIN_PASS;
  const [draft, setDraft] = useState(perfiles);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [mostrar, setMostrar] = useState({}); // { [usuario_index]: bool } — ojo mostrar/ocultar contraseña
  const [cambiarPass, setCambiarPass] = useState(null); // { index, valor }
  const [importando, setImportando] = useState(false);
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState(false);
  const [confirmarImportar, setConfirmarImportar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [confirmarEliminar, setConfirmarEliminar] = useState(null); // { index, nombre }
  const [eliminando, setEliminando] = useState(false);
  const [eliminarError, setEliminarError] = useState("");

  const dirty = JSON.stringify(perfiles) !== JSON.stringify(draft);

  function set(updater) {
    setSaveOk(false);
    setDraft((prev) => {
      const next = structuredClone(prev);
      updater(next);
      return next;
    });
  }

  async function handleGuardar() {
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
      setDraft(json);
      onPerfilesChange(json);
      setSaveOk(true);
    } catch (e) {
      setSaveError(e.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelar() {
    setDraft(perfiles);
    setSaveError("");
    setSaveOk(false);
    setCambiarPass(null);
  }

  async function handleImportarExcel() {
    setImportando(true);
    setImportError("");
    setImportOk(false);
    try {
      const r = await fetch(API_IMPORTAR, { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo importar desde el Excel.");
      setDraft(json);
      onPerfilesChange(json);
      setImportOk(true);
      setSaveOk(false);
    } catch (e) {
      setImportError(e.message || "No se pudo importar desde el Excel.");
    } finally {
      setImportando(false);
      setConfirmarImportar(false);
    }
  }

  // elimina al usuario directamente de la base de datos (no pasa por "Guardar cambios" ni por el
  // draft en edición) — se pide confirmación antes porque no se puede deshacer
  async function handleEliminarUsuario() {
    if (!confirmarEliminar) return;
    setEliminando(true);
    setEliminarError("");
    try {
      const payload = structuredClone(perfiles);
      const idx = payload.usuarios.findIndex((u) => u.usuario === confirmarEliminar.usuario);
      if (idx === -1) throw new Error("Ese usuario ya no existe (puede que alguien más lo haya editado).");
      payload.usuarios.splice(idx, 1);
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo eliminar el usuario.");
      setDraft(json);
      onPerfilesChange(json);
      setConfirmarEliminar(null);
    } catch (e) {
      setEliminarError(e.message || "No se pudo eliminar el usuario.");
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♠ Torrente On Line Series - TOLS 3.0</div>
          <h1>Usuarios</h1>
          <p className="subtitle">
            Usuarios de la liga y permisos por módulo. La contraseña de cada quien vive en el sitio — no es
            seguridad bancaria, solo mantiene el sitio fuera de curiosos.
          </p>
        </div>
      </div>

      {esAdmin && (
        <div className="tablero-savebar">
          {saveError && <div className="login-error" style={{ margin: 0 }}>{saveError}</div>}
          {saveOk && !dirty && <div className="check-line check-ok" style={{ margin: 0 }}>✓ Cambios guardados.</div>}
          {dirty && !saveError && <div className="section-note">Tienes cambios sin guardar.</div>}
          {/* 42ª entrega: Importar desde Excel sobrescribe también las contraseñas (vienen de la misma
              hoja) — sigue siendo exclusivo de Administrador General, aunque Administrador ya entra aquí. */}
          {isAdminGeneral && (
            <button className="btn btn-secondary" onClick={() => setConfirmarImportar(true)} disabled={saving || importando}>
              {importando ? "Importando…" : "Importar desde Excel"}
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleCancelar} disabled={saving || !dirty}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
      {isAdminGeneral && importError && <div className="login-error">{importError}</div>}
      {isAdminGeneral && importOk && <div className="check-line check-ok">✓ Usuarios, permisos y jugadores actualizados desde el Excel.</div>}

      {esAdmin ? (
        <div className="section">
          <div className="section-head"><div className="section-title">Usuarios</div></div>
          <input
            className="field"
            style={{ maxWidth: 320, marginBottom: 10 }}
            type="text"
            placeholder="Buscar por nombre o correo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: USUARIOS_COLS }}>
              <div>Nombre</div><div>Correo electrónico</div><div>Perfil</div>{isAdminGeneral && <div>Contraseña</div>}<div />
            </div>
            {draft.usuarios
              .map((u, i) => ({ u, i }))
              .filter(({ u }) => {
                const q = normalizarBusqueda(busqueda);
                if (!q) return true;
                return normalizarBusqueda(u.nombre).includes(q) || normalizarBusqueda(u.correo).includes(q);
              })
              .map(({ u, i }) => (
                <div key={i}>
                  <div className="trow" style={{ gridTemplateColumns: USUARIOS_COLS }}>
                    <input className="field" value={u.nombre}
                      onChange={(e) => set((d) => { d.usuarios[i].nombre = e.target.value; })} />
                    <input className="field" type="email" value={u.correo}
                      onChange={(e) => set((d) => {
                        // el correo es también el usuario de acceso — se guardan iguales para no
                        // tener dos campos separados con el mismo valor
                        d.usuarios[i].correo = e.target.value;
                        d.usuarios[i].usuario = e.target.value;
                      })} />
                    <select className="field" value={u.rol}
                      onChange={(e) => set((d) => { d.usuarios[i].rol = e.target.value; })}>
                      {draft.roles.map((r) => <option key={r.tipo} value={r.tipo}>{r.tipo}</option>)}
                    </select>
                    {isAdminGeneral && (
                      <div className="pass-field">
                        <input
                          className="field"
                          type={mostrar[i] ? "text" : "password"}
                          value={u.password}
                          readOnly
                        />
                        <button
                          type="button"
                          className="btn-icon-eye"
                          title={mostrar[i] ? "Ocultar contraseña" : "Mostrar contraseña"}
                          onClick={() => setMostrar((m) => ({ ...m, [i]: !m[i] }))}
                        >
                          {mostrar[i] ? "🙈" : "👁"}
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {/* 42ª entrega: "Cambiar contraseña" es exclusivo de Administrador General —
                          Administrador nunca ve ni toca contraseñas. */}
                      {isAdminGeneral && (
                        <button
                          type="button"
                          className="btn-icon-eye"
                          title="Cambiar contraseña"
                          onClick={() => setCambiarPass(cambiarPass?.index === i ? null : { index: i, valor: "" })}
                        >
                          🔑
                        </button>
                      )}
                      <button className="btn-icon-remove" title="Eliminar usuario" disabled={draft.usuarios.length <= 1}
                        onClick={() => { setEliminarError(""); setConfirmarEliminar({ usuario: u.usuario, nombre: u.nombre || u.correo }); }}>✕</button>
                    </div>
                  </div>
                  {isAdminGeneral && cambiarPass?.index === i && (
                    <div className="trow" style={{ gridTemplateColumns: "1fr", paddingTop: 0 }}>
                      <div className="pass-change-row">
                        <input
                          className="field"
                          type="text"
                          placeholder="Nueva contraseña"
                          value={cambiarPass.valor}
                          onChange={(e) => setCambiarPass({ index: i, valor: e.target.value })}
                        />
                        <button
                          className="btn btn-primary btn-add"
                          disabled={!cambiarPass.valor.trim()}
                          onClick={() => {
                            set((d) => { d.usuarios[i].password = cambiarPass.valor.trim(); });
                            setCambiarPass(null);
                          }}
                        >
                          Confirmar
                        </button>
                        <button className="btn btn-secondary btn-add" onClick={() => setCambiarPass(null)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            {busqueda.trim() &&
              !draft.usuarios.some(
                (u) => normalizarBusqueda(u.nombre).includes(normalizarBusqueda(busqueda)) || normalizarBusqueda(u.correo).includes(normalizarBusqueda(busqueda))
              ) && <div className="section-sub">No se encontraron usuarios con ese criterio.</div>}
          </div>
        </div>
      ) : (
        <p className="subtitle">Solo el Administrador General y el Administrador pueden ver y administrar los usuarios de la liga.</p>
      )}

      {esAdmin && (
        <div className="section">
          <div className="section-head"><div className="section-title">Permisos por módulo</div></div>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: `1.2fr repeat(${MODULOS.length}, 1fr)` }}>
              <div>Perfil</div>
              {MODULOS.map((m) => <div className="right" key={m.key}>{m.label}</div>)}
            </div>
            {draft.roles.map((r, ri) => (
              <div className="trow" style={{ gridTemplateColumns: `1.2fr repeat(${MODULOS.length}, 1fr)` }} key={r.tipo}>
                <div><span className="badge badge-regular">{r.tipo}</span></div>
                {MODULOS.map((m) => (
                  <div className="right" key={m.key}>
                    <select
                      className="field"
                      value={r.permisos[m.key] || "ninguno"}
                      onChange={(e) => set((d) => { d.roles[ri].permisos[m.key] = e.target.value; })}
                    >
                      {NIVELES.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="section-sub">Cobranza (mod4) y Game Night (mod5) usan estos mismos permisos.</div>
        </div>
      )}

      {confirmarEliminar && (
        <div className="modal-backdrop" onClick={() => !eliminando && setConfirmarEliminar(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">🗑</div>
            <div className="modal-title">Eliminar usuario: {confirmarEliminar.nombre}</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Se va a eliminar la cuenta de <b>{confirmarEliminar.nombre}</b> de la base de datos. Esta acción no
              se puede deshacer.
            </p>
            {eliminarError && <div className="login-error">{eliminarError}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmarEliminar(null)} disabled={eliminando}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={handleEliminarUsuario} disabled={eliminando}>
                {eliminando ? "Eliminando…" : "Sí, eliminar"}
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
              Vas a reemplazar los usuarios y permisos <b>y los jugadores</b> guardados en el sitio con lo que
              haya <b>ahora mismo</b> en las hojas Jugadores y Permisos del Excel — Usuarios y Jugadores comparten
              la misma base de datos. Cualquier cambio hecho desde el sitio que no esté también en el Excel se va
              a perder. Esta acción no se puede deshacer.
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
