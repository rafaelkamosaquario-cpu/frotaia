import { FrotaSidebarContent } from "./FrotaSidebarContent";

export function FrotaSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
      <FrotaSidebarContent />
    </aside>
  );
}
