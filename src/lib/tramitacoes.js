// Histórico oficial de movimentações (coluna proposicoes.tramitacoes, gravada por
// scripts/sync_supabase.py) e versão do texto em vigor (coluna texto_atual).
import {safeText,dateBR} from './text.js';
import {orgaoNome} from './orgaos.js';

const OFFICIAL=/^https:\/\/www\.camara\.leg\.br\//;
// Registros administrativos que não dizem nada ao leitor (recebimento, notificação, publicação, prazos).
const NOISE_CODES=new Set(['500','501','203','604','1005','350','600']);
const NOISE_TEXT=/^(recebimento|notifica|publica[çc][ãa]o|abertura de prazo|encerramento de prazo)/i;
export const SHORT_HISTORY=5;

export const TEXT_VERSIONS=Object.freeze({
  'SBT-A':'Substitutivo aprovado na comissão',
  RDF:'Redação final aprovada pela Câmara'
});

/** Lista segura, em ordem cronológica. Qualquer coisa fora do formato é descartada. */
export function normalizeTramitacoes(raw){
  if(!Array.isArray(raw))return [];
  return raw.filter(t=>t&&typeof t==='object'&&typeof t.dataHora==='string'&&/^\d{4}-\d{2}-\d{2}/.test(t.dataHora))
    .map(t=>({
      dataHora:t.dataHora,
      sequencia:Number.isInteger(t.sequencia)?t.sequencia:null,
      orgao:typeof t.siglaOrgao==='string'?t.siglaOrgao:'',
      descricao:typeof t.descricao==='string'?t.descricao.trim():'',
      codTipo:t.codTipo==null?'':String(t.codTipo),
      despacho:typeof t.despacho==='string'?t.despacho.trim():'',
      url:typeof t.url==='string'&&OFFICIAL.test(t.url)?t.url:null
    }))
    .filter(t=>t.descricao||t.despacho)
    .sort((a,b)=>a.dataHora.localeCompare(b.dataHora)||(a.sequencia??0)-(b.sequencia??0));
}

export function isNoise(t){return NOISE_CODES.has(t.codTipo)||NOISE_TEXT.test(t.descricao)}

/** Movimentações relevantes, da mais recente para a mais antiga. */
export function relevantMovements(list){
  return list.filter(t=>!isNoise(t)).reverse();
}

/** Texto em vigor quando não é mais o original; null se ausente ou com link fora da Câmara. */
export function normalizeTextoAtual(raw){
  if(!raw||typeof raw!=='object'||!TEXT_VERSIONS[raw.sigla])return null;
  if(typeof raw.url!=='string'||!OFFICIAL.test(raw.url))return null;
  return {sigla:raw.sigla,descricao:TEXT_VERSIONS[raw.sigla],url:raw.url,
    data:typeof raw.data==='string'&&/^\d{4}-\d{2}-\d{2}/.test(raw.data)?raw.data.slice(0,10):'',
    orgao:typeof raw.orgao==='string'?raw.orgao:''};
}

const versionLabel=v=>{
  const nome=v.sigla==='SBT-A'||!v.sigla?orgaoNome(v.orgao):'';
  const what=nome?'Substitutivo aprovado na '+safeText(nome)+' ('+safeText(v.orgao)+')':safeText(v.descricao)+(v.orgao?' ('+safeText(v.orgao)+')':'');
  return what+(v.data?' em '+safeText(dateBR(v.data)):'');
};
const lowerFirst=s=>s.charAt(0).toLowerCase()+s.slice(1);
const linkNew=v=>' <a href="'+safeText(v.url)+'" target="_blank" rel="noopener noreferrer">Ler o texto novo ↗<span class="sr-only"> (abre em nova aba)</span></a>';

/**
 * Aviso sobre a versão do texto na seção "O que a proposta quer mudar?".
 * fonte: 'ia' | 'redacao' | 'automatico'; ai: linha de resumos_ia (pode vir sem as colunas novas).
 */
export function versionNote(textoAtual,{fonte,ai=null}={}){
  const v=textoAtual;
  const aiVersion=fonte==='ia'&&ai&&TEXT_VERSIONS[ai.texto_versao]?
    {sigla:ai.texto_versao,descricao:TEXT_VERSIONS[ai.texto_versao],orgao:ai.texto_orgao||'',data:typeof ai.texto_data==='string'?ai.texto_data.slice(0,10):''}:null;
  // Resumo já feito a partir do texto em vigor.
  if(fonte==='ia'&&(aiVersion||(v&&ai?.fonte_url===v.url))){
    return '<p class="version-note version-note--ok">Este resumo explica o <strong>'+lowerFirst(versionLabel(aiVersion||v))+'</strong>, que substituiu o texto original.</p>';
  }
  if(!v)return '';
  const tail=fonte==='ia'?'Este resumo ainda descreve o texto original e está sendo atualizado.':
    fonte==='redacao'?'A explicação abaixo foi escrita para o texto original.':
    'O resumo automático abaixo usa a ementa do texto original.';
  return '<div class="version-note version-note--changed" role="note"><strong>O texto desta proposta mudou.</strong> '+
    versionLabel(v)+'. '+safeText(tail)+linkNew(v)+'</div>';
}

const itemHTML=t=>{
  const detail=t.despacho&&t.despacho.toLowerCase()!==t.descricao.toLowerCase()?
    (t.despacho.length>220?t.despacho.slice(0,217).replace(/\s+\S*$/,'')+'…':t.despacho):'';
  return '<li><span class="history-when"><time datetime="'+safeText(t.dataHora.slice(0,10))+'">'+safeText(dateBR(t.dataHora))+'</time>'+
    (t.orgao?(orgaoNome(t.orgao)?'<abbr class="history-org" title="'+safeText(orgaoNome(t.orgao))+'">'+safeText(t.orgao)+'</abbr>':'<span class="history-org">'+safeText(t.orgao)+'</span>'):'')+'</span>'+
    '<span class="history-what"><strong>'+safeText(t.descricao||'Movimentação')+'</strong>'+
    (detail?'<span class="history-detail">'+safeText(detail)+'</span>':'')+
    (t.url?'<a class="history-doc" href="'+safeText(t.url)+'" target="_blank" rel="noopener noreferrer">Documento ↗<span class="sr-only"> (abre em nova aba)</span></a>':'')+
    '</span></li>';
};

/** Histórico real: últimas movimentações relevantes + lista completa recolhida. */
export function historyHTML(list,textoAtual=null){
  if(!list.length)return '';
  const relevant=relevantMovements(list);
  const recent=(relevant.length?relevant:list.slice().reverse()).slice(0,SHORT_HISTORY);
  const all=list.slice().reverse();
  const changed=textoAtual?'<p class="history-text-changed"><strong>Texto modificado:</strong> '+versionLabel(textoAtual)+'.'+linkNew(textoAtual)+'</p>':'';
  return '<div class="history"><h3 class="change-sub" id="historyTitle">Últimas movimentações</h3>'+changed+
    '<ol class="history-list" aria-labelledby="historyTitle">'+recent.map(itemHTML).join('')+'</ol>'+
    (all.length>recent.length?'<details class="history-all"><summary>Ver todas as '+all.length+' movimentações</summary>'+
      '<ol class="history-list">'+all.map(itemHTML).join('')+'</ol></details>':'')+
    '<p class="small-note">Fonte: histórico oficial de tramitação da Câmara. Datas no horário de Brasília.</p></div>';
}
