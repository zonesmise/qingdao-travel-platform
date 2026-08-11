import { getPersonalDataEncryptionKey } from "./server";

type EncryptedValue = { v: 1; iv: string; cipher: string };

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
  const configured = getPersonalDataEncryptionKey();
  if (!configured) throw new Error("개인정보 암호화 설정을 먼저 완료해 주세요.");
  const raw = base64ToBytes(configured);
  if (raw.byteLength !== 32) throw new Error("개인정보 암호화 키는 32바이트 Base64 형식이어야 합니다.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function normalizeCustomsCode(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 13);
}

export function validCustomsCode(value: unknown) {
  return /^P\d{12}$/.test(normalizeCustomsCode(value));
}

export function maskCustomsCode(value: unknown) {
  const normalized = normalizeCustomsCode(value);
  return validCustomsCode(normalized) ? `${normalized.slice(0, 2)}******${normalized.slice(-4)}` : "";
}

export async function encryptPersonalValue(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), cipher: bytesToBase64(new Uint8Array(cipher)) } satisfies EncryptedValue);
}

export async function decryptPersonalValue(value: string) {
  const parsed = JSON.parse(value) as EncryptedValue;
  if (parsed.v !== 1) throw new Error("암호화된 개인정보 형식을 확인해 주세요.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(parsed.iv) }, await encryptionKey(), base64ToBytes(parsed.cipher));
  return new TextDecoder().decode(plain);
}
