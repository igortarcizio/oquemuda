import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStatus,APPROVED_CODES,CLOSED_CODES,LAW_CODES,isLaw} from '../src/lib/status.js';
import {orgaoNome,orgaoRotulo} from '../src/lib/orgaos.js';
import {detailPage,stageIndex} from '../src/ui/components.js';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{}};

const s=(codSituacao,descricaoSituacao='')=>normalizeStatus({codSituacao,descricaoSituacao});

// Códigos e textos reais da tabela /referencias/proposicoes/codSituacao (19/11/2026).
test('código oficial decide a etiqueta antes do texto',()=>{
 assert.equal(s(1140,'Transformado em Norma Jurídica').label,'Virou lei');
 assert.equal(s(925,'Tramitando em Conjunto').label,'Tramita em conjunto');
 assert.equal(s(927,'Aguardando Apensação').label,'Tramita em conjunto');
 for(const [c,d] of [[1292,'Perdeu a Eficácia'],[1222,'Prejudicialidade'],[1285,'Tramitação Finalizada'],[950,'Retirado pelo(a) Autor(a)'],[937,'Vetado totalmente']]){
  const r=s(c,d);assert.equal(r.tone,'closed',d);assert.equal(r.detail,d);
 }
 assert.equal(s(1201,'Aguardando Despacho do Presidente da Câmara dos Deputados (Chancela)').label,'Apresentada');
 assert.equal(s(907,'Aguardando Designação de Relator(a)').label,'Em discussão');
 assert.equal(s(924,'Pronta para Pauta').label,'Pronta para pauta');
 assert.equal(s(926,'Aguardando Apreciação pelo Senado Federal').label,'Aprovado na Câmara');
 assert.equal(s(910,'Aguardando Encaminhamento').label,'Em discussão','PL 220/2026: aprovado só na comissão');
});

test('sem código: texto como plano B; sem nada: rótulo único',()=>{
 assert.equal(s(null,'').label,'Em atualização');
 assert.equal(s(undefined,'Transformado em Norma Jurídica').tone,'law');
 assert.equal(s(null,'Perdeu a Eficácia').tone,'closed');
 assert.equal(s(1161,'Outros').tone,'neutral','código genérico não vira "Em discussão"');
});

test('filtros do box usam a mesma tabela',()=>{
 assert.ok(APPROVED_CODES.includes(1140)&&APPROVED_CODES.includes(926));
 assert.ok(CLOSED_CODES.includes(1292)&&!CLOSED_CODES.includes(1140));
 assert.deepEqual(LAW_CODES,[1140]);
 assert.equal(new Set([...APPROVED_CODES,...CLOSED_CODES]).size,APPROVED_CODES.length+CLOSED_CODES.length);
});

test('nome dos órgãos, comissões especiais e setores internos',()=>{
 assert.equal(orgaoNome('CSAUDE'),'Comissão de Saúde');
 assert.equal(orgaoNome('PL308020'),'Comissão Especial do PL 3080/2020');
 assert.equal(orgaoNome('PL073325'),'Comissão Especial do PL 733/2025');
 assert.equal(orgaoNome('PLP15225'),'Comissão Especial do PLP 152/2025');
 assert.equal(orgaoNome('SECAP(SGM)'),'Secretaria-Geral da Mesa');
 assert.equal(orgaoNome('XYZ'),'');
 assert.equal(orgaoRotulo('XYZ'),'XYZ');
 assert.equal(orgaoRotulo('CCJC'),'Comissão de Constituição e Justiça e de Cidadania (CCJC)');
 assert.equal(orgaoRotulo(null),'');
});

test('ficha de proposta que virou lei não diz "proposta não é lei"',()=>{
 const status=s(1140,'Transformado em Norma Jurídica');
 assert.ok(isLaw(status));
 assert.equal(stageIndex(status),4);
 const p={id:1,numero:1,ano:2025,siglaTipo:'PL',ementa:'Altera a Lei nº 8.080, de 19 de setembro de 1990.',dataApresentacao:'2025-02-01',tags:[],virouLei:true};
 const html=detailPage(p,{status,stage:{siglaOrgao:'PLEN'},loaded:true});
 assert.match(html,/já foi transformada em lei/);
 assert.ok(!html.includes('Proposta não é lei: o texto ainda pode mudar'));
 assert.match(html,/virou lei<\/small>/);
 assert.match(html,/<dt>Último órgão<\/dt><dd>Plenário da Câmara \(PLEN\)/);
});
