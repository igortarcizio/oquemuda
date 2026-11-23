-- Busca de texto completo (OQM-16): palavra inteira, sem acento, plural e número de lei.
-- Substitui, na busca por palavras, a comparação de pedaços de texto (ementa_busca ilike),
-- em que "lei" encontrava "leite" e "lei 8080" não encontrava "Lei nº 8.080".
--
-- Quem escreve: os gatilhos abaixo mantêm a coluna busca sozinhos (sync e resumos por IA
--   não precisam mudar). Quem lê: o site, com a chave pública, pela função buscar_proposicoes.
-- Idempotente: pode rodar de novo. Depois dela, preencher em lotes (ver busca_preencher).
--
-- O que entra na busca, por peso: título curto da IA (A), ementa (B) e resumo da IA (C).
-- Só textos de IA publicados (status = 'publicado').

create extension if not exists unaccent with schema extensions;

-- Configuração em português que ignora acento: "saude" encontra "Saúde" e
-- "aplicativo" encontra "aplicativos" (mesmo radical).
do $$
begin
  if not exists (select 1 from pg_ts_config
                  where cfgname = 'pt_sem_acento' and cfgnamespace = 'public'::regnamespace) then
    create text search configuration public.pt_sem_acento (copy = pg_catalog.portuguese);
  end if;
end $$;
alter text search configuration public.pt_sem_acento
  alter mapping for hword, hword_part, word with extensions.unaccent, portuguese_stem;

-- Número de lei com ou sem ponto vale o mesmo: "8.080" e "8080", "14.172" e "14172".
-- Só tira o ponto de milhar (seguido de exatamente 3 dígitos); "2.5" não muda.
create or replace function public.busca_normaliza(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select regexp_replace(coalesce(t, ''), '(\d)\.(?=\d{3}(?!\d))', '\1', 'g')
$$;

create or replace function public.busca_documento(ementa text, titulo text, resumo text)
returns tsvector
language sql immutable parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('public.pt_sem_acento', public.busca_normaliza(titulo)), 'A')
      || setweight(to_tsvector('public.pt_sem_acento', public.busca_normaliza(ementa)), 'B')
      || setweight(to_tsvector('public.pt_sem_acento', public.busca_normaliza(resumo)), 'C')
$$;

-- O que a pessoa digitou vira consulta: aspas buscam a frase, "-palavra" exclui.
create or replace function public.busca_consulta(q text)
returns tsquery
language sql immutable parallel safe
set search_path = ''
as $$
  select websearch_to_tsquery('public.pt_sem_acento', public.busca_normaliza(left(q, 200)))
$$;

alter table public.proposicoes add column if not exists busca tsvector;
create index if not exists proposicoes_busca_idx on public.proposicoes using gin (busca);

-- Proposta nova ou ementa alterada (sync): recalcula com o texto da IA, se houver.
create or replace function public.proposicoes_busca_atualiza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  select titulo, resumo into r
    from public.resumos_ia
   where proposicao_id = new.id and status = 'publicado';
  new.busca := public.busca_documento(new.ementa, r.titulo, r.resumo);
  return new;
end $$;

drop trigger if exists proposicoes_busca on public.proposicoes;
create trigger proposicoes_busca
  before insert or update of ementa on public.proposicoes
  for each row execute function public.proposicoes_busca_atualiza();

-- Resumo da IA publicado, refeito, ocultado ou apagado: recalcula a proposta.
create or replace function public.resumos_ia_busca_atualiza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  alvo bigint := case when tg_op = 'DELETE' then old.proposicao_id else new.proposicao_id end;
begin
  update public.proposicoes p
     set busca = public.busca_documento(p.ementa,
           (select r.titulo from public.resumos_ia r where r.proposicao_id = alvo and r.status = 'publicado'),
           (select r.resumo from public.resumos_ia r where r.proposicao_id = alvo and r.status = 'publicado'))
   where p.id = alvo;
  return null;
end $$;

drop trigger if exists resumos_ia_busca on public.resumos_ia;
create trigger resumos_ia_busca
  after insert or delete or update of titulo, resumo, status on public.resumos_ia
  for each row execute function public.resumos_ia_busca_atualiza();

-- Preenche as propostas que já estão no banco, em lotes: de uma vez só, as ~15 mil
-- propostas passam do limite de 2 minutos do SQL Editor (e o Postgres desfaz tudo).
-- Depois desta migration, rodar até voltar 0:  select public.busca_preencher();
create or replace function public.busca_preencher(lote integer default 1000)
returns integer
language sql
set search_path = ''
as $$
  with alvo as (
    select id from public.proposicoes where busca is null order by id limit lote
  ), feitas as (
    update public.proposicoes p
       set busca = public.busca_documento(p.ementa,
             (select r.titulo from public.resumos_ia r where r.proposicao_id = p.id and r.status = 'publicado'),
             (select r.resumo from public.resumos_ia r where r.proposicao_id = p.id and r.status = 'publicado'))
      from alvo
     where p.id = alvo.id
    returning 1
  )
  select count(*)::integer from feitas
$$;
revoke execute on function public.busca_preencher(integer) from public, anon, authenticated;

grant select (busca) on public.proposicoes to anon, authenticated;

-- Busca usada pela lista do site. Devolve só as colunas que a lista lê ou filtra, mais a
-- relevância; os filtros (ano, tipo, tema, partido, etapa…), a paginação, a contagem e a
-- ordem ("data_apresentacao.desc" ou "relevancia.desc") vêm do PostgREST, como na tabela.
-- Roda com as permissões de quem chama (chave pública, RLS e colunas liberadas).
--
-- O formato da linha vem de uma view vazia (busca_resultado), e não de "returns table":
-- com "returns table" o PostgREST não deixa filtrar nem ordenar por coluna que não esteja
-- no select. A view copia os tipos da tabela e ninguém lê dela diretamente.
drop function if exists public.buscar_proposicoes(text);
create or replace view public.busca_resultado with (security_invoker = true) as
  select p.id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.tags, p.data_apresentacao,
         p.situacao_codigo, p.situacao_descricao, p.situacao_atualizada_em, p.dados_oficiais,
         p.coletado_em, p.area, p.areas, p.partidos, 0::real as relevancia
    from public.proposicoes p
   where false;
revoke all on public.busca_resultado from anon, authenticated;

-- Sem "set search_path" de propósito: assim o Postgres incorpora a função na consulta do
-- PostgREST e usa os índices com os filtros; todos os nomes já vêm com o esquema.
create function public.buscar_proposicoes(q text)
returns setof public.busca_resultado
language sql stable
as $$
  select p.id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.tags, p.data_apresentacao,
         p.situacao_codigo, p.situacao_descricao, p.situacao_atualizada_em, p.dados_oficiais,
         p.coletado_em, p.area, p.areas, p.partidos,
         ts_rank(p.busca, c.consulta) as relevancia
    from public.busca_consulta(q) as c(consulta)
    join public.proposicoes p on p.busca @@ c.consulta
$$;

grant execute on function public.buscar_proposicoes(text) to anon, authenticated;

notify pgrst, 'reload schema';
