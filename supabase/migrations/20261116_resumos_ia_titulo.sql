-- Título curto em linguagem simples, gerado junto com o resumo (até 90 caracteres).
-- Idempotente.
alter table public.resumos_ia add column if not exists titulo text;
grant select (titulo) on public.resumos_ia to anon, authenticated;
notify pgrst, 'reload schema';
