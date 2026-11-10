/**
 * Consulta experimental ao índice próprio do OQM?.
 * Não substitui a API da Câmara até termos cobertura e tramitação verificadas.
 * Chave PUBLICÁVEL: permissões limitadas por RLS; nunca usar service_role aqui.
 */
const BASE = 'https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1';
const PUBLIC_KEY = 'sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';
const TYPES = new Set(['PL','PLP','PEC','MPV','PDL','PRC']);

export async function queryIndexedProposals({
  page=1,year='2026',type='PL',keywords='',signal
}={}){
  const numberPage=Math.max(1,Math.floor(Number(page)||1));
  const url=new URL(BASE+'/proposicoes');
  url.searchParams.set('select','id,sigla_tipo,numero,ano,ementa,data_apresentacao,uri_oficial');
  url.searchParams.set('order','id.desc');
  url.searchParams.set('limit','30');
  url.searchParams.set('offset',String((numberPage-1)*30));
  if(year!=='Todos'){
    const n=Number(year);
    if(!Number.isInteger(n)||n<1800||n>2100)throw new Error('Ano inválido');
    url.searchParams.set('ano','eq.'+n);
  }
  if(type!=='Todos'){
    if(!TYPES.has(type))throw new Error('Tipo inválido');
    url.searchParams.set('sigla_tipo','eq.'+type);
  }
  const search=String(keywords||'').trim().slice(0,120);
  if(search)url.searchParams.set('ementa','ilike.*'+search.replace(/[*,()%]/g,' ')+'*');
  const response=await fetch(url,{signal,headers:{'apikey':PUBLIC_KEY,'Accept':'application/json','Prefer':'count=exact'}});
  if(!response.ok)throw new Error('Consulta ao índice indisponível (HTTP '+response.status+')');
  const data=await response.json();
  if(!Array.isArray(data))throw new Error('Resposta inválida do índice');
  const range=response.headers.get('content-range')||'';
  const total=Number(range.split('/')[1]);
  return {
    items:data.map(p=>({
      id:p.id,numero:p.numero,ano:p.ano,siglaTipo:p.sigla_tipo,
      ementa:p.ementa,dataApresentacao:p.data_apresentacao||'',area:'Outros',
      statusCurto:'Situação a confirmar'
    })),
    page:numberPage,
    totalPages:Number.isFinite(total)?Math.max(1,Math.ceil(total/30)):null,
    hasNext:Number.isFinite(total)?numberPage*30<total:data.length===30,
    source:'índice parcial'
  };
}
