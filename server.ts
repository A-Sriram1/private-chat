/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

import { db, UPLOADS_DIR } from './server/db';
import { User, Message, FileMetadata } from './src/types';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_e2ee_salt_key_jwt';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage in memory to easily get chunk buffer before writing to disk
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per chunk, chunk uploads are sequential
});

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Setup Basic Security Headers (Helmet parity)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // In-memory rate limiting for register and login from same IP
  const rateLimitStore: Record<string, { count: number; resetTime: number }> = {};
  const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'local_ip';
    const now = Date.now();
    const entry = rateLimitStore[ip];
    
    if (entry && now < entry.resetTime) {
      if (entry.count >= 15) {
        return res.status(429).json({ error: 'Too many authentication attempts. Please try again in 1 minute.' });
      }
      entry.count++;
    } else {
      rateLimitStore[ip] = { count: 1, resetTime: now + 60000 };
    }
    next();
  };

  // Auth Middleware
  const authenticateToken = (req: any, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No authorization token supplied.' });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        return res.status(403).json({ error: 'Token is invalid or has expired.' });
      }
      req.user = user;
      next();
    });
  };

  // API - Auth Routes
  app.post('/api/auth/register', rateLimiter, async (req, res) => {
    try {
      const { username, password, salt, publicKey, encryptedPrivateKey, profilePic, statusMessage } = req.body;
      
      if (!username || !password || !salt || !publicKey || !encryptedPrivateKey) {
        return res.status(400).json({ error: 'Missing required registration parameters.' });
      }
      
      const cleanUsername = username.trim();
      if (cleanUsername.length < 3 || cleanUsername.length > 20 || !/^[A-Za-z0-9_.-]+$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'Username must be 3-20 characters long and contain only alphanumeric characters, dots, hyphens, or underscores.' });
      }

      const existing = db.getUser(cleanUsername);
      if (existing) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }

      // Hash password using bcrypt
      const passwordHash = await bcrypt.hash(password, 10);

      const newUser = {
        username: cleanUsername,
        publicKey,
        encryptedPrivateKey,
        profilePic,
        statusMessage: statusMessage || 'Hey there! I am using Private Chat.',
        passwordHash,
        salt
      };

      db.createUser(newUser);

      const token = jwt.sign({ username: cleanUsername }, JWT_SECRET, { expiresIn: '7d' });
      
      res.status(201).json({
        token,
        user: {
          username: cleanUsername,
          publicKey,
          encryptedPrivateKey,
          profilePic: newUser.profilePic,
          statusMessage: newUser.statusMessage
        }
      });
    } catch (err: any) {
      console.error('Registration failed:', err);
      res.status(500).json({ error: 'Registration failed due to a server error.' });
    }
  });

  app.post('/api/auth/login', rateLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Missing username or password.' });
      }

      const user = db.getUser(username);
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      res.json({
        token,
        user: {
          username: user.username,
          publicKey: user.publicKey,
          encryptedPrivateKey: user.encryptedPrivateKey,
          profilePic: user.profilePic,
          statusMessage: user.statusMessage,
          salt: user.salt // Required so client knows which salt to use for PBKDF2 local decryption
        }
      });
    } catch (err: any) {
      console.error('Login failed:', err);
      res.status(500).json({ error: 'Login failed due to a server error.' });
    }
  });

  // API - Get List of Contacts with details
  app.get('/api/users', authenticateToken, (req: any, res) => {
    try {
      const allUsers = db.getAllUsersPublic();
      // Tag active users with online state from live connections map
      const mapped = allUsers.map(user => ({
        ...user,
        isOnline: activeSockets.has(user.username.toLowerCase())
      }));
      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: 'Could not fetch contact users.' });
    }
  });

  // API - Update Profile Status
  app.put('/api/profile', authenticateToken, (req: any, res) => {
    try {
      const { profilePic, statusMessage } = req.body;
      const username = req.user.username;
      
      const success = db.updateUser(username, { profilePic, statusMessage });
      if (success) {
        // Broadcast profile update to active websockets
        broadcastToEveryone({
          type: 'profile_updated',
          username,
          profilePic,
          statusMessage
        });
        return res.json({ status: 'ok', profilePic, statusMessage });
      }
      res.status(404).json({ error: 'User profile not found.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  // Secure Chunked E2EE File Upload Router
  app.post('/api/upload-chunk', authenticateToken, upload.single('chunk'), (req: any, res) => {
    try {
      const { fileId, fileName, chunkIndex, chunkCount, fileSize, fileType, recipient } = req.body;
      
      if (!req.file || !fileId || !chunkIndex || !chunkCount || !recipient) {
        return res.status(400).json({ error: 'Missing uploaded binary chunk or context metadata.' });
      }

      const index = parseInt(chunkIndex, 10);
      const total = parseInt(chunkCount, 10);
      const sender = req.user.username;

      // Save chunk
      db.saveFileChunk(fileId, index, req.file.buffer);

      // If it's the last chunk, save the file meta-information
      if (index === total - 1) {
        const metadata: FileMetadata = {
          fileId,
          fileName: fileName || 'file',
          fileSize: parseInt(fileSize, 10) || req.file.buffer.length,
          fileType: fileType || 'application/octet-stream',
          chunkCount: total,
          sender,
          recipient,
          timestamp: new Date().toISOString()
        };
        db.saveFileMetadata(metadata);
      }

      res.json({ success: true, chunkReceived: index });
    } catch (err: any) {
      console.error('Chunk upload failed:', err);
      res.status(500).json({ error: 'Uploading file chunk failed.' });
    }
  });

  // Serve Chunk for Download
  app.get('/api/download-chunk/:fileId/:chunkIndex', authenticateToken, (req: any, res) => {
    try {
      const { fileId, chunkIndex } = req.params;
      const index = parseInt(chunkIndex, 10);
      const username = req.user.username;

      const fileMeta = db.getFileMetadata(fileId);
      if (!fileMeta) {
        return res.status(404).json({ error: 'Requested file is missing or has been expired/deleted.' });
      }

      // Authorize: sender or recipient only
      const userLower = username.toLowerCase();
      if (fileMeta.sender.toLowerCase() !== userLower && fileMeta.recipient.toLowerCase() !== userLower) {
        return res.status(403).json({ error: 'You are not authorized to download this file.' });
      }

      const buffer = db.getFileChunk(fileId, index);
      if (!buffer) {
        return res.status(404).json({ error: 'Chunk not found.' });
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(buffer);
    } catch (err: any) {
      console.error('Chunk download failed:', err);
      res.status(500).json({ error: 'Downloading file chunk failed.' });
    }
  });


  // --- WEBSOCKETS REAL-TIME SIGNAL PIPELINE ---
  
  // Mapping username(lowercase) -> Set of active WebSocket connections
  const activeSockets = new Map<string, Set<WebSocket>>();

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    
    // We handle upgrades natively at path '/' or '/ws'
    if (url.pathname === '/' || url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: any) => {
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.username = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (dataStr: string) => {
      try {
        const payload = JSON.parse(dataStr);
        
        // Match protocol action
        switch (payload.type) {
          case 'auth': {
            const { token } = payload;
            if (!token) {
              ws.send(JSON.stringify({ type: 'error', message: 'Auth token missing.' }));
              return;
            }

            jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', message: 'Token is invalid or expired. Authentication rejected.' }));
                ws.close();
                return;
              }

              const username = decoded.username;
              ws.username = username;
              ws.isAuthenticated = true;

              const uKey = username.toLowerCase();
              if (!activeSockets.has(uKey)) {
                activeSockets.set(uKey, new Set());
              }
              activeSockets.get(uKey)!.add(ws);

              ws.send(JSON.stringify({ 
                type: 'auth_success', 
                username: ws.username,
                history: db.getMessagesForUser(ws.username)
              }));

              // Notify everyone of updated online presence
              broadcastPresence(username, 'online');
            });
            break;
          }

          case 'message': {
            if (!ws.isAuthenticated || !ws.username) {
              ws.send(JSON.stringify({ type: 'error', message: 'Please authenticate first.' }));
              return;
            }

            const { message } = payload;
            if (!message || !message.recipient || !message.encryptedContent) {
              return;
            }

            const cleanMsg: Message = {
              id: message.id || Math.random().toString(36).substring(2, 9),
              sender: ws.username,
              recipient: message.recipient,
              encryptedContent: message.encryptedContent,
              timestamp: new Date().toISOString(),
              readStatus: 'sent',
              disappearingDuration: message.disappearingDuration,
              
              fileId: message.fileId,
              fileName: message.fileName,
              fileSize: message.fileSize,
              fileType: message.fileType,
              chunkCount: message.chunkCount
            };

            if (cleanMsg.disappearingDuration && cleanMsg.disappearingDuration > 0) {
              // Expires dynamic timer set once the recipient reads it, or pre-expiring on server structure
              cleanMsg.expiresAt = new Date(Date.now() + cleanMsg.disappearingDuration * 1000).toISOString();
            }

            db.addMessage(cleanMsg);

            // Forward to recipient active connection tabs
            sendToUser(cleanMsg.recipient, {
              type: 'message',
              message: cleanMsg
            });

            // Echo back to sender's other connected tabs too
            sendToUser(ws.username, {
              type: 'message',
              message: cleanMsg
            }, ws); // Skip current socket (sender is already updated in local browser optimistically)
            
            break;
          }

          case 'typing': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { recipient, isTyping } = payload;
            if (!recipient) return;
            
            sendToUser(recipient, {
              type: 'typing',
              sender: ws.username,
              isTyping: !!isTyping
            });
            break;
          }

          case 'read_receipt': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { sender } = payload; // The user whose messages have been read
            if (!sender) return;

            db.markMessagesAsRead(sender, ws.username);

            // Inform the sender so their checkmarks turn double blue
            sendToUser(sender, {
              type: 'read_receipt',
              reader: ws.username, // The current user who read them
            });
            break;
          }
          
          case 'delete_message': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { messageId, recipient } = payload;
            if (!messageId) return;

            const deleted = db.deleteMessage(messageId);
            if (deleted) {
              const updateSignal = { type: 'message_deleted', id: messageId };
              sendToUser(ws.username, updateSignal, ws);
              if (recipient) {
                sendToUser(recipient, updateSignal);
              }
            }
            break;
          }

          case 'call_invite': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { recipient, offer, mediaType } = payload;
            if (!recipient) return;
            sendToUser(recipient, {
              type: 'call_invite',
              sender: ws.username,
              offer,
              mediaType
            });
            break;
          }

          case 'call_answer': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { recipient, answer } = payload;
            if (!recipient) return;
            sendToUser(recipient, {
              type: 'call_answer',
              sender: ws.username,
              answer
            });
            break;
          }

          case 'call_reject': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { recipient } = payload;
            if (!recipient) return;
            sendToUser(recipient, {
              type: 'call_reject',
              sender: ws.username
            });
            break;
          }

          case 'ice_candidate': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { recipient, candidate } = payload;
            if (!recipient) return;
            sendToUser(recipient, {
              type: 'ice_candidate',
              sender: ws.username,
              candidate
            });
            break;
          }

          case 'call_end': {
            if (!ws.isAuthenticated || !ws.username) return;
            const { recipient } = payload;
            if (!recipient) return;
            sendToUser(recipient, {
              type: 'call_end',
              sender: ws.username
            });
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Socket payload error:', err);
      }
    });

    ws.on('close', () => {
      if (ws.username) {
        const uKey = ws.username.toLowerCase();
        const clientSet = activeSockets.get(uKey);
        if (clientSet) {
          clientSet.delete(ws);
          if (clientSet.size === 0) {
            activeSockets.delete(uKey);
            // Broadcast offline state to all contacts
            broadcastPresence(ws.username, 'offline');
          }
        }
      }
    });
  });

  // Keep-alive checker
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 25000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Helpers to send data
  function sendToUser(username: string, payload: any, skipSocket?: WebSocket) {
    const sockets = activeSockets.get(username.toLowerCase());
    if (!sockets) return;
    const str = JSON.stringify(payload);
    sockets.forEach(wsClient => {
      if (wsClient !== skipSocket && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(str);
      }
    });
  }

  function broadcastPresence(username: string, status: 'online' | 'offline') {
    const payload = JSON.stringify({
      type: 'presence',
      username,
      status,
      lastSeen: new Date().toISOString()
    });
    wss.clients.forEach((client: any) => {
      if (client.readyState === WebSocket.OPEN && client.isAuthenticated && client.username !== username) {
        client.send(payload);
      }
    });
  }

  function broadcastToEveryone(payload: any) {
    const str = JSON.stringify(payload);
    wss.clients.forEach((client: any) => {
      if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
        client.send(str);
      }
    });
  }

  // --- VITE MIDDLEWARE INTERFACE / SPA STATIC ROUTING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`Server successfully booted and listening on http://${HOST}:${PORT}`);
  });
}

startServer();
