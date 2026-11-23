import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{}};
const {normalizeVotacoes,votacoesHTML,semPlacar,principais,filterVotes}=await import('../src/lib/votacoes.js');
const {getDatabaseDetail}=await import('../src/data/api.js');

// Formato gravado por scripts/sync_votacoes.py (recorte do PLP 80/2026 e do PL 4921/2026).
const RAW=[
 {id:'2611992-28',data:'2026-08-12T19:13',orgao:'PLEN',descricao:'Aprovada a Redação Final assinada pelo relator.',aprovacao:1,tipo:'texto',nominal:false},
 {id:'2611992-24',data:'2026-08-12T19:11',orgao:'PLEN',descricao:'Aprovado o Substitutivo ao Projeto de Lei Complementar nº 80, de 2026. Sim: 327; Não: 26; Total: 353.',
  aprovacao:1,tipo:'texto',nominal:true,placar:{sim:2,nao:1,abstencao:0,obstrucao:0,art17:1,total:4},
  votos:[[3,'Ádila','PL','DF','Sim'],[2,'Ana','NOVO','DF','Não'],[4,'Hugo Motta','REPUBLICANOS','PB','Artigo 17'],[1,'Zeca','PT','RJ','Sim'],[9,'<b>x</b>','PT','RJ','Talvez']],
  orientacoes:[['PL','Sim'],['NOVO','Não'],['Minoria','Liberado']]},
 {id:'2643915-8',data:'2026-06-09T17:00',orgao:'PLEN',descricao:'Aprovado o Requerimento de Urgência. Sim: 320; Não: 67; Total: 388.',aprovacao:1,tipo:'urgencia',nominal:true,
  placar:{sim:320,nao:67,abstencao:1,obstrucao:0,art17:0,total:388}},
 {id:'x',descricao:'',tipo:'texto'},null
];

test('normaliza e descarta o que não serve',()=>{
 const v=normalizeVotacoes(RAW);
 assert.equal(v.length,3);
 assert.equal(v[1].votos.length,4,'voto desconhecido fica de fora');
 assert.deepEqual(v[1].votos[0],{id:3,nome:'Ádila',partido:'PL',uf:'DF',voto:'Sim'});
 assert.equal(v[0].aprovacao,true);
 assert.equal(normalizeVotacoes(null),null);
 assert.deepEqual(normalizeVotacoes([]),[]);
 assert.deepEqual(principais(v).map(x=>x.id),['2611992-24']);
});

test('tira o placar do fim da descrição',()=>{
 assert.equal(semPlacar('Aprovado o Substitutivo. Sim: 327; Não: 26; Total: 353.'),'Aprovado o Substitutivo.');
 assert.equal(semPlacar('Resultado. Sim: 182; Não: 182; Abstenção: 2; Total: 366.'),'Resultado. Sim: 182; Não: 182; Abstenção: 2; Total: 366.','sem nada além do placar, mantém');
});

test('ficha mostra quem votou a favor e contra na nominal do texto',()=>{
 const html=votacoesHTML(normalizeVotacoes(RAW));
 assert.match(html,/<h2 id="votacoesTitle">Como votaram na Câmara<\/h2>/);
 assert.match(html,/<strong>2<\/strong> a favor<\/span><span><strong>1<\/strong> contra/);
 assert.match(html,/Votaram a favor \(<span data-vote-count>2<\/span>\)/);
 assert.match(html,/Votaram contra \(<span data-vote-count>1<\/span>\)/);
 assert.match(html,/href="https:\/\/www.camara.leg.br\/deputados\/2"[^>]*>Ana<span class="sr-only">/);
 assert.match(html,/Hugo Motta.*não votou \(presidia a sessão\)/);
 assert.match(html,/<li><span>Minoria<\/span> liberou a bancada<\/li>/);
 assert.ok(!html.includes('<b>x</b>'));
 assert.match(html,/Outras votações \(2\)/);
 assert.match(html,/Pedido de urgência: não decidiu o conteúdo da proposta/);
 assert.match(html,/<strong>320<\/strong> a favor/);
 assert.ok(html.indexOf('Ádila')<html.indexOf('Zeca'),'ordem alfabética');
});

test('só simbólicas: avisa que não há voto por deputado',()=>{
 const html=votacoesHTML(normalizeVotacoes([RAW[0]]));
 assert.match(html,/não registrou voto por deputado/);
 assert.match(html,/Votação simbólica/);
 assert.ok(!html.includes('Outras votações'));
 assert.equal(votacoesHTML([]),'');
 assert.equal(votacoesHTML(null),'');
});

test('filtro por estado e partido',()=>{
 // DOM mínimo: só o que filterVotes usa.
 const li=(uf,partido)=>({dataset:{uf,partido},hidden:false});
 const sim=[li('DF','PL'),li('RJ','PT')],nao=[li('DF','NOVO')];
 const grupo=(titulo,items)=>{const count={textContent:String(items.length)},empty={hidden:true};
  return {items,count,empty,querySelectorAll:()=>items,querySelector:s=>s==='[data-vote-count]'?count:s==='[data-vote-empty]'?empty:{textContent:titulo+' ('+items.length+')'}}};
 const g1=grupo('Votaram a favor',sim),g2=grupo('Votaram contra',nao),filtros={uf:{value:'RJ'},partido:{value:''}},status={textContent:''};
 const box={querySelector:s=>s.includes('"uf"')?filtros.uf:s.includes('"partido"')?filtros.partido:s==='[data-vote-status]'?status:null,querySelectorAll:()=>[g1,g2]};
 const msg=filterVotes(box);
 assert.deepEqual(sim.map(x=>x.hidden),[true,false]);
 assert.equal(nao[0].hidden,true);
 assert.equal(g2.count.textContent,0);
 assert.equal(g2.empty.hidden,false);
 assert.equal(msg,'Filtrado: RJ. Votaram a favor: 1; Votaram contra: 0.');
});

test('ficha lê a coluna votacoes e, sem a migration, segue sem ela',async()=>{
 const urls=[];
 const row={id:1,sigla_tipo:'PLP',numero:80,ano:2026,ementa:'Ementa.',data_apresentacao:'2026-03-10',dados_oficiais:{},votacoes:RAW};
 const sem=async url=>{const u=decodeURIComponent(String(url));urls.push(u);return /votacoes/.test(u)?{ok:false,status:400}:{ok:true,status:200,json:async()=>[{...row,votacoes:undefined}]}};
 const d=await getDatabaseDetail(1,{fetchImpl:sem});
 assert.match(urls[0],/,senado,votacoes&/);
 assert.equal(urls.length,2);
 assert.equal(d.votacoes,null);
});
