-- Propostas apensadas: a quem cada uma está ligada e quem conduz a tramitação.
-- Quem escreve: scripts/sync_supabase.py (a partir de uriPropPrincipal da ficha oficial).
-- Quem lê: o site, com a chave pública. Idempotente: pode rodar de novo.
--
-- apensada_a: {"direta": {...}, "raiz": {...}, "cadeia": [ids], "consultado_em"}
--   direta = proposta à qual esta foi apensada; raiz = topo da cadeia (conduz a tramitação),
--   cada uma com id, sigla, numero, ano, ementa, situacao, codSituacao, orgao, dataHora.
alter table public.proposicoes add column if not exists apensada_a jsonb;
-- Para a ficha da principal listar quem tramita junto com ela.
alter table public.proposicoes add column if not exists apensada_raiz_id bigint;
create index if not exists proposicoes_apensada_raiz_idx on public.proposicoes (apensada_raiz_id)
  where apensada_raiz_id is not null;

grant select (apensada_a, apensada_raiz_id) on public.proposicoes to anon, authenticated;

notify pgrst, 'reload schema';
