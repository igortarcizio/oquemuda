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
 assert.deepEqual(parseSearch('PEC saúde'),{ref:null,sigla:'PEC',tokens:['saude']});
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
 assert.match(url,/and=\(ementa_busca\.ilike\.\*saude\*\)/);
 assert.ok(!/ilike\.\*pec\*/.test(url));
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
