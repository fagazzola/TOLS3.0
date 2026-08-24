import data from "../data/perfiles.json";

function mask(s) {
  return "•".repeat(Math.max(6, String(s || "").length));
}

export default function Perfiles({ session }) {
  const isAdminGeneral = session.rol === "Administrador General";

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♠ Torrente On Line Series · Temporada 2026 · MOD 3</div>
          <h1>Perfiles de usuario</h1>
          <p className="subtitle">
            Roles y accesos de la liga. La contraseña de cada quien vive en el código del sitio — no es seguridad
            bancaria, solo mantiene el sitio fuera de curiosos.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Roles</div></div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: "1fr 1.4fr 1fr" }}>
            <div>Tipo</div><div>Acceso</div><div>Permisos</div>
          </div>
          {data.roles.map((r, i) => (
            <div className="trow" style={{ gridTemplateColumns: "1fr 1.4fr 1fr" }} key={i}>
              <div><span className="badge badge-regular">{r.tipo}</span></div>
              <div>{r.acceso}</div>
              <div>{r.permisos}</div>
            </div>
          ))}
        </div>
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

      <footer className="page-footer">Fuente: Excel maestro TOLS 3.0 · MOD 3 · Liga Torrente</footer>
    </div>
  );
}
