import { cn } from "@/lib/utils";

/**
 * Identidade textual exclusiva do painel de gestão (substitui a logo circular +
 * "Frota IA Assistente" nos cabeçalhos de src/components/frota/*). Não mexe no
 * componente Logo/LogoMark compartilhado (chat, onboarding, login) — só deixa
 * de ser usado aqui dentro.
 */
export function FrotaBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col leading-none", className)}>
      <span className="text-base font-bold tracking-tight text-foreground">
        FROTA <span className="text-primary">IA</span>
      </span>
      {!compact && (
        <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Painel</span>
      )}
    </div>
  );
}
