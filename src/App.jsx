import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import Nav from "./components/Nav.jsx";
import Decor from "./components/Decor.jsx";
import VersionBadge from "./components/VersionBadge.jsx";
import Calendario from "./components/Calendario.jsx";
import Tablero from "./components/Tablero.jsx";
import Perfiles from "./components/Perfiles.jsx";
import Jugadores from "./components/Jugadores.jsx";
import Cobranza from "./components/Cobranza.jsx";
import GameNight from "./components/GameNight.jsx";
import MiPerfil from "./components/MiPerfil.jsx";
import Registro from "./components/Registro.jsx";
import { puedeVer, puedeEditar } from "./lib/permisos.js";

const SESSION_KEY = "tols-session";
const ACTIVITY_KEY = "tols-last-activity";
const INACTIVIDAD_MS = 30 * 60 * 1000; // 30 minutos sin actividad → se cierra la sesión sola
const API_PERFILES = "/api/perfiles";
const API_JUGADORES = "/api/jugadores";
const API_CALENDARIO = "/api/calendario";
const API_CAMPEONATOS = "/api/campeonatos";

function isoHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Esta pantalla es la administración de toda la liga. El orden de las pestañas es fijo
// (Tablero de Control, Calendario, Cobranza, Jugadores, Game Night, Usuarios).
// La pestaña Usuarios (antes "Jugadores") la pueden ver Administrador General y Administrador,
// sin importar lo que diga la matriz de permisos — es un caso especial fuera de esa tabla. Dentro de la
// pantalla, solo el Administrador General puede ver/editar contraseñas (42ª entrega) — ver Perfiles.jsx.
// "Mi Perfil" es otro caso especial: solo la ve quien tiene rol "Jugador" (autoservicio de sus
// propios datos), sin importar la matriz de permisos tampoco — no es una pantalla de administración.
// Jugadores (mod6) y Cobranza (mod4) sí siguen la matriz normal de permisos.
// Game Night (mod5) es un caso especial más de visibilidad: además de la matriz normal de permisos,
// el Host asignado al próximo torneo SIEMPRE puede entrar a administrar esa partida, tenga o no su rol
// acceso de escritura a mod5 — por eso puedeVerTab() de abajo también revisa hostInfo.esHost para esta
// pestaña puntual.
const TABS = [
  { key: "tablero", modKey: "mod2", label: "Tablero de Control", Component: Tablero },
  { key: "calendario", modKey: "mod1", label: "Calendario", Component: Calendario },
  { key: "cobranza", modKey: "mod4", label: "Cobranza", Component: Cobranza },
  { key: "jugadores", modKey: "mod6", label: "Jugadores", Component: Jugadores },
  { key: "gamenight", modKey: "mod5", label: "Game Night", Component: GameNight, permiteHost: true },
  { key: "usuarios", modKey: "mod3", label: "Usuarios", Component: Perfiles, soloAdmins: true },
  { key: "miperfil", modKey: null, label: "Mi Perfil", Component: MiPerfil, siempreVisible: true },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("tablero");
  const [perfiles, setPerfiles] = useState(null);
  const [perfilesLoading, setPerfilesLoading] = useState(true);
  const [perfilesError, setPerfilesError] = useState("");
  // ruta simple: /registro muestra el autorregistro sin necesidad de login, sin librería de routing
  const [ruta, setRuta] = useState(typeof window !== "undefined" ? window.location.pathname : "/");
  // esHost: si el usuario en sesión es el Jugador asignado como Host del próximo Game Night (se
  // recalcula cada vez que hay sesión — por eso hay que salir y volver a entrar para que se refleje un
  // cambio reciente). faltaHost: si quien entró puede gestionar Jugadores y no hay Host asignado todavía.
  const [hostInfo, setHostInfo] = useState({ esHost: false, faltaHost: false, proximaFecha: "" });

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

  // se recalcula "modo Host" y "falta asignar Host" cada vez que hay una sesión activa (y cuando ya
  // están los perfiles, para saber si puede gestionar Jugadores) — a propósito no queda "en vivo": si el
  // Host cambia mientras alguien tiene el sitio abierto, hay que salir y volver a entrar para verlo
  useEffect(() => {
    if (!session || !perfiles) return;
    Promise.all([
      fetch(API_JUGADORES).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_CALENDARIO).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_CAMPEONATOS).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([jug, cal, camp]) => {
      const correo = (session.usuario || "").trim().toLowerCase();
      const miJugador = (jug?.jugadores || []).find((j) => j.correo === correo);
      const esHost = miJugador?.host === true;

      const activo = camp?.activo || "";
      const hoy = isoHoy();
      const proximos = (cal?.torneos || [])
        .filter((t) => (activo ? t.temporada === activo : true) && t.fecha >= hoy)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      const hayHost = (jug?.jugadores || []).some((j) => j.host === true);
      const puedeGestionarJugadores = puedeEditar(perfiles, session, "mod6") || session.rol === "Administrador General";
      const faltaHost = puedeGestionarJugadores && proximos.length > 0 && !hayHost;

      setHostInfo({ esHost, faltaHost, proximaFecha: proximos[0]?.fecha || "" });
    });
  }, [session, perfiles]);

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

  function esAdmin(rol) {
    return rol === "Administrador General" || rol === "Administrador";
  }

  function puedeVerTab(t) {
    if (t.siempreVisible) return true;
    if (t.soloAdmins) return esAdmin(session?.rol);
    if (t.permiteHost && hostInfo.esHost) return true;
    return puedeVer(perfiles, session, t.modKey);
  }

  function handleLogin(s) {
    setSession(s);
    const firstAllowed = TABS.find((t) =>
      t.siempreVisible ? true : t.soloAdmins ? esAdmin(s.rol) : puedeVer(perfiles, s, t.modKey)
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
        <VersionBadge />
        <Registro onRegistroExitoso={handleRegistroExitoso} onIrALogin={() => irARuta("/")} />
      </>
    );
  }

  if (perfilesLoading) {
    return (
      <>
        <Decor />
        <VersionBadge />
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
        <VersionBadge />
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
        <VersionBadge />
        <Login perfiles={perfiles} onLogin={handleLogin} />
      </>
    );
  }

  // todas las pestañas se muestran siempre (para tener el panorama completo de la liga);
  // las que el rol no tiene permitidas aparecen deshabilitadas en vez de ocultarse — EXCEPCIÓN: el
  // rol "Jugador" tiene una experiencia reducida a propósito (pedido de Federico) y solo debe ver
  // Calendario, Game Night y Mi Perfil; el resto de las pestañas se oculta por completo para ese rol,
  // no solo se deshabilita.
  const SOLO_JUGADOR_TABS = ["calendario", "gamenight", "miperfil"];
  const tabsConPermiso = TABS.map((t) => ({ ...t, permitido: puedeVerTab(t) })).filter(
    (t) => session.rol !== "Jugador" || SOLO_JUGADOR_TABS.includes(t.key)
  );
  const permitidas = tabsConPermiso.filter((t) => t.permitido);
  const active = permitidas.find((t) => t.key === tab) || permitidas[0];

  return (
    <>
      <Decor />
      <VersionBadge />
      <div className="wrap">
        <Nav tabs={tabsConPermiso} active={active?.key} onChange={setTab} session={session} onLogout={handleLogout} esHost={hostInfo.esHost} />
        {hostInfo.faltaHost && (
          <div className="campeonato-banner campeonato-banner-alerta" style={{ marginBottom: 16 }}>
            ⚠ No hay Host asignado para el próximo torneo ({hostInfo.proximaFecha}). Sin Host no se puede
            iniciar el Game Night — ve a la pestaña Jugadores para asignarlo.
          </div>
        )}
        {active ? (
          <active.Component session={session} perfiles={perfiles} onPerfilesChange={setPerfiles} esHost={hostInfo.esHost} />
        ) : (
          <p className="subtitle">Tu perfil no tiene acceso a ningún módulo todavía. Pídele a un administrador que revise tus permisos.</p>
        )}
      </div>
    </>
  );
}
