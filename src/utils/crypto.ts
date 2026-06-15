/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EncryptedPayload } from '../types';

/**
 * Encodes an ArrayBuffer to a standards-compliant Base64 string.
 * This avoids stack overflows on large chunks.
 */
export function base64AB(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let len = bytes.length;
  let binary = '';
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Decodes a standards-compliant Base64 string to an ArrayBuffer.
 */
export function abFromBase64(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates an cryptographically secure random base64 salt.
 */
export function generateSaltBase64(): string {
  const arr = new Uint8Array(16);
  window.crypto.getRandomValues(arr);
  return base64AB(arr.buffer);
}

/**
 * Derives a 256-bit AES master key from the user's password and a salt using PBKDF2-HMAC-SHA256.
 */
export async function deriveMasterKey(password: string, saltStr: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const salt = abFromBase64(saltStr);
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates an ECDH key pair over the NIST P-256 curve.
 */
export async function generateChatKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Encrypts and stringifies the private key using the password-derived master key.
 */
export async function encryptPrivateKey(privateKey: CryptoKey, masterKey: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
  const jwkString = JSON.stringify(jwk);
  const enc = new TextEncoder();
  const data = enc.encode(jwkString);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    masterKey,
    data
  );
  
  return JSON.stringify({
    iv: base64AB(iv.buffer),
    ciphertext: base64AB(encrypted),
  });
}

/**
 * Decrypts and imports the private key.
 */
export async function decryptPrivateKey(encryptedString: string, masterKey: CryptoKey): Promise<CryptoKey> {
  try {
    const { iv, ciphertext } = JSON.parse(encryptedString);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: abFromBase64(iv) },
      masterKey,
      abFromBase64(ciphertext)
    );
    const dec = new TextDecoder();
    const jwkString = dec.decode(decrypted);
    const jwk = JSON.parse(jwkString);
    return window.crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
  } catch (err) {
    throw new Error('Incorrect password or decrypted private key content is corrupted');
  }
}

/**
 * Exports a public key to JWK string.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

/**
 * Imports a public key from JWK string.
 */
export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * Derives a shared AES-GCM 256-bit key from the recipient's public key and the sender's private key.
 */
export async function deriveSharedKey(recipientPublicKey: CryptoKey, senderPrivateKey: CryptoKey): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: recipientPublicKey,
    },
    senderPrivateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts cleartext string data with a shared secret key (AES-256-GCM).
 */
export async function encryptText(text: string, sharedKey: CryptoKey): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    sharedKey,
    data
  );
  return {
    iv: base64AB(iv.buffer),
    ciphertext: base64AB(ciphertext),
  };
}

/**
 * Decrypts ciphertext back to string data with a shared secret key (AES-256-GCM).
 */
export async function decryptText(encrypted: EncryptedPayload, sharedKey: CryptoKey): Promise<string> {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: abFromBase64(encrypted.iv) },
    sharedKey,
    abFromBase64(encrypted.ciphertext)
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

/**
 * Encrypts an ArrayBuffer binary chunk.
 */
export async function encryptChunk(chunk: ArrayBuffer, sharedKey: CryptoKey): Promise<EncryptedPayload> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    sharedKey,
    chunk
  );
  return {
    iv: base64AB(iv.buffer),
    ciphertext: base64AB(ciphertext),
  };
}

/**
 * Decrypts a binary chunk back to ArrayBuffer.
 */
export async function decryptChunk(encrypted: EncryptedPayload, sharedKey: CryptoKey): Promise<ArrayBuffer> {
  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: abFromBase64(encrypted.iv) },
    sharedKey,
    abFromBase64(encrypted.ciphertext)
  );
}

/**
 * Calculates a SHA-256 fingerprint of the public keys to represent the "Safety Number"
 */
export async function calculateSafetyNumber(publicKeyA: string, publicKeyB: string): Promise<string> {
  const sorted = [publicKeyA, publicKeyB].sort();
  const text = sorted.join('|');
  const enc = new TextEncoder();
  const buffer = enc.encode(text);
  const hash = await window.crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(hash);
  
  // Create blocks of numbers similar to Signal
  const numbers: string[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    if (numbers.length >= 5) break;
    const value = (bytes[i] << 24) | (bytes[i+1] << 16) | (bytes[i+2] << 8) | bytes[i+3];
    const absVal = Math.abs(value) % 100000;
    numbers.push(String(absVal).padStart(5, '0'));
  }
  return numbers.join(' ');
}
