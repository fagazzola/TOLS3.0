import { Chip, PlayingCard } from "./PokerArt.jsx";

// clusters de fichas y cartas fijos en pantalla, detrás de todo (login y .wrap),
// para dar ambiente de mesa real de póker sin depender de imágenes externas
export default function Decor() {
  return (
    <div className="decor" aria-hidden="true">
      <div className="decor-cluster decor-tl">
        <Chip color="#1f6b46" size={78} style={{ position: "absolute", top: 0, left: 18, transform: "rotate(-12deg)" }} />
        <Chip color="#a13d3d" size={78} style={{ position: "absolute", top: 34, left: -12, transform: "rotate(8deg)" }} />
        <Chip color="#e8c250" size={60} style={{ position: "absolute", top: 74, left: 40, transform: "rotate(-4deg)" }} />
      </div>
      <div className="decor-cluster decor-br">
        <PlayingCard rank="A" suit="spades" size={64} style={{ position: "absolute", bottom: 40, right: 10, transform: "rotate(10deg)" }} />
        <PlayingCard rank="K" suit="hearts" size={64} style={{ position: "absolute", bottom: 10, right: 46, transform: "rotate(-6deg)" }} />
        <PlayingCard rank="Q" suit="diamonds" size={64} style={{ position: "absolute", bottom: -6, right: 96, transform: "rotate(14deg)" }} />
        <Chip color="#1f6b46" size={56} style={{ position: "absolute", bottom: 70, right: 100, transform: "rotate(6deg)" }} />
      </div>
    </div>
  );
}
