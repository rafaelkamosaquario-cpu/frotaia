"use client";
import { useState } from "react";
import type { OperationalReport } from "@/lib/frota/communication";
import { reportText } from "@/lib/frota/communication";

/** Browser-local export only: no public URL, uploads, external recipient or database writes. */
export function ShareOperationalReport({ report }: { report: OperationalReport }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(reportText(report)); setManual(false); setNotice("Resumo copiado. Confira o destinatário antes de compartilhar."); }
    catch { setManual(true); setNotice("Selecione e copie o resumo abaixo."); }
  }
  async function download() {
    setBusy(true); setNotice("");
    try {
      const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      const width = 1080, padding = 64, lineHeight = 40;
      ctx.font = "28px Arial";
      const wrap = (text: string) => {
        const result: string[] = []; let line = "";
        for (const word of text.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(candidate).width > width - padding * 2) { result.push(line); line = ""; }
          if (ctx.measureText(word).width > width - padding * 2) {
            for (const char of word) {
              if (ctx.measureText(line + char).width > width - padding * 2) { result.push(line); line = ""; }
              line += char;
            }
          } else line = line ? `${line} ${word}` : word;
        }
        if (line) result.push(line); return result;
      };
      const lines = [report.company, report.subject, `Período: ${report.period}`, "", ...report.fields.map(f => `${f.label}: ${f.value}`), "", report.notice].flatMap(text => text ? wrap(text) : [""]);
      canvas.width = width; canvas.height = 210 + lines.length * lineHeight + padding;
      ctx.fillStyle = "#091d35"; ctx.fillRect(0, 0, width, canvas.height);
      const logo = new window.Image(); logo.src = "/frota-ia-brand-202609.png";
      await logo.decode(); ctx.drawImage(logo, padding, 36, 112, 112);
      ctx.fillStyle = "#91efd0"; ctx.font = "bold 42px Arial"; ctx.fillText(report.title, 200, 106);
      ctx.fillStyle = "#327363"; ctx.fillRect(padding, 174, width - padding * 2, 2);
      ctx.font = "28px Arial"; ctx.fillStyle = "#f1f5f9";
      lines.forEach((line, i) => ctx.fillText(line, padding, 224 + i * lineHeight));
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Imagem indisponível")), "image/png"));
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `frota-ia-${report.period.replace(/\D/g, "")}-${report.subject.replace(/[^a-z0-9]/gi, "-").slice(0, 50)}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("Imagem gerada para download. Anexe no WhatsApp; nenhum envio automático foi realizado.");
    } catch { setNotice("Não foi possível gerar a imagem. Você ainda pode copiar o resumo em texto."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-lg border border-border p-3 text-sm"><summary className="min-h-8 cursor-pointer font-medium">Compartilhar resumo</summary><p className="my-2 text-xs text-muted-foreground">Texto ou imagem com os mesmos registros. Você escolhe para quem enviar.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={copy} className="min-h-11 rounded-lg border border-border px-3">Copiar texto para WhatsApp</button><button type="button" disabled={busy} onClick={download} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">{busy ? "Gerando…" : "Baixar imagem do resumo"}</button></div>{manual && <textarea readOnly aria-label="Resumo para copiar" className="mt-3 min-h-60 w-full bg-background p-3" value={reportText(report)} />}{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}</details>;
}

