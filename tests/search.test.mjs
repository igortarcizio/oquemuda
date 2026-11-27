import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearch,refLabel,matchesToken} from '../src/lib/search.js';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{},OBM_DATA:{items:[
 {id:1,siglaTipo:'PL',numero:4999,ano:2026,ementa:'Aumenta cotas para candidaturas femininas.',dataApresentacao:'2026-08-11'},
 {id:2,siglaTipo:'PL',numero:3999,ano:2026,ementa:'Obriga cursos de segurança pública a incluir direitos humanos.',dataApresentacao:'2026-07-17'},
 {id:3,siglaTipo:'PEC',numero:12,ano:2026,ementa:'Altera a Constituição para tratar da saúde.',dataApresentacao:'2026-03-01'},
 {id:4,siglaTipo:'PL',numero:50,ano:2026,ementa:'Dispõe sobre aplicativos de saúde.',dataApresentacao:'2026-03-02'}
]}};
const {getDatabaseProposals,getProposals,fromSnapshot}=await import('../src/data/api.js');
const {cardDate}=await import('../src/ui/components.js');

test('lê referências em vários formatos',()=>{
 const ref=q=>parseSearch(q).ref;
 assert.deepEqual(ref('PL 999/2026'),{sigla:'PL',numero:999,ano:2026});
 assert.deepEqual(ref('pl999/26'),{sigla:'PL',numero:999,ano:2026});
 assert.deepEqual(ref('PL nº 999/2026'),{sigla:'PL',numero:999,ano:2026});
 assert.deepEqual(ref('projeto de lei 999 de 2026'),{sigla:'PL',numero:999,ano:2026});
 assert.deepEqual(ref('Proposta de Emenda à Constituição 45/2019'),{sigla:'PEC',numero:45,ano:2019});
 assert.deepEqual(ref('MP 1303/2025'),{sigla:'MPV',numero:1303,ano:2025});
 assert.deepEqual(ref('999/2026'),{sigla:null,numero:999,ano:2026});
 assert.deepEqual(ref('PL 999'),{sigla:'PL',numero:999,ano:null});
 assert.equal(ref('aplicativos de entrega'),null);
 assert.equal(ref('2026'),null);
 assert.equal(refLabel(ref('pec 45/19')),'PEC 45/2019');
});

test('sigla solta vira filtro de tipo, não pedaço de palavra',()=>{
 assert.deepEqual(parseSearch('PEC saúde'),{ref:null,sigla:'PEC',tokens:['saude'],exclude:[],query:'saude'});
 assert.deepEqual(parseSearch('pl aplicativos').tokens,['aplicativos']);
});

test('número casa como palavra inteira',()=>{
 assert.ok(!matchesToken('pl 4999/2026 aumenta cotas','999/2026'));
 assert.ok(matchesToken('pl 999/2026 aumenta cotas','999/2026'));
 assert.ok(matchesToken('aplicativos de saude','saude'));
});

test('banco: busca pelo número e ignora filtros e exclusões da lista',async()=>{
 const prev=globalThis.fetch;let url='';
 globalThis.fetch=async u=>{url=decodeURIComponent(String(u));return {ok:true,headers:{get:()=> '0-0/1'},json:async()=>[]}};
 try{await getDatabaseProposals({keywords:'PL 999/2026',year:'2025',type:'PEC',theme:'Saúde',excludeIds:[2607422]})}
 finally{globalThis.fetch=prev}
 assert.match(url,/numero=eq\.999/);
 assert.match(url,/ano=eq\.2026/);
 assert.match(url,/sigla_tipo=eq\.PL/);
 assert.ok(!/ementa_busca/.test(url),'não procura o número na ementa');
 assert.ok(!/ano=eq\.2025|sigla_tipo=eq\.PEC|not\.in|&tags=|ov\./.test(url),'referência vale sozinha');
});

test('banco: "PEC saúde" filtra tipo e procura só a palavra',async()=>{
 const prev=globalThis.fetch;let url='';
 globalThis.fetch=async u=>{url=decodeURIComponent(String(u));return {ok:true,headers:{get:()=> '0-0/0'},json:async()=>[]}};
 try{await getDatabaseProposals({keywords:'PEC saúde',year:'Todos',type:'Todos'})}
 finally{globalThis.fetch=prev}
 assert.match(url,/sigla_tipo=eq\.PEC/);
 assert.match(url,/[?&]q=saude(&|$)/);
 assert.ok(!/q=pec|ilike\.\*pec\*/.test(url));
});

test('Câmara ao vivo: referência vira numero/ano/siglaTipo',async()=>{
 const prev=globalThis.fetch;let url='';
 globalThis.fetch=async u=>{url=decodeURIComponent(String(u));return {ok:true,status:200,headers:{get:()=>null},json:async()=>({dados:[],links:[]})}};
 try{await getProposals({keywords:'PL 999/2026',year:'2025',type:'Todos'})}
 finally{globalThis.fetch=prev}
 assert.match(url,/numero=999/);
 assert.match(url,/ano=2026/);
 assert.match(url,/siglaTipo=PL/);
 assert.ok(!/keywords=/.test(url));
});

test('cópia local: "PL 999/2026" não devolve PL 4999 nem PL 3999 (caso do print)',()=>{
 const r=fromSnapshot({keywords:'PL 999/2026',year:'Todos',type:'Todos'});
 assert.deepEqual(r.items.map(p=>p.id),[]);
 assert.deepEqual(fromSnapshot({keywords:'PL 4999/2026',year:'Todos',type:'Todos'}).items.map(p=>p.id),[1]);
 assert.deepEqual(fromSnapshot({keywords:'PEC saúde',year:'Todos',type:'Todos'}).items.map(p=>p.id),[3]);
});

test('texto da busca: aspas, exclusão e número de lei',()=>{
 assert.deepEqual(parseSearch('violência -doméstica'),{ref:null,sigla:null,tokens:['violencia'],exclude:['domestica'],query:'violencia -domestica'});
 assert.equal(parseSearch('"violência doméstica" mulher').query,'"violencia domestica" mulher');
 assert.deepEqual(parseSearch('lei 8.080').tokens,['lei','8080']);
 assert.equal(parseSearch('Lei nº 14.172').query,'lei n 14172');
 assert.equal(parseSearch('de da').query,'','só palavras vazias não viram busca');
 assert.equal(parseSearch('PL 999/2026').query,'');
});

test('palavra inteira com plural simples (cópia local)',()=>{
 const h='altera a lei no 8.080 para tratar de aplicativos, leite e farmaceuticos do pre-sal';
 assert.ok(matchesToken(h,'lei'));
 assert.ok(!matchesToken('proibe a venda de leite cru','lei'),'"lei" não encontra "leite"');
 assert.ok(!matchesToken(h,'arma'),'"arma" não encontra "farmacêuticos"');
 assert.ok(matchesToken(h,'8080'));
 assert.ok(matchesToken(h,'aplicativo')&&matchesToken('dispoe sobre aplicativo','aplicativos'));
 assert.ok(matchesToken(h,'pre-sal'));
 assert.ok(matchesToken('acoes judiciais','acao')&&matchesToken('acao judicial','acoes'));
});

test('cópia local: "lei" não traz leite e "-palavra" exclui',()=>{
 window.OBM_DATA.items=[...window.OBM_DATA.items,{id:5,siglaTipo:'PL',numero:51,ano:2026,ementa:'Proíbe a venda de leite cru.',dataApresentacao:'2026-03-03'}];
 assert.deepEqual(fromSnapshot({keywords:'lei',year:'Todos',type:'Todos'}).items.map(p=>p.id),[]);
 assert.deepEqual(fromSnapshot({keywords:'leite',year:'Todos',type:'Todos'}).items.map(p=>p.id),[5]);
 assert.deepEqual(fromSnapshot({keywords:'saúde -aplicativos',year:'Todos',type:'Todos'}).items.map(p=>p.id),[3]);
 assert.deepEqual(fromSnapshot({keywords:'aplicativo',year:'Todos',type:'Todos'}).items.map(p=>p.id),[4]);
});

test('banco: ordenar por relevância só com palavras buscadas',async()=>{
 const prev=globalThis.fetch;const urls=[];
 globalThis.fetch=async u=>{urls.push(decodeURIComponent(String(u)));return {ok:true,status:200,headers:{get:()=> '0-0/0'},json:async()=>[]}};
 try{
  await getDatabaseProposals({keywords:'aposentadoria',year:'Todos',type:'Todos',sort:'relevancia'});
  await getDatabaseProposals({keywords:'aposentadoria',year:'Todos',type:'Todos'});
  await getDatabaseProposals({keywords:'',year:'Todos',type:'Todos',sort:'relevancia'});
 }finally{globalThis.fetch=prev}
 assert.match(urls[0],/order=relevancia\.desc,data_apresentacao\.desc,id\.desc/);
 assert.match(urls[0],/select=[^&]*,area,areas,partidos,relevancia(&|$)/,'filtros e ordem precisam das colunas no select');
 assert.match(urls[1],/order=data_apresentacao\.desc,id\.desc/);
 assert.ok(/\/rest\/v1\/proposicoes\?/.test(urls[2])&&!/relevancia/.test(urls[2]),'sem busca, lista normal por data');
});

test('banco: falha pontual da busca nova usa a antiga só nesta consulta',async()=>{
 const prev=globalThis.fetch;const urls=[];let falhar=true;
 globalThis.fetch=async u=>{const s=decodeURIComponent(String(u));urls.push(s);
  if(/\/rpc\//.test(s)&&falhar){falhar=false;return {ok:false,status:500,headers:{get:()=>null},json:async()=>({})}}
  return {ok:true,status:200,headers:{get:()=> '0-0/0'},json:async()=>[]}};
 try{
  await getDatabaseProposals({keywords:'saúde',year:'Todos',type:'Todos'});
  await getDatabaseProposals({keywords:'saúde',year:'Todos',type:'Todos'});
 }finally{globalThis.fetch=prev}
 assert.equal(urls.length,3);
 assert.match(urls[1],/ementa_busca\.ilike\.\*saude\*/);
 assert.match(urls[2],/\/rpc\/buscar_proposicoes/,'a próxima busca volta a usar a função');
});

// Por último: a falta da função no banco desliga a busca nova pelo resto da sessão.
test('banco sem a função de texto completo: volta ao ilike, com exclusão',async()=>{
 const prev=globalThis.fetch;const urls=[];
 globalThis.fetch=async u=>{const s=decodeURIComponent(String(u));urls.push(s);
  return /\/rpc\//.test(s)?{ok:false,status:404,headers:{get:()=>null},json:async()=>({})}:{ok:true,status:200,headers:{get:()=> '0-0/0'},json:async()=>[]}};
 try{await getDatabaseProposals({keywords:'saúde -aplicativos',year:'Todos',type:'Todos',sort:'relevancia'})}
 finally{globalThis.fetch=prev}
 assert.equal(urls.length,2);
 assert.match(urls[0],/\/rpc\/buscar_proposicoes/);
 assert.match(urls[1],/\/rest\/v1\/proposicoes\?/);
 assert.match(urls[1],/ementa_busca\.ilike\.\*saude\*/);
 assert.match(urls[1],/ementa_busca\.not\.ilike\.\*aplicativos\*/);
 assert.ok(!/relevancia/.test(urls[1]));
});

test('banco: ordem por mudança de etapa e plano B pela apresentação',async()=>{
 const prev=globalThis.fetch;const urls=[];let semColuna=false;
 globalThis.fetch=async u=>{const s=decodeURIComponent(String(u));urls.push(s);
  if(semColuna&&/situacao_desde/.test(s))return {ok:false,status:400,headers:{get:()=>null},json:async()=>({})};
  const row={id:7,sigla_tipo:'PL',numero:1,ano:2025,ementa:'Altera a lei de proteção aos consumidores.',data_apresentacao:'2025-12-08',situacao_codigo:924,dados_oficiais:{statusProposicao:{dataHora:'2026-11-26T16:41:15'}}};
  if(/situacao_desde/.test(s.split('&order=')[0]))row.situacao_desde='2026-11-26T19:41:15+00:00';
  return {ok:true,status:200,headers:{get:()=> '0-0/1'},json:async()=>[row]}};
 try{
  const r=await getDatabaseProposals({year:'Todos',type:'Todos',sort:'etapa'});
  assert.match(urls[0],/select=[^&]*situacao_desde/);
  assert.match(urls[0],/order=situacao_desde\.desc\.nullslast,data_apresentacao\.desc,id\.desc/);
  assert.equal(r.items[0].etapaDesde,'2026-11-26T19:41:15+00:00');
  await getDatabaseProposals({keywords:'consumidor',year:'Todos',type:'Todos',sort:'etapa'});
  // Com ou sem a busca de texto completo (um teste anterior a desliga), a ordem é a mesma.
  assert.match(urls[1],/order=situacao_desde\.desc\.nullslast/);
  semColuna=true;urls.length=0;
  const b=await getDatabaseProposals({year:'Todos',type:'Todos',sort:'etapa'});
  assert.equal(urls.length,2,'tenta de novo uma vez, sem a coluna');
  assert.match(urls[1],/order=data_apresentacao\.desc,id\.desc/);
  assert.doesNotMatch(urls[1],/dados_oficiais->/,'ordenar pelo JSON estoura o tempo limite');
  assert.equal(b.items[0].etapaDesde,undefined);
  const r2=await getDatabaseProposals({year:'Todos',type:'Todos',sort:'recentes'});
  assert.equal(r2.items[0].etapaDesde,undefined,'na ordem por apresentação o card mostra a apresentação');
 }finally{globalThis.fetch=prev}
});

test('card: na lista única diz o que aconteceu e quando, no horário de Brasília',()=>{
 const p={id:1,siglaTipo:'PL',numero:6234,ano:2025,ementa:'x',dataApresentacao:'2025-12-08'};
 const desde='2026-11-27T01:30:00+00:00'; // 26/11 em Brasília
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Pronta para pauta',tone:'voting'}),'pronta para pauta desde 26/11/2026');
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Em discussão',tone:'discussion'}),'em discussão desde 26/11/2026');
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Aprovado na Câmara',tone:'approved'}),'aprovada na Câmara em 26/11/2026');
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Virou lei',tone:'law'}),'virou lei em 26/11/2026');
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Arquivado / Rejeitado',tone:'closed'}),'saiu de tramitação em 26/11/2026');
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Apresentada',tone:'neutral'}),'apresentada em 08/12/2025');
 assert.equal(cardDate({...p,etapaDesde:desde},{label:'Em atualização',tone:'pending'}),'apresentada em 08/12/2025');
 assert.equal(cardDate(p,{label:'Pronta para pauta',tone:'voting'}),'08/12/2025','fora da lista principal, só a data');
});
