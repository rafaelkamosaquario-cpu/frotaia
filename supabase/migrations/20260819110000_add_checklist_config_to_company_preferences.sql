-- Checklist V2 (B.1): configuração por empresa do checklist diário — mesmo
-- padrão de daily_news_enabled. Desativado por padrão (opt-in, mesmo
-- princípio de nunca disparar automação sem o cliente pedir). Horário em
-- hora cheia de Brasília (0-23); itens fixos com chave estável (label
-- mapeado no código, não editor de formulário livre).

alter table public.company_preferences
  add column checklist_enabled boolean not null default false,
  add column checklist_send_hour smallint not null default 6 check (checklist_send_hour between 0 and 23),
  add column checklist_item_keys text[] not null default array['oleo','agua','pneus','luzes'];
