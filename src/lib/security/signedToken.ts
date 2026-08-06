import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Impressão digital segura do segredo (8 hex do SHA-256) — nunca o valor em si, só pra comparar se create/verify usaram a mesma chave. */
function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 8);
}

/**
 * Tokens assinados (HMAC-SHA256) de curta duração, sem estado no servidor.
 * Implementação genérica — quem chama fornece o segredo. Usada pelo módulo
 * do Google Calendar (state do OAuth, link de conexão) e pelo módulo do
 * WhatsApp (link de vínculo do número), cada um com seu próprio segredo.
 */

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export class InvalidSignedTokenError extends Error {
  constructor(reason: string) {
    super(`Token inválido: ${reason}`);
    this.name = "InvalidSignedTokenError";
  }
}

export function createSignedToken(payload: Record<string, unknown>, ttlSeconds: number, secret: string): string {
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const signature = sign(body, secret);
  console.log(`[signedToken] create — secretFingerprint=${fingerprint(secret)} bodyLen=${body.length} sigLen=${signature.length}`);
  return `${body}.${signature}`;
}

export function verifySignedToken<T extends Record<string, unknown>>(token: string, secret: string): T {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new InvalidSignedTokenError("formato inesperado.");

  const expectedSignature = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    console.error(
      `[signedToken] verify falhou — secretFingerprint=${fingerprint(secret)} bodyLen=${body.length} sigLen=${signature.length} expectedSigLen=${expectedSignature.length}`
    );
    throw new InvalidSignedTokenError("assinatura não confere.");
  }

  const parsed = JSON.parse(base64UrlDecode(body)) as T & { exp: number };

  if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new InvalidSignedTokenError("expirado.");
  }

  return parsed;
}
