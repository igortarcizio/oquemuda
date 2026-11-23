import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSenado,senadoEtapa,statusComSenado,senadoHTML,sentenceCase} from '../src/lib/senado.js';
import {detailPage} from '../src/ui/components.js';
import {normalizeStatus} from '../src/lib/status.js';
import {getDatabaseDetail} from '../src/data/api.js';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{}};

// Formato gravado por scripts/sync_senado.py (recortes reais de 23/11/2026).
const NA_CCJ={encontrado:true,id:9056488,codigoMateria:174389,identificacao:'PL 2391/2026',objetivo:'Revisora',
 url:'https://www25.senado.leg.br/web/atividade/materias/-/materia/174389',tramitando:true,
 situacao:{descricao:'AGUARDANDO DESIGNAÇÃO DO RELATOR',sigla:'AGDREL',data:'2026-06-08'},
 local:{sigla:'CCJ',nome:'Comissão de Constituição, Justiça e Cidadania'},
 relator:{nome:'Fulana de Tal',tratamento:'Senadora',partido:'MDB',uf:'PA',colegiado:'CCJ',colegiadoNome:'Comissão de Constituição, Justiça e Cidadania',desde:'2026-09-01'},
 deliberacao:null,norma:null,
 movimentacoes:[{data:'2026-06-08T08:07',descricao:'Matéria aguardando distribuição.',local:'CCJ',localNome:'Comissão de Constituição, Justiça e Cidadania'},
  {data:'2026-08-19T18:18',descricao:'Recebida a Emenda nº 2 <script>',local:'CCJ',localNome:'Comissão de Constituição, Justiça e Cidadania'}],
 consultado_em:'2026-11-23T18:00:00+00:00'};
const VIROU_LEI={encontrado:true,id:8947603,codigoMateria:171475,url:'https://www25.senado.leg.br/web/atividade/materias/-/materia/171475',tramitando:false,
 situacao:{descricao:'TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL',sigla:'TNJRVETO',data:'2026-09-04'},local:null,relator:null,
 deliberacao:{tipo:'Aprovada pelo Plenário',destino:'À sanção',data:'2026-08-11'},
 norma:{descricao:'Lei nº 15.500 de 04/09/2026',data:'2026-09-04',observacao:'Esta Lei entra em vigor 45 dias após a sua publicação oficial.'},
 movimentacoes:[],consultado_em:'2026-11-23T18:00:00+00:00'};
const NA_SANCAO={...VIROU_LEI,norma:null,situacao:{descricao:'REMETIDA À SANÇÃO',sigla:'REMSAN',data:'2026-11-20'}};
const P={id:1,siglaTipo:'PL',numero:2391,ano:2026,ementa:'Regulamenta o disposto no § 16 do art. 201 da Constituição Federal.',dataApresentacao:'2026-03-10'};
const AGUARDANDO_SENADO=normalizeStatus({codSituacao:926,descricaoSituacao:'Aguardando Apreciação pelo Senado Federal'});
const AGUARDANDO_SANCAO=normalizeStatus({codSituacao:1150,descricaoSituacao:'Aguardando Sanção'});

test('normaliza o dado gravado e recusa link fora do Senado',()=>{
 const s=normalizeSenado(NA_CCJ);
 assert.equal(s.tramitando,true);
 assert.equal(s.local.sigla,'CCJ');
 assert.equal(s.movimentacoes.length,2);
 assert.equal(normalizeSenado({...NA_CCJ,url:'javascript:alert(1)'}).url,'');
 assert.deepEqual(normalizeSenado({encontrado:false,consultado_em:'2026-11-23T10:00:00Z'}),{encontrado:false,consultadoEm:'2026-11-23T10:00:00Z'});
 assert.equal(normalizeSenado(null),null);
 assert.equal(normalizeSenado({encontrado:true}),null,'sem id do processo não vale');
});

test('etapa no Senado',()=>{
 assert.equal(senadoEtapa(normalizeSenado(NA_CCJ)),'senado');
 assert.equal(senadoEtapa(normalizeSenado(VIROU_LEI)),'lei');
 assert.equal(senadoEtapa(normalizeSenado(NA_SANCAO)),'sancao');
 assert.equal(senadoEtapa(normalizeSenado({...VIROU_LEI,norma:null,deliberacao:{tipo:'Aprovada com emendas',destino:'À Câmara dos Deputados',data:'2026-10-01'},situacao:{descricao:'REMETIDA À CÂMARA DOS DEPUTADOS'}})),'camara');
 assert.equal(senadoEtapa(normalizeSenado({...NA_CCJ,tramitando:false,situacao:{descricao:'ARQUIVADA AO FINAL DA LEGISLATURA'}})),'encerrada');
 assert.equal(senadoEtapa(normalizeSenado({encontrado:false})),'nao_registrada');
 assert.equal(senadoEtapa(null),null);
});

test('situação em maiúsculas vira frase comum',()=>{
 assert.equal(sentenceCase('AGUARDANDO DESIGNAÇÃO DO RELATOR'),'Aguardando designação do relator');
 assert.equal(sentenceCase('REMETIDA À CÂMARA DOS DEPUTADOS'),'Remetida à Câmara dos Deputados');
 assert.equal(sentenceCase('PRONTA PARA A PAUTA NO PLENÁRIO'),'Pronta para a pauta no Plenário');
});

test('virou lei no Senado corrige a situação que a Câmara ainda não atualizou',()=>{
 const s=normalizeSenado(VIROU_LEI);
 const st=statusComSenado(AGUARDANDO_SANCAO,s);
 assert.equal(st.tone,'law');
 assert.equal(st.detail,'Lei nº 15.500 de 04/09/2026');
 assert.equal(statusComSenado(AGUARDANDO_SENADO,normalizeSenado(NA_CCJ)),AGUARDANDO_SENADO,'sem lei, vale a Câmara');
});

test('bloco "No Senado": situação, comissão, relatoria, movimentações recolhidas e fonte',()=>{
 const html=senadoHTML(normalizeSenado(NA_CCJ));
 assert.match(html,/<dt>Situação<\/dt><dd>Aguardando designação do relator<span class="senado-when">desde 08\/06\/2026<\/span>/);
 assert.match(html,/<dt>Onde está<\/dt><dd>Comissão de Constituição, Justiça e Cidadania \(CCJ\)/);
 assert.match(html,/<dt>Relatoria<\/dt><dd>Senadora Fulana de Tal \(MDB-PA\)/);
 assert.match(html,/aria-controls="senadoPanel"[^>]*data-label-closed="Ver movimentações no Senado \(2\)"/);
 assert.match(html,/<div class="history-panel" id="senadoPanel" hidden>/);
 assert.ok(html.indexOf('19/08/2026')<html.indexOf('08/06/2026 08')||html.indexOf('Recebida a Emenda')<html.indexOf('Matéria aguardando'),'mais recente primeiro');
 assert.ok(!html.includes('<script>'),'texto do Senado é escapado');
 assert.match(html,/consultados em 23\/11\/2026\. <a href="https:\/\/www25\.senado\.leg\.br\/web\/atividade\/materias\/-\/materia\/174389"/);
 const lei=senadoHTML(normalizeSenado(VIROU_LEI));
 assert.match(lei,/<dt>Votação<\/dt><dd>Aprovada pelo Plenário em 11\/08\/2026<span class="senado-when">Destino: Sanção<\/span>/);
 assert.match(lei,/<dt>Virou<\/dt><dd>Lei nº 15\.500 de 04\/09\/2026/);
 assert.ok(!/Onde está|Relatoria|senadoPanel/.test(lei),'encerrada: sem comissão, relator nem lista vazia');
 assert.match(senadoHTML(normalizeSenado({encontrado:false,consultado_em:'2026-11-23T10:00:00Z'})),/ainda não aparece nos registros do Senado/);
 assert.equal(senadoHTML(null),'');
});

test('ficha: no Senado, a etapa atual abre as movimentações do Senado',()=>{
 const html=detailPage(P,{status:AGUARDANDO_SENADO,senado:normalizeSenado(NA_CCJ),loaded:true,
  tramitacoes:[{dataHora:'2026-05-20T10:00',sequencia:9,orgao:'PLEN',descricao:'Remessa ao Senado Federal'}]});
 assert.match(html,/<li class="done now" aria-current="step"><button type="button" class="timeline-step" data-history-toggle data-from-stage aria-expanded="false" aria-controls="senadoPanel"[^>]*>Senado<\/button>/);
 assert.match(html,/Ver movimentações na Câmara \(1\)/,'a lista da Câmara diz de qual Casa é');
 assert.match(html,/<dt>Onde está<\/dt><dd>Senado Federal<span class="type-desc">Comissão de Constituição, Justiça e Cidadania<\/span>/);
});

test('ficha: virou lei pelo Senado mostra "virou lei" mesmo com a Câmara atrasada',()=>{
 const html=detailPage({...P,numero:1881,ano:2025},{status:AGUARDANDO_SANCAO,senado:normalizeSenado(VIROU_LEI),loaded:true});
 assert.match(html,/<li class="done now" aria-current="step">Sanção ou veto<small>virou lei<\/small><\/li>/);
 assert.match(html,/Virou lei/);
});

test('ficha: aprovada no Senado e enviada à sanção',()=>{
 const html=detailPage(P,{status:AGUARDANDO_SENADO,senado:normalizeSenado(NA_SANCAO),loaded:true});
 assert.match(html,/<li class="done now" aria-current="step">Sanção ou veto<small>aguardando sanção<\/small><\/li>/);
});

test('ficha lê a coluna senado e, sem a migration, segue sem ela',async()=>{
 const urls=[];
 const row={id:1,sigla_tipo:'PL',numero:2391,ano:2026,ementa:'Ementa.',data_apresentacao:'2026-03-10',dados_oficiais:{},senado:NA_CCJ};
 const f=async url=>{const u=decodeURIComponent(String(url));urls.push(u);return {ok:true,status:200,json:async()=>[row]}};
 const d=await getDatabaseDetail(1,{fetchImpl:f});
 assert.match(urls[0],/,senado&/);
 assert.equal(d.senado.local.sigla,'CCJ');
 urls.length=0;
 const sem=async url=>{const u=decodeURIComponent(String(url));urls.push(u);return /senado/.test(u)?{ok:false,status:400}:{ok:true,status:200,json:async()=>[{...row,senado:undefined}]}};
 const d2=await getDatabaseDetail(1,{fetchImpl:sem});
 assert.equal(d2.senado,null);
});
