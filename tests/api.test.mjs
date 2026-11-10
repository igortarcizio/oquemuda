import test from 'node:test';
import assert from 'node:assert/strict';
import {getProposals,fromSnapshot} from '../src/data/api.js';
globalThis.window={OBM_EDITORIAL:{},OBM_DATA:{items:[]},OBM_PARTIDOS_DEPUTADOS:{}};
test('consulta API com paginação real de 30 e filtra partido',async()=>{
 const fetchOriginal=globalThis.fetch;let seen='';
 globalThis.fetch=async url=>{
  seen=String(url);
  const data=Array.from({length:30},(_,i)=>({id:2600000+i,numero:i+1,ano:2026,siglaTipo:'PL',ementa:'Proteção do consumidor em contratos digitais.'}));
  return {ok:true,json:async()=>({dados:data,links:[{rel:'last',href:'https://dadosabertos.camara.leg.br/api/v2/proposicoes?pagina=9&itens=30'},{rel:'next',href:'https://dadosabertos.camara.leg.br/api/v2/proposicoes?pagina=3&itens=30'}]})};
 };
 try{
  const result=await getProposals({page:2,year:'2026',type:'PL',party:'PT'});
  assert.equal(result.items.length,30);assert.equal(result.page,2);assert.equal(result.totalPages,9);
  const url=new URL(seen);assert.equal(url.pathname,'/api/v2/proposicoes');
  assert.equal(url.searchParams.get('itens'),'30');
  assert.equal(url.searchParams.get('pagina'),'2');
  assert.equal(url.searchParams.get('siglaPartidoAutor'),'PT');
 }finally{globalThis.fetch=fetchOriginal}
});
test('cópia local não inventa autoria partidária',()=>{
 assert.equal(fromSnapshot({party:'PT'}),null);
});

test('atalho de pauta envia codSituacao=924 à consulta oficial',async()=>{
 const original=globalThis.fetch;let url='';
 globalThis.fetch=async u=>{url=String(u);return {ok:true,json:async()=>({dados:[],links:[]})}};
 try{
  const r=await getProposals({page:1,year:'2026',type:'PL',situationCodes:'924'});
  const qs=new URL(url).searchParams;
  assert.equal(qs.get('codSituacao'),'924');
  assert.equal(qs.get('itens'),'30');
  assert.equal(r.items.length,0);
 }finally{globalThis.fetch=original}
});
test('atalho de aprovadas envia apenas códigos oficiais de remessa e sanção',async()=>{
 const original=globalThis.fetch;let url='';
 globalThis.fetch=async u=>{url=String(u);return {ok:true,json:async()=>({dados:[],links:[]})}};
 try{await getProposals({year:'2025',situationCodes:'1293,1303,1150,1160'});
   assert.equal(new URL(url).searchParams.get('codSituacao'),'1293,1303,1150,1160');
 }finally{globalThis.fetch=original}
});

test('não exibe falsos positivos mesmo quando a listagem ignora o filtro de situação',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async u=>{
  const url=new URL(String(u));
  if(url.pathname.endsWith('/proposicoes')){
   return {ok:true,json:async()=>({dados:[
    {id:2733331,numero:100,ano:2026,siglaTipo:'PL',ementa:'Proposta apresentada.'},
    {id:2733332,numero:101,ano:2026,siglaTipo:'PL',ementa:'Proposta pronta para pauta.'}
   ],links:[]})};
  }
  const code=url.pathname.endsWith('/2733331')?1383:924;
  return {ok:true,json:async()=>({dados:{id:Number(url.pathname.split('/').pop()),numero:100,ano:2026,siglaTipo:'PL',ementa:'Texto.',statusProposicao:{codSituacao:code,descricaoSituacao:code===924?'Pronta para Pauta':'Recebido pelo Protocolo Digital'}}})};
 };
 try{
  const result=await getProposals({year:'2024',type:'PL',situationCodes:'924'});
  assert.equal(result.inspectedCount,2);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].id,2733332);
  assert.equal(result.source,'situação verificada');
 }finally{globalThis.fetch=original}
});

test('cancelar uma navegação não cancela consulta compartilhada por outro usuário da página',async()=>{
 const original=globalThis.fetch;
 let calls=0,finish;
 const gate=new Promise(resolve=>{finish=resolve});
 globalThis.fetch=async()=>{calls++;await gate;return {ok:true,json:async()=>({dados:[],links:[]})}};
 const a=new AbortController(),b=new AbortController();
 try{
  const first=getProposals({year:'2017',type:'PL',signal:a.signal});
  const second=getProposals({year:'2017',type:'PL',signal:b.signal});
  a.abort();
  await assert.rejects(first,/cancelada/);
  finish();
  const result=await second;
  assert.equal(result.items.length,0);
  assert.equal(calls,1);
 }finally{finish();globalThis.fetch=original}
});
test('erro HTTP 400 não gera segunda requisição desnecessária',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:false,status:400}};
 try{
  await assert.rejects(getProposals({year:'2016',type:'PEC',party:'ZZZ'}),/HTTP 400/);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
