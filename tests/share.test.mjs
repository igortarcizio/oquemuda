import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
globalThis.window={OBM_EDITORIAL:{}};

const {shareURL,detailHash,shareLead,shareMessage,shareTargetURL,nativeShareData,SHARE_TARGETS,SHARE_CHANNELS}=await import('../src/lib/share.js');
const {sharePayload,registerShare}=await import('../src/data/shares.js');
const {shareButton,canShareNatively}=await import('../src/ui/share-menu.js');
const {card,detailPage}=await import('../src/ui/components.js');

const URL_P='https://igortarcizio.github.io/oquemuda/p/2482140.html';
const p={id:2482140,siglaTipo:'PL',numero:5817,ano:2026,ementa:'Altera a Lei nº 8.078, de 11 de setembro de 1990 (Código de Defesa do Consumidor), para proibir cobrança de taxa de religação.',dataApresentacao:'2026-11-10'};

test('link compartilhado é a página de prévia; id inválido cai na home',()=>{
  assert.equal(shareURL(2482140),URL_P);
  assert.equal(shareURL('2482140'),URL_P);
  assert.equal(shareURL('abc'),'https://igortarcizio.github.io/oquemuda/');
  assert.equal(shareURL(-3),'https://igortarcizio.github.io/oquemuda/');
  assert.equal(detailHash(2482140),'#/tema/2482140');
  assert.equal(detailHash('1;alert(1)'),'#/explorar');
});

test('texto padrão é neutro: só título, sem situação',()=>{
  assert.equal(shareLead('Proíbe cobrança de taxa de religação'),'Proíbe cobrança de taxa de religação — entenda o que muda:');
  assert.equal(shareLead('  Bancos podem ter novas obrigações?\n'),'Bancos podem ter novas obrigações? — entenda o que muda:');
  assert.equal(shareLead('Termina com ponto.'),'Termina com ponto — entenda o que muda:');
  assert.equal(shareLead(''),'Entenda o que muda:');
  assert.equal(shareMessage('Proíbe X',URL_P),'Proíbe X — entenda o que muda: '+URL_P);
});

test('endereços de cada rede, com acento, aspas, & e # codificados',()=>{
  const title='Ação "urgente" & #saúde';
  const w=shareTargetURL('whatsapp',{title,url:URL_P});
  assert.ok(w.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(w.split('text=')[1]),shareMessage(title,URL_P));
  assert.ok(!/[ "#&]/.test(w.split('text=')[1]),'texto do WhatsApp sem caracteres crus');
  const t=new URL(shareTargetURL('telegram',{title,url:URL_P}));
  assert.equal(t.origin+t.pathname,'https://t.me/share/url');
  assert.equal(t.searchParams.get('url'),URL_P);
  assert.equal(t.searchParams.get('text'),shareLead(title));
  const x=new URL(shareTargetURL('x',{title,url:URL_P}));
  assert.equal(x.searchParams.get('url'),URL_P);
  assert.equal(x.searchParams.get('text'),shareLead(title));
  const f=new URL(shareTargetURL('facebook',{title,url:URL_P}));
  assert.equal(f.searchParams.get('u'),URL_P);
  const m=shareTargetURL('email',{title,url:URL_P});
  assert.ok(m.startsWith('mailto:?subject='));
  assert.equal(decodeURIComponent(m.match(/subject=([^&]*)/)[1]),title);
  assert.equal(decodeURIComponent(m.match(/body=(.*)$/)[1]),shareMessage(title,URL_P));
  assert.equal(shareTargetURL('tiktok',{title,url:URL_P}),null);
});

test('menu do desktop: WhatsApp, Telegram, X, Facebook e E-mail (Copiar link à parte)',()=>{
  assert.deepEqual(SHARE_TARGETS.map(t=>t.label),['WhatsApp','Telegram','X','Facebook','E-mail']);
  for(const t of SHARE_TARGETS)assert.ok(SHARE_CHANNELS.includes(t.canal));
  assert.ok(SHARE_CHANNELS.includes('copiar')&&SHARE_CHANNELS.includes('nativo'));
});

test('folha nativa recebe título, texto e link separados',()=>{
  assert.deepEqual(nativeShareData('Proíbe X',URL_P),{title:'Proíbe X',text:'Proíbe X — entenda o que muda:',url:URL_P});
  assert.equal(nativeShareData('',URL_P).title,'O que muda?');
});

test('folha nativa só em tela de toque com navigator.share',()=>{
  const win=(share,coarse)=>({navigator:share?{share(){}}:{},matchMedia:()=>({matches:coarse})});
  assert.equal(canShareNatively(win(true,true)),true);
  assert.equal(canShareNatively(win(true,false)),false);
  assert.equal(canShareNatively(win(false,true)),false);
  assert.equal(canShareNatively({}),false);
});

test('contador: corpo da função e canais aceitos',()=>{
  const body=sharePayload('2482140','whatsapp');
  assert.equal(body.p_proposicao,2482140);
  assert.equal(body.p_canal,'whatsapp');
  assert.match(body.p_leitor,/^[0-9a-f-]{36}$/);
  assert.equal(sharePayload(2482140,'tiktok'),null);
  assert.equal(sharePayload('x','copiar'),null);
});

test('contador nunca quebra o compartilhamento',async()=>{
  let called=null;
  assert.equal(await registerShare(2482140,'copiar',{fetchImpl:(url,opts)=>{called={url,body:JSON.parse(opts.body)};return Promise.resolve({ok:true})}}),true);
  assert.match(called.url,/\/rpc\/registrar_compartilhamento$/);
  assert.equal(called.body.p_canal,'copiar');
  assert.equal(await registerShare(2482140,'copiar',{fetchImpl:()=>Promise.reject(new TypeError('offline'))}),false);
  assert.equal(await registerShare(2482140,'copiar',{fetchImpl:()=>{throw new Error('sync')}}),false);
  assert.equal(await registerShare(2482140,'copiar',{fetchImpl:()=>Promise.resolve({ok:false,status:404})}),false);
  assert.equal(await registerShare(2482140,'tiktok',{fetchImpl:()=>assert.fail('não deveria chamar')}),false);
});

test('botão: só ícone no card (com aria-label), ícone + texto na ficha',()=>{
  const icon=shareButton(2482140,{ref:'PL 5817/2026',title:'Título "x"'});
  assert.match(icon,/data-share="2482140"/);
  assert.match(icon,/aria-label="Compartilhar PL 5817\/2026"/);
  assert.match(icon,/aria-haspopup="dialog"/);
  assert.match(icon,/aria-expanded="false"/);
  assert.match(icon,/data-share-title="Título &quot;x&quot;"/);
  assert.doesNotMatch(icon,/<span>Compartilhar<\/span>/);
  const labeled=shareButton(2482140,{ref:'PL 5817/2026',withLabel:true});
  assert.match(labeled,/<span>Compartilhar<\/span>/);
  assert.doesNotMatch(labeled,/aria-label=/);

  const c=card(p,null,false);
  assert.match(c,/class="card-actions"><button class="sharebtn"[^>]*data-share="2482140"/);
  assert.match(c,/data-save="2482140"/);
  const d=detailPage(p,{loaded:true},false);
  assert.match(d,/class="detail-actions">.*data-save=.*class="sharebtn with-label"/s);
});

test('imports do botão com a mesma versão (um módulo só no navegador)',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const comp=readFileSync(new URL('../src/ui/components.js',import.meta.url),'utf8');
  const v=(s,re)=>s.match(re)?.[1];
  assert.ok(v(app,/share-menu\.js\?v=([^']+)'/));
  assert.equal(v(app,/share-menu\.js\?v=([^']+)'/),v(comp,/share-menu\.js\?v=([^']+)'/));
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/styles\/share\.css/);
  assert.match(html,/property="og:image" content="https:\/\/igortarcizio\.github\.io\/oquemuda\/og\.png"/);
});
