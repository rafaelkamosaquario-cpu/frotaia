import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { isGoogleMapsConfigured } from "@/lib/google/mapsConfig";
import { geocodificarEndereco, calcularRota } from "@/lib/google/mapsClient";

/**
 * Calcula distância/duração pro formulário de Rotas no painel — reaproveita
 * as MESMAS funções de baixo nível que a ferramenta de IA `consultar_rota`
 * usa (geocodificarEndereco/calcularRota de mapsClient.ts), nunca uma
 * segunda integração com o Google Maps. Nunca calcula "de cabeça": se a
 * API não estiver configurada ou o endereço não for encontrado, devolve
 * erro claro em vez de inventar um número.
 */

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  if (!isGoogleMapsConfigured()) {
    return NextResponse.json({ error: "Cálculo automático de distância não está configurado (GOOGLE_MAPS_API_KEY ausente)." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const origem = typeof body?.origem === "string" ? body.origem.trim() : "";
  const destino = typeof body?.destino === "string" ? body.destino.trim() : "";
  if (!origem || !destino) {
    return NextResponse.json({ error: "Informe origem e destino." }, { status: 400 });
  }

  try {
    const [coordOrigem, coordDestino] = await Promise.all([geocodificarEndereco(origem), geocodificarEndereco(destino)]);
    if (!coordOrigem || !coordDestino) {
      return NextResponse.json({ error: "Não foi possível localizar um dos endereços informados." }, { status: 422 });
    }

    const rota = await calcularRota(
      { latitude: coordOrigem.latitude, longitude: coordOrigem.longitude },
      { latitude: coordDestino.latitude, longitude: coordDestino.longitude }
    );

    return NextResponse.json({
      distanciaKm: Math.round((rota.distanciaMetros / 1000) * 10) / 10,
      duracaoMinutos: Math.round(rota.duracaoSegundos / 60),
      origemFormatada: coordOrigem.enderecoFormatado,
      destinoFormatada: coordDestino.enderecoFormatado,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao consultar o Google Maps. Tente novamente." }, { status: 502 });
  }
}
