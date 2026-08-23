import type { CSSProperties } from "react";
import { CircleGauge, Truck, WalletCards, Bell, MapPin, CircleDollarSign, Zap, Fuel, Wrench, FileText, List, type LucideIcon } from "lucide-react";
import { FROTA_SUGGESTIONS } from "@/lib/frotaSuggestions";
import styles from "./SuggestionCards.module.css";

const ICONS: Record<string, LucideIcon> = {
  Truck,
  Zap,
  Fuel,
  WalletCards,
  Wrench,
  FileText,
  MapPin,
  Bell,
  CircleGauge,
  List,
};

/**
 * Só "Analisar um frete" pede ícone combinado no spec ("Truck acompanhado
 * de CircleDollarSign") — os outros 10 usam um ícone só. Mantido aqui (não
 * no tipo FrotaSuggestion) porque é detalhe de apresentação, não dado de
 * negócio compartilhado com o WhatsApp.
 */
const ICONE_SECUNDARIO: Record<string, LucideIcon> = {
  analisar_frete: CircleDollarSign,
};

interface SuggestionCardsProps {
  onSelect: (prompt: string) => void;
}

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className={styles.suggestionsGrid}>
      {FROTA_SUGGESTIONS.map((suggestion, index) => {
        const Icon = ICONS[suggestion.icon] ?? Truck;
        const IconeSecundario = ICONE_SECUNDARIO[suggestion.id];

        return (
          <button
            key={suggestion.id}
            type="button"
            className={styles.suggestionCard}
            style={{ "--suggestion-index": index } as CSSProperties}
            onClick={() => onSelect(suggestion.description)}
            aria-label={`${suggestion.title}: ${suggestion.description}`}
          >
            <span className={styles.suggestionCardIcon}>
              <Icon size={23} strokeWidth={1.75} aria-hidden />
              {IconeSecundario ? (
                <span className={styles.suggestionCardIconBadge}>
                  <IconeSecundario size={11} strokeWidth={2} aria-hidden />
                </span>
              ) : null}
            </span>
            <span className={styles.suggestionCardBody}>
              <span className={styles.suggestionCardTitle}>{suggestion.title}</span>
              <span className={styles.suggestionCardDescription}>{suggestion.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
