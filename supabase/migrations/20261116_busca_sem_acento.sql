-- Busca por palavra sem diferenciar acento nem maiúsculas ("saude" encontra "Saúde").
-- Coluna calculada pelo banco a partir da ementa. Idempotente.
create or replace function public.texto_busca(t text)
returns text language sql immutable parallel safe as $$
  select translate(lower(coalesce(t, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn')
$$;

alter table public.proposicoes
  add column if not exists ementa_busca text
  generated always as (public.texto_busca(ementa)) stored;

grant select (ementa_busca) on public.proposicoes to anon, authenticated;

notify pgrst, 'reload schema';
