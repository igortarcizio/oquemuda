import test from 'node:test';
import assert from 'node:assert/strict';
import {conjugate,descriptiveTitle,amendedLaws,displayTitle,isReviewed} from '../src/lib/titles.js';
import {card,detailPage,stageIndex} from '../src/ui/components.js';
globalThis.window={OBM_EDITORIAL:{}};

test('conjuga o verbo da ementa na 3ª pessoa',()=>{
 for(const [inf,pres] of [['estabelecer','Estabelece'],['vedar','Veda'],['reduzir','Reduz'],['instituir','Institui'],['dispor','Dispõe'],['proibir','Proíbe'],['custear','Custeia'],['permitir','Permite']])
  assert.equal(conjugate(inf),pres);
 assert.equal(conjugate('lei'),null);
});

test('título descritivo diz o que o texto faz, sem pergunta e sem o número da lei',()=>{
 assert.equal(descriptiveTitle('Altera a Lei Complementar nº 123, de 14 de dezembro de 2006, para reduzir as alíquotas do Simples Nacional, instituir carência tributária para empresas nascentes, simplificar obrigações acessórias, e dá outras providências.'),
  'Reduz as alíquotas do Simples Nacional, institui carência tributária para empresas nascentes, simplifica obrigações acessórias');
 assert.equal(descriptiveTitle('Dispõe sobre a assistência integral à saúde do paciente bariátrico.'),'Trata da assistência integral à saúde do paciente bariátrico');
 assert.match(descriptiveTitle('Requer a inclusão na ordem do dia do Recurso nº 1/2026.'),/^Pedido de tramitação: /);
 assert.equal(descriptiveTitle('Aprova o ato que outorga autorização à Associação X para executar serviço de radiodifusão comunitária na cidade de Pirenópolis, Estado de Goiás.'),'Autoriza serviço de rádio em Pirenópolis (Goiás)');
 assert.ok(!descriptiveTitle('Altera a Lei nº 1, de 1 de janeiro de 2000, para criar o programa X.').endsWith('?'));
 assert.equal(descriptiveTitle(''),'Proposta sem ementa informada');
});

test('linha "Altera:" usa o nome popular da lei quando a ementa traz',()=>{
 assert.equal(amendedLaws('Altera a Lei nº 9.504, de 30 de setembro de 1997 (Lei das Eleições), para vedar bandeiras.'),'Lei das Eleições');
 assert.equal(amendedLaws('Altera a Lei nº 14.133, de 1º de abril de 2021, para exigir planejamento.'),'Lei 14.133/2021');
 assert.equal(amendedLaws('Institui a Política Nacional de Galerias.'),'');
 assert.equal(amendedLaws('Requer a alteração da Lei nº 1, de 1 de janeiro de 2000.'),'');
});

test('título descritivo em todos os cards; selo preserva revisão editorial',()=>{
 const p={id:7,numero:7,ano:2026,siglaTipo:'PL',ementa:'Altera a Lei nº 9.503, de 23 de setembro de 1997 (Código de Trânsito Brasileiro), para exigir sinalização de radares.',dataApresentacao:'2026-11-10'};
 const ed={titulo:'Radares vão precisar de placa?',impacto:'Propõe sinalização obrigatória antes de radares.',publicos:['Motoristas']};
 assert.equal(isReviewed(ed),true);assert.equal(isReviewed({titulo:'Sem pergunta'}),false);
 assert.equal(displayTitle(p,ed),'Exige sinalização de radares');
 assert.equal(displayTitle(p,{}),'Exige sinalização de radares');
 const auto=card(p,null,false);
 assert.match(auto,/class="card civic-card auto"/);assert.match(auto,/Altera:<\/b> Código de Trânsito Brasileiro/);assert.ok(!auto.includes('Explicado pela redação'));
 window.OBM_EDITORIAL={7:ed};
 const rev=card(p,null,false);
 assert.match(rev,/civic-card reviewed/);assert.match(rev,/Explicado pela redação/);assert.match(rev,/Exige sinalização de radares/);
 const ficha=detailPage(p,{loaded:true,status:{label:'Em discussão',tone:'discussion'}});
 assert.match(ficha,/Quem pode ser afetado/);assert.match(ficha,/aria-current="step"/);
 window.OBM_EDITORIAL={};
});

test('linha do tempo só marca etapa confirmada',()=>{
 assert.equal(stageIndex({label:'Apresentada',tone:'neutral'}),0);
 assert.equal(stageIndex({label:'Em discussão',tone:'discussion'}),1);
 assert.equal(stageIndex({label:'Pronta para pauta',tone:'voting'}),2);
 assert.equal(stageIndex({label:'Aprovado na Câmara',tone:'approved'}),3);
 assert.equal(stageIndex({label:'Em atualização',tone:'pending'}),null);
 assert.match(detailPage({id:1,numero:1,ano:2026,siglaTipo:'PL',ementa:'Texto.'},{loaded:true,status:{label:'Arquivado / Rejeitado',tone:'closed',detail:'Arquivada'}}),/tramitação foi encerrada/);
});

test('títulos dos exemplos são completos, curtos e sem reticências',()=>{
 for(const ementa of ['Aumenta a pena do estelionato praticado com uso de inteligência artificial ou de conteúdo falso.', 'Qualifica o crime de fraude em certame de interesse público praticado com uso de dispositivo eletrônico ou de ferramenta de comunicação.']){
 const title=displayTitle({ementa});assert.ok(title.length<=82);assert.doesNotMatch(title,/[?…]|\\.\\.\\./);assert.match(title,/Projeto/);
 }
});
