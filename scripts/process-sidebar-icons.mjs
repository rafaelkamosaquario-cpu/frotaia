// Gera os ícones de public/icons/sidebar/ a partir dos cards neon brutos
// (fundo quadrado sólido) — remove só o fundo EXTERNO por flood-fill a partir
// das bordas da imagem, preservando o interior escuro do card (não dá pra
// remover por cor: o interior do card e o fundo externo têm tons quase
// idênticos perto do halo, só a topologia — bloqueada pelo anel verde —
// separa um do outro). Pra trocar um ícone no futuro: gere o novo card no
// mesmo estilo (fundo quadrado escuro sólido + anel neon), acrescente uma
// linha em MAP abaixo e rode `node scripts/process-sidebar-icons.mjs`.
import sharp from "sharp";
import path from "path";
import fs from "fs";

const SRC_DIR = "C:/Users/Windows11/Desktop/prints-zapi/FROTAIALOGOS/cards";
const OUT_DIR = "C:/Users/Windows11/Desktop/Frota-bot/frotaia-app/public/icons/sidebar";

const MAP = [
  ["veiculos.png", "ChatGPT Image 26 de ago. de 2026, 23_01_03 (1).png"],
  ["motoristas.png", "ChatGPT Image 26 de ago. de 2026, 23_01_03 (2).png"],
  ["fretes.png", "ChatGPT Image 26 de ago. de 2026, 23_01_03 (3).png"],
  ["oportunidades.png", "ChatGPT Image 26 de ago. de 2026, 23_01_04 (4).png"],
  ["manutencao.png", "ChatGPT Image 26 de ago. de 2026, 23_01_04 (5).png"],
  ["documentos.png", "ChatGPT Image 26 de ago. de 2026, 23_01_04 (6).png"],
  ["despesas.png", "ChatGPT Image 26 de ago. de 2026, 23_01_05 (7).png"],
  ["jornadas.png", "ChatGPT Image 26 de ago. de 2026, 23_01_05 (8).png"],
  ["rotas.png", "ChatGPT Image 26 de ago. de 2026, 23_01_06 (9).png"],
  ["checklists.png", "ChatGPT Image 26 de ago. de 2026, 23_01_06 (10).png"],
  ["agenda.png", "ChatGPT Image 26 de ago. de 2026, 23_08_20 (1).png"],
  ["alertas.png", "ChatGPT Image 26 de ago. de 2026, 23_08_20 (2).png"],
  ["relatorios.png", "ChatGPT Image 26 de ago. de 2026, 23_08_21 (3).png"],
  ["documentos-gerados.png", "ChatGPT Image 26 de ago. de 2026, 23_08_21 (4).png"],
  ["noticias.png", "ChatGPT Image 26 de ago. de 2026, 23_08_21 (5).png"],
  ["empresa.png", "ChatGPT Image 26 de ago. de 2026, 23_08_21 (6).png"],
  ["configuracoes.png", "ChatGPT Image 26 de ago. de 2026, 23_08_22 (7).png"],
];

const BG_G_THRESHOLD = 65; // amostrado: fundo/interior do card ~15-38, anel neon ~80+

async function floodRemoveBackground(srcPath) {
  const img = sharp(srcPath);
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;

  const visited = new Uint8Array(w * h); // 1 = pertence ao fundo externo (vai ficar transparente)
  const queue = new Int32Array(w * h);
  let qHead = 0, qTail = 0;

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * ch;
    const g = data[p + 1];
    if (g < BG_G_THRESHOLD) {
      visited[idx] = 1;
      queue[qTail++] = idx;
    }
  }

  // Semente: toda a borda da imagem (mais robusto que só os 4 cantos)
  for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
  for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % w, y = (idx / w) | 0;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }

  // Máscara binária (0 = remover / 255 = manter) como imagem 1 canal, depois desfoca pra suavizar a borda
  const maskRaw = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) maskRaw[i] = visited[i] ? 0 : 255;

  const blurredMask = await sharp(maskRaw, { raw: { width: w, height: h, channels: 1 } })
    .blur(2.2)
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  // Bounding box do conteúdo (alpha > 8) pra recortar a margem toda transparente
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = blurredMask[y * w + x];
      if (a > 8) {
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

  // 128px basta com folga (~4x) pra exibição a ~28-30px na sidebar — os cards brutos vêm em
  // ~1250px com textura/ruído de fundo que comprime muito mal (~1.5MB/ícone); reduzido isso
  // cai pra poucos KB por ícone.
  return sharp(outRGBA, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ width: 128, height: 128, fit: "inside" })
    .png({ compressionLevel: 9, palette: true, quality: 90 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [outName, srcName] of MAP) {
    const srcPath = path.join(SRC_DIR, srcName);
    const outPath = path.join(OUT_DIR, outName);
    const pipeline = await floodRemoveBackground(srcPath);
    await pipeline.toFile(outPath);
    console.log("ok", outName);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
