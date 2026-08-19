import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRadar, updateRadar, setRadarStatus, listRadarsForCompany, RADAR_DURACAO_PADRAO_DIAS } from "@/services/supabase/freightRadarService";
import { getVehicle } from "@/services/supabase/vehicleService";
import type { FreightRadarRow, FreightRadarStatusEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_radar_frete
 *
 * Busca ativa de carga do cliente ("quero frete de volta pra Curitiba") —
 * Radar de Fretes MVP. Nunca guarda cópia de dado do veículo, só
 * `vehicleId` (consultado na hora do matching/análise, nunca desatualizado).
 * Todo radar tem expiração obrigatória (nunca eterno) — se o cliente não
 * informar prazo, usa o padrão documentado (RADAR_DURACAO_PADRAO_DIAS).
 */

export type ModoGerenciarRadarFrete = "CRIAR" | "LISTAR" | "ATUALIZAR" | "PAUSAR" | "ATIVAR" | "CANCELAR";

export interface GerenciarRadarFreteEntrada {
  modo: ModoGerenciarRadarFrete;
  userId: string;
  companyId: string;
  radarId?: string;

  // CRIAR / ATUALIZAR
  veiculoId?: string;
  origemCidade?: string;
  origemUf?: string;
  destinoCidade?: string;
  destinoUf?: string;
  destinoRegiaoLabel?: string;
  disponivelDe?: string;
  disponivelAte?: string;
  observacoes?: string;
}

export interface RadarResumo {
  id: string;
  veiculoId: string | null;
  origemCidade: string | null;
  origemUf: string | null;
  destinoCidade: string | null;
  destinoUf: string | null;
  destinoRegiaoLabel: string | null;
  disponivelDe: string | null;
  disponivelAte: string | null;
  status: FreightRadarStatusEnum;
  expiraEm: string;
}

export interface GerenciarRadarFreteResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarRadarFrete;
  radar?: RadarResumo;
  radares?: RadarResumo[];
}

function mapaRadar(row: FreightRadarRow): RadarResumo {
  return {
    id: row.id,
    veiculoId: row.vehicle_id,
    origemCidade: row.origin_city,
    origemUf: row.origin_state,
    destinoCidade: row.destination_city,
    destinoUf: row.destination_state,
    destinoRegiaoLabel: row.destination_region_label,
    disponivelDe: row.available_from,
    disponivelAte: row.available_until,
    status: row.status,
    expiraEm: row.expires_at,
  };
}

function respostaFalha(modo: ModoGerenciarRadarFrete, alertas: string[], dadosFaltantes: string[] = []): GerenciarRadarFreteResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação do radar." };
}

async function executar(entrada: GerenciarRadarFreteEntrada): Promise<GerenciarRadarFreteResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (entrada.veiculoId) {
      const veiculo = await getVehicle(admin, entrada.veiculoId);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
      }
    }

    switch (modo) {
      case "CRIAR": {
        if (!entrada.origemCidade && !entrada.origemUf) {
          return respostaFalha(modo, ["Preciso saber pelo menos a origem (cidade e/ou estado) pra criar o radar."], ["origemCidade", "origemUf"]);
        }
        const radar = await createRadar(admin, companyId, userId, {
          vehicleId: entrada.veiculoId,
          originCity: entrada.origemCidade,
          originState: entrada.origemUf,
          destinationCity: entrada.destinoCidade,
          destinationState: entrada.destinoUf,
          destinationRegionLabel: entrada.destinoRegiaoLabel,
          availableFrom: entrada.disponivelDe,
          availableUntil: entrada.disponivelAte,
          notes: entrada.observacoes,
        });
        return {
          sucesso: true,
          modo,
          alertas: entrada.disponivelAte ? [] : [`Sem prazo informado — o radar fica ativo por ${RADAR_DURACAO_PADRAO_DIAS} dias (padrão).`],
          premissas: [],
          dadosFaltantes: [],
          radar: mapaRadar(radar),
          mensagemResumo: "Radar de frete criado — vou avisar quando aparecer uma carga compatível.",
        };
      }

      case "LISTAR": {
        const radares = (await listRadarsForCompany(admin, companyId)).map(mapaRadar);
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          radares,
          mensagemResumo: radares.length === 0 ? "Nenhum radar de frete cadastrado ainda." : `${radares.length} radar(es) de frete.`,
        };
      }

      case "ATUALIZAR": {
        if (!entrada.radarId) return respostaFalha(modo, ["Preciso saber exatamente qual radar atualizar (radarId) — use LISTAR antes se houver dúvida."], ["radarId"]);
        const radar = await updateRadar(admin, entrada.radarId, companyId, userId, {
          vehicleId: entrada.veiculoId,
          originCity: entrada.origemCidade,
          originState: entrada.origemUf,
          destinationCity: entrada.destinoCidade,
          destinationState: entrada.destinoUf,
          destinationRegionLabel: entrada.destinoRegiaoLabel,
          availableFrom: entrada.disponivelDe,
          availableUntil: entrada.disponivelAte,
          notes: entrada.observacoes,
        });
        return { sucesso: true, modo, alertas: [], premissas: [], dadosFaltantes: [], radar: mapaRadar(radar), mensagemResumo: "Radar atualizado." };
      }

      case "PAUSAR":
      case "ATIVAR":
      case "CANCELAR": {
        if (!entrada.radarId) return respostaFalha(modo, ["Preciso saber exatamente qual radar (radarId) — use LISTAR antes se houver dúvida."], ["radarId"]);
        const novoStatus: FreightRadarStatusEnum = modo === "PAUSAR" ? "paused" : modo === "ATIVAR" ? "active" : "cancelled";
        const radar = await setRadarStatus(admin, entrada.radarId, companyId, userId, novoStatus);
        const mensagens: Record<typeof modo, string> = { PAUSAR: "Radar pausado.", ATIVAR: "Radar reativado.", CANCELAR: "Radar cancelado." };
        return { sucesso: true, modo, alertas: [], premissas: [], dadosFaltantes: [], radar: mapaRadar(radar), mensagemResumo: mensagens[modo] };
      }

      default: {
        const modoNuncaVisto: never = modo;
        return respostaFalha(modoNuncaVisto as ModoGerenciarRadarFrete, [`Modo desconhecido: ${String(modoNuncaVisto)}.`]);
      }
    }
  } catch (err) {
    const detalhe = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error(`[gerenciar-radar-frete] Falha no modo ${modo}: ${detalhe}`);
    return respostaFalha(modo, ["Não foi possível concluir a ação do radar agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR", "PAUSAR", "ATIVAR", "CANCELAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono do radar (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona do radar (do contexto da conversa)." },
  { nome: "radarId", tipo: "string", obrigatorio: false, descricao: "Id do radar — obrigatório em ATUALIZAR/PAUSAR/ATIVAR/CANCELAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "veiculoId", tipo: "string", obrigatorio: false, descricao: "Veículo associado ao radar — se o cliente tiver só 1 veículo ativo, use automaticamente; se tiver mais de 1, pergunte qual antes de chamar." },
  { nome: "origemCidade", tipo: "string", obrigatorio: false, descricao: "Cidade de origem da busca (ex.: onde o cliente vai descarregar/está disponível)." },
  { nome: "origemUf", tipo: "string", obrigatorio: false, descricao: "UF (2 letras) da origem." },
  { nome: "destinoCidade", tipo: "string", obrigatorio: false, descricao: "Cidade de destino desejada, se o cliente tiver uma específica em mente." },
  { nome: "destinoUf", tipo: "string", obrigatorio: false, descricao: "UF (2 letras) do destino desejado — pode ficar vazio se o cliente aceitar qualquer destino." },
  { nome: "destinoRegiaoLabel", tipo: "string", obrigatorio: false, descricao: "Rótulo livre de região/destino quando o cliente falar algo mais amplo que UF (ex.: \"Sul do país\", \"qualquer lugar perto de Curitiba\")." },
  { nome: "disponivelDe", tipo: "string", obrigatorio: false, descricao: "Data a partir de quando o cliente está disponível, formato YYYY-MM-DD." },
  { nome: "disponivelAte", tipo: "string", obrigatorio: false, descricao: `Data até quando o radar deve ficar ativo, formato YYYY-MM-DD — se o cliente não informar prazo, o radar expira sozinho em ${RADAR_DURACAO_PADRAO_DIAS} dias (avise isso ao cliente).` },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre a busca." },
];

export const ferramentaGerenciarRadarFrete: DefinicaoFerramenta<GerenciarRadarFreteEntrada, GerenciarRadarFreteResultado> = {
  nome: "gerenciar_radar_frete",
  descricao: "Cria, lista, atualiza, pausa, reativa ou cancela uma busca ativa de carga (Radar de Fretes) — quando o cliente quer ser avisado automaticamente quando aparecer frete compatível.",
  objetivo: "Deixar o cliente dizer 'quero carga de volta pra Curitiba' e ser avisado automaticamente quando uma oportunidade compatível aparecer, sem precisar ficar checando manualmente.",
  parametros: PARAMETROS,
  executar,
};
