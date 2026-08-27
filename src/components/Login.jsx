import { useEffect, useRef, useState } from "react";
import CampoPassword from "./CampoPassword.jsx";

const API_RESET_CODIGO = "/api/reset-codigo";
const API_RESET_CONFIRMAR = "/api/reset-confirmar";
const DURACION_S = 300; // 5 minutos

export default function Login({ perfiles, onLogin }) {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // vista: "login" | "recuperar-correo" | "recuperar-codigo"
  const [vista, setVista] = useState("login");
  const [correoRecuperar, setCorreoRecuperar] = useState("");
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [errorRecuperar, setErrorRecuperar] = useState("");

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [nuevaPassword2, setNuevaPassword2] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState("");
  const [segundosRestantes, setSegundosRestantes] = useState(DURACION_S);
  const refs = useRef([]);

  useEffect(() => {
    if (vista !== "recuperar-codigo") return;
    if (segundosRestantes <= 0) return;
    const t = setTimeout(() => setSegundosRestantes((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [vista, segundosRestantes]);

  const expirado = vista === "recuperar-codigo" && segundosRestantes <= 0;

  function handleSubmit(e) {
    e.preventDefault();
    const escrito = correo.trim().toLowerCase();
    // el correo es el usuario de acceso; se compara contra ambos campos por compatibilidad con
    // cuentas viejas que todavía tengan un "usuario" distinto del correo guardado
    const match = (perfiles?.usuarios || []).find(
      (u) =>
        ((u.correo && u.correo.trim().toLowerCase() === escrito) || u.usuario.trim().toLowerCase() === escrito) &&
        u.password === password
    );
    if (match) {
      setError("");
      onLogin({ usuario: match.usuario, nombre: match.nombre, rol: match.rol });
    } else {
      setError("Correo o contraseña incorrectos.");
    }
  }

  function volverALogin() {
    setVista("login");
    setErrorRecuperar("");
    setErrorConfirmar("");
    setCorreoRecuperar("");
    setOtp(["", "", "", "", "", ""]);
    setNuevaPassword("");
    setNuevaPassword2("");
  }

  async function pedirCodigoRecuperar() {
    setErrorRecuperar("");
    if (!correoRecuperar.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoRecuperar.trim())) {
      setErrorRecuperar("Escribe un correo electrónico válido.");
      return;
    }
    setEnviandoCodigo(true);
    try {
      const r = await fetch(API_RESET_CODIGO, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo: correoRecuperar.trim().toLowerCase() }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo enviar el código.");
      setOtp(["", "", "", "", "", ""]);
      setNuevaPassword("");
      setNuevaPassword2("");
      setErrorConfirmar("");
      setSegundosRestantes(DURACION_S);
      setVista("recuperar-codigo");
      setTimeout(() => refs.current[0]?.focus(), 50);
    } catch (e) {
      setErrorRecuperar(e.message || "No se pudo enviar el código.");
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

  async function confirmarNuevaPassword() {
    setErrorConfirmar("");
    const codigo = otp.join("");
    if (codigo.length !== 6) {
      setErrorConfirmar("Ingresa los 6 dígitos del código.");
      return;
    }
    if (nuevaPassword.length < 6) {
      setErrorConfirmar("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (nuevaPassword !== nuevaPassword2) {
      setErrorConfirmar("Las contraseñas no coinciden.");
      return;
    }
    setConfirmando(true);
    try {
      const r = await fetch(API_RESET_CONFIRMAR, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo: correoRecuperar.trim().toLowerCase(), codigo, nuevaPassword }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "No se pudo actualizar la contraseña.");
      onLogin(json.session);
    } catch (e) {
      setErrorConfirmar(e.message || "No se pudo actualizar la contraseña.");
    } finally {
      setConfirmando(false);
    }
  }

  const irARegistro = () => {
    window.history.pushState({}, "", "/registro");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
        <div className="login-title">
          {vista === "login" ? "TOLS 3.0" : vista === "recuperar-correo" ? "Recuperar contraseña" : "Nueva contraseña"}
        </div>

        {vista === "login" && (
          <>
            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  autoComplete="username"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  required
                />
              </div>
              <CampoPassword
                label="Contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" className="btn btn-primary login-submit">
                Entrar
              </button>
              {error && <div className="login-error">{error}</div>}
            </form>
            <div className="login-hint">
              <button type="button" className="link-btn" onClick={() => setVista("recuperar-correo")}>
                ¿Olvidaste tu contraseña?
              </button>
              <br />
              ¿Nuevo jugador?{" "}
              <button type="button" className="link-btn" onClick={irARegistro}>
                Regístrate aquí
              </button>
            </div>
          </>
        )}

        {vista === "recuperar-correo" && (
          <>
            <p className="section-sub" style={{ textAlign: "center" }}>
              Escribe el correo con el que te registraste. Te vamos a mandar un código para definir una
              contraseña nueva.
            </p>
            <div className="login-field">
              <label>Correo electrónico</label>
              <input
                type="email"
                className="field"
                value={correoRecuperar}
                onChange={(e) => setCorreoRecuperar(e.target.value)}
              />
            </div>
            <button className="btn btn-primary login-submit" disabled={enviandoCodigo} onClick={pedirCodigoRecuperar}>
              {enviandoCodigo ? "Enviando código…" : "Enviar código"}
            </button>
            {errorRecuperar && <div className="login-error">{errorRecuperar}</div>}
            <div className="login-hint">
              <button type="button" className="link-btn" onClick={volverALogin}>← Volver a Entrar</button>
            </div>
          </>
        )}

        {vista === "recuperar-codigo" && (
          <>
            <p className="section-sub" style={{ textAlign: "center" }}>
              Enviamos un código de 6 dígitos a <b>{correoRecuperar}</b>. Tienes 5 minutos para usarlo.
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
              {expirado ? <span className="login-error">El código expiró.</span> : <span>Expira en {Math.floor(segundosRestantes / 60)}:{String(segundosRestantes % 60).padStart(2, "0")}</span>}
            </div>

            {!expirado && (
              <>
                <CampoPassword label="Nueva contraseña" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} />
                <CampoPassword label="Confirmar nueva contraseña" value={nuevaPassword2} onChange={(e) => setNuevaPassword2(e.target.value)} />
              </>
            )}

            {errorConfirmar && <div className="login-error">{errorConfirmar}</div>}

            {!expirado ? (
              <button className="btn btn-primary login-submit" disabled={confirmando} onClick={confirmarNuevaPassword}>
                {confirmando ? "Guardando…" : "Confirmar y entrar"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={pedirCodigoRecuperar} disabled={enviandoCodigo}>
                  {enviandoCodigo ? "Reenviando…" : "Regenerar código"}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={volverALogin}>
                  Cancelar
                </button>
              </div>
            )}
            {!expirado && (
              <div className="login-hint">
                <button type="button" className="link-btn" onClick={volverALogin}>Cancelar</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
