import Image from "next/image";
import { cn } from "@/lib/utils";

/** Marca oficial fornecida por Rafael em setembro de 2026, sem recorte. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/frota-ia-brand-202609.png"
      alt="Frota IA"
      width={64}
      height={64}
      className={cn("size-10 shrink-0 object-contain", className)}
      priority
    />
  );
}

export function Logo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={iconClassName} />
      <span className="text-base font-semibold tracking-tight text-foreground">
        Frota <span className="text-primary">IA</span>
      </span>
    </div>
  );
}

