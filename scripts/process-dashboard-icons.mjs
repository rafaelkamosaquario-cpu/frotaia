// Gera os ícones dos cards do Dashboard (public/icons/dashboard/*.png) a
// partir dos assets da pasta A3 (cards coloridos "com card" — fundo escuro +
// borda neon, cada um já na cor semântica certa: verde/azul/âmbar/vermelho).
// Diferente do pacote da sidebar, estes vêm em PNG SEM canal alfa (fundo
// preto sólido, sem ruído/textura) — então em vez do threshold por canal
// verde usado antes (só funcionava pra borda verde), aqui o critério é
// luminância total (R+G+B) próxima de zero, que funciona pra qualquer matiz
// de borda. Sobrescreve os arquivos gerados por hue-shift da rodada
// anterior (mesmos nomes — DashboardClient.tsx não precisa mudar).
import sharp from "sharp";
import path from "path";
import fs from "fs";

const SRC_DIR = "C:/Users/Windows11/Desktop/prints-zapi/FROTAIALOGOS/A3";
const OUT_DIR = "public/icons/dashboard";

const MAP = [
  ["veiculos-primary.png", "ChatGPT Image 27 de ago. de 2026, 15_48_46 (1).png"],
  ["motoristas-accent.png", "ChatGPT Image 27 de ago. de 2026, 15_48_46 (2).png"],
  ["manutencao-warning.png", "ChatGPT Image 27 de ago. de 2026, 15_48_47 (3).png"],
  ["documentos-danger.png", "ChatGPT Image 27 de ago. de 2026, 15_48_48 (4).png"],
  ["agenda-warning.png", "ChatGPT Image 27 de ago. de 2026, 15_48_49 (5).png"],
  ["despesas-success.png", "ChatGPT Image 27 de ago. de 2026, 15_48_49 (6).png"],
  ["checklists-success.png", "ChatGPT Image 27 de ago. de 2026, 15_48_50 (7).png"],
  ["alertas-danger.png", "ChatGPT Image 27 de ago. de 2026, 15_48_51 (8).png"],
];

const LUMA_BG_MAX = 12; // fundo puro é (0,0,0); menor valor de interior observado somou 27 — folga confortável

async function floodRemoveBackground(srcPath) {
  const { data, info } = await sharp(srcPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qHead = 0, qTail = 0;

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * ch;
    const luma = data[p] + data[p + 1] + data[p + 2];
    if (luma <= LUMA_BG_MAX) {
      visited[idx] = 1;
      queue[qTail++] = idx;
    }
  }

  for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
  for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % w, y = (idx / w) | 0;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }

  const maskRaw = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) maskRaw[i] = visited[i] ? 0 : 255;

  const blurredMask = await sharp(maskRaw, { raw: { width: w, height: h, channels: 1 } })
    .blur(2.2)
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (blurredMask[y * w + x] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);

  const outRGBA = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    outRGBA[i * 4] = data[i * ch];
    outRGBA[i * 4 + 1] = data[i * ch + 1];
    outRGBA[i * 4 + 2] = data[i * ch + 2];
    outRGBA[i * 4 + 3] = blurredMask[i];
  }

  // 200px basta com folga (~4x) pra exibição a ~44-52px nos cards do Dashboard.
  return sharp(outRGBA, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ width: 200, height: 200, fit: "inside" })
    .png({ compressionLevel: 9, palette: true, quality: 90 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [outName, srcName] of MAP) {
    const pipeline = await floodRemoveBackground(path.join(SRC_DIR, srcName));
    await pipeline.toFile(path.join(OUT_DIR, outName));
    console.log("ok", outName);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
