import test from 'node:test';
import assert from 'node:assert/strict';
import {getDatabaseProposals,getDatabaseDetail} from '../src/data/api.js';
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
  assert.equal(detail.status.label,'Pronto para Votação');
  assert.equal(detail.source,'banco de dados');
 }finally{globalThis.fetch=previous}
});
