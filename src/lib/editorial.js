/**
 * Seleção editorial: independência dos 30 registros cronológicos.
 * Nunca destacar textos não revisados ou repetir um ID presente na página.
 * Manutenção da curadoria: priorize assuntos cotidianos e fontes verificáveis.
 */
export const EDITORIAL_PRIORITY=Object.freeze([
  2650489, // Tratamento no SUS fora do município
  2650043, // Proteção em cancelamento de voos
  2649655, // Prevenção a golpes contra pessoas idosas
  2651275, // Triagem de doenças no SUS
  2650687, // Profissional de apoio escolar
  2649753, // Fraudes vinculadas ao número de celular
  2649659, // Anúncios de consórcio
]);

export function editorialAllowed(state){
 return state.view==='explorar';
}

export function selectEditorial(snapshot,editorial,visibleItems,{max=3,year=new Date().getFullYear()}={}){
 const excluded=new Set(visibleItems.map(p=>Number(p.id)));
 const map=new Map(snapshot.map(p=>[Number(p.id),p]));
 const selected=[];const used=new Set();
 for(const id of EDITORIAL_PRIORITY){
   if(selected.length>=max)break;
   const p=map.get(id),edit=editorial[String(id)]||{};
   if(!p||excluded.has(id)||used.has(id)||Number(p.ano)!==Number(year)||p.siglaTipo!=='PL')continue;
   if(!edit.titulo?.trim()?.endsWith('?')||!edit.impacto?.trim()||!Array.isArray(edit.publicos)||edit.publicos.length<1)continue;
   selected.push({...p,...edit,id,area:edit.area||p.area});
   used.add(id);
 }
 return selected;
}
