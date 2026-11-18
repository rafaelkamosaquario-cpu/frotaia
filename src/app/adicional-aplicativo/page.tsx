import {createClient} from "@/lib/supabase/server";
import {loadCustomerContext} from "@/ai/context/customerContext";
import {getAppAddonState} from "@/services/supabase/appAddonService";
import {addonSalesUrl} from "@/lib/individual/addon";
import {AddonCheckout} from "./Checkout";
export default async function Page(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 const context=user?await loadCustomerContext(db,user.id):null;
 const state=context?.company?await getAppAddonState(context.company.id).catch(()=>null):null;
 return <main className="mx-auto max-w-2xl space-y-6 p-8"><a href="/" className="underline">Frota IA</a><h1 className="text-3xl font-bold">Aplicativo individual</h1><p>Converse no WhatsApp. Acompanhe sua operação no aplicativo.</p><h2 className="text-2xl">R$ 9,90 por mês adicional</h2><p>Um usuário e um veículo. Minha operação, relatórios, avisos e lembretes, Agenda Google e notícias. Texto e voz compatível com seu celular.</p><p>É necessário manter o plano WhatsApp ativo. Pagamento antecipado de um mês-calendário, sem renovação automática. Renovação soma ao prazo restante. O adicional não substitui nem renova o plano-base.</p>
 {state?.preserved?<p className="rounded border p-4">Seu acesso já inclui o aplicativo. Não pague adicional. <a href="/" className="underline">Abrir aplicativo</a></p>:state?.baseActive?<><p>{state.allowed?`Adicional ativo até ${new Date(state.until!).toLocaleDateString("pt-BR")}. Você pode renovar abaixo.`:"Adicional ainda não ativo."}</p><AddonCheckout/></>:<p>{!user?<a className="underline" href="/login?next=%2Fadicional-aplicativo">Entrar com a conta vinculada ao WhatsApp</a>:!context?.company?"No WhatsApp, peça: quero vincular meu aplicativo. Abra o link recebido e use esta conta Google.":state?"Ative ou renove primeiro sua assinatura WhatsApp.":"Consulta de acesso indisponível. Não pague novamente; tente atualizar."}</p>}
 {state?.allowed&&<a href="/" className="block rounded-lg bg-primary p-4 text-primary-foreground">Abrir meu aplicativo</a>}
 {!state?.preserved&&<><a href={addonSalesUrl()} className="block rounded-lg border p-4">Prefiro Pix manual com Rafael</a><p>Após o recebimento confirmado, Rafael libera o adicional no ADM. Comprovante ou instalação não liberam acesso sozinhos.</p></>}<a href="/adicional-aplicativo" className="block underline">Já paguei · atualizar situação</a><a href="https://wa.me/5541997454382" className="block underline">Voltar ao WhatsApp</a></main>;
}
