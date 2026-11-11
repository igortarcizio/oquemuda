// Classificação temática única: usada na geração do acervo e no navegador (mesma regra nos dois lados).
var THEME_CLASSIFIER=(function(){
  var fold=function(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()};
  var THEMES=['Saúde','Educação','Trabalho','Consumo','Economia','Segurança','Direitos e cidadania','Mobilidade','Moradia','Meio ambiente','Comunicação e tecnologia','Cultura e esporte','Política e governo'];
  var TAGS={
    'Saúde':'SUS Diabetes Celíaca Câncer Vacinação Medicamentos Transplantes Sangue Hospitais Enfermagem Planos Gestação Menstruação Obesidade Demência Psicologia Suicídio Odontologia Fibromialgia Medula Dislexia Mortalidade Alimentos Treinos Ruído',
    'Educação':'Creches Universidades Escolas Professores Estudantes Bolsas Merenda Alfabetização Livros LDB Superdotação Bullying Estágio Ciência',
    'Trabalho':'FGTS INSS Aposentadoria Jornada Salários Férias Sindicatos Aplicativos Entregas Desemprego Servidor Concursos Previdência CLT Profissões Ocupacional Aprendizagem Qualificação Advocacia Atletas Vigilantes Associações Cooperativas',
    'Consumo':'Bancos Crédito Consórcios Fraudes Dívidas Seguros Telefonia Consumidor Reclamações Juros Descontos Apostas Comércio Contratos Lotéricas Vestuário',
    'Economia':'Impostos IR Orçamento Simples Empreendedorismo Fiscal Benefícios Exportação Importação Finanças IOF Falência Petróleo Energia Agropecuária BNDES Sebrae Mineração Concessões Pesca Leite Aves Cacau Gecex CMN Garimpo Renda Pobreza Assistência MAPA MTE',
    'Segurança':'Violência Prisões Polícias Bombeiros Armas Drogas Crimes Abuso Terrorismo Guarda SUSP Monitoramento Defesa Fronteiras Assédio Tutela',
    'Direitos e cidadania':'Família Parentalidade Paternidade Maternidade Infância Idosos Mulheres Deficiência Autismo Acessibilidade Indígenas Quilombolas Racismo Discriminação LGBTI+ Migração Nacionalidade Passaporte Defensores Homônimos',
    'Mobilidade':'Aviação Trânsito Rodovias Ônibus Ferrovias Bicicletas Navegação Frete Combustíveis Transporte Motoristas Logística Pneus',
    'Moradia':'Moradia Aluguel Condomínios Imóveis Saneamento Água Território Grilagem',
    'Meio ambiente':'Animais Florestas Incêndios Clima Enchentes Estiagem Resíduos Agrotóxicos Ambiental Calor Mercúrio Cães',
    'Comunicação e tecnologia':'Internet Privacidade IA Plataformas Cibersegurança Postagens Radiodifusão Televisão Desenhos',
    'Cultura e esporte':'Arte Cinema Música Turismo Esporte Futebol Patrimônio Museus Homenagens Calendário Prêmios Romarias Religião Memória Arquivos Toponímia Reborn',
    'Política e governo':'Eleições Partidos Corrupção Transparência Regimento Licitações Administração Audiências Sanções Ouvidoria Justiça Cartórios Sigilo Estatísticas Tratados Fiscalização Serviços Estatais Sebrae'
  };
  var KW={
    'Saúde':/saude|pacient|medic|hospital|doenc|\bsus\b|sanitari|enferm|terapi|tratamento|bariatr|diagnostic|exame|vacin|farmac|odont|fisioterap|ortoped|cirurg|clinic|mental/g,
    'Educação':/educa|escol|ensino|estudant|alun|professor|universid|academic|pedagog|creche|alfabetiz/g,
    'Trabalho':/trabalh|emprego|salari|servidor|concurso|profiss|aposent|previdenc|sindic|remunera|cargo|carreira|jornada/g,
    'Consumo':/brinquedo|equipamento|instalacao|consumidor|cliente|fornecedor|comercializ|preco|tarifa|hosped|compra|venda|bebida|produto/g,
    'Economia':/algod|tribut|imposto|fiscal|orcament|credito|econom|empresa|industri|agro|rural|produtor|export|import|financeir|auxilio|beneficio|renda|investiment|fundo|livre iniciativa|aporte/g,
    'Segurança':/seguranca|polic|crime|crimin|faccao|faccoes|vitima|testemunha|penal|\bpena\b|violen|\barma|presidi|prision|guarda|camera|droga|abordage|risco|emergencia/g,
    'Direitos e cidadania':/direitos humanos|reparacao|danos? mora|negocios? juridic|escritura|prescricao|incapa|analfabet|familia|crianca|adolescen|idos|deficien|neurodesenvolv|autis|mulher|indigen|quilomb|racial|igualdade|registro civil|heranc|sucess|inventari|cidadania|vulnerav|sensorial|pessoas? com/g,
    'Mobilidade':/racha|vias publicas|pedestr|viari|\bbr-\d|pavimen|transport|transito|veicul|rodovi|aere|aeroport|ferrov|portuari|maritim|naveg|onibus|motorista/g,
    'Moradia':/subterrane|infraestrutura|iluminac|moradia|habitac|imove|condomin|aluguel|saneamento|urban|fundiari|residenc|terras?\b/g,
    'Meio ambiente':/ambient|florest|fauna|animal|bacia|hidrograf|clima|residuo|recicl|circularidade|\bapa\b|protecao ambiental|icmbio|ibama|defeso|pesca|bateria|sustentab/g,
    'Comunicação e tecnologia':/propriedade intelectual|midia|marketing|radiodifus|\bradio|televis|internet|digital|dados|tecnolog|inovac|jogos eletronicos|comunicac|telecom|software|celular/g,
    'Cultura e esporte':/audiolivro|\blivro|leitura|cultur|\barte|artist|musica|cinema|patrimonio|museu|turis|esport|desport|futebol|festa|folclor|homenag|denomina|dia nacional|capital nacional|coreto|rouanet|religio|igreja|premio|titulo/g,
    'Política e governo':/eleito|eleic|partid|inelegib|congresso|camara dos deputados|senado|regimento|administra|ministerio|decreto(?!-lei)|portaria|instrucao normativa|\bsusta|orgao|governo|tratado|acordo|convencao|licita|transparencia|corrup|tribuna|justica|mandato|decoro|parlamentar|ato da mesa|resolucao n|judici|cartorio|registros publicos|municipi|internacional|comissao|requer/g
  };
  var tagArea={};Object.keys(TAGS).forEach(function(a){TAGS[a].split(' ').forEach(function(t){if(!tagArea[t])tagArea[t]=a})});
  function themeFor(ementa,tags,tipo){
    var score={},text=fold(ementa);
    (tags||[]).forEach(function(t,i){var a=tagArea[t];if(a)score[a]=(score[a]||0)+2*(3-Math.min(i,2))});
    Object.keys(KW).forEach(function(a){var m=text.match(KW[a]);if(m)score[a]=(score[a]||0)+m.length});
    var best=null,bv=0;THEMES.forEach(function(a){if((score[a]||0)>bv){bv=score[a];best=a}});
    if(best)return {theme:best,fallback:false};
    return {theme:tipo==='MPV'?'Economia':'Política e governo',fallback:true};
  }
  return {THEMES:THEMES,themeFor:themeFor};
})();
