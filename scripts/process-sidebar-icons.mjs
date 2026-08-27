// Gera os ícones "sem card" de public/icons/sidebar/ (glifo neon puro, sem
// quadrado/borda própria ao redor) a partir dos assets já transparentes da
// pasta de origem — aqui só recorta pro bounding box do conteúdo real e
// reduz o tamanho (os originais vêm em ~1254px, bem mais que o necessário
// pra exibição a ~32-38px). Substituiu a versão anterior do script, que
// fazia flood-fill de remoção de fundo pro modelo "com card" (revisão
// anterior da sidebar) — histórico só em git log, não em código morto aqui.
import sharp from "sharp";
import path from "path";
import fs from "fs";

const SRC_DIR = "C:/Users/Windows11/Desktop/prints-zapi/FROTAIALOGOS/cards/CARDS APP";
const OUT_DIR = "public/icons/sidebar";

const MAP = [
  ["veiculos.png", "ChatGPT Image 26 de ago. de 2026, 23_47_52 (1).png"],
  ["motoristas.png", "ChatGPT Image 26 de ago. de 2026, 23_47_52 (2).png"],
  ["fretes.png", "ChatGPT Image 26 de ago. de 2026, 23_47_53 (3).png"],
  ["oportunidades.png", "ChatGPT Image 26 de ago. de 2026, 23_47_53 (4).png"],
  ["manutencao.png", "ChatGPT Image 26 de ago. de 2026, 23_47_54 (5).png"],
  ["documentos.png", "ChatGPT Image 26 de ago. de 2026, 23_47_54 (6).png"],
  ["despesas.png", "ChatGPT Image 26 de ago. de 2026, 23_47_55 (7).png"],
  ["agenda.png", "ChatGPT Image 26 de ago. de 2026, 23_47_55 (8).png"],
  ["alertas.png", "ChatGPT Image 26 de ago. de 2026, 23_47_56 (9).png"],
  ["relatorios.png", "ChatGPT Image 26 de ago. de 2026, 23_47_56 (10).png"],
  ["documentos-gerados.png", "ChatGPT Image 26 de ago. de 2026, 23_52_00 (1).png"],
  ["noticias.png", "ChatGPT Image 26 de ago. de 2026, 23_52_00 (2).png"],
  ["empresa.png", "ChatGPT Image 26 de ago. de 2026, 23_52_00 (3).png"],
  ["configuracoes.png", "ChatGPT Image 26 de ago. de 2026, 23_52_00 (4).png"],
  ["jornadas.png", "ChatGPT Image 26 de ago. de 2026, 23_52_00 (5).png"],
  ["rotas.png", "ChatGPT Image 26 de ago. de 2026, 23_52_01 (6).png"],
  ["checklists.png", "ChatGPT Image 26 de ago. de 2026, 23_52_01 (7).png"],
];

async function cropAndShrink(srcPath) {
  const { data, info } = await sharp(srcPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);

  // 96px basta com folga (~3x) pra exibição a ~32px na sidebar.
  return sharp(srcPath)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ width: 96, height: 96, fit: "inside" })
    .png({ compressionLevel: 9, palette: true, quality: 90 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [outName, srcName] of MAP) {
    const pipeline = await cropAndShrink(path.join(SRC_DIR, srcName));
    await pipeline.toFile(path.join(OUT_DIR, outName));
    console.log("ok", outName);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
