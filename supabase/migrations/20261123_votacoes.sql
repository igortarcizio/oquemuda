-- Votações da proposta na Câmara e, nas nominais do texto, como votou cada deputado (OQM-11).
-- Quem escreve: scripts/sync_votacoes.py (GitHub Actions, chave service role), a partir de
--   /proposicoes/{id}/votacoes, /votacoes/{id}/votos e /votacoes/{id}/orientacoes.
-- Quem lê: a ficha do site, com a chave pública. Idempotente: pode rodar de novo.
--
-- votacoes      = lista de votações (o que foi votado, órgão, data, resultado, placar) e,
--                 só nas nominais sobre o texto da proposta, os votos e as orientações.
-- votacoes_seq  = sequência do histórico (tramitacoes_seq) na última consulta: o robô só
--                 consulta de novo quando a proposta tem movimentação nova.
alter table public.proposicoes add column if not exists votacoes jsonb;
alter table public.proposicoes add column if not exists votacoes_seq integer;

grant select (votacoes) on public.proposicoes to anon, authenticated;

notify pgrst, 'reload schema';
