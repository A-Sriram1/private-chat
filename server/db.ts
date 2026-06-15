/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { User, Message, FileMetadata } from '../src/types';

export interface DbUser extends User {
  passwordHash: string;
  salt: string; // The salt used for PBKDF2 key derivation of the user's master key
}

interface DBStore {
  users: Record<string, DbUser>;
  messages: Message[];
  files: Record<string, FileMetadata>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure database directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-Memory cache of the store
let store: DBStore = {
  users: {},
  messages: [],
  files: {},
};

// Safeguard serialization to prevent file corruptions
let isWriting = false;
function saveToDisk() {
  if (isWriting) return;
  isWriting = true;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database to disk:', err);
  } finally {
    isWriting = false;
  }
}

function loadFromDisk() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      if (content.trim()) {
        store = JSON.parse(content);
      }
    } else {
      saveToDisk();
    }
  } catch (err) {
    console.error('Failed to read database from disk, starting fresh:', err);
    saveToDisk();
  }
}

// Load database immediately
loadFromDisk();

export const db = {
  // Users
  getUser(username: string): DbUser | undefined {
    // Normalize username
    const key = username.toLowerCase().trim();
    return store.users[key];
  },
  
  createUser(user: DbUser): void {
    const key = user.username.toLowerCase().trim();
    store.users[key] = {
      ...user,
      createdAt: new Date().toISOString()
    };
    saveToDisk();
  },
  
  updateUser(username: string, updates: Partial<DbUser>): boolean {
    const key = username.toLowerCase().trim();
    if (!store.users[key]) return false;
    store.users[key] = { ...store.users[key], ...updates };
    saveToDisk();
    return true;
  },
  
  getAllUsersPublic(): User[] {
    return Object.values(store.users).map(({ passwordHash, salt, ...rest }) => rest);
  },

  // Messages
  getMessagesForUser(username: string): Message[] {
    const key = username.toLowerCase().trim();
    return store.messages.filter(msg => 
      msg.sender.toLowerCase().trim() === key || 
      msg.recipient.toLowerCase().trim() === key
    );
  },

  addMessage(msg: Message): void {
    store.messages.push(msg);
    saveToDisk();
  },

  markMessagesAsRead(sender: string, recipient: string): void {
    const sKey = sender.toLowerCase().trim();
    const rKey = recipient.toLowerCase().trim();
    let updated = false;
    
    store.messages = store.messages.map(msg => {
      if (
        msg.sender.toLowerCase().trim() === sKey && 
        msg.recipient.toLowerCase().trim() === rKey && 
        msg.readStatus !== 'read'
      ) {
        updated = true;
        return { ...msg, readStatus: 'read' };
      }
      return msg;
    });
    
    if (updated) {
      saveToDisk();
    }
  },

  deleteMessage(msgId: string): boolean {
    const initialLen = store.messages.length;
    store.messages = store.messages.filter(msg => msg.id !== msgId);
    if (store.messages.length !== initialLen) {
      saveToDisk();
      return true;
    }
    return false;
  },

  cleanExpiredMessages(): void {
    const now = new Date();
    const initialLen = store.messages.length;
    
    // Filter out messages that have expired based on their disappearing triggers
    store.messages = store.messages.filter(msg => {
      if (msg.expiresAt) {
        const expiry = new Date(msg.expiresAt);
        // If expired, delete files associated with it too
        if (now >= expiry) {
          if (msg.fileId) {
            db.deleteFileFolder(msg.fileId);
          }
          return false;
        }
      }
      return true;
    });
    
    if (store.messages.length !== initialLen) {
      saveToDisk();
    }
  },

  // Files & Multi-chunk uploaded metadata
  getFileMetadata(fileId: string): FileMetadata | undefined {
    return store.files[fileId];
  },

  saveFileMetadata(file: FileMetadata): void {
    store.files[file.fileId] = file;
    saveToDisk();
  },

  deleteFileFolder(fileId: string): void {
    delete store.files[fileId];
    saveToDisk();
    
    const fileFolder = path.join(UPLOADS_DIR, fileId);
    if (fs.existsSync(fileFolder)) {
      try {
        fs.rmSync(fileFolder, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to cleanup file folder for ID:', fileId, err);
      }
    }
  },
  
  // High efficiency chunk creation
  saveFileChunk(fileId: string, index: number, buffer: Buffer): void {
    const fileFolder = path.join(UPLOADS_DIR, fileId);
    if (!fs.existsSync(fileFolder)) {
      fs.mkdirSync(fileFolder, { recursive: true });
    }
    fs.writeFileSync(path.join(fileFolder, `chunk_${index}`), buffer);
  },

  getFileChunk(fileId: string, index: number): Buffer | null {
    const chunkPath = path.join(UPLOADS_DIR, fileId, `chunk_${index}`);
    if (fs.existsSync(chunkPath)) {
      return fs.readFileSync(chunkPath);
    }
    return null;
  }
};

// Periodically clean expired disappearing messages every 10 seconds
setInterval(() => {
  db.cleanExpiredMessages();
}, 10000);
