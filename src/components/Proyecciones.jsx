import { useEffect, useMemo, useState } from "react";
import { prepararDatos, calcular } from "../lib/proyecciones.js";

// 123ª entrega: "Estadísticas y proyecciones" — pestaña dentro del sitio (antes eran dos dashboards
// externos que exigían cuenta de Claude). Lee /api/estadisticas, /api/tablero, /api/calendario y
// /api/campeonatos (los mismos de "Resultados") y calcula todo en el navegador (ver lib/proyecciones.js).
// Rol: la pestaña "Dinero" y las columnas/fichas de dinero solo las ven Administrador General,
// Administrador y Tesorero — mismo criterio que "Por resultado" en Resultados (90ª entrega). Como App.jsx
// pasa la sesión efectiva, "Ver como jugador" esconde el dinero igual que a un jugador de verdad.
// Nota de seguridad: igual que en "Resultados", la restricción es de pantalla; el GET de
// /api/estadisticas sigue entregando los montos a cualquier sesión.

const API = { est: "/api/estadisticas", tablero: "/api/tablero", cal: "/api/calendario", camp: "/api/campeonatos" };
const COLORES = ["#24463a", "#a8791c", "#8a3324", "#3d6b8a"];

const int = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const dec = (v, n = 1) => Number(v).toFixed(n);
const pct = (v) => dec(v, 1) + "%";
const money = (v) => {
  const s = "$ " + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? "(" + s + ")" : s;
};
const fecha = (f) => {
  const [y, m, d] = String(f).split("-");
  return d + "/" + m + "/" + y;
};
const claseMonto = (v) => (v > 0 ? "pry-pos" : v < 0 ? "pry-neg" : "");

function puedeVerDinero(rol) {
  return rol === "Administrador General" || rol === "Administrador" || rol === "Tesorero";
}

// ordena un arreglo por un campo (texto o número); desempata con `desempate`
function ordenar(lista, campo, asc, desempate) {
  return lista.slice().sort((a, b) => {
    const v = typeof a[campo] === "string" ? a[campo].localeCompare(b[campo]) : a[campo] - b[campo];
    return (asc ? v : -v) || desempate(a, b);
  });
}

function Encabezado({ campo, orden, setOrden, children, izq, ascInicial }) {
  const activo = orden.campo === campo;
  return (
    <th className={izq ? "pry-l" : ""}>
      <button
        type="button"
        className={"pry-sort" + (activo ? " activo" : "")}
        onClick={() => setOrden(activo ? { campo, asc: !orden.asc } : { campo, asc: !!ascInicial })}
        title="Ordenar por esta columna"
      >
        {children}
        {activo ? (orden.asc ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

function Tarjeta({ titulo, nota, children }) {
  return (
    <div className="pry-card">
      <h2>{titulo}</h2>
      {nota && <p className="pry-nota">{nota}</p>}
      {children}
    </div>
  );
}

function Ficha({ etiqueta, valor, clase }) {
  return (
    <div className="pry-ficha">
      <span>{etiqueta}</span>
      <strong className={clase || ""}>{valor}</strong>
    </div>
  );
}

// ───────── gráficas (SVG a mano, sin librerías) ─────────

function GraficaRango({ datos }) {
  const d = datos.slice().sort((a, b) => b.p50 - a.p50 || a.lugar - b.lugar).slice(0, 12);
  if (!d.length) return null;
  const W = 640, M = 120, fila = 28, H = d.length * fila + 40;
  const max = Math.max(...d.map((r) => r.p90)) || 1;
  const paso = max <= 100 ? 20 : max <= 250 ? 50 : 100;
  const tope = Math.ceil(max / paso) * paso;
  const x = (v) => M + (v / tope) * (W - M - 16);
  const ticks = [];
  for (let v = 0; v <= tope; v += paso) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Rango probable de puntos finales por jugador" className="pry-svg">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={8} y2={H - 28} className="pry-grid" />
          <text x={x(v)} y={H - 10} textAnchor="middle" className="pry-eje">{int(v)}</text>
        </g>
      ))}
      {d.map((r, i) => {
        const y = 8 + i * fila + fila / 2;
        return (
          <g key={r.alias}>
            <title>{`${r.alias}: hoy ${int(r.puntos)} pts · final probable ${int(r.p50)} · rango ${int(r.p10)} a ${int(r.p90)} · 1º ${pct(r.p1)} · Top 4 ${pct(r.top4)}`}</title>
            <text x={M - 8} y={y} dy=".32em" textAnchor="end" className="pry-txt">{r.alias}</text>
            <line x1={x(r.p10)} x2={x(r.p90)} y1={y} y2={y} strokeWidth="6" strokeLinecap="round" className="pry-rango" />
            <circle cx={x(r.puntos)} cy={y} r="5" fill="var(--surface)" stroke={COLORES[0]} strokeWidth="2" />
            <circle cx={x(r.p50)} cy={y} r="5" fill={COLORES[0]} />
          </g>
        );
      })}
    </svg>
  );
}

function GraficaJugador({ torneos, historial }) {
  if (!torneos.length) return null;
  const W = 560, H = 260, L = 34;
  const max = Math.max(30, ...historial.map((r) => r.puntos));
  const tope = Math.ceil(max / 10) * 10;
  const y = (v) => H - 26 - (v / tope) * (H - 26 - 18);
  const paso = (W - L - 4) / torneos.length;
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((tope * i) / 4));
  const cada = Math.ceil(36 / paso);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Puntos por torneo" className="pry-svg">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} className="pry-grid" />
          <text x={L - 6} y={y(v)} dy=".32em" textAnchor="end" className="pry-eje">{v}</text>
        </g>
      ))}
      {torneos.map((t, i) => {
        const r = historial.find((h) => h.n === t.n);
        const bx = L + i * paso + paso * 0.125;
        const bw = paso * 0.75;
        return (
          <g key={t.n}>
            {i % cada === 0 && <text x={bx + bw / 2} y={H - 8} textAnchor="middle" className="pry-eje">{t.etiqueta}</text>}
            {r && (
              <g>
                <title>{`${t.etiqueta} · ${r.tipo} · ${fecha(t.fecha)} — lugar ${r.lugar} de ${r.jugadores} — ${int(r.puntos)} puntos`}</title>
                <rect x={bx} y={y(r.puntos)} width={bw} height={y(0) - y(r.puntos)} rx="3" fill={r.tipo === "Main" ? COLORES[1] : COLORES[0]} />
                <text x={bx + bw / 2} y={y(r.puntos) - 5} textAnchor="middle" className="pry-txt">{r.lugar}º</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function GraficaCarrera({ torneos, historial, seleccion }) {
  const pub = torneos.filter((t) => t.estado === "Publicado");
  if (!pub.length || !seleccion.length) return null;
  const series = seleccion.map((alias) => {
    let s = 0;
    return {
      alias,
      v: pub.map((t) => {
        const r = historial.find((x) => x.alias === alias && x.n === t.n);
        s += r ? r.puntos : 0;
        return { t, s, r };
      }),
    };
  });
  const W = 640, H = 290, L = 36, R = 120;
  const tope = Math.max(10, ...series.map((s) => s.v[s.v.length - 1].s));
  const t5 = Math.ceil(tope / 5 / 10) * 10;
  const max = t5 * 5 >= tope ? t5 * 5 : Math.ceil(tope / 10) * 10;
  const y = (v) => H - 26 - (v / max) * (H - 26 - 10);
  const x = (i) => (pub.length === 1 ? L + (W - R - L) / 2 : L + (i * (W - R - L)) / (pub.length - 1));
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => Math.round((max * i) / 5));
  const finales = series.map((s, i) => ({ s, i, y: y(s.v[s.v.length - 1].s) })).sort((a, b) => a.y - b.y);
  finales.forEach((e, k) => { if (k && e.y < finales[k - 1].y + 15) e.y = finales[k - 1].y + 15; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Puntos acumulados por torneo" className="pry-svg">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="pry-grid" />
          <text x={L - 6} y={y(v)} dy=".32em" textAnchor="end" className="pry-eje">{v}</text>
        </g>
      ))}
      {pub.map((t, i) => <text key={t.n} x={x(i)} y={H - 8} textAnchor="middle" className="pry-eje">{t.etiqueta}</text>)}
      {series.map((s, k) => (
        <g key={s.alias}>
          <path d={s.v.map((p, i) => (i ? "L" : "M") + x(i) + " " + y(p.s)).join(" ")} fill="none" stroke={COLORES[k]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {s.v.map((p, i) => (
            <circle key={p.t.n} cx={x(i)} cy={y(p.s)} r="4" fill={COLORES[k]}>
              <title>{`${p.t.etiqueta} · ${s.alias} — ${int(p.s)} puntos acumulados — ${p.r ? "lugar " + p.r.lugar : "no jugó"}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {finales.map((e) => (
        <text key={e.s.alias} x={W - R + 8} y={e.y} dy=".32em" fill={COLORES[e.i]} className="pry-etq">{e.s.alias} {e.s.v[e.s.v.length - 1].s}</text>
      ))}
    </svg>
  );
}

// ───────── pestañas ─────────

function TabMetodo() {
  return (
    <Tarjeta titulo="Cómo se calcula la proyección">
      <ol className="pry-metodo">
        <li>Se simulan 10,000 veces los torneos pendientes con los puntos del Tablero de Control, incluidos los Main. El resultado no cambia entre aperturas si los datos no cambian.</li>
        <li>Asistencia: la probabilidad de que un jugador se presente sale de cuántos torneos ha jugado. No considera si ya está Inactivo ni a jugadores nuevos.</li>
        <li>Nivel: el promedio de su posición relativa en cada mesa, acercado a la media con el peso de cinco torneos para no sobrevalorar una racha. Un nivel alto mejora las chances, pero el azar sigue pesando más.</li>
        <li>Kills: cada jugador mantiene su ritmo por torneo, también acercado a la media de la liga.</li>
        <li>Puntos: el Total no suma Práctica. Con pocos torneos jugados, trata estas cifras como rangos orientativos.</li>
      </ol>
    </Tarjeta>
  );
}

function TabCampeonato({ D }) {
  const [orden, setOrden] = useState({ campo: "lugar", asc: true });
  const filas = ordenar(D.proyeccion, orden.campo, orden.asc, (a, b) => a.lugar - b.lugar);
  const cols = [
    ["lugar", "Lugar", false, true], ["alias", "Alias", true, true], ["puntos", "Puntos"], ["kills", "Kills"], ["torneos", "Torneos"],
    ["p50", "Final prob."], ["p10", "Mínimo"], ["p90", "Máximo"], ["p1", "1º"], ["top4", "Top 4"], ["rey", "Rey Killer"], ["p1Azar", "1º sin forma"],
  ];
  return (
    <>
      <Tarjeta titulo="Dónde puede terminar cada jugador" nota="Los 12 con mejor proyección. El tramo cubre 8 de cada 10 simulaciones de los torneos pendientes.">
        <div className="pry-leyenda">
          <span><i style={{ boxShadow: `inset 0 0 0 2px ${COLORES[0]}` }} />Puntos hoy</span>
          <span><i style={{ background: COLORES[0] }} />Final más probable</span>
        </div>
        <GraficaRango datos={D.proyeccion} />
      </Tarjeta>
      <Tarjeta
        titulo="Clasificación y proyección"
        nota={'"Top 4" y "Rey Killer" son los cinco premios del campeonato. "1º sin forma" supone que todos tienen el mismo nivel: la distancia con "1º" es lo que aporta la forma mostrada hasta ahora. Toca un encabezado para ordenar.'}
      >
        <div className="pry-wrap">
          <table className="pry-tabla">
            <thead>
              <tr>{cols.map(([c, t, izq, asc]) => <Encabezado key={c} campo={c} orden={orden} setOrden={setOrden} izq={izq} ascInicial={asc}>{t}</Encabezado>)}</tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.alias}>
                  <td>{r.lugar}</td><td className="pry-l">{r.alias}</td><td>{int(r.puntos)}</td><td>{int(r.kills)}</td><td>{r.torneos}</td>
                  <td>{int(r.p50)}</td><td>{int(r.p10)}</td><td>{int(r.p90)}</td>
                  <td>{pct(r.p1)}</td><td>{pct(r.top4)}</td><td>{pct(r.rey)}</td><td>{pct(r.p1Azar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </>
  );
}

function Selector({ etiqueta, valor, onChange, aliases, vacio }) {
  return (
    <label className="pry-campo">
      {etiqueta}
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {vacio && <option value="">Ninguno</option>}
        {aliases.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </label>
  );
}

function TabJugador({ D, dinero, jugador, setJugador, aliases }) {
  const c = D.clasificacion.find((r) => r.alias === jugador);
  const p = D.proyeccion.find((r) => r.alias === jugador);
  const h = D.historial.filter((r) => r.alias === jugador);
  const victimas = D.matriz.filter((m) => m.killer === jugador).slice(0, 5);
  const verdugos = D.matriz.filter((m) => m.victima === jugador).slice(0, 5);
  return (
    <>
      <div className="pry-controles"><Selector etiqueta="Jugador" valor={jugador} onChange={setJugador} aliases={aliases} /></div>
      {c && (
        <div className="pry-fichas">
          <Ficha etiqueta="Lugar" valor={c.lugar + "º"} />
          <Ficha etiqueta="Puntos" valor={int(c.puntos)} />
          <Ficha etiqueta="Kills" valor={int(c.kills)} />
          <Ficha etiqueta="Lugar promedio" valor={dec(c.lugarPromedio)} />
          <Ficha etiqueta="Mesa final (top 9)" valor={int(c.mesaFinal)} />
          <Ficha etiqueta="Re-buys por torneo" valor={dec(c.rebuysProm, 2)} />
          <Ficha etiqueta="Probabilidad top 4" valor={p ? pct(p.top4) : "—"} />
          {dinero && <Ficha etiqueta="Saldo" valor={money(c.saldo)} clase={claseMonto(c.saldo)} />}
        </div>
      )}
      <div className="pry-rejilla">
        <Tarjeta titulo="Puntos por torneo" nota="Sobre cada barra, el lugar. Los torneos Main se distinguen por color.">
          <GraficaJugador torneos={D.torneos} historial={h} />
        </Tarjeta>
        <Tarjeta titulo="Sus rivales" nota="A quién elimina más y quién lo elimina más.">
          <table className="pry-tabla"><thead><tr><th className="pry-l">Sus víctimas</th><th>Kills</th></tr></thead>
            <tbody>{victimas.map((m) => <tr key={m.clave}><td className="pry-l">{m.victima}</td><td>{m.kills}</td></tr>)}</tbody></table>
          <table className="pry-tabla"><thead><tr><th className="pry-l">Lo eliminaron</th><th>Veces</th></tr></thead>
            <tbody>{verdugos.map((m) => <tr key={m.clave}><td className="pry-l">{m.killer}</td><td>{m.kills}</td></tr>)}</tbody></table>
        </Tarjeta>
      </div>
      <Tarjeta titulo="Torneo por torneo">
        <div className="pry-wrap">
          <table className="pry-tabla">
            <thead>
              <tr>
                <th>Torneo</th><th>Tipo</th><th>Lugar</th><th>Jugadores</th><th>Puntos</th><th>Re-buys</th><th>Add-on</th>
                {dinero && <><th>Deuda</th><th>Ganancia</th><th>Saldo</th></>}
              </tr>
            </thead>
            <tbody>
              {h.map((r) => (
                <tr key={r.clave}>
                  <td>{r.etiqueta}</td><td>{r.tipo}</td><td>{r.lugar}</td><td>{r.jugadores}</td><td>{r.puntos}</td><td>{r.rebuys}</td><td>{r.addon ? "Sí" : "No"}</td>
                  {dinero && (
                    <>
                      <td className={claseMonto(-r.deuda)}>{money(-r.deuda)}</td>
                      <td className={claseMonto(r.premio)}>{money(r.premio)}</td>
                      <td className={claseMonto(r.saldo)}>{money(r.saldo)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </>
  );
}

function TabComparar({ D, dinero, sel, setSel, aliases }) {
  const elegidos = [...new Set(sel.filter((a) => a && aliases.includes(a)))];
  const metricas = [
    ["Lugar", "lugar", (v) => v + "º"], ["Puntos", "puntos", int], ["Torneos", "torneos", int], ["Kills", "kills", int],
    ["Veces eliminado", "eliminado", int], ["Mejor lugar", "mejorLugar", (v) => v + "º"], ["Lugar promedio", "lugarPromedio", (v) => dec(v)],
    ["Percentil promedio", "percentil", pct], ["Podios", "podios", int], ["Mesa final", "mesaFinal", int],
    ["Re-buys por torneo", "rebuysProm", (v) => dec(v, 2)],
    ...(dinero ? [["Saldo", "saldo", money], ["Retorno", "retorno", pct]] : []),
  ];
  const pares = [];
  elegidos.forEach((a, i) => elegidos.slice(i + 1).forEach((b) => { const r = D.duelos.find((x) => x.a === a && x.b === b); if (r) pares.push(r); }));
  const cambiar = (i, v) => setSel(sel.map((x, k) => (k === i ? v : x)));
  return (
    <>
      <div className="pry-controles">
        {["A", "B", "C", "D"].map((l, i) => (
          <Selector key={l} etiqueta={"Jugador " + l} valor={sel[i] || ""} onChange={(v) => cambiar(i, v)} aliases={aliases} vacio={i >= 2} />
        ))}
      </div>
      <Tarjeta titulo="Puntos acumulados">
        <GraficaCarrera torneos={D.torneos} historial={D.historial} seleccion={elegidos} />
      </Tarjeta>
      <div className="pry-rejilla">
        <Tarjeta titulo="Lado a lado">
          <div className="pry-wrap">
            <table className="pry-tabla">
              <thead><tr><th className="pry-l">Métrica</th>{elegidos.map((a) => <th key={a}>{a}</th>)}</tr></thead>
              <tbody>
                {metricas.map(([n, c, f]) => (
                  <tr key={c}>
                    <td className="pry-l">{n}</td>
                    {elegidos.map((a) => { const r = D.clasificacion.find((x) => x.alias === a); return <td key={a}>{r ? f(r[c]) : "—"}</td>; })}
                  </tr>
                ))}
                {[["Prob. de ganar", "p1"], ["Prob. top 4", "top4"], ["Prob. Rey Killer", "rey"]].map(([n, c]) => (
                  <tr key={c}>
                    <td className="pry-l">{n}</td>
                    {elegidos.map((a) => { const r = D.proyeccion.find((x) => x.alias === a); return <td key={a}>{r ? pct(r[c]) : "—"}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Duelos directos" nota="Solo cuenta los torneos en que coincidieron.">
          <div className="pry-wrap">
            <table className="pry-tabla">
              <thead><tr><th className="pry-l">Jugador</th><th className="pry-l">Contra</th><th>Juntos</th><th>Arriba</th><th>Abajo</th><th>Le eliminó</th><th>Lo eliminó</th></tr></thead>
              <tbody>
                {pares.map((r) => (
                  <tr key={r.clave}><td className="pry-l">{r.a}</td><td className="pry-l">{r.b}</td><td>{r.juntos}</td><td>{r.arriba}</td><td>{r.abajo}</td><td>{r.killsAB}</td><td>{r.killsBA}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>
    </>
  );
}

function TabKillers({ D }) {
  const m = D.matriz;
  if (!m.length) return <Tarjeta titulo="Quién elimina a quién"><p className="pry-nota">Todavía no hay kills registrados.</p></Tarjeta>;
  const sumar = (campo) => { const t = new Map(); m.forEach((x) => t.set(x[campo], (t.get(x[campo]) || 0) + x.kills)); return t; };
  const tk = sumar("killer");
  const tv = sumar("victima");
  const killers = [...tk.keys()].sort((a, b) => tk.get(b) - tk.get(a) || a.localeCompare(b));
  const victimas = [...tv.keys()].filter((a) => a !== "(sin víctima)").sort((a, b) => tv.get(b) - tv.get(a) || a.localeCompare(b));
  const cols = [...victimas, "(sin víctima)"];
  const max = Math.max(...m.map((x) => x.kills)) || 1;
  return (
    <Tarjeta titulo="Quién elimina a quién" nota="Cada fila es el killer y cada columna la víctima. La última columna son los kills que se asignaron a mano y no dicen a quién eliminó.">
      <div className="pry-wrap">
        <table className="pry-tabla pry-matriz">
          <thead>
            <tr><th className="pry-k">Killer</th><th>Total</th>{cols.map((a) => <th key={a} className="pry-v">{a}</th>)}</tr>
          </thead>
          <tbody>
            {killers.map((a) => (
              <tr key={a}>
                <td className="pry-k">{a}</td><td>{tk.get(a)}</td>
                {cols.map((b) => {
                  const r = m.find((x) => x.killer === a && x.victima === b);
                  return (
                    <td key={b} title={r ? `${a} eliminó a ${b}: ${r.kills}` : undefined}
                      style={r ? { background: `color-mix(in srgb, ${COLORES[0]} ${Math.round(20 + (60 * r.kills) / max)}%, transparent)` } : undefined}>
                      {r ? r.kills : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

function TabDinero({ D }) {
  const [orden, setOrden] = useState({ campo: "saldo", asc: false });
  const filas = ordenar(D.clasificacion, orden.campo, orden.asc, (a, b) => a.alias.localeCompare(b.alias));
  const maxSaldo = Math.max(1, ...D.clasificacion.map((r) => Math.abs(r.saldo)));
  const pub = D.torneos.filter((t) => t.estado === "Publicado");
  const total = D.acumulado.find((a) => a.concepto === "Total");
  const cols = [
    ["alias", "Alias", true, true], ["torneos", "Torneos"], ["deuda", "Deuda"], ["premio", "Ganancia"], ["saldo", "Saldo", true],
    ["retorno", "Retorno"], ["rebuys", "Re-buys"], ["pctRebuys", "% Re-Buys"], ["addon", "Add-on"], ["pctAddon", "% Add-on"],
  ];
  return (
    <>
      <div className="pry-fichas">
        <Ficha etiqueta="Bolsa de los torneos" valor={pub.length ? money(pub.reduce((s, t) => s + t.bolsa, 0)) : "—"} />
        <Ficha etiqueta="Acumulado hoy" valor={total ? money(total.hoy) : "—"} />
        <Ficha etiqueta="Acumulado proyectado" valor={total ? money(total.proyectado) : "—"} />
      </div>
      <Tarjeta titulo="Saldo por jugador" nota="Ganancia menos deuda de los torneos publicados. No incluye inscripción, centavos de referencia ni el premio del campeonato. Toca un encabezado para ordenar.">
        <div className="pry-wrap">
          <table className="pry-tabla">
            <thead>
              <tr>{cols.map(([c, t, izq, asc]) => <Encabezado key={c} campo={c} orden={orden} setOrden={setOrden} izq={izq} ascInicial={asc}>{t}</Encabezado>)}</tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.alias}>
                  <td className="pry-l">{r.alias}</td><td>{r.torneos}</td>
                  <td className={claseMonto(-r.deuda)}>{money(-r.deuda)}</td>
                  <td className={claseMonto(r.premio)}>{money(r.premio)}</td>
                  <td className="pry-l">
                    <span className="pry-barra" style={{ width: (3.5 * Math.abs(r.saldo)) / maxSaldo + "rem", background: r.saldo >= 0 ? "var(--good)" : "var(--bad)" }} />
                    <span className={claseMonto(r.saldo)}>{money(r.saldo)}</span>
                  </td>
                  <td className={claseMonto(r.retorno)}>{pct(r.retorno)}</td>
                  <td>{r.rebuys}</td><td>{pct(r.pctRebuys)}</td><td>{r.addon}</td><td>{pct(r.pctAddon)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      <div className="pry-rejilla">
        <Tarjeta titulo="Bolsa por torneo">
          <div className="pry-wrap">
            <table className="pry-tabla">
              <thead><tr><th>Torneo</th><th>Tipo</th><th>Jugadores</th><th>Re-buys</th><th>Bolsa</th><th>Al acumulado</th><th>Premios</th></tr></thead>
              <tbody>
                {pub.map((t) => (
                  <tr key={t.n}><td>{t.etiqueta}</td><td>{t.tipo}</td><td>{t.jugadores}</td><td>{t.rebuys}</td><td>{money(t.bolsa)}</td><td>{money(t.provision)}</td><td>{money(t.premios)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Premio del campeonato" nota="La proyección suma los torneos pendientes con la provisión promedio de su tipo.">
          <table className="pry-tabla">
            <thead><tr><th className="pry-l">Premio</th><th>%</th><th>Hoy</th><th>Proyectado</th></tr></thead>
            <tbody>
              {D.acumulado.map((a) => (
                <tr key={a.concepto} className={a.concepto === "Total" ? "pry-total" : ""}>
                  <td className="pry-l">{a.concepto}</td><td>{dec(a.pct, 2)}%</td><td>{money(a.hoy)}</td><td>{money(a.proyectado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      </div>
    </>
  );
}

// ───────── pantalla ─────────

export default function Proyecciones({ session }) {
  const dinero = puedeVerDinero(session?.rol);
  const [crudo, setCrudo] = useState(null);
  const [error, setError] = useState("");
  const [D, setD] = useState(null);
  const [pestana, setPestana] = useState("metodo");
  const [jugador, setJugador] = useState("");
  const [sel, setSel] = useState(["", "", "", ""]);

  useEffect(() => {
    let vivo = true;
    const g = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo leer " + u))));
    Promise.all([g(API.est), g(API.tablero), g(API.cal), g(API.camp)])
      .then(([est, tablero, cal, camp]) => vivo && setCrudo({ est, tablero, cal, camp }))
      .catch((e) => vivo && setError(e.message || "No se pudieron cargar las estadísticas."));
    return () => { vivo = false; };
  }, []);

  // la simulación tarda un instante: se difiere para que la pantalla alcance a pintar "Calculando…"
  useEffect(() => {
    if (!crudo) return undefined;
    const id = setTimeout(() => {
      try {
        const datos = prepararDatos(crudo);
        if (!datos.resultados.some((r) => r.tipo !== "Práctica")) { setD({ vacio: true, campeonato: datos.campeonato }); return; }
        const res = calcular(datos);
        setD({ ...res, campeonato: datos.campeonato });
        const orden = res.clasificacion.map((c) => c.alias);
        setJugador((j) => j || orden[0] || "");
        setSel((s) => (s[0] ? s : [orden[0] || "", orden[1] || "", "", ""]));
      } catch (e) {
        setError("No se pudieron calcular las estadísticas: " + (e.message || e));
      }
    }, 30);
    return () => clearTimeout(id);
  }, [crudo]);

  const aliases = useMemo(() => (D && !D.vacio ? D.clasificacion.map((c) => c.alias).sort((a, b) => a.localeCompare(b)) : []), [D]);

  const pestanas = [["metodo", "Método de proyección"], ["campeonato", "Campeonato"], ["jugador", "Jugador"], ["comparar", "Comparar"], ["killers", "Killers"], ...(dinero ? [["dinero", "Dinero"]] : [])];
  const activa = pestanas.some(([k]) => k === pestana) ? pestana : "metodo";

  let encabezado = null;
  if (D && !D.vacio) {
    const lider = D.proyeccion[0];
    const pend = D.torneos.filter((t) => t.estado === "Pendiente").length;
    const pubs = D.torneos.filter((t) => t.estado === "Publicado");
    const ult = pubs[pubs.length - 1];
    encabezado = (
      <p className="pry-lead">
        <b>{lider.alias}</b> lidera con <b>{int(lider.puntos)}</b> puntos y la carrera sigue abierta: quedan <b>{pend}</b> torneos, y hoy tiene{" "}
        <b>{pct(lider.p1)}</b> de probabilidad de ganar el campeonato. Datos al último torneo publicado, <b>{ult ? `${ult.etiqueta} (${fecha(ult.fecha)})` : "—"}</b>.
      </p>
    );
  }

  return (
    <div className="pry">
      <div className="eyebrow">♠ Torrente On Line Series - TOLS 3.0</div>
      <h1>TOLS 3.0 · {D?.campeonato || crudo?.camp?.activo || "Estadísticas y proyecciones"}</h1>
      {error && <div className="section-sub" style={{ color: "#b00020" }}>{error}</div>}
      {!error && !D && <p className="subtitle">{crudo ? "Calculando proyecciones…" : "Cargando…"}</p>}
      {D?.vacio && <p className="subtitle">Todavía no hay torneos publicados en el campeonato activo.</p>}
      {D && !D.vacio && (
        <>
          {encabezado}
          <div className="pry-tabs" role="tablist" aria-label="Secciones">
            {pestanas.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={activa === k} className={"pry-tab" + (activa === k ? " activo" : "")} onClick={() => setPestana(k)}>{t}</button>
            ))}
          </div>
          {activa === "metodo" && <TabMetodo />}
          {activa === "campeonato" && <TabCampeonato D={D} />}
          {activa === "jugador" && <TabJugador D={D} dinero={dinero} jugador={jugador} setJugador={setJugador} aliases={aliases} />}
          {activa === "comparar" && <TabComparar D={D} dinero={dinero} sel={sel} setSel={setSel} aliases={aliases} />}
          {activa === "killers" && <TabKillers D={D} />}
          {activa === "dinero" && dinero && <TabDinero D={D} />}
        </>
      )}
    </div>
  );
}
