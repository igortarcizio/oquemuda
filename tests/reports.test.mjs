import test from 'node:test';
import assert from 'node:assert/strict';

const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
globalThis.window={OBM_EDITORIAL:{}};

const {validateReport,reportPayload,sendReport,reportsEnabled,resetReportsEnabled,reportErrorMessage,cleanDetail,MAX_DETAIL,REPORT_REASONS}=await import('../src/data/reports.js');
const {formHTML,availableParts,sourceOf}=await import('../src/ui/report-problem.js');
const {detailPage,changeSectionFor}=await import('../src/ui/components.js');

const draft=o=>({open:true,parte:'',motivo:'',detalhe:'',sent:false,sending:false,...o});

test('motivos fixos e limite de 100 caracteres',()=>{
  assert.deepEqual(REPORT_REASONS.map(r=>r.value),['errada','desatualizado','confuso','outro']);
  assert.equal(MAX_DETAIL,100);
});

test('valida parte, motivo e detalhe obrigatório só em "outro"',()=>{
  assert.equal(validateReport({}).field,'parte');
  assert.equal(validateReport({parte:'tags',motivo:'errada'}).field,'parte');
  assert.equal(validateReport({parte:'resumo'}).field,'motivo');
  assert.equal(validateReport({parte:'resumo',motivo:'errada'}),null);
  assert.equal(validateReport({parte:'titulo',motivo:'outro',detalhe:'   \n '}).field,'detalhe');
  assert.equal(validateReport({parte:'titulo',motivo:'outro',detalhe:'x'.repeat(101)}).field,'detalhe');
  assert.equal(validateReport({parte:'editorial',motivo:'outro',detalhe:'x'.repeat(100)}),null);
  assert.equal(cleanDetail('  a\n\n b\t c '),'a b c');
});

test('monta o corpo da função sem mandar detalhe fora de "outro"',()=>{
  const a=reportPayload('100',{parte:'resumo',fonte:'ia',motivo:'errada',detalhe:'sobra',versao:'2026-11-18T10:00:00Z'});
  assert.equal(a.p_proposicao,100);assert.equal(a.p_detalhe,null);assert.equal(a.p_fonte,'ia');
  assert.match(a.p_leitor,/^[0-9a-f-]{36}$/);
  const b=reportPayload(100,{parte:'titulo',fonte:'???',motivo:'outro',detalhe:' título  errado '});
  assert.equal(b.p_detalhe,'título errado');assert.equal(b.p_fonte,'automatico');assert.equal(b.p_versao,null);
});

test('envia para registrar_reporte e não chama a rede com formulário inválido',async()=>{
  let call=null;
  const fetchImpl=async(url,init)=>{call={url,body:JSON.parse(init.body)};return {ok:true,status:204,json:async()=>null}};
  assert.equal(await sendReport(7,{parte:'resumo',fonte:'redacao',motivo:'confuso'},{fetchImpl}),true);
  assert.match(call.url,/rpc\/registrar_reporte$/);
  assert.equal(call.body.p_motivo,'confuso');
  call=null;
  await assert.rejects(sendReport(7,{parte:'resumo',motivo:'outro'},{fetchImpl}),e=>e.code==='invalid');
  assert.equal(call,null);
});

test('erros do banco viram mensagens para o leitor',async()=>{
  const fetchImpl=async()=>({ok:false,status:400,json:async()=>({code:'54000',message:'limite de reportes atingido'})});
  await assert.rejects(sendReport(7,{parte:'resumo',motivo:'errada'},{fetchImpl}),e=>e.code==='54000');
  assert.match(reportErrorMessage({code:'54000'}),/Muitos reportes/);
  assert.match(reportErrorMessage({code:'network'}),/não foi enviado/);
  assert.match(reportErrorMessage({code:'xyz'}),/Tente de novo/);
});

test('botão fica escondido se o banco não tem as funções',async()=>{
  resetReportsEnabled();
  assert.equal(await reportsEnabled({fetchImpl:async()=>({ok:false,status:404,json:async()=>({code:'PGRST202'})})}),false);
  resetReportsEnabled();
  assert.equal(await reportsEnabled({fetchImpl:async()=>({ok:true,status:200,json:async()=>true})}),true);
  resetReportsEnabled();
});

test('formulário: botão acessível, campo livre só em "outro", aviso de dados pessoais',()=>{
  const parts=[{value:'titulo',label:'Título'},{value:'resumo',label:'Resumo'}];
  const closed=formHTML(draft({open:false}),parts);
  assert.match(closed,/<button type="button" class="report-toggle" aria-expanded="false" aria-controls="reportForm"/);
  assert.match(closed,/<form id="reportForm"[^>]*hidden/);
  const open=formHTML(draft({motivo:'errada'}),parts);
  assert.match(open,/<legend>Onde está o problema\?<\/legend>/);
  assert.match(open,/<div class="report-detail" hidden>/);
  const outro=formHTML(draft({motivo:'outro',detalhe:'<b>oi</b>'}),parts);
  assert.match(outro,/maxlength="100"/);
  assert.match(outro,/ required>&lt;b&gt;oi&lt;\/b&gt;<\/textarea>/);
  assert.match(outro,/Não escreva nome, CPF, telefone, e-mail/);
  assert.match(outro,/role="alert"/);
  const sent=formHTML(draft({sent:true}),parts);
  assert.match(sent,/class="report-toggle"[^>]* hidden/);
  assert.match(sent,/Obrigado, vamos revisar\./);
  assert.doesNotMatch(sent,/class="report-thanks" hidden/);
});

// DOM mínimo: só o que availableParts e sourceOf consultam.
function fakeDoc(sectionHTML,title={fonte:'automatico'}){
  const has=sel=>sectionHTML.includes('class="'+sel.slice(1));
  const section={dataset:{fonte:/data-fonte="(\w+)"/.exec(sectionHTML)?.[1],versao:/data-versao="([^"]*)"/.exec(sectionHTML)?.[1]},querySelector:s=>has(s)?{}:null};
  return {getElementById:id=>id==='detailTitle'?{dataset:title}:null,querySelector:s=>s==='.change-section'?section:null};
}

test('a ficha diz quem escreveu cada parte e só oferece o que está na tela',()=>{
  const p={id:4242,siglaTipo:'PL',numero:1,ano:2026,ementa:'Altera a Lei nº 8.078, de 11 de setembro de 1990, para proibir cobrança de taxa de entrega.'};
  assert.match(detailPage(p,{loaded:true}),/<div id="reportProblem" class="report-problem" hidden><\/div>/);
  assert.match(detailPage(p,{loaded:true}),/id="detailTitle" data-fonte="automatico"/);
  const auto=changeSectionFor(p);
  assert.match(auto,/data-fonte="automatico" data-versao=""/);
  assert.deepEqual(availableParts(fakeDoc(auto)).map(x=>x.value),['titulo','resumo']);
  const ia=changeSectionFor(p,{resumo:'Proíbe taxa de entrega.',hoje:'Pode cobrar.',proposta:'Não poderia.',pontos:['Menos taxa'],gerado_em:'2026-11-18T10:00:00Z'});
  assert.match(ia,/data-fonte="ia" data-versao="2026-11-18T10:00:00Z"/);
  const parts=availableParts(fakeDoc(ia));
  assert.deepEqual(parts.map(x=>x.value),['titulo','resumo','editorial']);
  assert.equal(parts[2].label,'“Como é hoje”, “Como ficaria” e “O que muda na prática”');
  assert.deepEqual(sourceOf('resumo',fakeDoc(ia)),{fonte:'ia',versao:'2026-11-18T10:00:00Z'});
  assert.deepEqual(sourceOf('titulo',fakeDoc(ia,{fonte:'ia'})),{fonte:'ia',versao:''});
});
