import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import Nav from "./components/Nav.jsx";
import Decor from "./components/Decor.jsx";
import Calendario from "./components/Calendario.jsx";
import Tablero from "./components/Tablero.jsx";
import Perfiles from "./components/Perfiles.jsx";
import Jugadores from "./components/Jugadores.jsx";
import Registro from "./components/Registro.jsx";
import { puedeVer } from "./lib/permisos.js";

const SESSION_KEY = "tols-session";
const ACTIVITY_KEY = "tols-last-activity";
const INACTIVIDAD_MS = 30 * 60 * 1000; // 30 minutos sin actividad → se cierra la sesión sola
const API_PERFILES = "/api/perfiles";

// Esta pantalla es la administración de toda la liga. El orden de las pestañas es fijo
// (Tablero de Control, Calendario, Cobranza, Usuarios, Jugadores); Cobranza todavía no existe
// como pantalla real, así que no aparece hasta que se construya. Game Night vive aparte, no aquí.
// La pestaña Usuarios (antes "Jugadores") solo la puede ver el Administrador General,
// sin importar lo que diga la matriz de permisos — es un caso especial fuera de esa tabla.
// Jugadores (mod6) sí sigue la matriz normal de permisos — es el directorio de autorregistro.
const TABS = [
  { key: "tablero", modKey: "mod2", label: "Tablero de Control", Component: Tablero },
  { key: "calendario", modKey: "mod1", label: "Calendario", Component: Calendario },
  { key: "jugadores", modKey: "mod6", label: "Jugadores", Component: Jugadores },
  { key: "usuarios", modKey: "mod3", label: "Usuarios", Component: Perfiles, soloAdminGeneral: true },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("tablero");
  const [perfiles, setPerfiles] = useState(null);
  const [perfilesLoading, setPerfilesLoading] = useState(true);
  const [perfilesError, setPerfilesError] = useState("");
  // ruta simple: /registro muestra el autorregistro sin necesidad de login, sin librería de routing
  const [ruta, setRuta] = useState(typeof window !== "undefined" ? window.location.pathname : "/");

  useEffect(() => {
    const onPop = () => setRuta(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const ultima = Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
        if (Date.now() - ultima > INACTIVIDAD_MS) {
          // la sesión se quedó "colgada" más de 30 minutos sin actividad — se descarta sola
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(ACTIVITY_KEY);
        } else {
          setSession(JSON.parse(raw));
          localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
        }
      }
    } catch (e) {
      // localStorage no disponible — se pedirá login normalmente
    }
    cargarPerfiles();
  }, []);

  // mientras hay sesión activa, cualquier interacción del usuario marca actividad; cada minuto se
  // revisa si ya pasaron 30 minutos sin ninguna — si es así, se cierra la sesión y regresa al login
  useEffect(() => {
    if (!session) return;
    let ultimoRegistro = 0;
    const marcarActividad = () => {
      const ahora = Date.now();
      if (ahora - ultimoRegistro < 5000) return; // evita escribir en cada mousemove
      ultimoRegistro = ahora;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(ahora));
      } catch (e) {}
    };
    const eventos = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    eventos.forEach((ev) => window.addEventListener(ev, marcarActividad));
    marcarActividad();

    const intervalo = setInterval(() => {
      try {
        const ultima = Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
        if (Date.now() - ultima > INACTIVIDAD_MS) {
          handleLogout();
        }
      } catch (e) {}
    }, 60 * 1000);

    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, marcarActividad));
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function cargarPerfiles() {
    setPerfilesLoading(true);
    setPerfilesError("");
    fetch(API_PERFILES)
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la lista de usuarios (HTTP " + r.status + ").");
        return r.json();
      })
      .then((json) => setPerfiles(json))
      .catch((e) => setPerfilesError(e.message || "Error al cargar usuarios."))
      .finally(() => setPerfilesLoading(false));
  }

  function puedeVerTab(t) {
    if (t.soloAdminGeneral) return session?.rol === "Administrador General";
    return puedeVer(perfiles, session, t.modKey);
  }

  function handleLogin(s) {
    setSession(s);
    const firstAllowed = TABS.find((t) =>
      t.soloAdminGeneral ? s.rol === "Administrador General" : puedeVer(perfiles, s, t.modKey)
    );
    setTab(firstAllowed ? firstAllowed.key : "tablero");
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    } catch (e) {}
  }

  function handleLogout() {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
    } catch (e) {}
  }

  function irARuta(nueva) {
    setRuta(nueva);
    try {
      window.history.pushState({}, "", nueva);
    } catch (e) {}
  }

  function handleRegistroExitoso(s) {
    handleLogin(s);
    irARuta("/");
  }

  if (ruta === "/registro" && !session) {
    return (
      <>
        <Decor />
        <Registro onRegistroExitoso={handleRegistroExitoso} onIrALogin={() => irARuta("/")} />
      </>
    );
  }

  if (perfilesLoading) {
    return (
      <>
        <Decor />
        <div className="wrap">
          <p className="subtitle">Cargando…</p>
        </div>
      </>
    );
  }

  if (perfilesError || !perfiles) {
    return (
      <>
        <Decor />
        <div className="wrap">
          <p className="subtitle">No se pudo cargar la información de usuarios: {perfilesError}</p>
          <p className="section-sub">
            Si el sitio se acaba de desplegar, confirma que la función <code>/api/perfiles</code> y el paquete{" "}
            <code>@netlify/blobs</code> están publicados.
          </p>
        </div>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Decor />
        <Login perfiles={perfiles} onLogin={handleLogin} />
      </>
    );
  }

  // todas las pestañas se muestran siempre (para tener el panorama completo de la liga);
  // las que el rol no tiene permitidas aparecen deshabilitadas en vez de ocultarse
  const tabsConPermiso = TABS.map((t) => ({ ...t, permitido: puedeVerTab(t) }));
  const permitidas = tabsConPermiso.filter((t) => t.permitido);
  const active = permitidas.find((t) => t.key === tab) || permitidas[0];

  return (
    <>
      <Decor />
      <div className="wrap">
        <Nav tabs={tabsConPermiso} active={active?.key} onChange={setTab} session={session} onLogout={handleLogout} />
        {active ? (
          <active.Component session={session} perfiles={perfiles} onPerfilesChange={setPerfiles} />
        ) : (
          <p className="subtitle">Tu perfil no tiene acceso a ningún módulo todavía. Pídele a un administrador que revise tus permisos.</p>
        )}
      </div>
    </>
  );
}
