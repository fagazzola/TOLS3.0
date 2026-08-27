import { useState } from "react";
import { MODULOS, NIVEL_LABEL } from "../lib/permisos.js";

const API = "/api/perfiles";
const API_IMPORTAR = "/api/perfiles-importar-excel";
const NIVELES = ["ninguno", "lectura", "escritura"];

function nuevoUsuario() {
  return { nombre: "", usuario: "", correo: "", password: "", rol: "" };
}

export default function Perfiles({ session, perfiles, onPerfilesChange }) {
  const isAdminGeneral = session.rol === "Administrador General";
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

      {isAdminGeneral && (
        <div className="tablero-savebar">
          {saveError && <div className="login-error" style={{ margin: 0 }}>{saveError}</div>}
          {saveOk && !dirty && <div className="check-line check-ok" style={{ margin: 0 }}>✓ Cambios guardados.</div>}
          {dirty && !saveError && <div className="section-note">Tienes cambios sin guardar.</div>}
          <button className="btn btn-secondary" onClick={() => setConfirmarImportar(true)} disabled={saving || importando}>
            {importando ? "Importando…" : "Importar desde Excel"}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleCancelar} disabled={saving || !dirty}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
      {isAdminGeneral && importError && <div className="login-error">{importError}</div>}
      {isAdminGeneral && importOk && <div className="check-line check-ok">✓ Usuarios y permisos actualizados desde el Excel.</div>}

      {isAdminGeneral ? (
        <div className="section">
          <div className="section-head"><div className="section-title">Usuarios</div></div>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: "1fr 1.6fr 1fr 1.2fr 40px" }}>
              <div>Nombre</div><div>Correo electrónico</div><div>Perfil</div><div>Contraseña</div><div />
            </div>
            {draft.usuarios.map((u, i) => (
              <div key={i}>
                <div className="trow" style={{ gridTemplateColumns: "1fr 1.6fr 1fr 1.2fr 40px" }}>
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
                  <button className="btn-icon-remove" title="Quitar usuario" disabled={draft.usuarios.length <= 1}
                    onClick={() => set((d) => { d.usuarios.splice(i, 1); })}>✕</button>
                </div>
                <div className="trow" style={{ gridTemplateColumns: "1fr", paddingTop: 0 }}>
                  {cambiarPass?.index === i ? (
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
                  ) : (
                    <button
                      className="btn btn-secondary btn-add"
                      onClick={() => setCambiarPass({ index: i, valor: "" })}
                    >
                      Cambiar contraseña
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-secondary btn-add"
            onClick={() => set((d) => { d.usuarios.push({ ...nuevoUsuario(), rol: d.roles[0]?.tipo || "" }); })}
          >
            + Agregar usuario
          </button>
        </div>
      ) : (
        <p className="subtitle">Solo el Administrador General puede ver y administrar los usuarios de la liga.</p>
      )}

      {isAdminGeneral && (
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
          <div className="section-sub">Cobranza y Game Night aún no están construidos — los permisos ya quedaron definidos para cuando existan.</div>
        </div>
      )}

      {confirmarImportar && (
        <div className="modal-backdrop" onClick={() => !importando && setConfirmarImportar(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge danger">📥</div>
            <div className="modal-title">Importar desde Excel</div>
            <p className="section-sub">
              Vas a reemplazar los usuarios y permisos guardados en el sitio con lo que haya <b>ahora mismo</b>{" "}
              en las hojas Usuarios y Permisos del Excel. Cualquier cambio hecho desde el sitio que no esté
              también en el Excel se va a perder. Esta acción no se puede deshacer.
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
