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
const API_PARAMETROS = "/api/parametros";

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
  // 59ª entrega: interruptor de acceso al portal (Parámetros Generales, dentro de Tablero de Control).
  // parametros === null mientras carga (o si la función aún no existe) — se trata igual que "portal
  // encendido" para no dejar a nadie fuera por un error de red o un despliegue a medias.
  const [parametros, setParametros] = useState(null);
  // en la pantalla de mantenimiento, deja al administrador "colarse" al formulario de login normal —
  // el interruptor vive dentro del sitio, así que un administrador SIEMPRE necesita poder entrar.
  const [mostrarLoginAdmin, setMostrarLoginAdmin] = useState(false);

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
    cargarParametros();
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
      // 43ª entrega: una partida de práctica también necesita Host, así que cuenta igual que un torneo
      // del campeonato activo al buscar "la próxima fecha que necesita Host asignado".
      const proximos = (cal?.torneos || [])
        .filter((t) => (t.practica || !activo || t.temporada === activo) && t.fecha >= hoy)
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

  function cargarParametros() {
    // "best effort" a propósito — si falla o la función no existe todavía, parametros se queda en null
    // y se trata como portal encendido (ver comentario en el estado de arriba).
    fetch(API_PARAMETROS)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setParametros(json))
      .catch(() => setParametros(null));
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

  // el autorregistro crea cuentas nuevas de "Jugador" — con el portal apagado tampoco tiene sentido
  // dejar que alguien se registre, así que también ve el aviso de mantenimiento en vez del formulario.
  if (ruta === "/registro" && !session && parametros?.portalActivo !== false) {
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

  const portalApagado = parametros?.portalActivo === false;

  // portal apagado y todavía no hay sesión: se muestra el aviso de mantenimiento en vez del login,
  // salvo que alguien pida explícitamente entrar como administrador (el interruptor solo se puede
  // volver a encender desde dentro del sitio, así que un administrador siempre necesita poder entrar).
  if (!session && portalApagado && !mostrarLoginAdmin) {
    return (
      <>
        <Decor />
        <VersionBadge />
        <div className="login-shell">
          <div className="login-card">
            <div className="login-eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
            <div className="login-title">Portal en mantenimiento</div>
            <p className="section-sub" style={{ textAlign: "center" }}>{parametros?.mensajeMantenimiento}</p>
            <div className="login-hint">
              <button type="button" className="link-btn" onClick={() => setMostrarLoginAdmin(true)}>
                ¿Eres administrador? Inicia sesión aquí
              </button>
            </div>
          </div>
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

  // ya hay sesión, pero el portal está apagado y quien entró no es administrador: se corta el paso al
  // resto del sitio con el mismo aviso — no se cierra la sesión (si el administrador vuelve a encender
  // el portal, basta con recargar para recuperar el acceso, sin tener que iniciar sesión de nuevo).
  if (portalApagado && !esAdmin(session.rol)) {
    return (
      <>
        <Decor />
        <VersionBadge />
        <div className="login-shell">
          <div className="login-card">
            <div className="login-eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
            <div className="login-title">Portal en mantenimiento</div>
            <p className="section-sub" style={{ textAlign: "center" }}>{parametros?.mensajeMantenimiento}</p>
            <div className="login-hint">
              <button type="button" className="link-btn" onClick={handleLogout}>Salir</button>
            </div>
          </div>
        </div>
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
        {portalApagado && (
          <div className="campeonato-banner campeonato-banner-alerta" style={{ marginBottom: 16 }}>
            ⚠ El portal está APAGADO para los jugadores (modo mantenimiento) — solo los administradores
            pueden entrar en este momento. Enciéndelo desde Tablero de Control · Parámetros Generales
            cuando quieras abrir el acceso de nuevo.
          </div>
        )}
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
