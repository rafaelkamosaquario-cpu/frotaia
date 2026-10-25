export function operationPeriod(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0,4)) < 2000 || Number(value.slice(0,4)) > 2100) throw new Error("Período inválido.");
  const [year, month] = value.split("-").map(Number);
  return { from: `${value}-01`, to: `${value}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
}
export function currentOperationMonth() {
  const parts = new Intl.DateTimeFormat("en", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  return `${parts.find(p=>p.type==="year")!.value}-${parts.find(p=>p.type==="month")!.value}`;
}
type FinancialEntry = { amount: number; settlement_status?: string };
export function financialSummary(expenses: FinancialEntry[], revenues: FinancialEntry[]) {
  const sum = (rows: FinancialEntry[]) => rows.reduce((total,row)=>total+Math.round(Number(row.amount)*100),0)/100;
  return { expenses:sum(expenses), revenues:sum(revenues), balance:Math.round((sum(revenues)-sum(expenses))*100)/100,
    paid:sum(expenses.filter(r=>r.settlement_status==="settled")), received:sum(revenues.filter(r=>r.settlement_status==="settled")),
    pendingExpenses:sum(expenses.filter(r=>r.settlement_status==="pending")), pendingRevenues:sum(revenues.filter(r=>r.settlement_status==="pending")),
    unknownExpenses:sum(expenses.filter(r=>!r.settlement_status||r.settlement_status==="unknown")), unknownRevenues:sum(revenues.filter(r=>!r.settlement_status||r.settlement_status==="unknown")) };
}
export type OperationData = {
  company:string; month:string; updatedAt:string; enabled:string[];
  vehicle:{name:string|null;plate:string|null}|null;
  summary:ReturnType<typeof financialSummary>|null;
  expenses:{id:string;date:string;amount:number;label:string;status:string}[];
  revenues:{id:string;date:string;amount:number;label:string;status:string}[];
  expenseCount:number;revenueCount:number;
  fuel:{id:string;date:string;liters:number;amount:number;km:number|null}[];
  analyses:{id:string;date:string;title:string;summary:string|null}[];
  alerts:{id:string;date:string;title:string}[];
  documents:{id:string;date:string;title:string;available:boolean}[];
  maintenance:{id:string;date:string;title:string;status:string;nextKm:number|null}[];
  tires:{id:string;title:string;position:string|null;status:string}[];
};
