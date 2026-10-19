export type SalaryExpenseLink = { id: string; expense_id: string; paid_on: string | null; month: string };
export function salaryExpenseLabel(expenseId: string, links: SalaryExpenseLink[]) {
  return links.some(link => link.expense_id === expenseId) ? "Salário" : null;
}
