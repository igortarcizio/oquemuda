import test from 'node:test';
import assert from 'node:assert/strict';
import {queryIndexedProposals} from '../src/data/indice.js';

test('índice aplica filtros no servidor antes da paginação',async()=>{
  const original=globalThis.fetch;
  let requested;
  globalThis.fetch=async(url,options)=>{
    requested=new URL(url);
    assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
    return {ok:true,headers:{get:()=> '0-0/61'},json:async()=>[{id:123,numero:55,ano:2026,sigla_tipo:'PL',ementa:'Teste',data_apresentacao:'2026-01-01'}]};
  };
  try{
    const r=await queryIndexedProposals({page:2,year:'2026',type:'PL',keywords:'educação'});
    assert.equal(requested.searchParams.get('offset'),'30');
    assert.equal(requested.searchParams.get('ano'),'eq.2026');
    assert.equal(requested.searchParams.get('sigla_tipo'),'eq.PL');
    assert.equal(requested.searchParams.get('ementa'),'ilike.*educação*');
    assert.equal(r.totalPages,3);
    assert.equal(r.source,'índice parcial');
    assert.equal(r.items[0].siglaTipo,'PL');
  }finally{globalThis.fetch=original}
});

test('índice rejeita filtros inválidos sem enviar consulta',async()=>{
  await assert.rejects(()=>queryIndexedProposals({year:'2026;drop'}),/Ano inválido/);
  await assert.rejects(()=>queryIndexedProposals({type:'INVALIDO'}),/Tipo inválido/);
});
