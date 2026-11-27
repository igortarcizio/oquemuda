-- Data em que a proposta entrou na situação oficial atual ("situação mudou em" no card).
-- Quem escreve: um gatilho do próprio banco, sempre que situacao_codigo muda. Os robôs
-- de sincronização não precisam saber desta coluna.
-- Quem lê: o site, para ordenar "Explore as propostas" por mudança de etapa e mostrar
-- a data no card. Sem esta migration, o site ordena pela apresentação.
-- Idempotente: pode rodar de novo.
--
-- Por que um gatilho: o histórico de tramitações da Câmara repete a situação ATUAL em
-- todas as linhas, então não dá para descobrir depois quando a etapa mudou. É preciso
-- anotar no momento em que o código muda.

alter table public.proposicoes add column if not exists situacao_desde timestamptz;

-- dataHora da Câmara vem sem fuso ("2026-11-26T16:41:19"): é horário de Brasília.
-- Valor estranho vira nulo em vez de erro, para nunca travar a sincronização.
create or replace function public.data_camara(valor text)
returns timestamptz
language plpgsql stable
as $$
begin
  if valor !~ '^\d{4}-\d{2}-\d{2}' then
    return null;
  end if;
  return (left(valor, 19))::timestamp at time zone 'America/Sao_Paulo';
exception when others then
  return null;
end
$$;

create or replace function public.marcar_situacao_desde()
returns trigger
language plpgsql
as $$
declare
  quando timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.situacao_desde is null then
      new.situacao_desde := coalesce(
        public.data_camara(new.dados_oficiais->'statusProposicao'->>'dataHora'),
        new.data_apresentacao::timestamp at time zone 'America/Sao_Paulo');
    end if;
  elsif new.situacao_codigo is distinct from old.situacao_codigo then
    -- A data oficial da situação nova; sem ela, o momento em que o robô percebeu.
    quando := public.data_camara(new.dados_oficiais->'statusProposicao'->>'dataHora');
    new.situacao_desde := coalesce(quando, now());
  end if;
  return new;
end
$$;

drop trigger if exists proposicoes_situacao_desde on public.proposicoes;
create trigger proposicoes_situacao_desde
  before insert or update of situacao_codigo on public.proposicoes
  for each row execute function public.marcar_situacao_desde();

-- Carga inicial: a melhor data disponível é a da última situação registrada pela Câmara
-- (pode ser uma movimentação dentro da mesma etapa). Daqui em diante, só mudança de etapa.
-- Em lotes, como busca_preencher: de uma vez só, as ~15 mil propostas passam do limite
-- de 2 minutos do SQL Editor (e o Postgres desfaz tudo, inclusive a coluna).
-- Depois desta migration, rodar até voltar 0:  select public.situacao_desde_preencher();
create or replace function public.situacao_desde_preencher(lote integer default 1000)
returns integer
language sql
set search_path = ''
as $$
  with alvo as (
    select id from public.proposicoes where situacao_desde is null order by id limit lote
  ), feitas as (
    update public.proposicoes p
       set situacao_desde = coalesce(public.data_camara(p.dados_oficiais->'statusProposicao'->>'dataHora'),
                                     p.data_apresentacao::timestamp at time zone 'America/Sao_Paulo')
      from alvo
     where p.id = alvo.id
    returning 1
  )
  select count(*)::integer from feitas
$$;
revoke execute on function public.situacao_desde_preencher(integer) from public, anon, authenticated;

create index if not exists proposicoes_situacao_desde_idx
  on public.proposicoes (situacao_desde desc nulls last, data_apresentacao desc, id desc);

grant select (situacao_desde) on public.proposicoes to anon, authenticated;

-- A busca por palavras devolve o formato da view busca_resultado: a coluna nova entra
-- no fim (create or replace view só aceita colunas novas no final).
create or replace view public.busca_resultado with (security_invoker = true) as
  select p.id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.tags, p.data_apresentacao,
         p.situacao_codigo, p.situacao_descricao, p.situacao_atualizada_em, p.dados_oficiais,
         p.coletado_em, p.area, p.areas, p.partidos, 0::real as relevancia, p.situacao_desde
    from public.proposicoes p
   where false;
revoke all on public.busca_resultado from anon, authenticated;

create or replace function public.buscar_proposicoes(q text)
returns setof public.busca_resultado
language sql stable
as $$
  select p.id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.tags, p.data_apresentacao,
         p.situacao_codigo, p.situacao_descricao, p.situacao_atualizada_em, p.dados_oficiais,
         p.coletado_em, p.area, p.areas, p.partidos,
         ts_rank(p.busca, c.consulta) as relevancia, p.situacao_desde
    from public.busca_consulta(q) as c(consulta)
    join public.proposicoes p on p.busca @@ c.consulta
$$;

grant execute on function public.buscar_proposicoes(text) to anon, authenticated;

notify pgrst, 'reload schema';
