import test from 'node:test';
import assert from 'node:assert/strict';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.window={OBM_EDITORIAL:{}};
const titles=await import('../src/lib/ai-titles.js');
const {card,editorialFeature}=await import('../src/ui/components.js');

const p={id:4242,siglaTipo:'PL',numero:3228,ano:2025,ementa:'Garante às pessoas com Transtorno do Espectro Autista (TEA) e outras neurodivergências o direito de escolher tecidos adaptados às vestimentas em instituições de ensino e ambientes de trabalho.',dataApresentacao:'2025-07-03',tags:[]};
const curto='Garante a autistas e neurodivergentes escolha de tecido do uniforme ou dispensa dele';

test('título curto guardado vale depois de recarregar a página',()=>{
 titles.rememberAiTitles([[4242,curto],[1,''],[2,'  ']]);
 titles.resetAiTitles(); // simula recarregar: a memória some, o navegador guarda
 assert.equal(titles.cachedAiTitle(4242),curto);
 assert.equal(titles.cachedAiTitle(1),'','título vazio não é guardado');
});

test('card e destaque grande já nascem com o título curto',()=>{
 assert.match(card(p,null,false),new RegExp('>'+curto+'</a></h3>'));
 assert.match(editorialFeature(p,null,false),new RegExp('>'+curto+'</a></h3>'));
});

test('título da redação continua com prioridade sobre o da IA',()=>{
 window.OBM_EDITORIAL={4242:{titulo:'Autistas podem escolher o tecido do uniforme?',impacto:'Síntese revisada.'}};
 try{assert.doesNotMatch(card(p,null,false),new RegExp(curto))}
 finally{window.OBM_EDITORIAL={}}
});

test('título guardado vence em 3 dias',()=>{
 store.clear();titles.resetAiTitles();
 titles.rememberAiTitles([[7,'Velho']],Date.now()-4*86_400_000);
 titles.resetAiTitles();
 assert.equal(titles.cachedAiTitle(7),'');
});
