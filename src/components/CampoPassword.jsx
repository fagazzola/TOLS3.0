import { useState } from "react";

// campo de contraseña reutilizable con el ojo de mostrar/ocultar — mismo patrón que ya
// existía en Perfiles.jsx (.pass-field + .btn-icon-eye), ahora compartido entre Login,
// Registro y el flujo de recuperar contraseña.
export default function CampoPassword({ label, value, onChange, autoComplete }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="login-field">
      {label && <label>{label}</label>}
      <div className="pass-field">
        <input
          className="field"
          type={mostrar ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          className="btn-icon-eye"
          title={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
          onClick={() => setMostrar((m) => !m)}
        >
          {mostrar ? "🙈" : "👁"}
        </button>
      </div>
    </div>
  );
}
