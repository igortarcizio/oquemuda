import test from 'node:test';
import assert from 'node:assert/strict';
import {rankRelated} from '../src/ui/related-proposals.js';

const source={id:10,tags:['SUS','Vacinação'],numero:1,ano:2026,ementa:'Fonte'};
const p=(id,tags,date='2026-01-01')=>({id,tags,numero:id,ano:2026,ementa:'Texto oficial '+id,dataApresentacao:date});

test('relacionadas exigem tag em comum e não incluem a ficha aberta',()=>{
  const list=rankRelated(source,[source,p(11,['SUS']),p(12,['Educação']),p(13,['Vacinação'])]);
  assert.deepEqual(list.map(x=>x.proposal.id),[13,11]);
});
test('pontuação prioriza mais tags em comum e depois a data',()=>{
  const list=rankRelated(source,[p(11,['SUS'],'2026-01-01'),p(12,['SUS','Vacinação'],'2025-01-01'),p(13,['SUS'],'2026-11-01')]);
  assert.deepEqual(list.map(x=>x.proposal.id),[12,13,11]);
  assert.deepEqual(list[0].matches,['SUS','Vacinação']);
});
test('limita a nove propostas distintas, sem inventar fichas',()=>{
  const list=rankRelated(source,[...Array.from({length:15},(_,i)=>p(100+i,['SUS'])),p(100,['SUS'])]);
  assert.equal(list.length,9);
  assert.equal(new Set(list.map(x=>x.proposal.id)).size,9);
});
test('sem tag em comum não exibe resultados',()=>{
  assert.deepEqual(rankRelated({id:1,tags:[]},[p(3,['SUS'])]),[]);
  assert.deepEqual(rankRelated(source,[p(3,['Orçamento'])]),[]);
});
