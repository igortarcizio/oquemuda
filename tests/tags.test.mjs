import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTags,tagURL} from '../src/lib/tags.js';
import {getDatabaseProposals,normalizeProposal} from '../src/data/api.js';
import {card,editorialFeature,detailPage} from '../src/ui/components.js';
import {editorialAllowed} from '../src/lib/editorial.js';
globalThis.window={OBM_EDITORIAL:{}};

test('SUS is one canonical subject and does not absorb other health subjects',()=>{
 for(const text of ['Pacientes do SUS','Usuários do SUS','Rede SUS','Sistema Único de Saúde'])
  assert.deepEqual(classifyTags(text),['SUS']);
 assert.deepEqual(classifyTags('Dispõe sobre a vacinação contra diabetes.'),['Diabetes','Vacinação']);
 assert.ok(!classifyTags('Medicamentos sem registro sanitário').includes('SUS'));
 const t=classifyTags('Rastreamento do diabetes e da doença celíaca no SUS.');
 assert.deepEqual(t,['SUS','Diabetes','Celíaca']);
 assert.ok(!classifyTags('Radiodifusão sonora').includes('Ruído'));
});
test('tag links reset year/type and preserve special characters',()=>{
 const q=new URLSearchParams(tagURL('LGBTI+').split('?')[1]);
 assert.equal(q.get('tag'),'LGBTI+');assert.equal(q.get('ano'),'Todos');
 assert.equal(q.get('tipo'),'Todos');assert.equal(q.get('page'),'1');
});
test('server applies exact tag before pagination across years and types',async()=>{
 const original=globalThis.fetch;let url;
 globalThis.fetch=async input=>{url=new URL(input);return {ok:true,headers:{get:()=> '30-59/95'},json:async()=>[{id:9,numero:2,ano:2025,sigla_tipo:'PLP',ementa:'Garante direitos.',tags:['SUS'],data_apresentacao:'2025-01-02'}]}};
 try{
  const r=await getDatabaseProposals({tag:'SUS',year:'Todos',type:'Todos',page:2});
  assert.equal(url.searchParams.get('tags'),'cs.{SUS}');
  assert.equal(url.searchParams.has('ano'),false);assert.equal(url.searchParams.has('sigla_tipo'),false);
  assert.equal(url.searchParams.get('offset'),'30');assert.equal(r.totalPages,4);
  assert.deepEqual(r.items[0].tags,['SUS']);
 }finally{globalThis.fetch=original}
});
test('invalid tags never reach the database',async()=>{
 await assert.rejects(getDatabaseProposals({tag:'SUS),id.gt.0'}),/Tag inválida/);
});
test('all cards, featured cards and details show clickable specific tags',()=>{
 const p=normalizeProposal({id:12,numero:5,ano:2026,ementa:'Pacientes do SUS recebem medicamentos.'});
 for(const render of [card,editorialFeature,detailPage]){
  const html=render(p);
  assert.match(html,/tag=SUS/);assert.match(html,/subject-tag/);
  assert.doesNotMatch(html,/Quem pode se interessar/);
 }
 assert.equal(editorialAllowed({view:'explorar',page:1,query:'',topic:'Todos',party:'Todos',type:'PL',year:2026,tag:'SUS'},2026),true);
});
