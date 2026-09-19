import { useEffect, useMemo, useState } from "react";
import { puedeEditar } from "../lib/permisos.js";
import { estadoTorneo, tipoDeFecha, PRACTICA_CAMPEONATO } from "../lib/gamenight.js";

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
        setTorneosCal(cal?.torneos || []);
        setJugadoresSitio((jug?.jugadores || []).filter((j) => j.estatus === "Activo"));
        setTableroMapa(tablero || {});
        setGnMapa(gn || {});

        const activo = camp?.activo || nombres[0] || "";
        setCampeonatoSel((prev) => prev || activo);
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
  const torneoState = gnMapa?.[campeonatoSel]?.[fechaSel] || { horaInicio: "", jugadores: {} };
  const toleranciaMin = tableroMapa?.[campeonatoSel]?.toleranciaCheckinMin ?? 10;
  const recomprasMax = tableroMapa?.[campeonatoSel]?.recomprasMax ?? 0;

  const estado = useMemo(
    () => estadoTorneo({ jugadoresState: torneoState.jugadores, tableroMapa, campeonato: campeonatoSel, tipo }),
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
  const puedoAutoCheckin = !editable && Boolean(miEntrada) && fechaSel === iso(new Date()) && !yaHiceCheckin;

  function hacerMiCheckin() {
    if (!miEntrada) return;
    llamar({ accion: "checkin", correo: miCorreo, nombre: miEntrada.nombre, manual: false });
  }

  const habilitados = jugadoresSitio
    .filter((j) => torneoState.jugadores[j.correo]?.checkin)
    .map((j) => ({ ...j, gn: estado.porJugador[j.correo] }))
    .sort((a, b) => {
      const la = a.gn?.lugar || 999;
      const lb = b.gn?.lugar || 999;
      if (la !== lb) return la - lb;
      return a.nombre.localeCompare(b.nombre);
    });
  const deshabilitados = jugadoresSitio.filter((j) => !torneoState.jugadores[j.correo]?.checkin);
  const enJuego = habilitados.filter((j) => !j.gn?.lugar);

  async function llamar(body) {
    if (!campeonatoSel || !fechaSel) return;
    setGuardando(true);
    setError("");
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campeonato: campeonatoSel, fecha: fechaSel, ...body }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo guardar.");
      setGnMapa(json);
      setAviso(json.avisoAmonestacion || "");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
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
    llamar({ accion: "buyin", correo: j.correo, valor: !j.gn?.buyIn });
  }
  function cambiarRebuy(j, delta) {
    llamar({ accion: "rebuy", correo: j.correo, delta });
  }
  function toggleAddon(j) {
    llamar({ accion: "addon", correo: j.correo, valor: !j.gn?.addon });
  }
  function toggleMejorMano(j) {
    llamar({ accion: "mejorMano", correo: j.correo, valor: !j.gn?.mejorMano });
  }
  function pedirKiller(j) {
    setKillerModal({ correo: j.correo, nombre: j.nombre });
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

  function nombrePorCorreo(correo) {
    return jugadoresSitio.find((j) => j.correo === correo)?.nombre || correo || "";
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

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Game Night</h1>
        </div>
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
          {campeonatos.nombres.map((n) => (
            <option key={n} value={n}>{n}{n === campeonatos.activo ? " (activo)" : ""}</option>
          ))}
          <option value={PRACTICA_CAMPEONATO}>🎯 Partidas de práctica</option>
        </select>
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
          </>
        ) : (
          <span className="section-sub" style={{ margin: 0 }}>Este campeonato todavía no tiene fechas en el Calendario.</span>
        )}
      </div>

      {fechaSel && (
        <>
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
              Torneo programado para las <strong>{torneoCal.hora}</strong> — tolerancia de check-in: {toleranciaMin} min.
            </div>
          ) : (
            <div className="campeonato-banner campeonato-banner-alerta">
              Esta fecha no tiene hora guardada en el Calendario — no se puede calcular la tolerancia de check-in.
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
              <div className="trow thead" style={{ gridTemplateColumns: "1.1fr 1fr 0.6fr 0.8fr 0.6fr 1.3fr 0.8fr 0.7fr 0.7fr 0.6fr" }}>
                <div>Jugador</div><div>Check-in</div><div>Buy-in</div><div>Re-buys</div><div>Add-on</div><div>Killer / Lugar</div><div>Mejor mano</div><div>Debe</div><div>Premio</div><div>Puntos</div>
              </div>
              {habilitados.map((j) => {
                const gn = j.gn || {};
                const eliminado = Boolean(gn.lugar);
                return (
                  <div className={"trow" + (eliminado ? " gn-row-eliminado" : "")} style={{ gridTemplateColumns: "1.1fr 1fr 0.6fr 0.8fr 0.6fr 1.3fr 0.8fr 0.7fr 0.7fr 0.6fr" }} key={j.correo}>
                    <div>
                      {nombreCorto(j)}
                      {gn.esCampeon && <span className="badge badge-campeon" style={{ marginLeft: 6 }}>🏆 Campeón</span>}
                      {gn.esBurbuja && <span className="badge badge-burbuja" style={{ marginLeft: 6 }}>Burbuja</span>}
                      {editable && !eliminado && (
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
                      {gn.amonestado && <span title="Perdió el punto de asistencia"> · ⚠ Amonestado</span>}
                    </div>
                    <div>
                      <button className={"gn-toggle" + (gn.buyIn ? " on" : "")} disabled={!editable || guardando} onClick={() => toggleBuyIn(j)}>
                        {gn.buyIn ? "Sí" : "No"}
                      </button>
                    </div>
                    <div className="gn-stepper">
                      <button disabled={!editable || guardando || (gn.rebuys || 0) <= 0} onClick={() => cambiarRebuy(j, -1)}>−</button>
                      <span className="gn-stepper-val">{gn.rebuys || 0}</span>
                      <button disabled={!editable || guardando || (gn.rebuys || 0) >= recomprasMax} onClick={() => cambiarRebuy(j, 1)}>+</button>
                    </div>
                    <div>
                      <button className={"gn-toggle" + (gn.addon ? " on" : "")} disabled={!editable || guardando} onClick={() => toggleAddon(j)}>
                        {gn.addon ? "Sí" : "No"}
                      </button>
                    </div>
                    <div>
                      {eliminado ? (
                        <>
                          <span className="badge badge-regular">Lugar {gn.lugar}</span>{" "}
                          <span style={{ fontSize: 12 }}>Killer: {gn.eliminadoPor ? nombrePorCorreo(gn.eliminadoPor) : "—"}</span>
                          {editable && (
                            <button className="btn-icon-remove" style={{ marginLeft: 6 }} title="Deshacer eliminación" disabled={guardando} onClick={() => deshacerKiller(j)}>✕</button>
                          )}
                        </>
                      ) : (
                        editable && enJuego.length > 1 ? (
                          <button className="btn btn-secondary btn-filtro" disabled={guardando} onClick={() => pedirKiller(j)}>Marcar salida</button>
                        ) : (
                          <span className="muted">En juego</span>
                        )
                      )}
                    </div>
                    <div>
                      <button className={"gn-toggle" + (gn.mejorMano ? " on" : "")} disabled={!editable || guardando} onClick={() => toggleMejorMano(j)} title="Solo un jugador por torneo">
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
              {editable && seleccionados.size > 0 && (
                <button className="btn btn-primary btn-filtro" disabled={guardando} onClick={pedirActivarSeleccionados}>
                  Activar seleccionados ({seleccionados.size})
                </button>
              )}
            </div>
            <div className="section-sub" style={{ marginTop: 0 }}>
              No pueden ver el estatus de la partida en el sitio hasta que hagan check-in. Si un jugador ya
              está jugando el torneo en PokerStars sin haber hecho su check-in, el Host puede activarlo
              manualmente aquí (uno por uno, o seleccionando varios a la vez) — pasado el tiempo de
              tolerancia ({toleranciaMin} min desde la hora programada), la activación manual genera una
              amonestación (pierde el punto de asistencia).
            </div>
            <div className="tbl">
              <div className="trow thead" style={{ gridTemplateColumns: "40px 1.6fr 1.6fr 160px" }}>
                <div>
                  {editable && deshabilitados.length > 0 && (
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
                    {editable && (
                      <input type="checkbox" checked={seleccionados.has(j.correo)} onChange={() => toggleSeleccionado(j.correo)} />
                    )}
                  </div>
                  <div>{nombreCorto(j)}</div>
                  <div style={{ fontSize: 12 }}>{j.correo}</div>
                  <div>
                    {editable && (
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
                buy-in asignado a cada uno. Si ya pasó el tiempo de tolerancia desde la hora programada
                ({toleranciaMin} min), quedarán <b>amonestados</b> (pierden el punto de asistencia de esta fecha).
              </p>
            ) : (
              <p className="section-sub" style={{ marginTop: 0 }}>
                Vas a activar manualmente a <b>{activarModal.nombre}</b> en el tablero, con buy-in asignado. Si ya
                pasó el tiempo de tolerancia desde la hora programada ({toleranciaMin} min), va a quedar
                <b> amonestado</b> (pierde el punto de asistencia de esta fecha).
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
            <div className="modal-title">Marcar salida: {killerModal.nombre}</div>
            <div className="login-field">
              <label>Eliminado por (opcional)</label>
              <select className="field" value={verdugoSel} onChange={(e) => setVerdugoSel(e.target.value)}>
                <option value="">— sin identificar —</option>
                {enJuego.filter((j) => j.correo !== killerModal.correo).map((j) => (
                  <option key={j.correo} value={j.correo}>{j.nombre}</option>
                ))}
              </select>
            </div>
            <p className="section-sub" style={{ marginTop: 0 }}>
              La posición de salida se calcula sola según cuántos jugadores sigan en juego en este momento.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setKillerModal(null)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" disabled={guardando} onClick={confirmarKiller}>{guardando ? "Un momento…" : "Confirmar salida"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
