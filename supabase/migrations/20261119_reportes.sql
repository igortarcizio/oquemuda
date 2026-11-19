-- Reportes de leitores: "encontrei um problema neste texto" na ficha da proposta.
--
-- Como aplicar (uma vez): Supabase → SQL Editor → colar este arquivo → Run.
-- É idempotente: pode rodar de novo sem duplicar nada nem apagar reportes.
-- Depende de: proposicoes, resumos_ia e votos_leitores (migrations anteriores).
--
-- Desenho:
-- - O que pode ser reportado: título, resumo e texto editorial ("Como é hoje",
--   "Como ficaria", "O que muda na prática").
-- - Motivo fixo (errada / desatualizado / confuso / outro) + detalhe de até 100
--   caracteres, obrigatório só em "outro".
-- - A chave pública (anon) NÃO lê nem escreve a tabela. Ela só chama
--   registrar_reporte (que valida tudo) e reportes_ativos (liga/desliga o botão).
--   Ler a fila e mudar status é só para a equipe, no painel do Supabase.
-- - Nada é ocultado automaticamente. Mais leitores reportando o mesmo trecho só
--   sobem a prioridade na view fila_reportes; quem tira do ar é sempre a equipe.
-- - O "leitor" é o mesmo UUID aleatório do termômetro (navegador, sem nome, e-mail
--   ou IP). Isso deixa a equipe ver se quem reporta votou contra a proposta, sinal
--   de discordância política e não de erro no texto.
-- - Dados pessoais: o site avisa para não escrever, e o banco ainda mascara e-mails
--   e sequências longas de números (CPF, telefone, CEP) antes de gravar.

-- ---------- Tabela ----------

create table if not exists public.reportes (
  id            bigint generated always as identity primary key,
  proposicao_id bigint      not null,
  parte         text        not null check (parte in ('titulo', 'resumo', 'editorial')),
  fonte         text        not null check (fonte in ('redacao', 'ia', 'automatico')),
  motivo        text        not null check (motivo in ('errada', 'desatualizado', 'confuso', 'outro')),
  detalhe       text        check (char_length(detalhe) <= 150),
  -- Versão do texto que o leitor viu: data de validação da redação (enviada pelo site)
  -- ou, para a IA, o gerado_em de resumos_ia (lido pelo próprio banco).
  versao        text        check (char_length(versao) <= 40),
  ia_gerado_em  timestamptz,
  -- Cópia do texto da IA no momento do reporte, porque a IA reescreve o resumo e o
  -- original some. Texto da redação e automático estão no Git e não precisam de cópia.
  trecho        text,
  leitor        uuid        not null,
  status        text        not null default 'novo'
                check (status in ('novo', 'em_analise', 'corrigido', 'descartado')),
  nota_interna  text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em  timestamptz,
  constraint reportes_outro_tem_detalhe check (motivo <> 'outro' or coalesce(detalhe, '') <> '')
);

-- Um reporte aberto por leitor e trecho: reportar de novo só atualiza o motivo.
-- Depois de corrigido ou descartado, o mesmo leitor pode reportar a versão nova.
create unique index if not exists reportes_um_aberto_por_leitor
  on public.reportes (proposicao_id, parte, leitor)
  where status in ('novo', 'em_analise');
create index if not exists reportes_status_idx on public.reportes (status, proposicao_id);
create index if not exists reportes_leitor_idx on public.reportes (leitor, criado_em);
create index if not exists reportes_criado_idx on public.reportes (criado_em);

alter table public.reportes enable row level security;
revoke all on public.reportes from anon, authenticated;

-- Mantém atualizado_em e resolvido_em quando a equipe muda o status no Table Editor.
create or replace function public.reportes_tocar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if new.status in ('corrigido', 'descartado') and old.status is distinct from new.status then
    new.resolvido_em := now();
  elsif new.status in ('novo', 'em_analise') then
    new.resolvido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reportes_tocar on public.reportes;
create trigger reportes_tocar before update on public.reportes
  for each row execute function public.reportes_tocar();

-- ---------- Dados pessoais ----------

-- Troca e-mails e sequências de 8+ dígitos (CPF, telefone, CEP) por [removido].
-- Barras não contam como separador, para não pegar "Lei 13.709/2018".
create or replace function public.mascarar_dados_pessoais(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(t, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[removido]', 'g'),
           '\+?\(?\d([[:space:].()-]{0,2}\d){7,}', '[removido]', 'g');
$$;

-- ---------- Funções chamadas pelo site ----------

-- O site só mostra o botão se esta função responder. Para desligar, ver o fim do arquivo.
create or replace function public.reportes_ativos()
returns boolean
language sql
stable
as $$ select true $$;

create or replace function public.registrar_reporte(
  p_proposicao bigint,
  p_leitor     uuid,
  p_parte      text,
  p_fonte      text,
  p_motivo     text,
  p_detalhe    text default null,
  p_versao     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detalhe text := nullif(btrim(regexp_replace(coalesce(p_detalhe, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), '');
  v_versao  text := nullif(left(btrim(coalesce(p_versao, '')), 40), '');
  v_trecho  text;
  v_gerado  timestamptz;
begin
  if p_leitor is null then
    raise exception 'leitor inválido' using errcode = '22023';
  end if;
  if p_parte is null or p_parte not in ('titulo', 'resumo', 'editorial') then
    raise exception 'parte inválida' using errcode = '22023';
  end if;
  if p_fonte is null or p_fonte not in ('redacao', 'ia', 'automatico') then
    raise exception 'fonte inválida' using errcode = '22023';
  end if;
  if p_motivo is null or p_motivo not in ('errada', 'desatualizado', 'confuso', 'outro') then
    raise exception 'motivo inválido' using errcode = '22023';
  end if;
  if char_length(v_detalhe) > 100 then
    raise exception 'detalhe com mais de 100 caracteres' using errcode = '22001';
  end if;
  if p_motivo = 'outro' and v_detalhe is null then
    raise exception 'descreva o problema' using errcode = '23514';
  end if;
  if not exists (select 1 from public.proposicoes where id = p_proposicao) then
    raise exception 'proposta não encontrada' using errcode = 'P0002';
  end if;
  -- Freios contra automação: 10 reportes novos por hora por leitor e 300 no site todo.
  if (select count(*) from public.reportes
      where leitor = p_leitor and criado_em > now() - interval '1 hour') >= 10
     or (select count(*) from public.reportes
         where criado_em > now() - interval '1 hour') >= 300 then
    raise exception 'limite de reportes atingido' using errcode = '54000';
  end if;

  v_detalhe := public.mascarar_dados_pessoais(v_detalhe);

  if p_fonte = 'ia' then
    select case p_parte
             when 'titulo' then r.titulo
             when 'resumo' then r.resumo
             else concat_ws(E'\n',
                    'Como é hoje: ' || nullif(r.hoje, ''),
                    'Como ficaria: ' || nullif(r.proposta, ''),
                    case when jsonb_typeof(r.pontos) = 'array' and jsonb_array_length(r.pontos) > 0
                         then 'Na prática: ' || (select string_agg(x, ' · ') from jsonb_array_elements_text(r.pontos) x)
                    end)
           end,
           r.gerado_em
      into v_trecho, v_gerado
      from public.resumos_ia r
     where r.proposicao_id = p_proposicao and r.status = 'publicado';
  end if;

  insert into public.reportes (proposicao_id, parte, fonte, motivo, detalhe, versao, ia_gerado_em, trecho, leitor)
  values (p_proposicao, p_parte, p_fonte, p_motivo, v_detalhe, v_versao, v_gerado, nullif(v_trecho, ''), p_leitor)
  on conflict (proposicao_id, parte, leitor) where status in ('novo', 'em_analise')
  do update set motivo        = excluded.motivo,
                detalhe       = excluded.detalhe,
                fonte         = excluded.fonte,
                versao        = excluded.versao,
                ia_gerado_em  = excluded.ia_gerado_em,
                trecho        = excluded.trecho;
end;
$$;

-- ---------- Fila da equipe ----------

-- Um item por proposta + parte, com os reportes abertos. Ordem = prioridade:
-- mais leitores primeiro, depois mais "informação errada", depois o mais antigo.
-- "texto_mudou" avisa quando a IA já reescreveu o texto depois de algum reporte.
create or replace view public.fila_reportes
with (security_invoker = true) as
select r.proposicao_id,
       concat_ws(' ', p.sigla_tipo, p.numero || '/' || p.ano)                      as proposta,
       r.parte,
       count(*)                                                                    as leitores,
       count(*) filter (where r.motivo = 'errada')                                 as errada,
       count(*) filter (where r.motivo = 'desatualizado')                          as desatualizado,
       count(*) filter (where r.motivo = 'confuso')                                as confuso,
       count(*) filter (where r.motivo = 'outro')                                  as outro,
       count(*) filter (where r.status = 'em_analise')                             as em_analise,
       count(v.leitor) filter (where v.voto = -1)                                  as votaram_contra,
       count(v.leitor) filter (where v.voto = 1)                                   as votaram_a_favor,
       string_agg(distinct r.fonte, ', ')                                          as fontes,
       coalesce(bool_or(r.fonte = 'ia' and r.ia_gerado_em is distinct from ri.gerado_em), false) as texto_mudou,
       string_agg(r.detalhe, ' | ' order by r.atualizado_em desc)
         filter (where r.detalhe is not null)                                      as detalhes,
       min(r.criado_em)                                                            as primeiro,
       max(r.atualizado_em)                                                        as ultimo,
       'https://igortarcizio.github.io/oquemuda/#/tema/' || r.proposicao_id        as link
  from public.reportes r
  left join public.proposicoes p     on p.id = r.proposicao_id
  left join public.resumos_ia ri     on ri.proposicao_id = r.proposicao_id
  left join public.votos_leitores v  on v.proposicao_id = r.proposicao_id and v.leitor = r.leitor
 where r.status in ('novo', 'em_analise')
 group by r.proposicao_id, p.sigla_tipo, p.numero, p.ano, r.parte
 order by leitores desc, errada desc, primeiro asc;

revoke all on public.fila_reportes from anon, authenticated;

-- Fecha (ou move para análise) todos os reportes abertos de um trecho de uma vez.
-- Uso no SQL Editor: select resolver_reportes(2650489, 'resumo', 'corrigido', 'IA regerada');
create or replace function public.resolver_reportes(
  p_proposicao bigint,
  p_parte      text,
  p_status     text,
  p_nota       text default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  if p_status not in ('em_analise', 'corrigido', 'descartado') then
    raise exception 'status inválido: use em_analise, corrigido ou descartado' using errcode = '22023';
  end if;
  update public.reportes
     set status = p_status,
         nota_interna = coalesce(p_nota, nota_interna)
   where proposicao_id = p_proposicao
     and parte = p_parte
     and status in ('novo', 'em_analise');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- Permissões ----------

revoke all on function public.reportes_ativos() from public;
revoke all on function public.registrar_reporte(bigint, uuid, text, text, text, text, text) from public;
revoke all on function public.resolver_reportes(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.mascarar_dados_pessoais(text) from public, anon, authenticated;
revoke all on function public.reportes_tocar() from public, anon, authenticated;
grant execute on function public.reportes_ativos() to anon, authenticated;
grant execute on function public.registrar_reporte(bigint, uuid, text, text, text, text, text) to anon, authenticated;

-- Para esconder o botão sem apagar nada:
--   revoke execute on function public.reportes_ativos() from anon, authenticated;

notify pgrst, 'reload schema';
