import { useEffect, useRef, useState } from "react";
import CampoPassword from "./CampoPassword.jsx";
import SelectorManoFavorita from "./SelectorManoFavorita.jsx";

const API_JUG = "/api/jugadores";
const API_COBRANZA = "/api/cobranza";
const API_RESET_CODIGO = "/api/reset-codigo";
const API_RESET_CONFIRMAR = "/api/reset-confirmar";
const DURACION_S = 300; // 5 minutos — mismo código de un solo uso que ya usa "Olvidé mi contraseña" en Login

// 36ª entrega: Federico pidió que el Teléfono se vea en pantalla como "## #### ####". El dato en sí se
// sigue guardando como 10 dígitos sin espacios (mismo formato que ya valida Registro.jsx con
// `/^\d{10}$/`) — el formato con espacios es solo para mostrarlo/tipearlo más cómodo, nunca lo que se
// manda al servidor.
function formatTelefono(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 10);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10)].filter(Boolean).join(" ");
}

// campos que el propio jugador puede editar desde acá. Deliberadamente NO incluye id, nombre,
// correo, tipoUsuario, fechaRegistro ni estatus — esos son de solo administración y ni siquiera se
// muestran en esta pantalla.
export default function MiPerfil({ session }) {
  const correo = (session?.usuario || "").trim().toLowerCase();
  const [jugador, setJugador] = useState(null);
  const [financiero, setFinanciero] = useState(null); // { cuenta, banco, tipoCuenta }
  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null); // última versión guardada — para detectar cambios sin guardar
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [manoModalAbierto, setManoModalAbierto] = useState(false);

  // Cambiar contraseña: reutiliza el mismo flujo de código por correo + nueva contraseña que ya existe
  // en Login ("¿Olvidaste tu contraseña?") — mismos endpoints (/api/reset-codigo, /api/reset-confirmar),
  // que actualizan la cuenta en Usuarios (tols-perfiles) y de ahí sincronizan a la misma hoja "Jugadores"
  // del Excel que ya manda sobre el resto de esta pantalla, así que no hace falta ningún dato nuevo.
  const [cambioVista, setCambioVista] = useState("cerrado"); // "cerrado" | "codigo"
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [errorCambio, setErrorCambio] = useState("");
  const [cambioOk, setCambioOk] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [nuevaPassword2, setNuevaPassword2] = useState("");
  const [confirmandoPass, setConfirmandoPass] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(DURACION_S);
  const refs = useRef([]);

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (cambioVista !== "codigo") return;
    if (segundosRestantes <= 0) return;
    const t = setTimeout(() => setSegundosRestantes((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cambioVista, segundosRestantes]);

  const expiradoCambio = cambioVista === "codigo" && segundosRestantes <= 0;

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
        const cargado = {
          aliasJugador: mio.aliasJugador || "",
          aliasPokerStars: mio.aliasPokerStars || "",
          telefono: mio.telefono || "",
          fecNac: mio.fecNac || "",
          manoFavorita: mio.manoFavorita || "",
          cuenta: fin.cuenta || "",
          banco: fin.banco || "",
          tipoCuenta: fin.tipoCuenta || "",
        };
        setForm(cargado);
        setOriginal(cargado);
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
          manoFavorita: form.manoFavorita,
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
      setOriginal(form);
      setGuardadoOk(true);
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const dirty = Boolean(form && original && JSON.stringify(original) !== JSON.stringify(form));

  function elegirManoFavorita(codigo) {
    setForm({ ...form, manoFavorita: codigo });
    setManoModalAbierto(false);
  }

  async function enviarCodigoCambio() {
    setErrorCambio("");
    setCambioOk(false);
    setEnviandoCodigo(true);
    try {
      const r = await fetch(API_RESET_CODIGO, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo enviar el código.");
      setOtp(["", "", "", "", "", ""]);
      setNuevaPassword("");
      setNuevaPassword2("");
      setSegundosRestantes(DURACION_S);
      setCambioVista("codigo");
      setTimeout(() => refs.current[0]?.focus(), 50);
    } catch (e) {
      setErrorCambio(e.message || "No se pudo enviar el código.");
    } finally {
      setEnviandoCodigo(false);
    }
  }

  function handleOtpChange(i, valor) {
    const v = valor.replace(/\D/g, "").slice(0, 1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < 5) refs.current[i + 1]?.focus();
  }

  function handleOtpKeyDown(i, e) {
    if (e.key === "Backspace" && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function cancelarCambioPassword() {
    setCambioVista("cerrado");
    setErrorCambio("");
  }

  async function confirmarCambioPassword() {
    setErrorCambio("");
    const codigo = otp.join("");
    if (codigo.length !== 6) {
      setErrorCambio("Ingresa los 6 dígitos del código.");
      return;
    }
    if (nuevaPassword.length < 6) {
      setErrorCambio("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (nuevaPassword !== nuevaPassword2) {
      setErrorCambio("Las contraseñas no coinciden.");
      return;
    }
    setConfirmandoPass(true);
    try {
      const r = await fetch(API_RESET_CONFIRMAR, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo, codigo, nuevaPassword }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo actualizar la contraseña.");
      setCambioVista("cerrado");
      setCambioOk(true);
    } catch (e) {
      setErrorCambio(e.message || "No se pudo actualizar la contraseña.");
    } finally {
      setConfirmandoPass(false);
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
              <input
                className="field"
                inputMode="numeric"
                placeholder="## #### ####"
                value={formatTelefono(form.telefono)}
                onChange={(e) => setForm({ ...form, telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
          </div>
          <div className="login-field-row">
            <div className="login-field" style={{ maxWidth: 180 }}>
              <label>Fecha de nacimiento</label>
              <input className="field" type="date" value={form.fecNac} onChange={(e) => setForm({ ...form, fecNac: e.target.value })} />
            </div>
            <div className="login-field" style={{ maxWidth: 200 }}>
              <label>Mano favorita</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="field field-readonly" style={{ maxWidth: 90, textAlign: "center", fontWeight: 600 }}>
                  {form.manoFavorita || "—"}
                </div>
                <button type="button" className="btn btn-secondary btn-filtro" onClick={() => setManoModalAbierto(true)}>
                  Elegir
                </button>
              </div>
            </div>
          </div>

          <div className="subhead">Datos para cobros y depósitos</div>
          <p className="section-sub" style={{ marginTop: 0 }}>
            Sin estos datos no te podremos depositar en caso de que cobres en algún torneo.
          </p>
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

          {dirty && !guardando && <div className="section-note">Tienes cambios sin guardar.</div>}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn btn-primary" disabled={guardando || !dirty} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
          {guardadoOk && !dirty && <div className="check-line check-ok">Tus datos se guardaron correctamente.</div>}

          <div className="subhead">Seguridad</div>
          {cambioVista === "cerrado" && (
            <>
              <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn btn-secondary" disabled={enviandoCodigo} onClick={enviarCodigoCambio}>
                  {enviandoCodigo ? "Enviando código…" : "Cambiar contraseña"}
                </button>
              </div>
              {errorCambio && <div className="login-error">{errorCambio}</div>}
              {cambioOk && <div className="check-line check-ok">Tu contraseña se actualizó correctamente.</div>}
            </>
          )}

          {cambioVista === "codigo" && (
            <div className="note-box" style={{ maxWidth: 360 }}>
              <p className="section-sub" style={{ marginTop: 0 }}>
                Enviamos un código de 6 dígitos a <b>{correo}</b>. Tienes 5 minutos para usarlo.
              </p>
              <p className="section-note" style={{ marginTop: -8, marginBottom: 12 }}>
                Si no lo ves en unos minutos, revisa tu carpeta de SPAM o correo no deseado.
              </p>
              <div className="otp-row">
                {otp.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => (refs.current[i] = el)}
                    className="otp-box"
                    inputMode="numeric"
                    maxLength={1}
                    value={v}
                    disabled={expiradoCambio}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  />
                ))}
              </div>
              <div className="otp-timer">
                {expiradoCambio ? (
                  <span className="login-error">El código expiró.</span>
                ) : (
                  <span>Expira en {Math.floor(segundosRestantes / 60)}:{String(segundosRestantes % 60).padStart(2, "0")}</span>
                )}
              </div>

              {!expiradoCambio && (
                <>
                  <CampoPassword label="Nueva contraseña" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} />
                  <CampoPassword label="Confirmar nueva contraseña" value={nuevaPassword2} onChange={(e) => setNuevaPassword2(e.target.value)} />
                </>
              )}

              {errorCambio && <div className="login-error">{errorCambio}</div>}

              {!expiradoCambio ? (
                <button className="btn btn-primary" disabled={confirmandoPass} onClick={confirmarCambioPassword}>
                  {confirmandoPass ? "Guardando…" : "Confirmar"}
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={enviarCodigoCambio} disabled={enviandoCodigo}>
                    {enviandoCodigo ? "Reenviando…" : "Regenerar código"}
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={cancelarCambioPassword}>
                    Cancelar
                  </button>
                </div>
              )}
              {!expiradoCambio && (
                <div className="login-hint">
                  <button type="button" className="link-btn" onClick={cancelarCambioPassword}>Cancelar</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {manoModalAbierto && (
        <SelectorManoFavorita
          valorActual={form?.manoFavorita}
          onCerrar={() => setManoModalAbierto(false)}
          onSeleccionar={elegirManoFavorita}
        />
      )}
    </div>
  );
}
