import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CostEntry } from "@/lib/frota/costs";

export type SalaryReceiptInput = {
  company: { name: string; document_number?: string | null };
  employee: { name: string; phone?: string | null };
  entry: CostEntry;
};

export function receiptAmounts(entry: CostEntry) {
  if (!entry.expense_id || !entry.paid_on || entry.snapshot.category !== "salario") {
    throw new Error("O recibo exige uma despesa de salário confirmada e já paga.");
  }
  const total = Math.round(entry.amount * 100);
  const advances = (entry.snapshot.advances ?? []).reduce((sum, a) => sum + Math.round(a.amount * 100), 0);
  if (!Number.isSafeInteger(total) || total <= 0 || advances < 0 || advances > total) throw new Error("Valores inconsistentes no lançamento.");
  return { total: total / 100, advances: advances / 100, settlement: (total - advances) / 100 };
}

/** A5, um recibo por lançamento; a emissão nunca movimenta dinheiro nem altera despesas. */
export async function generateSalaryReceipt(input: SalaryReceiptInput): Promise<Uint8Array> {
  const { entry, company, employee } = input;
  const amounts = receiptAmounts(entry);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([419.53, 595.28]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.14, 0.24);
  const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = (s: string) => s.split("-").reverse().join("/");
  let y = 560;
  // StandardFonts supports Latin-1. Normalize controls/unsupported symbols before measuring.
  const clean = (s: string) => s.replace(/[\r\n\t]/g, " ").replace(/[^\x20-\x7e\xa0-\xff]/g, "");
  function line(value: string, size = 10, strong = false) {
    const font = strong ? bold : regular;
    const words = clean(value).split(/\s+/);
    let row = "";
    const flush = () => { if (row.trim()) { page.drawText(row.trim(), { x: 32, y, font, size, color: navy }); y -= size + 5; } row = ""; };
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= 355) { row = next; continue; }
      flush();
      for (const char of word) {
        if (font.widthOfTextAtSize(row + char, size) > 355) flush();
        row += char;
      }
    }
    flush();
  }
  line("FROTA IA | PAINEL WEB", 9, true);
  y -= 8; line("RECIBO DE PAGAMENTO", 17, true);
  line("Remuneração - assinatura do recebedor", 10);
  y -= 10;
  line(`Empresa: ${company.name}`, 11, true);
  line(`CNPJ/CPF: ${company.document_number || "Não informado"}`, 9);
  y -= 7;
  line(`Funcionário: ${employee.name || entry.snapshot.person || "Não informado"}`, 11, true);
  line(`Telefone cadastrado: ${employee.phone || "Não informado"}`, 9);
  line(`Referência: ${entry.month.slice(5)}/${entry.month.slice(0, 4)} | Pagamento: ${date(entry.paid_on!)}`, 10, true);
  line(`Descrição: ${entry.snapshot.name}`, 10);
  y -= 9;
  line(`Remuneração registrada: ${money(amounts.total)}`, 11, true);
  line(`Adiantamentos já registrados: ${money(amounts.advances)}`, 10);
  line(`Saldo quitado em ${date(entry.paid_on!)}: ${money(amounts.settlement)}`, 11, true);
  y -= 10;
  line(`Declaro ter recebido da empresa acima o saldo de ${money(amounts.settlement)}, referente exclusivamente ao lançamento e ao mês identificados neste recibo.`, 10);
  y -= 12;
  line("Local e data da assinatura: __________________________", 9);
  y -= 24;
  page.drawLine({ start: { x: 50, y }, end: { x: 369, y }, thickness: 0.7, color: navy });
  y -= 15; line("Assinatura do funcionário / recebedor", 10);
  y -= 9;
  line("Conferir os dados antes de assinar. Emissão sem assinatura eletrônica. Não substitui o demonstrativo detalhado da folha trabalhista.", 8);
  page.drawText(`Registro: ${entry.id}`, { x: 32, y: 24, size: 7, font: regular, color: navy });
  pdf.setTitle(`Recibo de remuneração ${entry.month}`);
  return pdf.save();
}
