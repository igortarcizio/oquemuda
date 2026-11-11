import test from 'node:test';
import assert from 'node:assert/strict';
import {THEMES,THEME_TAGS,themeFor} from '../src/lib/themes.js';
import {THEMES as FILTER_THEMES,classifyTheme} from '../src/lib/text.js';
import {normalizeStatus,STATUS} from '../src/lib/status.js';
import {getDatabaseProposals,normalizeProposal} from '../src/data/api.js';
globalThis.window={OBM_EDITORIAL:{},OBM_DATA:{items:[]},OBM_PARTIDOS_DEPUTADOS:{}};

test('13 temas, nenhum "Outros", e o filtro oferece exatamente os mesmos',()=>{
 assert.equal(THEMES.length,13);
 assert.ok(!THEMES.includes('Outros'));
 assert.deepEqual(FILTER_THEMES,['Todos',...THEMES]);
 for(const t of THEMES)assert.ok(THEME_TAGS[t].length>0,'tema sem assuntos: '+t);
});

test('toda proposta recebe um tema real, mesmo sem nenhuma pista',()=>{
 const casos=[
  ['Dispõe sobre a assistência integral à saúde do paciente bariátrico.','Saúde'],
  ['Requer a inclusão na ordem do dia do Recurso ao PL que revoga a Lei de Alienação Parental.','Direitos e cidadania'],
  ['Altera a Lei nº 9.504, de 1997 (Lei das Eleições), para vedar propaganda eleitoral com bandeira de vento.','Política e governo'],
  ['Cria a Rota Turística Caminho Santa Rita de Cássia.','Cultura e esporte'],
  ['Aprova o ato que outorga autorização para executar serviço de radiodifusão comunitária.','Comunicação e tecnologia'],
 ];
 for(const [ementa,esperado] of casos)assert.equal(classifyTheme({ementa}),esperado,ementa);
 assert.equal(themeFor('Texto sem pista.',[],'PL').theme,'Política e governo');
 assert.equal(themeFor('Texto sem pista.',[],'MPV').theme,'Economia');
});

test('tema revisado pela redação prevalece; tema inválido da edição é ignorado',()=>{
 assert.equal(classifyTheme({ementa:'Cria a Rota Turística.'},{area:'Saúde'}),'Saúde');
 assert.equal(classifyTheme({ementa:'Cria a Rota Turística.'},{area:'Outros'}),'Cultura e esporte');
 assert.ok(THEMES.includes(normalizeProposal({id:1,numero:1,ano:2026,ementa:'Texto sem pista.'}).area));
});

test('situação não confirmada tem um único rótulo',()=>{
 assert.equal(STATUS.unknown.label,'Em atualização');
 assert.equal(normalizeStatus({}).label,'Em atualização');
 assert.equal(normalizeStatus(null).tone,'pending');
});

test('filtro de tema vai ao banco antes da paginação, junto com a tag',async()=>{
 const original=globalThis.fetch;let url='';
 globalThis.fetch=async u=>{url=String(u);return {ok:true,headers:{get:()=>'0-0/0'},json:async()=>[]}};
 try{
  await getDatabaseProposals({page:2,year:'Todos',type:'Todos',theme:'Saúde',tag:'SUS'});
  const q=new URL(url).searchParams;
  assert.equal(q.get('tags'),'cs.{SUS}');
  assert.match(q.get('and'),/^\(tags\.ov\.\{"SUS","Diabetes"/);
  assert.equal(q.get('offset'),'30');
  await assert.rejects(()=>getDatabaseProposals({theme:'Outros'}),/Tema inválido/);
 }finally{globalThis.fetch=original}
});
