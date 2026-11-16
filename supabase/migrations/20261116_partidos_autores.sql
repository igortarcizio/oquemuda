-- Filtro "Partido do autor": coluna com os partidos dos autores da proposta,
-- calculada pelo próprio banco a partir de dados_oficiais.autores (sempre em dia,
-- sem depender dos scripts de sincronização). Idempotente.

-- A Câmara às vezes trunca ou usa nomes antigos ("REPUBLIC", "SOLIDARI", "PMDB").
create or replace function public.normalizar_partido(p text)
returns text language sql immutable parallel safe as $$
  select case upper(btrim(coalesce(p, '')))
    when '' then null
    when 'REPUBLIC' then 'REPUBLICANOS'
    when 'SOLIDARI' then 'SOLIDARIEDADE'
    when 'PODEMOS' then 'PODE'
    when 'PMDB' then 'MDB'
    when 'PPS' then 'CIDADANIA'
    when 'UNIAO' then 'UNIÃO'
    when 'PCDOB' then 'PCdoB'
    when 'S.PART.' then null
    else upper(btrim(p))
  end
$$;

create or replace function public.partidos_dos_autores(d jsonb)
returns text[] language sql immutable parallel safe as $$
  select coalesce(array_agg(distinct x order by x) filter (where x is not null), '{}')
  from (
    select public.normalizar_partido(a ->> 'partido') as x
    from jsonb_array_elements(
      case when jsonb_typeof(d -> 'autores') = 'array' then d -> 'autores' else '[]'::jsonb end
    ) as a
  ) s
$$;

alter table public.proposicoes
  add column if not exists partidos text[]
  generated always as (public.partidos_dos_autores(dados_oficiais)) stored;

create index if not exists proposicoes_partidos_idx on public.proposicoes using gin (partidos);

grant select (partidos) on public.proposicoes to anon, authenticated;

notify pgrst, 'reload schema';
