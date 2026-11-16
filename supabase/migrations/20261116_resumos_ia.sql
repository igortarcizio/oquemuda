-- Resumos gerados por IA a partir do texto integral de cada proposta.
-- Quem escreve: scripts/resumir_propostas.py (GitHub Actions, chave service role).
-- Quem lê: o site, com a chave pública, e só os registros publicados.
-- Idempotente: pode rodar de novo.

create table if not exists public.resumos_ia (
  proposicao_id bigint      primary key,
  status        text        not null default 'publicado'
                check (status in ('publicado', 'sem_texto', 'erro', 'oculto')),
  resumo        text,
  hoje          text,
  proposta      text,
  pontos        jsonb       not null default '[]'::jsonb,
  areas         jsonb       not null default '[]'::jsonb,
  modelo        text,
  fonte_url     text,
  caracteres_lidos integer,
  tentativas    smallint    not null default 1,
  erro          text,
  gerado_em     timestamptz not null default now()
);

create index if not exists resumos_ia_status_idx on public.resumos_ia (status);

alter table public.resumos_ia enable row level security;
revoke all on public.resumos_ia from anon, authenticated;
grant select (proposicao_id, status, resumo, hoje, proposta, pontos, areas, modelo, gerado_em)
  on public.resumos_ia to anon, authenticated;

drop policy if exists "resumos publicados sao publicos" on public.resumos_ia;
create policy "resumos publicados sao publicos" on public.resumos_ia
  for select to anon, authenticated
  using (status = 'publicado');

-- Para tirar um resumo do ar sem apagar: update resumos_ia set status = 'oculto' where proposicao_id = …;

notify pgrst, 'reload schema';
