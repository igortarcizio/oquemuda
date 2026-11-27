// Calendário do ano político: só datas fixas da Constituição e do Regimento da Câmara.
// Nada aqui depende de API; a agenda real de sessões fica para outra demanda.
// Fontes: Constituição, art. 57 e art. 62, § 4º; ADCT, art. 35, § 2º; EC 111/2021;
// Regimento Interno da Câmara, art. 105 (Resolução 33/2022).

const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

/** Data de hoje em Brasília, AAAA-MM-DD. */
export function hojeBrasilia(agora=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
}
const iso=(a,m,d)=>`${a}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const partes=s=>s.split('-').map(Number);
/** "22/12", "1º/2" (forma da etiqueta). */
export function diaCurto(s){const [,m,d]=partes(s);return (d===1?'1º':String(d))+'/'+m}
/** "22 de dezembro", "1º de fevereiro". */
export function diaLongo(s,{ano=false}={}){const [a,m,d]=partes(s);return (d===1?'1º':String(d))+' de '+MESES[m-1]+(ano?' de '+a:'')}
function diasEntre(a,b){return Math.round((Date.UTC(...partes(b).map((v,i)=>i===1?v-1:v))-Date.UTC(...partes(a).map((v,i)=>i===1?v-1:v)))/86_400_000)}

/** Primeiro ano de cada legislatura (4 anos): 2023, 2027, 2031... */
export const inicioDeLegislatura=ano=>(ano-2023)%4===0;
/** Mesas da Câmara e do Senado têm mandato de 2 anos: eleição em 2025, 2027, 2029... */
export const anoDeEleicaoDasMesas=ano=>ano%2===1;

/**
 * Fase do ano legislativo numa data.
 * sessao: 2/2 a 17/7 e 1º/8 a 22/12 · recesso-julho: 18/7 a 31/7 · recesso: 23/12 a 1º/2.
 */
export function momento(hoje=hojeBrasilia()){
 const [a,m,d]=partes(hoje);
 const md=m*100+d;
 if(md>=202&&md<=717)return {fase:'sessao',ate:iso(a,7,17),proximo:iso(a,7,18),dias:diasEntre(hoje,iso(a,7,18))};
 if(md>=718&&md<=731)return {fase:'recesso-julho',ate:iso(a,7,31),proximo:iso(a,8,1),dias:diasEntre(hoje,iso(a,8,1))};
 if(md>=801&&md<=1222)return {fase:'sessao',ate:iso(a,12,22),proximo:iso(a,12,23),dias:diasEntre(hoje,iso(a,12,23))};
 const anoSeguinte=md>=1223?a+1:a;
 return {fase:'recesso',ate:iso(anoSeguinte,2,1),proximo:iso(anoSeguinte,2,2),dias:diasEntre(hoje,iso(anoSeguinte,2,2))};
}

/** Texto curto da etiqueta perto do "De olho na Câmara". */
export function etiqueta(m=momento()){
 if(m.fase==='sessao')return {titulo:'Câmara em sessão até '+diaCurto(m.ate),detalhe:m.dias<=30?'Recesso começa em '+(m.dias===1?'1 dia':m.dias+' dias'):'Votações podem ocorrer'};
 if(m.fase==='recesso-julho')return {titulo:'Recesso de julho até '+diaCurto(m.ate),detalhe:'Votações só em convocação extraordinária'};
 return {titulo:'Recesso parlamentar até '+diaCurto(m.ate),detalhe:'Votações só em convocação extraordinária'};
}

/** Datas fixas de um ano. Cada evento: {data, fim?, titulo, texto, tipo}. */
export function eventosDoAno(ano){
 const ev=[];
 if(ano>=2027&&inicioDeLegislatura(ano)){
  ev.push({data:iso(ano,1,5),titulo:'Posse do presidente e do vice-presidente da República',texto:'Primeira posse em 5 de janeiro, e não mais em 1º de janeiro (Emenda Constitucional 111/2021).',tipo:'posse'});
  ev.push({data:iso(ano,1,6),titulo:'Posse de governadores e vice-governadores',texto:'Também nova data pela Emenda Constitucional 111/2021.',tipo:'posse'});
 }
 if(inicioDeLegislatura(ano)){
  ev.push({data:iso(ano,2,1),titulo:'Posse de deputados federais e senadores e eleição das Mesas',texto:'Começa a nova legislatura, que dura quatro anos. Câmara e Senado elegem seus presidentes para os dois anos seguintes.',tipo:'posse'});
 }else if(anoDeEleicaoDasMesas(ano)){
  ev.push({data:iso(ano,2,1),titulo:'Eleição dos presidentes da Câmara e do Senado',texto:'As Mesas Diretoras têm mandato de dois anos e são eleitas de novo na metade da legislatura.',tipo:'posse'});
 }
 ev.push({data:iso(ano,2,2),titulo:'Abertura do ano legislativo',texto:'Sessão conjunta de Câmara e Senado. A partir daqui, propostas podem ser votadas em plenário.',tipo:'sessao'});
 ev.push({data:iso(ano,4,15),titulo:'Prazo para o governo enviar a LDO',texto:'O projeto da Lei de Diretrizes Orçamentárias, que orienta o Orçamento do ano seguinte, chega ao Congresso até esta data.',tipo:'orcamento'});
 ev.push({data:iso(ano,7,17),titulo:'Fim do primeiro semestre legislativo',texto:'O recesso de julho só começa se a LDO tiver sido aprovada. Sem isso, o Congresso continua trabalhando.',tipo:'sessao'});
 ev.push({data:iso(ano,7,18),fim:iso(ano,7,31),titulo:'Recesso de julho',texto:'Sem sessões de votação, salvo convocação extraordinária. Depende da aprovação da LDO.',tipo:'recesso'});
 ev.push({data:iso(ano,8,1),titulo:'Volta do segundo semestre legislativo',texto:'As votações em plenário podem ser retomadas.',tipo:'sessao'});
 ev.push({data:iso(ano,8,31),titulo:inicioDeLegislatura(ano)?'Prazo para o governo enviar o Orçamento e o Plano Plurianual':'Prazo para o governo enviar o Orçamento',texto:inicioDeLegislatura(ano)?'O projeto do Orçamento (LOA) do ano seguinte e o Plano Plurianual, que vale por quatro anos, chegam ao Congresso até esta data.':'O projeto da Lei Orçamentária Anual (LOA) do ano seguinte chega ao Congresso até esta data.',tipo:'orcamento'});
 ev.push({data:iso(ano,12,22),titulo:'Fim do ano legislativo',texto:'Último dia para o Congresso devolver o Orçamento do ano seguinte para sanção.',tipo:'orcamento'});
 ev.push({data:iso(ano,12,23),fim:iso(ano+1,2,1),titulo:'Recesso parlamentar',texto:'Sem sessões de votação, salvo convocação extraordinária. Uma Comissão Representativa do Congresso funciona no período.',tipo:'recesso'});
 return ev;
}

/** Próximos eventos a partir de hoje (inclui o período em curso), em ordem. */
export function proximosEventos(hoje=hojeBrasilia(),{quantos=10}={}){
 const [a]=partes(hoje);
 return [...eventosDoAno(a-1),...eventosDoAno(a),...eventosDoAno(a+1)]
  .filter(e=>(e.fim||e.data)>=hoje)
  .sort((x,y)=>x.data.localeCompare(y.data))
  .slice(0,quantos);
}

/** Faixas do ano para a linha do tempo: proporção do ano em cada fase. */
export function faixasDoAno(ano){
 const dia=s=>diasEntre(iso(ano,1,1),s);
 const total=dia(iso(ano+1,1,1));
 const f=(de,ate,fase)=>({de,ate,fase,inicio:dia(de)/total,largura:(dia(ate)-dia(de)+1)/total});
 return [f(iso(ano,1,1),iso(ano,2,1),'recesso'),f(iso(ano,2,2),iso(ano,7,17),'sessao'),f(iso(ano,7,18),iso(ano,7,31),'recesso-julho'),f(iso(ano,8,1),iso(ano,12,22),'sessao'),f(iso(ano,12,23),iso(ano,12,31),'recesso')];
}
/** Posição de hoje no ano (0 a 1). */
export function posicaoNoAno(hoje=hojeBrasilia()){
 const [a]=partes(hoje);
 return diasEntre(iso(a,1,1),hoje)/diasEntre(iso(a,1,1),iso(a+1,1,1));
}
