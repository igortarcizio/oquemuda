import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeApensacao,apensacaoHTML,showsApensacao,jointListHTML} from '../src/lib/apensacao.js';
import {getDatabaseDetail,getJointProposals} from '../src/data/api.js';
import {detailPage} from '../src/ui/components.js';
import {normalizeStatus} from '../src/lib/status.js';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{}};

// Formato gravado por sync_supabase.py (cadeia real: PL 5/2025 → PL 254/2024 → raiz).
const RAW={direta:{id:2417912,sigla:'PL',numero:254,ano:2024,ementa:'Ementa do PL 254/2024',situacao:'Tramitando em Conjunto',codSituacao:925,orgao:'CCJC'},
 raiz:{id:2220112,sigla:'PL',numero:2338,ano:2019,ementa:'<b>Dispõe</b> sobre X',situacao:'Pronta para Pauta',codSituacao:924,orgao:'PLEN',dataHora:'2026-10-01T10:00'},
 cadeia:[2417912,2220112],consultado_em:'2026-11-19T19:00:00Z'};

test('cadeia: aponta a direta e quem conduz, escapando o texto',()=>{
 const a=normalizeApensacao(RAW);
 assert.equal(a.raiz.status.label,'Pronta para pauta');
 const html=apensacaoHTML(a);
 assert.match(html,/tramita junto com o <a href="#\/tema\/2417912">PL 254\/2024<\/a>/);
 assert.match(html,/O PL 254\/2024, por sua vez, está apensado ao <a href="#\/tema\/2220112">PL 2338\/2019<\/a>, que conduz a tramitação/);
 assert.match(html,/Plenário da Câmara \(PLEN\)<span class="joint-ementa">Última movimentação em 01\/10\/2026/);
 assert.ok(!html.includes('<b>Dispõe'));
});

test('apensada direto à principal e concordância com PEC',()=>{
 const pec={...RAW.raiz,id:5,sigla:'PEC',numero:45,ano:2019};
 const html=apensacaoHTML(normalizeApensacao({direta:pec,raiz:pec}));
 assert.match(html,/tramita junto com a <a href="#\/tema\/5">PEC 45\/2019<\/a>.<\/strong> É ela que conduz/);
});

test('dados ruins não viram caixa; não aparece em lei, aprovada ou encerrada',()=>{
 assert.equal(normalizeApensacao(null),null);
 assert.equal(normalizeApensacao({direta:{id:'x'}}),null);
 const a=normalizeApensacao(RAW);
 assert.ok(showsApensacao(a,normalizeStatus({codSituacao:925})));
 assert.ok(!showsApensacao(a,normalizeStatus({codSituacao:1140})));
 assert.ok(!showsApensacao(a,normalizeStatus({codSituacao:923})));
 assert.ok(!showsApensacao(null,normalizeStatus({codSituacao:925})));
});

test('ficha mostra a caixa e reserva lugar para a lista',()=>{
 const p={id:2481000,numero:5,ano:2025,siglaTipo:'PL',ementa:'Altera a Lei nº 8.080, de 19 de setembro de 1990.',dataApresentacao:'2025-02-03',tags:[]};
 const html=detailPage(p,{status:normalizeStatus({codSituacao:925}),apensacao:normalizeApensacao(RAW),loaded:true});
 assert.match(html,/class="joint-box"/);
 assert.match(html,/id="jointList"/);
});

test('lista de quem tramita junto e consulta ao banco',async()=>{
 const html=jointListHTML([{id:1,sigla_tipo:'PL',numero:5,ano:2025,ementa:'Altera X'},{id:'x',sigla_tipo:'REQ'}],12);
 assert.match(html,/Tramitam junto com esta \(12\)/);
 assert.match(html,/Mostrando 1 de 12/);
 assert.equal(jointListHTML([],0),'');
 let url='';
 const r=await getJointProposals(2220112,{fetchImpl:async u=>{url=decodeURIComponent(String(u));return {ok:true,headers:{get:()=> '0-0/12'},json:async()=>[{id:1}]}}});
 assert.match(url,/apensada_raiz_id=eq\.2220112/);
 assert.equal(r.total,12);
});

test('ficha: cai em degraus se faltar coluna de migration',async()=>{
 const urls=[];
 const row={id:1,sigla_tipo:'PL',numero:5,ano:2025,ementa:'Altera a Lei nº 8.080.',data_apresentacao:'2025-02-03',dados_oficiais:{},tramitacoes:[],texto_atual:null};
 const f=async url=>{const u=decodeURIComponent(String(url));urls.push(u);return /apensada_a/.test(u)?{ok:false,status:400}:{ok:true,status:200,json:async()=>[row]}};
 const d=await getDatabaseDetail(1,{fetchImpl:f});
 assert.equal(urls.length,3);
 assert.match(urls[2],/tramitacoes,texto_atual&/,'mantém o histórico quando só a apensação falta');
 assert.equal(d.apensacao,null);
});
