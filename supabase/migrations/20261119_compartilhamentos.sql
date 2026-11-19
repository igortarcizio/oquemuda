-- Contador anônimo de compartilhamentos (botão "Compartilhar" nos cards e na ficha).
--
-- Como aplicar (uma vez): Supabase → SQL Editor → colar este arquivo → Run.
-- É idempotente: pode rodar de novo sem duplicar nada nem apagar registros.
-- Depende de: proposicoes (migrations anteriores).
--
-- Desenho:
-- - Conta cliques no botão por proposta e por canal: nativo (folha do celular),
--   whatsapp, telegram, x, facebook, email e copiar. "nativo" só é gravado quando o
--   leitor concluiu o envio na folha do sistema (cancelar não conta).
-- - A chave pública (anon) NÃO lê nem escreve a tabela. Ela só chama
--   registrar_compartilhamento, que valida tudo. Ler os números é só para a equipe.
-- - O "leitor" é o mesmo UUID aleatório do termômetro e dos reportes (navegador, sem
--   nome, e-mail ou IP).
-- - Um registro por leitor, proposta e canal por dia: clicar dez vezes conta uma.
-- - Freios contra automação: 30 por hora por leitor e 1.000 por hora no site todo.

-- ---------- Tabela ----------

create table if not exists public.compartilhamentos (
  id            bigint generated always as identity primary key,
  proposicao_id bigint      not null,
  canal         text        not null
                check (canal in ('nativo', 'whatsapp', 'telegram', 'x', 'facebook', 'email', 'copiar')),
  leitor        uuid        not null,
  dia           date        not null default (now() at time zone 'America/Sao_Paulo')::date,
  criado_em     timestamptz not null default now()
);

create unique index if not exists compartilhamentos_um_por_dia
  on public.compartilhamentos (proposicao_id, canal, leitor, dia);
create index if not exists compartilhamentos_leitor_idx on public.compartilhamentos (leitor, criado_em);
create index if not exists compartilhamentos_criado_idx on public.compartilhamentos (criado_em);

alter table public.compartilhamentos enable row level security;
revoke all on public.compartilhamentos from anon, authenticated;

-- ---------- Função chamada pelo site ----------

create or replace function public.registrar_compartilhamento(
  p_proposicao bigint,
  p_canal      text,
  p_leitor     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_leitor is null then
    raise exception 'leitor inválido' using errcode = '22023';
  end if;
  if p_canal is null or p_canal not in ('nativo', 'whatsapp', 'telegram', 'x', 'facebook', 'email', 'copiar') then
    raise exception 'canal inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.proposicoes where id = p_proposicao) then
    raise exception 'proposta não encontrada' using errcode = 'P0002';
  end if;
  if (select count(*) from public.compartilhamentos
      where leitor = p_leitor and criado_em > now() - interval '1 hour') >= 30
     or (select count(*) from public.compartilhamentos
         where criado_em > now() - interval '1 hour') >= 1000 then
    raise exception 'limite de compartilhamentos atingido' using errcode = '54000';
  end if;

  insert into public.compartilhamentos (proposicao_id, canal, leitor)
  values (p_proposicao, p_canal, p_leitor)
  on conflict (proposicao_id, canal, leitor, dia) do nothing;
end;
$$;

-- ---------- Números para a equipe ----------

-- Últimos 30 dias, uma linha por proposta, mais compartilhadas primeiro.
-- "leitores" conta pessoas (navegadores) diferentes; "total" soma todos os canais.
create or replace view public.compartilhamentos_por_proposta
with (security_invoker = true) as
select c.proposicao_id,
       concat_ws(' ', p.sigla_tipo, p.numero || '/' || p.ano)                  as proposta,
       count(*)                                                                as total,
       count(distinct c.leitor)                                                as leitores,
       count(*) filter (where c.canal = 'nativo')                              as nativo,
       count(*) filter (where c.canal = 'whatsapp')                            as whatsapp,
       count(*) filter (where c.canal = 'telegram')                            as telegram,
       count(*) filter (where c.canal = 'x')                                   as x,
       count(*) filter (where c.canal = 'facebook')                            as facebook,
       count(*) filter (where c.canal = 'email')                               as email,
       count(*) filter (where c.canal = 'copiar')                              as copiar,
       max(c.criado_em)                                                        as ultimo,
       'https://igortarcizio.github.io/oquemuda/#/tema/' || c.proposicao_id    as link
  from public.compartilhamentos c
  left join public.proposicoes p on p.id = c.proposicao_id
 where c.criado_em > now() - interval '30 days'
 group by c.proposicao_id, p.sigla_tipo, p.numero, p.ano
 order by total desc, ultimo desc;

-- Totais por dia e canal, para acompanhar a evolução.
create or replace view public.compartilhamentos_por_dia
with (security_invoker = true) as
select dia, canal, count(*) as total, count(distinct leitor) as leitores
  from public.compartilhamentos
 group by dia, canal
 order by dia desc, total desc;

revoke all on public.compartilhamentos_por_proposta from anon, authenticated;
revoke all on public.compartilhamentos_por_dia from anon, authenticated;

-- ---------- Permissões ----------

revoke all on function public.registrar_compartilhamento(bigint, text, uuid) from public;
grant execute on function public.registrar_compartilhamento(bigint, text, uuid) to anon, authenticated;

-- Para parar de contar sem apagar nada (o botão continua funcionando normalmente):
--   revoke execute on function public.registrar_compartilhamento(bigint, text, uuid) from anon, authenticated;

notify pgrst, 'reload schema';
