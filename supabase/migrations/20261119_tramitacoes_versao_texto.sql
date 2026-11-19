-- Linha do tempo real e resumo da IA atualizado quando o texto da proposta muda.
-- Quem escreve: scripts/sync_supabase.py (tramitações e texto atual) e
-- scripts/resumir_propostas.py (versão do texto que o resumo descreve).
-- Quem lê: o site, com a chave pública. Idempotente: pode rodar de novo.
--
-- Os scripts e o site funcionam sem estas colunas (só não usam as novidades),
-- então a ordem entre o merge do código e esta migration não importa.

-- Histórico oficial de movimentações (/proposicoes/{id}/tramitacoes), já compacto.
-- Fica em coluna própria para não pesar nas listas, que leem dados_oficiais.
alter table public.proposicoes add column if not exists tramitacoes jsonb;
-- Maior "sequencia" já gravada: o sincronizador só busca de novo quando a Câmara avança.
alter table public.proposicoes add column if not exists tramitacoes_seq integer;
-- Data da movimentação mais recente: enquanto for recente, o sincronizador confere
-- se a comissão publicou o substitutivo (ele costuma aparecer dias depois do parecer).
alter table public.proposicoes add column if not exists tramitacoes_ultima timestamptz;
-- Versão do texto em vigor na Câmara quando ela não é mais a original:
-- {"id", "sigla" (SBT-A ou RDF), "descricao", "data", "orgao", "url"}.
alter table public.proposicoes add column if not exists texto_atual jsonb;

grant select (tramitacoes, tramitacoes_ultima, texto_atual) on public.proposicoes to anon, authenticated;

-- Qual versão do texto o resumo da IA descreve (vazio = texto original).
alter table public.resumos_ia add column if not exists texto_versao text;
alter table public.resumos_ia add column if not exists texto_data timestamptz;
alter table public.resumos_ia add column if not exists texto_orgao text;
-- Falhas ao refazer o resumo para um texto novo: o resumo anterior continua no ar,
-- e a mesma versão não é tentada mais de 3 vezes.
alter table public.resumos_ia add column if not exists refazer_url text;
alter table public.resumos_ia add column if not exists refazer_falhas smallint not null default 0;

-- fonte_url passa a ser pública para o site saber se o resumo já é do texto atual.
grant select (fonte_url, texto_versao, texto_data, texto_orgao) on public.resumos_ia to anon, authenticated;

notify pgrst, 'reload schema';
