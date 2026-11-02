// 123ª entrega: cálculos de "Estadísticas y proyecciones" — versión dentro del sitio (sin Claude ni
// artefactos externos) de lo que antes eran los dashboards "TOLS Estadísticas" / "TOLS Tesorería".
// Todo se calcula en el navegador a partir de lo que ya entregan /api/estadisticas, /api/tablero,
// /api/calendario y /api/campeonatos; no se guarda nada nuevo ni se agregó ningún endpoint.
// Las funciones son puras (misma entrada → misma salida): la simulación usa una semilla fija, así que
// el resultado no cambia entre aperturas si los datos no cambian.

const SIMS = 10000;
const SEMILLA = 20261102;
const PESO_FORMA = 1;
const PRIOR_KILLS = 3;
const PRIOR_TORNEOS_NIVEL = 5;

// Convierte lo que devuelven las APIs en filas planas: una por jugador por torneo.
export function prepararDatos({ est, tablero, cal, camp }) {
  const activo = camp?.activo || "";
  const todos = est?.torneos || {};
  const practica = todos.__practica__ || {};
  const delCamp = todos[activo] || {};
  const fuente = { ...delCamp, ...practica };
  const resultados = [];
  const killsSinVictima = [];
  for (const [fecha, t] of Object.entries(fuente)) {
    if (!t?.publicado) continue;
    const tipo = practica[fecha] ? "Práctica" : t.tipo;
    const ka = t.killsAsignados || {};
    for (const j of Object.values(t.jugadores || {})) {
      resultados.push({
        fecha,
        tipo,
        alias: j.alias,
        lugar: Number(j.lugar) || 0,
        rebuys: Number(j.rebuys) || 0,
        addon: j.addon ? 1 : 0,
        puntos: Number(j.puntos) || 0,
        deuda: Number(j.debeTotal) || 0,
        premio: Number(j.premioTotal) || 0,
        killer: ka[j.alias] !== undefined ? ka[j.alias] : j.eliminadoPor || "",
      });
    }
    (t.logKillersNoResueltos || []).forEach((l, i) => killsSinVictima.push({ fecha, indice: i + 1, asignadoA: l.asignadoA || "" }));
  }
  const calendario = (cal?.torneos || [])
    .filter((x) => x.temporada === activo || x.practica)
    .map((x) => ({ fecha: x.fecha, temporada: x.temporada || "", main: x.main ? 1 : 0, practica: x.practica ? 1 : 0 }));
  const T = tablero?.[activo] || {};
  const reglas = {
    posiciones: T.puntos?.posiciones || [],
    asistencia: T.puntos?.asistencia || { regular: 0, main: 0 },
    premiosCampeonato: T.premios?.porCampeonato?.lugares || [],
    pctAcumulado: Number(T.premios?.porTorneo?.pctAcumulado) || 0,
  };
  return { campeonato: activo, resultados, killsSinVictima, calendario, reglas };
}

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
  return d[a.length][b.length];
};

function killsEfectivos(resultados, killsSinVictima) {
  const camp = resultados.filter((r) => r.tipo !== "Práctica");
  const liga = [...new Set(camp.map((r) => r.alias))];
  const fechas = new Set(camp.map((r) => r.fecha));
  // un killer que no existe en la liga se atribuye al alias más parecido (distancia < 3)
  const fijar = (x) => {
    if (liga.includes(x)) return x;
    let mejor = x;
    let dist = 3;
    for (const a of liga) {
      const v = lev(x.toLowerCase(), a.toLowerCase());
      if (v < dist) { dist = v; mejor = a; }
    }
    return mejor;
  };
  const filas = camp
    .filter((r) => r.killer)
    .map((r) => ({ clave: r.fecha + "|" + r.alias, fecha: r.fecha, killer: fijar(r.killer), victima: r.alias }));
  killsSinVictima
    .filter((k) => k.asignadoA && fechas.has(k.fecha))
    .forEach((k) => filas.push({ clave: k.fecha + "|#" + k.indice, fecha: k.fecha, killer: fijar(k.asignadoA), victima: "(sin víctima)" }));
  return filas;
}

export function calcular(datos) {
  const { resultados, killsSinVictima, calendario, reglas } = datos;
  const kills = killsEfectivos(resultados, killsSinVictima);

  // Torneos del campeonato numerados T1..Tn (la Práctica no cuenta)
  const torneos = calendario
    .filter((c) => !c.practica)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((c, i) => {
      const f = resultados.filter((r) => r.fecha === c.fecha);
      const bolsa = f.reduce((s, r) => s + r.deuda, 0);
      return {
        n: i + 1, etiqueta: "T" + (i + 1), fecha: c.fecha, tipo: c.main ? "Main" : "Regular", temporada: c.temporada,
        estado: f.length ? "Publicado" : "Pendiente", jugadores: f.length,
        rebuys: f.reduce((s, r) => s + r.rebuys, 0), addons: f.reduce((s, r) => s + r.addon, 0),
        bolsa, provision: (bolsa * reglas.pctAcumulado) / 100, premios: f.reduce((s, r) => s + r.premio, 0),
      };
    });

  const historial = resultados
    .filter((r) => r.tipo !== "Práctica")
    .map((r) => {
      const t = torneos.find((x) => x.fecha === r.fecha) || {};
      return {
        clave: r.fecha + "|" + r.alias, n: t.n, etiqueta: t.etiqueta, fecha: r.fecha, tipo: r.tipo, alias: r.alias, lugar: r.lugar,
        jugadores: t.jugadores, percentil: t.jugadores > 1 ? (t.jugadores - r.lugar) / (t.jugadores - 1) : 0.5,
        puntos: r.puntos, rebuys: r.rebuys, addon: r.addon, deuda: r.deuda, premio: r.premio, saldo: r.premio - r.deuda,
      };
    })
    .sort((a, b) => a.n - b.n || a.lugar - b.lugar);

  // Estadísticas por jugador. El Total de puntos no suma Práctica (igual que Clasificación general).
  const liga = [...new Set(historial.map((r) => r.alias))];
  const clasificacion = liga
    .map((alias) => {
      const h = historial.filter((r) => r.alias === alias);
      const t = h.length;
      const lugarSum = h.reduce((s, r) => s + r.lugar, 0);
      const pSum = h.reduce((s, r) => s + r.percentil, 0);
      const deuda = h.reduce((s, r) => s + r.deuda, 0);
      const premio = h.reduce((s, r) => s + r.premio, 0);
      const rebuys = h.reduce((s, r) => s + r.rebuys, 0);
      const addon = h.reduce((s, r) => s + r.addon, 0);
      return {
        alias, torneos: t, puntos: h.reduce((s, r) => s + r.puntos, 0),
        kills: kills.filter((k) => k.killer === alias).length,
        eliminado: kills.filter((k) => k.victima === alias).length,
        mejorLugar: Math.min(...h.map((r) => r.lugar)), lugarPromedio: +(lugarSum / t).toFixed(1),
        percentil: +((100 * pSum) / t).toFixed(1), podios: h.filter((r) => r.lugar <= 3).length,
        mesaFinal: h.filter((r) => r.lugar <= 9).length, rebuys, rebuysProm: +(rebuys / t).toFixed(2),
        addon, pctRebuys: +((100 * rebuys) / t).toFixed(1), pctAddon: +((100 * addon) / t).toFixed(1),
        deuda, premio, saldo: +(premio - deuda).toFixed(2), retorno: deuda ? +((100 * (premio - deuda)) / deuda).toFixed(1) : 0,
        nivel: (pSum + PRIOR_TORNEOS_NIVEL * 0.5) / (t + PRIOR_TORNEOS_NIVEL),
      };
    })
    .sort((a, b) => b.puntos - a.puntos || b.kills - a.kills || a.alias.localeCompare(b.alias))
    .map((f, i) => ({ lugar: i + 1, ...f }));

  // Quién elimina a quién
  const mm = {};
  kills.forEach((k) => {
    const c = k.killer + "|" + k.victima;
    mm[c] = mm[c] || { clave: c, killer: k.killer, victima: k.victima, kills: 0 };
    mm[c].kills++;
  });
  const matriz = Object.values(mm).sort((a, b) => b.kills - a.kills || a.clave.localeCompare(b.clave));

  // Duelos directos
  const duelos = [];
  for (const a of liga)
    for (const b of liga)
      if (a !== b) {
        let juntos = 0;
        let arriba = 0;
        historial.filter((r) => r.alias === a).forEach((x) => {
          const y = historial.find((r) => r.alias === b && r.n === x.n);
          if (y) { juntos++; if (x.lugar < y.lugar) arriba++; }
        });
        const kab = (matriz.find((m) => m.killer === a && m.victima === b) || {}).kills || 0;
        const kba = (matriz.find((m) => m.killer === b && m.victima === a) || {}).kills || 0;
        duelos.push({ clave: a + "|" + b, a, b, juntos, arriba, abajo: juntos - arriba, killsAB: kab, killsBA: kba });
      }

  // Premio del campeonato (provisión acumulada repartida según los % del Tablero)
  const pub = torneos.filter((t) => t.estado === "Publicado");
  const prom = (tp) => {
    const f = pub.filter((t) => t.tipo === tp);
    const u = f.length ? f : pub;
    return u.length ? u.reduce((s, t) => s + t.provision, 0) / u.length : 0;
  };
  const hoy = pub.reduce((s, t) => s + t.provision, 0);
  const proy = hoy + torneos.filter((t) => t.estado === "Pendiente").reduce((s, t) => s + prom(t.tipo), 0);
  const acumulado = reglas.premiosCampeonato.map((r) => ({
    concepto: r.label, pct: Number(r.pct) || 0, hoy: +((hoy * r.pct) / 100).toFixed(2), proyectado: +((proy * r.pct) / 100).toFixed(2),
  }));
  acumulado.push({ concepto: "Total", pct: acumulado.reduce((s, f) => s + f.pct, 0), hoy: +hoy.toFixed(2), proyectado: +proy.toFixed(2) });

  const proyeccion = proyectar(clasificacion, torneos, reglas);
  return { kills, torneos, historial, clasificacion, matriz, duelos, acumulado, proyeccion };
}

// Simulación Monte Carlo de los torneos pendientes (Plackett-Luce con muestreo de Gumbel)
function proyectar(clasificacion, torneos, reglas) {
  const pend = torneos.filter((t) => t.estado === "Pendiente");
  const jugados = torneos.length - pend.length;
  const pts = (tipo, pos) => {
    const c = tipo === "Main" ? "main" : "regular";
    const e = reglas.posiciones.find((p) => p.pos === pos);
    return (reglas.asistencia[c] || 0) + (e ? e[c] || 0 : 0);
  };
  const tablas = { Regular: [0], Main: [0] };
  for (const tp of ["Regular", "Main"]) for (let i = 1; i <= 60; i++) tablas[tp][i] = pts(tp, i);
  const N = clasificacion.length;
  const asist = clasificacion.map((c) => (c.torneos + 1) / (jugados + 2));
  const totK = clasificacion.reduce((s, c) => s + c.kills, 0);
  const totT = clasificacion.reduce((s, c) => s + c.torneos, 0);
  const media = totT ? totK / totT : 0;
  const tasa = clasificacion.map((c) => (c.kills + PRIOR_KILLS * media) / (c.torneos + PRIOR_KILLS));
  let seed = SEMILLA;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const correr = (conForma) => {
    const base = clasificacion.map((c) => (conForma ? PESO_FORMA * Math.log(c.nivel / (1 - c.nivel)) : 0));
    const p1 = new Float64Array(N);
    const top4 = new Float64Array(N);
    const rey = new Float64Array(N);
    const finales = clasificacion.map(() => new Int16Array(SIMS));
    const u = new Float64Array(N);
    for (let s = 0; s < SIMS; s++) {
      const pt = clasificacion.map((c) => c.puntos);
      const kl = clasificacion.map((c) => c.kills);
      for (const t of pend) {
        const mesa = [];
        for (let i = 0; i < N; i++)
          if (rnd() < asist[i]) {
            mesa.push(i);
            u[i] = base[i] - Math.log(-Math.log(rnd() || 1e-12));
            const lim = Math.exp(-tasa[i]);
            let k = 0;
            let q = rnd();
            while (q > lim) { k++; q *= rnd(); }
            kl[i] += k;
          }
        mesa.sort((a, b) => u[b] - u[a]);
        mesa.forEach((i, j) => { pt[i] += tablas[t.tipo][j + 1]; });
      }
      const orden = pt.map((v, i) => [v + rnd() * 0.5, i]).sort((a, b) => b[0] - a[0]);
      p1[orden[0][1]]++;
      for (let j = 0; j < 4 && j < N; j++) top4[orden[j][1]]++;
      const maxK = Math.max(...kl);
      const rs = kl.reduce((a, v, i) => (v === maxK ? a.concat(i) : a), []);
      rs.forEach((i) => { rey[i] += 1 / rs.length; });
      pt.forEach((v, i) => { finales[i][s] = v; });
    }
    return { p1, top4, rey, finales };
  };
  const F = correr(true);
  const Z = correr(false);
  const r1 = (x) => +((100 * x) / SIMS).toFixed(1);
  return clasificacion.map((c, i) => {
    const o = F.finales[i].slice().sort();
    return {
      alias: c.alias, lugar: c.lugar, puntos: c.puntos, kills: c.kills, torneos: c.torneos,
      asistencia: +(100 * asist[i]).toFixed(0), nivel: +(100 * c.nivel).toFixed(1),
      p10: o[Math.floor(SIMS * 0.1)], p50: o[Math.floor(SIMS * 0.5)], p90: o[Math.floor(SIMS * 0.9)],
      p1: r1(F.p1[i]), top4: r1(F.top4[i]), rey: r1(F.rey[i]), p1Azar: r1(Z.p1[i]), top4Azar: r1(Z.top4[i]),
    };
  });
}
