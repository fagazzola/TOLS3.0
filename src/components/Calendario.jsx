import data from "../data/calendario.json";

const diasLargos = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const mesesLargos = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const mesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function parseLocal(iso, hora) {
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = (hora || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}
function fmtLargo(d) {
  return `${diasLargos[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} de ${mesesLargos[d.getMonth()]}`;
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Calendario() {
  const torneos = [...data.torneos].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const now = new Date();
  let nextIdx = torneos.findIndex((t) => parseLocal(t.fecha, t.hora) >= now);
  if (nextIdx === -1) nextIdx = torneos.length;

  const mainCount = torneos.filter((t) => t.main).length;
  const dPago = parseLocal(data.pagoFinal.fecha, "00:00");
  const first = torneos.length ? parseLocal(torneos[0].fecha, torneos[0].hora) : null;
  const last = torneos.length ? parseLocal(torneos[torneos.length - 1].fecha, torneos[torneos.length - 1].hora) : null;

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♣ Torrente On Line Series · Temporada 2026 · MOD 1</div>
          <h1>Calendario TOLS</h1>
          <p className="subtitle">
            Calendario paramétrico: cada fecha tiene su propio día y hora (por default lunes 20:00 hrs, movible por
            feriado).
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Torneos</div>
          <div className="stat-value">{torneos.length} <small>fechas</small></div>
        </div>
        <div className="stat">
          <div className="stat-label">Main Events</div>
          <div className="stat-value">{mainCount} <small>de {torneos.length}</small></div>
        </div>
        <div className="stat">
          <div className="stat-label">Pago final</div>
          <div className="stat-value">
            {mesesCortos[dPago.getMonth()]} {String(dPago.getDate()).padStart(2, "0")} <small>{dPago.getFullYear()}</small>
          </div>
        </div>
      </div>

      <div className="section-head">
        <div className="section-title">Fechas de la temporada</div>
        <div className="section-note">
          {first && last
            ? `${String(first.getDate()).padStart(2, "0")} ${mesesCortos[first.getMonth()]} – ${String(last.getDate()).padStart(2, "0")} ${mesesCortos[last.getMonth()]} ${last.getFullYear()}`
            : "–"}
        </div>
      </div>

      <div className="tbl">
        {torneos.map((t, i) => {
          const d = parseLocal(t.fecha, t.hora);
          const reprogramado = d.getDay() !== data.defaultDow || t.hora !== data.defaultHora;
          let statusLabel = "Programado";
          if (i === nextIdx) statusLabel = "Próximo";
          else if (i < nextIdx) statusLabel = "Jugado";
          return (
            <div className="trow" key={t.n} style={{ gridTemplateColumns: "44px 1fr auto auto" }}>
              <div className="num muted">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <div>{cap(fmtLargo(d))}</div>
                <div className="num section-note">
                  {d.getFullYear()} · {t.hora} hrs{reprogramado ? " · reprogramado" : ""}
                </div>
              </div>
              <div className={"badge " + (t.main ? "badge-main" : "badge-regular")}>
                {t.main ? "Main Event" : "Regular"}
              </div>
              <div className="section-note right">{statusLabel}</div>
            </div>
          );
        })}
      </div>

      <div className="section">
        <div className="tbl">
          <div className="trow" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="subhead" style={{ margin: 0 }}>Hora límite · Mejor Mano</div>
              <div>Se recibe hasta las <b className="num">{data.horaLimiteMejorMano} hrs</b> el día del torneo.</div>
            </div>
            <div>
              <div className="subhead" style={{ margin: 0 }}>Día de pago final</div>
              <div>
                {cap(diasLargos[dPago.getDay()])} <b>{dPago.getDate()} de {mesesLargos[dPago.getMonth()]}, {dPago.getFullYear()}</b> — {data.pagoFinal.nota}.
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="page-footer">Fuente: Excel maestro TOLS 3.0 · MOD 1 · Liga Torrente</footer>
    </div>
  );
}
