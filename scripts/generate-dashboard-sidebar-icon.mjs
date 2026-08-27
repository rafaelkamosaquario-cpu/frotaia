// Gera o único ícone que não existe no pacote de assets (Dashboard/grade),
// no mesmo estilo "sem card" dos demais: glifo branco com glow verde direto
// sobre fundo transparente, sem quadrado/borda própria ao redor.
import sharp from "sharp";

const OUT_PATH = "public/icons/sidebar/dashboard.png";
const W = 200, H = 200;
const GAP = 22, PAD = 34;
const cell = (W - PAD * 2 - GAP) / 2;
const gx0 = PAD, gy0 = PAD, gx1 = gx0 + cell + GAP, gy1 = gy0 + cell + GAP;

const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="b"/>
    </filter>
  </defs>
  <g fill="none" stroke="#3dfb5c" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)" opacity="0.9">
    <rect x="${gx0}" y="${gy0}" width="${cell}" height="${cell}" rx="10"/>
    <rect x="${gx1}" y="${gy0}" width="${cell}" height="${cell}" rx="10"/>
    <rect x="${gx0}" y="${gy1}" width="${cell}" height="${cell}" rx="10"/>
    <rect x="${gx1}" y="${gy1}" width="${cell}" height="${cell}" rx="10"/>
  </g>
  <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
    <rect x="${gx0}" y="${gy0}" width="${cell}" height="${cell}" rx="10"/>
    <rect x="${gx1}" y="${gy0}" width="${cell}" height="${cell}" rx="10"/>
    <rect x="${gx0}" y="${gy1}" width="${cell}" height="${cell}" rx="10"/>
    <rect x="${gx1}" y="${gy1}" width="${cell}" height="${cell}" rx="10"/>
  </g>
</svg>
`;

sharp(Buffer.from(svg)).resize({ width: 96, height: 96 }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(OUT_PATH).then(() => console.log("ok dashboard.png"));
