// Lógica de cálculo de Game Night, compartida entre netlify/functions/gamenight.js (servidor) y
// src/components/GameNight.jsx (cliente) — mismo patrón que src/lib/cobranza.js: nada de DOM ni de
// Netlify aquí, para poder importarse desde ambos lados sin problema.
import { tarifa, tipoDeFecha } from "./cobranza.js";

// 43ª entrega: llave de "campeonato" reservada para las partidas de práctica en tols-gamenight —
// nunca puede coincidir con el nombre real de un campeonato (tols-campeonatos), así que sirve para
// aislarlas del resto: al no existir ninguna configuración del Tablero de Control bajo esta llave,
// tarifa()/calcularPot()/calcularPuntos() dan siempre $0/0 sin necesidad de código especial, y
// netlify/functions/gamenight.js usa esta misma constante para saltarse el espejo hacia Cobranza.
export const PRACTICA_CAMPEONATO = "__practica__";

// 48ª entrega: Buy-in/Re-buys/Add-on tienen que funcionar igual aunque el campeonato no tenga
// configuración en el Tablero de Control (las partidas de práctica NUNCA la tienen, y un campeonato
// real recién creado tampoco hasta que Federico lo configure) — la diferencia es que no generan $
// porque no hay tarifa definida (tarifa() ya da $0 sola), no que el botón se bloquee. Antes, sin
// configuración, `recomprasMax` caía en 0 por default y el botón de "+" quedaba deshabilitado para
// siempre. Ahora: si NO existe configuración para este campeonato, no hay límite (Infinity); si SÍ
// existe pero el campo en sí está en 0, se respeta como un límite real que Federico configuró a mano.
export function recomprasMaxEfectivo(tableroMapa, campeonato) {
  const datos = tableroMapa?.[campeonato];
  if (!datos) return Infinity;
  return Number(datos.recomprasMax) || 0;
}

// 48ª entrega: la tolerancia de check-in configurada en el Tablero de Control ya NO amonesta
// automáticamente a nadie — Federico pidió que sea puramente informativa para el Host ("un mensaje",
// no una función). El Host decide a mano, desde la tabla de habilitados, si un jugador queda
// amonestado o no (acción `"amonestar"`). Se quitó `calcularAmonestado()` de aquí porque ya no se usa.

// 45ª entrega: ya no hace falta que el Host "inicie" el torneo a mano en Game Night — la hora de
// inicio sale directo de la fecha/hora que ya está guardada en el Calendario para ese torneo. Se
// asume el huso horario de Ciudad de México (UTC-6, fijo todo el año desde que México eliminó el
// horario de verano en 2022) porque ahí es donde se juega la liga.
export function horaInicioProgramada(torneoCal) {
  if (!torneoCal?.fecha || !torneoCal?.hora) return "";
  const d = new Date(`${torneoCal.fecha}T${torneoCal.hora}:00-06:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// encuentra, dentro de los torneos del Calendario, el que corresponde a este campeonato+fecha —
// respeta la llave especial de partidas de práctica (43ª entrega), que se identifican por
// `practica: true` en vez de por `temporada`.
export function torneoCalendarioDe(torneosCal, campeonato, fecha) {
  if (!fecha) return null;
  if (campeonato === PRACTICA_CAMPEONATO) {
    return (torneosCal || []).find((t) => t.practica && t.fecha === fecha) || null;
  }
  return (torneosCal || []).find((t) => t.temporada === campeonato && t.fecha === fecha) || null;
}

// 50ª entrega: Federico pidió que Game Night respete el orden cronológico real de las partidas —
// si por fecha corresponde jugar primero una partida de práctica (o de cualquier otro campeonato),
// no se debe poder trabajar en un torneo posterior hasta que esa partida quede "Concluida" (ver
// acción `"concluir"` en netlify/functions/gamenight.js). Junta TODAS las fechas ya vencidas
// (`fecha <= hoy`) de TODOS los campeonatos y de las partidas de práctica en una sola línea de
// tiempo, y devuelve la más antigua que todavía no esté concluida — esa es la que "bloquea" el
// combo de campeonato en la pantalla de Game Night para cualquier otro valor. `null` si no hay
// ninguna partida vencida pendiente de concluir (todo al día).
export function torneoBloqueante(torneosCal, gnMapa, hoy) {
  const candidatos = (torneosCal || [])
    .filter((t) => (t.practica || t.temporada) && t.fecha && t.fecha <= hoy)
    .map((t) => {
      const campeonato = t.practica ? PRACTICA_CAMPEONATO : t.temporada;
      return {
        campeonato,
        fecha: t.fecha,
        concluido: Boolean(gnMapa?.[campeonato]?.[t.fecha]?.concluido),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return candidatos.find((c) => !c.concluido) || null;
}

// arma la lista de posiciones de salida a partir del orden de eliminación guardado en el torneo
// (`ordenEliminados`, un arreglo de correos del primero en salir al último). El servidor mantiene este
// arreglo solo (agrega al eliminar con "killer", quita al deshacer con "quitarKiller"), pero desde la
// 48ª entrega el Host también lo puede reordenar a mano con `"moverLugar"` — por experiencia, el orden
// real de la mesa a veces no coincide exactamente con la hora registrada de cada eliminación, y el
// lugar de salida sí afecta premios, así que hace falta poder corregirlo. Mover a alguien de posición
// reacomoda a los demás solo, porque el lugar de TODOS sale de su índice en este mismo arreglo, nunca
// de un número guardado por separado. Orden: el primero en salir (más temprano, índice 0) recibe el
// lugar más alto (ej. con 9 jugadores, el primer eliminado es 9º lugar); cuando solo queda un jugador
// sin eliminar, ese es el Campeón (lugar 1) sin necesidad de un killer explícito.
export function derivarPosiciones(jugadoresPorCorreo, correosHabilitados, ordenEliminados) {
  const total = correosHabilitados.length;
  // por seguridad, se ignora cualquier correo en `ordenEliminados` que ya no esté habilitado (ej. se
  // le quitó el check-in por completo) — nunca debería pasar, pero así nunca se cae la pantalla
  const eliminadosOrdenados = (ordenEliminados || []).filter((c) => correosHabilitados.includes(c));

  const lugares = {}; // correo -> lugar (número)
  eliminadosOrdenados.forEach((correo, idx) => {
    lugares[correo] = total - idx;
  });

  const sinEliminar = correosHabilitados.filter((c) => !lugares[c]);
  let campeon = null;
  if (total > 0 && sinEliminar.length === 1) {
    lugares[sinEliminar[0]] = 1;
    campeon = sinEliminar[0];
  }

  return { total, lugares, eliminados: eliminadosOrdenados, enJuego: sinEliminar, campeon };
}

// la burbuja: el último jugador en salir justo ANTES de entrar a los lugares que pagan — es decir,
// quien quedó en el lugar (numLugaresPago + 1). Solo existe cuando el campeonato de verdad tiene
// lugares de premio configurados (numLugaresPago > 0) Y hay al menos un jugador más que esos lugares
// (si no, todos quedan en el dinero y no hay "burbuja" posible). Sin esta guarda, un campeonato SIN
// premios configurados (numLugaresPago = 0) marcaba como "burbuja" al lugar 1 — el mismo Campeón.
export function calcularBurbuja(lugares, numLugaresPago, total) {
  if (!numLugaresPago || numLugaresPago <= 0 || numLugaresPago >= total) return null;
  const entrada = Object.entries(lugares).find(([, lugar]) => lugar === numLugaresPago + 1);
  return entrada ? entrada[0] : null;
}

// bolsa total recaudada en el torneo (buy-ins + re-buys + add-ons de los jugadores habilitados),
// según las tarifas vigentes del Tablero de Control para ese campeonato/tipo de fecha
export function calcularPot(jugadoresTorneo, tableroMapa, campeonato, tipo) {
  let pot = 0;
  for (const j of jugadoresTorneo) {
    if (j.buyIn) pot += tarifa(tableroMapa, campeonato, "buyin", tipo);
    pot += (Number(j.rebuys) || 0) * tarifa(tableroMapa, campeonato, "rebuy", tipo);
    if (j.addon) pot += tarifa(tableroMapa, campeonato, "addon", tipo);
  }
  return pot;
}

// reparte la bolsa (menos el % que se va al fondo acumulado del campeonato) entre los lugares que
// pagan, según los porcentajes definidos en Premios por Torneo del Tablero de Control
export function calcularPremiosPorLugar(pot, tableroMapa, campeonato) {
  const premios = tableroMapa?.[campeonato]?.premios?.porTorneo;
  if (!premios || !Array.isArray(premios.lugares)) return {};
  const potRepartible = pot * (1 - (Number(premios.pctAcumulado) || 0) / 100);
  const out = {};
  premios.lugares.forEach((l, i) => {
    out[i + 1] = (potRepartible * (Number(l.pct) || 0)) / 100;
  });
  return out;
}

// monto fijo (Regular/Main) de un concepto de "Pagos por Torneo" del Tablero (ej. "Sale en la
// burbuja", "Mejor Mano") por nombre exacto — 0 si no está configurado
export function pagoPorConcepto(tableroMapa, campeonato, nombreConcepto, tipo) {
  const pagos = tableroMapa?.[campeonato]?.pagosPorTorneo || [];
  const p = pagos.find((x) => x.nombre === nombreConcepto);
  if (!p) return 0;
  return Number(tipo === "Main" ? p.main : p.regular) || 0;
}

// puntos que un jugador se lleva de ESTE torneo: asistencia (0 si quedó amonestado) + los puntos por
// posición de salida, si ya se le derivó un lugar
export function calcularPuntos({ lugar, amonestado }, tableroDatos, tipo) {
  const asistencia = amonestado ? 0 : Number((tipo === "Main" ? tableroDatos?.puntos?.asistencia?.main : tableroDatos?.puntos?.asistencia?.regular) || 0);
  const posEntry = lugar ? (tableroDatos?.puntos?.posiciones || []).find((p) => p.pos === lugar) : null;
  const posPuntos = posEntry ? Number((tipo === "Main" ? posEntry.main : posEntry.regular) || 0) : 0;
  return asistencia + posPuntos;
}

// arma, para un torneo puntual (campeonato+fecha), el estado completo ya calculado que consume la UI
// y lo que se necesita para reflejar el torneo en Cobranza — un solo lugar con toda la lógica de
// negocio para que servidor y cliente calculen exactamente lo mismo
export function estadoTorneo({ jugadoresState, tableroMapa, campeonato, tipo, ordenEliminados }) {
  const datosTablero = tableroMapa?.[campeonato] || {};
  const correosHabilitados = Object.entries(jugadoresState)
    .filter(([, j]) => j.checkin)
    .map(([correo]) => correo);

  const { total, lugares, campeon } = derivarPosiciones(jugadoresState, correosHabilitados, ordenEliminados);
  const numLugaresPago = (datosTablero.premios?.porTorneo?.lugares || []).length;
  const burbujaCorreo = calcularBurbuja(lugares, numLugaresPago, total);

  const pot = calcularPot(
    correosHabilitados.map((c) => jugadoresState[c]),
    tableroMapa,
    campeonato,
    tipo
  );
  const premiosPorLugar = calcularPremiosPorLugar(pot, tableroMapa, campeonato);
  const montoBurbuja = pagoPorConcepto(tableroMapa, campeonato, "Sale en la burbuja", tipo);
  const montoMejorMano = pagoPorConcepto(tableroMapa, campeonato, "Mejor Mano", tipo);

  const porJugador = {};
  for (const correo of Object.keys(jugadoresState)) {
    const j = jugadoresState[correo];
    const lugar = lugares[correo] || null;
    const premioLugar = lugar && premiosPorLugar[lugar] ? premiosPorLugar[lugar] : 0;
    const premioBurbuja = correo === burbujaCorreo ? montoBurbuja : 0;
    const premioMano = j.mejorMano ? montoMejorMano : 0;
    const premioTotal = premioLugar + premioBurbuja + premioMano;
    const debeBuyIn = j.buyIn ? tarifa(tableroMapa, campeonato, "buyin", tipo) : 0;
    const debeRebuys = (Number(j.rebuys) || 0) * tarifa(tableroMapa, campeonato, "rebuy", tipo);
    const debeAddon = j.addon ? tarifa(tableroMapa, campeonato, "addon", tipo) : 0;
    porJugador[correo] = {
      ...j,
      lugar,
      esCampeon: correo === campeon,
      esBurbuja: correo === burbujaCorreo,
      debeBuyIn,
      debeRebuys,
      debeAddon,
      debeTotal: debeBuyIn + debeRebuys + debeAddon,
      premioLugar,
      premioBurbuja,
      premioMano,
      premioTotal,
      puntos: calcularPuntos({ lugar, amonestado: j.amonestado }, datosTablero, tipo),
    };
  }

  return {
    total,
    lugares,
    campeon,
    burbujaCorreo,
    numLugaresPago,
    pot,
    premiosPorLugar,
    montoBurbuja,
    montoMejorMano,
    porJugador,
  };
}

export { tipoDeFecha };
