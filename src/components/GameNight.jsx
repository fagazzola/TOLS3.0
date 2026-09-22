import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { puedeEditar } from "../lib/permisos.js";
import { estadoTorneo, tipoDeFecha, PRACTICA_CAMPEONATO, recomprasMaxEfectivo, torneoBloqueante } from "../lib/gamenight.js";

// 63ª entrega: Federico puede pedirle a PokerStars, después de cada torneo, un Excel de resultados
// ("Tournament_<id>.xlsx") con una fila por jugador. Trae dos filas de encabezado (una arriba con
// nombres de columna genéricos como "Award"/"Num", y una debajo que aclara el detalle real de esa
// columna para varias de ellas) y después una fila por jugador ya jugado. Esta función busca esas dos
// filas de encabezado (por si PokerStars llega a mover de lugar las columnas en otro formato de
// exportación) y arma, por cada jugador, `{ alias, place, rebuys, addon }` — sin tocar nada del sitio
// todavía; el resto (matchear contra los Jugadores del sitio y mandar la importación) lo hace
// `abrirImportarResultados`/`confirmarImportar` en el componente.
function leerExcelResultadosPokerStars(filas) {
  let filaHeader = -1;
  let filaSubHeader = -1;
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i] || [];
    const textos = fila.map((c) => String(c ?? "").trim().toLowerCase());
    if (textos.includes("place") && textos.includes("user id")) {
      filaHeader = i;
      filaSubHeader = i + 1;
      break;
    }
  }
  if (filaHeader < 0) return { jugadores: [], error: 'No se encontraron las columnas "Place" / "User ID" en el archivo — ¿es el Excel de resultados que exporta PokerStars?' };

  const header = (filas[filaHeader] || []).map((c) => String(c ?? "").trim().toLowerCase());
  const sub = (filas[filaSubHeader] || []).map((c) => String(c ?? "").trim().toLowerCase());
  const colPlace = header.indexOf("place");
  const colAlias = header.indexOf("user id");
  // Rebuys/Addons no tienen su propio encabezado en la fila principal (comparten "Num"/"Award" con
  // otras columnas) — el nombre real está en la fila de abajo, así que se busca ahí.
  const colRebuys = sub.findIndex((c) => c === "rebuys");
  const colAddon = sub.findIndex((c) => c === "addons" || c === "addon");

  const jugadores = [];
  for (let i = filaSubHeader + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const placeTexto = String(fila[colPlace] ?? "").replace(/ /g, " ").trim();
    // Después de la última fila de jugador, PokerStars agrega un bloque "SUMMARY" con totales — ahí
    // termina la lista de jugadores (todo lo que sigue son subtotales, no personas).
    if (placeTexto.toLowerCase() === "summary") break;
    const alias = String(fila[colAlias] ?? "").replace(/ /g, " ").trim();
    const place = Number(placeTexto) || null;
    // una fila real de jugador siempre trae un lugar numérico — si no lo tiene (fila en blanco, u otra
    // fila de resumen que se haya colado) se descarta en vez de importarla como si fuera un jugador.
    if (!alias || !place) continue;
    const rebuys = colRebuys >= 0 ? Number(String(fila[colRebuys] ?? "").trim()) || 0 : 0;
    const addon = colAddon >= 0 ? Number(String(fila[colAddon] ?? "").trim()) === 1 : false;
    jugadores.push({ alias, place, rebuys, addon });
  }
  return { jugadores, error: jugadores.length ? "" : "El archivo no trae ningún jugador reconocible." };
}

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

// 64ª entrega: "Debe (-)" y "Saldo" en la tabla de Jugadores habilitados necesitan poder mostrarse en
// negativo (Debe siempre como cantidad negativa; Saldo = Debe + Premio, puede quedar en cualquier
// signo) — `money()` no le pone un "-" explícito antes del "$" cuando el número es negativo (queda
// como "$ -500"), así que esta variante lo antepone ("-$ 500") para que se lea más claro en una tabla.
function moneyFirmado(n) {
  const v = Math.round(Number(n || 0));
  return (v < 0 ? "-" : "") + "$ " + Math.abs(v).toLocaleString("en-US");
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
  // 63ª entrega: "Importar resultados (Excel)" — Federico consigue de PokerStars, después de cada
  // torneo, un Excel con Buy-in/Re-buys/Add-on por jugador y quiere que ese archivo actualice de un
  // solo click la tabla de "Jugadores habilitados" (en vez de ir marcando Re-buys/Add-on uno por uno
  // durante la partida). El Host solo sigue tocando Killer y Mejor mano a mano. `importPreview` guarda
  // el resultado ya matcheado contra los Jugadores del sitio, para que el Host lo revise antes de
  // confirmar.
  const [importPreview, setImportPreview] = useState(null); // { matched: [...], sinMatch: [...] }
  const [importando, setImportando] = useState(false);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef(null);
  // 62ª entrega: se había movido toda la edición fila por fila a un modal dedicado ("Editar
  // jugadores"), pero Federico lo probó y decidió que fue mala idea — la 63ª entrega lo quitó y la
  // tabla de la pantalla volvió a tener todos sus controles editables, como antes de la 62ª.
  // 58ª entrega: Federico reportó que, con una partida pendiente por orden cronológico (`bloqueante`),
  // el combo de campeonato/práctica solo dejaba ver esa una opción — así que si lo que necesitaba
  // reiniciar/corregir era OTRO torneo (ej. una práctica ya jugada, mezclada con datos viejos, que no es
  // la que bloquea ahora mismo), no había forma de llegar a esa pantalla para usar "Reiniciar este
  // torneo", aunque el servidor sí permite esa acción sobre cualquier torneo (bloqueado o no). Este
  // interruptor, oculto salvo cuando hay `bloqueante`, revela el combo completo para poder navegar a
  // cualquier campeonato/práctica con fines de corrección — la restricción de la 51ª/52ª entrega (guiar
  // el orden real de juego) se mantiene por default, apagada.
  const [mostrarTodos, setMostrarTodos] = useState(false);
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
        const bloqueanteInicial = torneoBloqueante(torneos, gnData, activo);
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
  // 64ª entrega: Federico pidió que la columna "Mejor mano" de la tabla del Host solo aparezca cuando
  // la Game Night es un Main Event — en un Regular no hace falta ni mostrarla.
  const esMain = tipo === "Main";
  // 64ª entrega: rediseño de columnas de la tabla del Host — Check-in/Amonestación se quitaron (ya no
  // se usan), Buy-in/Add-on ahora muestran 1/0 en vez de Sí/No, Re-buys y Lugar dejaron de ser
  // editables ahí (el dato correcto ya viene de "Importar resultados (Excel)"), Killer se deja en
  // blanco por ahora, y el orden de las últimas columnas cambió a Puntos/Debe (-)/Premio (+)/Saldo.
  const colsHost = esMain
    ? "1.3fr 0.6fr 0.7fr 0.6fr 0.7fr 0.7fr 0.8fr 0.6fr 0.8fr 0.8fr 0.8fr"
    : "1.3fr 0.6fr 0.7fr 0.6fr 0.7fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr";
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
  const bloqueante = useMemo(
    () => torneoBloqueante(torneosCal, gnMapa, campeonatos.activo),
    [torneosCal, gnMapa, campeonatos.activo]
  );

  // si el combo queda seleccionado en un campeonato/práctica que se vuelve bloqueado (ej. se creó una
  // partida de práctica con fecha anterior mientras la pantalla ya estaba abierta en el Regular), lo
  // regresa solo al que sí corresponde jugar primero.
  useEffect(() => {
    if (bloqueante && !mostrarTodos && campeonatoSel && campeonatoSel !== bloqueante.campeonato) {
      setCampeonatoSel(bloqueante.campeonato);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueante, mostrarTodos]);
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
  // se pueda "adelantar" a una fecha futura ni reactivarse en una pasada.
  // 62ª entrega: Federico aclaró que el Host también es jugador y también necesita este mismo botón
  // explícito — antes se ocultaba para cualquier rol con permiso de escritura (`!editable`), asumiendo
  // que el Host siempre se activaría a sí mismo desde la tabla de "Jugadores sin check-in" (que manda
  // `manual: true`, distinto). Ahora la única condición es tener una entrada real en Jugadores y que
  // sea el día de la jugada — aplica igual para Jugador, Host o Administrador.
  const miCorreo = (session.usuario || "").trim().toLowerCase();
  const miEntrada = jugadoresSitio.find((j) => j.correo === miCorreo);
  const yaHiceCheckin = Boolean(torneoState.jugadores[miCorreo]?.checkin);
  const puedoAutoCheckin = Boolean(miEntrada) && fechaSel === iso(new Date()) && !yaHiceCheckin && !torneoState.concluido;

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
  function abrirImportarResultados() {
    setImportError("");
    importInputRef.current?.click();
  }
  async function onArchivoImportSeleccionado(e) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta reintentar
    if (!archivo) return;
    setImportError("");
    setImportando(true);
    try {
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null });
      const { jugadores, error } = leerExcelResultadosPokerStars(filas);
      if (error) {
        setImportError(error);
        return;
      }
      const norm = (s) => (s || "").trim().toLowerCase();
      const matched = [];
      const sinMatch = [];
      for (const fila of jugadores) {
        const sitio = jugadoresSitio.find((j) => norm(nombreCorto(j)) === norm(fila.alias) || norm(j.aliasPokerStars) === norm(fila.alias));
        if (sitio) {
          matched.push({ correo: sitio.correo, nombre: sitio.nombre, alias: fila.alias, place: fila.place, rebuys: fila.rebuys, addon: fila.addon });
        } else {
          sinMatch.push(fila.alias);
        }
      }
      setImportPreview({ matched, sinMatch });
    } catch (err) {
      setImportError("No se pudo leer el archivo. ¿Seguro que es un .xlsx exportado de PokerStars?");
    } finally {
      setImportando(false);
    }
  }
  async function confirmarImportar() {
    if (!importPreview?.matched?.length) return;
    setImportando(true);
    try {
      await llamar({
        accion: "importarResultados",
        jugadores: importPreview.matched.map(({ correo, nombre, rebuys, addon, place }) => ({ correo, nombre, rebuys, addon, place })),
      });
      setImportPreview(null);
    } catch (err) {
      // el error ya queda reflejado en `error` por `llamar()`/`procesarColaGlobal`
    } finally {
      setImportando(false);
    }
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

      {/* 45ª entrega: la fecha y el tipo de torneo ya no se eligen — vienen solos, ligados a la
          partida guardada en el Calendario para el campeonato elegido. Solo el campeonato sigue
          siendo un combo. */}
      <div className="filtro-estatus" style={{ display: "flex", gap: 6, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
        {/* 60ª entrega: el rol Jugador solo ve un espejo de lo que el Host ve — la partida a mostrar no
            es un combo editable para él (ni el escape hatch de "Mostrar todos", que es una herramienta
            de corrección exclusiva del Host/Admin), así que se muestra como texto de solo lectura, igual
            que ya se hace con la fecha (`fechaSel`) más abajo. */}
        {editable ? (
          <select className="field" style={{ maxWidth: 220 }} value={campeonatoSel} onChange={(e) => setCampeonatoSel(e.target.value)}>
            {/* 51ª/52ª entrega: mientras haya una partida pendiente por orden cronológico (`bloqueante`), el
                combo muestra SOLO esa opción — ya no se listan las demás deshabilitadas. Antes, con todas
                visibles (aunque disabled), el campeonato activo seguía "apareciendo" en el combo y podía
                confundir; ahora no hay forma de ver ni de intentar elegir nada que no sea lo que toca jugar
                primero. En cuanto esa partida queda "Concluida", `bloqueante` pasa a `null` y el combo
                vuelve a mostrar todos los campeonatos + práctica, para poder revisar cualquiera.
                58ª entrega: Federico reportó que esto le impedía llegar a OTRO torneo (ej. una práctica ya
                jugada, no la que bloquea ahora mismo) para usar "Reiniciar este torneo" ahí — el servidor sí
                permite esa acción sobre cualquier torneo, bloqueado o no, pero el combo no dejaba ni
                seleccionarlo. `mostrarTodos` (el link de abajo) revela la lista completa sin quitar la
                restricción por default. */}
            {bloqueante && !mostrarTodos ? (
              <option value={bloqueante.campeonato}>
                {bloqueante.campeonato === PRACTICA_CAMPEONATO
                  ? "🎯 Partidas de práctica"
                  : `${bloqueante.campeonato}${bloqueante.campeonato === campeonatos.activo ? " (activo)" : ""}`}
              </option>
            ) : (
              <>
                {campeonatos.nombres.map((n) => (
                  <option key={n} value={n}>
                    {n}{n === campeonatos.activo ? " (activo)" : ""}
                  </option>
                ))}
                <option value={PRACTICA_CAMPEONATO}>🎯 Partidas de práctica</option>
              </>
            )}
          </select>
        ) : (
          <span className="field field-readonly" style={{ maxWidth: 220 }}>
            {campeonatoSel === PRACTICA_CAMPEONATO
              ? "🎯 Partidas de práctica"
              : `${campeonatoSel}${campeonatoSel === campeonatos.activo ? " (activo)" : ""}`}
          </span>
        )}
        {bloqueante && bloqueante.campeonato !== campeonatoSel && (
          <span className="campeonato-banner campeonato-banner-alerta" style={{ margin: 0 }}>
            Hay que jugar/concluir primero la partida del {bloqueante.fecha}
            {bloqueante.campeonato === PRACTICA_CAMPEONATO ? " (práctica)" : ` (${bloqueante.campeonato})`} —
            por eso el combo solo deja elegir esa por ahora.
          </span>
        )}
        {/* 62ª entrega: antes era un link de texto subrayado (parecía una URL) — Federico pidió un botón
            real, del mismo estilo que el resto de los controles de esta fila. */}
        {editable && bloqueante && (
          <button
            type="button"
            className="btn btn-secondary btn-filtro"
            onClick={() => setMostrarTodos((v) => !v)}
          >
            {mostrarTodos
              ? "Volver a mostrar solo la pendiente"
              : "¿Necesitas reiniciar o corregir otro torneo?"}
          </button>
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
            {/* 61ª entrega: único lugar donde el Jugador puede hacer su propio check-in — antes había un
                banner aparte arriba de toda la pantalla; Federico pidió consolidarlo en un solo botón
                explícito, junto al tipo de partida. Mismas condiciones de siempre (`puedoAutoCheckin`):
                solo el día de la jugada, sin haber hecho check-in ya, y con el torneo todavía no
                concluido. Al hacer clic, `hacerMiCheckin()` llama la misma acción "checkin" que ya usa el
                Host (`manual: false`) — por eso en la tabla de habilitados le queda "Auto" en la columna
                de Check-in (no la tarjeta amarilla de amonestación) y se le cuentan los puntos de
                asistencia normalmente, igual que si el Host lo hubiera activado a tiempo. */}
            {puedoAutoCheckin && (
              <button
                className="btn btn-primary"
                style={{ marginLeft: "auto" }}
                disabled={guardando}
                onClick={hacerMiCheckin}
              >
                {guardando ? "Un momento…" : "Check-in al Torneo"}
              </button>
            )}
            {/* 62ª entrega: antes usaba `.btn-icon-remove` (pensado para un ✕ chiquito, no para un botón
                con texto) — se veía en otro color y tipo de letra que el resto de los botones de esta
                fila. Se homologó al mismo tipo de botón (`btn btn-filtro`), solo que en rojo (`btn-danger`)
                para conservar la señal de que es una acción destructiva. */}
            {editable && (
              <button
                className="btn btn-danger btn-filtro"
                style={{ marginLeft: "auto" }}
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
          {/* ───────── Podio de premios en efectivo (bloque 1) ───────── */}
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

          {/* ───────── Totales de Buy-in/Re-buys/Add-on (bloque 2, 51ª entrega) — un solo recuadro con
              2 líneas (cantidades arriba, montos en $ abajo) para que el Host valide rápido cuánto lleva
              registrado en la mesa, sin tener que sumar la tabla completa a mano.
              62ª entrega: Federico pidió mejorar el diseño y sumar, en el mismo recuadro y con un
              tratamiento visual que resalte, la Bolsa total (Buy-ins + Re-buys + Add-ons en $, ya
              calculada como `estado.pot`) y "Jugadores en juego" — antes vivían aparte, en el bloque de
              subtotales de abajo (ver `gn-stats-row`, de donde se quitaron para no duplicarlas). ───────── */}
          <div className="gn-totales-card">
            <div className="gn-totales-titulo">Totales de la mesa</div>
            <div className="gn-totales-destacado">
              <div className="gn-totales-destacado-item">
                <div className="gn-totales-item-label">Bolsa total</div>
                <div className="gn-totales-destacado-valor">{money(estado.pot)}</div>
              </div>
              <div className="gn-totales-destacado-sep" />
              <div className="gn-totales-destacado-item">
                <div className="gn-totales-item-label">Jugadores en juego</div>
                <div className="gn-totales-destacado-valor">{enJuego.length} <small>/ {estado.total}</small></div>
              </div>
            </div>
            <div className="gn-totales-fila gn-totales-fila-conteo">
              <div className="gn-totales-item">
                <div className="gn-totales-item-label">Buy-ins</div>
                <div className="gn-totales-item-valor">{totalesAgiles.buyIns}</div>
              </div>
              <div className="gn-totales-item">
                <div className="gn-totales-item-label">Re-buys</div>
                <div className="gn-totales-item-valor">{totalesAgiles.rebuys}</div>
              </div>
              <div className="gn-totales-item">
                <div className="gn-totales-item-label">Add-ons</div>
                <div className="gn-totales-item-valor">{totalesAgiles.addons}</div>
              </div>
            </div>
            <div className="gn-totales-fila gn-totales-fila-usd">
              <div className="gn-totales-item">
                <div className="gn-totales-item-label">$ Buy-ins</div>
                <div className="gn-totales-item-valor">{money(totalesAgiles.buyInsUSD)}</div>
              </div>
              <div className="gn-totales-item">
                <div className="gn-totales-item-label">$ Re-buys</div>
                <div className="gn-totales-item-valor">{money(totalesAgiles.rebuysUSD)}</div>
              </div>
              <div className="gn-totales-item">
                <div className="gn-totales-item-label">$ Add-ons</div>
                <div className="gn-totales-item-valor">{money(totalesAgiles.addonsUSD)}</div>
              </div>
            </div>
          </div>

          {/* 62ª entrega: se quitó el recuadro informativo "Torneo programado para las HH:MM — tolerancia
              de check-in: N min" (Federico pidió quitarlo — la tolerancia ya es solo un dato de
              referencia que se sigue mostrando donde hace falta, en "Jugadores sin check-in"). Se
              conserva la alerta cuando a la fecha le falta la hora en el Calendario, porque eso sí sigue
              siendo un problema de datos que el Host debe notar. */}
          {!torneoCal?.hora && (
            <div className="campeonato-banner campeonato-banner-alerta">
              Esta fecha no tiene hora guardada en el Calendario.
            </div>
          )}

          {/* ───────── Jugadores habilitados (check-in) ─────────
              53ª entrega: el rol Jugador ya no ve esta misma tabla completa con los botones
              deshabilitados — Federico pidió un espejo simplificado, de solo lectura, con solo las 6
              columnas que le importan a un jugador (sin hora de check-in, sin Lugar/Mejor
              mano/Debe/Premio). El Host (`editable`) sigue viendo la tabla completa de siempre.
              54ª entrega: la columna/botón de sacar a un jugador del torneo se renombró de
              "Eliminar" a "Killer" (encabezado) / "Kill" (botón y modal) en toda la pantalla del Host —
              ya lo tenía la vista Jugador desde la 53ª.
              63ª entrega: Federico probó el modal "Editar jugadores" de la 62ª entrega y decidió que fue
              mala idea ("Elimina el artefacto, fue mala idea") — se quitó, y esta tabla vuelve a ser la
              única, con "Importar resultados (Excel)" como la vía normal para cargar Buy-in/Re-buys/
              Add-on/Lugar desde PokerStars.
              64ª entrega: con la importación ya resolviendo Buy-in/Re-buys/Add-on/Lugar de un jalón,
              Federico pidió simplificar esta tabla a lo que el Host de verdad necesita ver/tocar en
              vivo: se quitaron las columnas Check-in y Amonestación (ya no se usan); Buy-in/Add-on
              muestran "1"/"0" en vez de "Sí"/"No" (siguen siendo botones por si hace falta corregir a
              mano); Re-buys y Lugar dejaron de ser editables aquí — Re-buys es un número fijo (ya no
              tiene +/-) y Lugar es un badge fijo (ya no tiene el `<select>` para reordenar), porque el
              dato correcto siempre debe venir de la importación; Killer se deja en blanco por ahora
              (sin botón "Kill" ni texto — Federico va a explicar más adelante cómo va a resolver esa
              columna); Mejor mano solo aparece si la partida es Main Event (`esMain`, columna
              condicional — en Regular no se muestra ni la columna); y las últimas columnas se
              reordenaron a Puntos, "Debe (-)" (negativo), "Premio (+)" (positivo) y "Saldo" (Debe +
              Premio) — antes eran Debe/Premio/Puntos, sin Saldo. Las funciones de Kill/moverLugar/
              cambiarRebuy (`pedirKiller`, `deshacerKiller`, `moverLugar`, `cambiarRebuy`, el modal
              "Kill a…") se dejaron en el código, sin usarse desde aquí por ahora, en vez de borrarlas —
              es más fácil reactivarlas si Federico pide volver a habilitarlas que reconstruirlas de
              cero. */}
          {editable ? (
          <div className="section">
            <div className="section-head">
              <div className="section-title">Jugadores habilitados <span className="section-title-campeonato">· {habilitados.length}</span></div>
              <button
                type="button"
                className="btn btn-secondary btn-filtro"
                disabled={!editableAhora || guardando}
                onClick={abrirImportarResultados}
              >
                📥 Importar resultados (Excel)
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={onArchivoImportSeleccionado}
              />
            </div>
            {importError && <div className="section-sub" style={{ color: "#b00020" }}>{importError}</div>}
            <div className="tbl" style={{ overflowX: "auto" }}>
              <div className="trow thead" style={{ gridTemplateColumns: colsHost, minWidth: esMain ? 940 : 840 }}>
                <div>Jugador</div><div>Buy-in</div><div>Re-buys</div><div>Add-on</div><div>Killer</div><div>Lugar</div>
                {esMain && <div>Mejor mano</div>}
                <div>Puntos</div><div>Debe (-)</div><div>Premio (+)</div><div>Saldo</div>
              </div>
              {habilitados.map((j) => {
                const gn = j.gn || {};
                const eliminado = Boolean(gn.lugar) && !gn.esCampeon;
                const saldo = (gn.premioTotal || 0) - (gn.debeTotal || 0);
                return (
                  <div className={"trow" + (eliminado ? " gn-row-eliminado" : "")} style={{ gridTemplateColumns: colsHost, minWidth: esMain ? 940 : 840 }} key={j.correo}>
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
                    <div>
                      <button
                        className={"gn-toggle" + (gn.buyIn ? " on" : "") + (pendientes.has(`buyin:${j.correo}`) ? " gn-en-camino" : "")}
                        disabled={!editableAhora}
                        onClick={() => toggleBuyIn(j)}
                      >
                        {gn.buyIn ? "1" : "0"}
                      </button>
                    </div>
                    <div className="num">{gn.rebuys || 0}</div>
                    <div>
                      <button
                        className={"gn-toggle" + (gn.addon ? " on" : "") + (pendientes.has(`addon:${j.correo}`) ? " gn-en-camino" : "")}
                        disabled={!editableAhora}
                        onClick={() => toggleAddon(j)}
                      >
                        {gn.addon ? "1" : "0"}
                      </button>
                    </div>
                    <div />
                    <div>
                      {gn.esCampeon ? (
                        <span className="badge badge-campeon">1</span>
                      ) : eliminado ? (
                        <span className="badge badge-regular">Lugar {gn.lugar}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                    {esMain && (
                      <div>
                        <button className={"gn-toggle" + (gn.mejorMano ? " on" : "")} disabled={!editableAhora || guardando} onClick={() => toggleMejorMano(j)} title="Solo un jugador por torneo">
                          {gn.mejorMano ? "Sí" : "No"}
                        </button>
                      </div>
                    )}
                    <div className="num right">{gn.puntos ?? 0}</div>
                    <div className="num right">{moneyFirmado(-(gn.debeTotal || 0))}</div>
                    <div className="num right">{gn.premioTotal > 0 ? money(gn.premioTotal) : "—"}</div>
                    <div className="num right">{moneyFirmado(saldo)}</div>
                  </div>
                );
              })}
              {habilitados.length === 0 && <div className="section-sub" style={{ padding: 16 }}>Todavía no hay jugadores con check-in para este torneo.</div>}
            </div>
          </div>
          ) : (
            <div className="section">
              <div className="section-head">
                <div className="section-title">Jugadores habilitados <span className="section-title-campeonato">· {habilitados.length}</span></div>
              </div>
              <div className="tbl">
                <div className="trow thead" style={{ gridTemplateColumns: "1.3fr 1fr 0.7fr 0.9fr 0.7fr 1fr 0.7fr" }}>
                  <div>Jugador</div><div>Check-in</div><div>Buy-in</div><div>Re-buy</div><div>Add-on</div><div>Killer</div><div>Puntos</div>
                </div>
                {habilitados.map((j) => {
                  const gn = j.gn || {};
                  const eliminado = Boolean(gn.lugar) && !gn.esCampeon;
                  return (
                    <div className={"trow" + (eliminado ? " gn-row-eliminado" : "")} style={{ gridTemplateColumns: "1.3fr 1fr 0.7fr 0.9fr 0.7fr 1fr 0.7fr" }} key={j.correo}>
                      <div>
                        {nombreCorto(j)}
                        {gn.esCampeon && <span className="badge badge-campeon" style={{ marginLeft: 6 }} title="Campeón">🏆</span>}
                        {gn.esBurbuja && <span className="badge badge-burbuja" style={{ marginLeft: 6 }} title="Burbuja">🫧</span>}
                      </div>
                      <div>
                        {gn.amonestado ? (
                          <span className="tarjeta-amarilla" title="Activado manualmente por el Host — amonestado, pierde el punto de asistencia" />
                        ) : (
                          "Auto"
                        )}
                      </div>
                      <div className="num">{gn.buyIn ? 1 : 0}</div>
                      <div className="num">{gn.rebuys || 0}</div>
                      <div className="num">{gn.addon ? 1 : 0}</div>
                      <div>
                        {eliminado ? (gn.eliminadoPor ? nombrePorCorreo(gn.eliminadoPor) : "—") : <span className="muted">En juego</span>}
                      </div>
                      <div className="num right">{gn.puntos ?? 0}</div>
                    </div>
                  );
                })}
                {habilitados.length === 0 && <div className="section-sub" style={{ padding: 16 }}>Todavía no hay jugadores con check-in para este torneo.</div>}
              </div>
            </div>
          )}

          {/* ───────── Jugadores sin check-in ───────── */}
          {/* 60ª entrega: exclusiva del Host/Admin — el rol Jugador no necesita verla (es información
              operativa para activar manualmente a alguien, no algo que le importe a un jugador). */}
          {editable && (
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
          )}
        </>
      )}

      {importPreview && (
        <div className="modal-backdrop" onClick={() => !importando && setImportPreview(null)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Importar resultados de PokerStars</div>
            <div className="section-sub" style={{ marginTop: -10 }}>
              Se van a marcar Buy-in, Re-buys, Add-on y Lugar (y check-in, si no lo tenían) de {importPreview.matched.length}{" "}
              jugador{importPreview.matched.length === 1 ? "" : "es"} encontrados en el archivo, según el lugar final que
              trae el propio archivo — reemplaza cualquier orden de salida que hubiera antes en esta partida. Mejor mano no
              se toca — eso lo sigue marcando el Host a mano en la tabla.
            </div>
            <div className="tbl" style={{ maxHeight: 300, overflowY: "auto" }}>
              <div className="trow thead" style={{ gridTemplateColumns: "1.4fr 0.6fr 0.8fr 0.8fr" }}>
                <div>Jugador</div><div>Lugar</div><div>Re-buys</div><div>Add-on</div>
              </div>
              {importPreview.matched.map((m) => (
                <div className="trow" style={{ gridTemplateColumns: "1.4fr 0.6fr 0.8fr 0.8fr" }} key={m.correo}>
                  <div>{m.nombre || m.alias}</div>
                  <div className="num">{m.place ?? "—"}</div>
                  <div className="num">{m.rebuys || 0}</div>
                  <div>{m.addon ? "Sí" : "No"}</div>
                </div>
              ))}
              {importPreview.matched.length === 0 && (
                <div className="section-sub" style={{ padding: 16 }}>Ningún alias del archivo coincide con un jugador del sitio.</div>
              )}
            </div>
            {importPreview.sinMatch.length > 0 && (
              <div className="section-sub">
                No se encontraron en el sitio (revisa el Alias PokerStars en Jugadores): {importPreview.sinMatch.join(", ")}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" disabled={importando} onClick={() => setImportPreview(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={importando || importPreview.matched.length === 0} onClick={confirmarImportar}>
                {importando ? "Importando…" : "Confirmar importación"}
              </button>
            </div>
          </div>
        </div>
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
            <div className="modal-title">Kill a {killerModal.nombre}</div>
            <div className="login-field">
              <label>Killer (opcional)</label>
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
              <button className="btn btn-primary" disabled={guardando} onClick={confirmarKiller}>{guardando ? "Un momento…" : "Confirmar Kill"}</button>
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
              finales (lugares, premios, killers, puntos, etc.). Además, se agrega un registro por
              jugador en la hoja <b>Cobranza_Cierres</b> (a quién hay que cobrarle y a quién hay que
              pagarle, con el balance neto) para que el Tesorero tenga un historial auditable de este
              cierre, que no se vuelve a tocar aunque después se edite o reinicie el torneo. Desde este
              momento ya <b>no se va a poder modificar nada</b> de esta jugada — ni check-ins, ni
              buy-ins/re-buys/add-ons, ni killers ni lugares. Esta acción no se puede deshacer.
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
              esta fecha, y esta fecha deja de aparecer en las hojas de Excel de Game Night (ya no queda
              un renglón vacío pegado ahí). Úsalo solo para corregir un torneo con datos mezclados o
              equivocados — esta acción no se puede deshacer.
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
