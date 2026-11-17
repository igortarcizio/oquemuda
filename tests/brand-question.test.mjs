import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initBrandQuestion} from '../src/ui/brand-question.js';

function harness(reduced=false){
  const handlers={};
  const markHandlers={};
  const states=new Set();
  const mark={
    classList:{add:n=>states.add(n),remove:n=>states.delete(n)},
    addEventListener:(event,cb)=>{markHandlers[event]=cb},
    get offsetWidth(){return 12}
  };
  const root={
    querySelector:selector=>selector==='.brand-question'?mark:null,
    addEventListener:(event,cb)=>{handlers[event]=cb}
  };
  globalThis.window={matchMedia:()=>({matches:reduced})};
  initBrandQuestion(root);
  return {states,handlers,markHandlers};
}

test('passar o mouse e clicar reiniciam movimento da interrogação',()=>{
  const h=harness();
  h.markHandlers.pointerenter();
  assert.equal(h.states.has('is-curious'),true);
  h.handlers.click();
  assert.equal(h.states.has('is-curious'),true);
  h.markHandlers.animationend({animationName:'brand-question-trigger'});
  assert.equal(h.states.has('is-curious'),false);
});
test('respeita preferência de movimento reduzido',()=>{
  const h=harness(true);
  h.markHandlers.pointerenter();
  h.handlers.click();
  assert.equal(h.states.has('is-curious'),false);
});
test('marca mantém âncora navegável e CSS controla ciclo periódico',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles/brand-question.css',import.meta.url),'utf8');
  assert.match(html,/class="brand" href="#\/explorar"[^>]*>o que muda<span class="brand-question"/);
  assert.match(css,/animation:brand-question-curious 6s/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
