import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import Nav from "./components/Nav.jsx";
import Decor from "./components/Decor.jsx";
import Calendario from "./components/Calendario.jsx";
import Tablero from "./components/Tablero.jsx";
import Perfiles from "./components/Perfiles.jsx";
import { puedeVer } from "./lib/permisos.js";

const SESSION_KEY = "tols-session";

// Esta pantalla es la administración de toda la liga. El orden de las pestañas es fijo
// (Tablero de Control, Calendario, Cobranza, Jugadores); Cobranza todavía no existe como
// pantalla real, así que no aparece hasta que se construya. Game Night vive aparte, no aquí.
const TABS = [
  { key: "tablero", modKey: "mod2", label: "Tablero de Control", Component: Tablero },
  { key: "calendario", modKey: "mod1", label: "Calendario", Component: Calendario },
  { key: "jugadores", modKey: "mod3", label: "Jugadores", Component: Perfiles },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("tablero");

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
    setTab(firstAllowed ? firstAllowed.key : "tablero");
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
    return (
      <>
        <Decor />
        <Login onLogin={handleLogin} />
      </>
    );
  }

  // todas las pestañas se muestran siempre (para tener el panorama completo de la liga);
  // las que el rol no tiene permitidas aparecen deshabilitadas en vez de ocultarse
  const tabsConPermiso = TABS.map((t) => ({ ...t, permitido: puedeVer(session, t.modKey) }));
  const permitidas = tabsConPermiso.filter((t) => t.permitido);
  const active = permitidas.find((t) => t.key === tab) || permitidas[0];

  return (
    <>
      <Decor />
      <div className="wrap">
        <Nav tabs={tabsConPermiso} active={active?.key} onChange={setTab} session={session} onLogout={handleLogout} />
        {active ? (
          <active.Component session={session} />
        ) : (
          <p className="subtitle">Tu perfil no tiene acceso a ningún módulo todavía. Pídele a un administrador que revise tus permisos en Jugadores.</p>
        )}
      </div>
    </>
  );
}
