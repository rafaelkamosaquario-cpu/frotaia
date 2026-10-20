import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MonthlyProduction } from "@/lib/frota/productionGoals";

export interface FinancialLine {
  id: string; date: string; vehicleId: string | null; amount: number;
  category: string; description: string; person?: string;
  status: "unknown" | "pending" | "settled"; settledOn: string | null;
  payroll?: { month: string; dueDate: string; advances: number };
}
export interface FinancialReportInput {
  company: string; from: string; to: string; generatedAt: Date;
  vehicles: { id: string; plate: string | null; name: string | null }[];
  revenues: FinancialLine[]; expenses: FinancialLine[];
  scope: string;
  production?: MonthlyProduction[];
}
export function reportMonth(from: string, to: string): string | null {
  const month = from.slice(0,7);
  const last = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0)).toISOString().slice(0,10);
  return from === `${month}-01` && to === last ? month : null;
}
export function productionAnalysis(input: FinancialReportInput) {
  const month = reportMonth(input.from,input.to);
  if (!month) return [];
  const today = input.generatedAt.toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  return (input.production ?? []).filter(r=>r.month===month).map(r=>{
    const percent = r.target_tonnes && r.actual_tonnes !== null ? r.actual_tonnes/r.target_tonnes*100 : null;
    const closed = input.to < today && r.measured_through === input.to;
    const label = !r.target_tonnes ? "Sem meta" : r.actual_tonnes === null ? "Sem produção informada" :
      percent! >= 100 ? "Meta atingida" : closed ? "Meta não atingida" : "Apuração parcial";
    return {...r,percent,label,missing:percent===null?null:Math.max(0,r.target_tonnes!-r.actual_tonnes!)};
  });
}
const cents = (n: number) => {
  if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n * 100))) throw new Error("Valor financeiro inválido.");
  return Math.round(n * 100);
};
export function financialSummary(input: FinancialReportInput) {
  const sum = (rows: FinancialLine[]) => rows.reduce((s, r) => s + cents(r.amount), 0) / 100;
  const statuses = (rows: FinancialLine[]) => ({
    settled: sum(rows.filter(r => r.status === "settled")),
    pending: sum(rows.filter(r => r.status === "pending")),
    unknown: sum(rows.filter(r => r.status === "unknown")),
  });
  // Every expense is counted exactly once, including linked payroll expenses.
  const vehicles = [...new Set([...input.revenues, ...input.expenses].map(r => r.vehicleId))].map(id => {
    const revenues = input.revenues.filter(r => r.vehicleId === id);
    const expenses = input.expenses.filter(r => r.vehicleId === id);
    const revenue = sum(revenues), expense = sum(expenses);
    return { id, revenue, expense, received: statuses(revenues).settled,
      fuel: sum(expenses.filter(r => r.category === "Combustível")),
      tires: sum(expenses.filter(r => r.category === "Pneu")),
      payroll: sum(expenses.filter(r => r.payroll)),
      maintenance: sum(expenses.filter(r => r.category === "Manutenção")),
      recorded: {
        fuel: expenses.some(r=>r.category==="Combustível"),
        tires: expenses.some(r=>r.category==="Pneu"),
        payroll: expenses.some(r=>Boolean(r.payroll)),
        maintenance: expenses.some(r=>r.category==="Manutenção"),
      },
      balance: (cents(revenue) - cents(expense)) / 100 };
  });
  const revenue = sum(input.revenues), expense = sum(input.expenses);
  return { revenue, expense, balance: (cents(revenue) - cents(expense)) / 100,
    revenues: statuses(input.revenues), expenses: statuses(input.expenses), vehicles,
    categories: [...new Set(input.expenses.map(r => r.category))].map(category => ({category, total: sum(input.expenses.filter(r => r.category === category))})),
  };
}

export async function generateFinancialReport(input: FinancialReportInput): Promise<Uint8Array> {
  const summary = financialSummary(input);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(.035,.11,.20), blue = rgb(0,.43,.68), gray = rgb(.34,.39,.45);
  const money = (n: number) => n.toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
  const date = (s: string | null) => s ? s.split("-").reverse().join("/") : "Não informada";
  const clean = (s: string) => s.replace(/[–—−]/g,"-").replace(/[\r\n\t]/g," ").replace(/[^\x20-\x7e\xa0-\xff]/g,"");
  const vehicle = (id: string | null) => {
    const v = input.vehicles.find(v => v.id === id);
    return v ? `${v.plate || "Sem placa"} | ${v.name || "Veículo"}` : id ? "Veículo sem cadastro disponível" : "Sem veículo vinculado";
  };
  const status = (r: FinancialLine, revenue=false) => r.status === "settled" ? `${revenue?"Recebida":"Paga"}\n${date(r.settledOn)}` : r.status === "pending" ? revenue?"A receber":"A pagar" : "Não informado";
  let page = pdf.addPage([841.89,595.28]), y = 0;
  function wrap(text: string, width: number, size: number, strong=false): string[] {
    const font = strong ? bold : regular;
    const lines: string[] = [];
    for (const part of text.split("\n")) {
      let line="";
      for (const word of clean(part).split(/\s+/)) {
        if (font.widthOfTextAtSize(line ? `${line} ${word}` : word,size) <= width) { line = line ? `${line} ${word}` : word; continue; }
        if(line) lines.push(line); line="";
        for(const char of word) { if(font.widthOfTextAtSize(line+char,size)>width) {lines.push(line);line="";} line+=char; }
      }
      lines.push(line);
    }
    return lines;
  }
  function header() {
    page.drawRectangle({x:0,y:535,width:842,height:61,color:navy});
    page.drawText("FROTA IA | PAINEL WEB",{x:32,y:570,font:bold,size:10,color:rgb(1,1,1)});
    page.drawText("RELATÓRIO FINANCEIRO",{x:32,y:549,font:bold,size:17,color:rgb(1,1,1)});
    y=514;
    for(const line of wrap(input.company,770,12,true)) {page.drawText(line,{x:32,y,font:bold,size:12,color:navy});y-=16;}
    page.drawText(`Competência: ${date(input.from)} a ${date(input.to)} | ${clean(input.scope)}`,{x:32,y,font:regular,size:9,color:gray}); y-=24;
  }
  function next() {page=pdf.addPage([841.89,595.28]);header();}
  header();
  function text(value: string, size=10, strong=false) {
    for(const line of wrap(value,774,size,strong)) {
      if(y < 56) next();
      page.drawText(line,{x:34,y,font:strong?bold:regular,size,color:strong?navy:gray});y-=size+5;
    }
  }
  function section(title: string) { if(y<110)next(); y-=8;text(title,13,true);y-=4; }
  function table(heads: string[], widths: number[], rows: string[][], compact=false) {
    const row = (cells: string[], isHeader: boolean) => {
      const lines=cells.map((s,i)=>wrap(s,widths[i]-12,8.5,isHeader));
      // Split oversized descriptions across pages instead of clipping a tall row.
      if(!isHeader && Math.max(...lines.map(l=>l.length))>22) {
        const count=Math.max(...lines.map(l=>l.length));
        for(let start=0;start<count;start+=22) {
          row(lines.map(l=>l.slice(start,start+22).join("\n")),false);
        }
        return;
      }
      const height=Math.max(...lines.map(l=>l.length))*11+(compact?6:12);
      if(y-height<48) {next(); if(!isHeader) row(heads,true);}
      let x=32;
      for(let i=0;i<cells.length;i++) {
        page.drawRectangle({x,y:y-height,width:widths[i],height,color:isHeader?blue:rgb(.95,.97,.985),borderColor:rgb(.82,.87,.91),borderWidth:.4});
        const cellColor=compact && !isHeader && i>=6 ? (cells[6].includes("-")?rgb(.70,.12,.18):rgb(.08,.44,.28)):navy;
        lines[i].forEach((line,j)=>page.drawText(line,{x:x+6,y:y-(compact?12:14)-j*11,font:isHeader?bold:regular,size:8.5,color:isHeader?rgb(1,1,1):cellColor})); x+=widths[i];
      }
      y-=height;
    };
    row(heads,true);
    if(!rows.length) row(heads.map((_,i)=>i===0?"Nenhum lançamento neste recorte.":""),false);
    else rows.forEach(cells=>row(cells,false));
    y-=12;
  }
  section("1. Resumo financeiro por competência");
  table(["Indicador","Valor","Indicador","Valor"],[250,137,250,137],[
    ["Faturamento / receitas registradas",money(summary.revenue),"Despesas registradas",money(summary.expense)],
    ["Receitas recebidas",money(summary.revenues.settled),"Despesas pagas",money(summary.expenses.settled)],
    ["A receber",money(summary.revenues.pending),"A pagar",money(summary.expenses.pending)],
    ["Recebimento não informado",money(summary.revenues.unknown),"Pagamento não informado",money(summary.expenses.unknown)],
    ["Saldo dos registros",money(summary.balance),"Receitas menos despesas","Não é lucro líquido"],
  ]);
  text("O período seleciona a competência dos lançamentos, não a data da baixa. Pagamentos feitos depois do mês continuam vinculados à despesa original. Este documento não é extrato bancário, nota fiscal ou comprovante de transferência.",9);
  text("Valores recebidos/pagos refletem confirmações registradas no sistema. Lançamentos sem confirmação ficam separados. Custos não cadastrados não estão incluídos. A folha é um detalhamento das despesas, sem soma em duplicidade.",9);
  section("2. Composição das despesas");
  table(["Categoria","Total"],[574,200],summary.categories.map(r=>[r.category,money(r.total)]));
  next(); section("3. Faturamento e resultado de cada veículo");
  table(["Veículo / placa","Faturamento","Recebido","Diesel","Pneus","Folha","Custo total","Saldo"],[186,84,84,84,84,84,84,84],summary.vehicles.map(r=>[vehicle(r.id),money(r.revenue),money(r.received),money(r.fuel),money(r.tires),money(r.payroll),money(r.expense),money(r.balance)]));
  text("Custo total inclui todas as categorias registradas. Veículos sem lançamentos no recorte não são apresentados como produção ou custo zero. Não há rateio presumido de despesas sem veículo.",9);
  section("4. Folha e remunerações vinculadas às despesas");
  const payroll=input.expenses.filter(r=>r.payroll);
  table(["Funcionário / atividade","Veículo","Referência / vencimento","Remuneração","Adiantamentos*","Situação / baixa"],[190,166,110,100,100,108],payroll.map(r=>[`${r.person||"Não informado"}\n${r.description}`,vehicle(r.vehicleId),`${r.payroll!.month}\n${date(r.payroll!.dueDate)}`,money(r.amount),money(r.payroll!.advances),status(r)]));
  text("*Adiantamentos são parte da remuneração, não custo adicional. A situação acima é a quitação integral registrada. Demonstrativo gerencial: não substitui holerite, cálculo de encargos ou recibo assinado.",9);
  next(); section("5. Receitas e recebimentos - lançamentos detalhados");
  for (const r of input.revenues) {
    if(y<180)next();
    table(["Competência / veículo","Descrição / responsável","Valor","Situação / recebimento"],[190,354,110,120],[[`${date(r.date)}\n${vehicle(r.vehicleId)}`,`${r.description || "Sem descrição"}${r.person?`\nResponsável: ${r.person}`:""}`,money(r.amount),status(r,true)]]);
  }
  if(!input.revenues.length)text("Nenhuma receita neste recorte.");
  next(); section("6. Despesas e pagamentos - lançamentos detalhados");
  for(const r of input.expenses) {
    if(y<180)next();
    table(["Competência / veículo","Categoria e descrição","Valor","Situação / pagamento"],[190,354,110,120],[[`${date(r.date)}\n${vehicle(r.vehicleId)}`,`${r.category}\n${r.description || "Sem descrição"}`,money(r.amount),status(r)]]);
  }
  if(!input.expenses.length)text("Nenhuma despesa neste recorte.");
  next(); section("7. Metas e leitura do resultado");
  const goals=productionAnalysis(input);
  if(!reportMonth(input.from,input.to)) {
    text("Metas mensais: selecione um mês completo para comparar produção e meta. Não rateamos metas nem misturamos produção mensal com um recorte parcial.",9);
  } else if(!goals.length) {
    text("Não há metas ou produção mensal cadastradas para este recorte. Ausência de dados não significa produção zero.",9);
  } else {
    text("Cadastro mensal: realizado / meta (t), percentual e quanto falta. Vermelho: mês encerrado abaixo da meta; verde: atingida; cinza: parcial ou sem dados.",8);
    for(const r of goals) {
      if(y<95)next();
      const label=vehicle(r.vehicle_id);
      const name=wrap(label,165,8.5)[0];
      const color=r.label==="Meta atingida"?rgb(.08,.44,.28):r.label==="Meta não atingida"?rgb(.70,.12,.18):gray;
      page.drawText(name,{x:34,y,font:bold,size:8.5,color:navy});
      const number=(n:number|null)=>n===null?"Sem dados":n.toLocaleString("pt-BR",{maximumFractionDigits:3});
      page.drawText(`${number(r.actual_tonnes)} / ${number(r.target_tonnes)} t`,{x:205,y,font:regular,size:8.5,color:navy});
      page.drawRectangle({x:355,y:y-1,width:100,height:8,color:rgb(.86,.90,.94)});
      if(r.percent!==null)page.drawRectangle({x:355,y:y-1,width:100*Math.min(r.percent,100)/100,height:8,color});
      page.drawText(r.percent===null?"-":`${r.percent.toFixed(2).replace(".",",")}%`,{x:465,y,font:bold,size:8.5,color});
      page.drawText(`Faltam ${number(r.missing)} t`,{x:525,y,font:regular,size:8,color:gray});
      page.drawText(r.label,{x:665,y,font:bold,size:8,color});y-=19;
    }
  }
  text("Sem meta não significa abaixo da meta. Mês em andamento ou apuração incompleta aparece como parcial.",8);
  section("Participação dos custos no faturamento de cada veículo");
  const pct=(n:number,revenue:number)=>revenue>0?`${(n/revenue*100).toFixed(2).replace(".",",")}%`:"Sem receita";
  table(["Veículo","Receita","Diesel","Folha","Pneus","Manutenção","Saldo","Saldo / receita"],[186,84,76,76,76,84,108,84],summary.vehicles.map(r=>[
    input.vehicles.find(v=>v.id===r.id)?.plate || "Sem veículo",money(r.revenue),r.recorded.fuel?pct(r.fuel,r.revenue):"S/L",
    r.recorded.payroll?pct(r.payroll,r.revenue):"S/L",r.recorded.tires?pct(r.tires,r.revenue):"S/L",
    r.recorded.maintenance?pct(r.maintenance,r.revenue):"S/L",
    money(r.balance),pct(r.balance,r.revenue),
  ]),true);
  text("S/L = sem lançamento, não comprova ausência de custo. Percentuais sobre faturamento por competência. Saldo vermelho: negativo; verde: não negativo. Inclui todas as despesas.",8);
  text(`Empresa: despesas ${pct(summary.expense,summary.revenue)} do faturamento. Saldo ${money(summary.balance)} (${pct(summary.balance,summary.revenue)}). ${summary.vehicles.filter(r=>r.balance<0).length} de ${summary.vehicles.length} grupos de lançamentos apresentam saldo negativo.`,9,true);
  text("Meta não atingida não significa saldo negativo. Avalie dias trabalhados, chuva, paradas e carga disponível. Pneus impactam o mês da compra, não o desgaste mensal. Sem metas presumidas de combustível. Saldo não é lucro líquido.",8);
  const pages=pdf.getPages();
  const issued=input.generatedAt.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});
  pages.forEach((p,i)=>{
    p.drawText(`Frota IA | Emitido em ${issued} (Brasília) | Uso gerencial`,{x:32,y:22,size:8,font:regular,color:gray});
    p.drawText(`${i+1} / ${pages.length}`,{x:765,y:22,size:8,font:regular,color:gray});
  });
  pdf.setTitle(`Relatório financeiro - ${input.company} - ${input.from} a ${input.to}`);
  pdf.setAuthor("Frota IA");
  return pdf.save();
}
