-- Termômetro dos leitores: voto anônimo "a favor / neutro / contra" em cada proposta.
--
-- Como aplicar (uma vez): Supabase → SQL Editor → colar este arquivo → Run.
-- É idempotente: pode rodar de novo sem duplicar nada.
--
-- Desenho de segurança:
-- - O site usa a chave pública (anon). Ela NÃO lê nem escreve a tabela diretamente.
-- - Tudo passa por duas funções (contar_votos e registrar_voto), que validam a entrada
--   e devolvem só os totais. Assim ninguém consegue listar os identificadores de outros
--   leitores nem alterar o voto de outra pessoa.
-- - O "leitor" é um UUID aleatório gerado no navegador. Não é dado pessoal: não há nome,
--   e-mail nem IP gravados.
-- - Limitação conhecida: quem limpar o navegador consegue votar de novo. É um termômetro,
--   não uma pesquisa de opinião, e o site diz isso ao lado do resultado.

create table if not exists public.votos_leitores (
  proposicao_id bigint      not null,
  leitor        uuid        not null,
  voto          smallint    not null check (voto in (-1, 0, 1)),  -- 1 a favor, 0 neutro, -1 contra
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (proposicao_id, leitor)
);

create index if not exists votos_leitores_proposicao_idx on public.votos_leitores (proposicao_id);
create index if not exists votos_leitores_leitor_idx on public.votos_leitores (leitor, atualizado_em);

-- Sem acesso direto pela chave pública: nenhuma policy para anon/authenticated.
alter table public.votos_leitores enable row level security;
revoke all on public.votos_leitores from anon, authenticated;

-- Totais de uma proposta.
create or replace function public.contar_votos(p_proposicao bigint)
returns table (a_favor bigint, neutro bigint, contra bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*) filter (where voto = 1),
         count(*) filter (where voto = 0),
         count(*) filter (where voto = -1)
  from public.votos_leitores
  where proposicao_id = p_proposicao;
$$;

-- Registra (ou troca) o voto do leitor e devolve os totais atualizados.
create or replace function public.registrar_voto(p_proposicao bigint, p_leitor uuid, p_voto integer)
returns table (a_favor bigint, neutro bigint, contra bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_voto is null or p_voto not in (-1, 0, 1) then
    raise exception 'voto inválido' using errcode = '22023';
  end if;
  if p_leitor is null then
    raise exception 'leitor inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.proposicoes where id = p_proposicao) then
    raise exception 'proposta não encontrada' using errcode = 'P0002';
  end if;
  -- Freio simples contra automação: no máximo 60 votos por hora para o mesmo leitor.
  if (select count(*) from public.votos_leitores
      where leitor = p_leitor and atualizado_em > now() - interval '1 hour') >= 60 then
    raise exception 'limite de votos atingido' using errcode = '54000';
  end if;

  insert into public.votos_leitores (proposicao_id, leitor, voto)
  values (p_proposicao, p_leitor, p_voto::smallint)
  on conflict (proposicao_id, leitor)
  do update set voto = excluded.voto, atualizado_em = now()
  where public.votos_leitores.voto is distinct from excluded.voto;

  return query select * from public.contar_votos(p_proposicao);
end;
$$;

revoke all on function public.contar_votos(bigint) from public;
revoke all on function public.registrar_voto(bigint, uuid, integer) from public;
grant execute on function public.contar_votos(bigint) to anon, authenticated;
grant execute on function public.registrar_voto(bigint, uuid, integer) to anon, authenticated;

-- Faz a API (PostgREST) enxergar as funções novas imediatamente.
notify pgrst, 'reload schema';
