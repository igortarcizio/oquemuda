import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detailPage} from '../src/ui/components.js';

test('a seção de propostas relacionadas usa o mesmo contêiner page da ficha',()=>{
  const p={id:123,numero:1,ano:2026,siglaTipo:'PL',ementa:'Institui medidas de proteção ao consumidor.',dataApresentacao:'2026-10-10',tags:['Consumidor']};
  const html=detailPage(p,{loaded:true,status:{tone:'pending',label:'Em atualização',detail:'Em atualização'}},false);
  assert.match(html,/<\/aside><\/div><div class="page"><section id="relatedProposals"/);
  assert.match(html, /class="related-proposals" aria-labelledby="relatedHeading" hidden/);
});
