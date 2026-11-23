import test from 'node:test';
import assert from 'node:assert/strict';
import {missingStatus,RECENT_DAYS} from '../src/lib/status.js';
import {getDatabaseProposals} from '../src/data/api.js';
globalThis.window=globalThis.window||{OBM_EDITORIAL:{}};

const NOW=Date.parse('2026-11-23T22:00:00Z');

test('proposta recente sem situação aparece como Apresentada',()=>{
 const s=missingStatus('2026-11-19',{now:NOW});
 assert.equal(s.label,'Apresentada');
 assert.equal(s.tone,'neutral');
 assert.match(s.detail,/19\/11\/2026/);
 assert.match(s.detail,/sendo consultada/);
});

test('depois da consulta, o detalhe diz que a Câmara não registrou outra etapa',()=>{
 assert.match(missingStatus('2026-11-23',{checked:true,now:NOW}).detail,/não registrou outra etapa/);
});

test('fora da janela ou sem data, continua Em atualização',()=>{
 const old=new Date(NOW-(RECENT_DAYS+1)*86_400_000).toISOString().slice(0,10);
 assert.equal(missingStatus(old,{now:NOW}).label,'Em atualização');
 assert.equal(missingStatus(null,{now:NOW}).label,'Em atualização');
 assert.equal(missingStatus('data ruim',{now:NOW}).label,'Em atualização');
 // Data no futuro (erro de cadastro) não vira "Apresentada".
 assert.equal(missingStatus('2026-12-10',{now:NOW}).label,'Em atualização');
});

test('aceita data com horário vinda da Câmara',()=>{
 assert.equal(missingStatus('2026-11-20T15:42:00',{now:NOW}).label,'Apresentada');
});

test('card do banco usa o fallback quando a proposta é recente',async()=>{
 const previous=globalThis.fetch;
 const today=new Date().toISOString().slice(0,10);
 globalThis.fetch=async()=>({ok:true,headers:{get:()=>null},
  json:async()=>[{id:2650001,numero:5921,ano:2026,sigla_tipo:'PL',ementa:'Proíbe lucro com o crime.',data_apresentacao:today,situacao_codigo:null,situacao_descricao:null,situacao_atualizada_em:null,dados_oficiais:{}}]});
 try{
  const result=await getDatabaseProposals({page:1});
  assert.equal(result.items[0].statusVerificado.label,'Apresentada');
 }finally{globalThis.fetch=previous}
});
