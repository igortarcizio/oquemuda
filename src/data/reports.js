// Reportes de leitores: "encontrei um problema neste texto".
// O banco só é acessado por duas funções (reportes_ativos e registrar_reporte); ver
// supabase/migrations/20261119_reportes.sql e docs/reportes.md.
import {voterId} from './votes.js';

const RPC='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/rpc/';
const KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';

export const MAX_DETAIL=100;
export const REPORT_PARTS=Object.freeze(['titulo','resumo','editorial']);
export const REPORT_SOURCES=Object.freeze(['redacao','ia','automatico']);
export const REPORT_REASONS=Object.freeze([
  {value:'errada',label:'Informação errada'},
  {value:'desatualizado',label:'Desatualizado'},
  {value:'confuso',label:'Confuso ou difícil de entender'},
  {value:'outro',label:'Outro'}
]);

export class ReportError extends Error{
  constructor(message,code=''){super(message);this.name='ReportError';this.code=code}
}

// Mesmo tratamento do banco: espaços e quebras de linha viram um espaço só.
export const cleanDetail=text=>String(text??'').replace(/[\s\u0000-\u001f\u007f]+/g,' ').trim();

/** Mensagem do primeiro problema do formulário, ou '' se estiver tudo certo. */
export function validateReport({parte,motivo,detalhe}={}){
  if(!REPORT_PARTS.includes(parte))return {field:'parte',message:'Escolha onde está o problema.'};
  if(!REPORT_REASONS.some(r=>r.value===motivo))return {field:'motivo',message:'Escolha qual é o problema.'};
  const d=cleanDetail(detalhe);
  if(motivo==='outro'&&!d)return {field:'detalhe',message:'Descreva o problema em poucas palavras.'};
  if(d.length>MAX_DETAIL)return {field:'detalhe',message:'Use no máximo '+MAX_DETAIL+' caracteres.'};
  return null;
}

/** Corpo enviado para registrar_reporte. O detalhe só vai quando o motivo é "outro". */
export function reportPayload(id,{parte,fonte,motivo,detalhe,versao}){
  return {
    p_proposicao:Number(id),
    p_leitor:voterId(),
    p_parte:parte,
    p_fonte:REPORT_SOURCES.includes(fonte)?fonte:'automatico',
    p_motivo:motivo,
    p_detalhe:motivo==='outro'?cleanDetail(detalhe).slice(0,MAX_DETAIL):null,
    p_versao:versao?String(versao).slice(0,40):null
  };
}

async function rpc(name,body,{fetchImpl=globalThis.fetch,signal}={}){
  let res;
  try{
    res=await fetchImpl(RPC+name,{method:'POST',signal,
      headers:{apikey:KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(body)});
  }catch(e){
    if(e?.name==='AbortError')throw e;
    throw new ReportError('Sem conexão','network');
  }
  if(!res.ok){
    let info={};try{info=await res.json()}catch{}
    throw new ReportError(info?.message||('HTTP '+res.status),info?.code||String(res.status));
  }
  return res.status===204?null:res.json().catch(()=>null);
}

// O botão só aparece se o banco já tiver as funções. Pergunta uma vez por visita.
let enabled=null;
export function reportsEnabled(opts){
  enabled??=rpc('reportes_ativos',{},opts).then(v=>v===true).catch(()=>false);
  return enabled;
}
export function resetReportsEnabled(){enabled=null}

export function sendReport(id,report,opts){
  const invalid=validateReport(report);
  if(invalid)return Promise.reject(new ReportError(invalid.message,'invalid'));
  return rpc('registrar_reporte',reportPayload(id,report),opts).then(()=>true);
}

export function reportErrorMessage(error){
  if(error?.code==='54000')return 'Muitos reportes em pouco tempo. Tente de novo mais tarde.';
  if(error?.code==='P0002')return 'Esta proposta ainda não está na nossa base, então não recebe reportes.';
  if(error?.code==='22001')return 'Use no máximo '+MAX_DETAIL+' caracteres.';
  if(error?.code==='23514')return 'Descreva o problema em poucas palavras.';
  if(error?.code==='network')return 'Sem conexão. Seu reporte não foi enviado.';
  return 'Não foi possível enviar seu reporte agora. Tente de novo.';
}
