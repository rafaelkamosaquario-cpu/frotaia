// Gera os ícones "sem card" de public/icons/sidebar/ (glifo neon puro, sem
// quadrado/borda própria ao redor) a partir dos assets já transparentes da
// pasta de origem — aqui só recorta pro bounding box do conteúdo real e
// reduz o tamanho (os originais vêm em ~1254px, bem mais que o necessário
// pra exibição a ~28-32px). Fonte atual: pasta A2 (ilustrações neon
// multicoloridas mais elaboradas, já vêm 100% transparentes — confirmado
// por alpha=0 nos 4 cantos, sem precisar de flood-fill de remoção de fundo).
// Pra trocar de novo no futuro: atualizar SRC_DIR/MAP e rodar
// `node scripts/process-sidebar-icons.mjs`. Dashboard não tem asset próprio
// neste pacote (nem nos anteriores) — mantido manualmente, não gerado aqui.
import sharp from "sharp";
import path from "path";
import fs from "fs";

const SRC_DIR = "C:/Users/Windows11/Desktop/prints-zapi/FROTAIALOGOS/cards/A2";
const OUT_DIR = "public/icons/sidebar";

const MAP = [
  ["veiculos.png", "ChatGPT Image 27 de ago. de 2026, 12_59_27 (1).png"],
  ["motoristas.png", "ChatGPT Image 27 de ago. de 2026, 12_59_27 (2).png"],
  ["fretes.png", "ChatGPT Image 27 de ago. de 2026, 12_59_28 (3).png"],
  ["oportunidades.png", "ChatGPT Image 27 de ago. de 2026, 12_59_28 (4).png"],
  ["manutencao.png", "ChatGPT Image 27 de ago. de 2026, 12_59_28 (5).png"],
  ["documentos.png", "ChatGPT Image 27 de ago. de 2026, 12_59_29 (6).png"],
  ["despesas.png", "ChatGPT Image 27 de ago. de 2026, 12_59_29 (7).png"],
  ["agenda.png", "ChatGPT Image 27 de ago. de 2026, 12_59_30 (8).png"],
  ["alertas.png", "ChatGPT Image 27 de ago. de 2026, 12_59_30 (9).png"],
  ["relatorios.png", "ChatGPT Image 27 de ago. de 2026, 12_59_30 (10).png"],
  ["documentos-gerados.png", "ChatGPT Image 27 de ago. de 2026, 12_59_30 (11).png"],
  ["noticias.png", "ChatGPT Image 27 de ago. de 2026, 12_59_31 (12).png"],
  ["empresa.png", "ChatGPT Image 27 de ago. de 2026, 12_59_31 (13).png"],
  ["configuracoes.png", "ChatGPT Image 27 de ago. de 2026, 12_59_31 (14).png"],
  ["jornadas.png", "ChatGPT Image 27 de ago. de 2026, 12_59_31 (15).png"],
  ["rotas.png", "ChatGPT Image 27 de ago. de 2026, 12_59_32 (16).png"],
  ["checklists.png", "ChatGPT Image 27 de ago. de 2026, 12_59_32 (17).png"],
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

  // 128px basta com folga (~4x) pra exibição a ~28-32px na sidebar.
  return sharp(srcPath)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ width: 128, height: 128, fit: "inside" })
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
