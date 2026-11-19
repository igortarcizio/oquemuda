// Contador anônimo de compartilhamentos (botão "Compartilhar" nos cards e na ficha).
// O banco só é acessado pela função registrar_compartilhamento; ver
// supabase/migrations/20261119_compartilhamentos.sql e docs/compartilhamentos.md.
// "Dispara e esquece": falha de rede ou banco sem a função nunca atrapalha o compartilhamento.
import {voterId} from './votes.js';
import {SHARE_CHANNELS} from '../lib/share.js';

const RPC='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/rpc/';
const KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';

/** Corpo enviado para registrar_compartilhamento, ou null se não houver o que registrar. */
export function sharePayload(id,canal){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0||!SHARE_CHANNELS.includes(canal))return null;
  return {p_proposicao:n,p_canal:canal,p_leitor:voterId()};
}

export function registerShare(id,canal,{fetchImpl=globalThis.fetch}={}){
  const body=sharePayload(id,canal);
  if(!body||typeof fetchImpl!=='function')return Promise.resolve(false);
  try{
    return Promise.resolve(fetchImpl(RPC+'registrar_compartilhamento',{method:'POST',keepalive:true,
      headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}))
      .then(res=>!!res?.ok).catch(()=>false);
  }catch{return Promise.resolve(false)}
}
