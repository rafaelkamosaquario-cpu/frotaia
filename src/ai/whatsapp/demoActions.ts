import type {OnboardingReply} from "./onboardingConversation";
import type {DemoTrack} from "./demoConversation";
const ACTIONS:Record<string,{track:DemoTrack;text:string}>={
 demo_doc_dados:{track:"documentos",text:"Mostre os dados legíveis extraídos do último documento enviado, sem inventar os ausentes. Não registre lançamentos."},
 demo_doc_frete:{track:"documentos",text:"Analise o frete do documento que acabei de enviar usando os dados extraídos e consultando a rota. Pergunte apenas o que faltar. Não registre receita."},
 demo_doc_total:{track:"documentos",text:"Confira o total do abastecimento com litros e preço por litro legíveis no documento enviado. Informe eventual diferença, sem registrar despesa."},
 demo_doc_escolher:{track:"documentos",text:"Qual informação você quer conferir no documento? Pode escrever ou mandar áudio."},
 demo_rota_combustivel:{track:"custo",text:"Calcule o combustível para a rota de ida consultada nesta conversa. Reaproveite os dados disponíveis e pergunte somente o que falta."},
 demo_rota_retorno:{track:"custo",text:"Quero considerar o retorno na análise da viagem. Pergunte se o retorno será vazio ou com carga e confirme o percurso antes de somar os custos."},
 demo_rota_alternativas:{track:"rota",text:"Consulte alternativas reais para a rota desta conversa e compare distância e duração. Não invente alternativas nem trate rotas de carro como certificadas para caminhões."},
};
export function resolveDemoAction(id:string|undefined){return id&&Object.hasOwn(ACTIONS,id)?ACTIONS[id]:null;}
export function documentDemoButtons(extractedText:string):OnboardingReply{
 const fuel=/litros?|abastecimento/i.test(extractedText)&&/diesel|gasolina|combustível/i.test(extractedText);
 return {kind:"buttons",text:"O que você quer conferir agora?",options:[
  {id:"demo_doc_dados",label:fuel?"Ver litros e preço":"Ver dados extraídos"},
  {id:fuel?"demo_doc_total":"demo_doc_frete",label:fuel?"Conferir o total":"Analisar esse frete"},
  {id:"demo_doc_escolher",label:"Escolher informações"},
 ]};
}
export function routeDemoButtons():OnboardingReply{return {kind:"buttons",text:"Como você quer continuar?",options:[
 {id:"demo_rota_combustivel",label:"Calcular combustível"},
 {id:"demo_rota_retorno",label:"Considerar retorno"},
 {id:"demo_rota_alternativas",label:"Ver outra rota"},
]};}
