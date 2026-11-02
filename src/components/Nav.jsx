// 119ª entrega: botón al dashboard "TOLS Estadísticas" (proyecciones, comparativos y estadísticas por
// jugador, sin dinero), que vive fuera del sitio. Se abre en otra pestaña y es igual para todos los roles.
const URL_ESTADISTICAS = "https://claude.ai/artifact/FHgPm8JGGgrFEBqXWtDXmA";

export default function Nav({ tabs, active, onChange, session, onLogout }) {
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
          <a className="nav-tab nav-tab-link" href={URL_ESTADISTICAS} target="_blank" rel="noopener noreferrer">
            Estadísticas ↗
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
