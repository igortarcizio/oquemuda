// Botão "Encontrou um erro neste texto?" e formulário de reporte na ficha da proposta.
// Fica escondido enquanto o banco não tem as funções de reporte (reportes_ativos).
import {REPORT_REASONS,MAX_DETAIL,validateReport,sendReport,reportsEnabled,reportErrorMessage} from '../data/reports.js';

const FLAG='<svg class="report-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Estado por proposta: a ficha é redesenhada algumas vezes enquanto os dados chegam,
// e o que a pessoa já escolheu não pode se perder.
const drafts=new Map(); // id -> {open, parte, motivo, detalhe, sent, sending}
let activeId=null;

const draftFor=id=>{if(!drafts.has(id))drafts.set(id,{open:false,parte:'',motivo:'',detalhe:'',sent:false,sending:false});return drafts.get(id)};

export function stopReport(){activeId=null}

/** Partes da ficha que existem agora na tela e podem ser reportadas. */
export function availableParts(doc=globalThis.document){
  const parts=[];
  if(doc.getElementById('detailTitle'))parts.push({value:'titulo',label:'Título'});
  const section=doc.querySelector('.change-section');
  if(section?.querySelector('.change-lead'))parts.push({value:'resumo',label:'Resumo'});
  const subs=[];
  if(section?.querySelector('.change-now'))subs.push('“Como é hoje”');
  if(section?.querySelector('.change-next'))subs.push('“Como ficaria”');
  if(section?.querySelector('.change-points'))subs.push('“O que muda na prática”');
  if(subs.length)parts.push({value:'editorial',label:subs.length>1?subs.slice(0,-1).join(', ')+' e '+subs.at(-1):subs[0]});
  return parts;
}

/** Quem escreveu a parte reportada (redação, IA ou regra automática) e qual versão. */
export function sourceOf(parte,doc=globalThis.document){
  const el=parte==='titulo'?doc.getElementById('detailTitle'):doc.querySelector('.change-section');
  const fonte=el?.dataset?.fonte||'automatico';
  const versao=parte==='titulo'?'':(el?.dataset?.versao||'');
  return {fonte,versao};
}

const radio=(name,o,checked)=>'<label class="report-option"><input type="radio" name="'+name+'" value="'+esc(o.value)+'"'+(checked?' checked':'')+'><span>'+esc(o.label)+'</span></label>';

export function formHTML(d,parts){
  const outro=d.motivo==='outro';
  const len=d.detalhe.length;
  return '<button type="button" class="report-toggle" aria-expanded="'+d.open+'" aria-controls="reportForm"'+(d.sent?' hidden':'')+'>'+FLAG+'<span>Encontrou um erro neste texto? Reportar</span></button>'+
   '<form id="reportForm" class="report-form" novalidate'+(d.open&&!d.sent?'':' hidden')+(d.sending?' aria-busy="true"':'')+'>'+
    '<h3 id="reportHeading" tabindex="-1">Reportar um problema</h3>'+
    '<fieldset class="report-group" data-field="parte"><legend>Onde está o problema?</legend><div class="report-options">'+
     parts.map(o=>radio('reportParte',o,d.parte===o.value)).join('')+'</div></fieldset>'+
    '<fieldset class="report-group" data-field="motivo"><legend>Qual é o problema?</legend><div class="report-options">'+
     REPORT_REASONS.map(o=>radio('reportMotivo',o,d.motivo===o.value)).join('')+'</div></fieldset>'+
    '<div class="report-detail"'+(outro?'':' hidden')+'>'+
     '<label for="reportDetail">Descreva o problema <span class="report-limit">(até '+MAX_DETAIL+' caracteres)</span></label>'+
     '<textarea id="reportDetail" name="detalhe" rows="2" maxlength="'+MAX_DETAIL+'" aria-describedby="reportPrivacy reportCount"'+(outro?' required':'')+'>'+esc(d.detalhe)+'</textarea>'+
     '<div class="report-detail-foot"><p id="reportPrivacy">Não escreva nome, CPF, telefone, e-mail ou outro dado pessoal.</p>'+
     '<span id="reportCount" class="report-count'+(len>=MAX_DETAIL-10?' near':'')+'">'+len+'/'+MAX_DETAIL+'</span></div>'+
    '</div>'+
    '<p id="reportError" class="report-error" role="alert"></p>'+
    '<div class="report-actions"><button type="submit" class="primary-btn"'+(d.sending?' disabled':'')+'>'+(d.sending?'Enviando…':'Enviar reporte')+'</button>'+
     '<button type="button" class="quiet-btn" data-report-cancel>Cancelar</button></div>'+
    '<p class="small-note">O reporte é anônimo e vai para a equipe do site. Nada sai do ar automaticamente: uma pessoa revisa cada caso.</p>'+
   '</form>'+
   '<div class="report-thanks"'+(d.sent?'':' hidden')+'><p id="reportThanks" tabindex="-1"><strong>Obrigado, vamos revisar.</strong></p>'+
    '<button type="button" class="quiet-btn" data-report-again>Reportar outro problema</button></div>';
}

export function mountReport(proposal){
  const root=document.getElementById('reportProblem');
  const id=Number(proposal?.id);
  if(!root)return;
  if(!Number.isInteger(id)||id<=0){root.hidden=true;return}
  activeId=id;
  root.hidden=true;
  reportsEnabled().then(on=>{
    const current=document.getElementById('reportProblem');
    if(!on||!current||activeId!==id)return;
    // A ficha foi redesenhada com o formulário aberto: devolve o foco para onde a pessoa estava.
    const d=draftFor(id),a=document.activeElement;
    const displaced=d.open&&d.focusSel&&(!a||a===document.body||a.id==='detailTitle');
    render(current,id,displaced?d.focusSel:'');
  });
}

function render(root,id,focus=''){
  const d=draftFor(id);
  root.dataset.reportId=String(id);
  root.innerHTML=formHTML(d,availableParts());
  root.hidden=false;
  if(!root.dataset.bound){root.dataset.bound='1';bind(root)}
  if(focus)root.querySelector(focus)?.focus();
}

function bind(root){
  const id=()=>Number(root.dataset.reportId);
  root.addEventListener('click',e=>{
    const d=draftFor(id());
    if(e.target.closest('.report-toggle')){d.open=!d.open;render(root,id(),d.open?'#reportHeading':'.report-toggle');return}
    if(e.target.closest('[data-report-cancel]')){d.open=false;render(root,id(),'.report-toggle');return}
    if(e.target.closest('[data-report-again]')){Object.assign(d,{open:true,sent:false,parte:'',motivo:'',detalhe:''});render(root,id(),'#reportHeading')}
  });
  root.addEventListener('change',e=>{
    const d=draftFor(id());
    if(e.target.name==='reportParte')d.parte=e.target.value;
    if(e.target.name==='reportMotivo'){
      d.motivo=e.target.value;
      const box=root.querySelector('.report-detail'),ta=root.querySelector('#reportDetail');
      const outro=d.motivo==='outro';
      if(box)box.hidden=!outro;
      if(ta){ta.required=outro;if(outro)ta.focus()}
    }
    clearError(root);
  });
  root.addEventListener('input',e=>{
    if(e.target.id!=='reportDetail')return;
    const d=draftFor(id());d.detalhe=e.target.value.slice(0,MAX_DETAIL);
    const c=root.querySelector('#reportCount');
    if(c){c.textContent=d.detalhe.length+'/'+MAX_DETAIL;c.classList.toggle('near',d.detalhe.length>=MAX_DETAIL-10)}
    e.target.removeAttribute('aria-invalid');
  });
  root.addEventListener('focusin',e=>{
    const t=e.target;draftFor(id()).focusSel=t.id?'#'+t.id:t.name&&t.value?'input[name="'+t.name+'"][value="'+t.value+'"]':'';
  });
  root.addEventListener('focusout',e=>{if(e.relatedTarget&&!root.contains(e.relatedTarget))draftFor(id()).focusSel=''});
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&e.target.closest('.report-form')){const d=draftFor(id());d.open=false;render(root,id(),'.report-toggle')}
  });
  root.addEventListener('submit',async e=>{
    e.preventDefault();
    const pid=id(),d=draftFor(pid);
    if(d.sending)return;
    if(d.parte&&!availableParts().some(o=>o.value===d.parte))d.parte='';
    const invalid=validateReport(d);
    if(invalid){showError(root,invalid);return}
    const report={parte:d.parte,motivo:d.motivo,detalhe:d.detalhe,...sourceOf(d.parte)};
    d.sending=true;render(root,pid);
    try{
      await sendReport(pid,report);
      Object.assign(d,{sending:false,sent:true,open:false,parte:'',motivo:'',detalhe:''});
      const current=document.getElementById('reportProblem');
      if(current&&activeId===pid)render(current,pid,'#reportThanks');
    }catch(error){
      d.sending=false;
      const current=document.getElementById('reportProblem');
      if(current&&activeId===pid){render(current,pid);showError(current,{message:reportErrorMessage(error)})}
    }
  });
}

function clearError(root){const p=root.querySelector('#reportError');if(p)p.textContent=''}

function showError(root,{field,message}){
  const p=root.querySelector('#reportError');
  if(p)p.textContent=message;
  if(field==='detalhe'){const ta=root.querySelector('#reportDetail');if(ta){ta.setAttribute('aria-invalid','true');ta.focus()}}
  else if(field)root.querySelector('[data-field="'+field+'"] input')?.focus();
}

// Quando o resumo da IA chega depois, as partes disponíveis mudam (aparece "Como é hoje").
globalThis.document?.addEventListener?.('oquemuda:changesection',()=>{
  const root=document.getElementById('reportProblem');
  if(root&&!root.hidden&&activeId===Number(root.dataset.reportId)){
    const focused=root.contains(document.activeElement);
    if(!focused)render(root,activeId);
  }
});
