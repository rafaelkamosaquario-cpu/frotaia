"use client";
import {useEffect,useState} from "react";
import {currentOperationMonth,type OperationData} from "@/lib/individual/operation";
import styles from "./MyOperation.module.css";
const money=(value:number)=>value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=(value:string)=>new Date(value.length===10?`${value}T12:00:00-03:00`:value).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"});
const state=(value:string,income=false)=>value==="settled"?(income?"Recebida":"Paga"):value==="pending"?"Pendente":"Baixa não informada";
export function MyOperation({revision,onAsk}:{revision:number;onAsk:(text:string)=>void}) {
  const [month,setMonth]=useState(currentOperationMonth);
  const [data,setData]=useState<OperationData|null>(null);
  const [error,setError]=useState("");const [refresh,setRefresh]=useState(0);
  const [documentError,setDocumentError]=useState("");const [opening,setOpening]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setData(null);setError("");
      fetch(`/api/individual/operation?month=${encodeURIComponent(month)}`,{cache:"no-store",signal:controller.signal})
        .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||"Não foi possível consultar os registros.");return body as OperationData;})
        .then(body=>{if(!controller.signal.aborted)setData(body);})
        .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Falha ao carregar.");});
    },0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[month,revision,refresh]);
  useEffect(()=>{const visible=()=>{if(document.visibilityState==="visible")setRefresh(n=>n+1);};document.addEventListener("visibilitychange",visible);return()=>document.removeEventListener("visibilitychange",visible);},[]);
  async function openDocument(id:string){
    setOpening(id);setDocumentError("");
    try{const response=await fetch(`/api/individual/documents/${encodeURIComponent(id)}`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error);window.location.assign(body.url);}
    catch(err){setDocumentError(err instanceof Error?err.message:"Não foi possível abrir o documento.");}finally{setOpening(null);}
  }
  const ask=(text:string)=>onAsk(`${text} Período: ${month}. Use meus registros; informe o que estiver faltando.`);
  return <section id="minha-operacao" className={styles.operation} aria-label="Minha operação">
    <header><div><h2>Minha operação</h2><p>Seus registros, além da conversa.</p></div><button type="button" onClick={()=>setRefresh(n=>n+1)}>Atualizar</button></header>
    <label className={styles.period}>Mês dos registros<input aria-label="Mês dos registros" type="month" min="2000-01" max="2100-12" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label>
    <p className={styles.note}>WhatsApp e aplicativo consultam a mesma operação quando vinculados. Apenas registros efetivamente salvos aparecem aqui. Após enviar pelo WhatsApp, toque em Atualizar.</p>
    {error?<p role="alert">{error}</p>:!data?<p role="status">Consultando seus registros…</p>:<>
      <div className={styles.vehicle}><strong>{data.company}</strong><p>{data.vehicle?[data.vehicle.name,data.vehicle.plate].filter(Boolean).join(" · "):"Veículo padrão não informado"}</p><small>Atualizado às {new Date(data.updatedAt).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"})} · Brasília</small></div>
      {data.summary&&<><div className={styles.totals}>
        <div><small>Receitas registradas</small><strong>{money(data.summary.revenues)}</strong></div>
        <div><small>Despesas registradas</small><strong>{money(data.summary.expenses)}</strong></div>
        <div><small>Saldo dos registros</small><strong className={data.summary.balance<0?styles.negative:styles.positive}>{money(data.summary.balance)}</strong></div>
      </div><p className={styles.note}>Saldo não é lucro líquido nem saldo bancário. Considera as receitas e despesas registradas no mês da operação, não a data do pagamento. Custos não lançados não estão incluídos.</p>
      <details><summary>Meu mês · receitas e despesas</summary>
        <p>Recebidas: {money(data.summary.received)} · Pagas: {money(data.summary.paid)}</p>
        <p>Pendente de receber: {money(data.summary.pendingRevenues)} · Pendente de pagar: {money(data.summary.pendingExpenses)}</p>
        <p>Baixa não informada: {money(data.summary.unknownRevenues)} em receitas e {money(data.summary.unknownExpenses)} em despesas.</p>
        <h3>Receitas ({data.revenueCount})</h3>{!data.revenueCount&&<p>Nenhuma receita registrada no período.</p>}
        {data.revenues.map(r=><article key={r.id}><strong>{money(r.amount)} · {r.label}</strong><small>{date(r.date)} · {state(r.status,true)}</small></article>)}
        <h3>Despesas ({data.expenseCount})</h3>{!data.expenseCount&&<p>Nenhuma despesa registrada no período.</p>}
        {data.expenses.map(r=><article key={r.id}><strong>{money(r.amount)} · {r.label}</strong><small>{date(r.date)} · {state(r.status)}</small></article>)}
        {(data.expenseCount>100||data.revenueCount>100)&&<p>Detalhamento limitado aos 100 mais recentes de cada tipo. Os totais incluem todos os registros do período.</p>}
        <button onClick={()=>ask("Explique minhas receitas, despesas e saldo registrados.")}>Perguntar sobre meu mês</button>
      </details>
      <details><summary>Abastecimentos · {data.fuel.length===100?"100 mais recentes":data.fuel.length}</summary><p className={styles.note}>Detalhes do abastecimento. Não somamos estes valores novamente às despesas.</p>
        {!data.fuel.length&&<p>Nenhum abastecimento registrado neste mês.</p>}
        {data.fuel.map(r=><article key={r.id}><strong>{r.liters.toLocaleString("pt-BR")} L · {money(r.amount)}</strong><small>{date(r.date)} · {r.km===null?"KM não informado":`${r.km.toLocaleString("pt-BR")} km informados no abastecimento`}</small></article>)}
        <button onClick={()=>ask("Consulte meus abastecimentos e explique o consumo, se houver dados suficientes.")}>Perguntar sobre combustível</button>
      </details></>}
      {data.enabled.includes("fretes")&&<details><summary>Análises concluídas · {data.analyses.length}</summary><p className={styles.note}>Até 30 análises do mês. Simulações não são receitas; em configurações restritas, o histórico entre módulos não é exibido.</p>
        {!data.analyses.length&&<p>Nenhuma análise disponível nesta consulta.</p>}
        {data.analyses.map(r=><article key={r.id}><strong>{r.title}</strong><small>{date(r.date)} · Análise, não lançamento financeiro</small><p>{r.summary||"Sem resumo disponível."}</p><button onClick={()=>ask(`Consulte a análise ${r.id} (${r.title}) e explique o resultado.`)}>Entender esta análise</button></article>)}
      </details>}
      {data.enabled.includes("avisos")&&<details><summary>Lembretes pendentes · {data.alerts.length}</summary><p className={styles.note}>Até 20 lembretes, independentemente do mês escolhido. Data passada significa pendência de envio, não confirmação de entrega. Não inclui todos os eventos da Agenda Google.</p>
        {!data.alerts.length&&<p>Nenhum lembrete pendente encontrado.</p>}
        {data.alerts.map(r=><article key={r.id}><strong>{r.title}</strong><small>{date(r.date)} às {new Date(r.date).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"})} · Brasília</small></article>)}
        <button onClick={()=>onAsk("Consulte meus próximos lembretes e vencimentos registrados.")}>Perguntar sobre lembretes</button>
      </details>}
      {data.enabled.includes("gerados")&&<details id="meus-relatorios"><summary>Meus relatórios · {data.documents.length}</summary><p className={styles.note}>Até 20 PDFs mais recentes de todos os períodos. Arquivos enviados por você no WhatsApp não são automaticamente relatórios gerados.</p>
        {!data.documents.length&&<p>Nenhum relatório gerado encontrado.</p>}
        {data.documents.map(r=><article key={r.id}><strong>{r.title}</strong><small>{date(r.date)}</small>{r.available?<button disabled={opening!==null} onClick={()=>void openDocument(r.id)}>{opening===r.id?"Abrindo…":"Abrir / baixar PDF"}</button>:<p>Arquivo indisponível. Peça uma nova geração ao assistente.</p>}</article>)}
        {documentError&&<p role="alert">{documentError}</p>}
        <button onClick={()=>ask("Consulte meus registros e gere um PDF com receitas, despesas e análises disponíveis. Diferencie valores registrados, pagos e recebidos. Não estime dados ausentes.")}>Pedir relatório do mês</button>
      </details>}
      {(data.enabled.includes("manutencao")||data.enabled.includes("pneus"))&&<details><summary>Cuidados do caminhão · manutenção e pneus</summary><p className={styles.note}>Até 50 registros de cada categoria, independentemente do mês. Este é o cadastro operacional; não inclui os acompanhamentos privados da consultoria.</p>
        {data.enabled.includes("manutencao")&&<><h3>Manutenção</h3>{!data.maintenance.length&&<p>Nenhuma manutenção cadastrada.</p>}{data.maintenance.map(r=><article key={r.id}><strong>{r.title}</strong><small>Data prevista: {date(r.date)} · {({pending:"Pendente",completed:"Concluída",overdue:"Atrasada",cancelled:"Cancelada"} as Record<string,string>)[r.status]||r.status}</small>{r.nextKm!==null&&<p>Próximo marco informado: {r.nextKm.toLocaleString("pt-BR")} km.</p>}</article>)}</>}
        {data.enabled.includes("pneus")&&<><h3>Pneus</h3>{!data.tires.length&&<p>Nenhum pneu cadastrado no controle operacional.</p>}{data.tires.map(r=><article key={r.id}><strong>{r.title}</strong><small>{r.position||"Posição não informada"} · {({mounted:"Montado",stock:"Estoque",scrapped:"Baixado"} as Record<string,string>)[r.status]||r.status}</small></article>)}</>}
        <button onClick={()=>onAsk("Consulte meus registros de manutenção e pneus e explique o que precisa de atenção. Não estime dados ausentes.")}>Perguntar sobre os cuidados</button>
      </details>}
    </>}
  </section>;
}
