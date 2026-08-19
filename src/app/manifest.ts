import type { MetadataRoute } from "next";

/**
 * Web App Manifest — usado pelo Android/Chrome quando o cliente escolhe
 * "Adicionar à tela inicial". No iOS/Safari quem manda é o
 * apple-touch-icon (ver metadata em layout.tsx), não este arquivo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frota IA Assistente",
    short_name: "Frota IA",
    description: "Especialista virtual em transporte e gestão de frotas: fretes, CPK, consumo, pneus e custos.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f13",
    theme_color: "#0e0f13",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
