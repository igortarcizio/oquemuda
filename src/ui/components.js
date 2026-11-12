import {safeText,ref,dateBR,officialURL,cleanText,classifyTheme} from '../lib/text.js';
import {THEMES as THEME_LIST} from '../lib/themes.js';
import {displayTitle,amendedLaws,isReviewed} from '../lib/titles.js?v=clear-titles-20261112';

function conciseImpact(value, limit=135){
  const text=cleanText(value);
  if(text.length<=limit)return text;
  const clause=text.split(/;\s*/)[0];
  if(clause.length>=45 && clause.length<=limit)return clause.replace(/[.,:;\s]+$/,'')+'.';
  const cut=text.slice(0,limit+1),lastSpace=cut.lastIndexOf(' ');
  return cut.slice(0,lastSpace>limit*0.7?lastSpace:limit).replace(/[.,:;\s]+$/,'')+'…';
}

import {proposalTags,tagURL} from '../lib/tags.js';
const subjectLinks=p=>!proposalTags(p).length?'<p class="subheading">Assuntos em revisão</p>':'<div class="affected subject-tags" aria-label="Assuntos da proposta">'+proposalTags(p).map(tag=>'<a class="microtag subject-tag" href="'+safeText(tagURL(tag))+'" aria-label="Ver propostas sobre '+safeText(tag)+'">'+safeText(tag)+'</a>').join('')+'</div>';

import {STATUS} from '../lib/status.js';
const editorial=p=>window.OBM_EDITORIAL?.[String(p.id)]||{};
// Toda proposta tem um tema real; não existe "Outros".
// Registros antigos (cópia local, salvos) podem trazer "Outros" ou temas extintos: recalcula.
const themeOf=(p,e=editorial(p))=>THEME_LIST.includes(p.area)?p.area:classifyTheme(p,e);
export function skeleton(count=6){
 return Array.from({length:count},(_,i)=>'<article class="card skeleton" aria-hidden="true"><div class="skeleton-bar shimmer"></div><div class="card-body"><div class="skeleton-ref shimmer"></div><div class="skeleton-heading shimmer"></div><div class="skeleton-heading narrow shimmer"></div><div class="skeleton-block shimmer"></div><div class="skeleton-block small shimmer"></div></div></article>').join('');
}
export function badge(status){
 const data=status||STATUS.unknown;
 return '<span class="status-badge '+safeText(data.tone)+'" title="'+safeText(data.detail||data.label)+'">'+safeText(data.label)+'</span>';
}
const SEAL='<span class="seal"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>Explicado pela redação</span>';
const saveButton=(p,saved,label='+ Salvar')=>'<button class="savebtn '+(saved?'saved':'')+'" type="button" data-save="'+Number(p.id)+'" aria-pressed="'+String(saved)+'" aria-label="'+(saved?'Remover dos salvos':'Salvar')+' '+safeText(ref(p))+'">'+(saved?'✓ Salvo':label)+'</button>';
const topicLabel=area=>'<span class="topic-label"><span class="topic-dot" aria-hidden="true"></span>'+safeText(area)+'</span>';
const statusSlot=(p,status)=>'<span data-status-id="'+Number(p.id)+'">'+badge(status)+'</span>';

/**
 * Card da lista. O card inteiro leva à ficha por um único link (o título).
 * Revisada: pergunta + síntese da redação + selo. Demais: título descritivo da ementa + "Altera:".
 */
export function card(p,status,saved){
 const e=editorial(p),reviewed=isReviewed(e),area=themeOf(p,e);
 const laws=reviewed?'':amendedLaws(p.ementa);
 return '<article class="card civic-card '+(reviewed?'reviewed':'auto')+'" data-area="'+safeText(area)+'">'+
   '<div class="card-top">'+topicLabel(area)+statusSlot(p,status)+'</div>'+
   '<p class="docref">'+safeText(ref(p))+' · '+safeText(dateBR(p.dataApresentacao))+'</p>'+
   '<h3><a class="card-link" href="#/tema/'+Number(p.id)+'">'+safeText(displayTitle(p,e))+'</a></h3>'+
   (reviewed?'<p class="card-lead">'+safeText(conciseImpact(e.impacto))+'</p>':laws?'<p class="changes"><b>Altera:</b> '+safeText(laws)+'</p>':'')+
   subjectLinks(p)+
   '<div class="card-bottom">'+(reviewed?SEAL:'<span class="read-hint" aria-hidden="true">Ler ficha →</span>')+saveButton(p,saved)+'</div></article>';
}

/**
 * Destaque principal. A lateral mostra quem pode ser afetado (quando a redação informou);
 * sem isso, mostra os assuntos da proposta.
 */
export function editorialFeature(p,status,saved){
 const e=editorial(p),reviewed=isReviewed(e),area=themeOf(p,e);
 const lead=reviewed?conciseImpact(e.impacto,200):amendedLaws(p.ementa)?'Altera: '+amendedLaws(p.ementa)+'.':'';
 const publicos=Array.isArray(e.publicos)?e.publicos.filter(Boolean):[];
 return '<article class="editorial-feature" data-area="'+safeText(area)+'">'+
   '<div class="feature-main">'+
    '<div class="meta-row">'+topicLabel(area)+statusSlot(p,status)+(reviewed?SEAL:'')+'</div>'+
    '<p class="docref">'+safeText(ref(p))+' · apresentado em '+safeText(dateBR(p.dataApresentacao))+'</p>'+
    '<h3 class="'+(reviewed?'':'auto')+'"><a class="card-link" href="#/tema/'+Number(p.id)+'">'+safeText(displayTitle(p,e))+'</a></h3>'+
    (lead?'<p class="feature-lead">'+safeText(lead)+'</p>':'')+
   '</div>'+
   '<div class="feature-side">'+
    (publicos.length?'<div><p class="kicker">Quem pode ser afetado</p><ul class="who">'+publicos.map(x=>'<li>'+safeText(x)+'</li>').join('')+'</ul></div>':'<div><p class="kicker">Assuntos da proposta</p>'+subjectLinks(p)+'</div>')+
    (publicos.length?subjectLinks(p):'')+
    '<div class="card-bottom"><span class="read-hint" aria-hidden="true">'+(reviewed?'Ler explicação →':'Ler ficha →')+'</span>'+saveButton(p,saved)+'</div>'+
   '</div></article>';
}

/** Paginação numérica baseada no total fornecido pelos links da API; sem inventar última página. */
export function pagination({page,totalPages,hasNext}){
 if(!totalPages&& !hasNext && page<=1)return '';
 const total=Number.isFinite(totalPages)?totalPages:null;
 const chosen=new Set([1]);
 if(page<=3){
  for(let n=1;n<=5;n++)chosen.add(n);
 }else{
  for(let n=page-1;n<=page+1;n++)chosen.add(n);
 }
 if(total){
  chosen.add(total);
  if(page>=total-2)for(let n=Math.max(1,total-4);n<=total;n++)chosen.add(n);
 }
 const pages=[...chosen].filter(n=>n>0&&(!total||n<=total)).sort((a,b)=>a-b);
 let previous=0;
 const nodes=[];
 for(const n of pages){
  if(previous&&n>previous+1)nodes.push('<span class="pagination-dots" aria-hidden="true">…</span>');
  nodes.push('<button type="button" class="page-number '+(n===page?'active':'')+'" data-page="'+n+'" '+(n===page?'aria-current="page"':'')+' aria-label="Ir para página '+n+'">'+n+'</button>');
  previous=n;
 }
 const disabledPrev=page<=1,disabledNext=total?page>=total:!hasNext;
 return '<nav class="pagination" role="navigation" aria-label="Páginas de proposições">'+
 '<button type="button" class="page-number edge" data-page="'+Math.max(1,page-1)+'" '+(disabledPrev?'disabled':'')+' aria-label="Página anterior">Anterior</button>'+
 nodes.join('')+
 '<button type="button" class="page-number edge" data-page="'+(page+1)+'" '+(disabledNext?'disabled':'')+' aria-label="Próxima página">Próxima</button>'+
 (total&&total>5?'<button type="button" class="page-number edge" data-page="'+total+'" '+(page===total?'disabled':'')+' aria-label="Ir para última página">Última</button>':'')+
 '</nav>';
}
const initials=authors=>authors.length?authors.map(a=>safeText(a.nome)+(a.partido?' <strong>('+safeText(a.partido)+')</strong>':' <span class="muted">(partido não informado)</span>')).join('<span class="author-separator">, </span>'):'Autoria não informada pela API';
const STEPS=['Apresentada','Comissões','Plenário da Câmara','Senado','Sanção ou veto'];
/** Etapa na linha do tempo a partir da situação oficial normalizada; null quando não confirmada. */
export function stageIndex(status){
 if(!status)return null;
 if(status.label==='Apresentada')return 0;
 return {discussion:1,voting:2,approved:3}[status.tone]??null;
}
function timeline(status,presentedAt){
 if(status?.tone==='closed')return '<p class="closed-note">A tramitação foi encerrada: '+safeText(status.detail||status.label)+'.</p>';
 const idx=stageIndex(status);
 if(idx==null)return '<p>'+badge(status)+'</p><p class="small-note">Etapa ainda não confirmada na fonte oficial.</p>';
 return '<ol class="timeline" aria-label="Etapas da tramitação">'+STEPS.map((step,i)=>
  '<li class="'+(i<=idx?'done':'')+(i===idx?' now':'')+'"'+(i===idx?' aria-current="step"':'')+'>'+step+
  (i===0?'<small>'+safeText(dateBR(presentedAt))+'</small>':i===idx?'<small>etapa atual</small>':'')+'</li>').join('')+'</ol>';
}

export function detailPage(p,{status,authors=[],stage={},fullTextURL=null,source='ao vivo',loaded=false,authorsChecked=false,lastChecked=null,backHref='#/explorar'}={},saved=false){
 const e=editorial(p),reviewed=isReviewed(e),title=displayTitle(p,e),area=themeOf(p,e),laws=amendedLaws(p.ementa);
 const safeURL=(url)=>typeof url==='string'&&url.startsWith('https://www.camara.leg.br/')?url:null;
 const full=safeURL(fullTextURL);
 const pendingText=lastChecked?'Não informado no registro consultado':'Em atualização';
 const verifiedAt=lastChecked?new Date(lastChecked).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):null;
 const backLabel=backHref==='#/explorar'?'← Voltar às propostas':'← Voltar aos resultados';
 const publicos=reviewed&&Array.isArray(e.publicos)?e.publicos.filter(Boolean):[];
 const whatChanges=reviewed?safeText(cleanText(e.impacto).replace(/[.\s]+$/,''))+'.':
   safeText(title.replace(/[.…\s]+$/,''))+(laws?'. Para isso, altera: '+safeText(laws):'')+'.';
 return '<div class="detail" data-area="'+safeText(area)+'"><div class="page"><a class="back" href="'+safeText(backHref)+'">'+backLabel+'</a></div>'+
 '<div class="detail-header"><div class="page"><div class="detail-meta">'+topicLabel(area)+'<span>'+safeText(ref(p))+'</span>'+(reviewed?SEAL:'')+'</div>'+
 '<h1 tabindex="-1" id="detailTitle" class="'+(reviewed?'':'auto')+'">'+safeText(title)+'</h1>'+
 '<div class="detail-actions">'+saveButton(p,saved,'＋ Salvar para depois')+'<a class="outline-btn" target="_blank" rel="noopener noreferrer" href="'+officialURL(p)+'">Ver na Câmara ↗<span class="sr-only"> (abre em nova aba)</span></a></div></div></div>'+
 '<div class="page detail-layout"><div>'+
 '<section class="detail-section"><h2>O que a proposta quer mudar?</h2><p>'+whatChanges+'</p>'+
  (reviewed?'':'<p class="small-note">Resumo automático a partir da ementa oficial. Ainda não foi explicado pela redação.</p>')+
  '<p class="small-note">Proposta não é lei: o texto ainda pode mudar e precisa passar pela Câmara, pelo Senado e pela sanção.</p></section>'+
 (publicos.length?'<section class="detail-section"><h2>Quem pode ser afetado</h2><ul class="who-row">'+publicos.map(x=>'<li>'+safeText(x)+'</li>').join('')+'</ul></section>':'')+
 '<section class="detail-section"><h2>Em que etapa está?</h2>'+(loaded?timeline(status,p.dataApresentacao):'<p>Verificando andamento na Câmara…</p>')+
 (stage.descricaoTramitacao?'<p class="small-note">Último registro oficial: '+safeText(stage.descricaoTramitacao)+(stage.siglaOrgao?' ('+safeText(stage.siglaOrgao)+')':'')+(stage.dataHora?', '+safeText(dateBR(stage.dataHora)):'')+'.</p>':'')+
 '<p class="small-note">Aprovação em comissão não é aprovação final pela Câmara.</p></section>'+
 '<section class="detail-section"><h2>Texto oficial</h2><div class="quote-official"><span class="eyebrow">Ementa</span><p>'+safeText(p.ementa)+'</p></div></section>'+
 '</div><aside class="detail-aside" aria-labelledby="fichaTitle"><h2 id="fichaTitle">Ficha</h2><dl>'+
 '<div><dt>Identificação</dt><dd>'+safeText(ref(p))+'</dd></div>'+
 '<div><dt>Autoria</dt><dd>'+(loaded?(authors.length?initials(authors):(authorsChecked?'Não informada na consulta':'Ainda não verificada')):'Consultando autores…')+'</dd></div>'+
 '<div><dt>Apresentação</dt><dd>'+safeText(dateBR(p.dataApresentacao))+'</dd></div>'+
 '<div><dt>Situação</dt><dd>'+(loaded?badge(status):'Verificando…')+'</dd></div>'+
 '<div><dt>Onde está</dt><dd>'+safeText(stage.siglaOrgao||pendingText)+'</dd></div>'+
 '<div><dt>Assuntos</dt><dd>'+subjectLinks(p)+'</dd></div>'+
 '</dl>'+(full?'<div class="detail-links"><a class="primary-btn" target="_blank" rel="noopener noreferrer" href="'+safeText(full)+'">Ler texto integral ↗<span class="sr-only"> (abre em nova aba)</span></a></div>':'')+
 (verifiedAt?'<p class="small-note">Situação consultada na fonte oficial em '+safeText(verifiedAt)+'. Os registros podem mudar.</p>':'<p class="small-note">Detalhes oficiais ainda não sincronizados. A ficha será complementada quando a fonte estiver disponível.</p>')+
 '<p class="small-note">O partido indicado é o informado pela Câmara e pode ser o da época da apresentação.</p>'+
 '</aside></div></div>';
}
export function infoPage(){
 return '<div class="page inforoute"><p class="eyebrow">Como funciona</p><h1 tabindex="-1" id="infoTitle">Entender antes de opinar.</h1>'+
 '<p class="lead">O que muda? explica, em linguagem clara, propostas da Câmara dos Deputados. Proposta não é lei.</p>'+
 '<div class="steps"><article class="step"><div class="number">01</div><h2>Busque um assunto</h2><p>Encontre propostas por palavra, ano, tipo ou partido do autor.</p></article>'+
 '<article class="step"><div class="number">02</div><h2>Entenda a proposta</h2><p>“O que muda” explica de forma resumida aquilo que o projeto pretende alterar, sem confundir propostas e leis em vigor.</p></article>'+
 '<article class="step"><div class="number">03</div><h2>Confira a fonte</h2><p>Consulte o texto integral, os autores e o andamento na base oficial.</p></article></div>'+
 '<div class="notice" style="margin-top:26px"><strong>Transparência editorial.</strong> Propostas com o selo “Explicado pela redação” foram lidas por uma pessoa, que escreveu o título em forma de pergunta e o resumo. Nas demais, o título é gerado automaticamente a partir da ementa oficial e descreve o que o texto faz, sem interpretar. A classificação temática também é automática. A aprovação em uma comissão não equivale à aprovação final.</div>'+
 '<section style="margin-top:26px"><h2>Temas e tags</h2><p>Os temas agrupam áreas gerais, como Saúde ou Direitos e cidadania; toda proposta recebe um dos 13 temas. As tags identificam assuntos específicos, como SUS, Diabetes e Vacinação, com base na ementa oficial. Clique em uma tag para consultar todas as propostas com o mesmo assunto no acervo disponível. A classificação é automática e pode ser aperfeiçoada.</p></section><section id="selecao-destaques" style="margin-top:26px"><h2>Como os destaques são escolhidos</h2><p>A seleção é automática e consultada diariamente. Os critérios consideram o interesse público, o tema e os possíveis efeitos das propostas no cotidiano, com base nas informações disponíveis nos registros oficiais.</p><p>Os três destaques são substituídos quando surgem novas propostas que atendem aos critérios. Sem novidades qualificadas, os anteriores permanecem. A seleção automática não significa revisão humana de cada texto nem representa apoio às propostas ou aos seus autores.</p></section>'+
 '<p style="margin-top:26px"><a class="primary-btn" href="#/explorar">Explorar propostas →</a></p></div>';
}
