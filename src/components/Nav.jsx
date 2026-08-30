export default function Nav({ tabs, active, onChange, session, onLogout, esHost }) {
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
        </div>
        <div className="nav-session">
          {esHost && <span className="badge badge-host" title="Eres el Host del próximo Game Night">🎙 Modo Host</span>}
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
