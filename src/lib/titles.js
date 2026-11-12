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
  106701: "Altera a Lei de Crimes Ambientais. A ementa não informa quais mudanças prevê.",
  146708: "Define períodos para concursos públicos e vestibulares",
  255291: "Permite registrar a surdez na carteira de identidade",
  264726: "Muda as regras sobre disparo de arma de fogo",
  281460: "Altera as regras de organização das Polícias Militares e dos Bombeiros",
  342725: "Inclui empreendedorismo na formação extracurricular do ensino médio e profissionalizante",
  374450: "Classifica a adulteração de alimentos como crime hediondo",
  424197: "Amplia para dez anos a responsabilidade do empreiteiro pela segurança de edifícios",
  437039: "Cria o Prêmio Frei Galvão do Mérito Social",
  2121642: "Aumenta penas para crimes contra profissionais de saúde durante o trabalho",
  2168236: "Protege a imagem de vítimas de crimes e acidentes",
  2481874: "Cria oito varas federais em Santa Catarina e novos cargos na Justiça Federal",
  2481875: "Reorganiza cargos na Justiça Federal e cria turma recursal no Piauí",
  2481880: "Prevê apoio financeiro a pessoas com deficiência afetadas pela síndrome congênita do Zika",
  2481937: "Protege o sigilo e proíbe cobrança adicional em pagamentos por Pix",
  2482075: "Veda verba pública e incentivo cultural para apresentações que promovam o crime organizado",
  2482076: "Prevê medidas para acelerar investigações criminais e compartilhar responsabilidades na segurança pública",
  2482078: "Pede a suspensão de resolução do Conanda sobre direitos de crianças e adolescentes",
  2482079: "Define direitos para animais de estimação e tutores em viagens aéreas",
  2482081: "Proíbe cobrança adicional por Pix e exige aviso em estabelecimentos",
  2482088: "Pede a suspensão das regras federais sobre armas, caça e tiro esportivo",
  2482091: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482094: "Pede a suspensão de regras do Conanda sobre atendimento a vítimas de violência sexual",
  2482096: "Pede a suspensão da obrigação de informar operações financeiras à Receita",
  2482098: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482100: "Pede a suspensão da criação do núcleo contra o crime organizado",
  2482102: "Pede a suspensão das diretrizes sobre uso da força por agentes de segurança",
  2482103: "Define crimes por ofensas públicas ao cristianismo e prevê indenização",
  2482106: "Prevê sensores gratuitos de glicose para crianças com deficiência ou autismo",
  2482108: "Cria bolsa alimentação para pacientes com diabetes",
  2482110: "Exige transparência dos beneficiários de emendas parlamentares",
  2482112: "Cria prêmio nacional em defesa dos direitos das pessoas autistas",
  2482113: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482114: "Permite destinar créditos de energia solar a entidades sociais, de saúde e educação",
  2482116: "Impede acordo penal para investigados por tráfico de drogas",
  2482117: "Inclui pessoas idosas na política urbana",
  2482120: "Transfere aos estados a regularização de assentamentos após cinco anos",
  2482121: "Permite reutilizar ônibus escolares para transporte rural e outros serviços públicos",
  2482122: "Define fiscalização para caminhões que circulam com eixos suspensos e isenção de pedágio",
  2482124: "Exige acessibilidade em serviços para consumidores vulneráveis",
  2482126: "Cria código de defesa do turista e assistência em emergências",
  2482128: "Regulamenta a profissão de treinador de musculação e fisiculturismo",
  2482129: "Autoriza estados e DF a legislar sobre temas específicos de direito agrário",
  2482131: "Limita a 15 anos o sigilo de informações pessoais e exige justificativa",
  2482132: "Restringe urgência a propostas já analisadas pelas comissões de mérito",
  2482134: "Autoriza estados e DF a legislar sobre temas específicos de desapropriação",
  2482135: "Cria programa de reabilitação craniofacial com tecnologia 3D",
  2482138: "Prevê advertências nos rótulos de bebidas alcoólicas",
  2482140: "Define guarda compartilhada de animais após separação e divisão de despesas",
  2482155: "Inclui processo legislativo nos cursos de Direito",
  2482156: "Prevê direitos econômicos e incentivo à produção indígena",
  2482157: "Estabelece teto para ingressos de jogos e competições esportivas",
  2482162: "Permite deduzir do Imposto de Renda despesas veterinárias de animais domésticos",
  2482163: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482165: "Pede a suspensão das regras do Conanda sobre atendimento a vítimas de violência sexual",
  2482168: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482169: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482171: "Cria fundo para manutenção de pontes e outras obras de arte especiais",
  2482173: "Exige planos de emergência para pontes e outras obras de arte especiais",
  2482176: "Exige inspeções técnicas em pontes e outras obras de arte especiais",
  2482178: "Reconhece as Folias do Divino Espírito Santo, no Tocantins, como manifestação cultural nacional",
  2482180: "Proíbe a venda de dados biométricos e reforça a proteção dessas informações",
  2482183: "Reconhece o ofício das quebradeiras de coco babaçu como manifestação cultural nacional",
  2482192: "Pede a suspensão das diretrizes sobre uso da força por agentes de segurança",
  2482193: "Pede a suspensão do comitê nacional de monitoramento do uso da força",
  2482194: "Pede a suspensão de resolução do Conanda sobre direitos de crianças e adolescentes",
  2482196: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482201: "Pede a suspensão da desapropriação da Fazenda Floresta e Texas, no Espírito Santo",
  2482204: "Pede a suspensão da obrigação de informar operações financeiras à Receita",
  2482207: "Inclui misoginia e misandria entre as formas de discriminação punidas por lei",
  2482215: "Impede herança por violência, abandono ou falta de pagamento de alimentos contra o falecido",
  2482217: "Prevê reembolso federal a estados que executam penas em presídios locais",
  2482220: "Define critérios para diagnóstico de obesidade e acesso a serviços públicos de saúde",
  2482223: "Exige troco em compras e serviços",
  2482225: "Proíbe pagar para obter acesso a dados pessoais sensíveis",
  2482228: "Padroniza o volume de áudio de anúncios no rádio e na TV",
  2482230: "Regula a prospecção e exploração mineral no fundo do mar",
  2482234: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482236: "Altera regras para bancos comunitários",
  2482249: "Cria crime por omitir, atrasar ou fraudar dados exigidos por lei",
  2482250: "Amplia o acesso de pessoas idosas a programas de adaptação de moradias",
  2482252: "Proíbe divulgar nomes de produtos químicos usados em envenenamentos",
  2482258: "Criminaliza saudações nazistas e gestos que incentivam crimes de ódio",
  2482260: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482261: "Pede a suspensão das regras do Conanda sobre atendimento a vítimas de violência sexual",
  2482262: "Pede a suspensão da obrigação de informar operações financeiras à Receita",
  2482263: "Pede a suspensão do horário restrito para clubes de tiro",
  2482264: "Regulamenta eleição direta de diretores em escolas públicas",
  2482266: "Permite usar vídeos de cidadãos para comprovar infrações de trânsito",
  2482267: "Exige transparência em gastos públicos acima de R$ 5 mil com cartões corporativos",
  2482268: "Inclui cogumelos entre os produtos com redução integral de IBS e CBS",
  2482269: "Contratos públicos de shows para jovens devem vedar apologia a crime, drogas e violência contra mulheres",
  2482271: "Pede a suspensão das regras sobre uso da força por agentes de segurança",
  2482273: "Autoriza loteria para financiar proteção animal e destina prêmios não resgatados",
  2482274: "Reduz a jornada semanal máxima para 40 horas e garante dois dias de descanso",
  2482275: "Prevê proteção e apoio a mulheres vítimas de violência política",
  2482276: "Criminaliza estelionato sentimental e aumenta a pena",
  2482278: "Reserva assentos no transporte coletivo para pessoas obesas",
  2482279: "Criminaliza o abandono afetivo de crianças e adolescentes",
  2482280: "Impede condenados de ocupar cargos públicos antes do fim da pena e da reabilitação",

  2482281: "Cria o Dia e a Semana Nacional do Livro de Futebol",
  2482284: "Pede suspender portaria sobre uso da força por agentes de segurança",
  2482288: "Pede suspender decreto sobre uso da força por agentes de segurança",
  2482290: "Aumenta a pena por retirar criança ou adolescente da guarda legal e torna o crime hediondo",
  2482292: "Reserva 15% dos assentos no transporte coletivo e das vagas de estacionamento para idosos",
  2482294: "Garante a participação de mães, gestantes e casadas em concursos de beleza",
  2482296: "Permite variar multa de trânsito conforme o valor do veículo",
  2482298: "Reconhece o Paleta Atlântida como o “Maior Churrasco de Praia do Mundo”",
  2482300: "Define avaliação e habilitação de médicos intercambistas do Mais Médicos para atuar no SUS",
  2482301: "Ajuda famílias de baixa renda a repor bens perdidos em desastres e prevê incentivo fiscal",
  2482303: "Pede suspender decreto sobre uso da força por agentes de segurança",
  2482306: "Permite reconhecer pessoas superdotadas como pessoas com deficiência",
  2482309: "Garante material didático complementar a estudantes autistas",
  2482311: "Dá preferência em parcerias públicas a entidades que atendem pessoas com deficiência e doenças raras",
  2482316: "Pede suspender decreto sobre uso da força por agentes de segurança",
  2482318: "Garante tratamento da endometriose pelo SUS",
  2482373: "Inclui equoterapia para pessoas autistas no SUS e permite usar cavalos recolhidos",
  2482375: "Forma profissionais para diagnosticar autismo e prevê serviços de referência no SUS",
  2482378: "Destina cavalos vítimas de maus-tratos a centros de equoterapia",
  2482379: "Permite que proposições sejam recebidas e numeradas mesmo durante os períodos de recesso parlamentar",
  2482380: "Declara Angra Doce II área especial de interesse turístico",
  2482381: "Pede suspender decreto sobre regras para armas, caça e tiro esportivo",
  2482383: "Cria programa de acolhimento para brasileiros deportados ou retornados",
  2482384: "Cria programa de prevenção e tratamento para a saúde de atletas mulheres",
  2482385: "Oferece curso de primeiros socorros a mães e responsáveis em maternidades",
  2482386: "Proíbe nepotismo em partidos políticos",
  2482387: "Permite animais em circos sob regras de bem-estar",
  2482388: "Cria cordões de identificação para pessoas autistas e neurodivergentes",
  2482390: "Impede atividade empresarial após estelionato cometido por meio de empresa",
  2482392: "Tipifica crimes em brigas de torcidas organizadas",
  2482395: "Regulamenta as atividades da primeira-dama da Presidência",
  2482401: "Pede suspender obrigação de informar transações financeiras, inclusive Pix, à Receita",
  2482402: "Inclui fórmulas de aminoácidos essenciais no SUS",
  2482404: "Proíbe uso de símbolos cristãos em eventos públicos LGBTQIA+",
  2482405: "Dá prioridade no embarque e assento sem custo extra a pessoas com deficiência em voos",
  2482406: "Permite sacar FGTS para tratamento de pessoas autistas",
  2482408: "Pede suspender decreto sobre uso da força por agentes de segurança",
  2482411: "Cria o Sistema Nacional de Monitoramento de Doenças Raras",
  2482412: "Inclui educação financeira em todas as áreas do ensino médio",
  2482413: "Pede suspender decreto sobre uso da força por agentes de segurança",
  2482414: "Pede suspender portaria de matrícula da UFSC que exige vacina contra Covid-19",
  2482415: "Cria fundo para apoiar crianças com deficiência e concede incentivo fiscal",
  2482416: "Cria conselho para políticas de acolhimento em comunidades terapêuticas",
  2482417: "Proíbe a utilização de polimetilmetacrilato (PMMA) como preenchimento estético",
  2482418: "Cria apoio a famílias monoparentais e com pessoas com deficiência ou em vulnerabilidade",
  2482421: "Exige que bancos identifiquem destinatários e previnam golpes em transferências",
  2482423: "Declara o Estado de Santa Catarina como o \"Estado Referência do Cooperativismo Nacional”",
  2482425: "Permite contratar profissionais de saúde para atender alunos com deficiência e transtornos",
  2482427: "Torna públicas atividades representativas de cônjuges de presidentes, governadores e prefeitos",
  2482428: "Exige avisar vítimas e testemunhas quando autor de crime progredir de regime ou for solto",
  2482432: "Exige sensores para contar passageiros no transporte coletivo",
  2482433: "Pede suspender decreto sobre uso da força por agentes de segurança",
  2482436: "Cria categoria no Simples Nacional para entidades sem fins lucrativos e sindicatos",
  2482438: "Cria a Política Nacional de Atenção e Apoio aos Brasileiros Deportados e Retornados",
  2482440: "Permite contribuição voluntária extra no Imposto de Renda e cadastro público de doadores",
  2482444: "Exige informações legíveis e preço destacado nas ofertas de lojas virtuais",
  2482448: "Define regras para ampliar escolas de ensino médio em tempo integral",
  2482465: "Suspende pagamento de militares investigados por crimes da ditadura até decisão judicial",
  2482468: "Garante cancelamento de contrato de telefonia mesmo com dívidas anteriores",
  2482469: "Permite criar cargo estadual de agente de proteção da infância",
  2482470: "Cria política de saúde mental e ambulatórios para pessoas trans e travestis",
  2482471: "Dispensa pessoas transmasculinas de multa por alistamento militar tardio",
  2482475: "Garante despacho gratuito de bagagem de até 23 kg em voos",
  2482477: "Suspende parcelas do Minha Casa, Minha Vida para beneficiários desempregados",
  2482489: "Pede suspender decreto sobre regras para armas, caça e tiro esportivo",
  2482491: "Cria imposto federal sobre a propriedade de armas de fogo",
  2482492: "Exige adaptações no trabalho para empregados autistas",
  2482493: "Cria programa de refeições gratuitas para pessoas em vulnerabilidade",
  2482494: "Permite sacar FGTS para pagar dívidas em atraso",
  2482495: "Prevê construção e modernização de penitenciárias federais",
  2482496: "Conta audiências na folga de policiais e bombeiros militares como horas de trabalho",
  2482499: "Permite retorno voluntário de policiais e bombeiros militares da reserva ao serviço ativo",
  2482500: "Veda cargo público a condenados ou sujeitos a cautelar por violência doméstica ou contra vulneráveis",
  2482502: "Amplia isenção do Imposto de Renda para rendas menores e eleva alíquotas das maiores",
  2482511: "Adapta o Enem para estudantes autistas",
  2482518: "Restringe cancelamento unilateral de planos de saúde e exige renovação automática",
  2482519: "Suspende concursos públicos durante calamidade",
  2482522: "Define cobrança de IPVA para veículos sinistrados recuperáveis",
  2482524: "Pede suspender regras do Conanda sobre atendimento a vítimas infantis de violência sexual",
  2482528: "Prevê multa e reembolso se serviço público pago pelo consumidor não for prestado",
  2482531: "Atribui ao dono do veículo a multa por uso irregular de ARLA 32",
  2482532: "Impede seguradora de cobrar transportador por carga segurada, salvo dolo ou culpa grave",
  2482534: "Proíbe destruir equipamentos apreendidos em fiscalização ambiental e prevê doação",
  2482546: "Criminaliza inclusão de dados falsos no sistema de regulação do SUS",
  2482550: "Amplia proteção a usuários de planos de saúde em reembolso e negativas de cobertura",
  2482555: "Criminaliza notícia falsa usada para obter vantagem ilícita com risco à economia popular",
  2482557: "Aumenta a pena para o crime de capacitismo",
  2482568: "Devolve automaticamente imposto de importação quando comprador desiste da compra",
  2482570: "Permite esterilização voluntária a quem tem dois filhos, independentemente da idade",
  2482572: "Permite perícias do INSS por telemedicina, análise de documentos ou convênios",
  2482573: "Define solução de conflitos entre armazenamento de CO₂ e exploração de petróleo e minerais",
  2482574: "Inclui redução da poluição de veículos em diretrizes federais",
  2482575: "Permite instalar carregador individual para veículo elétrico em condomínios",
  2482576: "Limita sigilo sobre informações de interesse público",
  2482577: "Exige licitação para contratar empresas que instalam cisternas",
  2482578: "Impede cotas de filmes nacionais de limitar outros filmes em salas de cinema",
  2482579: "Aumenta a pena para homicídio qualificado",
  2482580: "Cria incentivo por bom desempenho para estudantes do ensino médio público",
  2482581: "Permite encerrar concessão de distribuidora de energia sem condições de prestar serviço",
  2482582: "Define crédito fiscal para empresas apoiadas na implantação ou expansão de negócios",

  2599315: 'Exige que o IBGE e órgãos federais divulguem dados por território',
  2641592: 'Cria o título Cidade Amiga da Pessoa com Deficiência',
  2607125: 'Restringe a herança para condenados por crimes contra a vida de pais, avós, filhos ou netos',
  2641390: 'Proíbe criar ou divulgar imagens sexuais sintéticas de pessoas identificáveis sem consentimento',
  2647651: 'Cria sistema de alertas climáticos e o aplicativo Clima Brasil',
  2640556: 'Prevê tratamento de sequelas permanentes no rosto de mulheres vítimas de violência doméstica',
  2599487: 'Exige que o SUS inclua remédios para controle de zoonoses na assistência farmacêutica',
  2599295: 'Cria selo para identificar publicidade dirigida a crianças',
  2600628: 'Proíbe cobrar dos usuários, via tarifa, custos de saída de concessionárias',
  2641375: 'Cria índice para avaliar a qualidade e a clareza dos serviços públicos',
  2611055: 'Prevê custeio de residências inclusivas pela saúde e pela assistência social',
  2526776: 'Atribui à Cipa a educação sobre prevenção e resposta a desastres climáticos',
  2525324: 'Prevê dedução no IR aos 65 anos ou mais por plano de saúde de empresa inativa',
  2640829: 'Define proteção para moradores de áreas de risco na política de defesa civil',
  2600790: 'Prevê o mesmo reajuste do piso para aposentadorias do INSS acima de um salário mínimo',
  2599623: 'Cria fundo para substituir redes aéreas por redes subterrâneas',
  2617479: 'Aprova acordo de cooperação em defesa entre Brasil e Eslováquia',
  2614419: 'Define regras para investir recursos dos regimes próprios de previdência',
  2640695: 'Prevê acompanhamento psicossocial do agressor em medidas protetivas',
  2525732: 'Cria o programa Atleta Sem Fronteiras para apoiar o desenvolvimento de atletas',
  2494968: 'Define regras de ICMS para importações de pequeno valor feitas por pessoas físicas',
  2599005: 'Prevê cancelamento simples e imediato de contratos de fornecimento contínuo',
  2563714: 'Permite transferir condenados por terrorismo a prisões de alta segurança em países com acordo',
  2507109: 'Restringe a apreensão de habilitação e passaporte como forma de coerção em processos cíveis',
  2494389: 'Cria centros do SUS para jovens com altas habilidades ou transtornos do neurodesenvolvimento',
  2603856: 'Cria programa de acolhimento e custeio do resgate de animais vítimas de maus-tratos',
  2640908: 'Exige acompanhamento técnico da acessibilidade em obras públicas',
  2644306: 'Exige reavaliar a via de parto se o trabalho de parto parar de avançar ou houver risco',
  2652995: 'Proíbe o uso de IA para anunciar e vender alimentos em lojas e apps de entrega',
  2652993: 'Cria o programa Pronaf Mulher',
  2652992: 'Prevê crédito tributário para estoques de produtos específicos em janeiro de 2027',
  2652977: 'Adia a cobrança de IBS e CBS em vendas de produtos rurais in natura entre contribuintes',
  2652914: 'Reconhece a Festa de São Sebastião do Mutum como manifestação da cultura nacional',
  2652911: 'Muda as regras de busca de desaparecidos e de assistência a quem é localizado',
  2652890: 'Reduz o ritmo de crescimento do limite de gastos federais',
  2652867: 'Cria imposto sobre grandes fortunas',
  2652739: 'Proíbe bandeiras de vento na propaganda eleitoral',
  2652736: 'Prevê afastamento judicial por violência grave em condomínios',
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
  2651863: 'Prevê recuperar a memória do movimento estudantil sob a ditadura',
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
  const title = descriptiveTitle(text)
    .replace(/^(?:Trata da|Institui a|Estabelece a) obrigatoriedade (?:de|do|da) /i, (prefix) => prefix.endsWith('do ') ? 'Exige o ' : prefix.endsWith('da ') ? 'Exige a ' : 'Exige ')
    .replace(/^Trata da (?:proibição|vedação) de /i, 'Proíbe ')
    .replace(/^Trata da criação (do|da|dos|das) /i, (_, article) => 'Cria ' + article.slice(1) + ' ')
    .replace(/^Institui (o|a) (?=Programa|Política|Sistema|Dia|Semana|Cadastro|Fundo|Selo|Plano|Prêmio|Comissão|Conselho|Regime|Estatuto|Rede|Campanha)/i, 'Cria $1 ')
    .replace(/\bSistema Único de Saúde(?:\s*\(SUS\))?/gi, 'SUS')
    .replace(/\bCarteira Nacional de Habilitação(?:\s*\(CNH\))?/gi, 'CNH')
    .replace(/\bImposto sobre a Renda (?:da|das) Pessoas? Físicas?(?:\s*\(IRPF\))?/gi, 'Imposto de Renda')
    .replace(/\bcrianças e adolescentes portadores de deficiência/gi, 'crianças e adolescentes com deficiência')
    .replace(/\bno âmbito (do|da|dos|das) /gi, (_, article) => 'n' + article.slice(1) + ' ')
    .replace(/^Aprova o texto (do|da) /i, (_, article) => 'Aprova ' + article.slice(1) + ' ')
    .replace(/entre o Governo da República Federativa do Brasil e o Governo (?:da|do|de) /i, 'entre Brasil e ')
    .replace(/, (?:assinado|celebrado|firmado) em [^,]+, em \d{1,2}º? de [a-zç]+ de \d{4}$/i, '')
    .replace(/,? (?:na forma que especifica|e dá outras providências)\.?$/i, '')
    .replace(/^Veda a utilização de /i, 'Proíbe o uso de ')
    .replace(/^Estabelece diretrizes para /i, 'Define regras para ')
    .replace(/,?\s+e (?:estabelece|adota) outras providências\.?$/i, '');
  // O título destaca a medida principal. A ficha conserva a ementa integral.
  if (title.length > TITLE_MAX) {
    const main = title.split(/,\s+(?:e\s+)?(?:altera|estabelece|institui|define|revoga|disciplina|dispõe sobre|prevê|cria|determina|autoriza|fixa|acrescenta)\s/i)[0];
    if (main.length >= 28 && !/^(?:Altera|Revoga|Acrescenta|Modifica) (?:o art|a Lei|o Decreto)/i.test(main)) return main;
  }
  return title;
}
