// Gera variantes coloridas dos ícones neon pro Dashboard (KPIs + cabeçalho de
// Alertas urgentes/Checklists hoje) a partir dos MESMOS PNGs já usados na
// sidebar (public/icons/sidebar/*.png). Aqui só giramos o matiz do anel/glow
// neon (pixels saturados na faixa do verde) pro tom semântico de cada card,
// mantendo o traço branco do ícone praticamente intacto.
//
// ATENÇÃO (08/2026): a partir da rodada "sidebar sem card", os PNGs de
// public/icons/sidebar/ passaram a ser o modelo SEM card/borda própria
// (glifo neon puro sobre transparente) — diferente do modelo "com card"
// (fundo escuro + borda) usado quando este script foi escrito originalmente.
// Os arquivos já gerados em public/icons/dashboard/ (rodada anterior, ainda
// com card) NÃO foram regenerados nem tocados — o Dashboard usa outra rodada
// própria, não mexer nele sem pedido explícito. Se um dia regenerar os
// ícones do Dashboard de novo, considerar se ainda faz sentido herdar o
// visual "sem card" da sidebar ou se o Dashboard precisa continuar com o
// card (decisão do produto, não técnica).
import sharp from "sharp";
import path from "path";
import fs from "fs";

const SRC_DIR = "public/icons/sidebar";
const OUT_DIR = "public/icons/dashboard";

// [arquivo de origem (sidebar), nome de saída, matiz alvo em graus | null = mantém verde original]
const JOBS = [
  ["veiculos.png", "veiculos-primary.png", null],
  ["motoristas.png", "motoristas-accent.png", 191], // ciano, ~--accent
  ["manutencao.png", "manutencao-warning.png", 42], // âmbar, ~--warning
  ["documentos.png", "documentos-danger.png", 4], // vermelho, ~--danger
  ["agenda.png", "agenda-warning.png", 42], // âmbar, mesma família de "Manutenção"
  ["despesas.png", "despesas-success.png", null], // verde-água ~ mantém verde
  ["alertas.png", "alertas-danger.png", 4], // cabeçalho do card "Alertas urgentes"
  ["checklists.png", "checklists-success.png", null], // cabeçalho do card "Checklists hoje"
];

const GREEN_HUE_MIN = 70, GREEN_HUE_MAX = 165, SAT_MIN = 0.15;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

async function recolor(srcName, targetHue) {
  const { data, info } = await sharp(path.join(SRC_DIR, srcName)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const out = Buffer.from(data);
  if (targetHue !== null) {
    for (let i = 0; i < w * h; i++) {
      const p = i * ch;
      const [hue, sat, light] = rgbToHsl(data[p], data[p + 1], data[p + 2]);
      if (sat >= SAT_MIN && hue >= GREEN_HUE_MIN && hue <= GREEN_HUE_MAX) {
        const [r, g, b] = hslToRgb(targetHue, sat, light);
        out[p] = r; out[p + 1] = g; out[p + 2] = b;
      }
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9, palette: true, quality: 90 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [srcName, outName, hue] of JOBS) {
    const pipeline = await recolor(srcName, hue);
    await pipeline.toFile(path.join(OUT_DIR, outName));
    console.log("ok", outName, hue === null ? "(verde original)" : `(matiz ${hue}°)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
