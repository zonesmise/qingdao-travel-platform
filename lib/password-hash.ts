const PASSWORD_ITERATIONS = 100_000;
const MAX_PASSWORD_ITERATIONS = 200_000;

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashAdminPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyAdminPassword(password: string, encoded: string) {
  try {
    const [algorithm, iterationValue, saltValue, hashValue, ...extra] =
      encoded.split("$");
    const iterations = Number(iterationValue);
    if (
      extra.length ||
      algorithm !== "pbkdf2-sha256" ||
      !Number.isSafeInteger(iterations) ||
      iterations < 1 ||
      iterations > MAX_PASSWORD_ITERATIONS ||
      !saltValue ||
      !hashValue
    ) {
      return false;
    }
    const expected = base64ToBytes(hashValue);
    const actual = await derivePassword(
      password,
      base64ToBytes(saltValue),
      iterations,
    );
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export function validateAdminPassword(password: string) {
  return (
    password.length >= 10 &&
    password.length <= 100 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}
