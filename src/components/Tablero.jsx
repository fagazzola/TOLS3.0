import data from "../data/tablero.json";

function money(n) {
  return "$" + Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 });
}
function pct(n) {
  return Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 }) + "%";
}
function sum(arr, key) {
  return arr.reduce((a, b) => a + Number(b[key] || 0), 0);
}

export default function Tablero() {
  const { premios: p, puntos: pu, costos: c, gastos: g } = data;
  const sumTorneo = sum(p.porTorneo.lugares, "pct");
  const sumCampeonato = sum(p.porCampeonato.lugares, "pct");

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series · Temporada 2026 · MOD 2</div>
          <h1>Tablero de Control</h1>
          <p className="subtitle">
            Reglas paramétricas de la liga: reparto de premios, puntos por posición, costos de inscripción y gastos
            adicionales.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Asignación de premios</div></div>

        <div className="subhead">
          Por torneo — {pct(p.porTorneo.pctAcumulado)} va al acumulado, {pct(100 - p.porTorneo.pctAcumulado)} se
          reparte así
        </div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: "1fr 90px" }}>
            <div>Lugar</div><div className="right">% del diferencial</div>
          </div>
          {p.porTorneo.lugares.map((l, i) => (
            <div className="trow" style={{ gridTemplateColumns: "1fr 90px" }} key={i}>
              <div>{l.label}</div><div className="right num">{pct(l.pct)}</div>
            </div>
          ))}
        </div>
        <div className={"check-line " + (sumTorneo === 100 ? "check-ok" : "check-bad")}>
          {sumTorneo === 100 ? "✓ suma 100% del diferencial" : `⚠ suma ${pct(sumTorneo)} — debería sumar 100%`}
        </div>

        <div className="subhead">Por campeonato — con el fondo acumulado de toda la temporada</div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: "1fr 90px" }}>
            <div>Lugar</div><div className="right">% del acumulado</div>
          </div>
          {p.porCampeonato.lugares.map((l, i) => (
            <div className="trow" style={{ gridTemplateColumns: "1fr 90px" }} key={i}>
              <div>{l.label}</div><div className="right num">{pct(l.pct)}</div>
            </div>
          ))}
        </div>
        <div className={"check-line " + (sumCampeonato === 100 ? "check-ok" : "check-bad")}>
          {sumCampeonato === 100 ? "✓ suma 100% del acumulado" : `⚠ suma ${pct(sumCampeonato)} — debería sumar 100%`}
        </div>
        <div className="section-sub">
          Regla de cómo se gana "Rey Killer": se define en <b>MOD 5 · Game Day</b>.
        </div>
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Asignación de puntos</div></div>
        <div className="section-sub">
          Asistencia: {pu.asistencia.regular} pt (Regular) · {pu.asistencia.main} pts (Main Event) — se otorga solo
          por presentarse.
        </div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: "60px 1fr 100px 100px" }}>
            <div>Pos.</div><div /><div className="right">Regular</div><div className="right">Main Event</div>
          </div>
          {pu.posiciones.map((row) => (
            <div className="trow" style={{ gridTemplateColumns: "60px 1fr 100px 100px" }} key={row.pos}>
              <div className="num">{row.pos}º</div><div /><div className="right num">{row.regular}</div>
              <div className="right num">{row.main}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Costos</div></div>
        <div className="section-sub">
          Cuota de inscripción base: <span className="num">{money(c.cuotaInscripcion)}</span> · Recompras máximas por
          jugador: <span className="num">{c.recomprasMax}</span>
        </div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: "1fr 100px 100px" }}>
            <div>Concepto</div><div className="right">Regular</div><div className="right">Main Event</div>
          </div>
          {c.conceptos.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: "1fr 100px 100px" }} key={i}>
              <div>{row.nombre}</div><div className="right num">{money(row.regular)}</div>
              <div className="right num">{money(row.main)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Gastos adicionales</div></div>
        <div className="tbl">
          <div className="trow thead" style={{ gridTemplateColumns: "1fr 110px" }}>
            <div>Concepto</div><div className="right">Monto</div>
          </div>
          {g.map((row, i) => (
            <div className="trow" style={{ gridTemplateColumns: "1fr 110px" }} key={i}>
              <div>{row.concepto}</div><div className="right num">{money(row.monto)}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="page-footer">Fuente: Excel maestro TOLS 3.0 · MOD 2 · Liga Torrente</footer>
    </div>
  );
}
