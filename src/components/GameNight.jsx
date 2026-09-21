import { useEffect, useMemo, useRef, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import { estadoTorneo, tipoDeFecha, PRACTICA_CAMPEONATO, recomprasMaxEfectivo, torneoBloqueante } from "../lib/gamenight.js";

function nombreCorto(j) {
  return (j.aliasPokerStars || "").trim() || j.nombre;
}

const API = "/api/gamenight";
const API_TABLERO = "/api/tablero";
const API_CAL = "/api/calendario";
const API_CAMP = "/api/campeonatos";
const API_JUG = "/api/jugadores";

function money(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("en-US");
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hora(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function GameNight({ session, perfiles, esHost }) {
  const editable = puedeEditar(perfiles, session, "mod5") || Boolean(esHost);

  const [campeonatos, setCampeonatos] = useState({ nombres: [], activo: "" });
  const [torneosCal, setTorneosCal] = useState([]);
  const [jugadoresSitio, setJugadoresSitio] = useState([]);
  const [tableroMapa, setTableroMapa] = useState({});
  const [gnMapa, setGnMapa] = useState({});
  const [campeonatoSel, setCampeonatoSel] = useState("");
  const [fechaSel, setFechaSel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [activarModal, setActivarModal] = useState(null); // { correo, nombre } o { masivo: [...] }
  const [killerModal, setKillerModal] = useState(null); // { correo, nombre }
  const [verdugoSel, setVerdugoSel] = useState("");
  const [seleccionados, setSeleccionados] = useState(new Set());
  // 48ª entrega: Buy-in/Re-buys/Add-on/Amonestado ya no dependen del flag global `guardando` (que
  // bloqueaba TODA la tabla durante cualquier acción) — cada uno se marca "pendiente" por separado
  // (ej. `buyin:correo@x.com`) y se actualiza de forma optimista en pantalla antes de que responda el
  // servidor, para que se sientan ágiles aunque el torneo tenga muchos jugadores.
  const [pendientes, setPendientes] = useState(new Set());
  const [concluirModal, setConcluirModal] = useState(false);
  const [reiniciarModal, setReiniciarModal] = useState(false);
  // 50ª/51ª entrega: cola de guardado para las acciones "ágiles" (Buy-in/Re-buys/Add-on/Amonestado/
  // checkin). En la 50ª entrega esta cola era UNA POR CONTROL (`rebuy:correo`, `addon:correo`, etc.),
  // lo que dejaba que dos acciones DISTINTAS (ej. un Re-buy de un jugador y un Add-on de otro) se
  // mandaran en paralelo. Eso era justo la causa de que "se demorara y volviera al valor anterior"
  // que reportó Federico en la 51ª: como cada guardado relee y reescribe TODO el mapa de Game Night
  // (jugadores, killers, lugares — no solo el campo tocado), dos llamadas en vuelo al mismo tiempo se
  // pisan entre sí — la segunda en responder (la más lenta, porque cada una espera a Excel) llega con
  // una copia del torneo que todavía no tenía el cambio de la primera, y al guardarla de vuelta lo
  // borra sin que nadie lo note hasta que la pantalla se actualiza con esa respuesta.
  // Ahora la cola es UNA SOLA para toda la pantalla: como máximo una llamada a `/api/gamenight` en
  // vuelo a la vez, sin importar cuántos controles distintos se toquen. La pantalla se sigue sintiendo
  // ágil porque cada clic se ve al toque (optimista) y los clics repetidos sobre el MISMO control se
  // siguen combinando (`combinar`, ej. sumar los deltas de Re-buy) — solo que ahora, si se tocan
  // controles distintos, se procesan uno detrás de otro en vez de en paralelo, evitando la pisada.
  const colaGlobalRef = useRef([]); // [{ key, body, combinar }]
  const enVueloRef = useRef(false);

  useEffect(() => {
    cargar();
  }, []);

  function cargar() {
    setLoading(true);
    setError("");
    Promise.all([
      fetch(API_CAMP).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_CAL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_JUG).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(API_TABLERO).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(API).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([camp, cal, jug, tablero, gn]) => {
        const nombres = camp?.nombres || [];
        setCampeonatos(camp || { nombres: [], activo: "" });
        const torneos = cal?.torneos || [];
        setTorneosCal(torneos);
        setJugadoresSitio((jug?.jugadores || []).filter((j) => j.estatus === "Activo"));
        setTableroMapa(tablero || {});
        const gnData = gn || {};
        setGnMapa(gnData);

        // 50ª entrega: si el campeonato activo del Tablero ya no se puede trabajar todavía (hay una
        // partida anterior por orden cronológico sin concluir), arranca directo en esa partida
        // pendiente en vez de en el activo — para que Federico vea de una vez cuál le falta cerrar.
        const activo = camp?.activo || nombres[0] || "";
        const bloqueanteInicial = torneoBloqueante(torneos, gnData, iso(new Date()));
        const default_ = bloqueanteInicial && bloqueanteInicial.campeonato !== activo ? bloqueanteInicial.campeonato : activo;
        setCampeonatoSel((prev) => prev || default_);
      })
      .catch((e) => setError(e.message || "No se pudo cargar Game Night."))
      .finally(() => setLoading(false));
  }

  // 43ª entrega: "Partidas de práctica" es una opción más del combo de campeonato (llave especial
  // PRACTICA_CAMPEONATO) — sus fechas no viven en tols-campeonatos ni en torneos[].temporada, sino
  // marcadas con torneos[].practica en el Calendario.
  const fechasDelCampeonato = useMemo(() => {
    if (campeonatoSel === PRACTICA_CAMPEONATO) {
      return torneosCal.filter((t) => t.practica).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
    return torneosCal.filter((t) => t.temporada === campeonatoSel).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [torneosCal, campeonatoSel]);

  // 45ª entrega: la fecha ya no se elige en un combo — viene sola, ligada al campeonato elegido: la de
  // hoy si hay una partida programada, si no la más próxima, y si no hay ninguna futura, la más
  // reciente ya jugada.
  useEffect(() => {
    if (!fechasDelCampeonato.length) {
      setFechaSel("");
      return;
    }
    const hoy = iso(new Date());
    const deHoy = fechasDelCampeonato.find((t) => t.fecha === hoy);
    const proxima = fechasDelCampeonato.filter((t) => t.fecha >= hoy)[0];
    const masReciente = [...fechasDelCampeonato].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    setFechaSel((deHoy || proxima || masReciente)?.fecha || "");
    setSeleccionados(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campeonatoSel, fechasDelCampeonato.map((t) => t.fecha).join(",")]);

  const torneoCal = fechasDelCampeonato.find((t) => t.fecha === fechaSel) || null;
  const tipo = tipoDeFecha(torneosCal, fechaSel);
  const torneoState = gnMapa?.[campeonatoSel]?.[fechaSel] || { horaInicio: "", jugadores: {}, ordenEliminados: [], concluido: false };
  // 50ª entrega: una vez que el torneo quedó "Concluido" (acción irreversible), ningún control de
  // edición debe seguir funcionando — el servidor ya lo rechaza, pero además se ocultan/deshabilitan
  // en pantalla para que quede claro que el torneo está cerrado. `editable` (el permiso del rol) se
  // deja intacto para el botón "Reiniciar este torneo" y el badge de "Jugada concluida", que sí deben
  // seguir funcionando/mostrándose para quien tiene permiso, aunque el torneo ya esté cerrado.
  const editableAhora = editable && !torneoState.concluido;
  // 50ª entrega: cuál es, cronológicamente, la partida vencida (fecha <= hoy) más antigua que
  // todavía no está Concluida — mientras exista, ningún otro campeonato/práctica posterior se puede
  // seleccionar en el combo, para respetar el orden real en el que se jugaron/juegan las partidas.
  const bloqueante = useMemo(() => torneoBloqueante(torneosCal, gnMapa, iso(new Date())), [torneosCal, gnMapa]);

  // si el combo queda seleccionado en un campeonato/práctica que se vuelve bloqueado (ej. se creó una
  // partida de práctica con fecha anterior mientras la pantalla ya estaba abierta en el Regular), lo
  // regresa solo al que sí corresponde jugar primero.
  useEffect(() => {
    if (bloqueante && campeonatoSel && campeonatoSel !== bloqueante.campeonato) {
      setCampeonatoSel(bloqueante.campeonato);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueante]);
  const toleranciaMin = tableroMapa?.[campeonatoSel]?.toleranciaCheckinMin ?? 10;
  const recomprasMax = recomprasMaxEfectivo(tableroMapa, campeonatoSel);

  const estado = useMemo(
    () =>
      estadoTorneo({
        jugadoresState: torneoState.jugadores,
        tableroMapa,
        campeonato: campeonatoSel,
        tipo,
        ordenEliminados: torneoState.ordenEliminados,
      }),
    [torneoState, tableroMapa, campeonatoSel, tipo]
  );

  const hostActual = jugadoresSitio.find((j) => j.host);

  // Check-in de autoservicio: el propio jugador puede activarse a sí mismo (sin amonestación, nunca
  // se manda manual:true) — pero SOLO el día de la jugada según la fecha del Calendario, para que no
  // se pueda "adelantar" a una fecha futura ni reactivarse en una pasada. Los roles con permiso de
  // escritura (Host/Administrador) ya tienen su propio botón "Activar (manual)" en la tabla de abajo,
  // así que este banner solo aparece para quien NO tiene ese permiso — el caso normal de un Jugador.
  const miCorreo = (session.usuario || "").trim().toLowerCase();
  const miEntrada = jugadoresSitio.find((j) => j.correo === miCorreo);
  const yaHiceCheckin = Boolean(torneoState.jugadores[miCorreo]?.checkin);
  const puedoAutoCheckin = !editable && Boolean(miEntrada) && fechaSel === iso(new Date()) && !yaHiceCheckin && !torneoState.concluido;

  function hacerMiCheckin() {
    if (!miEntrada) return;
    llamar({ accion: "checkin", correo: miCorreo, nombre: miEntrada.nombre, manual: false });
  }

  // 47ª entrega: los que siguen en juego van arriba, ordenados alfabéticamente (por lo que se muestra,
  // el Alias PokerStars) para ubicar rápido a alguien durante la partida; los ya eliminados van hasta
  // abajo, ordenados por su lugar de salida (mejor lugar primero) y se pintan en gris en el render.
  const habilitados = jugadoresSitio
    .filter((j) => torneoState.jugadores[j.correo]?.checkin)
    .map((j) => ({ ...j, gn: estado.porJugador[j.correo] }))
    .sort((a, b) => {
      // el Campeón sale con `lugar: 1` igual que un eliminado, pero sigue siendo el ganador del
      // torneo, no alguien que "salió" — no debe caer al final de la tabla ni pintarse en gris.
      const aElim = Boolean(a.gn?.lugar) && !a.gn?.esCampeon;
      const bElim = Boolean(b.gn?.lugar) && !b.gn?.esCampeon;
      if (aElim !== bElim) return aElim ? 1 : -1;
      if (aElim) return a.gn.lugar - b.gn.lugar;
      return nombreCorto(a).localeCompare(nombreCorto(b));
    });
  const deshabilitados = jugadoresSitio.filter((j) => !torneoState.jugadores[j.correo]?.checkin);
  const enJuego = habilitados.filter((j) => !j.gn?.lugar);
  // lugares que hoy ocupa algún jugador YA eliminado (todos menos el Campeón) — son las únicas
  // opciones válidas al reordenar a mano, porque `moverLugar` solo reacomoda entre eliminados.
  const lugaresEliminadosDisponibles = Object.entries(estado.lugares)
    .filter(([correo]) => correo !== estado.campeon)
    .map(([, lugar]) => lugar)
    .sort((a, b) => a - b);

  // 51ª entrega: `llamar()` (checkin, killer, moverLugar, concluir, reiniciar…) ahora pasa por la
  // MISMA cola global que las acciones ágiles (ver `encolar()` abajo), en vez de mandar su propio
  // fetch por separado. Antes, mientras un Re-buy/Add-on estaba en vuelo (que no ponía `guardando` en
  // true), los botones que sí dependen de `guardando` (Eliminar, checkin, etc.) seguían habilitados y
  // podían disparar OTRO PUT al mismo tiempo — dos guardados en paralelo sobre el mismo torneo se
  // pisan entre sí (cada uno relee y reescribe TODO el mapa). Con una sola cola para toda la pantalla,
  // nunca hay más de un PUT en vuelo a la vez, venga de donde venga.
  async function llamar(body) {
    try {
      await encolar(`accion-${Date.now()}-${Math.random().toString(36).slice(2)}`, body);
    } catch (e) {
      // el error ya quedó reflejado en `error` (y la pantalla recargada) dentro de `procesarColaGlobal`
    }
  }

  // aplica un cambio a un jugador puntual en el estado local, sin esperar la respuesta del servidor —
  // así el botón se siente ágil aunque la partida tenga muchos jugadores conectados a la vez.
  function actualizarJugadorLocal(correo, cambios) {
    setGnMapa((prev) => {
      const torneoActual = prev?.[campeonatoSel]?.[fechaSel] || { horaInicio: "", jugadores: {}, ordenEliminados: [] };
      const jugadorPrevio = torneoActual.jugadores[correo] || {};
      const torneoNuevo = {
        ...torneoActual,
        jugadores: { ...torneoActual.jugadores, [correo]: { ...jugadorPrevio, ...cambios } },
      };
      return { ...prev, [campeonatoSel]: { ...(prev?.[campeonatoSel] || {}), [fechaSel]: torneoNuevo } };
    });
  }

  // versión "ágil" de llamar(): actualiza la pantalla al toque (optimista) y solo bloquea el control
  // puntual que se está usando (por `key`), no toda la tabla — pensada para Buy-in/Re-buys/Add-on/
  // Amonestado, que un Host puede necesitar tocar muy seguido durante una partida en vivo. Si el
  // servidor rechaza el cambio, se descarta el optimismo recargando desde el servidor.
  //
  // 50ª entrega: cada guardado tarda varios segundos porque espera a que termine de escribirse en
  // Excel — Federico reportó que por eso un solo "+1" de Re-buy "se demora mucho" en verse reflejado.
  // La pantalla ya se actualiza al toque (optimista), pero antes cada clic mandaba SU PROPIA llamada
  // al servidor y esperaba turno una detrás de otra si el Host clickeaba varias veces seguido. Ahora,
  // si ya hay una llamada de este mismo control en camino, el clic nuevo no dispara otra en paralelo —
  // se guarda (y, para Re-buys, se SUMA con `combinar`) como "la próxima" y se manda en cuanto la
  // anterior responda, así 5 clics rápidos de "+1" terminan en como máximo 2 llamadas al servidor en
  // vez de 5, sin perder ninguno.
  function llamarAgil(key, body, cambiosOptimistas, combinar) {
    encolar(key, body, cambiosOptimistas, combinar).catch(() => {});
  }

  // punto único de entrada a la cola global (usado tanto por `llamar()` como por `llamarAgil()`).
  // Si ya hay una entrada con la misma `key` esperando turno (todavía no se mandó), se combina con
  // ella en vez de agregar una nueva — así varios clics de "+1" sobre el mismo jugador, mientras la
  // cola está ocupada con OTRA acción, terminan sumados en un solo delta. Cada llamada devuelve una
  // promesa propia que se resuelve/rechaza cuando a ESE item le toca su turno y el servidor responde,
  // así `llamar()` (usado en modales que hacen `await`) sigue funcionando igual que antes.
  function encolar(key, body, cambiosOptimistas, combinar) {
    if (!campeonatoSel || !fechaSel) return Promise.reject(new Error("No hay campeonato/fecha seleccionados."));
    if (cambiosOptimistas && body.correo) actualizarJugadorLocal(body.correo, cambiosOptimistas);

    return new Promise((resolve, reject) => {
      const cola = colaGlobalRef.current;
      const enCola = cola.find((it) => it.key === key);
      if (enCola) {
        enCola.body = combinar ? combinar(enCola.body, body) : body;
        enCola.resolvers.push({ resolve, reject });
      } else {
        cola.push({ key, body, combinar, resolvers: [{ resolve, reject }] });
      }
      setPendientes((prev) => new Set(prev).add(key));
      setGuardando(true);
      procesarColaGlobal();
    });
  }

  // procesa la cola global de a una llamada por vez — si ya hay una en vuelo, no hace nada; cuando esa
  // termine (éxito o error), se llama sola otra vez para seguir con lo que se haya acumulado mientras
  // tanto. Esto es lo que garantiza que nunca haya dos PUT a `/api/gamenight` en vuelo al mismo tiempo
  // desde esta pantalla, sin importar qué controles distintos se hayan tocado (ver nota en `colaGlobalRef`).
  async function procesarColaGlobal() {
    if (enVueloRef.current) return;
    const item = colaGlobalRef.current.shift();
    if (!item) return;
    enVueloRef.current = true;
    setError("");
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campeonato: campeonatoSel, fecha: fechaSel, ...item.body }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setGnMapa(json);
      setAviso(json.avisoAmonestacion || "");
      item.resolvers.forEach((p) => p.resolve(json));
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      cargar(); // se descarta el cambio optimista y se recarga el estado real del servidor
      item.resolvers.forEach((p) => p.reject(e));
    } finally {
      enVueloRef.current = false;
      setPendientes((prev) => {
        const next = new Set(prev);
        next.delete(item.key);
        return next;
      });
      if (!colaGlobalRef.current.length) setGuardando(false);
      procesarColaGlobal();
    }
  }

  function pedirActivar(j) {
    setActivarModal({ correo: j.correo, nombre: j.nombre });
  }
  function pedirActivarSeleccionados() {
    const lista = deshabilitados.filter((j) => seleccionados.has(j.correo));
    if (!lista.length) return;
    setActivarModal({ masivo: lista });
  }
  async function confirmarActivar() {
    if (!activarModal) return;
    if (activarModal.masivo) {
      await llamar({
        accion: "checkinMasivo",
        jugadores: activarModal.masivo.map((j) => ({ correo: j.correo, nombre: j.nombre })),
      });
      setSeleccionados(new Set());
    } else {
      await llamar({ accion: "checkin", correo: activarModal.correo, nombre: activarModal.nombre, manual: true });
    }
    setActivarModal(null);
  }
  function toggleSeleccionado(correo) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(correo)) next.delete(correo);
      else next.add(correo);
      return next;
    });
  }
  function toggleSeleccionarTodos() {
    setSeleccionados((prev) => (prev.size === deshabilitados.length ? new Set() : new Set(deshabilitados.map((j) => j.correo))));
  }
  function quitarCheckin(j) {
    llamar({ accion: "quitarCheckin", correo: j.correo });
  }
  function toggleBuyIn(j) {
    const nuevo = !j.gn?.buyIn;
    llamarAgil(`buyin:${j.correo}`, { accion: "buyin", correo: j.correo, valor: nuevo }, { buyIn: nuevo });
  }
  function cambiarRebuy(j, delta) {
    const nuevo = Math.max(0, Math.min(recomprasMax, (j.gn?.rebuys || 0) + delta));
    llamarAgil(
      `rebuy:${j.correo}`,
      { accion: "rebuy", correo: j.correo, delta },
      { rebuys: nuevo },
      // si ya hay un +1/-1 de este jugador en camino, el siguiente clic se SUMA al que ya está en cola
      // (en vez de reemplazarlo) para que 3 clics de "+1" terminen mandando un solo delta de +3
      (colaDelta, nuevoBody) => ({ ...nuevoBody, delta: (colaDelta.delta || 0) + (nuevoBody.delta || 0) })
    );
  }
  function toggleAddon(j) {
    const nuevo = !j.gn?.addon;
    llamarAgil(`addon:${j.correo}`, { accion: "addon", correo: j.correo, valor: nuevo }, { addon: nuevo });
  }
  function toggleAmonestado(j) {
    const nuevo = !j.gn?.amonestado;
    llamarAgil(`amonestar:${j.correo}`, { accion: "amonestar", correo: j.correo, valor: nuevo }, { amonestado: nuevo });
  }
  function toggleMejorMano(j) {
    llamar({ accion: "mejorMano", correo: j.correo, valor: !j.gn?.mejorMano });
  }
  function pedirKiller(j) {
    setKillerModal({ correo: j.correo, nombre: nombreCorto(j) });
    setVerdugoSel("");
  }
  async function confirmarKiller() {
    if (!killerModal) return;
    await llamar({ accion: "killer", victima: killerModal.correo, verdugo: verdugoSel });
    setKillerModal(null);
  }
  function deshacerKiller(j) {
    llamar({ accion: "quitarKiller", victima: j.correo });
  }
  function moverLugar(j, nuevoLugar) {
    llamar({ accion: "moverLugar", correo: j.correo, lugar: Number(nuevoLugar) });
  }
  async function confirmarConcluir() {
    await llamar({ accion: "concluir" });
    setConcluirModal(false);
  }
  async function confirmarReiniciar() {
    await llamar({ accion: "reiniciarTorneo" });
    setReiniciarModal(false);
  }

  // 51ª entrega: usaba el nombre completo — Federico pidió que, igual que en el resto de la pantalla
  // (tabla, combo de verdugo), se muestre siempre el Alias PokerStars (killer/verdugo, podio, burbuja,
  // Campeón).
  function nombrePorCorreo(correo) {
    const j = jugadoresSitio.find((j) => j.correo === correo);
    return j ? nombreCorto(j) : correo || "";
  }

  function podiumSpot(lugar) {
    const entrada = Object.entries(estado.lugares).find(([, l]) => l === lugar);
    const correo = entrada?.[0];
    const nombre = correo ? nombrePorCorreo(correo) : "";
    const monto = estado.premiosPorLugar[lugar] || 0;
    return { nombre, monto, definido: Boolean(correo) };
  }

  if (loading) {
    return (
      <div>
        <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
        <h1>Game Night</h1>
        <p className="subtitle">Cargando…</p>
      </div>
    );
  }

  const lugaresPago = estado.numLugaresPago || 0;
  const burbujaNombre = estado.burbujaCorreo ? nombrePorCorreo(estado.burbujaCorreo) : "";
  const campeonNombre = estado.campeon ? nombrePorCorreo(estado.campeon) : "";

  // 51ª entrega: bloque de totales de Buy-in/Re-buys/Add-on que pidió Federico para que el Host pueda
  // validar rápido, de un vistazo, cuánto lleva cobrado/registrado en la mesa sin tener que sumar la
  // tabla completa a mano. Se calcula sobre los jugadores habilitados (con check-in) — igual que la
  // tabla de abajo — usando las cifras ya calculadas por `estadoTorneo()` (`gn.debeBuyIn`, etc.), así
  // que respeta las mismas tarifas del Tablero de Control (incluido el caso de partidas de práctica
  // sin configuración, que siempre dan $0).
  const totalesAgiles = habilitados.reduce(
    (acc, j) => {
      const gn = j.gn;
      if (!gn) return acc;
      if (gn.buyIn) {
        acc.buyIns += 1;
        acc.buyInsUSD += gn.debeBuyIn || 0;
      }
      acc.rebuys += Number(gn.rebuys) || 0;
      acc.rebuysUSD += gn.debeRebuys || 0;
      if (gn.addon) {
        acc.addons += 1;
        acc.addonsUSD += gn.debeAddon || 0;
      }
      return acc;
    },
    { buyIns: 0, buyInsUSD: 0, rebuys: 0, rebuysUSD: 0, addons: 0, addonsUSD: 0 }
  );

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Game Night</h1>
        </div>
        {/* 50ª entrega: cierre formal del torneo — una vez confirmado, queda registrado en el Excel con
            las cifras finales y ya no se puede modificar (el servidor rechaza cualquier otra acción). */}
        {fechaSel && editable && (
          torneoState.concluido ? (
            <span className="badge badge-campeon" title={hora(torneoState.concluidoEn) ? `Concluido a las ${hora(torneoState.concluidoEn)}` : "Concluido"}>
              ✅ Jugada concluida
            </span>
          ) : (
            <button className="btn btn-primary" onClick={() => setConcluirModal(true)} disabled={guardando}>
              Jugada Concluida
            </button>
          )
        )}
      </div>

      {hostActual && <p className="gn-host-line">🎙 Host de la jugada: <strong>{hostActual.nombre}</strong></p>}
      {!hostActual && <p className="gn-host-line">⚠ Todavía no hay Host asignado en Jugadores.</p>}

      {error && <div className="login-error">{error}</div>}
      {aviso && <div className="campeonato-banner campeonato-banner-alerta" style={{ marginTop: 12 }}>⚠ {aviso}</div>}

      {puedoAutoCheckin && (
        <div className="campeonato-banner campeonato-banner-row" style={{ marginTop: 12 }}>
          <span>Es el día de la jugada — puedes hacer tu propio check-in.</span>
          <button className="btn btn-primary" disabled={guardando} onClick={hacerMiCheckin}>
            {guardando ? "Un momento…" : "Hacer mi check-in"}
          </button>
        </div>
      )}

      {/* 45ª entrega: la fecha y el tipo de torneo ya no se eligen — vienen solos, ligados a la
          partida guardada en el Calendario para el campeonato elegido. Solo el campeonato sigue
          siendo un combo. */}
      <div className="filtro-estatus" style={{ display: "flex", gap: 6, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select className="field" style={{ maxWidth: 220 }} value={campeonatoSel} onChange={(e) => setCampeonatoSel(e.target.value)}>
          {campeonatos.nombres.map((n) => {
            const bloqueado = Boolean(bloqueante) && bloqueante.campeonato !== n;
            return (
              <option key={n} value={n} disabled={bloqueado}>
                {n}{n === campeonatos.activo ? " (activo)" : ""}{bloqueado ? " — pendiente de concluir partida anterior" : ""}
              </option>
            );
          })}
          <option value={PRACTICA_CAMPEONATO} disabled={Boolean(bloqueante) && bloqueante.campeonato !== PRACTICA_CAMPEONATO}>
            🎯 Partidas de práctica{Boolean(bloqueante) && bloqueante.campeonato !== PRACTICA_CAMPEONATO ? " — pendiente de concluir partida anterior" : ""}
          </option>
        </select>
        {bloqueante && bloqueante.campeonato !== campeonatoSel && (
          <span className="campeonato-banner campeonato-banner-alerta" style={{ margin: 0 }}>
            Hay una partida del {bloqueante.fecha} sin concluir — hay que cerrarla antes de trabajar en otra
            posterior.
          </span>
        )}
        {fechaSel ? (
          <>
            <span className="field field-readonly" style={{ maxWidth: 160 }}>{fechaSel}</span>
            {torneoCal && (
              <span
                className={"badge " + (campeonatoSel === PRACTICA_CAMPEONATO ? "badge-practica" : (torneoCal.main ? "badge-main" : "badge-regular"))}
              >
                {campeonatoSel === PRACTICA_CAMPEONATO ? "Práctica" : tipo}
              </span>
            )}
            {editable && (
              <button
                className="btn-icon-remove"
                style={{ marginLeft: "auto", width: "auto", padding: "4px 10px", fontSize: 11 }}
                title="Borra por completo este torneo (jugadores, killers, lugares) y lo deja como si nunca se hubiera tocado"
                disabled={guardando}
                onClick={() => setReiniciarModal(true)}
              >
                Reiniciar este torneo
              </button>
            )}
          </>
        ) : (
          <span className="section-sub" style={{ margin: 0 }}>Este campeonato todavía no tiene fechas en el Calendario.</span>
        )}
      </div>

      {fechaSel && (
        <>
          {/* ───────── Totales de Buy-in/Re-buys/Add-on (51ª entrega) — para que el Host valide rápido
              cuánto lleva registrado en la mesa, sin tener que sumar la tabla completa a mano. ───────── */}
          <div className="stats gn-stats-row" style={{ margin: "20px 0" }}>
            <div className="stat">
              <div className="stat-label">Buy-ins</div>
              <div className="stat-value">{totalesAgiles.buyIns}</div>
            </div>
            <div className="stat">
              <div className="stat-label">$ por Buy-ins</div>
              <div className="stat-value">{money(totalesAgiles.buyInsUSD)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Re-buys</div>
              <div className="stat-value">{totalesAgiles.rebuys}</div>
            </div>
            <div className="stat">
              <div className="stat-label">$ por Re-buys</div>
              <div className="stat-value">{money(totalesAgiles.rebuysUSD)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Add-ons</div>
              <div className="stat-value">{totalesAgiles.addons}</div>
            </div>
            <div className="stat">
              <div className="stat-label">$ por Add-ons</div>
              <div className="stat-value">{money(totalesAgiles.addonsUSD)}</div>
            </div>
          </div>

          {/* ───────── Podio de premios en efectivo ───────── */}
          <div className="gn-podium">
            {lugaresPago >= 2 && (
              <div className="gn-podium-spot gn-podium-2">
                <div className="gn-podium-trophy">🥈</div>
                <div className="gn-podium-lugar">2º lugar</div>
                <div className={"gn-podium-nombre" + (!podiumSpot(2).definido ? " gn-podium-nombre-vacio" : "")}>
                  {podiumSpot(2).definido ? podiumSpot(2).nombre : "Por definir"}
                </div>
                <div className="gn-podium-monto">{money(podiumSpot(2).monto)}</div>
              </div>
            )}
            {lugaresPago >= 1 && (
              <div className="gn-podium-spot gn-podium-1">
                <div className="gn-podium-trophy">🏆</div>
                <div className="gn-podium-lugar">1er lugar</div>
                <div className={"gn-podium-nombre" + (!podiumSpot(1).definido ? " gn-podium-nombre-vacio" : "")}>
                  {podiumSpot(1).definido ? podiumSpot(1).nombre : "Por definir"}
                </div>
                <div className="gn-podium-monto">{money(podiumSpot(1).monto)}</div>
              </div>
            )}
            {lugaresPago >= 3 && (
              <div className="gn-podium-spot gn-podium-3">
                <div className="gn-podium-trophy">🥉</div>
                <div className="gn-podium-lugar">3er lugar</div>
                <div className={"gn-podium-nombre" + (!podiumSpot(3).definido ? " gn-podium-nombre-vacio" : "")}>
                  {podiumSpot(3).definido ? podiumSpot(3).nombre : "Por definir"}
                </div>
                <div className="gn-podium-monto">{money(podiumSpot(3).monto)}</div>
              </div>
            )}
            {lugaresPago === 0 && <p className="section-sub">Este campeonato todavía no tiene lugares de premio configurados en el Tablero de Control.</p>}
          </div>

          {/* ───────── Hora programada del torneo ───────── */}
          {/* 45ª entrega: ya no hay botón "Iniciar torneo" — la hora sale sola de la hora guardada en
              el Calendario para esta fecha, y con eso se mide la tolerancia de check-in. */}
          {torneoCal?.hora ? (
            <div className="campeonato-banner">
              Torneo programado para las <strong>{torneoCal.hora}</strong> — tolerancia de check-in: {toleranciaMin} min
              (dato informativo para el Host; ya no bloquea ni amonesta nada de forma automática).
            </div>
          ) : (
            <div className="campeonato-banner campeonato-banner-alerta">
              Esta fecha no tiene hora guardada en el Calendario.
            </div>
          )}

          {/* ───────── Subtotales de la partida ───────── */}
          <div className="stats gn-stats-row" style={{ margin: "20px 0" }}>
            <div className="stat">
              <div className="stat-label">Bolsa total</div>
              <div className="stat-value">{money(estado.pot)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Jugadores en juego</div>
              <div className="stat-value">{enJuego.length} / {estado.total}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Burbuja</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{burbujaNombre || "—"}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Campeón</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{campeonNombre || "En juego"}</div>
            </div>
          </div>

          {/* ───────── Jugadores habilitados (check-in) ───────── */}
          <div className="section">
            <div className="section-head">
              <div className="section-title">Jugadores habilitados <span className="section-title-campeonato">· {habilitados.length}</span></div>
            </div>
            <div className="tbl">
              <div className="trow thead" style={{ gridTemplateColumns: "1.1fr 1fr 0.6fr 0.9fr 0.6fr 1fr 0.6fr 0.8fr 0.7fr 0.7fr 0.6fr" }}>
                <div>Jugador</div><div>Check-in</div><div>Buy-in</div><div>Re-buys{Number.isFinite(recomprasMax) ? ` (máx ${recomprasMax})` : ""}</div><div>Add-on</div><div>Eliminar</div><div>Lugar</div><div>Mejor mano</div><div>Debe</div><div>Premio</div><div>Puntos</div>
              </div>
              {habilitados.map((j) => {
                const gn = j.gn || {};
                const eliminado = Boolean(gn.lugar) && !gn.esCampeon;
                return (
                  <div className={"trow" + (eliminado ? " gn-row-eliminado" : "")} style={{ gridTemplateColumns: "1.1fr 1fr 0.6fr 0.9fr 0.6fr 1fr 0.6fr 0.8fr 0.7fr 0.7fr 0.6fr" }} key={j.correo}>
                    <div>
                      {nombreCorto(j)}
                      {gn.esCampeon && <span className="badge badge-campeon" style={{ marginLeft: 6 }} title="Campeón">🏆</span>}
                      {gn.esBurbuja && <span className="badge badge-burbuja" style={{ marginLeft: 6 }} title="Burbuja">🫧</span>}
                      {editableAhora && !eliminado && (
                        <button
                          className="btn-icon-remove"
                          style={{ marginLeft: 6, width: 20, height: 20 }}
                          title="Quitar check-in (corrección, manual o de usuario)"
                          disabled={guardando}
                          onClick={() => quitarCheckin(j)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      {hora(gn.horaCheckin)} · {gn.manual ? "Manual" : "Usuario"}
                      {editableAhora ? (
                        <button
                          className={"gn-toggle gn-toggle-chico" + (gn.amonestado ? " on" : "") + (pendientes.has(`amonestar:${j.correo}`) ? " gn-en-camino" : "")}
                          style={{ marginLeft: 6 }}
                          title={gn.amonestado ? "Quitar la amonestación" : "Marcar amonestado a mano (pierde el punto de asistencia)"}
                          onClick={() => toggleAmonestado(j)}
                        >
                          {gn.amonestado ? "⚠ Amonestado" : "Amonestar"}
                        </button>
                      ) : (
                        gn.amonestado && <span title="Perdió el punto de asistencia"> · ⚠ Amonestado</span>
                      )}
                    </div>
                    <div>
                      <button
                        className={"gn-toggle" + (gn.buyIn ? " on" : "") + (pendientes.has(`buyin:${j.correo}`) ? " gn-en-camino" : "")}
                        disabled={!editableAhora}
                        onClick={() => toggleBuyIn(j)}
                      >
                        {gn.buyIn ? "Sí" : "No"}
                      </button>
                    </div>
                    {/* 50ª entrega: ya no se deshabilita mientras hay un guardado en camino — varios
                        clics seguidos se juntan solos en llamarAgil() en vez de esperar turno uno por
                        uno, así que el Host puede seguir clickeando "+"/"−" sin sentir que "no responde" */}
                    <div className={"gn-stepper" + (pendientes.has(`rebuy:${j.correo}`) ? " gn-en-camino" : "")}>
                      <button disabled={!editableAhora || (gn.rebuys || 0) <= 0} onClick={() => cambiarRebuy(j, -1)}>
                        −
                      </button>
                      <span className="gn-stepper-val">{gn.rebuys || 0}</span>
                      <button
                        disabled={!editableAhora || (gn.rebuys || 0) >= recomprasMax}
                        title={Number.isFinite(recomprasMax) ? `Máximo ${recomprasMax} recompras` : "Sin límite configurado para este campeonato"}
                        onClick={() => cambiarRebuy(j, 1)}
                      >
                        +
                      </button>
                    </div>
                    <div>
                      <button
                        className={"gn-toggle" + (gn.addon ? " on" : "") + (pendientes.has(`addon:${j.correo}`) ? " gn-en-camino" : "")}
                        disabled={!editableAhora}
                        onClick={() => toggleAddon(j)}
                      >
                        {gn.addon ? "Sí" : "No"}
                      </button>
                    </div>
                    <div>
                      {eliminado ? (
                        <>
                          {gn.eliminadoPor ? nombrePorCorreo(gn.eliminadoPor) : "—"}
                          {editableAhora && (
                            <button className="btn-icon-remove" style={{ marginLeft: 6 }} title="Deshacer eliminación" disabled={guardando} onClick={() => deshacerKiller(j)}>✕</button>
                          )}
                        </>
                      ) : (
                        editableAhora && enJuego.length > 1 ? (
                          <button className="btn btn-secondary btn-filtro" disabled={guardando} onClick={() => pedirKiller(j)}>Eliminar</button>
                        ) : (
                          <span className="muted">En juego</span>
                        )
                      )}
                    </div>
                    <div>
                      {gn.esCampeon ? (
                        <span className="badge badge-campeon">1</span>
                      ) : eliminado ? (
                        editableAhora ? (
                          <select
                            className="field gn-select"
                            style={{ minWidth: 64, padding: "2px 4px" }}
                            value={gn.lugar}
                            disabled={guardando}
                            onChange={(e) => moverLugar(j, e.target.value)}
                            title="Corregir el lugar de salida — los demás se reacomodan solos"
                          >
                            {lugaresEliminadosDisponibles.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge badge-regular">Lugar {gn.lugar}</span>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                    <div>
                      <button className={"gn-toggle" + (gn.mejorMano ? " on" : "")} disabled={!editableAhora || guardando} onClick={() => toggleMejorMano(j)} title="Solo un jugador por torneo">
                        {gn.mejorMano ? "Sí" : "No"}
                      </button>
                    </div>
                    <div className="num right">{money(gn.debeTotal)}</div>
                    <div className="num right">{gn.premioTotal > 0 ? money(gn.premioTotal) : "—"}</div>
                    <div className="num right">{gn.puntos ?? 0}</div>
                  </div>
                );
              })}
              {habilitados.length === 0 && <div className="section-sub" style={{ padding: 16 }}>Todavía no hay jugadores con check-in para este torneo.</div>}
            </div>
          </div>

          {/* ───────── Jugadores sin check-in ───────── */}
          <div className="section">
            <div className="section-head">
              <div className="section-title">Jugadores sin check-in <span className="section-title-campeonato">· {deshabilitados.length}</span></div>
              {editableAhora && seleccionados.size > 0 && (
                <button className="btn btn-primary btn-filtro" disabled={guardando} onClick={pedirActivarSeleccionados}>
                  Activar seleccionados ({seleccionados.size})
                </button>
              )}
            </div>
            <div className="section-sub" style={{ marginTop: 0 }}>
              No pueden ver el estatus de la partida en el sitio hasta que hagan check-in. Si un jugador ya
              está jugando el torneo en PokerStars sin haber hecho su check-in, el Host puede activarlo
              manualmente aquí (uno por uno, o seleccionando varios a la vez). El tiempo de tolerancia
              ({toleranciaMin} min desde la hora programada) es solo informativo — si el Host considera que
              corresponde una amonestación, la marca a mano desde la columna de Check-in de la tabla de
              arriba.
            </div>
            <div className="tbl">
              <div className="trow thead" style={{ gridTemplateColumns: "40px 1.6fr 1.6fr 160px" }}>
                <div>
                  {editableAhora && deshabilitados.length > 0 && (
                    <input
                      type="checkbox"
                      checked={seleccionados.size === deshabilitados.length}
                      onChange={toggleSeleccionarTodos}
                      title="Seleccionar todos"
                    />
                  )}
                </div>
                <div>Jugador</div><div>Correo</div><div />
              </div>
              {deshabilitados.map((j) => (
                <div className="trow" style={{ gridTemplateColumns: "40px 1.6fr 1.6fr 160px" }} key={j.correo}>
                  <div>
                    {editableAhora && (
                      <input type="checkbox" checked={seleccionados.has(j.correo)} onChange={() => toggleSeleccionado(j.correo)} />
                    )}
                  </div>
                  <div>{nombreCorto(j)}</div>
                  <div style={{ fontSize: 12 }}>{j.correo}</div>
                  <div>
                    {editableAhora && (
                      <button className="btn btn-secondary btn-filtro" disabled={guardando} onClick={() => pedirActivar(j)}>
                        Activar (manual)
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {deshabilitados.length === 0 && <div className="section-sub" style={{ padding: 16 }}>Todos los jugadores activos de la liga ya hicieron check-in.</div>}
            </div>
          </div>
        </>
      )}

      {activarModal && (
        <div className="modal-backdrop" onClick={() => !guardando && setActivarModal(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">⚠</div>
            <div className="modal-title">
              {activarModal.masivo ? `Activar a ${activarModal.masivo.length} jugadores` : `Activar a ${activarModal.nombre}`}
            </div>
            {activarModal.masivo ? (
              <p className="section-sub" style={{ marginTop: 0 }}>
                Vas a activar manualmente a <b>{activarModal.masivo.map((j) => j.nombre).join(", ")}</b>, con
                buy-in asignado a cada uno. Por ser una activación manual del Host, quedan{" "}
                <b>amonestados automáticamente</b> (pierden el punto de asistencia) — si alguno no debería
                quedar amonestado, lo corriges después con el toggle "Amonestar" de la tabla de habilitados.
                El tiempo de tolerancia ({toleranciaMin} min desde la hora programada) es solo informativo.
              </p>
            ) : (
              <p className="section-sub" style={{ marginTop: 0 }}>
                Vas a activar manualmente a <b>{activarModal.nombre}</b> en el tablero, con buy-in asignado.
                Por ser una activación manual del Host, queda <b>amonestado automáticamente</b> (pierde el
                punto de asistencia) — si no debería quedar amonestado, lo corriges después con el toggle
                "Amonestar" de la tabla de habilitados. El tiempo de tolerancia ({toleranciaMin} min desde la
                hora programada) es solo informativo.
              </p>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setActivarModal(null)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" disabled={guardando} onClick={confirmarActivar}>{guardando ? "Un momento…" : "Sí, activar"}</button>
            </div>
          </div>
        </div>
      )}

      {killerModal && (
        <div className="modal-backdrop" onClick={() => !guardando && setKillerModal(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">☠</div>
            <div className="modal-title">Eliminar a {killerModal.nombre}</div>
            <div className="login-field">
              <label>Eliminado por (opcional)</label>
              <select className="field" value={verdugoSel} onChange={(e) => setVerdugoSel(e.target.value)}>
                <option value="">— sin identificar —</option>
                {enJuego.filter((j) => j.correo !== killerModal.correo).map((j) => (
                  <option key={j.correo} value={j.correo}>{nombreCorto(j)}</option>
                ))}
              </select>
            </div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              La posición de salida se calcula sola según cuántos jugadores sigan en juego en este momento.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setKillerModal(null)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" disabled={guardando} onClick={confirmarKiller}>{guardando ? "Un momento…" : "Confirmar eliminación"}</button>
            </div>
          </div>
        </div>
      )}

      {concluirModal && (
        <div className="modal-backdrop" onClick={() => !guardando && setConcluirModal(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">✅</div>
            <div className="modal-title">Concluir esta jugada</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              El torneo va a quedar <b>formalmente cerrado</b>, registrado en el Excel con sus cifras
              finales (lugares, premios, killers, puntos, etc.). Desde ese momento ya <b>no se va a poder
              modificar nada</b> de esta jugada — ni check-ins, ni buy-ins/re-buys/add-ons, ni killers ni
              lugares. Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConcluirModal(false)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" disabled={guardando} onClick={confirmarConcluir}>
                {guardando ? "Un momento…" : "Sí, concluir jugada"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reiniciarModal && (
        <div className="modal-backdrop" onClick={() => !guardando && setReiniciarModal(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-badge">⚠</div>
            <div className="modal-title">Reiniciar este torneo</div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Se va a <b>borrar por completo</b> el torneo del {fechaSel} en{" "}
              {campeonatoSel === PRACTICA_CAMPEONATO ? "Partidas de práctica" : campeonatoSel}: todos los
              check-ins, buy-ins/re-buys/add-ons, killers y lugares de salida ya guardados, incluido el
              cierre si ya estaba Concluido. También se borra el reflejo que ya tuviera en Cobranza para
              esta fecha. Úsalo solo para corregir un torneo con datos mezclados o equivocados — esta
              acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setReiniciarModal(false)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" disabled={guardando} onClick={confirmarReiniciar}>
                {guardando ? "Un momento…" : "Sí, reiniciar este torneo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
