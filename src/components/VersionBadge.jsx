import { VERSION } from "../version.js";

// esquina superior izquierda, en toda pantalla del sitio (con o sin sesión) — ver src/version.js
// para el criterio de cuándo se incrementa cada número.
export default function VersionBadge() {
  return (
    <div className="version-badge" title="Versión del sitio">
      v{VERSION}
    </div>
  );
}
