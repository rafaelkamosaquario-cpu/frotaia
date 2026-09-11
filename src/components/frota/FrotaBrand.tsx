import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/icons/Logo";

/**
 * Marca do painel, compartilhando a imagem oficial com login e aplicativo.
 */
export function FrotaBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 leading-none", className)}>
      <LogoMark className="size-11" />
      <div className="flex flex-col">
      <span className="text-base font-bold tracking-tight text-foreground">
        Frota <span className="text-primary">IA</span>
      </span>
      {!compact && (
        <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Painel</span>
      )}
      </div>
    </div>
  );
}

