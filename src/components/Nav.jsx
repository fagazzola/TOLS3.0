export default function Nav({ tabs, active, onChange, session, onLogout }) {
  return (
    <>
      <div className="nav">
        <div className="nav-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={"nav-tab" + (active === t.key ? " active" : "")}
              onClick={() => onChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="nav-session">
          {session.nombre} · {session.rol}
          <button className="btn btn-secondary" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </div>
      <div className="suit-divider" aria-hidden="true">
        <span className="suit-black">♠</span>
        <span className="suit-red">♥</span>
        <span className="suit-red">♦</span>
        <span className="suit-black">♣</span>
      </div>
    </>
  );
}
