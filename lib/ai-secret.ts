import { getAiConfigEncryptionKey, getD1 } from "./server";

type EncryptedSecret = { v: 1; iv: string; cipher: string };

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey() {
  const raw = base64ToBytes(getAiConfigEncryptionKey());
  if (raw.byteLength !== 32) throw new Error("AI 보안 저장 설정을 확인해 주세요.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGeminiApiKey(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), cipher: bytesToBase64(new Uint8Array(cipher)) } satisfies EncryptedSecret);
}

export async function decryptGeminiApiKey(value: string) {
  const parsed = JSON.parse(value) as EncryptedSecret;
  if (parsed.v !== 1) throw new Error("AI 연결 정보 형식을 확인해 주세요.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(parsed.iv) }, await encryptionKey(), base64ToBytes(parsed.cipher));
  return new TextDecoder().decode(plain);
}

export async function getStoredGeminiApiKey() {
  const row = await getD1().prepare("SELECT value FROM settings WHERE key = 'gemini_api_key_encrypted'").first<{ value: string }>();
  if (!row?.value) return "";
  return decryptGeminiApiKey(row.value);
}
