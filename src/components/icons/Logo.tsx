import { useId } from "react";
import { cn } from "@/lib/utils";

// Placeholder da marca — substituir por logo, favicon e ícone oficiais
// quando a identidade visual definitiva do Frota IA estiver definida.
export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M8 20.5 13.5 11l3.2 5.6L19.5 12 24 20.5"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="9.5" r="1.9" fill="white" />
    </svg>
  );
}

export function Logo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={iconClassName} />
      <span className="text-base font-semibold tracking-tight text-foreground">
        Frota IA <span className="font-normal text-muted-foreground">Assistente</span>
      </span>
    </div>
  );
}
