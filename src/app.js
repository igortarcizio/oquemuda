import {proposalTypeInfo} from './lib/proposal-types.js';
import {getProposals,getDatabaseProposals,getDatabaseDetail,getDailyFeatured,getDetail,getAuthors,getParties,fromSnapshot,getJointProposals} from './data/api.js?v=editorial-titles-lote-018';
import {THEMES,safeText,ref,cleanText} from './lib/text.js';
import {STATUS,APPROVED_CODES,CLOSED_CODES} from './lib/status.js?v=status-apresentada';
import {jointListHTML} from './lib/apensacao.js';
import {parseSearch,refLabel} from './lib/search.js?v=busca-texto-1';
import {getSaved,isSaved,toggleSaved,savedCount} from './lib/storage.js';
import {card,editorialFeature,skeleton,pagination,detailPage,infoPage,badge} from './ui/components.js?v=editorial-titles-lote-018';
import {toggleHistory} from './lib/tramitacoes.js?v=senado-1';
import {filterVotes} from './lib/votacoes.js?v=status-apresentada';
import {editorialAllowed,selectEditorial} from './lib/editorial.js';
import {mountRelated,stopRelated} from './ui/related-proposals.js';
import {mountVotes,stopVotes} from './ui/reader-votes.js?v=modulos-2';
import {mountAiSummary,stopAiSummary,watchCardTitles,prefetchAiTitles} from './ui/ai-summary.js?v=editorial-titles-lote-018';
import {mountReport,stopReport} from './ui/report-problem.js?v=1';
import {openShare,closeShare} from './ui/share-menu.js?v=1';

const $=id=>document.getElementById(id);
const pageSize=30;
// Anos oferecidos no filtro = anos presentes no acervo (o banco cobre os mesmos anos da cópia local).
const CURRENT_YEAR=new Date().getFullYear();
const YEARS=(()=>{const y=[...new Set((window.OBM_DATA?.years||[]).map(Number).filter(Number.isInteger))].sort((a,b)=>b-a);return y.length?y:[CURRENT_YEAR,CURRENT_YEAR-1]})();
const DEFAULT_YEAR=String(YEARS[0]);
const defaultYearFor=q=>q.get('modo')||q.get('tag')?'Todos':DEFAULT_YEAR;
const WATCH_MODES={recent:{label:'Novas propostas',hint:'Propostas apresentadas nos últimos 30 dias, ordenadas pela data de apresentação.',codes:''},voting:{label:'Prontas para pauta',hint:'Situação oficial: Pronta para Pauta. A votação ainda não está confirmada.',codes:'924'},approved:{label:'Aprovadas na Câmara',hint:'Propostas que a Câmara aprovou e enviou ao Senado ou à sanção, e as que já viraram lei (selo “Virou lei”). Sem esse selo, aprovação na Câmara não significa lei em vigor.',codes:APPROVED_CODES.join(',')},closed:{label:'Arquivadas ou recusadas',hint:'A maioria foi arquivada sem votação, por exemplo no fim da legislatura. Arquivar não significa que a Câmara votou contra.',codes:CLOSED_CODES.join(',')}};
const state={view:'explorar',page:1,year:DEFAULT_YEAR,type:'Todos',party:'Todos',topic:'Todos',query:'',tag:'',mode:'',sort:'etapa',
  items:[],totalPages:null,hasNext:false,featuredResult:null,source:'ao vivo',error:'',loading:false};
let sequence=0,activeRequest=null,detailSequence=0,observer=null,lastListHash='#/explorar',firstRender=true;
const statusCache=new Map(),statusQueued=new Set(),statusQueue=[];
let activeStatus=0;
function announce(text){$('announcer').textContent=text}
function cacheKey(id){return 'oquemuda:status:v1:'+id}
function cachedStatus(id){
 if(statusCache.has(id))return statusCache.get(id);
 try{const s=JSON.parse(sessionStorage.getItem(cacheKey(id)));if(s&&s.until>Date.now()){statusCache.set(id,s.status);return s.status}}catch{}
 return null;
}
function renderStatus(id,status){
 const reliable=!!status && status.tone!=='pending';
 if(reliable){
  statusCache.set(id,status);
  try{sessionStorage.setItem(cacheKey(id),JSON.stringify({status,until:Date.now()+10*60_000}))}catch{}
 }else{
  statusCache.delete(id);
  try{sessionStorage.removeItem(cacheKey(id))}catch{}
 }
 for(const el of document.querySelectorAll('[data-status-id="'+id+'"]'))el.innerHTML=badge(status,el.hasAttribute('data-stage'));
}
function queueStatus(id){
 if(!id||cachedStatus(id)||statusQueued.has(id))return;
 statusQueued.add(id);statusQueue.push(id);workStatus();
}
function workStatus(){
 while(activeStatus<3&&statusQueue.length){
  const id=statusQueue.shift();activeStatus++;
  getDetail(id).then(d=>renderStatus(id,d.status)).catch(()=>renderStatus(id,{...STATUS.unknown,detail:'Não foi possível consultar a situação agora.'}))
    .finally(()=>{activeStatus--;statusQueued.delete(id);workStatus()});
 }
}
function observeStatuses(){
 observer?.disconnect();
 if(!('IntersectionObserver' in window)){
  document.querySelectorAll('#cards [data-status-id],#editorialSection [data-status-id]').forEach(el=>queueStatus(Number(el.dataset.statusId)));return;
 }
 observer=new IntersectionObserver(entries=>{
  for(const entry of entries){if(entry.isIntersecting){const id=Number(entry.target.dataset.statusId);observer.unobserve(entry.target);queueStatus(id)}}
 },{rootMargin:'240px 0px'});
 document.querySelectorAll('#cards [data-status-id],#editorialSection [data-status-id]').forEach(el=>{
  const c=cachedStatus(Number(el.dataset.statusId));
  if(c)el.innerHTML=badge(c,el.hasAttribute('data-stage'));else observer.observe(el);
 });
}
function renderChips(){
 // Os botões são criados uma vez; depois só o estado muda, para o foco do teclado não se perder.
 if(!$('chips').children.length){
  $('chips').innerHTML=THEMES.map(theme=>'<button type="button" class="chip" aria-pressed="false" data-area="'+safeText(theme)+'" data-theme="'+safeText(theme)+'">'+(theme==='Todos'?'':'<span class="topic-dot" aria-hidden="true"></span>')+safeText(theme)+'</button>').join('');
 }
 for(const chip of $('chips').querySelectorAll('[data-theme]')){
  const on=chip.dataset.theme===state.topic;
  chip.classList.toggle('active',on);chip.setAttribute('aria-pressed',String(on));
 }
}
function filterFromUI(){
 state.year=$('yearSelect').value;state.type=$('typeSelect').value;state.party=$('partySelect').value;
 state.query=cleanText($('searchField').value);
}
function syncForm(){
 $('yearSelect').value=state.year;$('typeSelect').value=state.type;$('partySelect').value=state.party;
 $('searchField').value=state.query;renderChips();
 // Lista única: apresentadas e as que mudaram de etapa juntas, pela data mais recente.
 // Só com palavras buscadas aparece a opção "Mais relevantes" (não para número de proposta).
 const words=!!parseSearch(state.query).query;
 $('sortControl').hidden=!words||state.view!=='explorar'||state.mode==='recent';
 $('sortSelect').value=effectiveSort();
}
/** Ordem da consulta: etapa (padrão); relevância só com palavras; "Novas propostas" pela apresentação. */
// Última lista e destaques mostrados, guardados na aba por 10 minutos:
// ao voltar de uma proposta ou recarregar, a página reaparece igual, sem trocar cards nem títulos.
const LIST_TTL=10*60_000;
const listKey=()=>'oquemuda:lista:v1:'+JSON.stringify([state.page,state.year,state.type,state.party,state.query,state.tag,state.topic,state.mode,effectiveSort()]);
function readSession(key){try{const s=JSON.parse(sessionStorage.getItem(key));return s&&s.until>Date.now()?s.value:null}catch{return null}}
function keepSession(key,value){try{sessionStorage.setItem(key,JSON.stringify({until:Date.now()+LIST_TTL,value}))}catch{}}
const FEATURED_KEY='oquemuda:destaques:v1';
function effectiveSort(){
 if(state.mode==='recent')return 'recentes';
 if(state.sort==='relevancia'&&!parseSearch(state.query).query)return 'etapa';
 return state.sort;
}
function paramsForHash(){
 const args=new URLSearchParams({page:String(state.page),ano:state.year,tipo:state.type});
 if(state.party!=='Todos')args.set('partido',state.party);
 if(state.topic!=='Todos')args.set('tema',state.topic);
 if(state.query)args.set('busca',state.query);
 if(effectiveSort()==='relevancia')args.set('ordem','relevancia');
 if(state.mode)args.set('modo',state.mode);
 if(state.tag)args.set('tag',state.tag);
 return args.toString();
}
function syncURL(){
 const base=state.view==='salvos'?'salvos':'explorar';
 const args=state.view==='salvos'?'page='+state.page:paramsForHash();
 history.replaceState(null,'',location.pathname+location.search+'#/'+base+'?'+args);
}
function readHash(){
 const route=location.hash.slice(2)||'explorar',name=(route.split('?')[0]||'explorar').split('/')[0];
 const q=new URLSearchParams(route.split('?')[1]||'');
 state.view=name==='salvos'||name==='como-funciona'||name==='explorar'?name:name==='tema'?'detalhe':'explorar';
 state.page=Math.max(1,Number(q.get('page')||1)||1);
 if(state.view==='explorar'){
  state.year=q.get('ano')||defaultYearFor(q);state.type=q.get('tipo')||'Todos';
  state.party=q.get('partido')||'Todos';state.topic=THEMES.includes(q.get('tema'))?q.get('tema'):'Todos';state.query=q.get('busca')||'';
  state.sort=q.get('ordem')==='relevancia'?'relevancia':'etapa';
  state.tag=q.get('tag')||'';
  state.mode=Object.hasOwn(WATCH_MODES,q.get('modo'))?q.get('modo'):'';
 }
 return name==='tema'?route.split('?')[0].split('/')[1]:null;
}
function setPage(newPage){
 state.page=Math.max(1,newPage);syncURL();showList();
 window.scrollTo({top:Math.max(0,$('feed').getBoundingClientRect().top+window.scrollY-18),behavior:'instant'});
 $('listTitle').focus({preventScroll:true});
}
function setNav(){
 for(const item of ['explorar','salvos','como-funciona']){
  const el=$('nav-'+item),on=state.view===item;
  el?.classList.toggle('active',on);
  if(on)el?.setAttribute('aria-current','page');else el?.removeAttribute('aria-current');
 }
 $('savedCounter').textContent=String(savedCount());$('savedCounter').hidden=savedCount()===0;
}
function setViews(){
 const isFeed=state.view==='explorar'||state.view==='salvos';
 $('hero').hidden=!isFeed;$('feed').hidden=!isFeed;
 $('editorialSection').hidden=!isFeed;
 $('detailView').hidden=state.view!=='detalhe';$('infoView').hidden=state.view!=='como-funciona';
 if(isFeed){
  $('heroEyebrow').textContent=state.view==='salvos'?'Salvos':'POLÍTICA E COTIDIANO';
  $('heroTitle').innerHTML=state.view==='salvos'?'Para ler com calma.':'O que está sendo decidido pode mudar <span class="hero-emphasis">sua rotina</span>.';
  $('heroSubtitle').textContent=state.view==='salvos'?'Propostas guardadas neste navegador.':'Entenda o que propõem os textos apresentados à Câmara dos Deputados, quem pode ser afetado e em que etapa estão.';
  $('searchForm').hidden=state.view==='salvos';$('filters').hidden=state.view==='salvos';
  $('chips').hidden=state.view==='salvos';$('sideindex').hidden=state.view==='salvos';
  document.querySelectorAll('[data-watch]').forEach(a=>{const selected=state.mode===a.dataset.watch;a.classList.toggle('selected',selected);if(selected)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')});
  $('listTitle').textContent=state.view==='salvos'?'Assuntos salvos':state.mode?WATCH_MODES[state.mode].label:state.tag?'Propostas sobre '+state.tag:state.topic!=='Todos'?'Propostas de '+state.topic:'Explore as propostas';
  const typeInfo=state.view==='explorar'?proposalTypeInfo(state.type):null;
  $('proposalTypeInfo').hidden=!typeInfo;
  $('proposalTypeTitle').textContent=typeInfo?state.type+' · '+typeInfo.title:'';
  $('proposalTypeDescription').textContent=typeInfo?.description||'';
  renderActiveFilters();
 }
}
/** Filtros aplicados viram etiquetas removíveis (×); com mais de um, aparece "Limpar tudo". */
function activeFilterList(){
 const out=[];
 if(state.query)out.push(['Busca: '+state.query,{query:''}]);
 if(state.mode)out.push([WATCH_MODES[state.mode].label,{mode:''}]);
 if(state.tag)out.push(['Assunto: '+state.tag,{tag:''}]);
 if(state.topic!=='Todos')out.push(['Tema: '+state.topic,{topic:'Todos'}]);
 if(state.type!=='Todos')out.push(['Tipo: '+state.type,{type:'Todos'}]);
 if(state.party!=='Todos')out.push(['Partido: '+state.party,{party:'Todos'}]);
 const defaultYear=state.mode||state.tag?'Todos':DEFAULT_YEAR;
 if(state.year!==defaultYear)out.push([state.year==='Todos'?'Todos os anos':'Ano: '+state.year,{year:defaultYear}]);
 return out;
}
function renderActiveFilters(){
 const list=state.view==='explorar'?activeFilterList():[];
 $('activeFilters').innerHTML=list.map(([label,unset])=>'<span class="pill">'+safeText(label)+'<button type="button" data-unset="'+safeText(JSON.stringify(unset))+'" aria-label="Remover '+safeText(label)+'">×</button></span>').join('')+
  (list.length>1?'<button type="button" class="quiet-btn" data-clear>Limpar tudo</button>':'');
 $('activeFilters').hidden=!list.length;
 const extra=(state.type!=='Todos'?1:0)+(state.party!=='Todos'?1:0)+(state.year!==DEFAULT_YEAR&&!state.mode&&!state.tag?1:0);
 $('filterCount').textContent=extra;$('filterCount').hidden=!extra;
}
/** Lista vazia: diz o motivo e oferece o caminho de volta. */
function emptyState(){
 if(state.view==='salvos')return '<div class="empty-state"><h3>Nada salvo ainda.</h3><p>Use “+ Salvar” em qualquer proposta para guardá-la aqui. Os salvos ficam só neste navegador.</p><div class="empty-actions"><a class="primary-btn" href="#/explorar">Explorar propostas</a></div></div>';
 const searched=parseSearch(state.query).ref;
 if(searched)return '<div class="empty-state"><h3>Não encontramos '+safeText(refLabel(searched))+'.</h3><p>Procuramos no acervo do site e na Câmara dos Deputados. Confira o tipo, o número e o ano'+(searched.ano?'':' (por exemplo, PL 999/2026)')+'. O site acompanha propostas da Câmara: projetos que começaram no Senado têm outro número.</p><div class="empty-actions"><button type="button" class="outline-btn" data-unset=\'{"query":""}\'>Limpar a busca</button></div></div>';
 const tips=[];
 if(state.year!=='Todos')tips.push('<button type="button" class="outline-btn" data-unset=\'{"year":"Todos"}\'>Buscar em todos os anos</button>');
 if(state.topic!=='Todos')tips.push('<button type="button" class="outline-btn" data-unset=\'{"topic":"Todos"}\'>Tirar o tema '+safeText(state.topic)+'</button>');
 if(state.type!=='Todos')tips.push('<button type="button" class="outline-btn" data-unset=\'{"type":"Todos"}\'>Todos os tipos</button>');
 if(state.party!=='Todos')tips.push('<button type="button" class="outline-btn" data-unset=\'{"party":"Todos"}\'>Todos os partidos</button>');
 if(state.query)tips.push('<button type="button" class="outline-btn" data-unset=\'{"query":""}\'>Tirar a palavra “'+safeText(state.query)+'”</button>');
 return '<div class="empty-state"><h3>Nenhuma proposta com esses critérios.</h3><p>'+(state.query?'Nenhuma ementa traz todas as palavras de “'+safeText(state.query)+'”. Tente menos palavras ou um sinônimo. ':'')+
  'O acervo cobre propostas de '+YEARS.slice().reverse().join(' e ')+'.</p>'+(tips.length?'<div class="empty-actions">'+tips.join('')+'</div>':'')+'</div>';
}
function setFooter(text){$('sourceNote').textContent=text}
function loader(){
 if(state.featuredResult?.items?.length)renderEditorial();
 else{$('editorialSection').hidden=true}
 $('cards').innerHTML=skeleton(6);$('cards').setAttribute('aria-busy','true');
 $('pagination').innerHTML='';$('listSubtitle').textContent='Consultando propostas…';
 announce('Consultando propostas. Aguarde.');
}
function renderEditorial(){
 const section=$('editorialSection');
 section.hidden=true;
 $('editorialFeature').innerHTML='';
 $('editorialSupporting').innerHTML='';
 if(!editorialAllowed(state,DEFAULT_YEAR))return;
 // Enquanto os destaques do dia carregam, não mostrar uma escolha provisória que depois seria trocada.
 if(state.featuredLoading&&state.featuredResult?.items?.length!==3)return;
 const selected=state.featuredResult?.items?.length===3?
  state.featuredResult.items:
  selectEditorial(window.OBM_DATA?.items||[],window.OBM_EDITORIAL||{},state.items,{max:3,year:Number(DEFAULT_YEAR)});
 if(selected.length!==3)return;
 for(const p of selected)if(p.statusVerificado)statusCache.set(p.id,p.statusVerificado);
 $('editorialFeature').innerHTML=editorialFeature(selected[0],cachedStatus(selected[0].id),isSaved(selected[0].id));
 $('editorialSupporting').innerHTML=selected.slice(1).map(p=>card(p,cachedStatus(p.id),isSaved(p.id),{highlight:true})).join('');
 section.hidden=false;
}

function present(result){
 state.items=result.items.slice(0,pageSize);state.hasNext=!!result.hasNext;state.totalPages=result.totalPages;
 for(const p of state.items)if(p.statusVerificado)statusCache.set(p.id,p.statusVerificado);
 state.source=result.source;
 $('cards').setAttribute('aria-busy','false');
 $('cards').innerHTML=state.items.length?state.items.map(p=>card(p,cachedStatus(p.id),isSaved(p.id))).join(''):
  (state.mode&&result.source==='situação verificada'?'<div class="empty-state"><h3>Nenhuma proposta confirmada neste lote.</h3><p>Foram conferidos '+Number(result.inspectedCount||0)+' registros desta página; nenhum apresentou a situação buscada. Isso não significa que não existam outras propostas nessa etapa. Experimente outro ano ou avance para a próxima página.</p></div>':emptyState());
 $('pagination').innerHTML=pagination({page:state.page,totalPages:state.totalPages,hasNext:state.hasNext});
 renderEditorial();
 const msg=state.items.length+' '+(state.items.length===1?'proposta':'propostas')+' nesta página · Página '+state.page+
   (state.totalPages?' de '+state.totalPages:'')+(state.source==='cópia parcial'?' · reserva parcial':'');
 const statusLine=state.mode&&result.source==='banco de dados'?msg+' · '+WATCH_MODES[state.mode].hint:state.mode&&result.source==='situação verificada'?state.items.length+' confirmada(s) entre '+Number(result.inspectedCount||0)+' registros verificados nesta página · '+WATCH_MODES[state.mode].hint:msg;
 $('listSubtitle').textContent=statusLine;announce(statusLine);
 setFooter('Fonte: Dados Abertos da Câmara dos Deputados. '+(result.source==='situação verificada'?
  'A situação foi conferida no registro individual de '+Number(result.inspectedCount||0)+' propostas desta página; o recorte não é exaustivo.':
  result.source==='banco de dados'?'A consulta abrange o acervo disponível na plataforma. O acervo é parcial e não reúne todas as propostas da Câmara.':
  result.source==='ao vivo'?'Dados consultados diretamente na Câmara dos Deputados.':
  'Não foi possível atualizar os dados agora. Exibimos a última versão disponível, de '+(window.OBM_DATA?.generatedAt?new Date(window.OBM_DATA.generatedAt).toLocaleString('pt-BR'):'não informada')+'. O acervo disponível é parcial.')+
  ' Propostas não são leis em vigor. Pronta para pauta não confirma votação agendada.');
 if(result.source!=='banco de dados')observeStatuses();else observer?.disconnect();
 setNav();
}
function errorState(message){
 $('cards').setAttribute('aria-busy','false');$('cards').innerHTML='<div class="empty-state"><h3>Não foi possível carregar esta consulta.</h3>'+
 '<p>'+safeText(message)+' Tente novamente em instantes ou consulte o portal da Câmara.</p>'+
 '<div style="margin-top:18px"><button type="button" class="outline-btn" id="retryBtn">Tentar novamente</button> '+
 '<a class="outline-btn" href="https://www.camara.leg.br/busca-portal/proposicoes" target="_blank" rel="noopener noreferrer">Pesquisar na Câmara ↗</a></div></div>';
 renderEditorial();
 $('pagination').innerHTML='';$('listSubtitle').textContent='Consulta indisponível';
 announce('Falha na consulta. Tente novamente.');setFooter('Fonte: Câmara dos Deputados. A consulta está temporariamente indisponível.');
}
async function showList(){
 const id=++sequence;activeRequest?.abort();activeRequest=new AbortController();
 setViews();setNav();
 if(state.view==='salvos'){
  $('sortControl').hidden=true;
  let all=getSaved();
  const totalPages=Math.max(1,Math.ceil(all.length/pageSize));if(state.page>totalPages)state.page=totalPages;
  const items=all.slice((state.page-1)*pageSize,state.page*pageSize);
  present({items,page:state.page,totalPages,hasNext:state.page<totalPages,source:'cópia local'});
  $('listTitle').textContent='Assuntos salvos';setFooter('As propostas salvas permanecem apenas neste navegador. A situação pode ter mudado desde o salvamento.');
  return;
 }
 syncForm();loader();
 const keywords=state.query;
 const theme=state.topic!=='Todos'?state.topic:'';
 const situationCodes=state.mode?WATCH_MODES[state.mode].codes:'';
 // A cópia local é exibida imediatamente; a API oficial atualiza quando responder.
 // Não deixar o visitante preso nos skeletons durante instabilidade externa.
 const shouldFeatureNow=editorialAllowed(state,DEFAULT_YEAR);
 if(shouldFeatureNow&&!state.featuredResult)state.featuredResult=readSession(FEATURED_KEY);
 const kept=readSession(listKey());
 if(kept?.items?.length){
  // Mesma consulta vista há pouco: reaparece idêntica; o banco só confirma depois.
  present(kept);
 }
 const snapshot=!kept&&!state.mode&&!state.tag?fromSnapshot({page:state.page,year:state.year,type:state.type,party:state.party,keywords,area:theme||'Todos'}):null;
 const hasSnapshot=!!kept?.items?.length||!!snapshot?.items?.length;
 if(snapshot?.items?.length){
  // Títulos curtos antes da cópia local também, senão ela aparece com a ementa longa.
  await prefetchAiTitles(snapshot.items.map(p=>p.id));
  if(id!==sequence)return;
  present(snapshot);
  $('listSubtitle').textContent='Exibimos a última versão disponível. Consultando atualizações…';
  announce('Propostas da cópia parcial exibidas. Consultando atualização oficial.');
 }
 try{
  // Os destaques são obtidos antes da busca e retirados da listagem padrão.
  const shouldFeature=shouldFeatureNow;
  if(shouldFeature){
   state.featuredLoading=true;
   try{state.featuredResult=await getDailyFeatured({signal:activeRequest.signal});if(state.featuredResult?.items?.length)keepSession(FEATURED_KEY,state.featuredResult)}
   catch{state.featuredResult=state.featuredResult||null}
   finally{state.featuredLoading=false}
  }
  // Títulos curtos antes de desenhar: o card já nasce com eles (sem piscar o título longo).
  if(state.featuredResult?.items?.length)await prefetchAiTitles(state.featuredResult.items.map(p=>p.id));
  if(id!==sequence)return;
  renderEditorial();
  const excludeIds=shouldFeature?state.featuredResult?.items.filter(p=>(state.type==='Todos'||p.siglaTipo===state.type)&&(state.year==='Todos'||String(p.ano)===String(state.year))).map(p=>p.id)||[]:[];
  const day=new Date();day.setUTCDate(day.getUTCDate()-30);
  const presentedSince=state.mode==='recent'?day.toISOString().slice(0,10):'';
  const args={page:state.page,year:state.year,type:state.type,party:state.party,keywords,tag:state.tag,theme,situationCodes,presentedSince,excludeIds,sort:effectiveSort(),signal:activeRequest.signal};
  let result;
  try{result=await getDatabaseProposals(args)}
  catch(dbError){
   // Não retornar ao filtro de apenas 30 da Câmara nos modos legislativos.
   // A API da Câmara não filtra por etapa, assunto ou tema antes da paginação: sem o banco, avisar em vez de simular.
   if(state.mode||state.tag||theme)throw new Error('A busca de propostas está temporariamente indisponível.');
   result=await getProposals(args);
  }
  // Número de proposta fora do acervo do site: confere direto na Câmara.
  if(!result.items.length&&result.source==='banco de dados'&&parseSearch(keywords).ref){
   try{const live=await getProposals(args);if(live.items.length)result=live}catch{}
  }
  await prefetchAiTitles(result.items.map(p=>p.id));
  if(id!==sequence)return;
  // O banco é a fonte completa: se ele respondeu, vale a resposta dele, mesmo vazia.
  // A cópia parcial só fica quando a consulta ao vivo da Câmara (plano B) volta vazia.
  if(result.items.length||!hasSnapshot||result.source==='banco de dados'){
   if(result.source==='banco de dados')keepSession(listKey(),result);
   present(result);
  }else{
   $('listSubtitle').textContent='Cópia parcial disponível. A consulta oficial não retornou registros nesta página.';
   setFooter('Fonte: cópia parcial da Câmara. A consulta oficial não retornou registros; a cobertura da reserva não é completa.');
  }
 }catch(error){
  if(id!==sequence)return;
  if(hasSnapshot){
   $('listSubtitle').textContent='Não foi possível atualizar os dados agora. Exibimos a última versão disponível.';
   setFooter('Fonte: Câmara dos Deputados. Atualização indisponível; os dados exibidos podem estar desatualizados.');
   return;
  }
  errorState(error.message||'API indisponível');
 }
}
function focusHeading(el){if(el&&!firstRender)el.focus({preventScroll:true})}
function listPageFromHash(){
 stopRelated();stopVotes();stopAiSummary();stopReport();closeShare();
 const previousView=state.view;
 const direct=readHash();setViews();setNav();
 if(state.view==='explorar')lastListHash=location.hash||'#/explorar';
 if(state.view==='detalhe')showDetail(direct);
 else if(state.view==='como-funciona'){$('infoView').innerHTML=infoPage();document.title='Como funciona — o que muda?';window.scrollTo({top:0,behavior:'instant'});focusHeading($('infoTitle'))}
 else{showList();if(previousView!==state.view)focusHeading($('heroTitle'))}
 firstRender=false;
}
async function showDetail(id){
 ++sequence;const task=++detailSequence;setViews();setNav();
 const candidate=[...state.items,...getSaved(),...(window.OBM_DATA?.items||[])].find(p=>String(p.id)===String(id));
 const neutral={...STATUS.unknown};
 const keepFocus=()=>{const h=$('detailTitle');if(h&&(document.activeElement===document.body||!document.activeElement||$('detailView').contains(document.activeElement)&&document.activeElement.id==='detailTitle'))h.focus({preventScroll:true})};
 if(candidate){$('detailView').innerHTML=detailPage(candidate,{loaded:true,status:neutral,backHref:lastListHash},isSaved(candidate.id));mountVotes(candidate);mountAiSummary(candidate);mountReport(candidate)}
 else $('detailView').innerHTML='<div class="page inforoute"><h1>Consultando proposição…</h1><p>Buscando registro disponível.</p></div>';
 document.title='Proposta — o que muda?';window.scrollTo({top:0,behavior:'instant'});
 focusHeading($('detailTitle'));
 let stored=null;
 try{stored=await getDatabaseDetail(id)}catch{}
 if(task!==detailSequence||state.view!=='detalhe')return;
 if(stored){
  $('detailView').innerHTML=detailPage(stored.proposal,{...stored,loaded:true,backHref:lastListHash},isSaved(id));keepFocus();mountVotes(stored.proposal);mountAiSummary(stored.proposal);mountReport(stored.proposal);
  document.title=ref(stored.proposal)+' — O que muda?';
 }
 // Atualização em segundo plano, sem bloquear a ficha que já está no banco.
 const [detailResult,authorsResult]=await Promise.allSettled([
  stored?.stage?.codSituacao!=null?Promise.resolve(null):getDetail(id),
  stored?.authorsChecked?Promise.resolve(stored.authors):getAuthors(id)
 ]);
 if(task!==detailSequence||state.view!=='detalhe')return;
 const detail=detailResult.status==='fulfilled'?detailResult.value:null;
 const authors=authorsResult.status==='fulfilled'&&authorsResult.value.length?authorsResult.value:(stored?.authors||[]);
 const proposal=detail?.proposal||stored?.proposal||candidate;
 // A consulta ao vivo não traz o texto em vigor: herda o que o banco sabe.
 if(proposal&&!proposal.textoAtual&&stored?.proposal?.textoAtual)proposal.textoAtual=stored.proposal.textoAtual;
 if(proposal&&stored?.proposal?.virouLei)proposal.virouLei=true;
 // Tema oficial e classificação da Câmara vêm do banco; a ficha ao vivo não os traz.
 if(proposal&&stored?.proposal&&proposal!==stored.proposal){proposal.area=stored.proposal.area;if(stored.proposal.temasOficiais?.length)proposal.temasOficiais=stored.proposal.temasOficiais}
 if(!proposal){
  $('detailView').innerHTML='<div class="page inforoute"><h1>Não foi possível abrir a proposta.</h1><p>Consulte o registro oficial ou retorne à busca.</p><a href="#/explorar">Voltar para Explorar</a></div>';return;
 }
 const verifiedLive=detail?.status?.label&&detail.status.tone!=='pending';
 const liveStage=detail?.stage||{};
 const preferredStage=liveStage.descricaoTramitacao||liveStage.descricaoSituacao||liveStage.codSituacao!=null?liveStage:(stored?.stage||{});
 $('detailView').innerHTML=detailPage(proposal,{
  ...(stored||{}),...(detail||{}),stage:preferredStage,
  authors,authorsChecked:authorsResult.status==='fulfilled'||stored?.authorsChecked,
  loaded:true,status:verifiedLive?detail.status:(stored?.status||neutral),
  fullTextURL:detail?.fullTextURL||stored?.fullTextURL||null,backHref:lastListHash
 },isSaved(id));
 keepFocus();
 mountVotes(proposal);
 mountAiSummary(proposal);
 mountReport(proposal);
 mountRelated(proposal);
 mountJointList(proposal.id,task);
 document.title=ref(proposal)+' — O que muda?';
}
// Propostas apensadas a esta (só as que o site acompanha). Falha aqui não afeta a ficha.
async function mountJointList(id,task){
 try{
  const {rows,total}=await getJointProposals(id);
  if(task!==detailSequence||state.view!=='detalhe')return;
  const box=$('jointList'),html=jointListHTML(rows,total);
  if(box&&html){box.innerHTML=html;box.hidden=false}
 }catch{}
}

// #cards e #pagination ficam dentro de #feed, e os três escutam cliques: sem esta trava
// o mesmo clique rodava duas vezes (o "+ Salvar" dos cards salvava e desfazia na hora).
const handledClicks=new WeakSet();
function onClick(e){
 if(handledClicks.has(e))return;
 handledClicks.add(e);
 const historyToggle=e.target.closest('[data-history-toggle]');
 if(historyToggle){toggleHistory(document,{fromStage:historyToggle.hasAttribute('data-from-stage'),panelId:historyToggle.getAttribute('aria-controls')||'historyPanel'});return}
 const page=e.target.closest('[data-page]');
 if(page&&!page.disabled){setPage(Number(page.dataset.page));return}
 const theme=e.target.closest('[data-theme]');
 if(theme){state.topic=theme.dataset.theme;state.mode='';state.page=1;syncURL();showList();return}
 const share=e.target.closest('[data-share]');
 if(share){openShare(share,{announce});return}
 const save=e.target.closest('[data-save]');
 if(save){
  const id=Number(save.dataset.save);
  const p=[...state.items,...getSaved(),...(window.OBM_DATA?.items||[])].find(x=>Number(x.id)===id);
  if(p){
   const now=toggleSaved(p);setNav();
   if(state.view==='salvos')showList();
   else for(const b of document.querySelectorAll('[data-save="'+id+'"]')){
    b.textContent=now?'✓ Salvo':b.closest('.detail-actions')?'＋ Salvar para depois':'+ Salvar';
    b.setAttribute('aria-pressed',String(now));b.classList.toggle('saved',now);
    b.setAttribute('aria-label',(now?'Remover dos salvos ':'Salvar ')+ref(p));
   }
   announce(now?'Proposição salva neste navegador.':'Proposição removida dos salvos.');
  }return
 }
 const unset=e.target.closest('[data-unset]');
 if(unset){Object.assign(state,JSON.parse(unset.dataset.unset));state.page=1;syncForm();syncURL();showList();$('listTitle').focus({preventScroll:true});return}
 if(e.target.closest('[data-clear]')){
  state.query='';state.tag='';state.topic='Todos';state.party='Todos';state.year=DEFAULT_YEAR;state.type='Todos';state.mode='';state.page=1;
  syncForm();syncURL();showList();return;
 }
 if(e.target.closest('#retryBtn'))showList();
}
function onChange(e){
 const voteBox=e.target.closest?.('[data-vote-box]');
 if(voteBox&&e.target.matches('[data-vote-filter]')){filterVotes(voteBox);return}
 if(['yearSelect','typeSelect','partySelect'].includes(e.target.id)){
  filterFromUI();state.page=1;syncURL();showList();
 }
 if(e.target.id==='sortSelect'){
  state.sort=e.target.value==='relevancia'?'relevancia':'etapa';state.page=1;syncURL();showList();
  announce(state.sort==='relevancia'?'Resultados ordenados pelos mais relevantes.':'Resultados ordenados pelos mais recentes.');
 }
}
async function start(){
 // Ano: só os anos do acervo. Os atalhos "De olho na Câmara" valem para todos os anos (ano=Todos no HTML).
 $('yearSelect').innerHTML='<option value="Todos">Todos os anos</option>'+YEARS.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
 $('cards').addEventListener('click',onClick);
 $('editorialSection').addEventListener('click',onClick);
 $('pagination').addEventListener('click',onClick);
 $('chips').addEventListener('click',onClick);
 $('detailView').addEventListener('click',onClick);
 $('feed').addEventListener('click',onClick);
 // Celular: ano, tipo e partido ficam recolhidos atrás do botão "Filtros".
 $('filtersToggle').addEventListener('click',()=>{const open=$('filters').classList.toggle('open');$('filtersToggle').setAttribute('aria-expanded',String(open))});
 document.addEventListener('change',onChange);
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();filterFromUI();state.mode='';state.page=1;syncURL();showList()});
 window.addEventListener('hashchange',listPageFromHash);
 watchCardTitles();
 listPageFromHash();
 try{const parties=await getParties();$('partySelect').innerHTML='<option value="Todos">Todos os partidos</option>'+
  parties.map(p=>'<option value="'+safeText(p)+'">'+safeText(p)+'</option>').join('');$('partySelect').value=state.party;}catch{}
}
start();


