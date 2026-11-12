const IRREGULAR={dispor:'Dispõe',propor:'Propõe',compor:'Compõe',impor:'Impõe',proibir:'Proíbe',prever:'Prevê',rever:'Revê',
 ter:'Tem',manter:'Mantém',obter:'Obtém',conter:'Contém',deter:'Detém',vir:'Vem',ver:'Vê',dar:'Dá',ser:'É',ir:'Vai',fazer:'Faz',
 trazer:'Traz',exigir:'Exige',corrigir:'Corrige',dirigir:'Dirige',pedir:'Pede',medir:'Mede',impedir:'Impede',seguir:'Segue',
 conseguir:'Consegue',prosseguir:'Prossegue',servir:'Serve',conferir:'Confere',transferir:'Transfere',inserir:'Insere',referir:'Refere',
 sugerir:'Sugere',investir:'Investe',repetir:'Repete',competir:'Compete',reunir:'Reúne',construir:'Constrói',destruir:'Destrói'};
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
// Verbos comuns em ementas: depois do primeiro verbo, os seguintes da enumeração também são conjugados
// ("reduzir X, instituir Y e simplificar Z" → "Reduz X, institui Y e simplifica Z").
const LEGIS_VERBS=new Set(['instituir','estabelecer','criar','simplificar','assegurar','garantir','prever','dispor','permitir','proibir','vedar',
 'ampliar','reduzir','alterar','incluir','determinar','obrigar','regulamentar','disciplinar','tipificar','aumentar','definir','autorizar',
 'conceder','fixar','exigir','promover','tornar','acrescentar','revogar','atualizar','modificar','explicitar','admitir','prorrogar',
 'excluir','isentar','destinar','agravar','dispensar','padronizar','fortalecer','facultar','punir','estender','limitar','suspender']);

/** Infinitivo → 3ª pessoa do presente ("estabelecer" → "Estabelece"). Null se não for verbo reconhecível. */
export function conjugate(verb){
 const v=String(verb||'').toLowerCase();
 if(IRREGULAR[v])return IRREGULAR[v];
 if(!/(ar|er|ir)$/.test(v))return null;
 if(/ear$/.test(v))return cap(v.replace(/ear$/,'eia'));
 if(/uir$/.test(v))return cap(v.slice(0,-1));
 if(/zir$/.test(v))return cap(v.slice(0,-2));
 if(/[ae]r$/.test(v))return cap(v.slice(0,-1));
 return cap(v.slice(0,-2)+'e');
}

function shorten(s){return s;}

/** Título descritivo a partir da ementa ("Altera a Lei X para reduzir…" → "Reduz…"). */
export function descriptiveTitle(ementa){
 let s=String(ementa||'').replace(/\s+/g,' ').trim();
 if(!s)return 'Proposta sem ementa informada';
 let m;
 if(/radiodifus/i.test(s)&&(m=s.match(/(?:cidade|munic[ií]pio) de ([^,]+?),\s*(?:Estado|no Estado) (?:de|do|da) ([^.,;]+)/i)))
  return 'Autoriza serviço de rádio em '+m[1].trim()+' ('+m[2].trim()+')';
 if(/^Requer/i.test(s))return 'Pedido de tramitação: '+shorten(s.replace(/^Requer(?:em)?\s+/i,''),110);
 m=s.match(/^(?:Alteram?|Acrescentam?|Modifica|Inclui|Dá nova redação|Revoga)\b[\s\S]*?\s(?:a fim de|para)\s+([a-zà-ú]+)\b([\s\S]*)$/i);
 if(m){const v=conjugate(m[1]);if(v)s=v+m[2].replace(/(,\s+|\s+e\s+)([a-zà-ú]+)\b/g,(x,sep,w)=>LEGIS_VERBS.has(w)?sep+conjugate(w).toLowerCase():x);}
 s=s.replace(/^Dispõe sobre (a|o|as|os) /i,(x,a)=>'Trata d'+a.toLowerCase()+' ').replace(/^Dispõe sobre /i,'Trata de ');
 s=s.replace(/,?\s*e dá outras providências\.?$/i,'').replace(/,?\s+(?:e\s+)?alteram?\s+(?:a|o|as|os)\s+(?:Leis?|Decreto|Constituição)[\s\S]*$/i,'');
 s=s.split(/;\s/)[0].replace(/[.;,:\s]+$/,'');
 return shorten(s);
}

/** Leis que a proposta altera, quando a ementa diz ("Lei das Eleições", "Lei 14.133/2021"). Até duas. */
export function amendedLaws(ementa){
 const text=String(ementa||'');
 if(/^Requer/i.test(text))return '';
 const pre=text.split(/\s(?:para|a fim de)\s/)[0];
 if(!/alter|acrescent|modific|revoga|reda[cç][aã]o/i.test(pre))return '';
 const out=[],rx=/(Lei Complementar|Decreto-Lei|Lei|Decreto)\s+n[ºo°.]*\s*([\d.]+),\s+de\s+\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+(\d{4})(?:\s*\(([^)]+)\))?/gi;let m;
 while((m=rx.exec(pre))&&out.length<2)out.push(m[4]?m[4].trim():m[1]+' '+m[2]+'/'+m[3]);
 if(/Constitui[cç][aã]o Federal/i.test(pre)&&out.length<2)out.push('Constituição Federal');
 return out.join(' e ');
}

/** Proposta explicada pela redação: tem título em forma de pergunta e síntese revisados. */
export function isReviewed(editorial={}){
 return typeof editorial.titulo==='string'&&editorial.titulo.trim().endsWith('?')&&!!String(editorial.impacto||'').trim();
}


const editorialTitles = {
  2652995: 'Proíbe o uso de IA para anunciar e vender alimentos em lojas e apps de entrega',
  2652993: 'Cria o programa Pronaf Mulher',
  2652992: 'Prevê crédito tributário para estoques de produtos específicos em janeiro de 2027',
  2652977: 'Adia a cobrança de IBS e CBS em vendas de produtos rurais in natura entre contribuintes',
  2652914: 'Reconhece a Festa de São Sebastião do Mutum, em Mato Grosso, como manifestação cultural nacional',
  2652911: 'Muda as regras de busca de desaparecidos e de assistência a quem é localizado',
  2652890: 'Reduz o ritmo de crescimento do limite de gastos federais',
  2652867: 'Cria imposto sobre grandes fortunas',
  2652739: 'Proíbe bandeiras de vento na propaganda eleitoral',
  2652736: 'Permite à Justiça afastar de condomínios ocupantes responsáveis por violência grave',
  2652684: 'Pede votação de recurso sobre a revogação da Lei de Alienação Parental',
  2652677: 'Amplia garantias para abrir e exercer atividades econômicas',
  2652676: 'Exige que órgãos públicos justifiquem a compra de equipamentos eletrônicos',
  2652528: 'Define regras para importar remédios sem registro no Brasil para uso próprio',
  2652524: 'Cria prêmio para trajetórias de pessoas com superdotação ou dupla excepcionalidade',
  2652521: 'Cria política de qualificação profissional e inclusão no mercado de trabalho',
  2652518: 'Obriga escolas a prevenir o bullying e atender as vítimas',
  2652517: 'Prevê diagnóstico genético e tratamento personalizado para crianças com câncer',
  2652516: 'Define regras para entrega em casa de medicamentos da Farmácia Popular',
  2652515: 'Regula contratos financeiros ligados a eventos reais ou virtuais sem indicador econômico',
  2652512: 'Prevê crédito e proteção de benefícios sociais para quem começa a empreender',
  2652510: 'Reduz alíquotas do Simples Nacional e prevê carência para novas empresas',
  2652509: 'Torna crime o uso abusivo do acesso profissional a dados pessoais',
  2652227: 'Regula gastos com eventos quando metas de saúde e educação ficam abaixo do mínimo',
  2652209: 'Protege o direito de profissionais da educação a fazer refeições em escolas públicas',
  2652176: 'Altera o plano de carreira dos servidores do Tribunal de Contas da União',
  2652175: 'Cria rota turística de Santa Rita de Cássia entre Passos e Cássia, em Minas Gerais',
  2652027: 'Cria cadastro de foragidos condenados por crimes sexuais e prevê alerta às polícias',
  2652026: 'Amplia o limite de emendas das bancadas estaduais ao orçamento da União',
  2652023: 'Retira o ICMS da energia que pequenos geradores injetam na rede e depois compensam',
  2651984: 'Exclui parte dos gastos das autarquias federais dos limites fiscais',
  2651979: 'Exige sinalização dos radares e comprovação de que a fiscalização é regular',
  2651938: 'Proíbe propaganda eleitoral que faça apologia a crimes ou a seus autores',
  2651934: 'Prevê cumprimento imediato da pena após condenação pelo júri',
  2651933: 'Permite transferir o local de votação do agressor para longe da vítima',
  2651918: 'Exige lacre de segurança em bagagens despachadas em voos',
  2651915: 'Permite à Justiça bloquear contas de foragidos nas redes sociais',
  2651907: 'Prevê redução da pena por cadastro como doador de medula óssea e pela doação',
  2651866: 'Amplia a margem de tolerância para o cumprimento da meta fiscal da União',
  2651864: 'Prevê financiamento para plataformas coletivas de transporte e entregas',
  2651863: 'Prevê recuperar documentos de entidades estudantis atingidas pela repressão entre 1964 e 1985',
  2651858: 'Exclui investimentos públicos federais do limite de gastos e os protege contra bloqueios',
  2651409: 'Permite reduzir a pena por doação voluntária de sangue',
  2651389: 'Reforça a preservação da memória e do patrimônio cultural de grupos historicamente excluídos',
  2651388: 'Prevê ações de emergência contra incêndios, seca e falta de água no Pará',
  2651386: 'Prorroga o Auxílio Gás do Povo',
  2651340: 'Define como recorrer de decisões sobre medidas protetivas da Lei Maria da Penha',
  2651327: 'Aprova acordo de cooperação em educação entre Brasil e Azerbaijão',
  2651326: 'Aprova tratado para transferir condenados entre Brasil e Emirados Árabes Unidos',
  2651325: 'Aprova protocolo internacional para prevenir o descarte de resíduos no mar',
  2651275: 'Prevê rastreamento de diabetes tipo 1 e doença celíaca em crianças no SUS',
  2649655: 'Exige dos bancos medidas contra golpes em idosos e prevê regras de ressarcimento',
  2650043: 'Prevê reembolso e compensação por voos cancelados por culpa da companhia aérea',
  2650489: 'Prevê transporte ou ajuda de custo para pacientes do SUS em tratamento em outra cidade',
  2649482: 'Exige aviso e prazo de regularização antes da exclusão da Tarifa Social de energia',
  2649659: 'Exige verificação de anúncios de consórcio, crédito e financiamento',
  2649753: 'Reforça a segurança contra transferências fraudulentas de números de celular',
  2650687: 'Define regras de contratação e trabalho para profissionais de apoio escolar',
  2650853: 'Autoriza a criação de carteira nacional para profissionais da educação'
};

function broadcastTitle(text) {
  const action = text.match(/^Aprova o ato que (renova|autoriza|outorga)\b/i);
  const place = text.match(/(?:na cidade|no município) de ([^,;]+),\s*(?:no )?Estado (?:de|do|da) ([\p{L} ]+)[.,;\s]*$/iu);
  if (!action || !place) return '';
  const medium = /serviço de radiodifusão comunitária/i.test(text) ? 'rádio comunitária'
    : /serviço de radiodifusão de sons e imagens/i.test(text) ? 'TV'
    : /serviço de radiodifusão sonora/i.test(text) ? 'rádio' : '';
  if (!medium) return '';
  const verb = /^renova$/i.test(action[1]) ? 'Renova autorização para' : 'Autoriza';
  return verb + ' ' + medium + ' em ' + place[1].trim() + ' (' + place[2].trim() + ')';
}

export const TITLE_MAX = 110;

export function displayTitle(p) {
  const text = String(p.ementa || '').replace(/\s+/g, ' ').trim();
  if (editorialTitles[p.id]) return editorialTitles[p.id];
  if (/^Aumenta a pena do estelionato/i.test(text) && /inteligência artificial/i.test(text))
    return /falsidade documental/i.test(text) ? 'Eleva penas para golpes e falsificação de documentos com IA' : 'Eleva a pena para golpes com inteligência artificial';
  if (/^Qualifica o crime de fraude em certame/i.test(text) && /dispositivo eletrônico/i.test(text))
    return 'Agrava a punição por fraude com dispositivos eletrônicos em seleções públicas';
  const credit = text.match(/^Abre crédito extraordinário,? em favor (d[ao]s?) (.+?), no valor de R\$\s*([\d.]+),00, para (?:o fim|os fins) que especifica\.?$/i);
  if (credit) {
    const amount = credit[3];
    return 'Abre crédito extraordinário de R$ ' + amount + ' para ' + credit[1].slice(1) + ' ' + credit[2];
  }
  const capital = text.match(/^Confere ao Município de (.+?), no Estado (?:de|do|da) (.+?), o título de (Capital Nacional .+?)\.?$/i);
  if (capital) return 'Reconhece ' + capital[1] + ' (' + capital[2] + ') como ' + capital[3];
  if (/^Susta os efeitos da Portaria/i.test(text) && /2\.272/.test(text) && /classificação indicativa/i.test(text) && /Record Kids.{1,5}Desenhos Bíblicos/i.test(text))
    return 'Suspende a classificação indicativa atribuída a “Record Kids – Desenhos Bíblicos”';
  const broadcast = broadcastTitle(text);
  if (broadcast) return broadcast;
  return descriptiveTitle(text)
    .replace(/^(?:Trata da|Institui a|Estabelece a) obrigatoriedade (?:de|do|da) /i, (prefix) => prefix.endsWith('do ') ? 'Exige o ' : prefix.endsWith('da ') ? 'Exige a ' : 'Exige ')
    .replace(/^Trata da (?:proibição|vedação) de /i, 'Proíbe ')
    .replace(/^Trata da criação (do|da|dos|das) /i, (_, article) => 'Cria ' + article.slice(1) + ' ')
    .replace(/^Institui (o|a) /i, 'Cria $1 ')
    .replace(/^Veda a utilização de /i, 'Proíbe o uso de ')
    .replace(/^Estabelece diretrizes para /i, 'Define regras para ')
    .replace(/,?\s+e (?:estabelece|adota) outras providências\.?$/i, '');
}
