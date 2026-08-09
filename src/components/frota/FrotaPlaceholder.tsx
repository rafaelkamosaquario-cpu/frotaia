import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface FrotaPlaceholderProps {
  icon: LucideIcon;
  title: string;
}

export function FrotaPlaceholder({ icon, title }: FrotaPlaceholderProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState icon={icon} title={title} description="Essa área ainda está em construção — chega em breve." />
    </div>
  );
}
