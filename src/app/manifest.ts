import type { MetadataRoute } from "next";

/**
 * Web App Manifest — usado pelo Android/Chrome quando o cliente escolhe
 * "Adicionar à tela inicial". No iOS/Safari quem manda é o
 * apple-touch-icon (ver metadata em layout.tsx), não este arquivo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frota IA",
    short_name: "Frota IA",
    description: "Especialista virtual em transporte e gestão de frotas: fretes, CPK, consumo, pneus e custos.",
    // Painel de gestão de frota (Rafael usa isso, não o chat simples da raiz "/") — só afeta Android/Chrome ("Instalar app"); no iOS quem decide é a página em que o cliente estava ao tocar "Adicionar à Tela de Início".
    start_url: "/frota/dashboard",
    display: "standalone",
    background_color: "#060911",
    theme_color: "#060911",
    icons: [
      { src: "/brand-icons/192?v=20260911", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand-icons/512?v=20260911", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

