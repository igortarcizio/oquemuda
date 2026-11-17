import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// localStorage mínimo para o módulo de votos.
const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};

const votes=await import('../src/data/votes.js');
const {summarize,applyVote,normalizeCounts,voterId,myVote,rememberVote,fetchVotes,castVote,voteErrorMessage,MIN_VOTES}=votes;
const {resultHTML,summaryText}=await import('../src/ui/reader-votes.js');

test('percentuais somam 100 e respeitam o mínimo de votos',()=>{
  const s=summarize({favor:1,neutro:1,contra:1});
  assert.equal(s.pct.favor+s.pct.neutro+s.pct.contra,100);
  assert.equal(s.total,3);assert.equal(s.enough,false);
  const t=summarize({favor:7,neutro:0,contra:3});
  assert.deepEqual(t.pct,{favor:70,neutro:0,contra:30});
  assert.equal(t.enough,true);
  assert.deepEqual(summarize({favor:0,neutro:0,contra:0}).pct,{favor:0,neutro:0,contra:0});
  assert.equal(MIN_VOTES,5);
});

test('troca de voto move a contagem sem ficar negativa',()=>{
  const c={favor:2,neutro:0,contra:1};
  assert.deepEqual(applyVote(c,null,1),{favor:3,neutro:0,contra:1});
  assert.deepEqual(applyVote(c,1,-1),{favor:1,neutro:0,contra:2});
  assert.deepEqual(applyVote(c,0,-1),{favor:2,neutro:0,contra:2});
  assert.deepEqual(c,{favor:2,neutro:0,contra:1},'não altera o objeto original');
});

test('normaliza a resposta da função do banco',()=>{
  assert.deepEqual(normalizeCounts([{a_favor:'4',neutro:1,contra:null}]),{favor:4,neutro:1,contra:0});
  assert.deepEqual(normalizeCounts([]),{favor:0,neutro:0,contra:0});
});

test('identificador do leitor é um UUID estável e o voto fica guardado no navegador',()=>{
  const a=voterId(),b=voterId();
  assert.match(a,/^[0-9a-f-]{36}$/);assert.equal(a,b);
  assert.equal(myVote(10),null);
  rememberVote(10,-1);assert.equal(myVote(10),-1);
  rememberVote(10,null);assert.equal(myVote(10),null);
});

test('chama as funções RPC com a chave pública e só os campos esperados',async()=>{
  const calls=[];
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>[{a_favor:3,neutro:1,contra:2}]}};
  assert.deepEqual(await fetchVotes('123'),{favor:3,neutro:1,contra:2});
  await castVote(123,1);
  assert.match(calls[0].url,/\/rest\/v1\/rpc\/contar_votos$/);
  assert.deepEqual(JSON.parse(calls[0].opts.body),{p_proposicao:123});
  assert.match(calls[1].url,/\/rpc\/registrar_voto$/);
  const body=JSON.parse(calls[1].opts.body);
  assert.deepEqual(Object.keys(body).sort(),['p_leitor','p_proposicao','p_voto']);
  assert.equal(body.p_leitor,voterId());
  assert.ok(calls.every(c=>c.opts.method==='POST'&&c.opts.headers.apikey.startsWith('sb_publishable_')));
  await assert.rejects(castVote(123,2),/Voto inválido/);
});

test('erros do banco viram mensagens claras',async()=>{
  globalThis.fetch=async()=>({ok:false,status:404,json:async()=>({code:'PGRST202',message:'Could not find the function'})});
  await assert.rejects(fetchVotes(1),e=>e.code==='PGRST202');
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch')};
  await assert.rejects(fetchVotes(1),e=>e.code==='network');
  assert.match(voteErrorMessage({code:'54000'}),/Muitos votos/);
  assert.match(voteErrorMessage({code:'P0002'}),/não está na nossa base/);
});

test('resultado só aparece depois de votar ou pedir, e não com poucos votos',()=>{
  assert.match(resultHTML({counts:{favor:9,neutro:0,contra:1},revealed:false},null),/Ver resultado sem votar/);
  assert.match(resultHTML({counts:{favor:2,neutro:0,contra:1},revealed:true},1),/Poucos votos até agora \(3 votos\)/);
  assert.match(resultHTML({counts:{favor:0,neutro:0,contra:0},revealed:true},null),/Ainda não há votos/);
  const html=resultHTML({counts:{favor:6,neutro:1,contra:3},revealed:true},-1);
  assert.match(html,/width:60%/);assert.match(html,/10 votos no total/);
  assert.match(html,/vote-contra mine/);assert.match(html,/seu voto/);
  assert.match(summaryText({favor:6,neutro:1,contra:3}),/a favor 60%, neutro 10%, contra 30%, em 10 votos/);
});

test('o termômetro fica na coluna da direita, logo abaixo da Ficha',async()=>{
  globalThis.window??={OBM_EDITORIAL:{}};
  const {detailPage}=await import('../src/ui/components.js');
  const html=detailPage({id:5,siglaTipo:'PL',numero:1,ano:2026,ementa:'Altera a Lei nº 1.',tags:[]},{loaded:true,status:{label:'Em atualização',tone:'pending'}},false);
  const sideAt=html.indexOf('class="detail-side"'),asideEnd=html.indexOf('</aside>'),votesAt=html.indexOf('id="readerVotes"'),relatedAt=html.indexOf('id="relatedProposals"');
  assert.ok(sideAt>html.indexOf('Em que etapa está?'));
  assert.ok(sideAt<asideEnd&&asideEnd<votesAt&&votesAt<relatedAt);
  assert.match(html,/id="readerVotes"[^>]*hidden/);
  const css=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(css,/styles\/reader-votes\.css/);
});

test('o SQL não abre a tabela para a chave pública',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261116_termometro_leitores.sql',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.votos_leitores from anon, authenticated/);
  assert.doesNotMatch(sql,/create policy/i);
  assert.match(sql,/grant execute on function public\.registrar_voto\(bigint, uuid, integer\) to anon/);
  assert.equal((sql.match(/security definer/g)||[]).length,2);
  assert.equal((sql.match(/set search_path = public/g)||[]).length,2);
});
