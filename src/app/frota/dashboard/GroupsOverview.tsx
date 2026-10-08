"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { groupPurpose, type OperationalGroup } from "@/lib/frota/operationalGroups";

export function GroupsOverview({ groups, error, allowed }: { groups: OperationalGroup[]; error: boolean; allowed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = groups.filter(group => !group.archived);
  return <Card className="dashboard-insight space-y-3" aria-labelledby="groups-overview-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="groups-overview-title" className="flex items-center gap-2 text-base font-semibold"><MessageSquare className="size-5 text-primary" aria-hidden />Grupos do WhatsApp</h2>
      {allowed && <Link href="/frota/grupos" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Gerenciar grupos</Link>}
    </div>
    <p className="text-sm text-muted-foreground">Pesagens, abastecimentos e lançamentos da empresa. Radar de Fretes separado.</p>
    {!allowed ? <p className="text-sm">O proprietário ou administrador pode preparar os grupos da empresa.</p> : error ? <p role="alert" className="text-sm text-danger">Não foi possível consultar os grupos. Tente atualizar; isso não significa que não existam cadastros.</p> : active.length ? <ul className="grid gap-2 sm:grid-cols-2">{active.map(group => <li key={group.id} className="min-w-0 rounded-lg border border-border p-3"><p className="break-words text-sm font-semibold">{group.name}</p><p className="mt-1 text-xs text-muted-foreground">{groupPurpose[group.purpose]} · Aguardando vinculação</p></li>)}</ul> : <p className="text-sm">Nenhum grupo em preparação. Cadastre os grupos para iniciar a vinculação.</p>}
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"><strong>Recebimento ainda não ativado.</strong> Após vinculação e teste, os registros e as pendências poderão aparecer aqui. Este módulo não responde nos grupos nem importa mensagens antigas.</div>
    {allowed && <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="min-h-11 text-sm font-medium text-primary disabled:opacity-50">{pending ? "Atualizando…" : "Atualizar grupos"}</button>}
  </Card>;
}
