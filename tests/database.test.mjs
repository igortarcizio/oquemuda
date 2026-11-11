import test from 'node:test';
import assert from 'node:assert/strict';
import {getDatabaseProposals,getDatabaseDetail,getDailyFeatured} from '../src/data/api.js';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{'1234':'PT'}};

test('consulta 30 propostas no banco sem chamar Câmara e respeita total',async()=>{
 const previous=globalThis.fetch;let called='';
 globalThis.fetch=async url=>{
  called=String(url);
  return {ok:true,headers:{get:(k)=>k==='content-range'?'0-0/61':null},
   json:async()=>[{id:2649558,numero:5702,ano:2026,sigla_tipo:'PL',ementa:'Protege usuários de serviços.',data_apresentacao:'2026-10-29',situacao_codigo:null,situacao_descricao:null}]};
 };
 try{
  const result=await getDatabaseProposals({year:'2026',type:'PL',page:1});
  assert.match(called,/supabase.co\/rest\/v1\/proposicoes/);
  assert.equal(result.totalPages,3);
  assert.equal(result.items[0].statusVerificado.label,'Consulta pendente');
 }finally{globalThis.fetch=previous}
});

test('lê detalhes persistidos, estágio e autores sem consumir API oficial',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;
  return {ok:true,json:async()=>[{id:2649558,sigla_tipo:'PL',numero:5702,ano:2026,ementa:'Texto da proposta.',data_apresentacao:'2026-10-29',situacao_codigo:924,situacao_descricao:'Pronta para Pauta',situacao_atualizada_em:'2026-11-10T10:30:00Z',dados_oficiais:{statusProposicao:{siglaOrgao:'CCJC',dataHora:'2026-11-10T09:00:00',descricaoTramitacao:'Aguardando pauta'},autores:[{nome:'Exemplo',deputadoId:1234}],autoresConsultados:true}}]};
 };
 try{
  const detail=await getDatabaseDetail(2649558);
  assert.equal(calls,1);
  assert.equal(detail.stage.siglaOrgao,'CCJC');
  assert.equal(detail.authors[0].partido,'PT');
  assert.equal(detail.status.label,'Pronta para pauta');
  assert.equal(detail.source,'banco de dados');
 }finally{globalThis.fetch=previous}
});

test('apresentação oficial é exibida como Apresentada mesmo sem código de situação',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>[{id:2649558,sigla_tipo:'PL',numero:5702,ano:2026,ementa:'Texto.',data_apresentacao:'2026-10-29',situacao_codigo:null,situacao_descricao:null,situacao_atualizada_em:'2026-11-10T14:55:00Z',dados_oficiais:{statusProposicao:{descricaoTramitacao:'Apresentação de Proposição',dataHora:'2026-10-29T14:09:08'},autores:[{nome:'Eros Biondini',partido:'PL'}],autoresConsultados:true}}]});
 try{
  const detail=await getDatabaseDetail(2649558);
  assert.equal(detail.status.label,'Apresentada');
  assert.equal(detail.authors[0].nome,'Eros Biondini');
  assert.equal(detail.stage.dataHora,'2026-10-29T14:09:08');
 }finally{globalThis.fetch=previous}
});

test('atalhos filtram o banco inteiro antes da paginação e sem restringir tipo/ano',async()=>{
 const original=globalThis.fetch;let called='';
 globalThis.fetch=async url=>{called=String(url);return {ok:true,headers:{get:()=> '0-0/77'},
  json:async()=>[{id:2690023,numero:12,ano:2025,sigla_tipo:'PLP',ementa:'Regras sobre saúde e atendimento.',data_apresentacao:'2025-10-20',situacao_codigo:924,situacao_descricao:'Pronta para Pauta'}]}};
 try{
  const r=await getDatabaseProposals({year:'Todos',type:'Todos',situationCodes:'924',page:2});
  const u=new URL(called);
  assert.equal(u.searchParams.get('situacao_codigo'),'in.(924)');
  assert.equal(u.searchParams.has('ano'),false);
  assert.equal(u.searchParams.has('sigla_tipo'),false);
  assert.equal(u.searchParams.get('offset'),'30');
  assert.equal(r.totalPages,3);
  assert.equal(r.items[0].siglaTipo,'PLP');
 }finally{globalThis.fetch=original}
});

test('modo novidades aplica recorte de 30 dias no banco antes da paginação',async()=>{
 const original=globalThis.fetch;let called='';
 globalThis.fetch=async url=>{called=String(url);return {ok:true,headers:{get:()=> '*/0'},json:async()=>[]}};
 try{
  const r=await getDatabaseProposals({year:'Todos',type:'Todos',presentedSince:'2026-10-12'});
  const params=new URL(called).searchParams;
  assert.equal(params.get('data_apresentacao'),'gte.2026-10-12');
  assert.equal(params.get('limit'),'30');
  assert.equal(r.items.length,0);
 }finally{globalThis.fetch=original}
});

test('busca dos destaques retorna os IDs na ordem persistida, sem depender dos primeiros 30',async()=>{
 const original=globalThis.fetch;let calls=[];
 globalThis.fetch=async url=>{
  const u=new URL(String(url));calls.push(u);
  if(u.pathname.endsWith('/destaques_diarios'))
   return {ok:true,json:async()=>[
    {posicao:1,proposicao_id:88,selecionado_em:'2026-11-11'},
    {posicao:2,proposicao_id:99,selecionado_em:'2026-11-11'},
    {posicao:3,proposicao_id:77,selecionado_em:'2026-11-11'}]};
  return {ok:true,json:async()=>[77,88,99].map(id=>({id,numero:id,ano:2026,sigla_tipo:'PL',ementa:'Propõe novo acesso aos serviços de saúde e atendimento.',data_apresentacao:'2026-11-11',situacao_codigo:null}))};
 };
 try{
  const r=await getDailyFeatured();
  assert.deepEqual(r.items.map(p=>p.id),[88,99,77]);
  assert.equal(calls.length,2);
  assert.equal(calls[1].searchParams.get('id'),'in.(88,99,77)');
 }finally{globalThis.fetch=original}
});
