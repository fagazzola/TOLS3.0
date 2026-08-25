import data from "../data/perfiles.json";
import { MODULOS, NIVEL_LABEL } from "../lib/permisos.js";

function mask(s) {
  return "•".repeat(Math.max(6, String(s || "").length));
}

function nivelBadgeClass(nivel) {
  if (nivel === "escritura") return "badge-nivel-escritura";
  if (nivel === "lectura") return "badge-nivel-lectura";
  return "badge-nivel-ninguno";
}

export default function Perfiles({ session }) {
  const isAdminGeneral = session.rol === "Administrador General";

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♠ Torrente On Line Series - TOLS 3.0</div>
          <h1>Jugadores</h1>
          <p className="subtitle">
            Roles y permisos de la liga, módulo por módulo, y la lista de usuarios. La contraseña de cada quien vive
            en el código del sitio — no es seguridad bancaria, solo mantiene el sitio fuera de curiosos.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Permisos por módulo</div></div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: `1.2fr repeat(${MODULOS.length}, 1fr)` }}>
            <div>Tipo</div>
            {MODULOS.map((m) => <div className="right" key={m.key}>{m.label}</div>)}
          </div>
          {data.roles.map((r) => (
            <div className="trow" style={{ gridTemplateColumns: `1.2fr repeat(${MODULOS.length}, 1fr)` }} key={r.tipo}>
              <div><span className="badge badge-regular">{r.tipo}</span></div>
              {MODULOS.map((m) => {
                const nivel = r.permisos[m.key] || "ninguno";
                return (
                  <div className="right" key={m.key}>
                    <span className={"badge " + nivelBadgeClass(nivel)}>{NIVEL_LABEL[nivel]}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="section-sub">Cobranza y Game Night aún no están construidos — los permisos ya quedaron definidos para cuando existan.</div>
      </div>

      {isAdminGeneral && (
        <div className="section">
          <div className="section-head"><div className="section-title">Usuarios</div></div>
          <div className="section-sub">Solo Administrador General ve esta lista completa.</div>
          <div className="tbl">
            <div className="trow thead" style={{ gridTemplateColumns: "1fr 1fr 90px 1fr" }}>
              <div>Nombre</div><div>Usuario</div><div>Contraseña</div><div>Rol</div>
            </div>
            {data.usuarios.map((u, i) => (
              <div className="trow" style={{ gridTemplateColumns: "1fr 1fr 90px 1fr" }} key={i}>
                <div>{u.nombre}</div>
                <div className="num">{u.usuario}</div>
                <div className="num">{mask(u.password)}</div>
                <div><span className="badge badge-regular">{u.rol}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
