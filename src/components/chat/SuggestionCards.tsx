import { BarChart3, CircleDot, Fuel, Package, Truck, Wallet, type LucideIcon } from "lucide-react";
import { CardButton } from "@/components/ui/Card";
import { SUGGESTION_PROMPTS } from "@/lib/constants";
import type { SuggestionIconName } from "@/types";

const ICONS: Record<SuggestionIconName, LucideIcon> = {
  truck: Truck,
  package: Package,
  fuel: Fuel,
  circleDot: CircleDot,
  barChart3: BarChart3,
  wallet: Wallet,
};

interface SuggestionCardsProps {
  onSelect: (prompt: string) => void;
}

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
      {SUGGESTION_PROMPTS.map((suggestion) => {
        const Icon = ICONS[suggestion.icon];
        return (
          <CardButton key={suggestion.id} onClick={() => onSelect(suggestion.prompt)}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{suggestion.label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {suggestion.description}
              </span>
            </span>
          </CardButton>
        );
      })}
    </div>
  );
}
