import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proposalTypeInfo} from '../src/lib/proposal-types.js';

test('o filtro de tipo mostra a sigla e o nome por extenso de cada tipo',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const select=html.match(/<select id="typeSelect">([\s\S]*?)<\/select>/)[1];
  const options=[...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].filter(([,value])=>value!=='Todos');
  assert.equal(options.length,6);
  for(const [,value,label] of options){
    const info=proposalTypeInfo(value);
    assert.ok(info,'tipo sem descrição: '+value);
    assert.equal(label,value+' · '+info.title);
  }
});

test('a Ficha explica o tipo de proposta abaixo da identificação',async()=>{
  globalThis.window??={OBM_EDITORIAL:{}};
  const {detailPage}=await import('../src/ui/components.js');
  const html=detailPage({id:7,siglaTipo:'PLP',numero:306,ano:2026,ementa:'Dispõe sobre X.',tags:[]},{loaded:true,status:{label:'Apresentada',tone:'neutral'}},false);
  const info=proposalTypeInfo('PLP');
  assert.match(html,/<dt>Identificação<\/dt><dd>PLP 306\/2026<span class="type-name">Projeto de Lei Complementar<\/span>/);
  assert.ok(html.includes('<span class="type-desc">'+info.description+'</span>'));
  const unknown=detailPage({id:8,siglaTipo:'XYZ',numero:1,ano:2026,ementa:'Texto.',tags:[]},{loaded:true,status:{label:'Apresentada',tone:'neutral'}},false);
  assert.doesNotMatch(unknown,/type-name|type-desc/);
});
