import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTramitacoes,relevantMovements,normalizeTextoAtual,versionNote,historyHTML,SHORT_HISTORY} from '../src/lib/tramitacoes.js';
import {getDatabaseDetail} from '../src/data/api.js';
import {fetchAiSummary} from '../src/ui/ai-summary.js';
import {changeSection} from '../src/ui/components.js';
globalThis.window={OBM_EDITORIAL:{},OBM_PARTIDOS_DEPUTADOS:{}};

// Formato gravado por scripts/sync_supabase.py (recorte real do PL 220/2026).
const RAW=[
 {dataHora:'2026-11-17T14:15',sequencia:24,siglaOrgao:'CSPCCO',descricao:'Aprovação do Parecer',codTipo:'336',despacho:'Aprovado o Parecer.',url:null},
 {dataHora:'2026-02-03T10:00',sequencia:1,siglaOrgao:'PLEN',descricao:'Apresentação de Proposição',codTipo:'100',despacho:'Apresentação do PL n. 220/2026',url:null},
 {dataHora:'2026-09-16T12:25',sequencia:18,siglaOrgao:'CSPCCO',descricao:'Recebimento - Relator(a)',codTipo:'501',despacho:'Apresentação do PRL n. 1 CSPCCO',url:null},
 {dataHora:'2026-09-16T12:26',sequencia:19,siglaOrgao:'CSPCCO',descricao:'Parecer do(a) Relator(a)',codTipo:'322',
  despacho:'Parecer do Relator, Dep. Aluisio Mendes (REPUBLIC-MA), pela aprovação do PL 220/26 e da Emenda 1/2026 apresentada nesta comissão, com substitutivo',
  url:'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3180800'},
 {dataHora:'2026-09-18',sequencia:20,siglaOrgao:'CSPCCO',descricao:'<img src=x onerror=alert(1)>',codTipo:'999',despacho:'',url:'javascript:alert(1)'},
 {dataHora:'sem data',descricao:'Lixo'},null
];
const TEXTO={id:2655527,sigla:'SBT-A',descricao:'x',data:'2026-11-17',orgao:'CSPCCO',url:'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3199112'};

test('normaliza em ordem cronológica, descarta lixo e links fora da Câmara',()=>{
 const list=normalizeTramitacoes(RAW);
 assert.deepEqual(list.map(t=>t.sequencia),[1,18,19,20,24]);
 assert.equal(list[3].url,null);
 assert.equal(list[2].url,'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3180800');
 assert.deepEqual(normalizeTramitacoes('x'),[]);
});

test('lista curta tira registros administrativos e começa pela mais recente',()=>{
 const rel=relevantMovements(normalizeTramitacoes(RAW));
 assert.equal(rel[0].descricao,'Aprovação do Parecer');
 assert.ok(!rel.some(t=>/^Recebimento/.test(t.descricao)));
});

test('histórico escapa HTML, mostra datas reais e recolhe o resto',()=>{
 const list=normalizeTramitacoes(RAW);
 const html=historyHTML(list,normalizeTextoAtual(TEXTO));
 assert.match(html,/17\/11\/2026/);
 assert.match(html,/Texto modificado:<\/strong> Substitutivo aprovado na Comissão de Segurança Pública e Combate ao Crime Organizado \(CSPCCO\) em 17\/11\/2026/);
 assert.match(html,/<abbr class="history-org" title="Comissão de Segurança Pública e Combate ao Crime Organizado">CSPCCO<\/abbr>/);
 assert.ok(!html.includes('<img'),'descrição vinda do banco é escapada');
 assert.ok(!html.includes('javascript:'),'link fora da Câmara não vira link');
 assert.match(html,/Ver todas as 5 movimentações/);
 const many=Array.from({length:12},(_,i)=>({dataHora:'2026-01-'+String(i+1).padStart(2,'0'),sequencia:i+1,descricao:'Passo '+(i+1),codTipo:'1'}));
 assert.equal((historyHTML(normalizeTramitacoes(many)).split('</details>')[0].split('<details')[0].match(/<li>/g)||[]).length,SHORT_HISTORY);
 assert.equal(historyHTML([]),'');
});

test('texto atual só vale com sigla conhecida e link oficial',()=>{
 assert.equal(normalizeTextoAtual(TEXTO).descricao,'Substitutivo aprovado na comissão');
 assert.equal(normalizeTextoAtual({...TEXTO,url:'https://malicioso.example/a.pdf'}),null);
 assert.equal(normalizeTextoAtual({...TEXTO,sigla:'SBT'}),null,'substitutivo só proposto pelo relator não conta');
 assert.equal(normalizeTextoAtual(null),null);
});

test('aviso de versão: atualizado, desatualizado e sem mudança',()=>{
 const v=normalizeTextoAtual(TEXTO);
 assert.equal(versionNote(null,{fonte:'automatico'}),'');
 const stale=versionNote(v,{fonte:'ia',ai:{fonte_url:'https://www.camara.leg.br/original'}});
 assert.match(stale,/O texto desta proposta mudou/);
 assert.match(stale,/ainda descreve o texto original e está sendo atualizado/);
 const fresh=versionNote(v,{fonte:'ia',ai:{fonte_url:TEXTO.url,texto_versao:'SBT-A',texto_orgao:'CSPCCO',texto_data:'2026-11-17'}});
 assert.match(fresh,/Este resumo explica o <strong>substitutivo aprovado na Comissão de Segurança Pública e Combate ao Crime Organizado \(CSPCCO\) em 17\/11\/2026<\/strong>/);
 assert.match(versionNote({...v,sigla:'RDF',descricao:'Redação final aprovada pela Câmara',orgao:'CCJC'},{fonte:'automatico'}),/Redação final aprovada pela Câmara \(CCJC\)/);
 assert.match(versionNote(v,{fonte:'redacao'}),/escrita para o texto original/);
});

test('seção "O que muda" avisa quando o resumo da IA é do texto antigo',()=>{
 const p={id:2600635,numero:220,ano:2026,siglaTipo:'PL',ementa:'Altera a Lei nº 12.850, de 2 de agosto de 2013.',tags:[],textoAtual:normalizeTextoAtual(TEXTO)};
 const ai={resumo:'Juízes poderiam afastar investigados.',proposta:'Afastamento.',pontos:['a','b'],areas:['x'],gerado_em:'2026-11-01',fonte_url:'https://www.camara.leg.br/original'};
 const html=changeSection(p,{},{reviewed:false,title:'T',area:'Segurança',ai});
 assert.match(html,/version-note--changed/);
});

test('ficha lê histórico e texto atual; sem a migration, cai para a consulta antiga',async()=>{
 const urls=[];
 const row={id:2600635,sigla_tipo:'PL',numero:220,ano:2026,ementa:'Altera a Lei nº 12.850.',data_apresentacao:'2026-02-03',dados_oficiais:{},tramitacoes:RAW,texto_atual:TEXTO};
 const ok=async url=>{urls.push(String(url));return {ok:true,status:200,json:async()=>[row]}};
 const d=await getDatabaseDetail(2600635,{fetchImpl:ok});
 assert.match(decodeURIComponent(urls[0]),/tramitacoes,texto_atual/);
 assert.equal(d.tramitacoes.length,5);
 assert.equal(d.proposal.textoAtual.sigla,'SBT-A');
 urls.length=0;
 const old=async url=>{urls.push(String(url));return /tramitacoes/.test(decodeURIComponent(url))?{ok:false,status:400}:{ok:true,status:200,json:async()=>[{...row,tramitacoes:undefined,texto_atual:undefined}]}};
 const d2=await getDatabaseDetail(2600635,{fetchImpl:old});
 assert.equal(urls.length,4,'temas → apensação → só histórico → básico');
 assert.deepEqual(d2.tramitacoes,[]);
 assert.equal(d2.proposal.textoAtual,null);
});

test('resumo da IA pede a versão do texto e funciona sem as colunas novas',async()=>{
 const urls=[];
 const fake=async url=>{urls.push(decodeURIComponent(String(url)));return /fonte_url/.test(decodeURIComponent(url))?{ok:false,status:400}:{ok:true,status:200,json:async()=>[{resumo:'Resumo.'}]}};
 const row=await fetchAiSummary(1,{fetchImpl:fake});
 assert.equal(row.resumo,'Resumo.');
 assert.match(urls[0],/fonte_url,texto_versao/);
 assert.ok(!/fonte_url/.test(urls[1]));
});
