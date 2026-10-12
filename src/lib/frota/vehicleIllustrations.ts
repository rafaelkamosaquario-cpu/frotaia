export const VEHICLE_ILLUSTRATIONS = [
  { id: "generic", label: "Ícone genérico", image: null, caption: "Ilustração", tractor: false },
  { id: "truck", label: "Caminhão sem Julieta", image: "truck.webp", caption: "Caminhão · sem Julieta", tractor: false },
  { id: "julieta3", label: "Caminhão com Julieta de 3 eixos", image: "truck-julieta-3.webp", caption: "Julieta de 3 eixos", tractor: false },
  { id: "julieta4", label: "Caminhão com Julieta de 4 eixos", image: "truck-julieta-4.webp", caption: "Julieta de 4 eixos", tractor: false },
  { id: "loader", label: "Trator amarelo com MUC dianteiro", image: "tractor-front-yellow.webp", caption: "MUC dianteiro · carregamento", tractor: true },
  { id: "winch", label: "Trator guincho florestal", image: "tractor-winch.webp", caption: "Guincho florestal · sem MUC", tractor: true },
] as const;
export type VehicleIllustrationId = typeof VEHICLE_ILLUSTRATIONS[number]["id"];
