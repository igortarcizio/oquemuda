// Compartilhamento: links, texto padrão e endereços de cada rede.
// Funções puras (sem DOM), usadas pelo botão (src/ui/share-menu.js), pelo gerador
// das páginas de prévia (scripts/gerar_previas.mjs) e pelos testes.

export const SITE_URL='https://igortarcizio.github.io/oquemuda/';

/** Canais aceitos pelo banco (registrar_compartilhamento). 'nativo' = folha do celular. */
export const SHARE_CHANNELS=Object.freeze(['nativo','whatsapp','telegram','x','facebook','email','copiar']);

/** Ordem e rótulos do menu do desktop. */
export const SHARE_TARGETS=Object.freeze([
  {canal:'whatsapp',label:'WhatsApp'},
  {canal:'telegram',label:'Telegram'},
  {canal:'x',label:'X'},
  {canal:'facebook',label:'Facebook'},
  {canal:'email',label:'E-mail'}
]);

const validId=id=>{const n=Number(id);return Number.isSafeInteger(n)&&n>0?n:null};

/** Link que vai na mensagem: a página de prévia, que leva à ficha. */
export function shareURL(id,base=SITE_URL){
  const n=validId(id);
  return n?base+'p/'+n+'.html':base;
}

/** Endereço da ficha dentro do site (usado pelo redirecionamento da prévia). */
export function detailHash(id){
  const n=validId(id);
  return n?'#/tema/'+n:'#/explorar';
}

const oneLine=s=>String(s??'').replace(/\s+/g,' ').trim();

/** Texto antes do link. Neutro: só o título, sem situação e sem termômetro. */
export function shareLead(title){
  const t=oneLine(title).replace(/[.\s]+$/,'');
  return t?t+' — entenda o que muda:':'Entenda o que muda:';
}

/** Mensagem completa: "{Título} — entenda o que muda: {link}". */
export function shareMessage(title,url){return shareLead(title)+' '+url}

/** Endereço de compartilhamento de cada rede. */
export function shareTargetURL(canal,{title,url}){
  const e=encodeURIComponent;
  const lead=shareLead(title),message=shareMessage(title,url);
  switch(canal){
    case 'whatsapp':return 'https://wa.me/?text='+e(message);
    case 'telegram':return 'https://t.me/share/url?url='+e(url)+'&text='+e(lead);
    case 'x':return 'https://twitter.com/intent/tweet?text='+e(lead)+'&url='+e(url);
    case 'facebook':return 'https://www.facebook.com/sharer/sharer.php?u='+e(url);
    case 'email':return 'mailto:?subject='+e(oneLine(title)||'O que muda?')+'&body='+e(message);
    default:return null;
  }
}

/** Dados para navigator.share. O link vai separado para o sistema montar a prévia. */
export function nativeShareData(title,url){
  return {title:oneLine(title)||'O que muda?',text:shareLead(title),url};
}
