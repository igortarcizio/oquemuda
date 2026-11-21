import {safeText,ref,dateBR,officialURL,cleanText,classifyTheme} from '../lib/text.js';
import {THEMES as THEME_LIST} from '../lib/themes.js';
import {displayTitle,amendedLaws,isReviewed,hasCuratedTitle} from '../lib/titles.js?v=editorial-titles-lote-011b';
import {lawsInEmenta,actionOf,procedureNote,editorialChange,plainSummary} from '../lib/changes.js';
import {proposalTypeInfo} from '../lib/proposal-types.js';
import {shareButton} from './share-menu.js?v=1';

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
import {historyHTML,versionNote} from '../lib/tramitacoes.js';
import {orgaoRotulo} from '../lib/orgaos.js';
import {apensacaoHTML,showsApensacao} from '../lib/apensacao.js';
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
// Ações do rodapé do card: compartilhar (só ícone) + salvar.
const cardActions=(p,e,saved)=>'<span class="card-actions">'+shareButton(p.id,{ref:ref(p),title:displayTitle(p,e)})+saveButton(p,saved)+'</span>';
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
   '<div class="card-bottom">'+(reviewed?SEAL:'<span class="read-hint" aria-hidden="true">Ler ficha →</span>')+cardActions(p,e,saved)+'</div></article>';
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
    '<div class="card-bottom"><span class="read-hint" aria-hidden="true">'+(reviewed?'Ler explicação →':'Ler ficha →')+'</span>'+cardActions(p,e,saved)+'</div>'+
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
 return {discussion:1,voting:2,approved:3,law:4}[status.tone]??null;
}
function timeline(status,presentedAt){
 if(status?.tone==='closed')return '<p class="closed-note">A tramitação foi encerrada: '+safeText(status.detail||status.label)+'.</p>';
 const idx=stageIndex(status);
 if(idx==null)return '<p>'+badge(status)+'</p><p class="small-note">Etapa ainda não confirmada na fonte oficial.</p>';
 return '<ol class="timeline" aria-label="Etapas da tramitação">'+STEPS.map((step,i)=>
  '<li class="'+(i<=idx?'done':'')+(i===idx?' now':'')+'"'+(i===idx?' aria-current="step"':'')+'>'+step+
  (i===0?'<small>'+safeText(dateBR(presentedAt))+'</small>':i===idx?'<small>'+(status.tone==='law'?'virou lei':'etapa atual')+'</small>':'')+'</li>').join('')+'</ol>';
}

// Rito: o que ainda precisa acontecer para virar regra (varia pelo tipo).
function riteNote(p){
 const tipo=String(p.siglaTipo||'').toUpperCase();
 if(p.virouLei)return 'Esta proposta já foi transformada em lei. A explicação descreve o texto da proposta: confira a lei publicada para saber exatamente o que vale.';
 if(tipo==='MPV')return procedureNote(p);
 if(tipo==='PEC')return 'Proposta não é lei: o texto ainda pode mudar e precisa ser aprovado em dois turnos na Câmara e no Senado.';
 if(tipo==='PDL'||tipo==='PRC')return 'Proposta não é lei: o texto ainda pode mudar e precisa ser aprovado pelo Congresso.';
 return 'Proposta não é lei: o texto ainda pode mudar e precisa passar pela Câmara, pelo Senado e pela sanção.'+(tipo==='PLP'?' '+procedureNote(p).replace(/^Projeto de lei complementar: /,'Por ser lei complementar, '):'');
}
/** "O que a proposta quer mudar?": resumo, como é hoje x como ficaria (só com validação), o que o texto faz, leis e áreas. */
export function changeSection(p,e,{reviewed,title,area,ai=null}){
 const action=actionOf(p),laws=lawsInEmenta(p.ementa),human=editorialChange(e);
 // Prioridade: redação (validado) > IA a partir do texto integral > automático da ementa.
 const fromAI=!human&&ai?editorialChange({...ai,validado:ai.gerado_em||'ia'}):null;
 const ed=human||fromAI;
 const lead=ed?.resumo||plainSummary(p,title);
 const lawLabel=/altera|revoga/.test(action.kind)?(laws.length>1?'Leis que muda':'Lei que muda'):(laws.length>1?'Leis citadas':'Lei citada');
 const tags=proposalTags(p);
 const areaChips=ed?.areas?.length?ed.areas.map(a=>'<li>'+safeText(a)+'</li>').join(''):'';
 // Quem escreveu e qual versão: vai junto quando o leitor reporta um problema (report-problem.js).
 const fonte=human?'redacao':fromAI?'ia':'automatico',versao=human?human.validado:fromAI?String(ai.gerado_em||''):'';
 return '<section class="detail-section change-section" aria-labelledby="changeTitle" data-fonte="'+fonte+'" data-versao="'+safeText(versao)+'"><h2 id="changeTitle">O que a proposta quer mudar?</h2>'+
  versionNote(p.textoAtual||null,{fonte,ai:fromAI?ai:null})+
  (lead?'<p class="change-lead">'+safeText(lead)+'</p>':'')+
  (ed&&(ed.hoje||ed.proposta)?'<div class="change-compare">'+
    (ed.hoje?'<div class="change-now"><h3>Como é hoje</h3><p>'+safeText(ed.hoje)+'</p></div>':'')+
    (ed.proposta?'<div class="change-next"><h3>Como ficaria</h3><p>'+safeText(ed.proposta)+'</p></div>':'')+'</div>':'')+
  (ed?.pontos?.length?'<h3 class="change-sub">O que muda na prática</h3><ul class="change-points">'+ed.pontos.map(x=>'<li>'+safeText(x)+'</li>').join('')+'</ul>':'')+
  '<dl class="change-facts">'+
   '<div><dt>O que o texto faz</dt><dd><strong>'+safeText(action.label)+'.</strong> '+safeText(action.explica)+'</dd></div>'+
   (laws.length?'<div><dt>'+lawLabel+'</dt><dd><ul class="change-laws">'+laws.map(l=>'<li>'+(l.nome?'<strong>'+safeText(l.nome)+'</strong> <span class="law-ref">('+safeText(l.ref)+')</span>':'<strong>'+safeText(l.ref)+'</strong>')+(l.sobre?': '+safeText(l.sobre)+'.':'.')+'</li>').join('')+'</ul></dd></div>':'')+
   '<div><dt>Áreas que podem ser afetadas</dt><dd>'+(areaChips?'<ul class="change-areas">'+areaChips+'</ul>':
     '<div class="change-areas-auto">'+topicLabel(area)+(tags.length?subjectLinks(p):'')+'</div>')+'</dd></div>'+
  '</dl>'+
  (fromAI?'':
   ed?'<p class="small-note">Resumo, “Como é hoje” e “Como ficaria” foram escritos pela redação a partir do '+(ed.fonte?safeText(ed.fonte):'texto integral da proposta')+' e revisados em '+safeText(dateBR(ed.validado))+'.</p>':
   '<p class="small-note">Resumo automático, feito a partir da ementa oficial'+(reviewed?'.':'. Ainda não foi explicado pela redação.')+'</p>')+
  '<p class="small-note">'+safeText(riteNote(p))+'</p></section>';
}
/** Aviso do resumo por IA, mostrado no rodapé da página (ver ai-summary.js). */
export const AI_NOTICE_HTML='<strong>Resumo gerado por IA.</strong> Resumo, “Como é hoje”, “Como ficaria” e “O que muda na prática” foram gerados por inteligência artificial a partir do texto integral da proposta. Podem conter erros: confira o texto oficial antes de tirar conclusões.';
/** Seção "O que muda" recalculada para uma proposta, com o resumo da IA quando houver. */
export function changeSectionFor(p,ai=null){
 const e=editorial(p);
 return changeSection(p,e,{reviewed:isReviewed(e),title:displayTitle(p,e),area:themeOf(p,e),ai});
}
export function hasValidatedEditorial(p){return !!editorialChange(editorial(p))}
export function detailPage(p,{status,authors=[],stage={},tramitacoes=[],textoAtual=null,apensacao=null,fullTextURL=null,source='ao vivo',loaded=false,authorsChecked=false,lastChecked=null,backHref='#/explorar'}={},saved=false){
 const e=editorial(p),reviewed=isReviewed(e),title=displayTitle(p,e),area=themeOf(p,e);
 const safeURL=(url)=>typeof url==='string'&&url.startsWith('https://www.camara.leg.br/')?url:null;
 const full=safeURL(fullTextURL);
 const pendingText=lastChecked?'Não informado no registro consultado':'Em atualização';
 const verifiedAt=lastChecked?new Date(lastChecked).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):null;
 const backLabel=backHref==='#/explorar'?'← Voltar às propostas':'← Voltar aos resultados';
 const publicos=reviewed&&Array.isArray(e.publicos)?e.publicos.filter(Boolean):[];
 const changes=changeSection(p,e,{reviewed,title,area});
 const typeInfo=proposalTypeInfo(p.siglaTipo);
 return '<div class="detail" data-area="'+safeText(area)+'"><div class="page"><a class="back" href="'+safeText(backHref)+'">'+backLabel+'</a></div>'+
 '<div class="detail-header"><div class="page"><div class="detail-meta">'+topicLabel(area)+'<span>'+safeText(ref(p))+'</span>'+(reviewed?SEAL:'')+'</div>'+
 '<h1 tabindex="-1" id="detailTitle" data-fonte="'+(reviewed||hasCuratedTitle(Number(p.id))?'redacao':'automatico')+'" class="'+(reviewed?'':'auto')+(title.length>110?' long':'')+'">'+safeText(title)+'</h1>'+
 '<div class="detail-actions">'+saveButton(p,saved,'＋ Salvar para depois')+shareButton(p.id,{ref:ref(p),title,withLabel:true})+'<a class="outline-btn" target="_blank" rel="noopener noreferrer" href="'+officialURL(p)+'">Ver na Câmara ↗<span class="sr-only"> (abre em nova aba)</span></a></div></div></div>'+
 '<div class="page detail-layout"><div>'+
 changes+
 (publicos.length?'<section class="detail-section"><h2>Quem pode ser afetado</h2><ul class="who-row">'+publicos.map(x=>'<li>'+safeText(x)+'</li>').join('')+'</ul></section>':'')+
 '<section class="detail-section"><h2>Em que etapa está?</h2>'+(loaded&&showsApensacao(apensacao,status)?apensacaoHTML(apensacao):'')+(loaded?timeline(status,p.dataApresentacao):'<p>Verificando andamento na Câmara…</p>')+
 (loaded&&tramitacoes.length?historyHTML(tramitacoes,textoAtual||p.textoAtual||null):'')+
 (!tramitacoes.length&&stage.descricaoTramitacao?'<p class="small-note">Último registro oficial: '+safeText(stage.descricaoTramitacao)+(stage.siglaOrgao?' ('+safeText(orgaoRotulo(stage.siglaOrgao))+')':'')+(stage.dataHora?', '+safeText(dateBR(stage.dataHora)):'')+'.</p>':'')+
 '<div id="jointList" class="joint-list-wrap" hidden></div>'+
 '<p class="small-note">Aprovação em comissão não é aprovação final pela Câmara.</p></section>'+
 '<section class="detail-section"><h2>Texto oficial</h2><div class="quote-official"><span class="eyebrow">Ementa</span><p>'+safeText(p.ementa)+'</p></div></section>'+
 '<div id="reportProblem" class="report-problem" hidden></div>'+
 '</div><div class="detail-side"><aside class="detail-aside" aria-labelledby="fichaTitle"><h2 id="fichaTitle">Ficha</h2><dl>'+
 '<div><dt>Identificação</dt><dd>'+safeText(ref(p))+(typeInfo?'<span class="type-name">'+safeText(typeInfo.title)+'</span><span class="type-desc">'+safeText(typeInfo.description)+'</span>':'')+'</dd></div>'+
 '<div><dt>Autoria</dt><dd>'+(loaded?(authors.length?initials(authors):(authorsChecked?'Não informada na consulta':'Ainda não verificada')):'Consultando autores…')+'</dd></div>'+
 '<div><dt>Apresentação</dt><dd>'+safeText(dateBR(p.dataApresentacao))+'</dd></div>'+
 '<div><dt>Situação</dt><dd>'+(loaded?badge(status):'Verificando…')+'</dd></div>'+
 '<div><dt>'+(status?.tone==='law'||status?.tone==='closed'?'Último órgão':'Onde está')+'</dt><dd>'+safeText(stage.siglaOrgao?orgaoRotulo(stage.siglaOrgao):pendingText)+'</dd></div>'+
 '<div><dt>Assuntos</dt><dd>'+subjectLinks(p)+'</dd></div>'+
 (p.temasOficiais?.length?'<div><dt>Tema oficial na Câmara</dt><dd>'+p.temasOficiais.map(safeText).join('; ')+'</dd></div>':'')+
 '</dl>'+(full?'<div class="detail-links"><a class="primary-btn" target="_blank" rel="noopener noreferrer" href="'+safeText(full)+'">Ler texto integral ↗<span class="sr-only"> (abre em nova aba)</span></a></div>':'')+
 (verifiedAt?'<p class="small-note">Situação consultada na fonte oficial em '+safeText(verifiedAt)+'. Os registros podem mudar.</p>':'<p class="small-note">Detalhes oficiais ainda não sincronizados. A ficha será complementada quando a fonte estiver disponível.</p>')+
 '<p class="small-note">O partido indicado é o informado pela Câmara e pode ser o da época da apresentação.</p>'+
 '</aside><section id="readerVotes" class="detail-section reader-votes" aria-labelledby="votesHeading" hidden></section></div></div><div class="page"><section id="relatedProposals" class="related-proposals" aria-labelledby="relatedHeading" hidden></section></div></div>';
}
export function infoPage(){
 return '<div class="page inforoute"><p class="eyebrow">Como funciona</p><h1 tabindex="-1" id="infoTitle">Entender antes de opinar.</h1>'+
 '<p class="lead">“O que muda?” explica, em linguagem clara, propostas da Câmara dos Deputados. Proposta não é lei.</p>'+
 '<div class="steps"><article class="step"><div class="number">01</div><h2>Busque um assunto</h2><p>Encontre propostas por palavra, ano, tipo ou partido do autor.</p></article>'+
 '<article class="step"><div class="number">02</div><h2>Entenda a proposta</h2><p>“O que muda” explica de forma resumida aquilo que o projeto pretende alterar, sem confundir propostas e leis em vigor.</p></article>'+
 '<article class="step"><div class="number">03</div><h2>Confira a fonte</h2><p>Consulte o texto integral, os autores e o andamento na base oficial.</p></article></div>'+
 '<div class="notice" style="margin-top:26px"><strong>Transparência editorial.</strong> Propostas com o selo “Explicado pela redação” foram lidas por uma pessoa, que escreveu o título em forma de pergunta e o resumo. Nas demais, o título é gerado automaticamente a partir da ementa oficial e descreve o que o texto faz, sem interpretar. A classificação temática também é automática. A aprovação em uma comissão não equivale à aprovação final.</div>'+
 '<section style="margin-top:26px"><h2>Temas e tags</h2><p>Os temas agrupam áreas gerais, como Saúde ou Direitos e cidadania. O site usa 13 temas, convertidos a partir da classificação oficial que a própria Câmara faz de cada proposta. Quando a Câmara dá mais de um tema, a proposta aparece em todos esses filtros, e a cor do card mostra o tema principal. Propostas muito recentes, que a Câmara ainda não classificou, recebem um tema calculado pelo site a partir da ementa até a classificação oficial sair.</p><p>As tags identificam assuntos específicos, como SUS, Diabetes e Vacinação, com base na ementa oficial. Clique em uma tag para consultar todas as propostas com o mesmo assunto no acervo disponível. As tags são automáticas e podem ser aperfeiçoadas.</p></section><section id="selecao-destaques" style="margin-top:26px"><h2>Como os destaques são escolhidos</h2><p>A seleção é automática e consultada diariamente. Os critérios consideram o interesse público, o tema e os possíveis efeitos das propostas no cotidiano, com base nas informações disponíveis nos registros oficiais.</p><p>Os três destaques são substituídos quando surgem novas propostas que atendem aos critérios. Sem novidades qualificadas, os anteriores permanecem. A seleção automática não significa revisão humana de cada texto nem representa apoio às propostas ou aos seus autores.</p></section>'+
 '<section style="margin-top:26px"><h2>Resumos gerados por IA</h2><p>Para que toda proposta tenha uma explicação além da ementa, um programa lê o texto integral publicado pela Câmara e usa inteligência artificial para escrever o resumo, como é hoje, como ficaria e o que muda na prática. Esses textos aparecem com o aviso “Resumo gerado por IA · sem revisão humana” e podem conter erros. Quando a redação revisa uma proposta, o texto revisado substitui o da IA e ganha o selo “Explicado pela redação”.</p></section>'+
 '<section style="margin-top:26px"><h2>Reportar um problema</h2><p>Se o título, o resumo ou a explicação de uma proposta estiver errado, desatualizado ou confuso, use “Encontrou um erro no título ou na explicação? Reportar” na ficha. O reporte é anônimo e vai para a equipe, que revisa cada caso. Nenhum texto sai do ar automaticamente, por mais reportes que receba: quanto mais pessoas apontam o mesmo problema, antes ele é revisado.</p></section>'+
 '<section style="margin-top:26px"><h2>Termômetro dos leitores</h2><p>Na ficha de cada proposta, você pode dizer se é a favor, neutro ou contra. O voto é anônimo: guardamos só um código aleatório deste navegador, sem nome, e-mail ou endereço IP. O resultado mostra a opinião de quem lê o site, aparece a partir de 5 votos e não é pesquisa de opinião: não representa a população nem o que o Congresso vai decidir.</p></section>'+
 '<p style="margin-top:26px"><a class="primary-btn" href="#/explorar">Explorar propostas →</a></p></div>';
}
