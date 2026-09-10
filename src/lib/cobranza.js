// Lógica de cálculo de Cobranza, compartida entre netlify/functions/cobranza.js (servidor) y
// src/components/Cobranza.jsx (cliente) — así los montos que ve el Tesorero en pantalla son
// exactamente los mismos que los que se guardan/sincronizan. No depende de nada del DOM ni de
// Netlify, así que se puede importar desde ambos lados sin problema.

// tarifa (regular/main) de un concepto ("buyin" | "rebuy" | "addon") para un campeonato, leída del
// Tablero de Control (tols-tablero). Si el campeonato no tiene datos todavía, devuelve 0 en vez de
// tronar — el Tesorero va a ver montos en $0 hasta que el Tablero tenga ese campeonato configurado.
export function tarifa(tableroMapa, campeonato, id, tipo) {
  const cobros = tableroMapa?.[campeonato]?.cobrosPorTorneo || [];
  const c = cobros.find((x) => x.id === id);
  if (!c) return 0;
  return Number(tipo === "Main" ? c.main : c.regular) || 0;
}

// Regular/Main de una fecha puntual, buscando en el Calendario (mismo criterio que el resto del
// sitio: la marca "main" del torneo, no el nombre del campeonato).
export function tipoDeFecha(calendarioTorneos, fecha) {
  const t = (calendarioTorneos || []).find((x) => x.fecha === fecha);
  return t?.main ? "Main" : "Regular";
}

// monto que debe un movimiento (buy-in + rebuys + add-on), según las tarifas vigentes del campeonato
export function montosMovimiento(m, tableroMapa, tipo) {
  const montoBuyIn = m.buyInPagado ? tarifa(tableroMapa, m.campeonato, "buyin", tipo) : 0;
  const montoRebuys = (Number(m.rebuys) || 0) * tarifa(tableroMapa, m.campeonato, "rebuy", tipo);
  const montoAddOn = m.addonComprado ? tarifa(tableroMapa, m.campeonato, "addon", tipo) : 0;
  const montoTotal = montoBuyIn + montoRebuys + montoAddOn;
  const totalGanado = (Number(m.premioPartida) || 0) + (Number(m.premioCampeonato) || 0);
  return { montoBuyIn, montoRebuys, montoAddOn, montoTotal, totalGanado, balanceNeto: totalGanado - montoTotal };
}

// enriquece cada movimiento con tipo (Regular/Main) y los montos calculados — lo que consume la UI
export function conMontos(movimientos, tableroMapa, calendarioTorneos) {
  return (movimientos || []).map((m) => {
    const tipo = tipoDeFecha(calendarioTorneos, m.fecha);
    return { ...m, tipo, ...montosMovimiento(m, tableroMapa, tipo) };
  });
}

// resumen por jugador (correo): total debido, total ganado, saldo — sumando todos sus movimientos
export function resumenPorJugador(movimientosConMontos, jugadoresDict) {
  const porCorreo = {};
  for (const m of movimientosConMontos) {
    if (!porCorreo[m.correo]) porCorreo[m.correo] = { pago: 0, deposito: 0 };
    porCorreo[m.correo].pago += m.montoTotal;
    porCorreo[m.correo].deposito += m.totalGanado;
  }
  const correos = new Set([...Object.keys(jugadoresDict || {}), ...Object.keys(porCorreo)]);
  const resumen = {};
  for (const correo of correos) {
    const jd = jugadoresDict?.[correo] || {};
    const tot = porCorreo[correo] || { pago: 0, deposito: 0 };
    resumen[correo] = {
      correo,
      nombre: jd.nombre || "",
      cuenta: jd.cuenta || "",
      banco: jd.banco || "",
      tipoCuenta: jd.tipoCuenta || "",
      pago: tot.pago,
      deposito: tot.deposito,
      saldo: tot.deposito - tot.pago,
    };
  }
  return resumen;
}

// ¿este jugador tiene un adeudo (movimiento con monto > 0 sin pagar) de una fecha ANTERIOR a la
// próxima fecha de torneo, sin una excepción aprobada para esa próxima fecha? Ese es el criterio que
// lo inhabilita para el siguiente torneo — no importa si su saldo global es positivo por premios, lo
// que bloquea es tener un cobro puntual pendiente de pago.
export function tieneAdeudoBloqueante(correo, movimientosConMontos, jugadoresDict, proximaFecha) {
  if (!proximaFecha) return false;
  const excepciones = jugadoresDict?.[correo]?.excepciones || [];
  if (excepciones.includes(proximaFecha)) return false;
  return movimientosConMontos.some(
    (m) => m.correo === correo && !m.pagado && m.montoTotal > 0 && m.fecha < proximaFecha
  );
}

// finanzas generales de UN campeonato: recaudado, premios pagados, gastos fijos y el fondo
// acumulado (mismo % que ya se define en el Tablero de Control para ese campeonato)
export function finanzasCampeonato(campeonato, movimientosConMontos, tableroMapa) {
  const datos = tableroMapa?.[campeonato];
  const deEsteCampeonato = movimientosConMontos.filter((m) => m.campeonato === campeonato);
  const recaudadoCobrado = deEsteCampeonato.filter((m) => m.pagado).reduce((a, m) => a + m.montoTotal, 0);
  const recaudadoPendiente = deEsteCampeonato.filter((m) => !m.pagado).reduce((a, m) => a + m.montoTotal, 0);
  const premiosPagados = deEsteCampeonato.reduce((a, m) => a + m.totalGanado, 0);
  const gastosFijos = (datos?.gastosCampeonato || []).reduce((a, g) => a + (Number(g.monto) || 0), 0);
  const pctAcumulado = Number(datos?.premios?.porTorneo?.pctAcumulado) || 0;
  const fondoAcumuladoEstimado = (recaudadoCobrado * pctAcumulado) / 100;
  return {
    recaudadoCobrado,
    recaudadoPendiente,
    premiosPagados,
    gastosFijos,
    fondoAcumuladoEstimado,
    saldoNeto: recaudadoCobrado - premiosPagados - gastosFijos,
  };
}
