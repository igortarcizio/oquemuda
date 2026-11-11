import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanText,preserveSiglas,questionTitle} from '../src/lib/text.js';
import {normalizeStatus} from '../src/lib/status.js';
import {card,editorialFeature,skeleton,pagination} from '../src/ui/components.js';
import {editorialAllowed,selectEditorial,EDITORIAL_PRIORITY} from '../src/lib/editorial.js';
globalThis.window={OBM_EDITORIAL:{}};
const sample={id:2651275,numero:5788,ano:2026,siglaTipo:'PL',ementa:'Dispõe sobre o rastreamento precoce do diabetes mellitus tipo 1 no SUS.',area:'Saúde',dataApresentacao:'2026-11-06'};
test('limpa quebras, espaços e pontuação residual sem apagar siglas',()=>{
 assert.equal(cleanText(' SUS \n \r  CLT ... - '),'SUS CLT');
 assert.equal(preserveSiglas('saúde no sus e na clt'),'saúde no SUS e na CLT');
});
test('gera título interrogativo curto sem prometer aprovação',()=>{
 const title=questionTitle(sample);
 assert.ok(title.endsWith('?'));
 assert.ok(title.length<=82);
 assert.ok(!title.includes('...'));
});
test('mapeia quatro estados comprovados e mantém apresentação neutra',()=>{
 assert.equal(normalizeStatus({descricaoSituacao:'Aguardando Parecer do Relator'}).label,'Em discussão');
 assert.equal(normalizeStatus({descricaoSituacao:'Pronto para Ordem do Dia no Plenário'}).label,'Pronta para pauta');
 assert.equal(normalizeStatus({descricaoSituacao:'Remetido ao Senado Federal'}).label,'Aprovado na Câmara');
 assert.equal(normalizeStatus({descricaoSituacao:'Arquivada'}).label,'Arquivado / Rejeitado');
 assert.equal(normalizeStatus({descricaoTramitacao:'Apresentação de Proposição'}).tone,'neutral');
});
test('skeletons: seis cards animáveis',()=>{
 assert.equal((skeleton(6).match(/class="card skeleton"/g)||[]).length,6);
});
test('card: um único link para a ficha, sem emoji, sem Como é hoje, e salvamento acessível',()=>{
 const out=card({...sample,ementa:'<script>alert(1)</script>'},null,false);
 assert.ok(!out.includes('Como é hoje'));
 assert.equal((out.match(/href="#\/tema\/2651275"/g)||[]).length,1);
 assert.ok(!out.includes("<h4>O que muda</h4>"));
 assert.ok(!out.includes('se aprovada'));assert.ok(!out.includes('⚡'));assert.match(out,/aria-pressed="false"/);
 assert.ok(!out.includes('<script>'));
});
test('paginação inclui 1 a 5, última página e aria-current',()=>{
 const h=pagination({page:1,totalPages:177,hasNext:true});
 for(let n=1;n<=5;n++)assert.ok(h.includes('data-page="'+n+'"'));
 assert.ok(h.includes('data-page="177"'));assert.ok(h.includes('aria-current="page"'));
});

test('seção editorial aparece somente na página inicial sem filtros',()=>{
 const base={view:'explorar',page:1,query:'',topic:'Todos',party:'Todos',type:'Todos',year:'2026'};
 assert.equal(editorialAllowed(base,2026),true);
 assert.equal(editorialAllowed({...base,page:2},2026),false);
 assert.equal(editorialAllowed({...base,query:'saúde'},2026),false);
 assert.equal(editorialAllowed({...base,party:'PT'},2026),false);
 for(const type of ['PL','PLP','PEC','MPV','PDL','PRC'])assert.equal(editorialAllowed({...base,type},2026),false);
 assert.equal(editorialAllowed({...base,tag:'SUS',mode:'recent',year:'2025'},2026),false);
 for(const filters of [{tag:'SUS'},{mode:'recent'},{year:'2025'},{year:'Todos'},{topic:'Saúde'}])assert.equal(editorialAllowed({...base,...filters},2026),false);
 assert.equal(editorialAllowed({...base,view:'salvos'},2026),false);
});
test('destaques não repetem a listagem nem publicam material incompleto',()=>{
 const ids=EDITORIAL_PRIORITY.slice(0,5);
 const snapshot=ids.map((id,n)=>({id,numero:5700+n,ano:2026,siglaTipo:'PL',ementa:'Uma proposta editorial verificável.'}));
 const edits=Object.fromEntries(ids.map(id=>[String(id),{titulo:'O assunto pode mudar?',impacto:'Propõe regras objetivas sobre o assunto.',publicos:['Cidadãos'],area:'Saúde'}]));
 edits[String(ids[3])].publicos=[];
 const selected=selectEditorial(snapshot,edits,[{id:ids[0]}],{year:2026});
 assert.equal(selected.length,3);
 assert.ok(!selected.some(p=>p.id===ids[0]||p.id===ids[3]));
 assert.equal(new Set(selected.map(p=>p.id)).size,3);
});
test('card editorial tem informação completa e botão salvar acessível',()=>{
 window.OBM_EDITORIAL={2651275:{titulo:'Crianças podem ter exames preventivos?',impacto:'Propõe exames preventivos no SUS.',publicos:['Crianças'],area:'Saúde'}};
 const html=editorialFeature(sample,null,false);
 assert.match(html,/editorial-feature/);
 assert.match(html,/data-save="2651275"/);
 assert.match(html,/aria-pressed="false"/);
 assert.ok(!html.includes('Como é hoje'));
});
