import {safeText,questionTitle,cardSummary,ref,dateBR,officialURL,cleanText} from '../lib/text.js';

function conciseImpact(value, limit=135){
  const text=cleanText(value);
  if(text.length<=limit)return text;
  const clause=text.split(/;\s*/)[0];
  if(clause.length>=45 && clause.length<=limit)return clause.replace(/[.,:;\s]+$/,'')+'.';
  const cut=text.slice(0,limit+1),lastSpace=cut.lastIndexOf(' ');
  return cut.slice(0,lastSpace>limit*0.7?lastSpace:limit).replace(/[.,:;\s]+$/,'')+'…';
}

import {STATUS} from '../lib/status.js';
const editorial=p=>window.OBM_EDITORIAL?.[String(p.id)]||{};
export function skeleton(count=6){
 return Array.from({length:count},(_,i)=>'<article class="card skeleton" aria-hidden="true"><div class="skeleton-bar shimmer"></div><div class="card-body"><div class="skeleton-ref shimmer"></div><div class="skeleton-heading shimmer"></div><div class="skeleton-heading narrow shimmer"></div><div class="skeleton-block shimmer"></div><div class="skeleton-block small shimmer"></div></div></article>').join('');
}
export function badge(status){
 const data=status||STATUS.unknown;
 return '<span class="status-badge '+safeText(data.tone)+'" title="'+safeText(data.detail||data.label)+'">'+safeText(data.label)+'</span>';
}
export function card(p,status, saved){
 const e=editorial(p),title=questionTitle(p,e),summary=cardSummary(p,e);
 const after=conciseImpact(summary||'O texto oficial ainda não traz uma síntese suficiente para explicar a mudança.');
 const audience=Array.isArray(e.publicos)?e.publicos:(p.publicos||[]);
 return '<article class="card civic-card" data-area="'+safeText(p.area||'Outros')+'">'+
   '<div class="card-banner"><span class="topic-label"><span class="topic-dot" aria-hidden="true"></span>'+safeText(p.area||'Outros')+'</span>'+
   '<span data-status-id="'+Number(p.id)+'">'+badge(status)+'</span></div>'+
   '<div class="card-body"><p class="docref">'+safeText(ref(p))+' · '+safeText(dateBR(p.dataApresentacao))+'</p>'+
   '<h3><a href="#/tema/'+Number(p.id)+'">'+safeText(title)+'</a></h3>'+
   '<div class="change-summary"><p>'+safeText(after)+'</p></div>'+
   (audience.length?'<div class="affected" aria-label="Públicos relacionados">'+audience.slice(0,3).map(a=>'<span class="microtag">'+safeText(a)+'</span>').join('')+'</div>':'')+
   '<div class="card-bottom"><a class="textlink" href="#/tema/'+Number(p.id)+'" aria-label="Entender '+safeText(ref(p))+'">Entender →</a>'+
   '<button class="savebtn '+(saved?'saved':'')+'" type="button" data-save="'+Number(p.id)+'" aria-pressed="'+String(saved)+'" aria-label="'+(saved?'Remover dos salvos':'Salvar')+' '+safeText(ref(p))+'">'+(saved?'✓ Salvo':'+ Salvar')+'</button></div></div></article>';
}
/**
 * A seleção editorial é independente do recorte de 30 registros da API.
 * A ficha destacada exige título, síntese, público e fonte oficial identificável.
 */
export function editorialFeature(p,status,saved){
 const e=editorial(p),title=questionTitle(p,e);
 const summary=conciseImpact(cardSummary(p,e),175);
 const audience=(Array.isArray(e.publicos)?e.publicos:p.publicos||[]).slice(0,3);
 return '<article class="card civic-card editorial-feature" data-area="'+safeText(p.area||e.area||'Outros')+'">'+
   '<div class="card-banner"><span class="topic-label"><span class="topic-dot" aria-hidden="true"></span>'+safeText(p.area||e.area||'Outros')+'</span><span data-status-id="'+Number(p.id)+'">'+badge(status)+'</span></div>'+
   '<div class="editorial-feature-body"><div class="editorial-feature-copy"><p class="docref">'+safeText(ref(p))+' · '+safeText(dateBR(p.dataApresentacao))+'</p>'+
   '<h3><a href="#/tema/'+Number(p.id)+'">'+safeText(title)+'</a></h3><p class="editorial-feature-lead">'+safeText(summary)+'</p></div>'+
   '<div class="editorial-feature-side">'+
   (audience.length?'<div><p class="subheading">Quem pode se interessar</p><div class="affected" aria-label="Públicos relacionados">'+audience.map(a=>'<span class="microtag">'+safeText(a)+'</span>').join('')+'</div></div>':'<div></div>')+
   '<div class="card-bottom"><a class="textlink" href="#/tema/'+Number(p.id)+'" aria-label="Entender '+safeText(ref(p))+'">Entender →</a>'+
   '<button type="button" class="savebtn '+(saved?'saved':'')+'" data-save="'+Number(p.id)+'" aria-pressed="'+String(saved)+'" aria-label="'+(saved?'Remover dos salvos':'Salvar')+' '+safeText(ref(p))+'">'+(saved?'✓ Salvo':'+ Salvar')+'</button></div></div></div></article>';
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
export function detailPage(p,{status,authors=[],stage={},fullTextURL=null,source='ao vivo',loaded=false,authorsChecked=false,lastChecked=null}={},saved=false){
 const e=editorial(p),title=questionTitle(p,e);
 const after=cardSummary(p,e);
 const safeURL=(url)=>typeof url==='string'&&url.startsWith('https://www.camara.leg.br/')?url:null;
 const full=safeURL(fullTextURL);
 const pendingText=lastChecked?'Não informado no registro consultado':'Consulta pendente';
 const verifiedAt=lastChecked?new Date(lastChecked).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):null;
 return '<div class="detail" data-area="'+safeText(p.area||'Outros')+'"><div class="page" style="padding-top:28px"><a class="back" href="#/explorar">← Voltar às propostas</a></div>'+
 '<div class="detail-header"><div class="page"><div class="detail-meta"><span class="topic-label"><span class="topic-dot" aria-hidden="true"></span>'+safeText(p.area||'Outros')+'</span> · '+safeText(ref(p))+'</div>'+
 '<h1>'+safeText(title)+'</h1><p class="detail-summary">'+safeText(after)+'</p>'+
 '<button type="button" data-save="'+Number(p.id)+'" aria-pressed="'+saved+'" class="outline-btn">'+(saved?'✓ Salvo':'＋ Salvar para depois')+'</button></div></div>'+
 '<div class="page detail-layout"><div>'+

 '<section class="detail-section"><h2>O que a proposta quer mudar?</h2><p>'+safeText(after)+'</p><p class="small-note">O texto ainda pode mudar durante a tramitação; a proposta não é uma lei em vigor.</p></section>'+
 '<section class="detail-section"><h2>O que está no documento oficial?</h2><div class="quote-official"><span class="eyebrow">Ementa oficial</span><p>'+safeText(p.ementa)+'</p></div></section>'+
 '<section class="detail-section"><h2>Em que etapa está?</h2><p>'+(loaded?badge(status):'Verificando andamento na Câmara…')+'</p>'+
 (stage.descricaoTramitacao?'<p class="small-note">Último registro: '+safeText(stage.descricaoTramitacao)+'.</p>':'')+
 '<p class="small-note">A aprovação em comissão não significa aprovação final pela Câmara. Consulte a ficha oficial para a tramitação completa.</p></section>'+
 '<section class="detail-section"><h2>O que ainda precisa ser confirmado?</h2><p>Antes de afirmar que direitos, prazos ou obrigações mudaram, é necessário conferir a redação integral, as decisões seguintes e, se houver aprovação definitiva, a publicação da norma.</p></section>'+
 '</div><aside class="detail-aside"><h2>Ficha da proposta</h2><dl>'+
 '<div><dt>Identificação</dt><dd>'+safeText(ref(p))+'</dd></div>'+
 '<div><dt>Autoria e partido informado</dt><dd>'+(loaded?(authors.length?initials(authors):(authorsChecked?'Autoria não informada na consulta':'Autoria ainda não verificada')):'Consultando autores…')+'</dd></div>'+
 '<div><dt>Apresentação</dt><dd>'+safeText(dateBR(p.dataApresentacao))+'</dd></div>'+
 '<div><dt>Situação</dt><dd>'+(loaded?badge(status):'Verificando…')+'</dd></div>'+
 '<div><dt>Órgão</dt><dd>'+safeText(stage.siglaOrgao||pendingText)+'</dd></div>'+
 '<div><dt>Registro de tramitação</dt><dd>'+safeText(stage.dataHora?dateBR(stage.dataHora):pendingText)+'</dd></div>'+
 '</dl><div class="detail-links"><a class="primary-btn" target="_blank" rel="noopener noreferrer" href="'+officialURL(p)+'">Consultar na Câmara ↗</a>'+
 (full?'<a class="outline-btn" target="_blank" rel="noopener noreferrer" href="'+safeText(full)+'">Texto integral ↗</a>':'')+'</div>'+
 (verifiedAt?'<p class="small-note">Situação consultada na fonte oficial em '+safeText(verifiedAt)+'. Os registros podem mudar.</p>':'<p class="small-note">Detalhes oficiais ainda não sincronizados. A ficha será complementada quando a fonte estiver disponível.</p>')+
 '<p class="small-note">O partido exibido corresponde à informação obtida na fonte oficial e pode refletir a filiação na apresentação, não necessariamente a atual.</p>'+
 '</aside></div></div>';
}
export function infoPage(){
 return '<div class="page inforoute"><p class="eyebrow">Como funciona</p><h1>Entender antes de opinar.</h1>'+
 '<p class="lead">O que muda? explica, em linguagem clara, propostas da Câmara dos Deputados. Proposta não é lei.</p>'+
 '<div class="steps"><article class="step"><div class="number">01</div><h2>Busque um assunto</h2><p>Encontre propostas por palavra, ano, tipo ou partido do autor.</p></article>'+
 '<article class="step"><div class="number">02</div><h2>Entenda a proposta</h2><p>“O que muda” explica de forma resumida aquilo que o projeto pretende alterar, sem confundir propostas e leis em vigor.</p></article>'+
 '<article class="step"><div class="number">03</div><h2>Confira a fonte</h2><p>Consulte o texto integral, os autores e o andamento na base oficial.</p></article></div>'+
 '<div class="notice" style="margin-top:26px"><strong>Transparência editorial.</strong> Títulos não revisados são sugestões automáticas derivadas da ementa. A classificação temática é auxiliar. A aprovação em uma comissão não equivale à aprovação final.</div>'+
 '<p style="margin-top:26px"><a class="primary-btn" href="#/explorar">Explorar propostas →</a></p></div>';
}
