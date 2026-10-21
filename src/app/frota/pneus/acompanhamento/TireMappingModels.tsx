const models = [
  {id:"cavalo-tracao", title:"Cavalo mecânico · pneus de tração", description:"Vista superior 3D do cavalo, com quatro pneus de tração identificados. Modelo HMYL / BBY4F48, com campos de DOT e número de fogo."},
  {id:"carreta-tanque", title:"Carreta tanque · quatro eixos", description:"Vista superior 3D com 16 posições e dois estepes atrás. Modelo HMYL, com placa a informar e campos de DOT, número de fogo, modelo e banda."},
];

export function TireMappingModels() {
  return <section aria-labelledby="mapping-models-title" className="rounded-xl border border-border p-4 space-y-3">
    <h2 id="mapping-models-title" className="text-lg font-semibold">Modelos de mapeamento</h2>
    <p className="text-sm text-muted-foreground">Biblioteca privada ADM · RodoCore / Frota IA Painel Web. PDFs de identificação, sem quilometragem ou projeções. Não alteram os cadastros nem enviam mensagens.</p>
    <div className="grid gap-3 md:grid-cols-2">{models.map(model => <article key={model.id} className="rounded-lg border border-border p-4 space-y-3">
      <h3 className="font-semibold">{model.title}</h3>
      <p className="text-sm text-muted-foreground">{model.description}</p>
      <div className="flex flex-wrap gap-3">
        <a className="rounded-lg border border-border px-4 py-2 text-sm text-primary" href={`/api/frota/pneus/cases/modelos?modelo=${model.id}`} target="_blank" rel="noopener noreferrer">Abrir modelo</a>
        <a className="rounded-lg border border-border px-4 py-2 text-sm" href={`/api/frota/pneus/cases/modelos?modelo=${model.id}&download=1`}>Baixar PDF</a>
      </div>
    </article>)}</div>
    <p className="text-xs text-muted-foreground">Modelos fixos aprovados para referência e impressão, ainda sem preenchimento automático pelo cadastro selecionado. A carreta é ilustrativa: confirmar configuração real e quantidade dos estepes antes de usar. Para compartilhar, baixe e anexe manualmente no WhatsApp.</p>
  </section>;
}
