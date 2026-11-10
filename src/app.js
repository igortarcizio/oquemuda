import {getProposals,getDetail,getAuthors,getParties,fromSnapshot} from './data/api.js';
import {THEMES,TOPIC_API,safeText,ref,cleanText} from './lib/text.js';
import {getSaved,isSaved,toggleSaved,savedCount} from './lib/storage.js';
import {card,skeleton,pagination,detailPage,infoPage,badge} from './ui/components.js';

const $=id=>document.getElementById(id);
const pageSize=30;
const state={view:'explorar',page:1,year:String(new Date().getFullYear()),type:'PL',party:'Todos',topic:'Todos',query:'',
  items:[],totalPages:null,hasNext:false,source:'ao vivo',error:'',loading:false};
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
 statusCache.set(id,status);
 try{sessionStorage.setItem(cacheKey(id),JSON.stringify({status,until:Date.now()+10*60_000}))}catch{}
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
  state.items.slice(0,8).forEach(p=>queueStatus(p.id));return;
 }
 observer=new IntersectionObserver(entries=>{
  for(const entry of entries){if(entry.isIntersecting){const id=Number(entry.target.dataset.statusId);observer.unobserve(entry.target);queueStatus(id)}}
 },{rootMargin:'240px 0px'});
 document.querySelectorAll('#cards [data-status-id]').forEach(el=>{
  const c=cachedStatus(Number(el.dataset.statusId));
  if(c)el.innerHTML=badge(c);else observer.observe(el);
 });
}
function renderChips(){
 $('chips').innerHTML=THEMES.map(theme=>{
  const on=theme===state.topic;
  return '<button type="button" class="chip '+(on?'active':'')+'" aria-pressed="'+on+'" data-theme="'+safeText(theme)+'">'+safeText(theme)+'</button>';
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
 return args.toString();
}
function syncURL(){
 const base=state.view==='salvos'?'salvos':'explorar';
 const args=state.view==='salvos'?'page='+state.page:paramsForHash();
 history.replaceState(null,'',location.pathname+location.search+'#/'+base+'?'+args);
}
function readHash(){
 const route=location.hash.slice(2)||'explorar',name=route.split('?')[0]||'explorar';
 const q=new URLSearchParams(route.split('?')[1]||'');
 state.view=name==='salvos'||name==='como-funciona'||name==='explorar'?name:name==='tema'?'detalhe':'explorar';
 state.page=Math.max(1,Number(q.get('page')||1)||1);
 if(state.view==='explorar'){
  state.year=q.get('ano')||String(new Date().getFullYear());state.type=q.get('tipo')||'PL';
  state.party=q.get('partido')||'Todos';state.topic=THEMES.includes(q.get('tema'))?q.get('tema'):'Todos';state.query=q.get('busca')||'';
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
 $('detailView').hidden=state.view!=='detalhe';$('infoView').hidden=state.view!=='como-funciona';
 if(isFeed){
  $('heroEyebrow').textContent=state.view==='salvos'?'Salvos':'Explorar';
  $('heroTitle').textContent=state.view==='salvos'?'Para ler com calma.':'Encontre o que importa para você.';
  $('heroSubtitle').textContent=state.view==='salvos'?'Propostas guardadas neste navegador.':'Busque um assunto ou escolha filtros.';
  $('searchForm').hidden=state.view==='salvos';$('filters').hidden=state.view==='salvos';
  $('chips').hidden=state.view==='salvos';$('sideindex').hidden=state.view==='salvos';
  $('listTitle').textContent=state.view==='salvos'?'Assuntos salvos':'Todos os assuntos';
  $('clearFilters').hidden=state.view==='salvos';
 }
}
function setFooter(text){$('sourceNote').textContent=text}
function loader(){
 $('cards').innerHTML=skeleton(6);$('cards').setAttribute('aria-busy','true');
 $('pagination').innerHTML='';$('listSubtitle').textContent='Buscando até 30 propostas nesta página…';
 announce('Carregando seis cartões de preparação. Aguarde a busca oficial.');
}
function present(result){
 state.items=result.items.slice(0,pageSize);state.hasNext=!!result.hasNext;state.totalPages=result.totalPages;
 state.source=result.source;
 $('cards').setAttribute('aria-busy','false');
 $('cards').innerHTML=state.items.length?state.items.map(p=>card(p,cachedStatus(p.id),isSaved(p.id))).join(''):
  '<div class="empty-state"><h3>Nenhuma proposta encontrada neste recorte.</h3><p>Experimente outro ano, assunto ou partido. A Câmara continua sendo a fonte para pesquisas completas.</p></div>';
 $('pagination').innerHTML=pagination({page:state.page,totalPages:state.totalPages,hasNext:state.hasNext});
 const msg=state.items.length+' '+(state.items.length===1?'proposta exibida':'propostas exibidas')+' na página '+state.page+
   (state.totalPages?' de '+state.totalPages:'')+(state.source==='cópia parcial'?' · reserva parcial':'');
 $('listSubtitle').textContent=msg;announce(msg);
 setFooter('Fonte: Dados Abertos da Câmara dos Deputados. '+(state.source==='ao vivo'?
  'Resultados carregados por página diretamente da API; 30 registros por página.':
  'Cópia parcial de reserva utilizada porque a API oficial não respondeu. A ausência de resultados aqui não comprova inexistência.')+
  ' Propostas não são leis. Títulos automáticos e classificação temática exigem conferência da ementa. O bloco “Como é hoje” não inventa regras vigentes.');
 observeStatuses();setNav();
}
function errorState(message){
 $('cards').setAttribute('aria-busy','false');$('cards').innerHTML='<div class="empty-state"><h3>Não foi possível carregar esta consulta.</h3>'+
 '<p>'+safeText(message)+' Não interpretamos uma falha de conexão como ausência de propostas.</p>'+
 '<div style="margin-top:18px"><button type="button" class="outline-btn" id="retryBtn">Tentar novamente</button> '+
 '<a class="outline-btn" href="https://www.camara.leg.br/busca-portal/proposicoes" target="_blank" rel="noopener noreferrer">Pesquisar na Câmara ↗</a></div></div>';
 $('pagination').innerHTML='';$('listSubtitle').textContent='Consulta indisponível';
 announce('Falha na consulta. Tente novamente.');setFooter('Fonte: Câmara dos Deputados. A API não respondeu. Nenhuma conclusão sobre quantidade de propostas foi feita.');
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
 try{
  const result=await getProposals({page:state.page,year:state.year,type:state.type,party:state.party,keywords,signal:activeRequest.signal});
  if(id!==sequence)return;
  present(result);$('clearFilters').hidden=!(state.query||state.topic!=='Todos'||state.party!=='Todos'||state.year!=='Todos'||state.type!=='PL');
 }catch(error){
  if(id!==sequence)return;
  const cached=fromSnapshot({page:state.page,year:state.year,type:state.type,party:state.party,keywords,area:'Todos'});
  if(cached&&cached.items.length){present(cached);return}
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
 if(candidate){$('detailView').innerHTML=detailPage(candidate,{},isSaved(candidate.id));}
 else $('detailView').innerHTML='<div class="page inforoute"><h1>Consultando proposição…</h1><p>Buscando registro na Câmara.</p></div>';
 document.title='Proposta — o que muda?';
 window.scrollTo({top:0,behavior:'instant'});
 try{
  const detail=await getDetail(id);
  if(task!==detailSequence||state.view!=='detalhe')return;
  $('detailView').innerHTML=detailPage(detail.proposal,{...detail,loaded:true},isSaved(id));document.title=ref(detail.proposal)+' — O que muda?';
  const authors=await getAuthors(id).catch(()=>[]);
  if(task!==detailSequence||state.view!=='detalhe')return;
  $('detailView').innerHTML=detailPage(detail.proposal,{...detail,authors,loaded:true},isSaved(id));
 }catch(error){
  if(task!==detailSequence)return;
  if(candidate)$('detailView').innerHTML=detailPage(candidate,{loaded:false},isSaved(id));
  else $('detailView').innerHTML='<div class="page inforoute"><h1>Não foi possível abrir a proposta.</h1><p>Consulte o registro oficial ou retorne à busca.</p><a href="#/explorar">Voltar para Explorar</a></div>';
 }
}
function onClick(e){
 const page=e.target.closest('[data-page]');
 if(page&&!page.disabled){setPage(Number(page.dataset.page));return}
 const theme=e.target.closest('[data-theme]');
 if(theme){state.topic=theme.dataset.theme;state.page=1;syncURL();showList();return}
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
 if(e.target.closest('#clearFilters')){
  state.query='';state.topic='Todos';state.party='Todos';state.year=String(new Date().getFullYear());state.type='PL';state.page=1;
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
 $('cards').addEventListener('click',onClick);
 $('pagination').addEventListener('click',onClick);
 $('chips').addEventListener('click',onClick);
 $('detailView').addEventListener('click',onClick);
 $('clearFilters').addEventListener('click',onClick);
 document.addEventListener('change',onChange);
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();filterFromUI();state.page=1;syncURL();showList()});
 window.addEventListener('hashchange',listPageFromHash);
 try{const parties=await getParties();$('partySelect').innerHTML='<option value="Todos">Todos os partidos</option>'+
  parties.map(p=>'<option value="'+safeText(p)+'">'+safeText(p)+'</option>').join('');}catch{}
 listPageFromHash();
}
start();
