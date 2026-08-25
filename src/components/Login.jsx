import { useState } from "react";

export default function Login({ perfiles, onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const match = (perfiles?.usuarios || []).find(
      (u) => u.usuario.toLowerCase() === usuario.trim().toLowerCase() && u.password === password
    );
    if (match) {
      setError("");
      onLogin({ usuario: match.usuario, nombre: match.nombre, rol: match.rol });
    } else {
      setError("Usuario o contraseña incorrectos.");
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-eyebrow">♣ Torrente On Line Series - TOLS 3.0</div>
        <div className="login-title">TOLS 3.0</div>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Usuario</label>
            <input
              type="text"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label>Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary login-submit">
            Entrar
          </button>
          {error && <div className="login-error">{error}</div>}
        </form>
        <div className="login-hint">
          Acceso restringido a TOLS 3.0. Si no tienes usuario, pídelo al administrador.
        </div>
      </div>
    </div>
  );
}
