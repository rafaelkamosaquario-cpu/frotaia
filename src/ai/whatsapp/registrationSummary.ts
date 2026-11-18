import type { CustomerContext, VehicleContext } from '@/ai/context/customerContext';

/** Customer identity and vehicle identity must never share a "name" label. */
export function registrationSummary(customer:CustomerContext, context:VehicleContext):string {
 const v=context.vehicle;const lines:string[]=[];
 if(customer.profile?.full_name)lines.push(`Motorista: ${customer.profile.full_name}`);
 if(v){
  if(v.plate){const p=v.plate.toUpperCase();lines.push('Placa: `'+(/^([A-Z]{3})(\d{4})$/.test(p)?p.slice(0,3)+'-'+p.slice(3):p)+'`');}
  if(v.brand||v.model)lines.push(`Caminhão: ${[v.brand,v.model].filter(Boolean).join(' ')}`);
  else if(v.name)lines.push(`Identificação do caminhão: ${v.name}`);
  const kind:Record<string,string>={truck:'Truck',toco:'Toco',cavalo_mecanico:'Cavalo mecânico',tres_quartos:'Três quartos'};
  if(v.vehicle_type)lines.push(`Tipo: ${kind[v.vehicle_type]??v.vehicle_type}${v.axle_count?` · ${v.axle_count} eixos cadastrados`:''}`);
  const formula=v.notes?.match(/\b(?:4|6|8|10)x(?:2|4|6|8)\b/i)?.[0];
  if(formula)lines.push(`Configuração do caminhão: ${formula}`);
  const bodies:Record<string,string>={grade_baixa:'Grade baixa / carga seca',bau:'Baú',sider:'Sider',tanque:'Tanque',graneleiro:'Graneleiro',cacamba:'Caçamba',frigorifico:'Frigorífico',prancha:'Prancha'};
  if(v.body_type&&v.body_type!=='outro')lines.push(`Carroceria: ${bodies[v.body_type]??v.body_type}`);
  else {const body=v.notes?.match(/^Carroceria: (.+)$/m)?.[1];if(body)lines.push(`Carroceria: ${body}`);}
  const cargo=v.notes?.match(/^Carga: ([^;\n]+)/m)?.[1];if(cargo)lines.push(`Carga habitual: ${cargo}`);
  if(v.fuel_type)lines.push(`Combustível: ${v.fuel_type.replaceAll('_',' ')}`);
  else if(v.notes?.includes('Combustível informado: diesel'))lines.push('Combustível: diesel');
 }
 return lines.join('\n');
}

