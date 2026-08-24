import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import Nav from "./components/Nav.jsx";
import Calendario from "./components/Calendario.jsx";
import Tablero from "./components/Tablero.jsx";
import Perfiles from "./components/Perfiles.jsx";

const SESSION_KEY = "tols-session";

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

  return (
    <div className="wrap">
      <Nav active={tab} onChange={setTab} session={session} onLogout={handleLogout} />
      {tab === "calendario" && <Calendario />}
      {tab === "tablero" && <Tablero />}
      {tab === "perfiles" && <Perfiles session={session} />}
    </div>
  );
}
