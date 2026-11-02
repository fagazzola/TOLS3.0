// 119ª/120ª/121ª entrega: un solo botón, "Estadísticas y proyecciones", que abre el dashboard externo en
// otra pestaña. Jugadores (y cualquier otro rol) abren "TOLS Estadísticas", que no contiene dinero;
// Administrador General, Administrador y Tesorero abren "TOLS Tesorería", que es el mismo dashboard más
// la sección de dinero. Son dos artefactos distintos porque un artefacto no distingue roles: el dinero no
// debe viajar en los archivos del que abren los jugadores. El control real de quién abre cada uno es su
// menú Compartir en claude.ai.
const URL_ESTADISTICAS = "https://claude.ai/artifact/FHgPm8JGGgrFEBqXWtDXmA";
const URL_TESORERIA = "https://claude.ai/artifact/1Wgx4Jq5J6LjuKUaPUrgpc";
const puedeVerDinero = (rol) => rol === "Administrador General" || rol === "Administrador" || rol === "Tesorero";

export default function Nav({ tabs, active, onChange, session, onLogout, rolEfectivo }) {
  // 122ª entrega: con "Ver como jugador" activo, el botón debe abrir la versión de jugadores (sin dinero)
  // aunque la sesión real sea de Administrador/Tesorero; App.jsx pasa el rol efectivo.
  const rolBoton = rolEfectivo || session.rol;
  return (
    <>
      <div className="nav">
        <div className="nav-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={"nav-tab" + (active === t.key ? " active" : "") + (t.permitido === false ? " nav-tab-disabled" : "")}
              disabled={t.permitido === false}
              title={t.permitido === false ? "Tu perfil no tiene acceso a este módulo" : undefined}
              onClick={() => t.permitido !== false && onChange(t.key)}
            >
              {t.label}
            </button>
          ))}
          <a
            className="nav-tab nav-tab-link"
            href={puedeVerDinero(rolBoton) ? URL_TESORERIA : URL_ESTADISTICAS}
            target="_blank"
            rel="noopener noreferrer"
          >
            Estadísticas y proyecciones ↗
          </a>
        </div>
        <div className="nav-session">
          {session.nombre} · {session.rol}
          <button className="btn btn-secondary" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </div>
      <div className="suit-divider" aria-hidden="true">
        <span className="suit-red">♥</span>
        <span className="suit-black">♣</span>
        <span className="suit-red">♦</span>
        <span className="suit-black">♠</span>
      </div>
    </>
  );
}
