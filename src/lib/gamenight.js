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

// ¿un check-in manual (activado por el Host) cae fuera de la tolerancia configurada en el Tablero de
// Control? Si no hay hora de inicio programada (la fecha no tiene `hora` en el Calendario), nunca
// amonesta — no hay contra qué medir el tiempo.
export function calcularAmonestado({ manual, horaInicio, toleranciaMin }) {
  if (!manual || !horaInicio) return false;
  const minutos = (Date.now() - new Date(horaInicio).getTime()) / 60000;
  return minutos > (Number(toleranciaMin) || 0);
}

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

// arma la lista de posiciones de salida a partir de quién eliminó a quién — se deriva siempre desde
// cero (nunca se guarda "lugar" como dato independiente) para que sea imposible que quede
// desincronizado si el Host corrige o borra un killer después. Orden: el primero en salir (más
// temprano) recibe el lugar más alto (ej. con 9 jugadores, el primer eliminado es 9º lugar); cuando
// solo queda un jugador sin eliminar, ese es el Campeón (lugar 1) sin necesidad de un killer explícito.
export function derivarPosiciones(jugadoresPorCorreo, correosHabilitados) {
  const total = correosHabilitados.length;
  // "eliminado" se decide solo por tener hora de salida — el nombre de quien lo eliminó (killer) es
  // informativo y puede quedar en blanco (ej. quedó fuera sin que se identifique quién lo eliminó)
  const eliminados = correosHabilitados
    .map((correo) => ({ correo, ...(jugadoresPorCorreo[correo] || {}) }))
    .filter((j) => j.horaEliminacion)
    .sort((a, b) => a.horaEliminacion.localeCompare(b.horaEliminacion));

  const lugares = {}; // correo -> lugar (número)
  eliminados.forEach((j, idx) => {
    lugares[j.correo] = total - idx;
  });

  const sinEliminar = correosHabilitados.filter((c) => !lugares[c]);
  let campeon = null;
  if (total > 0 && sinEliminar.length === 1) {
    lugares[sinEliminar[0]] = 1;
    campeon = sinEliminar[0];
  }

  return { total, lugares, eliminados: eliminados.map((j) => j.correo), enJuego: sinEliminar, campeon };
}

// la burbuja: el último jugador en salir justo ANTES de entrar a los lugares que pagan — es decir,
// quien quedó en el lugar (numLugaresPago + 1)
export function calcularBurbuja(lugares, numLugaresPago) {
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
export function estadoTorneo({ jugadoresState, tableroMapa, campeonato, tipo, toleranciaMin }) {
  const datosTablero = tableroMapa?.[campeonato] || {};
  const correosHabilitados = Object.entries(jugadoresState)
    .filter(([, j]) => j.checkin)
    .map(([correo]) => correo);

  const { total, lugares, campeon } = derivarPosiciones(jugadoresState, correosHabilitados);
  const numLugaresPago = (datosTablero.premios?.porTorneo?.lugares || []).length;
  const burbujaCorreo = calcularBurbuja(lugares, numLugaresPago);

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
