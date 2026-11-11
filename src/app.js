import {proposalTypeInfo} from './lib/proposal-types.js';
import {getProposals,getDatabaseProposals,getDatabaseDetail,getDailyFeatured,getDetail,getAuthors,getParties,fromSnapshot} from './data/api.js?v=subjects-20261111';
import {THEMES,TOPIC_API,safeText,ref,cleanText} from './lib/text.js';
import {getSaved,isSaved,toggleSaved,savedCount} from './lib/storage.js';
import {card,editorialFeature,skeleton,pagination,detailPage,infoPage,badge} from './ui/components.js?v=subjects-20261111';
import {editorialAllowed,selectEditorial} from './lib/editorial.js?v=home-focus-20261111';

const $=id=>document.getElementById(id);
const pageSize=30;
const WATCH_MODES={recent:{label:'Novas propostas',hint:'Propostas apresentadas nos últimos 30 dias, ordenadas pela data de apresentação.',codes:''},voting:{label:'Prontas para pauta',hint:'Situação oficial: Pronta para Pauta. A votação ainda não está confirmada.',codes:'924'},approved:{label:'Aprovadas na Câmara',hint:'Propostas encaminhadas ao Senado ou à sanção. Aprovação na Câmara não significa lei em vigor.',codes:'1293,1303,1150,1160,926,1140'}};
const state={view:'explorar',page:1,year:String(new Date().getFullYear()),type:'Todos',party:'Todos',topic:'Todos',query:'',tag:'',mode:'',
  items:[],totalPages:null,hasNext:false,featuredResult:null,source:'ao vivo',error:'',loading:false};
let sequence=0,activeRequest=null,detailSequence=0,observer=null;
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
 const reliable=!!status && status.label!=='Situação a confirmar';
 if(reliable){
  statusCache.set(id,status);
  try{sessionStorage.setItem(cacheKey(id),JSON.stringify({status,until:Date.now()+10*60_000}))}catch{}
 }else{
  statusCache.delete(id);
  try{sessionStorage.removeItem(cacheKey(id))}catch{}
 }
 for(const el of document.querySelectorAll('[data-status-id="'+id+'"]'))el.innerHTML=badge(status);
}
function queueStatus(id){
 if(!id||cachedStatus(id)||statusQueued.has(id))return;
 statusQueued.add(id);statusQueue.push(id);workStatus();
}
function workStatus(){
 while(activeStatus<3&&statusQueue.length){
  const id=statusQueue.shift();activeStatus++;
  getDetail(id).then(d=>renderStatus(id,d.status)).catch(()=>renderStatus(id,{label:'Situação a confirmar',tone:'neutral'}))
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
  if(c)el.innerHTML=badge(c);else observer.observe(el);
 });
}
function renderChips(){
 $('chips').innerHTML=THEMES.map(theme=>{
  const on=theme===state.topic;
  return '<button type="button" class="chip '+(on?'active':'')+'" aria-pressed="'+on+'" data-area="'+safeText(theme)+'" data-theme="'+safeText(theme)+'">'+(theme==='Todos'?'':'<span class="topic-dot" aria-hidden="true"></span>')+safeText(theme)+'</button>';
 }).join('');

}
function filterFromUI(){
 state.year=$('yearSelect').value;state.type=$('typeSelect').value;state.party=$('partySelect').value;
 state.query=cleanText($('searchField').value);
}
function syncForm(){
 $('yearSelect').value=state.year;$('typeSelect').value=state.type;$('partySelect').value=state.party;
 $('searchField').value=state.query;renderChips();
}
function paramsForHash(){
 const args=new URLSearchParams({page:String(state.page),ano:state.year,tipo:state.type});
 if(state.party!=='Todos')args.set('partido',state.party);
 if(state.topic!=='Todos')args.set('tema',state.topic);
 if(state.query)args.set('busca',state.query);
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
  state.year=q.get('ano')||String(new Date().getFullYear());state.type=q.get('tipo')||'Todos';
  state.party=q.get('partido')||'Todos';state.topic=THEMES.includes(q.get('tema'))?q.get('tema'):'Todos';state.query=q.get('busca')||'';
  state.tag=q.get('tag')||'';
  state.mode=Object.hasOwn(WATCH_MODES,q.get('modo'))?q.get('modo'):'';
 }
 return name==='tema'?route.split('?')[0].split('/')[1]:null;
}
function setPage(newPage){
 state.page=Math.max(1,newPage);syncURL();showList();
 window.scrollTo({top:Math.max(0,$('feed').getBoundingClientRect().top+window.scrollY-18),behavior:'instant'});
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
  $('activeTag').hidden=!state.tag||state.view==='salvos';
  $('activeTagLabel').textContent=state.tag?'Assunto: '+state.tag:'';
  $('searchForm').hidden=state.view==='salvos';$('filters').hidden=state.view==='salvos';
  $('chips').hidden=state.view==='salvos';$('sideindex').hidden=state.view==='salvos';
  document.querySelectorAll('[data-watch]').forEach(a=>{const selected=state.mode===a.dataset.watch;a.classList.toggle('selected',selected);if(selected)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')});
  $('listTitle').textContent=state.view==='salvos'?'Assuntos salvos':state.mode?WATCH_MODES[state.mode].label:state.tag?'Propostas sobre '+state.tag:'Explore as propostas';
  const typeInfo=state.view==='explorar'?proposalTypeInfo(state.type):null;
  $('proposalTypeInfo').hidden=!typeInfo;
  $('proposalTypeTitle').textContent=typeInfo?state.type+' · '+typeInfo.title:'';
  $('proposalTypeDescription').textContent=typeInfo?.description||'';
  $('clearFilters').hidden=state.view==='salvos';
 }
}
function setFooter(text){$('sourceNote').textContent=text}
function loader(){
 renderEditorial();
 $('cards').innerHTML=skeleton(6);$('cards').setAttribute('aria-busy','true');
 $('pagination').innerHTML='';$('listSubtitle').textContent='Consultando propostas…';
 announce('Consultando propostas. Aguarde.');
}
function renderEditorial(){
 const section=$('editorialSection');
 section.hidden=true;
 $('editorialFeature').innerHTML='';
 $('editorialSupporting').innerHTML='';
 if(!editorialAllowed(state))return;
 const selected=state.featuredResult?.items?.length===3?
  state.featuredResult.items:
  selectEditorial(window.OBM_DATA?.items||[],window.OBM_EDITORIAL||{},state.items,{max:3,year:new Date().getFullYear()});
 if(selected.length!==3)return;
 for(const p of selected)if(p.statusVerificado)statusCache.set(p.id,p.statusVerificado);
 $('editorialFeature').innerHTML=editorialFeature(selected[0],cachedStatus(selected[0].id),isSaved(selected[0].id));
 $('editorialSupporting').innerHTML=selected.slice(1).map(p=>card(p,cachedStatus(p.id),isSaved(p.id))).join('');
 section.hidden=false;
}

function present(result){
 state.items=result.items.slice(0,pageSize);state.hasNext=!!result.hasNext;state.totalPages=result.totalPages;
 for(const p of state.items)if(p.statusVerificado)statusCache.set(p.id,p.statusVerificado);
 state.source=result.source;
 $('cards').setAttribute('aria-busy','false');
 $('cards').innerHTML=state.items.length?state.items.map(p=>card(p,cachedStatus(p.id),isSaved(p.id))).join(''):
  (state.mode&&result.source==='situação verificada'?'<div class="empty-state"><h3>Nenhuma proposta confirmada neste lote.</h3><p>Foram conferidos '+Number(result.inspectedCount||0)+' registros desta página; nenhum apresentou a situação buscada. Isso não significa que não existam outras propostas nessa etapa. Experimente outro ano ou avance para a próxima página.</p></div>':'<div class="empty-state"><h3>Nenhuma proposta encontrada com os filtros selecionados.</h3><p>Tente outro termo ou ajuste os filtros. O acervo consultado é parcial.</p></div>');
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
  let all=getSaved();
  const totalPages=Math.max(1,Math.ceil(all.length/pageSize));if(state.page>totalPages)state.page=totalPages;
  const items=all.slice((state.page-1)*pageSize,state.page*pageSize);
  present({items,page:state.page,totalPages,hasNext:state.page<totalPages,source:'cópia local'});
  $('listTitle').textContent='Assuntos salvos';setFooter('As propostas salvas permanecem apenas neste navegador. A situação pode ter mudado desde o salvamento.');
  return;
 }
 syncForm();loader();
 const keywords=state.query||TOPIC_API[state.topic]||'';
 const situationCodes=state.mode?WATCH_MODES[state.mode].codes:'';
 // A cópia local é exibida imediatamente; a API oficial atualiza quando responder.
 // Não deixar o visitante preso nos skeletons durante instabilidade externa.
 const snapshot=!state.mode&&!state.tag?fromSnapshot({page:state.page,year:state.year,type:state.type,party:state.party,keywords,area:'Todos'}):null;
 const hasSnapshot=!!snapshot?.items?.length;
 if(hasSnapshot){
  present(snapshot);
  $('listSubtitle').textContent='Exibimos a última versão disponível. Consultando atualizações…';
  announce('Propostas da cópia parcial exibidas. Consultando atualização oficial.');
 }
 try{
  // Os destaques são obtidos antes da busca e retirados da listagem padrão.
  const shouldFeature=editorialAllowed(state);
  if(shouldFeature){
   try{state.featuredResult=await getDailyFeatured({signal:activeRequest.signal})}
   catch{state.featuredResult=null}
  }
  if(id!==sequence)return;
  renderEditorial();
  const excludeIds=shouldFeature?state.featuredResult?.items.filter(p=>(state.type==='Todos'||p.siglaTipo===state.type)&&(state.year==='Todos'||String(p.ano)===String(state.year))).map(p=>p.id)||[]:[];
  const day=new Date();day.setUTCDate(day.getUTCDate()-30);
  const presentedSince=state.mode==='recent'?day.toISOString().slice(0,10):'';
  const args={page:state.page,year:state.year,type:state.type,party:state.party,keywords,tag:state.tag,situationCodes,presentedSince,excludeIds,signal:activeRequest.signal};
  let result;
  try{result=await getDatabaseProposals(args)}
  catch(dbError){
   // Não retornar ao filtro de apenas 30 da Câmara nos modos legislativos.
   if(state.mode||state.tag)throw new Error('A busca de propostas está temporariamente indisponível.');
   result=await getProposals(args);
  }
  if(id!==sequence)return;
  if(result.items.length||!hasSnapshot){
   present(result);
  }else{
   $('listSubtitle').textContent='Cópia parcial disponível. A consulta oficial não retornou registros nesta página.';
   setFooter('Fonte: cópia parcial da Câmara. A consulta oficial não retornou registros; a cobertura da reserva não é completa.');
  }$('clearFilters').hidden=!(state.query||state.topic!=='Todos'||state.party!=='Todos'||state.year!==String(new Date().getFullYear())||state.type!=='Todos'||!!state.mode||!!state.tag);
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
function listPageFromHash(){
 const direct=readHash();setViews();setNav();
 if(state.view==='detalhe')showDetail(direct);
 else if(state.view==='como-funciona'){$('infoView').innerHTML=infoPage();document.title='Como funciona — o que muda?'}
 else showList();
}
async function showDetail(id){
 ++sequence;const task=++detailSequence;setViews();setNav();
 const candidate=[...state.items,...getSaved(),...(window.OBM_DATA?.items||[])].find(p=>String(p.id)===String(id));
 const neutral={label:'Situação não verificada',tone:'neutral'};
 if(candidate)$('detailView').innerHTML=detailPage(candidate,{loaded:true,status:neutral},isSaved(candidate.id));
 else $('detailView').innerHTML='<div class="page inforoute"><h1>Consultando proposição…</h1><p>Buscando registro disponível.</p></div>';
 document.title='Proposta — o que muda?';window.scrollTo({top:0,behavior:'instant'});
 let stored=null;
 try{stored=await getDatabaseDetail(id)}catch{}
 if(task!==detailSequence||state.view!=='detalhe')return;
 if(stored){
  $('detailView').innerHTML=detailPage(stored.proposal,{...stored,loaded:true},isSaved(id));
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
 if(!proposal){
  $('detailView').innerHTML='<div class="page inforoute"><h1>Não foi possível abrir a proposta.</h1><p>Consulte o registro oficial ou retorne à busca.</p><a href="#/explorar">Voltar para Explorar</a></div>';return;
 }
 const verifiedLive=detail?.status?.label&&detail.status.label!=='Situação a confirmar';
 const liveStage=detail?.stage||{};
 const preferredStage=liveStage.descricaoTramitacao||liveStage.descricaoSituacao||liveStage.codSituacao!=null?liveStage:(stored?.stage||{});
 $('detailView').innerHTML=detailPage(proposal,{
  ...(stored||{}),...(detail||{}),stage:preferredStage,
  authors,authorsChecked:authorsResult.status==='fulfilled'||stored?.authorsChecked,
  loaded:true,status:verifiedLive?detail.status:(stored?.status||neutral),
  fullTextURL:detail?.fullTextURL||stored?.fullTextURL||null
 },isSaved(id));
 document.title=ref(proposal)+' — O que muda?';
}

function onClick(e){
 const page=e.target.closest('[data-page]');
 if(page&&!page.disabled){setPage(Number(page.dataset.page));return}
 const theme=e.target.closest('[data-theme]');
 if(theme){state.topic=theme.dataset.theme;state.mode='';state.page=1;syncURL();showList();return}
 const save=e.target.closest('[data-save]');
 if(save){
  const id=Number(save.dataset.save);
  const p=[...state.items,...getSaved(),...(window.OBM_DATA?.items||[])].find(x=>Number(x.id)===id);
  if(p){
   const now=toggleSaved(p);setNav();
   if(state.view==='salvos')showList();
   else if(state.view==='detalhe')save.textContent=now?'✓ Salvo':'＋ Salvar para depois';
   else {save.textContent=now?'✓ Salvo':'+ Salvar';save.setAttribute('aria-pressed',String(now));save.classList.toggle('saved',now)}
   announce(now?'Proposição salva neste navegador.':'Proposição removida dos salvos.');
  }return
 }
 if(e.target.closest('#removeTag')){state.tag='';state.page=1;syncURL();showList();return;}
 if(e.target.closest('#clearFilters')){
  state.query='';state.tag='';state.topic='Todos';state.party='Todos';state.year=String(new Date().getFullYear());state.type='Todos';state.mode='';state.page=1;
  syncForm();syncURL();showList();return;
 }
 if(e.target.closest('#retryBtn'))showList();
}
function onChange(e){
 if(['yearSelect','typeSelect','partySelect'].includes(e.target.id)){
  filterFromUI();state.page=1;syncURL();showList();
 }
}
async function start(){
 // Links da abertura acompanham o ano civil, sem exigir edição anual do HTML.
 document.querySelectorAll('[data-watch]').forEach(link=>{
  const value=link.getAttribute('href')||'';
  const [path,query]=value.split('?');
  const params=new URLSearchParams(query||'');
  params.set('ano',String(new Date().getFullYear()));
  link.setAttribute('href',path+'?'+params.toString());
 });
 $('cards').addEventListener('click',onClick);
 $('editorialSection').addEventListener('click',onClick);
 $('pagination').addEventListener('click',onClick);
 $('chips').addEventListener('click',onClick);
 $('detailView').addEventListener('click',onClick);
 $('clearFilters').addEventListener('click',onClick);
 $('removeTag').addEventListener('click',onClick);
 document.addEventListener('change',onChange);
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();filterFromUI();state.mode='';state.page=1;syncURL();showList()});
 window.addEventListener('hashchange',listPageFromHash);
 listPageFromHash();
 try{const parties=await getParties();$('partySelect').innerHTML='<option value="Todos">Todos os partidos</option>'+
  parties.map(p=>'<option value="'+safeText(p)+'">'+safeText(p)+'</option>').join('');$('partySelect').value=state.party;}catch{}
}
start();

