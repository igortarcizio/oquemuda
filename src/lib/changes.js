// "O que a proposta quer mudar?": explicação estruturada a partir de dados oficiais.
// Tudo aqui é determinístico e verificável na ementa. Não interpreta efeitos.
// O "como é hoje / como ficaria" vem só do editorial validado (ver editorialChange).

/** Nome popular e função das leis mais citadas nas ementas. Chave: "Lei 8.080/1990". */
export const KNOWN_LAWS=Object.freeze({
  'Constituição Federal':['Constituição Federal','a lei máxima do país, que define direitos fundamentais e a organização do Estado'],
  'Decreto-Lei 2.848/1940':['Código Penal','define os crimes e as penas'],
  'Decreto-Lei 3.689/1941':['Código de Processo Penal','regula a investigação e o julgamento de crimes'],
  'Decreto-Lei 3.688/1941':['Lei das Contravenções Penais','define infrações penais mais leves que os crimes'],
  'Decreto-Lei 5.452/1943':['CLT (Consolidação das Leis do Trabalho)','regula o trabalho com carteira assinada'],
  'Decreto-Lei 986/1969':['Normas básicas sobre alimentos','regula a produção, a rotulagem e a fiscalização de alimentos'],
  'Lei 4.737/1965':['Código Eleitoral','organiza as eleições e a Justiça Eleitoral'],
  'Lei 5.172/1966':['Código Tributário Nacional','define as regras gerais dos impostos e taxas'],
  'Lei 5.889/1973':['Lei do Trabalho Rural','regula o trabalho no campo'],
  'Lei 6.015/1973':['Lei de Registros Públicos','regula cartórios, certidões e registros de nascimento, casamento e imóveis'],
  'Lei 6.360/1976':['Lei de Vigilância Sanitária','regula o registro e o controle de medicamentos, cosméticos e produtos de saúde'],
  'Lei 6.437/1977':['Lei das Infrações Sanitárias','define infrações à legislação sanitária e suas penalidades'],
  'Lei 6.938/1981':['Política Nacional do Meio Ambiente','define as bases da proteção ambiental e do licenciamento'],
  'Lei 7.210/1984':['Lei de Execução Penal','regula o cumprimento de penas e o sistema prisional'],
  'Lei 7.565/1986':['Código Brasileiro de Aeronáutica','regula a aviação civil e o transporte aéreo'],
  'Lei 7.713/1988':['Lei do Imposto de Renda','define regras do Imposto de Renda, incluindo isenções'],
  'Lei 7.716/1989':['Lei do Crime Racial','define os crimes de preconceito de raça, cor, etnia, religião ou procedência nacional'],
  'Lei 8.036/1990':['Lei do FGTS','regula o Fundo de Garantia do Tempo de Serviço'],
  'Lei 8.069/1990':['Estatuto da Criança e do Adolescente (ECA)','garante direitos e proteção a crianças e adolescentes'],
  'Lei 8.072/1990':['Lei dos Crimes Hediondos','lista os crimes mais graves, com regras de pena mais duras'],
  'Lei 8.078/1990':['Código de Defesa do Consumidor','protege quem compra produtos e contrata serviços'],
  'Lei 8.080/1990':['Lei Orgânica da Saúde','organiza o SUS e as ações de saúde no país'],
  'Lei 8.112/1990':['Regime dos servidores federais','define direitos e deveres dos servidores públicos federais'],
  'Lei 8.212/1991':['Lei de Custeio da Seguridade Social','define as contribuições que financiam o INSS'],
  'Lei 8.213/1991':['Lei de Benefícios da Previdência','define aposentadorias, pensões e auxílios do INSS'],
  'Lei 8.313/1991':['Lei Rouanet','regula o incentivo fiscal a projetos culturais'],
  'Lei 8.429/1992':['Lei de Improbidade Administrativa','pune agentes públicos por desvio, enriquecimento ilícito e danos ao patrimônio público'],
  'Lei 8.742/1993':['Lei Orgânica da Assistência Social (LOAS)','organiza a assistência social e o BPC'],
  'Lei 8.906/1994':['Estatuto da Advocacia e da OAB','regula a profissão de advogado'],
  'Lei 8.987/1995':['Lei de Concessões','regula serviços públicos prestados por empresas, como pedágios e transporte'],
  'Lei 8.989/1995':['Lei de isenção de IPI na compra de carros','isenta de IPI carros comprados por pessoas com deficiência e taxistas'],
  'Lei 9.029/1995':['Lei contra discriminação no trabalho','proíbe exigir atestado de gravidez e outras práticas discriminatórias na contratação'],
  'Lei 9.250/1995':['Lei do Imposto de Renda da pessoa física','define deduções e regras da declaração do IR'],
  'Lei 9.294/1996':['Lei de restrição à propaganda','limita a publicidade de cigarros, bebidas alcoólicas e medicamentos'],
  'Lei 9.394/1996':['Lei de Diretrizes e Bases da Educação (LDB)','organiza a educação no país, da creche à universidade'],
  'Lei 9.433/1997':['Lei das Águas','define a Política Nacional de Recursos Hídricos'],
  'Lei 9.472/1997':['Lei Geral de Telecomunicações','regula telefonia, internet e a Anatel'],
  'Lei 9.503/1997':['Código de Trânsito Brasileiro','regula o trânsito, a habilitação e as multas'],
  'Lei 9.504/1997':['Lei das Eleições','regula campanhas, propaganda e votação'],
  'Lei 9.605/1998':['Lei de Crimes Ambientais','define crimes e punições por danos ao meio ambiente'],
  'Lei 9.613/1998':['Lei de Lavagem de Dinheiro','define o crime de lavagem de dinheiro e os deveres de controle'],
  'Lei 9.656/1998':['Lei dos Planos de Saúde','regula planos e seguros privados de saúde'],
  'Lei 9.985/2000':['Lei do SNUC','regula parques e outras unidades de conservação'],
  'Lei 10.048/2000':['Lei do Atendimento Prioritário','garante prioridade a pessoas idosas, gestantes e pessoas com deficiência'],
  'Lei 10.257/2001':['Estatuto da Cidade','define regras de política urbana e uso do solo nas cidades'],
  'Lei 10.406/2002':['Código Civil','regula contratos, família, herança e propriedade'],
  'Lei 10.741/2003':['Estatuto da Pessoa Idosa','garante direitos a pessoas com 60 anos ou mais'],
  'Lei 10.826/2003':['Estatuto do Desarmamento','regula a posse, o porte e o comércio de armas'],
  'Lei 10.973/2004':['Lei de Inovação','incentiva a pesquisa científica e a inovação nas empresas'],
  'Lei 11.196/2005':['Lei do Bem','concede incentivos fiscais à inovação tecnológica'],
  'Lei 11.340/2006':['Lei Maria da Penha','combate a violência doméstica e familiar contra a mulher'],
  'Lei 11.343/2006':['Lei de Drogas','define a política sobre drogas e os crimes de tráfico'],
  'Lei 11.445/2007':['Marco do Saneamento Básico','define as regras de água, esgoto, lixo e drenagem'],
  'Lei 11.771/2008':['Política Nacional de Turismo','organiza o setor de turismo'],
  'Lei 11.947/2009':['Lei da Alimentação Escolar','regula a merenda nas escolas públicas (PNAE)'],
  'Lei 12.212/2010':['Lei da Tarifa Social de Energia','garante desconto na conta de luz para famílias de baixa renda'],
  'Lei 12.527/2011':['Lei de Acesso à Informação','garante o direito de pedir informações ao poder público'],
  'Lei 12.587/2012':['Política Nacional de Mobilidade Urbana','define regras para o transporte nas cidades'],
  'Lei 12.608/2012':['Política Nacional de Proteção e Defesa Civil','organiza a prevenção e a resposta a desastres'],
  'Lei 12.651/2012':['Código Florestal','regula a proteção da vegetação nativa e o uso da terra'],
  'Lei 12.764/2012':['Lei Berenice Piana','garante direitos às pessoas com transtorno do espectro autista'],
  'Lei 12.850/2013':['Lei das Organizações Criminosas','define o crime organizado e os meios de investigação'],
  'Lei 12.965/2014':['Marco Civil da Internet','define direitos e deveres no uso da internet'],
  'Lei 13.022/2014':['Estatuto das Guardas Municipais','regula as guardas municipais'],
  'Lei 13.105/2015':['Código de Processo Civil','regula o andamento dos processos na Justiça cível'],
  'Lei 13.146/2015':['Estatuto da Pessoa com Deficiência','garante direitos e acessibilidade às pessoas com deficiência'],
  'Lei 13.675/2018':['Lei do SUSP','organiza o Sistema Único de Segurança Pública'],
  'Lei 13.709/2018':['Lei Geral de Proteção de Dados (LGPD)','regula o uso de dados pessoais'],
  'Lei 13.756/2018':['Lei do Fundo Nacional de Segurança Pública','regula o fundo da segurança pública e a destinação das loterias'],
  'Lei 13.812/2019':['Política Nacional de Busca de Pessoas Desaparecidas','organiza a busca e o cadastro de pessoas desaparecidas'],
  'Lei 14.129/2021':['Lei do Governo Digital','regula serviços públicos digitais'],
  'Lei 14.133/2021':['Nova Lei de Licitações','regula compras e contratos do poder público'],
  'Lei 14.457/2022':['Lei do Programa Emprega + Mulheres','cria medidas para inserir e manter mulheres no mercado de trabalho'],
  'Lei 14.597/2023':['Lei Geral do Esporte','organiza o esporte no país'],
  'Lei 14.601/2023':['Lei do Bolsa Família','define as regras do Programa Bolsa Família'],
  'Lei 14.790/2023':['Lei das Apostas','regula as apostas de quota fixa (bets)'],
  'Lei Complementar 64/1990':['Lei de Inelegibilidades','define quem não pode se candidatar, incluindo a Ficha Limpa'],
  'Lei Complementar 101/2000':['Lei de Responsabilidade Fiscal','limita gastos e dívidas de União, estados e municípios'],
  'Lei Complementar 123/2006':['Estatuto da Micro e Pequena Empresa','regula o Simples Nacional e o MEI'],
  'Lei Complementar 214/2025':['Lei da Reforma Tributária do consumo','regula os novos tributos IBS, CBS e Imposto Seletivo']
});

const MONTH='(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
const LAW_RX=new RegExp('(Lei Complementar|Decreto-Lei|Lei|Decreto)\\s+n[ºo°.]*\\s*([\\d.]+),\\s+de\\s+\\d{1,2}º?\\s+de\\s+'+MONTH+'\\s+de\\s+(\\d{4})'+
  '(?:\\s*\\(([^)]{3,120})\\)|\\s+[–-]\\s+([^,;()]{3,120}?)(?=[,;.]|\\s+e\\s+|\\s+para\\s|$)|,\\s+que\\s+((?:institui|dispõe sobre|estabelece|cria|regula|regulamenta)\\s[^;]{3,160}?)(?=,\\s|;|\\.|\\s+e\\s+(?:a|o)\\s+Lei|\\s+para\\s|$))?','gi');

const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const lowerFirst=s=>s?s.charAt(0).toLowerCase()+s.slice(1):s;

/**
 * Leis citadas na ementa, com nome popular quando conhecido.
 * Retorna [{ref:'Lei 8.080/1990', nome:'Lei Orgânica da Saúde', sobre:'organiza o SUS…'}], até `max`.
 */
export function lawsInEmenta(ementa,max=3){
  const text=clean(ementa);const out=[];const seen=new Set();
  if(/^Requer/i.test(text))return out;
  LAW_RX.lastIndex=0;let m;
  while((m=LAW_RX.exec(text))&&out.length<max){
    const ref=m[1].replace(/^lei complementar$/i,'Lei Complementar').replace(/^decreto-lei$/i,'Decreto-Lei').replace(/^lei$/i,'Lei').replace(/^decreto$/i,'Decreto')+' '+m[2].replace(/\.$/,'')+'/'+m[3];
    if(seen.has(ref))continue;seen.add(ref);
    const known=KNOWN_LAWS[ref];
    const own=clean(m[4]||m[5]||'');
    const que=clean(m[6]||'');
    out.push({ref,nome:known?.[0]||(own&&!/^\d/.test(own)?own:''),sobre:known?.[1]||(que?lowerFirst(que):'')});
  }
  if(out.length<max&&/Constitui[cç][aã]o Federal/i.test(text)&&!seen.has('Constituição Federal')){
    const k=KNOWN_LAWS['Constituição Federal'];out.unshift({ref:'Constituição Federal',nome:k[0],sobre:k[1]});
  }
  return out.slice(0,max);
}

/**
 * O que o texto faz, em linguagem simples, pelo verbo da ementa e pelo tipo da proposição.
 * Retorna {kind, label, explica}.
 */
export function actionOf(p){
  const text=clean(p?.ementa);const tipo=String(p?.siglaTipo||'').toUpperCase();
  const head=text.split(/\s(?:para|a fim de)\s/)[0];
  const alters=/^(?:Altera|Acrescenta|Modifica|Inclui|Dá nova redação)/i.test(text)||/\b(?:e\s+)?alteram?\s+(?:a|o|as|os)\s+(?:Leis?|Decretos?-Leis?|Decretos?|Lei Complementar|Constituição)/i.test(text);
  const R=(kind,label,explica)=>({kind,label,explica});
  if(tipo==='PEC')return R('constituicao','Muda a Constituição','Precisa de 3/5 dos votos em dois turnos na Câmara e no Senado. Não passa por sanção do presidente.');
  if(/^Requer/i.test(text))return R('procedimento','Pedido sobre a tramitação','Trata do andamento de outra proposta, como urgência ou audiência. Não muda direitos por si só.');
  if(/^Abre crédito/i.test(text))return R('orcamento','Libera dinheiro no Orçamento','Acrescenta recursos ao Orçamento federal para uma despesa específica. Não cria regras novas para a população.');
  if(/^Sustam?\b/i.test(text))return R('susta','Derruba um ato do governo','O Congresso pode cancelar decretos, portarias e resoluções do Executivo que, na visão do autor, foram além do que a lei permite.');
  if(/^Aprova\b/i.test(text)&&/radiodifus|sons e imagens|outorga|concess[ãa]o|permiss[ãa]o|autoriza[çc][ãa]o/i.test(text))
    return R('outorga','Confirma concessão de rádio ou TV','Concessões e autorizações de rádio e TV dadas pelo governo só passam a valer de forma definitiva depois de aprovadas pelo Congresso.');
  if(/^Aprova\b/i.test(text)&&/acordo|tratado|conven[çc][ãa]o|protocolo|memorando/i.test(text))
    return R('acordo','Aprova um acordo internacional','O Brasil só se compromete com um acordo assinado pelo governo depois que o Congresso aprova o texto.');
  if(/^(?:Institui|Cria)\s+(?:o|a)\s+(?:"|“)?(?:Dia|Semana|Mês|Ano|Data)\b/i.test(text)||/^(?:Inscreve|Denomina|Declara|Confere\s+(?:ao|à|o)\s.*t[ií]tulo|Reconhece\s.*(?:manifesta[çc][ãa]o|capital|patrim[ôo]nio|patrono|patrona))/i.test(text))
    return R('simbolico','Homenagem ou data comemorativa','É simbólica: dá nome, título ou data a algo, sem criar obrigações nem mudar direitos.');
  if(/^Revoga/i.test(text))return R('revoga','Revoga regras em vigor','Retira da lei regras que hoje valem. Se aprovada, elas deixam de existir.');
  if(/^Autoriza\s+o\s+Poder\s+Executivo/i.test(text))return R('autoriza','Autoriza o governo a agir','É uma lei autorizativa: permite, mas não obriga, o governo a fazer o que propõe.');
  if(alters&&/^(?:Altera|Acrescenta|Modifica|Inclui|Dá nova redação)/i.test(head))
    return R('altera','Muda uma lei que já existe','Não cria uma lei nova: muda ou acrescenta regras numa lei em vigor.');
  if(alters)return R('cria-altera','Cria regras e muda leis existentes','Traz regras próprias e também ajusta leis que já estão em vigor para encaixá-las.');
  return R('cria','Cria regras novas','Se aprovada, vira uma lei própria, que passa a valer junto com as que já existem.');
}

/** Observação sobre o rito, quando o tipo muda o que o leitor deve esperar. */
export function procedureNote(p){
  const tipo=String(p?.siglaTipo||'').toUpperCase();
  if(tipo==='MPV')return 'Medida provisória: já vale desde a publicação, mas perde efeito se o Congresso não aprovar em até 120 dias.';
  if(tipo==='PLP')return 'Projeto de lei complementar: precisa de maioria absoluta, ou seja, 257 votos na Câmara e 41 no Senado.';
  if(tipo==='PDL')return 'Projeto de decreto legislativo: é decidido só pelo Congresso, sem sanção do presidente.';
  return '';
}

const listOf=v=>Array.isArray(v)?v.map(clean).filter(Boolean):[];

/**
 * Bloco "como é hoje / como ficaria" do editorial. Só aparece quando a redação validou o texto
 * (campo `validado` com a data), porque é interpretação e precisa de revisão humana.
 */
export function editorialChange(e={}){
  if(!e||!clean(e.validado))return null;
  const hoje=clean(e.hoje),proposta=clean(e.proposta),pontos=listOf(e.pontos),areas=listOf(e.areas);
  if(!hoje&&!proposta&&!pontos.length)return null;
  return {hoje,proposta,pontos:pontos.slice(0,5),areas:areas.slice(0,6),validado:clean(e.validado),fonte:clean(e.fonte_resumo)};
}
