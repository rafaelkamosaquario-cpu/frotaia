import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { GroupsClient } from "./GroupsClient";

export default async function GroupsPage() {
  const db = await createClient(), access = await loadFleetPanelAccess(db);
  if (!access.ok) return null;
  if (!["owner", "admin"].includes(access.role)) return <p>Somente o proprietário ou administrador pode preparar os grupos da empresa.</p>;
  return <GroupsClient key={access.company.id} companyName={access.company.name} />;
}
