const SUITS = {
  spades: { glyph: "♠", color: "var(--ink)" },
  hearts: { glyph: "♥", color: "var(--burgundy)" },
  diamonds: { glyph: "♦", color: "var(--burgundy)" },
  clubs: { glyph: "♣", color: "var(--ink)" },
};

// una carta de póker en SVG: A, K, Q, J, 10 con su palo, esquinas con índice
export function PlayingCard({ rank = "A", suit = "spades", size = 60, style, className }) {
  const s = SUITS[suit];
  return (
    <svg viewBox="0 0 60 84" width={size} height={size * (84 / 60)} style={style} className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="#fffdf8" stroke="#c9bd9e" strokeWidth="1.5" />
      <rect x="4" y="4" width="52" height="76" rx="5" fill="none" stroke="#e7ddc4" strokeWidth="0.75" />
      <text x="7" y="17" fontSize="12" fontFamily="Fraunces, Georgia, serif" fontWeight="700" fill={s.color}>{rank}</text>
      <text x="7.5" y="29" fontSize="11" fill={s.color}>{s.glyph}</text>
      <text x="53" y="76" fontSize="12" fontFamily="Fraunces, Georgia, serif" fontWeight="700" fill={s.color} textAnchor="end" transform="rotate(180 53 76)">{rank}</text>
      <text x="52.5" y="63.5" fontSize="11" fill={s.color} textAnchor="end" transform="rotate(180 52.5 63.5)">{s.glyph}</text>
      <text x="30" y="50" fontSize="26" fill={s.color} opacity="0.9" textAnchor="middle" fontFamily="Georgia, serif">{s.glyph}</text>
    </svg>
  );
}

// una ficha de póker en SVG, con marcas en el borde y anillo punteado, estilo casino
export function Chip({ color = "#a13d3d", size = 70, style, className }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={style} className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="46" y="2.5" width="8" height="15" rx="2.5" fill="#fffdf8" transform={`rotate(${i * 45} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="33" fill="none" stroke="#fffdf8" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.9" />
      <circle cx="50" cy="50" r="23" fill="#fffdf8" opacity="0.14" />
      <circle cx="50" cy="50" r="23" fill="none" stroke="#fffdf8" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

// insignia de moneda/billete verde, usada para marcar el día de pago final en el calendario
export function MoneyBadge({ size = 18, style, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#2f7a4d" stroke="#1f5a37" strokeWidth="1" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#fffdf8" strokeWidth="1" opacity="0.7" />
      <text x="12" y="16.2" fontSize="12" fontWeight="700" fill="#fffdf8" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">$</text>
    </svg>
  );
}
