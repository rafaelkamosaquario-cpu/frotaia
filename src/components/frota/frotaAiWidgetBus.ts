/**
 * Ponte entre a Ajuda contextual (`ContextualHelp.tsx`) e o widget "Pergunte
 * ao Frota IA" (`FrotaAiWidget.tsx`), 08/2026 — `FrotaAiWidget` é montado
 * uma única vez em `FrotaShell.tsx`, sem props (todo estado é interno), e
 * qualquer componente solto na árvore (um popover de ajuda numa página
 * qualquer) precisa conseguir abri-lo com uma pergunta pré-preenchida sem
 * criar um segundo chat nem reestruturar o shell pra passar props. Um
 * CustomEvent no `window` resolve isso sem dependência nova (nem
 * Context/estado global) — mesmo espírito "sem biblioteca extra" do resto
 * do painel.
 */

export const FROTA_AI_WIDGET_ASK_EVENT = "frota-ai-widget:ask";

export interface FrotaAiWidgetAskDetail {
  pergunta: string;
}

export function askFrotaAiWidget(pergunta: string): void {
  window.dispatchEvent(new CustomEvent<FrotaAiWidgetAskDetail>(FROTA_AI_WIDGET_ASK_EVENT, { detail: { pergunta } }));
}
