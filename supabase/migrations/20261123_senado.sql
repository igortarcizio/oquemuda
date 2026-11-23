-- Andamento no Senado das propostas que a Câmara já aprovou (card OQM-13).
-- Quem escreve: scripts/sync_senado.py (GitHub Actions, chave service role), a partir da
--   API /processo dos dados abertos do Senado. Desde 2019 a proposta mantém a mesma
--   identificação nas duas Casas (sigla, número e ano), e é por ela que o robô procura.
-- Quem lê: a ficha do site, com a chave pública. Idempotente: pode rodar de novo.
--
-- senado = resumo do processo no Senado (situação, comissão, relator, resultado, lei
--   gerada e últimas movimentações), ou {"encontrado": false} quando o Senado ainda não
--   registrou a proposta. Nulo = ainda não consultado.
alter table public.proposicoes add column if not exists senado jsonb;
alter table public.proposicoes add column if not exists senado_atualizado_em timestamptz;

grant select (senado, senado_atualizado_em) on public.proposicoes to anon, authenticated;

notify pgrst, 'reload schema';
