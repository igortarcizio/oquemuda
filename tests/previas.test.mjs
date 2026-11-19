import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const {previewContent,previewHTML,clip,generate,DESCRIPTION_LIMIT}=await import('../scripts/gerar_previas.mjs');

const p={id:999000001,siglaTipo:'PL',numero:5817,ano:2026,ementa:'Altera a Lei nº 8.078, de 11 de setembro de 1990 (Código de Defesa do Consumidor), para proibir cobrança de taxa de religação.'};
const meta=(html,prop)=>html.match(new RegExp('<meta (?:property|name)="'+prop+'" content="([^"]*)"'))?.[1];

test('corta o resumo por palavra inteira',()=>{
  assert.equal(clip('curto'),'curto');
  const long='palavra '.repeat(40);
  const out=clip(long);
  assert.ok(out.length<=DESCRIPTION_LIMIT+1);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('palavr…'),'não corta no meio da palavra');
  assert.equal(clip('a, b, c, d e f',6),'a, b…');
});

test('título e resumo: redação > IA > automático',()=>{
  const auto=previewContent(p);
  assert.equal(auto.title,'Proíbe cobrança de taxa de religação');
  assert.match(auto.description,/Código de Defesa do Consumidor/);

  const withAI=previewContent(p,{},{titulo:'Fim da taxa de religação de energia',resumo:'Resumo da IA.'});
  assert.equal(withAI.title,'Fim da taxa de religação de energia');
  assert.equal(withAI.description,'Resumo da IA.');

  const human={titulo:'A taxa de religação pode acabar?',impacto:'Síntese da redação.',publicos:['Consumidores']};
  const reviewed=previewContent(p,human,{titulo:'Título da IA',resumo:'Resumo da IA.'});
  assert.equal(reviewed.description,'Síntese da redação.');

  // Título revisado à mão vence o da IA (mesma regra de aiTitleFor na tela).
  const curated=previewContent({...p,id:2482140},{},{titulo:'Título da IA',resumo:'Resumo da IA.'});
  assert.equal(curated.title,'Define guarda compartilhada de animais após separação e divisão de despesas');
  assert.equal(curated.description,'Resumo da IA.');
});

test('página de prévia: tags og, redirecionamento e escape',()=>{
  const html=previewHTML({...p,ementa:'x'},{title:'Ação <b>"teste"</b> & \'aspas\'',description:'Resumo <script>alert(1)</script>'});
  assert.equal(meta(html,'og:title'),'Ação &lt;b&gt;&quot;teste&quot;&lt;/b&gt; &amp; &#39;aspas&#39;');
  assert.ok(!html.includes('<script>alert'),'resumo escapado');
  assert.equal(meta(html,'og:url'),'https://igortarcizio.github.io/oquemuda/p/999000001.html');
  assert.equal(meta(html,'og:image'),'https://igortarcizio.github.io/oquemuda/og.png');
  assert.equal(meta(html,'twitter:card'),'summary_large_image');
  assert.match(meta(html,'og:description'),/^PL 5817\/2026 · Resumo/);
  assert.match(html,/<script>location\.replace\("\.\.\/#\/tema\/999000001"\)<\/script>/);
  assert.match(html,/<a href="\.\.\/#\/tema\/999000001">/);
  assert.doesNotMatch(html,/http-equiv="refresh"/,'robôs de prévia não podem seguir para a home');
  assert.throws(()=>previewHTML({id:'1"><x'},{title:'t',description:'d'}));
});

test('prévia nunca mostra situação ou etapa',()=>{
  const html=previewHTML(p,previewContent(p));
  assert.doesNotMatch(html,/Em discussão|Apresentada|Pronta para pauta|Aprovada|Arquivada|situação/i);
});

test('gera uma página por proposta a partir do catálogo local',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'previas-'));
  try{
    const n=await generate(dir,{useDatabase:false,log:()=>{}});
    const files=readdirSync(dir);
    assert.ok(n>100,'catálogo tem propostas');
    assert.equal(files.length,n);
    assert.ok(files.every(f=>/^\d+\.html$/.test(f)));
    const sample=readFileSync(join(dir,files[0]),'utf8');
    assert.ok(meta(sample,'og:title'));
    assert.ok(meta(sample,'og:description'));
  }finally{rmSync(dir,{recursive:true,force:true})}
});
