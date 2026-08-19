-- Auditoria de sincronização WhatsApp↔Painel: fecha 2 das 6 assimetrias
-- encontradas — empresa e configuração de checklist só eram editáveis
-- pelo painel, sem ferramenta de IA equivalente.
alter type public.frota_ia_tool_name add value if not exists 'gerenciar_empresa';
alter type public.frota_ia_tool_name add value if not exists 'gerenciar_checklist_config';
