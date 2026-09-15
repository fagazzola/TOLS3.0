import { useEffect, useState } from "react";

const API_JUG = "/api/jugadores";
const API_COBRANZA = "/api/cobranza";

// campos que el propio jugador puede editar desde acá. Deliberadamente NO incluye id, nombre,
// correo, tipoUsuario, fechaRegistro ni estatus — esos son de solo administración y ni siquiera se
// muestran en esta pantalla.
export default function MiPerfil({ session }) {
  const correo = (session?.usuario || "").trim().toLowerCase();
  const [jugador, setJugador] = useState(null);
  const [financiero, setFinanciero] = useState(null); // { cuenta, banco, tipoCuenta }
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  function cargar() {
    setLoading(true);
    setError("");
    Promise.all([
      fetch(API_JUG).then((r) => r.json()),
      fetch(API_COBRANZA).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([jug, cob]) => {
        const mio = (jug?.jugadores || []).find((j) => j.correo === correo);
        if (!mio) {
          setError("No se encontró tu registro de jugador. Si acabas de registrarte, vuelve a intentar en unos minutos.");
          return;
        }
        setJugador(mio);
        const fin = cob?.jugadores?.[correo] || {};
        setFinanciero(fin);
        setForm({
          aliasJugador: mio.aliasJugador || "",
          aliasPokerStars: mio.aliasPokerStars || "",
          telefono: mio.telefono || "",
          fecNac: mio.fecNac || "",
          cuenta: fin.cuenta || "",
          banco: fin.banco || "",
          tipoCuenta: fin.tipoCuenta || "",
        });
      })
      .catch((e) => setError(e.message || "No se pudo cargar tu perfil."))
      .finally(() => setLoading(false));
  }

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError("");
    setGuardadoOk(false);
    try {
      const r1 = await fetch(API_JUG, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accion: "autoeditar",
          correo,
          aliasJugador: form.aliasJugador,
          aliasPokerStars: form.aliasPokerStars,
          telefono: form.telefono,
          fecNac: form.fecNac,
        }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "No se pudieron guardar tus datos.");

      const r2 = await fetch(API_COBRANZA, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accion: "guardarJugador",
          correo,
          nombre: jugador.nombre,
          cuenta: form.cuenta,
          banco: form.banco,
          tipoCuenta: form.tipoCuenta,
        }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || "No se pudieron guardar tus datos bancarios.");

      setJugador(j1.jugadores.find((j) => j.correo === correo));
      setFinanciero(j2.jugadores?.[correo] || {});
      setGuardadoOk(true);
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
        <h1>Mi Perfil</h1>
        <p className="subtitle">Cargando…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="headtop">
        <div>
          <div className="eyebrow">♦ Torrente On Line Series - TOLS 3.0</div>
          <h1>Mi Perfil</h1>
          <p className="subtitle">Actualiza tus datos de contacto y de cobro. Tu nombre, correo y estatus los administra la liga.</p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {form && (
        <div className="section">
          <div className="subhead">Datos de jugador</div>
          <div className="login-field-row">
            <div className="login-field" style={{ maxWidth: 200 }}>
              <label>Alias (nombre de jugador)</label>
              <input className="field" value={form.aliasJugador} onChange={(e) => setForm({ ...form, aliasJugador: e.target.value })} />
            </div>
            <div className="login-field" style={{ maxWidth: 200 }}>
              <label>Alias en PokerStars</label>
              <input className="field" value={form.aliasPokerStars} onChange={(e) => setForm({ ...form, aliasPokerStars: e.target.value })} />
            </div>
            <div className="login-field" style={{ maxWidth: 180 }}>
              <label>Teléfono</label>
              <input className="field" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
          </div>
          <div className="login-field-row">
            <div className="login-field" style={{ maxWidth: 180 }}>
              <label>Fecha de nacimiento</label>
              <input className="field" type="date" value={form.fecNac} onChange={(e) => setForm({ ...form, fecNac: e.target.value })} />
            </div>
          </div>

          <div className="subhead">Datos para cobros y depósitos</div>
          <div className="login-field-row">
            <div className="login-field" style={{ maxWidth: 200 }}>
              <label>Cuenta</label>
              <input className="field" value={form.cuenta} onChange={(e) => setForm({ ...form, cuenta: e.target.value })} />
            </div>
            <div className="login-field" style={{ maxWidth: 200 }}>
              <label>Banco</label>
              <input className="field" value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </div>
            <div className="login-field" style={{ maxWidth: 200 }}>
              <label>Tipo de cuenta</label>
              <input className="field" value={form.tipoCuenta} onChange={(e) => setForm({ ...form, tipoCuenta: e.target.value })} placeholder="CLABE / Tarjeta de débito" />
            </div>
          </div>

          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn btn-primary" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
          {guardadoOk && <div className="check-line check-ok">Tus datos se guardaron correctamente.</div>}
        </div>
      )}
    </div>
  );
}
