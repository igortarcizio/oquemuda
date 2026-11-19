-- Registro das execuções dos robôs e painel de saúde da base.
-- Quem escreve: scripts/sync_supabase.py (chave service role, no GitHub Actions).
-- Quem lê: só a equipe, no painel do Supabase (nada aqui é exposto à chave pública).
-- Idempotente: pode rodar de novo.

create table if not exists public.sync_runs (
  id            bigint generated always as identity primary key,
  robo          text        not null,
  iniciado_em   timestamptz not null,
  terminado_em  timestamptz not null default now(),
  ok            boolean     not null,
  fichas        integer     not null default 0,
  listagens     integer     not null default 0,
  fichas_novas  integer     not null default 0,
  tramitacoes   integer     not null default 0,
  textos_novos  integer     not null default 0,
  erro          text,
  execucao_url  text
);
create index if not exists sync_runs_robo_idx on public.sync_runs (robo, iniciado_em desc);

alter table public.sync_runs enable row level security;
revoke all on public.sync_runs from anon, authenticated;

-- Painel: uma linha com o estado da base. No Supabase: select * from public.saude_da_base;
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
  (select count(*) from public.resumos_ia where status in ('erro', 'sem_texto'))                as resumos_com_problema;
revoke all on public.saude_da_base from anon, authenticated;

-- uri_oficial vinha em dois formatos (um robô usava a ficha web, o outro a API).
-- Fica só o da API, que é o que o sincronizador grava daqui em diante.
update public.proposicoes
   set uri_oficial = 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/' || id
 where uri_oficial is distinct from 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/' || id;

notify pgrst, 'reload schema';
