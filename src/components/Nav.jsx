const TABS = [
  { key: "calendario", label: "MOD 1 · Calendario" },
  { key: "tablero", label: "MOD 2 · Tablero" },
  { key: "perfiles", label: "MOD 3 · Perfiles" },
];

export default function Nav({ active, onChange, session, onLogout }) {
  return (
    <div className="nav">
      <div className="nav-tabs">
        {TABS.map((t) => (
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
  );
}
