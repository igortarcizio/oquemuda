import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {lawsInEmenta,actionOf,procedureNote,editorialChange,KNOWN_LAWS} from '../src/lib/changes.js';

globalThis.window??={};
window.OBM_EDITORIAL??={};
const {changeSection,detailPage}=await import('../src/ui/components.js');

const PL=(ementa,extra={})=>({id:1,siglaTipo:'PL',numero:1,ano:2026,ementa,tags:[],...extra});

test('leis citadas ganham nome popular e função',()=>{
  const l=lawsInEmenta('Altera a Lei nº 8.080, de 19 de setembro de 1990, para assegurar ajuda de custo a pacientes.');
  assert.deepEqual(l,[{ref:'Lei 8.080/1990',nome:'Lei Orgânica da Saúde',sobre:'organiza o SUS e as ações de saúde no país'}]);
  const cp=lawsInEmenta('Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), e a Lei Complementar nº 214, de 16 de janeiro de 2025, para tal.');
  assert.deepEqual(cp.map(x=>x.ref),['Decreto-Lei 2.848/1940','Lei Complementar 214/2025']);
  assert.equal(cp[0].nome,'Código Penal');
});

test('lei desconhecida usa o nome ou a descrição que a própria ementa traz',()=>{
  const a=lawsInEmenta('Dispõe sobre X e altera a Lei nº 13.895, de 30 de outubro de 2019, que institui a Política Nacional de Prevenção do Diabetes.');
  assert.equal(a[0].ref,'Lei 13.895/2019');assert.equal(a[0].nome,'');
  assert.match(a[0].sobre,/^institui a Política Nacional de Prevenção do Diabetes/);
  const b=lawsInEmenta('Altera a Lei nº 99.999, de 1º de janeiro de 2030 (Lei do Exemplo), para Y.');
  assert.equal(b[0].nome,'Lei do Exemplo');
  assert.deepEqual(lawsInEmenta('Requer urgência para o PL 1/2026, que altera a Lei nº 8.080, de 19 de setembro de 1990.'),[]);
  assert.equal(lawsInEmenta('Altera a Constituição Federal para tal.')[0].nome,'Constituição Federal');
});

test('dicionário de leis usa o formato "Lei N/AAAA"',()=>{
  for(const k of Object.keys(KNOWN_LAWS))assert.match(k,/^(Constituição Federal|(Lei Complementar|Decreto-Lei|Lei) [\d.]+\/\d{4})$/,k);
});

test('o que o texto faz, pelo verbo da ementa e pelo tipo',()=>{
  const k=(e,t='PL')=>actionOf({ementa:e,siglaTipo:t}).kind;
  assert.equal(k('Altera a Lei nº 9.394, de 20 de dezembro de 1996, para incluir X.'),'altera');
  assert.equal(k('Estabelece normas de proteção do passageiro e altera a Lei nº 7.565, de 19 de dezembro de 1986.'),'cria-altera');
  assert.equal(k('Institui o Programa Nacional de X.'),'cria');
  assert.equal(k('Institui o Dia Nacional do Forró.'),'simbolico');
  assert.equal(k('Reconhece a Festa X como manifestação da cultura nacional.'),'simbolico');
  assert.equal(k('Susta os efeitos da Portaria nº 1.','PDL'),'susta');
  assert.equal(k('Aprova o ato que renova a concessão outorgada à Rádio X para executar serviço de radiodifusão sonora.','PDL'),'outorga');
  assert.equal(k('Aprova o texto do Acordo entre o Brasil e o Japão sobre X.','PDL'),'acordo');
  assert.equal(k('Abre crédito extraordinário, em favor do Ministério X, no valor de R$ 1,00.','MPV'),'orcamento');
  assert.equal(k('Altera o art. 5º da Constituição Federal.','PEC'),'constituicao');
  assert.equal(k('Autoriza o Poder Executivo a criar a Universidade Federal de X.'),'autoriza');
  assert.equal(k('Requer urgência para o PL 1/2026.','REQ'),'procedimento');
});

test('nota de rito por tipo',()=>{
  assert.match(procedureNote({siglaTipo:'MPV'}),/já vale desde a publicação/);
  assert.match(procedureNote({siglaTipo:'PLP'}),/257 votos/);
  assert.equal(procedureNote({siglaTipo:'PL'}),'');
});

test('"como é hoje / como ficaria" só aparece depois de validado',()=>{
  const draft={hoje:'Hoje A.',proposta:'Fica B.',pontos:['p1','p2'],areas:['Saúde']};
  assert.equal(editorialChange(draft),null);
  const ok=editorialChange({...draft,validado:'2026-11-16',fonte_resumo:'texto integral do PL 1/2026'});
  assert.deepEqual(ok.pontos,['p1','p2']);assert.equal(ok.validado,'2026-11-16');
  assert.equal(editorialChange({validado:'2026-11-16'}),null,'sem conteúdo não mostra bloco vazio');
});

test('seção automática: texto faz, lei e áreas, sem bloco editorial',()=>{
  const p=PL('Altera a Lei nº 8.080, de 19 de setembro de 1990, para assegurar ajuda de custo a pacientes do SUS.',{tags:['SUS']});
  const html=changeSection(p,{},{reviewed:false,title:'Assegura ajuda de custo',area:'Saúde'});
  assert.match(html,/Muda uma lei que já existe/);
  assert.match(html,/Lei que muda/);assert.match(html,/Lei Orgânica da Saúde/);
  assert.match(html,/Áreas que podem ser afetadas/);assert.match(html,/Ver propostas sobre SUS|SUS/);
  assert.match(html,/Resumo automático/);
  assert.doesNotMatch(html,/Como é hoje/);
});

test('seção com editorial validado mostra comparação e pontos práticos',()=>{
  const p=PL('Altera a Lei nº 8.080, de 19 de setembro de 1990, para X.');
  const e={titulo:'Pergunta?',impacto:'Propõe X',publicos:['A'],hoje:'Hoje <b>A</b>.',proposta:'Fica B.',pontos:['Ponto 1'],areas:['Saúde pública'],validado:'2026-11-16',fonte_resumo:'texto integral do PL 1/2026'};
  const html=changeSection(p,e,{reviewed:true,title:'Pergunta?',area:'Saúde'});
  assert.match(html,/Como é hoje/);assert.match(html,/Como ficaria/);assert.match(html,/O que muda na prática/);
  assert.match(html,/Hoje &lt;b&gt;A&lt;\/b&gt;/,'escapa HTML do editorial');
  assert.match(html,/revisados em 16\/11\/2026/);
  assert.match(html,/<li>Saúde pública<\/li>/);
});

test('rito certo para medida provisória e decreto legislativo',()=>{
  const mpv=changeSection({...PL('Abre crédito extraordinário de R$ 1,00.'),siglaTipo:'MPV'},{}, {reviewed:false,title:'x',area:'Economia'});
  assert.match(mpv,/já vale desde a publicação/);assert.doesNotMatch(mpv,/sanção/);
  const pdl=changeSection({...PL('Susta a Portaria nº 1.'),siglaTipo:'PDL'},{}, {reviewed:false,title:'x',area:'Política e governo'});
  assert.doesNotMatch(pdl,/sanção/);
});

test('textos editoriais completos e validados',()=>{
  const sandbox={window:{}};
  vm.runInNewContext(readFileSync(new URL('../dados/editorial.js',import.meta.url),'utf8'),sandbox);
  const E=sandbox.window.OBM_EDITORIAL;
  const drafts=Object.entries(E).filter(([,v])=>v.hoje||v.proposta);
  assert.ok(drafts.length>=7);
  assert.ok(drafts.every(([,v])=>v.validado),'destaques aprovados têm data de validação');
  for(const [id,v] of drafts){
    assert.ok(v.hoje&&v.proposta&&v.pontos?.length&&v.areas?.length,id);
    assert.ok(v.pontos.length<=5,id);
    assert.match(v.fonte_resumo,/PL \d+\/\d{4}/,id);
  }
});

test('ficha usa a seção nova',()=>{
  const html=detailPage(PL('Altera a Lei nº 9.394, de 20 de dezembro de 1996, para incluir X.'),{loaded:true,status:{label:'Em atualização',tone:'pending'}},false);
  assert.match(html,/class="detail-section change-section"/);
  assert.match(html,/Lei de Diretrizes e Bases/);
});

import {plainSummary,plainText} from '../src/lib/changes.js';

test('resumo automático explica em outras palavras e com contexto',()=>{
  const s=plainSummary(PL('Altera a Lei nº 8.080, de 19 de setembro de 1990, para assegurar ajuda de custo ou transporte a pacientes do Sistema Único de Saúde que necessitem realizar tratamento em outro município.'));
  assert.equal(s,'A proposta mexe na Lei Orgânica da Saúde, que organiza o SUS e as ações de saúde no país, para garantir ajuda de custo ou transporte a pacientes do SUS que precisem fazer tratamento em outra cidade.');
});

test('resumo por tipo de proposta',()=>{
  assert.match(plainSummary({siglaTipo:'MPV',ementa:'Abre crédito extraordinário, em favor do Ministério de Minas e Energia, no valor de R$ 6.605.000.000,00, para os fins que especifica.'}),/^Libera R\$ 6,6 bilhões a mais no Orçamento federal para o Ministério de Minas e Energia\./);
  assert.match(plainSummary({siglaTipo:'PDL',ementa:'Aprova o ato que renova a permissão outorgada à Rádio Educadora Ltda. para executar serviço de radiodifusão sonora em frequência modulada, no Município de Nova Brasilândia, Estado de Mato Grosso.'}),/^Confirma a renovação da licença para Rádio Educadora Ltda operar uma rádio em Nova Brasilândia \(Mato Grosso\)\./);
  assert.match(plainSummary({siglaTipo:'PDL',ementa:'Susta os efeitos da Portaria INCRA nº 1.861, de 21 de maio de 2026, que cria o Projeto de Assentamento X.'}),/derrubar uma decisão do governo: a Portaria INCRA 1\.861\/2026, que cria/);
  assert.match(plainSummary({siglaTipo:'PDL',ementa:'Aprova o texto do Acordo de Cooperação Educacional entre o Governo da República Federativa do Brasil e o Governo da República do Azerbaijão, assinado em Brasília, em 1º de setembro de 2025.'}),/^Para valer no Brasil, o Acordo de Cooperação Educacional com Azerbaijão precisa ser aprovado pelo Congresso/);
  assert.match(plainSummary(PL('Institui o Dia Nacional do Forró.')),/^É uma proposta simbólica, que cria o Dia Nacional do Forró\. Não cria obrigações/);
  assert.match(plainSummary(PL('Dispõe sobre a incidência do Imposto sobre a Renda das Pessoas Físicas sobre lucros e dividendos distribuídos por pessoas jurídicas.')),/^É uma proposta de lei nova que trata da incidência do Imposto de Renda sobre lucros e dividendos distribuídos por empresas\.$/);
  assert.match(plainSummary(PL('Altera a Lei nº 9.394, de 20 de dezembro de 1996.')),/A ementa oficial não diz o que muda/);
});

test('resumo nunca é igual ao título',()=>{
  const p=PL('Institui o Dia Nacional do Forró.');
  const s=plainSummary(p,'É uma proposta simbólica, que cria o Dia Nacional do Forró. Não cria obrigações nem muda direitos.');
  assert.match(s,/^Em resumo:/);
});

test('linguagem simples: troca jargão e encurta datas de leis',()=>{
  assert.equal(plainText('no âmbito do Sistema Único de Saúde (SUS), mediante a adoção da Lei nº 8.080, de 19 de setembro de 1990'),'no SUS, por meio da adoção da Lei 8.080/1990');
});

test('resumo da redação substitui o automático quando validado',()=>{
  const p=PL('Altera a Lei nº 8.080, de 19 de setembro de 1990, para X.');
  const e={titulo:'P?',impacto:'I',publicos:['A'],resumo:'Resumo humano.',hoje:'H',proposta:'F',validado:'2026-11-16'};
  const html=changeSection(p,e,{reviewed:true,title:'P?',area:'Saúde'});
  assert.match(html,/<p class="change-lead">Resumo humano\.<\/p>/);
  const auto=changeSection(p,{...e,validado:''},{reviewed:true,title:'P?',area:'Saúde'});
  assert.match(auto,/change-lead">A proposta mexe na Lei Orgânica da Saúde/);
  assert.match(auto,/Resumo automático/);
});

test('resumo da IA aparece com aviso e nunca passa por texto da redação',async()=>{
  const p=PL('Altera a Lei nº 8.080, de 19 de setembro de 1990, para X.');
  const ai={resumo:'Resumo da IA.',hoje:'Hoje.',proposta:'Fica.',pontos:['P1','P2'],areas:['Saúde'],modelo:'claude-haiku-5-5',gerado_em:'2026-11-16T20:00:00Z'};
  const html=changeSection(p,{},{reviewed:false,title:'T',area:'Saúde',ai});
  assert.match(html,/Resumo gerado por IA · sem revisão humana/);
  assert.match(html,/change-lead">Resumo da IA\./);
  assert.match(html,/gerados por inteligência artificial a partir do texto integral/);
  assert.doesNotMatch(html,/escritos pela redação/);
  const human={titulo:'P?',impacto:'I',publicos:['A'],resumo:'Resumo humano.',hoje:'H',proposta:'F',validado:'2026-11-16'};
  const both=changeSection(p,human,{reviewed:true,title:'P?',area:'Saúde',ai});
  assert.match(both,/Resumo humano\./);assert.doesNotMatch(both,/gerado por IA/);
});

test('busca do resumo da IA usa só colunas públicas e trata ausência',async()=>{
  const {fetchAiSummary}=await import('../src/ui/ai-summary.js');
  let url='';
  const row=await fetchAiSummary(123,{fetchImpl:async u=>{url=u;return {ok:true,json:async()=>[{resumo:'R',pontos:[],areas:[]}]}}});
  assert.equal(row.resumo,'R');
  assert.match(url,/resumos_ia\?select=titulo%2Cresumo%2Choje%2Cproposta%2Cpontos%2Careas%2Cmodelo%2Cgerado_em&proposicao_id=eq\.123/);
  assert.equal(await fetchAiSummary(1,{fetchImpl:async()=>({ok:true,json:async()=>[]})}),null);
  assert.equal(await fetchAiSummary(1,{fetchImpl:async()=>({ok:false})}),null);
});

test('títulos curtos da IA: busca em lote e respeita título da redação',async()=>{
  const {fetchAiTitles,aiTitleFor}=await import('../src/ui/ai-summary.js');
  let url='';
  const cache=await fetchAiTitles([10,11,10],{fetchImpl:async u=>{url=u;return {ok:true,json:async()=>[{proposicao_id:10,titulo:'Proíbe X'}]}}});
  assert.match(url,/select=proposicao_id%2Ctitulo&proposicao_id=in.%2810%2C11%29&titulo=not.is.null/);
  assert.equal(cache.get(10),'Proíbe X');assert.equal(cache.get(11),'');
  assert.equal(aiTitleFor({id:999999999},{titulo:'Curto'}),'Curto');
  assert.equal(aiTitleFor({id:999999999},{titulo:'  '}),'');
});

test('título automático longo é encurtado sem perder o assunto',async()=>{
  const {shortenTitle}=await import('../src/lib/titles.js');
  assert.equal(shortenTitle('Reconhece a Romaria de Nossa Senhora da Penha, realizada no Município de João Pessoa, Estado da Paraíba, como manifestação da cultura nacional'),
    'Reconhece a Romaria de Nossa Senhora da Penha em João Pessoa (Paraíba), como manifestação da cultura nacional');
  assert.equal(shortenTitle('Inclui os serviços na redução de 60% (sessenta por cento) das alíquotas'),'Inclui os serviços na redução de 60% das alíquotas');
  const t=shortenTitle('Cria o Sistema Nacional de Acompanhamento de Operações de Financiamento Imobiliário (SNAFI) e estabelece mecanismos de transparência, rastreabilidade e fiscalização das operações');
  assert.equal(t,'Cria o Sistema Nacional de Acompanhamento de Operações de Financiamento Imobiliário (SNAFI)');
});
