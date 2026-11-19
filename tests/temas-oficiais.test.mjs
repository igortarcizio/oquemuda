import test from 'node:test';
import assert from 'node:assert/strict';
import {TEMA_OFICIAL,ESPECIFICIDADE,temasDoSite} from '../src/lib/temas-oficiais.js';
import {THEMES} from '../src/lib/themes.js';
import {parseCsv,temasPorProposta,planejar} from '../scripts/aplicar_temas.mjs';

test('tabela aprovada: 32 temas da Câmara cobrindo os 13 do site',()=>{
 assert.equal(Object.keys(TEMA_OFICIAL).length,32);
 assert.deepEqual([...new Set(Object.values(TEMA_OFICIAL))].sort(),[...THEMES].sort());
 assert.deepEqual([...ESPECIFICIDADE].sort(),[...THEMES].sort());
 assert.equal(TEMA_OFICIAL[52],'Trabalho');       // Previdência e Assistência Social
 assert.equal(TEMA_OFICIAL[39],'Cultura e esporte'); // Esporte e Lazer
 assert.equal(TEMA_OFICIAL[55],'Política e governo'); // Relações Internacionais e Comércio Exterior
 assert.equal(TEMA_OFICIAL[64],'Economia');       // Agricultura
 assert.equal(TEMA_OFICIAL[67],'Consumo');        // só o Código de Defesa do Consumidor
});

test('tema principal: mantém o calculado se a Câmara concorda; senão o mais específico',()=>{
 assert.deepEqual(temasDoSite([{cod:56},{cod:46}],'Educação'),{area:'Educação',areas:['Saúde','Educação']});
 assert.deepEqual(temasDoSite([{cod:67},{cod:40}],'Segurança'),{area:'Consumo',areas:['Consumo','Economia']});
 assert.deepEqual(temasDoSite([{cod:70},{cod:34},{cod:40}],'Saúde'),{area:'Economia',areas:['Economia','Política e governo']});
 assert.equal(temasDoSite([],'Saúde'),null,'sem tema oficial: provisório');
 assert.equal(temasDoSite([{cod:999}],'Saúde'),null,'código desconhecido não inventa tema');
});

// Formato real do arquivo proposicoesTemas-2025.csv (19/11/2026).
const CSV='﻿"uriProposicao";"siglaTipo";"numero";"ano";"codTema";"tema";"relevancia"\r\n'+
 '"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2481000";"PL";"498";"2025";"67";"Direito e Defesa do Consumidor";"0"\r\n'+
 '"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2481000";"PL";"498";"2025";"40";"Economia";"0"\r\n'+
 '"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2481000";"PL";"498";"2025";"40";"Economia";"0"\r\n'+
 '"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2481001";"PL";"499";"2025";"56";"Saúde";"1"\r\n';

test('lê o CSV da Câmara e agrupa por proposta sem repetir tema',()=>{
 const rows=parseCsv(CSV);
 assert.equal(rows.length,4);
 assert.equal(rows[0].tema,'Direito e Defesa do Consumidor');
 const m=temasPorProposta(rows);
 assert.deepEqual(m.get(2481000).map(t=>t.cod),[40,67]);
 assert.equal(m.get(2481001)[0].tema,'Saúde');
});

test('grava só o que mudou e nunca apaga tema de quem não está no arquivo',()=>{
 const temas=temasPorProposta(parseCsv(CSV));
 const banco=[
  {id:2481000,sigla_tipo:'PL',ementa:'Acrescenta o artigo 67-A à Lei nº 8.078, de 11 de setembro de 1990.',tags:[],area:null,areas:null,temas_oficiais:null},
  {id:2481001,sigla_tipo:'PL',ementa:'Dispõe sobre vacinação.',tags:['Vacinação'],area:'Saúde',areas:['Saúde'],temas_oficiais:[{cod:56,tema:'Saúde'}]},
  {id:2481002,sigla_tipo:'PL',ementa:'Proposta recém-apresentada.',tags:[],area:null,areas:null,temas_oficiais:null}
 ];
 const {updates,semTema}=planejar(banco,temas);
 assert.equal(semTema,1);
 assert.equal(updates.length,1,'a 2481001 já estava certa');
 assert.equal(updates[0].id,2481000);
 assert.deepEqual(updates[0].areas,['Consumo','Economia']);
 assert.equal(updates[0].area,'Consumo');
});

test('card e ficha usam o tema oficial e mostram a classificação da Câmara',async()=>{
 globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{}};
 const {normalizeProposal}=await import('../src/data/api.js');
 const {detailPage}=await import('../src/ui/components.js');
 const base={id:2481000,siglaTipo:'PL',numero:498,ano:2025,ementa:'Acrescenta o artigo 67-A à Lei nº 8.078, de 11 de setembro de 1990, que dispõe sobre a proteção do consumidor.',tags:['Consumidor'],dataApresentacao:'2025-02-10'};
 assert.equal(normalizeProposal({...base,areaOficial:'Economia'}).area,'Economia');
 assert.equal(normalizeProposal({...base,areaOficial:'Inventado'}).area,normalizeProposal(base).area,'tema fora da lista é ignorado');
 const p={...normalizeProposal({...base,areaOficial:'Consumo'}),temasOficiais:['Direito e Defesa do Consumidor','Economia']};
 const html=detailPage(p,{loaded:true});
 assert.match(html,/data-area="Consumo"/);
 assert.match(html,/Tema oficial na Câmara<\/dt><dd>Direito e Defesa do Consumidor; Economia/);
});
