import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/icons/Logo";

/**
 * Marca do painel, compartilhando a imagem oficial com login e aplicativo.
 */
export function FrotaBrand({ compact = false, className, master = false }: { compact?: boolean; className?: string; master?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 leading-none", className)}>
      <span className={cn("flex size-11 shrink-0 items-center justify-center", !master && "rounded-xl bg-[#0b1628] ring-1 ring-[#243d60] dark:bg-transparent dark:ring-transparent")}>
        {master ? <img src="/brand/rodocore/r-transparent-v1.png" alt="RodoCore" className="size-11 object-contain"/> : <LogoMark className="size-11" />}
      </span>
      <div className="flex flex-col">
      <span className="text-base font-bold tracking-tight text-foreground">
        {master ? <>Rodo<span className="text-primary">Core</span></> : <>Frota <span className="text-primary">IA</span></>}
      </span>
      {!compact && (
        <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{master ? "Sistemas · painel mestre" : "Painel"}</span>
      )}
      </div>
    </div>
  );
}

