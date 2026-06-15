/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EncryptedPayload {
  iv: string; // Base64 encoded initialization vector
  ciphertext: string; // Base64 encoded ciphertext
}

export interface User {
  username: string;
  publicKey: string; // JWK formatted public key string
  encryptedPrivateKey: string; // Encrypted private key payload stringified
  profilePic?: string; // Base64 or avatar short URL
  statusMessage?: string;
  isOnline?: boolean;
  lastSeen?: string; // UTC ISO string
  createdAt?: string; // UTC ISO string
}

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  encryptedContent: string; // stringified EncryptedPayload containing the text or file reference
  timestamp: string; // UTC ISO string
  readStatus: 'sent' | 'delivered' | 'read';
  disappearingDuration?: number; // duration in seconds, 0 or undefined = permanent
  expiresAt?: string; // UTC ISO string if disappearing
  isSystem?: boolean;
  
  // File details if it represents an attached asset
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  chunkCount?: number;
}

export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkCount: number;
  sender: string;
  recipient: string;
  timestamp: string;
}

export interface ChatSession {
  recipient: User;
  unreadCount: number;
  latestMessage?: Message;
  isTyping?: boolean;
}
