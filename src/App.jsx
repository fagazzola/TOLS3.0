import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import Nav from "./components/Nav.jsx";
import Calendario from "./components/Calendario.jsx";
import Tablero from "./components/Tablero.jsx";
import Perfiles from "./components/Perfiles.jsx";
import { puedeVer } from "./lib/permisos.js";

const SESSION_KEY = "tols-session";

const TABS = [
  { key: "calendario", modKey: "mod1", label: "MOD 1 · Calendario", Component: Calendario },
  { key: "tablero", modKey: "mod2", label: "MOD 2 · Tablero", Component: Tablero },
  { key: "perfiles", modKey: "mod3", label: "MOD 3 · Perfiles", Component: Perfiles },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("calendario");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch (e) {
      // localStorage no disponible — se pedirá login normalmente
    }
  }, []);

  function handleLogin(s) {
    setSession(s);
    const firstAllowed = TABS.find((t) => puedeVer(s, t.modKey));
    setTab(firstAllowed ? firstAllowed.key : "calendario");
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function handleLogout() {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  const visibleTabs = TABS.filter((t) => puedeVer(session, t.modKey));
  const active = visibleTabs.find((t) => t.key === tab) || visibleTabs[0];

  return (
    <div className="wrap">
      <Nav tabs={visibleTabs} active={active?.key} onChange={setTab} session={session} onLogout={handleLogout} />
      {active ? (
        <active.Component session={session} />
      ) : (
        <p className="subtitle">Tu perfil no tiene acceso a ningún módulo todavía. Pídele a un administrador que revise tus permisos en MOD 3.</p>
      )}
    </div>
  );
}
