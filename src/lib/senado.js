// Andamento no Senado das propostas que a Câmara já aprovou
// (coluna proposicoes.senado, gravada por scripts/sync_senado.py a partir da API /processo do Senado).
import {safeText,dateBR} from './text.js';
import {STATUS} from './status.js?v=status-apresentada';

const PAGE=/^https:\/\/www25\.senado\.leg\.br\/web\/atividade\/materias\/-\/materia\/\d+$/;
const str=(v,max=400)=>typeof v==='string'&&v.trim()?v.replace(/\s+/g,' ').trim().slice(0,max):'';
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?v:'';

/** Dado gravado pelo robô, validado; null quando ainda não consultado ou inválido. */
export function normalizeSenado(raw){
 if(!raw||typeof raw!=='object')return null;
 if(raw.encontrado===false)return {encontrado:false,consultadoEm:day(raw.consultado_em)};
 if(raw.encontrado!==true||!Number.isInteger(Number(raw.id)))return null;
 const sit=raw.situacao||{},loc=raw.local,rel=raw.relator,del=raw.deliberacao,norma=raw.norma;
 return {
  encontrado:true,tramitando:raw.tramitando===true,
  url:PAGE.test(raw.url||'')?raw.url:'',
  situacao:{descricao:str(sit.descricao,160),data:day(sit.data)},
  local:loc&&str(loc.sigla,20)?{sigla:str(loc.sigla,20),nome:str(loc.nome,120)}:null,
  relator:rel&&str(rel.nome,80)?{nome:str(rel.nome,80),tratamento:str(rel.tratamento,20),partido:str(rel.partido,20),uf:str(rel.uf,2),
   colegiado:str(rel.colegiado,20),colegiadoNome:str(rel.colegiadoNome,120),desde:day(rel.desde)}:null,
  deliberacao:del&&str(del.tipo,80)?{tipo:str(del.tipo,80),destino:str(del.destino,80),data:day(del.data)}:null,
  norma:norma&&str(norma.descricao,120)?{descricao:str(norma.descricao,120),data:day(norma.data),observacao:str(norma.observacao,300)}:null,
  movimentacoes:(Array.isArray(raw.movimentacoes)?raw.movimentacoes:[]).map(m=>({data:day(m?.data)?m.data:'',descricao:str(m?.descricao),
   local:str(m?.local,20),localNome:str(m?.localNome,120)})).filter(m=>m.descricao),
  consultadoEm:day(raw.consultado_em)
 };
}

/** O Senado escreve a situação em maiúsculas: "AGUARDANDO DESIGNAÇÃO DO RELATOR" → "Aguardando designação do relator". */
export function sentenceCase(text){
 const s=String(text||'').toLocaleLowerCase('pt-BR')
  .replace(/c[aâ]mara dos deputados/g,'Câmara dos Deputados').replace(/senado federal/g,'Senado Federal')
  .replace(/presid[eê]ncia da rep[uú]blica/g,'Presidência da República').replace(/ordem do dia/g,'Ordem do Dia')
  .replace(/\bplen[aá]rio\b/g,'Plenário');
 return s.charAt(0).toLocaleUpperCase('pt-BR')+s.slice(1);
}

/**
 * Em que pé está no Senado: 'senado' (em análise), 'sancao' (aprovada, foi à sanção),
 * 'lei' (virou lei), 'camara' (voltou à Câmara), 'encerrada' (arquivada etc.), 'nao_registrada' ou null.
 */
export function senadoEtapa(s){
 if(!s)return null;
 if(!s.encontrado)return 'nao_registrada';
 const sit=s.situacao.descricao,destino=s.deliberacao?.destino||'';
 if(s.norma||/transformad[ao] em norma/i.test(sit))return 'lei';
 if(/c[aâ]mara/i.test(destino)||/remetid[ao] [àa] c[aâ]mara/i.test(sit))return 'camara';
 if(/san[cç][aã]o/i.test(destino)||/san[cç][aã]o/i.test(sit))return 'sancao';
 return s.tramitando?'senado':'encerrada';
}

/** A Câmara demora a registrar que virou lei; o Senado já sabe. Só corrige nesse caso. */
export function statusComSenado(status,s){
 if(senadoEtapa(s)!=='lei'||status?.tone==='law')return status;
 return {...STATUS.law,detail:s.norma?.descricao||sentenceCase(s.situacao.descricao)};
}

const relatorTexto=r=>[r.tratamento,r.nome].filter(Boolean).join(' ')+(r.partido||r.uf?' ('+[r.partido,r.uf].filter(Boolean).join('-')+')':'');
const localTexto=l=>l.nome&&l.nome!==l.sigla?l.nome+' ('+l.sigla+')':l.sigla;

const itemHTML=m=>'<li><span class="history-when">'+(m.data?'<time datetime="'+safeText(m.data.slice(0,10))+'">'+safeText(dateBR(m.data))+'</time>':'')+
 (m.local?(m.localNome?'<abbr class="history-org" title="'+safeText(m.localNome)+'">'+safeText(m.local)+'</abbr>':'<span class="history-org">'+safeText(m.local)+'</span>'):'')+'</span>'+
 '<span class="history-what"><span>'+safeText(m.descricao)+'</span></span></li>';

/** Bloco "No Senado" da ficha (em "Em que etapa está?"). */
export function senadoHTML(s){
 if(!s)return '';
 const fonte='<p class="small-note">Fonte: dados abertos do Senado Federal'+(s.consultadoEm?', consultados em '+safeText(dateBR(s.consultadoEm)):'')+'.'+
  (s.url?' <a href="'+safeText(s.url)+'" target="_blank" rel="noopener noreferrer">Ver no Senado ↗<span class="sr-only"> (abre em nova aba)</span></a>':'')+'</p>';
 if(!s.encontrado)return '<div class="senado-box"><h3 class="change-sub">No Senado</h3>'+
  '<p>A Câmara aprovou a proposta, mas ela ainda não aparece nos registros do Senado. O registro costuma levar alguns dias.</p>'+fonte+'</div>';
 const etapa=senadoEtapa(s),facts=[];
 const sit=s.situacao.descricao?sentenceCase(s.situacao.descricao):'Não informada';
 facts.push(['Situação',safeText(sit)+(s.situacao.data?'<span class="senado-when">desde '+safeText(dateBR(s.situacao.data))+'</span>':'')]);
 if(etapa==='senado'&&s.local)facts.push(['Onde está',safeText(localTexto(s.local))]);
 if(etapa==='senado'&&s.relator)facts.push(['Relatoria',safeText(relatorTexto(s.relator))+(s.relator.colegiado?'<span class="senado-when">'+safeText(s.relator.colegiadoNome||s.relator.colegiado)+'</span>':'')]);
 if(s.deliberacao)facts.push(['Votação',safeText(s.deliberacao.tipo)+(s.deliberacao.data?' em '+safeText(dateBR(s.deliberacao.data)):'')+
  (s.deliberacao.destino?'<span class="senado-when">Destino: '+safeText(s.deliberacao.destino.replace(/^à /i,'').replace(/^./,c=>c.toUpperCase()))+'</span>':'')]);
 if(s.norma)facts.push(['Virou',safeText(s.norma.descricao)+(s.norma.observacao?'<span class="senado-when">'+safeText(s.norma.observacao)+'</span>':'')]);
 const movs=s.movimentacoes.slice().reverse();
 const n=movs.length;
 const toggle=n?'<button type="button" class="history-toggle" id="senadoToggle" data-history-toggle aria-expanded="false" aria-controls="senadoPanel" '+
   'data-label-closed="Ver movimentações no Senado ('+n+')" data-label-open="Esconder movimentações no Senado">'+
   '<span class="history-toggle-label">Ver movimentações no Senado ('+n+')</span><span class="history-toggle-icon" aria-hidden="true">▾</span></button>'+
   '<div class="history-panel" id="senadoPanel" hidden><h3 class="change-sub" id="senadoHistoryTitle" tabindex="-1">Últimas movimentações no Senado</h3>'+
   '<ol class="history-list" aria-labelledby="senadoHistoryTitle">'+movs.map(itemHTML).join('')+'</ol></div>':'';
 return '<div class="senado-box"><h3 class="change-sub">No Senado</h3><dl class="senado-facts">'+
  facts.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>'+toggle+fonte+'</div>';
}
