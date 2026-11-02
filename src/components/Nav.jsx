// 119ª entrega: botón al dashboard "TOLS Estadísticas" (proyecciones, comparativos y estadísticas por
// jugador, sin dinero), que vive fuera del sitio. Se abre en otra pestaña y es igual para todos los roles.
const URL_ESTADISTICAS = "https://claude.ai/artifact/FHgPm8JGGgrFEBqXWtDXmA";
// 120ª entrega: la versión con dinero (deuda, ganancia, saldo, premios del campeonato) vive en un segundo
// dashboard, "TOLS Tesorería", y su botón solo se muestra a Administrador General, Administrador y Tesorero
// (mismo criterio que "Por resultado", 90ª entrega). El control real de quién abre el dashboard es su
// menú Compartir en claude.ai: el botón solo evita ofrecerlo a quien no debe verlo.
const URL_TESORERIA = "https://claude.ai/artifact/1Wgx4Jq5J6LjuKUaPUrgpc";
const puedeVerDinero = (rol) => rol === "Administrador General" || rol === "Administrador" || rol === "Tesorero";

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
          {puedeVerDinero(session.rol) && (
            <a className="nav-tab nav-tab-link" href={URL_TESORERIA} target="_blank" rel="noopener noreferrer">
              Tesorería ↗
            </a>
          )}
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
