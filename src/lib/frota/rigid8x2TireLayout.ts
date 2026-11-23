/** Approved top-view rigid 8x2 template. Front axle is concealed under cab.
 * Coordinates use the 1024 x 1536 illustration; no inferred tire positions.
 */
export function rigid8x2TirePoint(position:string):{x:number;y:number}|null {
 const p=position.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const match=p.match(/eixo\s*([1-4])\b/)??p.match(/\b([1-4])(?:[º°o])?\s*eixo/);
 const axle=match?Number(match[1]):0;
 const left=/esquerdo|esquerda/.test(p),right=/direito|direita/.test(p);
 if(!axle||left===right)return null;
 if(axle===1)return {x:left?270:754,y:590};
 if(axle===2)return {x:left?270:754,y:745};
 const inner=/intern|dentro/.test(p),outer=/extern|fora/.test(p);
 if(inner===outer)return null;
 return {x:left?(inner?310:240):(inner?714:784),y:axle===3?1180:1370};
}
