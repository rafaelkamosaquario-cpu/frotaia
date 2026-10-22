import { nfcAccess } from "@/services/supabase/nfcAccess";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const metadata = {title: "Identificação NFC | Frota IA", robots: {index: false, follow: false}, referrer: "no-referrer" as const};
export default async function NfcLanding({params}: {params: Promise<{token: string}>}) {
  const {token} = await params;
  const a = await nfcAccess();
  let identification: string | null = null;
  if (a && /^[a-f0-9]{48}$/.test(token)) {
    const {data} = await createAdminClient().from("fleet_nfc_tags").select("label,kind,vehicle_id")
      .eq("token", token).eq("company_id", a.company.id).neq("status", "revoked").maybeSingle();
    if (data) {
      if (data.vehicle_id) {
        const v = await createAdminClient().from("vehicles").select("plate").eq("id", data.vehicle_id).eq("company_id", a.company.id).eq("active", true).maybeSingle();
        if (v.data) identification = `Veículo ${v.data.plate ?? data.label}`;
      } else identification = `Bomba: ${data.label}`;
    }
  }
  return <main className="mx-auto max-w-lg space-y-4 p-6">
    <h1 className="text-xl font-semibold">Frota IA · NFC</h1>
    <p>{identification ? `${a!.company.name} — ${identification}` : "Identificação disponível somente ao ADM autorizado, na empresa correta, com cartão vigente."}</p>
    <p>Preparação e teste de identificação. A operação do motorista ainda não foi liberada.</p>
    <p>Nenhuma saída, quilometragem, checklist ou abastecimento foi registrado ao abrir este link.</p>
    <a className="underline" href="/frota/veiculos">Voltar ao cadastro de veículos</a>
  </main>;
}
