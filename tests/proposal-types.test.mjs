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
