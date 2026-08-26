import { useEffect, useRef, useState } from "react";

const API_CODIGO = "/api/jugadores-codigo";
const API_VERIFICAR = "/api/jugadores-verificar";
const EMOTICONES = ["🃏", "♠️", "♣️", "♥️", "♦️", "🎲", "🍺", "🥃", "🍕", "🌮", "🔥", "💰"];
const DURACION_S = 30;

function vacio() {
  return {
    nombre: "",
    aliasJugador: "",
    aliasPokerStars: "",
    telefono: "",
    correo: "",
    password: "",
    password2: "",
    fecNac: "",
    emoticon: EMOTICONES[0],
  };
}

function calcularEdadPreview(fecNac) {
  const nac = new Date(fecNac + "T00:00:00");
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

function validarPaso1(d) {
  if (!d.nombre.trim() || d.nombre.trim().length < 3) return "Escribe tu nombre y apellido.";
  if (!d.aliasJugador.trim()) return "Escribe cómo quieres que te llamen.";
  if (!d.aliasPokerStars.trim()) return "Escribe tu usuario de PokerStars.";
  if (!/^\d{10}$/.test(d.telefono.trim())) return "El teléfono debe tener 10 dígitos.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo.trim())) return "El correo electrónico no es válido.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecNac)) return "Elige tu fecha de nacimiento.";
  if (calcularEdadPreview(d.fecNac) === null || calcularEdadPreview(d.fecNac) < 18) return "Debes ser mayor de edad para registrarte.";
  if (d.password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  if (d.password !== d.password2) return "Las contraseñas no coinciden.";
  return null;
}

export default function Registro({ onRegistroExitoso, onIrALogin }) {
  const [paso, setPaso] = useState("form"); // "form" | "otp" | "listo"
  const [datos, setDatos] = useState(vacio());
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(DURACION_S);
  const refs = useRef([]);

  useEffect(() => {
    if (paso !== "otp") return;
    if (segundosRestantes <= 0) return;
    const t = setTimeout(() => setSegundosRestantes((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [paso, segundosRestantes]);

  const edadPreview = calcularEdadPreview(datos.fecNac);
  const expirado = paso === "otp" && segundosRestantes <= 0;

  async function pedirCodigo() {
    setError("");
    const problema = validarPaso1(datos);
    if (problema) {
      setError(problema);
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(API_CODIGO, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo: datos.correo.trim().toLowerCase(), nombre: datos.nombre.trim() }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo enviar el código.");
      setOtp(["", "", "", "", "", ""]);
      setOtpError("");
      setSegundosRestantes(DURACION_S);
      setPaso("otp");
      setTimeout(() => refs.current[0]?.focus(), 50);
    } catch (e) {
      setError(e.message || "No se pudo enviar el código.");
    } finally {
      setEnviando(false);
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

  async function confirmarCodigo() {
    setOtpError("");
    const codigo = otp.join("");
    if (codigo.length !== 6) {
      setOtpError("Ingresa los 6 dígitos.");
      return;
    }
    setVerificando(true);
    try {
      const r = await fetch(API_VERIFICAR, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...datos,
          correo: datos.correo.trim().toLowerCase(),
          telefono: datos.telefono.trim(),
          codigo,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo verificar el código.");
      setPaso("listo");
      setTimeout(() => onRegistroExitoso?.(json.session), 1200);
    } catch (e) {
      setOtpError(e.message || "No se pudo verificar el código.");
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card modal-card-wide">
        <div className="login-eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
        <div className="login-title">{paso === "form" ? "Alta de jugador" : paso === "otp" ? "Confirma tu correo" : "¡Listo!"}</div>

        {paso === "form" && (
          <>
            <div className="login-field">
              <label>Nombre y apellido</label>
              <input className="field" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
            </div>
            <div className="login-field-row">
              <div className="login-field" style={{ flex: 1 }}>
                <label>Alias jugador</label>
                <input className="field" value={datos.aliasJugador} onChange={(e) => setDatos({ ...datos, aliasJugador: e.target.value })} />
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label>Alias PokerStars</label>
                <input className="field" value={datos.aliasPokerStars} onChange={(e) => setDatos({ ...datos, aliasPokerStars: e.target.value })} />
              </div>
            </div>
            <div className="login-field-row">
              <div className="login-field" style={{ flex: 1 }}>
                <label>Teléfono (10 dígitos)</label>
                <input className="field" value={datos.telefono} maxLength={10}
                  onChange={(e) => setDatos({ ...datos, telefono: e.target.value.replace(/\D/g, "") })} />
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label>Fecha de nacimiento</label>
                <input className="field" type="date" value={datos.fecNac} onChange={(e) => setDatos({ ...datos, fecNac: e.target.value })} />
              </div>
            </div>
            {edadPreview !== null && <div className="section-note" style={{ marginTop: -8 }}>Edad: {edadPreview} años</div>}
            <div className="login-field">
              <label>Correo electrónico</label>
              <input className="field" type="email" value={datos.correo} onChange={(e) => setDatos({ ...datos, correo: e.target.value })} />
            </div>
            <div className="login-field-row">
              <div className="login-field" style={{ flex: 1 }}>
                <label>Contraseña</label>
                <input className="field" type="password" value={datos.password} onChange={(e) => setDatos({ ...datos, password: e.target.value })} />
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label>Confirmar contraseña</label>
                <input className="field" type="password" value={datos.password2} onChange={(e) => setDatos({ ...datos, password2: e.target.value })} />
              </div>
            </div>
            <div className="login-field">
              <label>Emoticón</label>
              <div className="emoji-picker">
                {EMOTICONES.map((em) => (
                  <button
                    type="button"
                    key={em}
                    className={"emoji-opt" + (datos.emoticon === em ? " selected" : "")}
                    onClick={() => setDatos({ ...datos, emoticon: em })}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary login-submit" disabled={enviando} onClick={pedirCodigo}>
              {enviando ? "Enviando código…" : "Continuar"}
            </button>
            {error && <div className="login-error">{error}</div>}
            <div className="login-hint">
              <button type="button" className="link-btn" onClick={onIrALogin}>← Ya tengo cuenta, ir a Entrar</button>
            </div>
          </>
        )}

        {paso === "otp" && (
          <>
            <p className="section-sub" style={{ textAlign: "center" }}>
              Enviamos un código de 6 dígitos a <b>{datos.correo}</b>. Tienes {DURACION_S} segundos para ingresarlo.
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
                  disabled={expirado}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                />
              ))}
            </div>
            <div className="otp-timer">
              {expirado ? <span className="login-error">El código expiró.</span> : <span>Expira en {segundosRestantes}s</span>}
            </div>
            {otpError && <div className="login-error">{otpError}</div>}
            {!expirado ? (
              <button className="btn btn-primary login-submit" disabled={verificando} onClick={confirmarCodigo}>
                {verificando ? "Verificando…" : "Confirmar código"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={pedirCodigo} disabled={enviando}>
                  {enviando ? "Reenviando…" : "Regenerar código"}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPaso("form")}>
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}

        {paso === "listo" && (
          <p className="section-sub" style={{ textAlign: "center" }}>
            ¡Tu cuenta quedó creada! Entrando a TOLS 3.0…
          </p>
        )}
      </div>
    </div>
  );
}
