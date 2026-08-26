-- Fechamento de coerência do onboarding (08/2026): região de atuação
-- ("Norte", "Sudeste", "Todas" etc.) era gravada só em ai_memories
-- (key='operating_region'), sujeita a sair do top-12 do prompt da IA
-- (listMemoriesForPrompt ordena por updated_at desc, sem prioridade por
-- key) assim que a empresa acumulasse memórias mais recentes. Vira dado
-- estrutural em company_preferences, mesmo padrão de cidade-base
-- (companies.city/state) — a IA nunca "esquece" por causa de outras
-- memórias mais novas. Aditiva, nullable, sem afetar linhas existentes.
alter table public.company_preferences
  add column operating_region text;

comment on column public.company_preferences.operating_region is
  'Região de atuação informada no onboarding (Norte/Nordeste/Centro-Oeste/Sudeste/Sul/Todas ou texto livre) — dado estrutural, não memória volátil.';
