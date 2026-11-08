// Solana Explorer links for devnet. Never link to mainnet.
const BASE = "https://explorer.solana.com";

export function txUrl(signature: string): string {
  return `${BASE}/tx/${signature}?cluster=devnet`;
}

export function addressUrl(address: string): string {
  return `${BASE}/address/${address}?cluster=devnet`;
}
