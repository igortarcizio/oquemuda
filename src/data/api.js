import {cleanText, ref, classifyTheme} from '../lib/text.js';
import {normalizeStatus} from '../lib/status.js';
const API='https://dadosabertos.camara.leg.br/api/v2';
const TTL=15*60*1000,cache=new Map(),pending=new Map();
const current=()=>Date.now();
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new SourceError('Consulta cancelada'));return}
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve()},ms);
 const onAbort=()=>{clearTimeout(timer);reject(new SourceError('Consulta cancelada'))};
 signal?.addEventListener('abort',onAbort,{once:true});
});
export class SourceError extends Error {constructor(message){super(message);this.name='SourceError'}}

/**
 * Coalescência segura: requisições simultâneas compartilham transporte,
 * mas o cancelamento de uma navegação NÃO cancela as demais.
 * Respostas 4xx (exceto 429) não são repetidas.
 */
async function request(path,{signal,attempts=2}={}){
 if(signal?.aborted)throw new SourceError('Consulta cancelada');
 const url=new URL(String(path).replace(/^\\/+/,''),API+'/').href;
 const entry=cache.get(url);
 if(entry&&entry.until>current())return entry.value;
 let task=pending.get(url);
 if(!task){
  task=(async()=>{
   for(let i=0;i<attempts;i++){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
     const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
     if(!response.ok){
      if(response.status===429||response.status>=500){
       if(i<attempts-1){await sleep(500*(i+1));continue}
      }
      throw new SourceError('Câmara: resposta HTTP '+response.status);
     }
     const json=await response.json();
     if(json==null||!('dados' in json))throw new SourceError('Formato de resposta inesperado da Câmara');
     const value={data:json.dados,links:json.links||[]};
     cache.set(url,{value,until:current()+TTL});
     return value;
    }catch(err){
     if(err instanceof SourceError && /HTTP 4\\d\\d/.test(err.message) && !/HTTP 429/.test(err.message))throw err;
     if(i===attempts-1)throw new SourceError('Não foi possível consultar a Câmara agora. '+(err?.message||''));
     await sleep(400*(i+1));
    }finally{clearTimeout(timeout)}
   }
  })();
  pending.set(url,task);
  // Cleanup independently of consumer aborts, without an unhandled rejection.
  task.then(()=>{if(pending.get(url)===task)pending.delete(url)},
    ()=>{if(pending.get(url)===task)pending.delete(url)});
 }
 if(!signal)return task;
 return new Promise((resolve,reject)=>{
  const onAbort=()=>{signal.removeEventListener('abort',onAbort);reject(new SourceError('Consulta cancelada'))};
  signal.addEventListener('abort',onAbort,{once:true});
  task.then(value=>{signal.removeEventListener('abort',onAbort);if(signal.aborted)reject(new SourceError('Consulta cancelada'));else resolve(value)},
   error=>{signal.removeEventListener('abort',onAbort);reject(signal.aborted?new SourceError('Consulta cancelada'):error)});
  if(signal.aborted)onAbort();
 });
}
export function normalizeProposal(raw,editorial={}) {
 return {id:Number(raw.id),numero:Number(raw.numero),ano:Number(raw.ano),siglaTipo:raw.siglaTipo||'PL',
  ementa:cleanText(raw.ementa),dataApresentacao:raw.dataApresentacao||'',area:classifyTheme(raw,editorial),
  titulo:editorial.titulo||raw.titulo||'',impacto:editorial.impacto||raw.impacto||'',comoHoje:editorial.comoHoje||raw.comoHoje||'',
  publicos:Array.isArray(editorial.publicos)?editorial.publicos:(raw.publicos||[]), statusCurto:raw.statusCurto||''};
}
const getEditorial=id=>window.OBM_EDITORIAL?.[String(id)]||{};
const parsePage=(link)=>{try{const u=new URL(link.href);const n=Number(u.searchParams.get('pagina'));return Number.isInteger(n)&&n>0?n:null}catch{return null}};
/** Câmara /proposicoes responde 'links' com rel=next/last; sem último informado, não simulamos total. */
export async function getProposals({page=1,year='2026',type='PL',party='Todos',keywords='',situationCodes='',signal}={}) {
 const qs=new URLSearchParams({pagina:String(page),itens:'30',ordenarPor:'id',ordem:'DESC'});
 if(year!=='Todos')qs.set('ano',String(year));
 if(type!=='Todos')qs.set('siglaTipo',String(type));
 if(party!=='Todos')qs.set('siglaPartidoAutor',String(party));
 if(situationCodes)qs.set('codSituacao',String(situationCodes));
 if(keywords.trim())qs.set('keywords',keywords.trim());
 const payload=await request('/proposicoes?'+qs.toString(),{signal,attempts:2});
 if(!Array.isArray(payload.data))throw new SourceError('Resposta sem lista de proposições');
 let items=payload.data.map(d=>normalizeProposal(d,getEditorial(d.id))).filter(p=>p.id&&p.numero&&p.ementa);
 // A API pode retornar itens fora de codSituacao. Confirme a situação de cada
 // registro de maneira conservadora antes de mostrá-lo como pronto/aprovado.
 let inspectedCount=0,verificationFailed=0;
 if(situationCodes){
   const allowed=new Set(String(situationCodes).split(',').map(Number));
   const verified=[];
   for(let offset=0;offset<items.length;offset+=5){
     if(signal?.aborted)throw new SourceError('Consulta cancelada');
     const batch=items.slice(offset,offset+5);
     const checks=await Promise.allSettled(batch.map(p=>getDetail(p.id,{signal})));
     for(let i=0;i<checks.length;i++){
       const result=checks[i];inspectedCount++;
       if(result.status==='fulfilled'){
         const code=Number(result.value.stage.codSituacao);
         if(allowed.has(code))verified.push({...batch[i],statusVerificado:result.value.status});
       }else verificationFailed++;
     }
   }
   items=verified;
   if(verificationFailed===inspectedCount && inspectedCount>0)throw new SourceError('Não foi possível verificar a situação das propostas no momento.');
 }
 const last=payload.links.find(l=>l.rel==='last'),next=payload.links.find(l=>l.rel==='next');
 let totalPages=last?parsePage(last):null;
 if(!totalPages&&!next)totalPages=page;
 return {items,page,totalPages:situationCodes?null:totalPages,hasNext:!!next||(!totalPages&&payload.data.length===30),source:situationCodes?'situação verificada':'ao vivo',inspectedCount,verificationFailed};
}
export async function getDetail(id,{signal}={}) {
 const payload=await request('/proposicoes/'+encodeURIComponent(id),{signal});
 if(!payload.data?.id)throw new SourceError('Proposição não encontrada');
 const raw=payload.data,p=normalizeProposal(raw,getEditorial(raw.id));
 return {proposal:p,status:normalizeStatus(raw.statusProposicao),stage:raw.statusProposicao||{},
   fullTextURL:typeof raw.urlInteiroTeor==='string'&&raw.urlInteiroTeor.startsWith('https://www.camara.leg.br/')?raw.urlInteiroTeor:null,
   keywords:cleanText(raw.keywords),longSummary:cleanText(raw.ementaDetalhada)};
}
export async function getAuthors(id,{signal}={}){
 const response=await request('/proposicoes/'+encodeURIComponent(id)+'/autores',{signal});
 if(!Array.isArray(response.data))return [];
 const rows=response.data.slice().sort((a,b)=>(a.ordemAssinatura||999)-(b.ordemAssinatura||999));
 const partyMap=window.OBM_PARTIDOS_DEPUTADOS||{};
 const authors=await Promise.all(rows.slice(0,5).map(async a=>{
  const match=String(a.uri||'').match(/\/deputados\/(\d+)$/);
  const known=match?partyMap[match[1]]:null;
  if(known)return {nome:cleanText(a.nome),partido:known,fonte:'diretório'};
  if(!match)return {nome:cleanText(a.nome||a.tipo||'Autoria institucional'),partido:null};
  try{
   const detail=await request('/deputados/'+match[1],{signal,attempts:1});
   return {nome:cleanText(a.nome),partido:detail.data?.ultimoStatus?.siglaPartido||null};
  }catch{return {nome:cleanText(a.nome),partido:null}}
 }));
 return authors.concat(rows.length>5?[{nome:'E outros autores',partido:null}]:[]);
}
export async function getParties(){
 const fallback=['AVANTE','CIDADANIA','MDB','NOVO','PCdoB','PDT','PL','PODE','PP','PRD','PSB','PSD','PSDB','PSOL','PT','PV','REPUBLICANOS','SOLIDARIEDADE','UNIÃO'];
 try{
  const data=(await request('/partidos?itens=100',{attempts:1})).data;
  if(Array.isArray(data))return [...new Set([...fallback,...data.map(p=>p.sigla).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 }catch{}
 return fallback;
}
export function fromSnapshot({page=1,year='2026',type='PL',party='Todos',keywords='',area='Todos'}={}){
 if(party!=='Todos')return null; // Cache não traz autoria completa; jamais filtrar partido por suposição.
 const all=(window.OBM_DATA?.items||[]).map(p=>normalizeProposal(p,getEditorial(p.id)));
 const q=keywords.toLocaleLowerCase('pt-BR');
 const filtered=all.filter(p=>(year==='Todos'||String(p.ano)===year)&&(type==='Todos'||p.siglaTipo===type)
   &&(area==='Todos'||p.area===area)
   &&(!q||[p.ementa,p.titulo,p.impacto,ref(p)].join(' ').toLocaleLowerCase('pt-BR').includes(q)));
 return {items:filtered.slice((page-1)*30,page*30),page,totalPages:Math.max(1,Math.ceil(filtered.length/30)),
  hasNext:page<Math.ceil(filtered.length/30),source:'cópia parcial'};
}
