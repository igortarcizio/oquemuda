-- Temas oficiais da Câmara convertidos nos 13 temas do site.
-- Quem escreve: scripts/aplicar_temas.mjs (GitHub Actions, chave service role),
--   pela função aplicar_temas abaixo. Regra: src/lib/temas-oficiais.js.
-- Quem lê: o site, com a chave pública. Idempotente: pode rodar de novo.
--
-- area  = tema principal (cor do card); areas = todos os temas do site da proposta
-- (ela aparece em todos esses filtros). Nulos = a Câmara ainda não classificou:
-- o site usa o tema calculado pelas regras próprias (provisório).
alter table public.proposicoes add column if not exists temas_oficiais jsonb;
alter table public.proposicoes add column if not exists area text;
alter table public.proposicoes add column if not exists areas text[];
alter table public.proposicoes add column if not exists temas_atualizados_em timestamptz;
create index if not exists proposicoes_areas_idx on public.proposicoes using gin (areas);

grant select (temas_oficiais, area, areas) on public.proposicoes to anon, authenticated;

-- Atualização em lote, sem precisar reenviar as colunas obrigatórias da proposta.
create or replace function public.aplicar_temas(dados jsonb)
returns integer
language sql
set search_path = public
as $$
  with d as (
    select * from jsonb_to_recordset(dados) as x(id bigint, area text, areas text[], temas_oficiais jsonb)
  ), u as (
    update public.proposicoes p
       set area = d.area, areas = d.areas, temas_oficiais = d.temas_oficiais, temas_atualizados_em = now()
      from d
     where p.id = d.id
    returning 1
  )
  select count(*)::integer from u
$$;
revoke all on function public.aplicar_temas(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_temas(jsonb) to service_role;

-- Painel de saúde: quantas propostas já têm tema oficial (coluna nova no fim da view).
create or replace view public.saude_da_base with (security_invoker = true) as
select
  (select max(terminado_em) from public.sync_runs where robo = 'sync_supabase' and ok)        as ultima_sincronizacao_valida,
  (select count(*) from public.sync_runs where robo = 'sync_supabase' and not ok
     and iniciado_em > now() - interval '24 hours')                                            as falhas_ultimas_24h,
  (select coalesce(sum(fichas_novas), 0) from public.sync_runs
     where iniciado_em > now() - interval '24 hours')                                           as fichas_novas_24h,
  (select count(*) from public.proposicoes)                                                     as propostas,
  (select count(*) from public.proposicoes where situacao_atualizada_em > now() - interval '48 hours') as situacao_em_dia_48h,
  (select count(*) from public.proposicoes where tramitacoes_seq is not null)                   as com_historico,
  (select count(*) from public.proposicoes where texto_atual is not null)                       as com_texto_modificado,
  (select count(*) from public.proposicoes p join public.resumos_ia r on r.proposicao_id = p.id
     where p.texto_atual is not null and r.status = 'publicado'
       and r.fonte_url is distinct from p.texto_atual->>'url')                                  as resumos_de_texto_antigo,
  (select count(*) from public.resumos_ia where status = 'publicado')                           as resumos_publicados,
  (select count(*) from public.resumos_ia where status in ('erro', 'sem_texto'))                as resumos_com_problema,
  (select count(*) from public.proposicoes where area is not null)                              as com_tema_oficial;
revoke all on public.saude_da_base from anon, authenticated;

notify pgrst, 'reload schema';
