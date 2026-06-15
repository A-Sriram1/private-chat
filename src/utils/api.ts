/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from '../types';
import { encryptChunk, base64AB } from './crypto';

// Token caching
let cachedToken: string | null = null;

export function setTokenInStorage(token: string) {
  cachedToken = token;
  localStorage.setItem('e2ee_chat_jwt', token);
}

export function getTokenFromStorage(): string | null {
  if (cachedToken) return cachedToken;
  cachedToken = localStorage.getItem('e2ee_chat_jwt');
  return cachedToken;
}

export function removeTokenFromStorage() {
  cachedToken = null;
  localStorage.removeItem('e2ee_chat_jwt');
}

/**
 * Standard fetch fetcher with auth header
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getTokenFromStorage();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Define JSON default if content type not set
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Slices a file on the client, encrypts each chunk sequentially with the E2EE shared key,
 * and posts it to the /api/upload-chunk route. Runs on a progress callback.
 */
export async function encryptAndUploadFile(
  file: File,
  recipient: string,
  sharedKey: CryptoKey,
  onProgress: (percent: number) => void
): Promise<string> {
  const fileId = Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  onProgress(1);

  for (let index = 0; index < totalChunks; index++) {
    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blobSlice = file.slice(start, end);
    
    // Convert blob slice to ArrayBuffer
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(blobSlice);
    });

    // Encrypt individual chunk with AES-GCM and E2EE shared key
    const encryptedPayload = await encryptChunk(arrayBuffer, sharedKey);
    const encryptedStr = JSON.stringify(encryptedPayload);

    // Build Form Data for chunk upload
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('fileName', file.name);
    formData.append('chunkIndex', index.toString());
    formData.append('chunkCount', totalChunks.toString());
    formData.append('fileSize', file.size.toString());
    formData.append('fileType', file.type);
    formData.append('recipient', recipient);
    
    // Append encrypted payload as a file blob
    const chunkBlob = new Blob([encryptedStr], { type: 'application/json' });
    formData.append('chunk', chunkBlob, `chunk_${index}`);

    // Upload with authorization
    await apiRequest('/api/upload-chunk', {
      method: 'POST',
      body: formData,
    });

    // Notify of progress
    const percent = Math.floor(((index + 1) / totalChunks) * 100);
    onProgress(percent);
  }

  return fileId;
}

/**
 * Downloads all encrypted chunks of a file sequentially, decrypts them with
 * the shared E2EE key, and forms a unified decrypted data URL blob for view.
 */
export async function downloadAndDecryptFile(
  fileId: string,
  totalChunks: number,
  fileType: string,
  sharedKey: CryptoKey,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const decryptedChunks: ArrayBuffer[] = [];

  for (let index = 0; index < totalChunks; index++) {
    onProgress?.(Math.floor((index / totalChunks) * 100));

    // Fetch the raw encrypted json chunk data
    const res = await fetch(`/api/download-chunk/${fileId}/${index}`, {
      headers: {
        'Authorization': `Bearer ${getTokenFromStorage()}`
      },
    });

    if (!res.ok) {
      throw new Error(`Failed downloading file chunk ${index}`);
    }

    const jsonText = await res.text();
    const encryptedPayload = JSON.parse(jsonText);

    // Decrypt chunk payload
    const decryptedBuffer = await import('./crypto').then(m => 
      m.decryptChunk(encryptedPayload, sharedKey)
    );
    
    decryptedChunks.push(decryptedBuffer);
  }

  onProgress?.(100);

  // Combine multiple ArrayBuffers back into one cohesive Blob
  return new Blob(decryptedChunks, { type: fileType });
}
