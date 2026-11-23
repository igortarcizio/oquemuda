// Proposta apensada: com quem tramita e quem conduz a tramitação
// (coluna proposicoes.apensada_a, gravada por scripts/sync_supabase.py).
import {safeText,dateBR} from './text.js';
import {normalizeStatus} from './status.js?v=status-apresentada';
import {orgaoRotulo} from './orgaos.js';

const TYPES=new Set(['PL','PLP','PEC','MPV','PDL','PRC']);
const ref=p=>p.sigla+' '+p.numero+'/'+p.ano;
// PEC e MPV são femininas: "a PEC", "apensada", "É ela".
const fem=p=>p.sigla==='PEC'||p.sigla==='MPV';
const art=p=>fem(p)?'a':'o';

function summary(raw){
 if(!raw||typeof raw!=='object')return null;
 const id=Number(raw.id),numero=Number(raw.numero),ano=Number(raw.ano),sigla=String(raw.sigla||'').toUpperCase();
 if(!Number.isInteger(id)||id<=0||!Number.isInteger(numero)||!Number.isInteger(ano)||!/^[A-Z]{2,5}$/.test(sigla))return null;
 return {id,numero,ano,sigla,ementa:typeof raw.ementa==='string'?raw.ementa:'',
  status:normalizeStatus({codSituacao:raw.codSituacao,descricaoSituacao:raw.situacao}),
  orgao:typeof raw.orgao==='string'?raw.orgao:'',dataHora:typeof raw.dataHora==='string'?raw.dataHora:''};
}

/** {direta, raiz} validados, ou null. */
export function normalizeApensacao(raw){
 if(!raw||typeof raw!=='object')return null;
 const direta=summary(raw.direta),raiz=summary(raw.raiz)||direta;
 if(!direta||!raiz)return null;
 return {direta,raiz,consultadoEm:typeof raw.consultado_em==='string'?raw.consultado_em:''};
}

/** Só faz sentido enquanto a proposta segue em andamento (não para lei, aprovada ou encerrada). */
export function showsApensacao(apensacao,status){
 return !!apensacao&&!['law','approved','closed'].includes(status?.tone);
}

const badgeHTML=s=>'<span class="status-badge '+safeText(s.tone)+'" title="'+safeText(s.detail||s.label)+'">'+safeText(s.label)+'</span>';

export function apensacaoHTML(a){
 if(!a)return '';
 const {direta,raiz}=a,same=direta.id===raiz.id;
 const link=p=>'<a href="#/tema/'+p.id+'">'+safeText(ref(p))+'</a>';
 return '<div class="joint-box" role="note"><p class="joint-lead"><strong>Esta proposta tramita junto com '+art(direta)+' '+link(direta)+'.</strong> '+
  (same?(fem(direta)?'É ela':'É ele')+' que conduz a tramitação.':
   (fem(direta)?'A ':'O ')+safeText(ref(direta))+', por sua vez, está '+(fem(direta)?'apensada':'apensado')+' '+(fem(raiz)?'à':'ao')+' '+link(raiz)+', que conduz a tramitação.')+
  ' Propostas apensadas são analisadas em conjunto e seguem o andamento da principal.</p>'+
  '<dl class="joint-facts"><div><dt>Proposta principal</dt><dd>'+link(raiz)+(raiz.ementa?'<span class="joint-ementa">'+safeText(raiz.ementa.length>200?raiz.ementa.slice(0,197).replace(/\s+\S*$/,'')+'…':raiz.ementa)+'</span>':'')+'</dd></div>'+
  '<div><dt>Situação da principal</dt><dd>'+badgeHTML(raiz.status)+'</dd></div>'+
  (raiz.orgao?'<div><dt>Onde está</dt><dd>'+safeText(orgaoRotulo(raiz.orgao))+(raiz.dataHora?'<span class="joint-ementa">Última movimentação em '+safeText(dateBR(raiz.dataHora))+'</span>':'')+'</dd></div>':'')+
  '</dl><a class="joint-cta" href="#/tema/'+raiz.id+'">Ver a proposta principal →</a></div>';
}

/** Lista das propostas acompanhadas pelo site que tramitam junto com esta. */
export function jointListHTML(rows,total){
 const items=(Array.isArray(rows)?rows:[]).filter(r=>Number.isInteger(Number(r?.id))&&TYPES.has(String(r.sigla_tipo||'').toUpperCase()));
 if(!items.length)return '';
 const n=Math.max(Number(total)||0,items.length);
 return '<h3 class="change-sub" id="jointListTitle">Tramitam junto com esta ('+n+')</h3><ul class="joint-list" aria-labelledby="jointListTitle">'+
  items.map(r=>'<li><a href="#/tema/'+Number(r.id)+'">'+safeText(String(r.sigla_tipo).toUpperCase()+' '+r.numero+'/'+r.ano)+'</a>'+
   (r.ementa?' <span>'+safeText(String(r.ementa).length>140?String(r.ementa).slice(0,137).replace(/\s+\S*$/,'')+'…':r.ementa)+'</span>':'')+'</li>').join('')+'</ul>'+
  (n>items.length?'<p class="small-note">Mostrando '+items.length+' de '+n+'.</p>':'')+
  '<p class="small-note">Propostas apensadas a esta entre as que o site acompanha. Elas são analisadas junto com esta.</p>';
}
