import { useState } from "react";

// Selector de mano inicial de Texas Hold'em, adaptado del artefacto "Rango de Manos" que ya se había
// hecho para TOLS — mismo mapa de 13x13 y los mismos "tiers" de color, pero reescrito como componente
// de React (modal) para poder integrarlo dentro de Mi Perfil y guardar el valor elegido en la hoja
// Jugadores, en vez de vivir como una página aparte.
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

// tier por mano exacta — igual a la matriz de referencia del artefacto original
const TIERS = {
  // premium
  AA: "premium", AKs: "premium", AQs: "premium", AJs: "premium", AKo: "premium",
  KK: "premium", AQo: "premium", KQo: "premium", QQ: "premium", JJ: "premium",
  JTs: "premium", TT: "premium", 99: "premium", 88: "premium", 77: "premium",
  // strong
  ATs: "strong", AJo: "strong", 66: "strong", 55: "strong",
  // playable
  A7s: "playable", A6s: "playable", A5s: "playable", KTs: "playable",
  QJs: "playable", QTs: "playable", KJo: "playable", QJo: "playable", A8o: "playable",
  // marginal
  A9s: "marginal", A8s: "marginal", KQs: "marginal", KJs: "marginal",
  A9o: "marginal", 44: "marginal", 33: "marginal", 22: "marginal",
};

function handCode(i, j) {
  if (i === j) return RANKS[i] + RANKS[i];
  if (i < j) return RANKS[i] + RANKS[j] + "s";
  return RANKS[j] + RANKS[i] + "o";
}

const CELDAS = [];
for (let i = 0; i < 13; i++) {
  for (let j = 0; j < 13; j++) {
    CELDAS.push(handCode(i, j));
  }
}

const TIER_LABEL = {
  premium: "Premium",
  strong: "Fuerte",
  playable: "Jugable",
  marginal: "Marginal",
  fold: "Fuera de rango",
};

export default function SelectorManoFavorita({ valorActual, onSeleccionar, onCerrar }) {
  const [sel, setSel] = useState(valorActual || "");

  return (
    <div className="modal-backdrop" onClick={onCerrar}>
      <div className="modal-card modal-card-wide manofav-card" onClick={(e) => e.stopPropagation()}>
        <div className="manofav-scroll">
          <div className="modal-title">Elige tu mano favorita</div>
          <p className="section-sub" style={{ marginTop: 0 }}>
            Toca una casilla de la matriz de manos iniciales de Texas Hold'em (AA, AKs, 76o, etc.).
          </p>

          <div className="manofav-grid" role="grid" aria-label="Matriz de manos iniciales de poker">
            {CELDAS.map((code) => (
              <button
                key={code}
                type="button"
                className={"manofav-cell manofav-tier-" + (TIERS[code] || "fold") + (sel === code ? " manofav-selected" : "")}
                onClick={() => setSel(code)}
              >
                {code}
              </button>
            ))}
          </div>

          <div className="manofav-legend">
            {Object.entries(TIER_LABEL).map(([tier, label]) => (
              <div className="manofav-legend-item" key={tier}>
                <span className={"manofav-swatch manofav-tier-" + tier} />
                {label}
              </div>
            ))}
          </div>

          <div className="manofav-selected-row">
            Mano elegida: <strong>{sel || "ninguna todavía"}</strong>
          </div>
        </div>

        <div className="modal-actions manofav-actions">
          <button className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!sel} onClick={() => onSeleccionar(sel)}>
            Usar esta mano
          </button>
        </div>
      </div>
    </div>
  );
}
