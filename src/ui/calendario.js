// Página "Calendário" e etiqueta do momento atual no painel "De olho na Câmara".
import {hojeBrasilia,momento,etiqueta,proximosEventos,faixasDoAno,posicaoNoAno,diaLongo,inicioDeLegislatura} from '../lib/calendario.js';

const MES_CURTO=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const FASE_NOME={sessao:'Em sessão','recesso-julho':'Recesso de julho',recesso:'Recesso'};

/** Etiqueta curta (link para a página). */
export function sessionStatus(hoje=hojeBrasilia()){
 const m=momento(hoje),e=etiqueta(m);
 return '<span class="session-dot" data-fase="'+m.fase+'" aria-hidden="true"></span>'+
  '<span class="session-copy"><strong>'+e.titulo+'</strong><span>'+e.detalhe+'</span></span>'+
  '<span class="session-more"><span class="session-more-label">Ver calendário</span> <span aria-hidden="true">→</span></span>';
}

function agora(m){
 if(m.fase==='sessao')return 'Câmara e Senado podem votar propostas no plenário e nas comissões. O recesso começa em '+diaLongo(m.proximo)+(m.dias<=45?', daqui a '+m.dias+' dias':'')+'.';
 const volta=diaLongo(m.proximo);
 return (m.fase==='recesso-julho'?'Pausa de meio de ano, que só acontece se a LDO já foi aprovada. ':'')+
  'Até '+diaLongo(m.ate)+', não há sessões de votação, salvo convocação extraordinária. Uma proposta “pronta para pauta” só pode ir a plenário a partir de '+volta+'. O prazo das medidas provisórias fica suspenso.';
}

function linhaDoAno(hoje){
 const ano=Number(hoje.slice(0,4)),pos=posicaoNoAno(hoje);
 const faixas=faixasDoAno(ano).map(f=>'<span class="year-band" data-fase="'+f.fase+'" style="left:'+(f.inicio*100).toFixed(3)+'%;width:'+(f.largura*100).toFixed(3)+'%"></span>').join('');
 const meses=MES_CURTO.map(m=>'<span>'+m+'</span>').join('');
 return '<figure class="year-line" aria-hidden="true"><div class="year-track"><div class="year-bands">'+faixas+'</div>'+
  '<span class="year-today" style="left:'+(pos*100).toFixed(3)+'%"><span>hoje</span></span></div>'+
  '<div class="year-months">'+meses+'</div>'+
  '<figcaption class="year-legend"><span><i data-fase="sessao"></i>Em sessão</span><span><i data-fase="recesso"></i>Recesso</span></figcaption></figure>';
}

function evento(e){
 const [,m,d]=e.data.split('-').map(Number);
 const quando=e.fim?'De '+diaLongo(e.data)+' a '+diaLongo(e.fim,{ano:e.fim.slice(0,4)!==e.data.slice(0,4)}):diaLongo(e.data,{ano:true});
 return '<li class="cal-event" data-tipo="'+e.tipo+'"><time class="cal-date" datetime="'+e.data+'"><strong>'+(d===1?'1º':d)+'</strong><span>'+MES_CURTO[m-1]+' '+e.data.slice(0,4)+'</span></time>'+
  '<div class="cal-copy"><h3>'+e.titulo+'</h3><p class="cal-when">'+quando+'</p><p>'+e.texto+'</p></div></li>';
}

function viradaDeLegislatura(hoje){
 const a=Number(hoje.slice(0,4));
 const ano=[a,a+1].find(y=>inicioDeLegislatura(y)&&`${y}-02-01`>=hoje);
 if(!ano)return '';
 return '<section class="cal-section"><h2>Nova legislatura em 1º de fevereiro de '+ano+'</h2>'+
  '<p>Deputados e senadores eleitos em outubro tomam posse, e Câmara e Senado elegem seus presidentes. É o começo de um novo mandato de quatro anos na Câmara.</p>'+
  '<p>As propostas não são mais arquivadas em bloco nessa virada. Desde 2023, pelo Regimento da Câmara, projetos de lei, PECs e outras propostas legislativas só são arquivados depois de tramitar por três legislaturas completas. As propostas de 2025 e 2026 acompanhadas aqui seguem tramitando; medidas provisórias seguem seus próprios prazos.</p></section>';
}

export function calendarPage(hoje=hojeBrasilia()){
 const m=momento(hoje),e=etiqueta(m);
 return '<div class="page inforoute calendar-page"><p class="eyebrow">Calendário</p><h1 tabindex="-1" id="infoTitle">O ano do Congresso.</h1>'+
  '<p class="lead">Quando a Câmara vota, quando para e quais prazos se repetem todo ano. Ajuda a entender por que uma proposta pronta para pauta pode esperar semanas.</p>'+
  '<section class="cal-now" aria-labelledby="calNow"><p class="cal-now-kicker"><span class="session-dot" data-fase="'+m.fase+'" aria-hidden="true"></span>Agora · '+FASE_NOME[m.fase]+'</p>'+
  '<h2 id="calNow">'+e.titulo+'</h2><p>'+agora(m)+'</p>'+linhaDoAno(hoje)+'</section>'+
  '<section class="cal-section" aria-labelledby="calNext"><h2 id="calNext">Próximas datas</h2><ol class="cal-list">'+proximosEventos(hoje).map(evento).join('')+'</ol></section>'+
  viradaDeLegislatura(hoje)+
  '<section class="cal-section"><h2>Regras que valem todo ano</h2><ul class="cal-rules">'+
  '<li><strong>Recesso não é parada total.</strong> O Congresso pode ser convocado para sessões extraordinárias, que votam só os assuntos da convocação. Uma Comissão Representativa do Congresso funciona durante o recesso.</li>'+
  '<li><strong>Pronta para pauta não é votação marcada.</strong> A proposta pode entrar na pauta do plenário, mas a pauta é definida pela presidência da Câmara com os líderes partidários.</li>'+
  '<li><strong>Medidas provisórias param o relógio no recesso.</strong> Elas valem por até 120 dias, e esse prazo não corre durante o recesso.</li>'+
  '<li><strong>Datas em fim de semana ou feriado.</strong> Quando o início ou o fim de um período cai num desses dias, a sessão passa para o dia útil seguinte.</li></ul></section>'+
  '<p class="notice cal-note">Datas fixas previstas na Constituição e no Regimento Interno da Câmara. A agenda semanal de votações ainda não aparece aqui. '+
  'Fontes: <a href="https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art57" target="_blank" rel="noopener noreferrer">Constituição, art. 57</a>, '+
  '<a href="https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc111.htm" target="_blank" rel="noopener noreferrer">Emenda Constitucional 111/2021</a>, '+
  '<a href="https://www2.camara.leg.br/legin/int/rescad/2022/resolucaodacamaradosdeputados-33-4-agosto-2022-793091-publicacaooriginal-165882-pl.html" target="_blank" rel="noopener noreferrer">Resolução da Câmara 33/2022</a> e '+
  '<a href="https://www2.camara.leg.br/comunicacao/assessoria-de-imprensa/guia-para-jornalistas/recesso-dos-deputados" target="_blank" rel="noopener noreferrer">guia da Câmara sobre o recesso</a>.</p>'+
  '<p style="margin-top:26px"><a class="primary-btn" href="#/explorar">Explorar propostas →</a></p></div>';
}
