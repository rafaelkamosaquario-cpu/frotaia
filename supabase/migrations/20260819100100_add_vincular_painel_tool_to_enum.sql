-- Unificação de identidade WhatsApp+Painel (Parte A): nova ferramenta vincular_painel.
alter type public.frota_ia_tool_name add value if not exists 'vincular_painel';
