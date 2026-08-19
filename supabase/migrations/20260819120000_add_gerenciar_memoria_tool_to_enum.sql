-- Implementação real da memória da IA: nova ferramenta gerenciar_memoria
-- (SALVAR/LISTAR/ESQUECER) — até aqui ai_memories só era escrita por 2
-- chaves fixas do onboarding e nunca era lida de volta pelo prompt.
alter type public.frota_ia_tool_name add value if not exists 'gerenciar_memoria';
