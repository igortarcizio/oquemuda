-- "Explore as propostas" mostra, numa lista só, o que foi apresentado e o que mudou de
-- etapa. Esta migration ajusta a coluna situacao_desde (20261127_situacao_desde.sql):
--
-- 1. O gatilho passa a contar só mudança de ETAPA (apresentada, em discussão, pronta
--    para pauta, aprovada, virou lei, encerrada, tramita em conjunto), não toda troca de
--    código. Trocas dentro da comissão ("aguardando relator" -> "aguardando parecer")
--    eram centenas por dia e enterravam as propostas recém-apresentadas.
-- 2. Corrige a carga inicial, que tinha usado a última movimentação:
--    apresentada -> data da apresentação; em discussão -> primeira distribuição às
--    comissões (tramitação de código 110). Demais etapas mantêm a data que já têm.
--
-- Idempotente. Depois dela, rodar até voltar null:
--   select public.situacao_desde_corrigir(0);   -- devolve o último id; passe-o de novo
-- (em lotes, como situacao_desde_preencher: de uma vez estoura os 2 minutos do SQL Editor).

-- Mesmos grupos de src/lib/status.js (BY_CODE). Código sem grupo próprio = em discussão.
create or replace function public.etapa_situacao(codigo integer)
returns text
language sql immutable
as $$
  select case
    when codigo is null or codigo in (1161, 1311) then null
    when codigo = 924 then 'pauta'
    when codigo in (926, 1070, 1150, 1160, 1293, 1294, 1303, 939) then 'aprovada'
    when codigo = 1140 then 'lei'
    when codigo in (914, 923, 930, 931, 937, 940, 941, 950, 1120, 1222, 1230, 1250, 1260, 1285, 1292) then 'encerrada'
    when codigo in (905, 906, 912, 917, 1010, 1080, 1110, 1200, 1201, 1210, 1220, 1221, 1290, 1291, 1381, 1382, 1383) then 'apresentada'
    when codigo in (925, 927) then 'conjunto'
    else 'discussao'
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
  elsif public.etapa_situacao(new.situacao_codigo) is distinct from public.etapa_situacao(old.situacao_codigo)
        -- Situação apagada não é etapa nova.
        and public.etapa_situacao(new.situacao_codigo) is not null
        -- Sem situação -> "apresentada" é só o primeiro registro da Câmara, não etapa nova.
        and not (public.etapa_situacao(old.situacao_codigo) is null
                 and public.etapa_situacao(new.situacao_codigo) = 'apresentada') then
    -- Mudou de etapa: data oficial da situação nova; sem ela, o momento em que o robô percebeu.
    quando := public.data_camara(new.dados_oficiais->'statusProposicao'->>'dataHora');
    new.situacao_desde := coalesce(quando, now());
  end if;
  return new;
end
$$;

-- Primeira tramitação de um tipo (100 = apresentação, 110 = distribuição às comissões).
create or replace function public.primeira_tramitacao(tram jsonb, cod text)
returns timestamptz
language sql stable
as $$
  select min(public.data_camara(t->>'dataHora'))
    from jsonb_array_elements(case when jsonb_typeof(tram) = 'array' then tram else '[]'::jsonb end) t
   where t->>'codTipo' = cod
$$;

-- Correção da carga inicial, em lotes por id. Devolve o último id do lote (null = acabou).
create or replace function public.situacao_desde_corrigir(depois_de bigint default 0, lote integer default 2000)
returns bigint
language sql
set search_path = ''
as $$
  with alvo as (
    select id from public.proposicoes where id > depois_de order by id limit lote
  ), novo as (
    select p.id,
           case public.etapa_situacao(p.situacao_codigo)
             when 'discussao' then public.primeira_tramitacao(p.tramitacoes, '110')
             when 'apresentada' then coalesce(public.primeira_tramitacao(p.tramitacoes, '100'),
                                              p.data_apresentacao::timestamp at time zone 'America/Sao_Paulo')
           end as quando
      from public.proposicoes p join alvo using (id)
  ), feitas as (
    update public.proposicoes p
       set situacao_desde = novo.quando
      from novo
     where p.id = novo.id and novo.quando is not null and p.situacao_desde is distinct from novo.quando
    returning 1
  )
  select max(id) from alvo
$$;
revoke execute on function public.situacao_desde_corrigir(bigint, integer) from public, anon, authenticated;
