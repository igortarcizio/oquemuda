/**
 * Utilitários editoriais. Nunca convertem a aprovação de proposta em fato consumado.
 * @typedef {{id:number, siglaTipo:string, numero:number, ano:number, ementa:string, titulo?:string,
 * impacto?:string, area?:string, publicos?:string[], comoHoje?:string}} Proposal
 */
const ACRONYMS = /\b(?:PL|PLP|PEC|CLT|SUS|STF|STJ|CCJC|INSS|FGTS|LGPD|IBGE|CNJ|TSE|MPV|PDL|ONG|LGBTQIAP\+)\b/g;
export const THEMES = ['Todos','Trabalho','Consumo','Saúde','Educação','Tecnologia','Mobilidade','Outros'];
export const TOPIC_API = Object.freeze({Trabalho:'trabalho',Consumo:'consumidor',Saúde:'saúde',Educação:'educação',Tecnologia:'tecnologia',Mobilidade:'transporte'});

export function cleanText(input) {
  return String(input ?? '')
    .replace(/[\r\n\t\u00a0]+/g, ' ').replace(/[\u200b-\u200f\ufeff]/g,'')
    .replace(/\s+/g,' ').replace(/\s+([,.;!?])/g,'$1')
    .replace(/(?:\s*[,;:\-–—]|\s*\.{2,})+\s*$/gu,'')
    .trim();
}
export function safeText(input) {
  return cleanText(input).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export const simplify = text => cleanText(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function preserveSiglas(text) {
  const normalized=cleanText(text);
  return normalized.replace(/\b(?:plp|pec|clt|sus|stf|stj|ccjc|inss|fgts|lgpd|ibge|cnj|tse|mpv|pdl)\b/gi,m=>m.toUpperCase()).replace(ACRONYMS,m=>m);
}
export const ref = p => [p.siglaTipo||'PL',p.numero+'/'+p.ano].join(' ');
export const dateBR = raw => {
  const m=String(raw||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?m[3]+'/'+m[2]+'/'+m[1]:'Não informada';
};
export const officialURL = p => 'https://www.camara.leg.br/propostas-legislativas/'+encodeURIComponent(p.id);
const topicRules=[
  [/linha(?:s)?\s+cortante|linha(?:s)?\s+com\s+cerol/i,'Como combater o uso de linhas cortantes em pipas?'],
  [/intervalo(?:s)?\s+(?:intra)?jornada|repouso\s+(?:na|durante)\s+jornada/i,'Os intervalos de descanso no trabalho podem mudar?'],
  [/direitos\s+acad[eê]micos.+viol[eê]ncia\s+dom[eé]stica/i,'Estudantes vítimas de violência terão mais proteção?'],
  [/diabetes.+doen[cç]a\s+cel[ií]aca|doen[cç]a\s+cel[ií]aca.+diabetes/i,'Crianças podem ter novos exames preventivos no SUS?'],
  [/licen[cç]a[\s-]*paternidade/i,'O que pode mudar na licença-paternidade?'],
  [/licen[cç]a[\s-]*maternidade/i,'O que pode mudar na licença-maternidade?'],
  [/medicamento.+(?:tribut|imposto)|(?:tribut|imposto).+medicamento/i,'Impostos sobre medicamentos podem mudar?'],
  [/tarifa\s+social\s+(?:de\s+)?energia/i,'O que pode mudar na tarifa social de energia?'],
  [/trabalho\s+por\s+(?:aplicativo|plataforma)|entregador.+plataforma/i,'O que pode mudar no trabalho por aplicativo?'],
  [/viol[eê]ncia\s+dom[eé]stica/i,'Como a proposta trata a violência doméstica?'],
  [/movimento\s+estudantil/i,'Como preservar a memória do movimento estudantil?'],
  [/transporte\s+a[eé]reo|passageiro.+a[eé]re/i,'Quais direitos de passageiros aéreos podem mudar?'],
  [/atendimento\s+socioeducativo|sinase/i,'O que pode mudar no atendimento socioeducativo?'],
  [/assist[eê]ncia\s+previdenci[aá]ria\s+universit[aá]ria/i,'Universitários podem ajudar na assistência previdenciária?'],
  [/doa[cç][aã]o\s+(?:volunt[aá]ria\s+)?de\s+sangue/i,'A doação de sangue pode ter novas regras?'],
  [/pessoas\s+com\s+defici[eê]ncia|acessibilidade/i,'O que pode melhorar na acessibilidade?'],
  [/prote[cç][aã]o\s+de\s+dados|dados\s+pessoais/i,'Como a proposta pretende proteger dados pessoais?'],
  [/intelig[eê]ncia\s+artificial/i,'Quais regras podem mudar para a inteligência artificial?'],
  [/plataformas?\s+digitais/i,'O que pode mudar para as plataformas digitais?'],
  [/educa[cç][aã]o\s+b[aá]sica/i,'O que pode mudar na educação básica?'],
  [/institui[cç][oõ]es?\s+de\s+ensino/i,'O que pode mudar nas instituições de ensino?'],
  [/prote[cç][aã]o\s+animal|maus[\s-]*tratos\s+a\s+animais/i,'Como a proposta pretende proteger os animais?'],
  [/meio\s+ambiente|desmatamento/i,'Quais medidas ambientais estão em discussão?'],
  [/habita[cç][aã]o|moradia\s+popular/i,'O que pode mudar no acesso à moradia?'],
  [/aposentadoria|previd[eê]ncia/i,'O que pode mudar na Previdência?'],
  [/seguran[cç]a\s+p[uú]blica/i,'O que pode mudar na segurança pública?'],
  [/patrim[oô]nio\s+cultural/i,'Como o patrimônio cultural pode ser protegido?']
];
const CUT_END = /\s+(?:de|da|do|das|dos|para|por|em|a|o|com|e|sobre|na|no)$/i;
function compactSubject(ementa,max=37) {
  let raw=cleanText(ementa)
    .replace(/^Altera\s+(?:a\s+)?Lei\s+n[º°.]?\s*[\d.,/ \w-]+?\s*,?\s*para\s+/i,'')
    .replace(/^(?:Dispõe sobre|Estabelece|Institui|Cria|Altera|Define|Regulamenta|Modifica|Prevê|Autoriza|Proíbe|Determina|Torna obrigat[oó]ria)\s+/i,'')
    .replace(/^(?:a|o|as|os|um|uma)\s+/i,'')
    .replace(/^(?:diretrizes|normas|regras)\s+(?:nacionais?\s+)?(?:para|sobre|de)\s+/i,'')
    .split(/[,;:(]/)[0].replace(/^(?:Lei\s+n[º°.]?|Decreto-Lei\s+n[º°.]?)\s*[\d.,/]+.*$/i,'');
  raw=cleanText(raw);
  if(raw.length>max) {
    const upto=raw.slice(0,max+1),cut=upto.lastIndexOf(' ');
    raw=upto.slice(0,cut>max*.55?cut:max);
  }
  return cleanText(raw.replace(CUT_END,''));
}
/** Sempre questionamento, limitado semanticamente. Sem IA não é seguro inventar impactos. */
export function questionTitle(p,editorial={}) {
  const approved=cleanText(editorial.titulo||p.titulo);
  if(approved && approved.endsWith('?') && approved.length<=82) return preserveSiglas(approved);
  const e=cleanText(p.ementa);
  if(!e)return 'O que esta proposta pretende mudar?';
  for(const [regex,q] of topicRules)if(regex.test(e))return q;
  if(p.siglaTipo==='REQ')return /urg[eê]ncia/i.test(e)?'Qual projeto pode tramitar com urgência?':'Qual pedido foi apresentado à Câmara?';
  if(p.siglaTipo==='MSC')return 'O que o Congresso precisa analisar nesta mensagem?';
  const subject=compactSubject(e,39);
  if(subject.length>=9 && !/^(?:Lei|Decreto|Artigo)\s+n[º°.]?/i.test(subject)) {
    const title='O que pode mudar em '+subject.charAt(0).toLowerCase()+subject.slice(1)+'?';
    if(title.length<=81)return preserveSiglas(title);
  }
  const topic=editorial.area||p.area;
  const contexts={Trabalho:'nas relações de trabalho',Consumo:'nos direitos do consumidor',Saúde:'na saúde',Educação:'na educação',Tecnologia:'na tecnologia',Mobilidade:'no transporte'};
  return 'O que a proposta pretende mudar '+(contexts[topic]||'para a população')+'?';
}
export function classifyTheme(p,editorial={}) {
  if(editorial.area&&THEMES.includes(editorial.area))return editorial.area;
  const text=simplify(p.ementa);
  const options=[['Saúde',/saude|sus\b|hospital|diabetes|medicament|vacina|doenca/],['Trabalho',/trabalh|empreg|salario|previdencia|clt\b/],['Educação',/educac|escolar|universit|professor|estudant|ensino/],['Consumo',/consumidor|consumo|tarifa|comercio|compras/],['Tecnologia',/internet|digital|inteligencia artificial|dados pessoais/],['Mobilidade',/transporte|transito|passageiro|rodovia|mobilidade/]];
  return options.find(([,rx])=>rx.test(text))?.[0]||'Outros';
}
export function cardSummary(p,editorial={}) {
  return cleanText(editorial.impacto||p.impacto||p.ementa);
}
