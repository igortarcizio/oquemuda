// Botão "Compartilhar" dos cards e da ficha.
// Celular com folha nativa: navigator.share. Demais casos: um único menu preso ao <body>
// (dentro do card ele seria cortado pelo overflow:hidden), com WhatsApp, Telegram, X,
// Facebook, E-mail e Copiar link.
import {SHARE_TARGETS,shareURL,shareTargetURL,nativeShareData} from '../lib/share.js';
import {registerShare} from '../data/shares.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const SHARE_ICON='<svg class="share-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5l7 7-7 7"/><path d="M21 12h-9a8 8 0 0 0-8 8"/></svg>';

const ICONS={
  whatsapp:'<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9.5 9.5c.3 1.8 2.2 3.8 4 4.2l1.2-1.2 2 1-.4 1.5c-3.5.4-7.6-3.7-7.3-7.3L10.5 7l1 2z"/>',
  telegram:'<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
  x:'<path d="M5 4l14 16"/><path d="M19 4L5 20"/>',
  facebook:'<path d="M14 21v-8h3l.5-3H14V8.3c0-.9.4-1.5 1.6-1.5H18V4.2A19 19 0 0 0 15.4 4C12.9 4 11 5.6 11 8.3V10H8v3h3v8"/>',
  email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  copiar:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'
};
const icon=canal=>'<svg class="share-item-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+ICONS[canal]+'</svg>';

/** HTML do botão. No card só o ícone; na ficha ícone + texto. */
export function shareButton(id,{ref='',title='',withLabel=false}={}){
  const n=Number(id);
  return '<button class="sharebtn'+(withLabel?' with-label':'')+'" type="button" data-share="'+n+'" data-share-title="'+esc(title)+'" data-share-ref="'+esc(ref)+'"'+
    ' aria-haspopup="dialog" aria-expanded="false"'+(withLabel?'':' aria-label="Compartilhar '+esc(ref)+'"')+'>'+
    SHARE_ICON+(withLabel?'<span>Compartilhar</span>':'')+'</button>';
}

/** Celular com folha de compartilhamento do sistema. No desktop o menu próprio é melhor. */
export function canShareNatively(win=globalThis){
  return typeof win.navigator?.share==='function'&&!!win.matchMedia?.('(pointer: coarse)').matches;
}

/** Título que o leitor está vendo (a IA pode ter trocado o título do card depois do desenho). */
function visibleTitle(button){
  const box=button.closest('article,.detail');
  const heading=box?.querySelector('#detailTitle,h3 .card-link,h3');
  const seen=heading?.textContent?.replace(/\s+/g,' ').trim();
  return seen||button.dataset.shareTitle||'';
}

let menu=null,trigger=null,copyTimer=null,announcer=()=>{};

function close({restoreFocus=true}={}){
  if(!menu)return;
  clearTimeout(copyTimer);
  menu.remove();menu=null;
  document.removeEventListener('pointerdown',onPointerDown,true);
  document.removeEventListener('keydown',onKeyDown,true);
  window.removeEventListener('resize',onViewportChange);
  window.removeEventListener('scroll',onViewportChange,true);
  const t=trigger;trigger=null;
  if(t?.isConnected){t.setAttribute('aria-expanded','false');if(restoreFocus)t.focus({preventScroll:true})}
}
function onPointerDown(e){if(menu&&!menu.contains(e.target)&&!trigger?.contains(e.target))close({restoreFocus:false})}
function onKeyDown(e){if(e.key==='Escape'&&menu){e.preventDefault();e.stopPropagation();close()}}
// No celular o menu é uma folha fixa embaixo e não precisa acompanhar a rolagem.
function onViewportChange(){if(menu&&!isSheet())close({restoreFocus:false})}
const isSheet=()=>!!globalThis.matchMedia?.('(max-width: 640px)').matches;

function place(){
  if(!menu||!trigger)return;
  if(isSheet()){menu.style.removeProperty('top');menu.style.removeProperty('left');return}
  const r=trigger.getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight,gap=8,margin=12;
  const left=Math.min(Math.max(margin,r.right-w),window.innerWidth-w-margin);
  const below=r.bottom+gap,above=r.top-gap-h;
  const top=below+h<=window.innerHeight-margin||above<margin?below:above;
  menu.style.left=Math.round(left)+'px';menu.style.top=Math.round(top)+'px';
}

async function copyLink(url){
  try{await navigator.clipboard.writeText(url);return true}catch{}
  try{
    const field=document.createElement('textarea');
    field.value=url;field.setAttribute('readonly','');field.style.cssText='position:fixed;opacity:0;top:0;left:0';
    document.body.append(field);field.select();
    const ok=document.execCommand('copy');field.remove();return ok;
  }catch{return false}
}

function openMenu(button,{id,title,url,ref}){
  close({restoreFocus:false});
  trigger=button;button.setAttribute('aria-expanded','true');
  menu=document.createElement('div');
  menu.className='share-menu';
  menu.setAttribute('role','dialog');
  menu.setAttribute('aria-labelledby','shareMenuTitle');
  menu.innerHTML='<div class="share-menu-head"><p id="shareMenuTitle" class="share-menu-title">Compartilhar'+(ref?' <span>'+esc(ref)+'</span>':'')+'</p>'+
    '<button type="button" class="share-close" data-share-close aria-label="Fechar">×</button></div>'+
    '<ul class="share-list">'+
    SHARE_TARGETS.map(t=>{
      const href=shareTargetURL(t.canal,{title,url}),web=href.startsWith('https://');
      return '<li><a class="share-item" data-canal="'+t.canal+'" href="'+esc(href)+'"'+(web?' target="_blank" rel="noopener noreferrer"':'')+'>'+
        icon(t.canal)+'<span>'+esc(t.label)+'</span>'+(web?'<span class="sr-only"> (abre em nova aba)</span>':'')+'</a></li>';
    }).join('')+
    '<li><button type="button" class="share-item" data-canal="copiar">'+icon('copiar')+'<span class="share-copy-label">Copiar link</span></button></li>'+
    '</ul><div class="share-fallback" hidden><label for="shareLinkField">Não foi possível copiar. Selecione o link:</label><input id="shareLinkField" type="text" readonly value="'+esc(url)+'"></div>';
  document.body.append(menu);
  place();

  menu.addEventListener('click',async e=>{
    if(e.target.closest('[data-share-close]')){close();return}
    const item=e.target.closest('[data-canal]');
    if(!item)return;
    const canal=item.dataset.canal;
    if(canal!=='copiar'){registerShare(id,canal);setTimeout(()=>close({restoreFocus:false}),0);return}
    const ok=await copyLink(url);
    if(!menu)return;
    if(ok){
      registerShare(id,'copiar');
      const label=item.querySelector('.share-copy-label');
      label.textContent='Link copiado';item.classList.add('copied');
      announcer('Link copiado.');
      clearTimeout(copyTimer);copyTimer=setTimeout(()=>{if(label.isConnected){label.textContent='Copiar link';item.classList.remove('copied')}},2000);
    }else{
      const box=menu.querySelector('.share-fallback'),field=box.querySelector('input');
      box.hidden=false;place();field.focus();field.select();
      announcer('Não foi possível copiar. Selecione o link no campo.');
    }
  });
  // Saiu do menu com Tab: fecha sem puxar o foco de volta.
  menu.addEventListener('focusout',e=>{if(menu&&e.relatedTarget&&!menu.contains(e.relatedTarget)&&e.relatedTarget!==trigger)close({restoreFocus:false})});
  document.addEventListener('pointerdown',onPointerDown,true);
  document.addEventListener('keydown',onKeyDown,true);
  window.addEventListener('resize',onViewportChange);
  window.addEventListener('scroll',onViewportChange,true);
  menu.querySelector('.share-item')?.focus({preventScroll:true});
}

/**
 * Abre o compartilhamento para o botão clicado.
 * @param {HTMLButtonElement} button botão com data-share
 * @param {{announce?:(text:string)=>void, ref?:string}} opts ref padrão: data-share-ref do botão
 */
export async function openShare(button,{announce,ref=button.dataset.shareRef||''}={}){
  if(announce)announcer=announce;
  const id=Number(button.dataset.share);
  if(!Number.isSafeInteger(id)||id<=0)return;
  if(trigger===button&&menu){close();return}
  const title=visibleTitle(button),url=shareURL(id);
  if(canShareNatively()){
    try{await navigator.share(nativeShareData(title,url));registerShare(id,'nativo');return}
    catch(e){if(e?.name==='AbortError')return}
    // Outro erro (permissão, conteúdo recusado): cai no menu próprio.
  }
  openMenu(button,{id,title,url,ref});
}

export function closeShare(){close({restoreFocus:false})}
