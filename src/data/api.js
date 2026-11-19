import {cleanText, ref, classifyTheme} from '../lib/text.js';
import {classifyTags} from '../lib/tags.js';
import {normalizeStatus,STATUS,isLaw} from '../lib/status.js';
import {THEME_TAGS} from '../lib/themes.js';
import {normalizeTramitacoes,normalizeTextoAtual} from '../lib/tramitacoes.js';
import {normalizeApensacao} from '../lib/apensacao.js';
import {parseSearch,matchesToken} from '../lib/search.js';
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
 const url=new URL(String(path).replace(new RegExp('^/+'),''),API+'/').href;
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
     if(err instanceof SourceError && /^Câmara: resposta HTTP 4[0-9][0-9]$/.test(err.message) && !err.message.endsWith('429'))throw err;
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
 const tags=Array.isArray(raw.tags)&&raw.tags.length?raw.tags:classifyTags(raw.ementa);
 return {id:Number(raw.id),numero:Number(raw.numero),ano:Number(raw.ano),siglaTipo:raw.siglaTipo||'PL',
  ementa:cleanText(raw.ementa),dataApresentacao:raw.dataApresentacao||'',area:classifyTheme({...raw,tags},editorial),
  titulo:editorial.titulo||raw.titulo||'',impacto:editorial.impacto||raw.impacto||'',comoHoje:editorial.comoHoje||raw.comoHoje||'',
  tags,
  publicos:Array.isArray(editorial.publicos)?editorial.publicos:(raw.publicos||[]), statusCurto:raw.statusCurto||''};
}
const getEditorial=id=>window.OBM_EDITORIAL?.[String(id)]||{};
const parsePage=(link)=>{try{const u=new URL(link.href);const n=Number(u.searchParams.get('pagina'));return Number.isInteger(n)&&n>0?n:null}catch{return null}};
/** Câmara /proposicoes responde 'links' com rel=next/last; sem último informado, não simulamos total. */
export async function getProposals({page=1,year='2026',type='PL',party='Todos',keywords='',situationCodes='',signal}={}) {
 const qs=new URLSearchParams({pagina:String(page),itens:'30',ordenarPor:'id',ordem:'DESC'});
 const search=parseSearch(keywords);
 if(search.ref){
  // Referência ("PL 999/2026"): busca pelo número, ignorando os outros filtros.
  qs.set('numero',String(search.ref.numero));
  if(search.ref.ano)qs.set('ano',String(search.ref.ano));
  if(search.ref.sigla)qs.set('siglaTipo',search.ref.sigla);
 }else{
  if(year!=='Todos')qs.set('ano',String(year));
  const sigla=search.sigla||(type!=='Todos'?type:'');
  if(sigla)qs.set('siglaTipo',String(sigla));
  if(party!=='Todos')qs.set('siglaPartidoAutor',String(party));
  if(situationCodes)qs.set('codSituacao',String(situationCodes));
  if(search.tokens.length)qs.set('keywords',search.tokens.join(' '));
 }
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
 const raw=payload.data,p=normalizeProposal(raw,getEditorial(raw.id)),status=normalizeStatus(raw.statusProposicao);
 p.virouLei=isLaw(status);
 return {proposal:p,status,stage:raw.statusProposicao||{},
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
/** Partidos do filtro: os mesmos nomes que o banco grava em `partidos` (ver migração 20261116_partidos_autores.sql). */
export const PARTIES=Object.freeze(['AVANTE','CIDADANIA','MDB','MISSÃO','NOVO','PCdoB','PDT','PL','PODE','PP','PRD','PSB','PSD','PSDB','PSOL','PT','PV','REDE','REPUBLICANOS','SOLIDARIEDADE','UNIÃO']);
export async function getParties(){return [...PARTIES]}
/** Palavras da busca, sem palavras vazias e sem caracteres que a sintaxe do banco reserva. */
export function searchTokens(text){return parseSearch(text).tokens}
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// A cópia local é normalizada (tags e tema) uma única vez, não a cada troca de filtro.
let snapshotSource=null,snapshotItems=[];
function normalizedSnapshot(){
 const source=window.OBM_DATA?.items||[];
 if(source!==snapshotSource){snapshotSource=source;snapshotItems=source.map(p=>normalizeProposal(p,getEditorial(p.id)))}
 return snapshotItems;
}
export function fromSnapshot({page=1,year='2026',type='PL',party='Todos',keywords='',tag='',area='Todos'}={}){
 if(party!=='Todos')return null; // Cache não traz autoria completa; jamais filtrar partido por suposição.
 const all=normalizedSnapshot();
 const search=parseSearch(keywords),r=search.ref;
 const sigla=search.sigla||(type!=='Todos'?type:'');
 const filtered=r?all.filter(p=>p.numero===r.numero&&(!r.ano||p.ano===r.ano)&&(!r.sigla||p.siglaTipo===r.sigla)):
  all.filter(p=>(year==='Todos'||String(p.ano)===year)&&(!sigla||p.siglaTipo===sigla)
   &&(area==='Todos'||p.area===area)&&(!tag||p.tags.includes(tag))
   &&(!search.tokens.length||search.tokens.every(t=>matchesToken(fold([p.ementa,p.titulo,p.impacto,ref(p)].join(' ')),t))));
 return {items:filtered.slice((page-1)*30,page*30),page,totalPages:Math.max(1,Math.ceil(filtered.length/30)),
  hasNext:page<Math.ceil(filtered.length/30),source:'cópia parcial'};
}

/** Leitura principal do catálogo persistido. Chave pública com RLS somente leitura. */
const DB_URL='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/proposicoes';
const DB_KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';
export async function getDatabaseProposals({page=1,year='2026',type='PL',party='Todos',keywords='',tag='',theme='',situationCodes='',presentedSince='',excludeIds=[],signal}={}){
 if(party!=='Todos'&&!/^[\p{L}.]{2,20}$/u.test(party))throw new SourceError('Partido inválido');
 if(tag && (!/^[\p{L}0-9+-]{1,80}$/u.test(tag)))throw new SourceError('Tag inválida');
 const q=new URLSearchParams({select:'id,sigla_tipo,numero,ano,ementa,tags,data_apresentacao,situacao_codigo,situacao_descricao,situacao_atualizada_em,dados_oficiais,coletado_em',order:'data_apresentacao.desc,id.desc',limit:'30',offset:String((page-1)*30)});
 const search=parseSearch(keywords);
 if(search.ref){
  // Referência ("PL 999/2026"): a proposta é única, então os outros filtros não se aplicam.
  q.set('numero','eq.'+search.ref.numero);
  if(search.ref.ano)q.set('ano','eq.'+search.ref.ano);
  if(search.ref.sigla)q.set('sigla_tipo','eq.'+search.ref.sigla);
  year='Todos';type='Todos';tag='';theme='';party='Todos';situationCodes='';presentedSince='';excludeIds=[];
 }
 if(year!=='Todos')q.set('ano','eq.'+year);
 const sigla=search.sigla||(type!=='Todos'?type:'');
 if(sigla)q.set('sigla_tipo','eq.'+sigla);
 if(tag)q.set('tags','cs.{'+tag+'}');
 // Partido de qualquer autor (coluna calculada pelo banco a partir de dados_oficiais.autores).
 if(party!=='Todos')q.set('partidos','cs.{"'+party+'"}');
 // Busca: cada palavra precisa aparecer na ementa, em qualquer ordem.
 // Tema: propostas com ao menos um assunto do tema (aproximação até existir a coluna area no banco).
 // ementa_busca é a ementa em minúsculas e sem acento: "saude" encontra "Saúde".
 const conditions=search.tokens.map(t=>'ementa_busca.ilike.*'+fold(t)+'*');
 if(theme){
  if(!THEME_TAGS[theme])throw new SourceError('Tema inválido');
  conditions.push('tags.ov.{'+THEME_TAGS[theme].map(t=>'"'+t+'"').join(',')+'}');
 }
 if(conditions.length)q.set('and','('+conditions.join(',')+')');
 if(situationCodes)q.set('situacao_codigo','in.('+situationCodes+')');
 if(/^\d{4}-\d{2}-\d{2}$/.test(presentedSince))q.set('data_apresentacao','gte.'+presentedSince);
 if(excludeIds.length)q.set('id','not.in.('+excludeIds.map(Number).filter(Number.isInteger).join(',')+')');
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),9000);
 const onAbort=()=>controller.abort();
 signal?.addEventListener('abort',onAbort,{once:true});
 try{
  const response=await fetch(DB_URL+'?'+q.toString(),{headers:{apikey:DB_KEY,Accept:'application/json',Prefer:'count=exact'},signal:controller.signal});
  if(!response.ok)throw new SourceError('Banco de dados: HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data))throw new SourceError('Resposta inesperada do banco');
  const range=response.headers.get('content-range')||'';
  const total=Number(range.split('/')[1]);
  const totalPages=Number.isFinite(total)?Math.max(1,Math.ceil(total/30)):null;
  const items=data.map(d=>{
    const p=normalizeProposal({id:d.id,siglaTipo:d.sigla_tipo,numero:d.numero,ano:d.ano,ementa:d.ementa,tags:d.tags,dataApresentacao:d.data_apresentacao,statusCurto:d.situacao_descricao||''},getEditorial(d.id));
    const stage=d.dados_oficiais?.statusProposicao||{};
    p.statusVerificado=d.situacao_codigo!=null||d.situacao_descricao||stage.descricaoTramitacao?normalizeStatus({...stage,codSituacao:d.situacao_codigo,descricaoSituacao:d.situacao_descricao||stage.descricaoSituacao}):(d.situacao_atualizada_em?{...STATUS.unknown,detail:'A situação não consta no registro oficial consultado.'}:{...STATUS.unknown,detail:'A situação ainda não foi obtida na última sincronização.'});
    return p;
  }).filter(p=>p.id&&p.numero&&p.ementa);
  return {items,page,totalPages,hasNext:totalPages?page<totalPages:items.length===30,source:'banco de dados'};
 }catch(e){throw e instanceof SourceError?e:new SourceError('Banco indisponível: '+(e?.message||'erro de conexão'))}
 finally{clearTimeout(timeout);signal?.removeEventListener('abort',onAbort)}
}

const DETAIL_COLS='id,sigla_tipo,numero,ano,ementa,tags,data_apresentacao,situacao_codigo,situacao_descricao,dados_oficiais,situacao_atualizada_em';
// Colunas das migrations de 19/11, das mais novas para as mais antigas. Se uma ainda não
// existir (HTTP 400), a ficha tenta sem ela e lembra a escolha.
const EXTRA_COLS=[',tramitacoes,texto_atual,apensada_a',',tramitacoes,texto_atual',''];
let extraLevel=0;
/** Ficha persistida: nunca depende de a Câmara responder no momento da leitura. */
export async function getDatabaseDetail(id,{signal,fetchImpl=globalThis.fetch}={}){
 const query=extra=>new URLSearchParams({select:DETAIL_COLS+extra,id:'eq.'+String(Number(id)),limit:'1'}).toString();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 try{
  const headers={apikey:DB_KEY,Accept:'application/json'};
  let res=await fetchImpl(DB_URL+'?'+query(EXTRA_COLS[extraLevel]),{headers,signal:controller.signal});
  while(res.status===400&&extraLevel<EXTRA_COLS.length-1){extraLevel++;res=await fetchImpl(DB_URL+'?'+query(EXTRA_COLS[extraLevel]),{headers,signal:controller.signal})}
  if(!res.ok)throw new SourceError('Consulta ao banco: HTTP '+res.status);
  const rows=await res.json();const d=rows?.[0];
  if(!d)throw new SourceError('Proposição não encontrada no banco');
  const raw=d.dados_oficiais||{};
  const stage=raw.statusProposicao||{};
  const officialStatus=(d.situacao_codigo==null&&!d.situacao_descricao&&!stage.descricaoSituacao&&!stage.descricaoTramitacao)?null:normalizeStatus({...stage,codSituacao:d.situacao_codigo,descricaoSituacao:d.situacao_descricao||stage.descricaoSituacao});
  const proposal=normalizeProposal({id:d.id,siglaTipo:d.sigla_tipo,numero:d.numero,ano:d.ano,ementa:d.ementa,tags:d.tags,dataApresentacao:d.data_apresentacao},getEditorial(d.id));
  // Vai junto da proposta para o resumo da IA saber se já descreve o texto em vigor.
  proposal.textoAtual=normalizeTextoAtual(d.texto_atual);
  proposal.virouLei=isLaw(officialStatus);
  return {proposal,tramitacoes:normalizeTramitacoes(d.tramitacoes),textoAtual:proposal.textoAtual,apensacao:normalizeApensacao(d.apensada_a),
   status:officialStatus||(d.situacao_atualizada_em?{...STATUS.unknown,detail:'A Câmara não informou a situação na consulta.'}:{...STATUS.unknown,detail:'Dados de situação ainda não obtidos da Câmara.'}),stage,
   authors:Array.isArray(raw.autores)?raw.autores.map(a=>({...a,partido:a.partido||(a.deputadoId?window.OBM_PARTIDOS_DEPUTADOS?.[String(a.deputadoId)]:null)||null})):[],
   authorsChecked:raw.autoresConsultados===true,
   fullTextURL:raw.urlInteiroTeor||null,source:'banco de dados',
   lastChecked:d.situacao_atualizada_em||null,loaded:true};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}

/** Propostas acompanhadas pelo site que tramitam junto com esta (apensadas a ela). */
export async function getJointProposals(id,{signal,fetchImpl=globalThis.fetch}={}){
 const q=new URLSearchParams({select:'id,sigla_tipo,numero,ano,ementa',apensada_raiz_id:'eq.'+String(Number(id)),order:'ano.desc,numero.desc',limit:'10'});
 const res=await fetchImpl(DB_URL+'?'+q.toString(),{headers:{apikey:DB_KEY,Accept:'application/json',Prefer:'count=exact'},signal});
 if(!res.ok)return {rows:[],total:0};
 const rows=await res.json();
 const total=Number(String(res.headers?.get?.('content-range')||'').split('/')[1]);
 return {rows:Array.isArray(rows)?rows:[],total:Number.isFinite(total)?total:(Array.isArray(rows)?rows.length:0)};
}

/** Destaques persistidos: três posições, atualizadas somente quando há proposta nova qualificada. */
export async function getDailyFeatured({signal}={}){
 const root=DB_URL.replace(/\/proposicoes$/,'');
 const headers={apikey:DB_KEY,Accept:'application/json'};
 const list=await fetch(root+'/destaques_diarios?select=posicao,proposicao_id,selecionado_em&order=posicao.asc',{headers,signal});
 if(!list.ok)throw new SourceError('Destaques indisponíveis: HTTP '+list.status);
 const slots=await list.json();
 if(slots.length!==3)throw new SourceError('Seleção diária incompleta');
 const ids=slots.map(r=>Number(r.proposicao_id));
 if(ids.some(id=>!Number.isInteger(id)||id<=0))throw new SourceError('IDs de destaque inválidos');
 const q=new URLSearchParams({select:'id,sigla_tipo,numero,ano,ementa,tags,data_apresentacao,situacao_codigo,situacao_descricao,dados_oficiais,situacao_atualizada_em',id:'in.('+ids.join(',')+')'});
 const result=await fetch(DB_URL+'?'+q.toString(),{headers,signal});
 if(!result.ok)throw new SourceError('Fichas de destaque indisponíveis: HTTP '+result.status);
 const data=await result.json();
 const byId=new Map(data.map(d=>[Number(d.id),d]));
 const items=ids.map(id=>{
  const d=byId.get(id);
  if(!d)return null;
  const p=normalizeProposal({id:d.id,siglaTipo:d.sigla_tipo,numero:d.numero,ano:d.ano,ementa:d.ementa,tags:d.tags,dataApresentacao:d.data_apresentacao},getEditorial(d.id));
  const stage=d.dados_oficiais?.statusProposicao||{};
  p.statusVerificado=d.situacao_codigo!=null||d.situacao_descricao||stage.descricaoTramitacao?
    normalizeStatus({...stage,codSituacao:d.situacao_codigo,descricaoSituacao:d.situacao_descricao||stage.descricaoSituacao}):
    {...STATUS.unknown};
  return p;
 });
 if(items.some(p=>!p))throw new SourceError('Há destaque sem ficha indexada');
 return {items,updatedAt:slots[0].selecionado_em};
}
