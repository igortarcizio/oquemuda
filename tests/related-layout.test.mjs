import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('a seção de propostas relacionadas usa o mesmo contêiner page da ficha',()=>{
  const source=readFileSync(new URL('../src/ui/components.js',import.meta.url),'utf8');
  assert.ok(source.includes('</aside></div><div class="page"><section id="relatedProposals"'));
  assert.ok(source.includes('class="related-proposals" aria-labelledby="relatedHeading" hidden'));
});
