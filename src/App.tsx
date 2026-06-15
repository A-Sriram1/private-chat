/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, ShieldAlert, Users, Cloud, CloudOff, MessageSquareLock, 
  Settings2, Activity, Info, Loader2 
} from 'lucide-react';

import { User, Message, ChatSession } from './types';
import LoginRegister from './components/LoginRegister';
import ContactSidebar from './components/ContactSidebar';
import ChatWindow from './components/ChatWindow';
import ProfileModal from './components/ProfileModal';
import SafetyNumberModal from './components/SafetyNumberModal';
import CallOverlay from './components/CallOverlay';
import { apiRequest, removeTokenFromStorage, getTokenFromStorage } from './utils/api';
import { importPublicKey, deriveSharedKey } from './utils/crypto';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);

  // Users data fetched from server key directory
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Active conversations list structure
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);

  // Complete local cache of messages, sync'd with websockets
  const [messages, setMessages] = useState<Message[]>([]);

  // Cache list of derived shared keys: recipientName -> CryptoKey
  const sharedKeysCacheRef = useRef<Map<string, CryptoKey>>(new Map());

  // Websocket connection context
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Dialog panels status toggles
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);

  // Mobile layout state helper
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);

  // --- WebRTC Secure Call States ---
  const [callState, setCallState] = useState<'idle' | 'dialing' | 'incoming' | 'active' | 'ended'>('idle');
  const [callPeer, setCallPeer] = useState<User | null>(null);
  const [callMediaType, setCallMediaType] = useState<'audio' | 'video'>('audio');
  const [isCallCaller, setIsCallCaller] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Helper Refs
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectIntervalRef = useRef<number | null>(null);
  const currentUserRef = useRef<User | null>(null);
  currentUserRef.current = currentUser;

  const allUsersRef = useRef<User[]>([]);
  allUsersRef.current = allUsers;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const bufferedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // --- WebRTC Functions ---
  const initiateCall = async (recipient: User, type: 'audio' | 'video') => {
    try {
      setCallState('dialing');
      setCallPeer(recipient);
      setCallMediaType(type);
      setIsCallCaller(true);
      setIsMuted(false);
      setIsCameraOff(false);
      bufferedIceCandidatesRef.current = [];

      const constraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'ice_candidate',
            recipient: recipient.username,
            candidate: event.candidate
          }));
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'call_invite',
          recipient: recipient.username,
          offer,
          mediaType: type
        }));
      }
    } catch (err) {
      console.error('Failed to initiate secure call:', err);
      alert('Could not start call. Please check your camera/microphone permissions.');
      endCall(true);
    }
  };

  const endCall = (notifyPeer = true) => {
    if (notifyPeer && callPeer && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'call_end',
        recipient: callPeer.username
      }));
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    bufferedIceCandidatesRef.current = [];

    setCallState('ended');
    setTimeout(() => {
      setCallState('idle');
      setCallPeer(null);
    }, 1500);
  };

  const acceptCall = async () => {
    if (!callPeer || !pcRef.current) return;
    try {
      setCallState('active');
      setIsMuted(false);
      setIsCameraOff(false);

      const constraints = {
        audio: true,
        video: callMediaType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = pcRef.current;
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'call_answer',
          recipient: callPeer.username,
          answer
        }));
      }

      if (bufferedIceCandidatesRef.current.length > 0) {
        for (const candidate of bufferedIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Failed to add buffered candidate:', e);
          }
        }
        bufferedIceCandidatesRef.current = [];
      }
    } catch (err) {
      console.error('Failed to accept secure call:', err);
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (callPeer && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'call_reject',
        recipient: callPeer.username
      }));
    }
    endCall(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!audioTracks[0]?.enabled);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(!videoTracks[0]?.enabled);
    }
  };

  // 1. WebSocket system manager with auto-reconnection
  const connectWebSocket = () => {
    // Prevent duplicated sockets
    if (socketRef.current && (socketRef.current.readyState === WebSocket.CONNECTING || socketRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    const token = getTokenFromStorage();
    if (!token) return;

    setIsSyncing(true);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Dynamically build the WS connection endpoint against current deployment host
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Real-time encryption channel unlocked. Authenticating with server...');
      setIsWsConnected(true);
      // Auth immediately upon socket establishment
      ws.send(JSON.stringify({ type: 'auth', token }));
      
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }
    };

    ws.onmessage = async (e) => {
      try {
        const payload = JSON.parse(e.data);
        
        switch (payload.type) {
          case 'auth_success': {
            console.log('E2EE Node connection verified. Keys handshake okay!');
            setMessages(payload.history || []);
            setIsSyncing(false);
            break;
          }

          case 'message': {
            const incomingMsg: Message = payload.message;
            setMessages((prev) => {
              // Idempotency: filter duplicates
              if (prev.some((m) => m.id === incomingMsg.id)) return prev;
              return [...prev, incomingMsg];
            });

            // If recipient had this session inactive, auto-unlock unread ticks
            const current = currentUserRef.current;
            if (current) {
              const partner = incomingMsg.sender.toLowerCase() === current.username.toLowerCase() 
                ? incomingMsg.recipient 
                : incomingMsg.sender;
              
              setSessions((prevSessions) => {
                const partnerLower = partner.toLowerCase();
                const sessionExists = prevSessions.some((s) => s.recipient.username.toLowerCase() === partnerLower);
                
                // Read receipt update triggers
                const isCurrentActive = activeSession && activeSession.recipient.username.toLowerCase() === partnerLower;
                
                if (sessionExists) {
                  return prevSessions.map((s) => {
                    if (s.recipient.username.toLowerCase() === partnerLower) {
                      return {
                        ...s,
                        unreadCount: isCurrentActive ? 0 : s.unreadCount + 1,
                        latestMessage: incomingMsg
                      };
                    }
                    return s;
                  });
                } else {
                  // Reconstruct recipient details from allUsers database list
                  const partnerDetails = allUsers.find((u) => u.username.toLowerCase() === partnerLower) || {
                    username: partner,
                    publicKey: '',
                    encryptedPrivateKey: ''
                  };
                  return [
                    ...prevSessions,
                    {
                      recipient: partnerDetails,
                      unreadCount: isCurrentActive ? 0 : 1,
                      latestMessage: incomingMsg
                    }
                  ];
                }
              });

              // Fire active read report if tab is active with peer
              if (activeSession && activeSession.recipient.username.toLowerCase() === partner.toLowerCase()) {
                ws.send(JSON.stringify({
                  type: 'read_receipt',
                  sender: partner
                }));
              }
            }
            break;
          }

          case 'typing': {
            const { sender, isTyping } = payload;
            setSessions(prev => prev.map(s => {
              if (s.recipient.username.toLowerCase() === sender.toLowerCase()) {
                return { ...s, isTyping };
              }
              return s;
            }));
            break;
          }

          case 'read_receipt': {
            const { reader } = payload;
            setMessages(prev => prev.map(m => {
              if (m.recipient.toLowerCase() === reader.toLowerCase() && m.readStatus !== 'read') {
                return { ...m, readStatus: 'read' };
              }
              return m;
            }));
            break;
          }

          case 'presence': {
            const { username, status } = payload;
            
            // Update contacts live lists
            setAllUsers(prev => prev.map(u => {
              if (u.username.toLowerCase() === username.toLowerCase()) {
                return { ...u, isOnline: status === 'online' };
              }
              return u;
            }));

            setSessions(prev => prev.map(s => {
              if (s.recipient.username.toLowerCase() === username.toLowerCase()) {
                return {
                  ...s,
                  recipient: { ...s.recipient, isOnline: status === 'online' }
                };
              }
              return s;
            }));
            break;
          }

          case 'profile_updated': {
            const { username, profilePic, statusMessage } = payload;
            setAllUsers(prev => prev.map(u => {
              if (u.username.toLowerCase() === username.toLowerCase()) {
                return { ...u, profilePic, statusMessage };
              }
              return u;
            }));
            setSessions(prev => prev.map(s => {
              if (s.recipient.username.toLowerCase() === username.toLowerCase()) {
                return {
                  ...s,
                  recipient: { ...s.recipient, profilePic, statusMessage }
                };
              }
              return s;
            }));
            break;
          }

          case 'message_deleted': {
            const { id } = payload;
            setMessages(prev => prev.filter(m => m.id !== id));
            break;
          }

          case 'call_invite': {
            const { sender, offer, mediaType } = payload;
            const peerUser = allUsersRef.current.find(u => u.username.toLowerCase() === sender.toLowerCase()) || {
              username: sender,
              publicKey: '',
              encryptedPrivateKey: ''
            };

            setCallState('incoming');
            setCallPeer(peerUser);
            setCallMediaType(mediaType);
            setIsCallCaller(false);
            setIsMuted(false);
            setIsCameraOff(false);
            bufferedIceCandidatesRef.current = [];

            const pc = new RTCPeerConnection({
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            });
            pcRef.current = pc;

            pc.onicecandidate = (event) => {
              if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                  type: 'ice_candidate',
                  recipient: sender,
                  candidate: event.candidate
                }));
              }
            };

            pc.ontrack = (event) => {
              if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
              }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            break;
          }

          case 'call_answer': {
            const { answer } = payload;
            if (pcRef.current) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
              setCallState('active');

              if (bufferedIceCandidatesRef.current.length > 0) {
                for (const candidate of bufferedIceCandidatesRef.current) {
                  try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                  } catch (e) {
                    console.error('Failed to add buffered candidate:', e);
                  }
                }
                bufferedIceCandidatesRef.current = [];
              }
            }
            break;
          }

          case 'call_reject': {
            endCall(false);
            break;
          }

          case 'ice_candidate': {
            const { candidate } = payload;
            if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error('Error adding received ICE candidate:', e);
              }
            } else {
              bufferedIceCandidatesRef.current.push(candidate);
            }
            break;
          }

          case 'call_end': {
            endCall(false);
            break;
          }

          case 'error': {
            console.error('Socket secure node warning:', payload.message);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket packet:', err);
      }
    };

    ws.onclose = () => {
      console.log('Secure tunnel closed. Triggering keynode auto-retry queue...');
      setIsWsConnected(false);
      setIsSyncing(false);
      // Auto reconnect interval every 4 seconds
      if (!reconnectIntervalRef.current) {
        reconnectIntervalRef.current = window.setInterval(() => {
          connectWebSocket();
        }, 4000);
      }
    };

    setSocket(ws);
  };

  // Fetch verified users directories
  const loadUsers = async () => {
    try {
      const usersData = await apiRequest('/api/users');
      setAllUsers(usersData);
    } catch (err) {
      console.error('Fails gathering directory public nodes:', err);
    }
  };

  // 2. Local keychain login resolution trigger
  const handleAuthSuccess = (user: User, key: CryptoKey) => {
    setCurrentUser(user);
    setPrivateKey(key);
    // Fetch lists of other users to locate E2EE targets
    loadUsers();
  };

  const handleLogout = () => {
    removeTokenFromStorage();
    if (socketRef.current) {
      socketRef.current.close();
    }
    setCurrentUser(null);
    setPrivateKey(null);
    setSessions([]);
    setActiveSession(null);
    setMessages([]);
    sharedKeysCacheRef.current.clear();
  };

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (currentUser && privateKey) {
      connectWebSocket();
    }
    return () => {
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    };
  }, [currentUser, privateKey]);

  // Sync and reconstruct chat sessions list based on raw messages history
  useEffect(() => {
    if (!currentUser || allUsers.length === 0) return;

    const userLower = currentUser.username.toLowerCase();
    
    // Extract unique partners from messages
    const partnerSet = new Set<string>();
    messages.forEach(msg => {
      if (msg.sender.toLowerCase() === userLower) partnerSet.add(msg.recipient.toLowerCase());
      if (msg.recipient.toLowerCase() === userLower) partnerSet.add(msg.sender.toLowerCase());
    });

    const activeSessions: ChatSession[] = Array.from(partnerSet).map(partner => {
      const partnerData = allUsers.find(u => u.username.toLowerCase() === partner) || {
        username: partner,
        publicKey: '',
        encryptedPrivateKey: '',
        isOnline: false
      };

      const partnerMessages = messages.filter(m => 
        (m.sender.toLowerCase() === userLower && m.recipient.toLowerCase() === partner) ||
        (m.recipient.toLowerCase() === userLower && m.sender.toLowerCase() === partner)
      );

      const latestMsg = partnerMessages[partnerMessages.length - 1];
      const unreadCount = partnerMessages.filter(m => 
        m.sender.toLowerCase() === partner && m.readStatus !== 'read'
      ).length;

      return {
        recipient: partnerData,
        unreadCount,
        latestMessage: latestMsg
      };
    });

    // Sort by latest message timestamp
    activeSessions.sort((a, b) => {
      const aTime = a.latestMessage ? new Date(a.latestMessage.timestamp).getTime() : 0;
      const bTime = b.latestMessage ? new Date(b.latestMessage.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    setSessions(activeSessions);

    // Sync active session if it changed
    if (activeSession) {
      const updated = activeSessions.find(s => s.recipient.username.toLowerCase() === activeSession.recipient.username.toLowerCase());
      if (updated) {
        // Clear unread count when viewing active chat
        if (updated.unreadCount > 0) {
          updated.unreadCount = 0;
          if (socket) {
            socket.send(JSON.stringify({
              type: 'read_receipt',
              sender: updated.recipient.username
            }));
          }
        }
        setActiveSession(updated);
      }
    }
  }, [messages, allUsers, currentUser]);

  // 3. E2EE Secure symmetric key derivation
  const getSymmetricSharedKey = async (recipient: User): Promise<CryptoKey | null> => {
    if (!privateKey) return null;
    
    const cacheKey = recipient.username.toLowerCase();
    if (sharedKeysCacheRef.current.has(cacheKey)) {
      return sharedKeysCacheRef.current.get(cacheKey)!;
    }

    try {
      // 1. Import recipient's JWK public key
      const importedPub = await importPublicKey(recipient.publicKey);
      
      // 2. Derive 256-bit AES-GCM shared key
      const derivedKey = await deriveSharedKey(importedPub, privateKey);
      
      // 3. Cache derived key in memory
      sharedKeysCacheRef.current.set(cacheKey, derivedKey);
      return derivedKey;
    } catch (err) {
      console.error('Handshake key derivation failed:', err);
      return null;
    }
  };

  const handleSelectSession = (session: ChatSession) => {
    setActiveSession(session);
    setShowMobileSidebar(false);

    // Clear unreads and emit read receipt
    if (session.unreadCount > 0 && socket) {
      socket.send(JSON.stringify({
        type: 'read_receipt',
        sender: session.recipient.username
      }));
    }
  };

  const handleStartNewChat = async (user: User) => {
    const existing = sessions.find(s => s.recipient.username.toLowerCase() === user.username.toLowerCase());
    if (existing) {
      handleSelectSession(existing);
    } else {
      const newSession: ChatSession = {
        recipient: user,
        unreadCount: 0
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSession(newSession);
      setShowMobileSidebar(false);
    }
  };

  // --- WEBSOCKET MESSAGING API BROADCASTERS ---

  const handleSendMessage = async (text: string, disappearingDuration?: number) => {
    if (!socket || !activeSession || !currentUser) return;

    try {
      const sharedKey = await getSymmetricSharedKey(activeSession.recipient);
      if (!sharedKey) return;

      // Encrypt text symmetrically via AES-256-GCM on the client
      const encryptedPayload = await import('./utils/crypto').then(m => 
        m.encryptText(text, sharedKey)
      );

      const messagePacket = {
        type: 'message',
        message: {
          id: Math.random().toString(36).substring(2, 9),
          recipient: activeSession.recipient.username,
          encryptedContent: JSON.stringify(encryptedPayload),
          disappearingDuration
        }
      };

      socket.send(JSON.stringify(messagePacket));

      // Append optimistically to show on screen instantly
      const optimisticMsg: Message = {
        id: messagePacket.message.id,
        sender: currentUser.username,
        recipient: activeSession.recipient.username,
        encryptedContent: messagePacket.message.encryptedContent,
        timestamp: new Date().toISOString(),
        readStatus: 'sent',
        disappearingDuration
      };

      setMessages(prev => [...prev, optimisticMsg]);
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
    }
  };

  const handleSendFile = (
    fileId: string, name: string, size: number, type: string, chunksCount: number, disappearingDuration?: number
  ) => {
    if (!socket || !activeSession || !currentUser) return;

    const messagePacket = {
      type: 'message',
      message: {
        id: Math.random().toString(36).substring(2, 9),
        recipient: activeSession.recipient.username,
        encryptedContent: JSON.stringify({ iv: 'FILE_LINK', ciphertext: fileId }), // Handled separately 
        fileId,
        fileName: name,
        fileSize: size,
        fileType: type,
        chunkCount: chunksCount,
        disappearingDuration
      }
    };

    socket.send(JSON.stringify(messagePacket));

    const optimisticMsg: Message = {
      id: messagePacket.message.id,
      sender: currentUser.username,
      recipient: activeSession.recipient.username,
      encryptedContent: messagePacket.message.encryptedContent,
      timestamp: new Date().toISOString(),
      readStatus: 'sent',
      fileId,
      fileName: name,
      fileSize: size,
      fileType: type,
      chunkCount: chunksCount,
      disappearingDuration
    };

    setMessages(prev => [...prev, optimisticMsg]);
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!socket || !activeSession) return;
    
    socket.send(JSON.stringify({
      type: 'delete_message',
      messageId: msgId,
      recipient: activeSession.recipient.username
    }));

    // Local filter
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleSendTypingSignal = (isTyping: boolean) => {
    if (!socket || !activeSession) return;
    socket.send(JSON.stringify({
      type: 'typing',
      recipient: activeSession.recipient.username,
      isTyping
    }));
  };

  const handleProfileUpdated = (updates: Partial<User>) => {
    if (currentUser) {
      setCurrentUser(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // State calculations for current active recipient keys
  const [activeSharedKey, setActiveSharedKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    if (activeSession) {
      getSymmetricSharedKey(activeSession.recipient).then(key => {
        setActiveSharedKey(key);
      });
    } else {
      setActiveSharedKey(null);
    }
  }, [activeSession, privateKey]);

  return (
    <div id="app_root" className="min-h-screen bg-[#0B0E11] flex text-slate-100 font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {!currentUser ? (
          // Secure Login panel
          <motion.div 
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full"
          >
            <LoginRegister onAuthSuccess={handleAuthSuccess} />
          </motion.div>
        ) : (
          // Authenticated secure spaces
          <motion.div 
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full h-screen overflow-hidden"
          >
            {/* Split layout sidebars */}
            <div className={`h-full ${showMobileSidebar ? 'flex w-full md:w-auto shrink-0 z-20' : 'hidden md:flex shrink-0'}`}>
              <ContactSidebar
                currentUser={currentUser}
                sessions={sessions}
                activeSession={activeSession}
                onSelectSession={handleSelectSession}
                allUsers={allUsers}
                onStartNewChat={handleStartNewChat}
                onLogout={handleLogout}
                onOpenProfile={() => setIsProfileOpen(true)}
              />
            </div>

            {/* Chat Frame workspace */}
            <div className={`h-full flex-1 ${!showMobileSidebar ? 'flex w-full z-10' : 'hidden md:flex'}`}>
              {activeSession ? (
                <ChatWindow
                  currentUser={currentUser}
                  recipient={activeSession.recipient}
                  messages={messages.filter(m => 
                    (m.sender.toLowerCase() === currentUser.username.toLowerCase() && m.recipient.toLowerCase() === activeSession.recipient.username.toLowerCase()) ||
                    (m.recipient.toLowerCase() === currentUser.username.toLowerCase() && m.sender.toLowerCase() === activeSession.recipient.username.toLowerCase())
                  )}
                  sharedKey={activeSharedKey}
                  isRecipientTyping={!!activeSession.isTyping}
                  onSendMessage={handleSendMessage}
                  onSendFile={handleSendFile}
                  onDeleteMessage={handleDeleteMessage}
                  onSendTypingSignal={handleSendTypingSignal}
                  onOpenSafetyNumber={() => setIsSafetyOpen(true)}
                  onBackToSidebar={() => setShowMobileSidebar(true)}
                  onStartCall={(type) => initiateCall(activeSession.recipient, type)}
                />
              ) : (
                // Chat Default Welcome Canvas
                <div id="welcome_blank_canvas" className="flex-1 flex flex-col items-center justify-center bg-[#0B0E11] relative overflow-hidden select-none px-6">
                  {/* Backdrop elements */}
                  <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex flex-col items-center max-w-sm text-center">
                    <div className="p-4 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl mb-4 shadow-xl">
                      <MessageSquareLock className="w-10 h-10 animate-pulse" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 tracking-tight">E2EE Chat keyspace online</h2>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Select a contact from the side menu or discover new certified public key links on the directory network to begin a private end-to-end encrypted session.
                    </p>
                    
                    {/* Status metrics bar */}
                    <div className="mt-8 flex gap-4 p-3 bg-[#182229] border border-indigo-500/30 rounded-xl items-center w-full">
                      <div className="flex items-center gap-1.5 shrink-0 text-indigo-400 font-bold text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>WS SECURE</span>
                      </div>
                      <div className="h-4 w-px bg-slate-800" />
                      <div className="text-[10px] text-slate-500 text-left truncate leading-tight">
                        Authenticating as: <b className="text-slate-300 font-mono text-[11px] block">{currentUser.username}</b>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile update dialog overlay */}
            <ProfileModal
              isOpen={isProfileOpen}
              onClose={() => setIsProfileOpen(false)}
              currentUser={currentUser}
              onProfileUpdated={handleProfileUpdated}
            />

            {/* Verification of keys matching overlays */}
            {activeSession && (
              <SafetyNumberModal
                isOpen={isSafetyOpen}
                onClose={() => setIsSafetyOpen(false)}
                currentUser={currentUser}
                recipient={activeSession.recipient}
              />
            )}

            {/* Custom E2EE WebRTC Voice & Video Call Overlay */}
            {callState !== 'idle' && callPeer && (
              <CallOverlay
                status={callState}
                peer={callPeer}
                isCaller={isCallCaller}
                mediaType={callMediaType}
                localStream={localStream}
                remoteStream={remoteStream}
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                onMuteToggle={toggleMute}
                onCameraToggle={toggleCamera}
                onAnswer={acceptCall}
                onReject={rejectCall}
                onEnd={() => endCall(true)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
