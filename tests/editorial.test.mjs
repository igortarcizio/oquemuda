import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanText,preserveSiglas,questionTitle} from '../src/lib/text.js';
import {normalizeStatus} from '../src/lib/status.js';
import {card,skeleton,pagination} from '../src/ui/components.js';
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
 assert.equal(normalizeStatus({descricaoSituacao:'Pronto para Ordem do Dia no Plenário'}).label,'Pronto para Votação');
 assert.equal(normalizeStatus({descricaoSituacao:'Remetido ao Senado Federal'}).label,'Aprovado na Câmara');
 assert.equal(normalizeStatus({descricaoSituacao:'Arquivada'}).label,'Arquivado / Rejeitado');
 assert.equal(normalizeStatus({descricaoTramitacao:'Apresentação de Proposição'}).tone,'neutral');
});
test('skeletons: seis cards animáveis',()=>{
 assert.equal((skeleton(6).match(/class="card skeleton"/g)||[]).length,6);
});
test('card contém apenas O que muda, sem emoji, se aprovada ou Como é hoje, e salvamento acessível',()=>{
 const out=card({...sample,ementa:'<script>alert(1)</script>'},null,false);
 assert.ok(!out.includes('Como é hoje'));assert.match(out,/<h4>O que muda<\/h4>/);
 assert.ok(!out.includes('se aprovada'));assert.ok(!out.includes('⚡'));assert.match(out,/aria-pressed="false"/);
 assert.ok(!out.includes('<script>'));
});
test('paginação inclui 1 a 5, última página e aria-current',()=>{
 const h=pagination({page:1,totalPages:177,hasNext:true});
 for(let n=1;n<=5;n++)assert.ok(h.includes('data-page="'+n+'"'));
 assert.ok(h.includes('data-page="177"'));assert.ok(h.includes('aria-current="page"'));
});
