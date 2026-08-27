import { FrotaSidebarContent } from "./FrotaSidebarContent";

export function FrotaSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
      <FrotaSidebarContent />
    </aside>
  );
}
