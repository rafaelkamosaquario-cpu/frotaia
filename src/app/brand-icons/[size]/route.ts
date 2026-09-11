import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const dynamicParams = false;

const sizes = [180, 192, 512];
const source = `data:image/png;base64,${readFileSync(join(process.cwd(), "public/frota-ia-brand-202609.png")).toString("base64")}`;

export function generateStaticParams() {
  return sizes.map((size) => ({ size: String(size) }));
}

/** Ícones de instalação renderizados a partir da mesma imagem, sem redesenho ou corte. */
export async function GET(_request: Request, context: { params: Promise<{ size: string }> }) {
  const size = Number((await context.params).size);
  if (!sizes.includes(size)) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    createElement("div", {
      style: { width: "100%", height: "100%", display: "flex", background: "#060911", alignItems: "center", justifyContent: "center" },
    }, createElement("img", { src: source, width: size, height: size, alt: "", style: { objectFit: "contain" } })),
    { width: size, height: size },
  );
}

