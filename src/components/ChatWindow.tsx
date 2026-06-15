/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Paperclip, Send, Mic, Square, Download, Image, Video, FileText, 
  Lock, ShieldCheck, Trash2, Clock, Smile, Infinity, ChevronLeft, 
  UserCheck, Loader2, Play, Pause, Volume2, AlertCircle, Phone 
} from 'lucide-react';

import { User, Message } from '../types';
import { decryptText } from '../utils/crypto';
import { downloadAndDecryptFile, encryptAndUploadFile } from '../utils/api';

// Direct decryptor wrapper to run E2EE on client inline
function DecryptedText({ encryptedContent, sharedKey }: { encryptedContent: string; sharedKey: CryptoKey }) {
  const [text, setText] = useState<string>('🔒 Decrypting...');
  const [isFailed, setIsFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const runDecryption = async () => {
      try {
        const payload = JSON.parse(encryptedContent);
        const plaintext = await decryptText(payload, sharedKey);
        if (active) {
          setText(plaintext);
        }
      } catch (err) {
        if (active) {
          setIsFailed(true);
          setText('⚠️ Cipher key mismatch or secure block corrupted');
        }
      }
    };
    runDecryption();
    return () => { active = false; };
  }, [encryptedContent, sharedKey]);

  return (
    <span className={isFailed ? 'text-red-400 font-mono text-xs italic' : 'text-slate-100 whitespace-pre-wrap'}>
      {text}
    </span>
  );
}

// Media renderer that handles decrypt-on-request
function E2EEMediaAttachment({ 
  fileId, fileName, fileSize, fileType, chunkCount, sharedKey 
}: { 
  fileId: string; fileName: string; fileSize: number; fileType: string; chunkCount: number; sharedKey: CryptoKey 
}) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadAndDecrypt = async () => {
    if (downloading) return;
    setDownloading(true);
    setErrorMsg('');
    setProgress(1);

    try {
      const blob = await downloadAndDecryptFile(fileId, chunkCount, fileType, sharedKey, (percent) => {
        setProgress(percent);
      });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);

      // Programmatic trigger of download for standard document types or non-inline view types
      const isInlineViewable = fileType.startsWith('image/') || fileType.startsWith('video/') || fileType.startsWith('audio/');
      if (!isInlineViewable) {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      setErrorMsg('Failed downloading secure attachment chunks.');
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  const isAudio = fileType.startsWith('audio/') || fileName.endsWith('.webm');

  // If already decrypted and inline viewable
  if (blobUrl) {
    if (isImage) {
      return (
        <div className="mt-2 rounded-xl overflow-hidden border border-white/5 max-w-full">
          <img src={blobUrl} className="max-h-60 w-auto object-cover rounded-xl" alt={fileName} />
        </div>
      );
    }
    if (isVideo) {
      return (
        <div className="mt-2 rounded-xl overflow-hidden border border-[#202C33] max-w-full bg-black">
          <video src={blobUrl} controls className="max-h-60 w-full" />
        </div>
      );
    }
    if (isAudio) {
      return (
        <div className="mt-2 p-2 bg-[#202C33] border border-white/5 rounded-xl flex items-center gap-2 max-w-xs">
          <Volume2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <audio src={blobUrl} controls className="w-full h-8" />
        </div>
      );
    }
  }

  // Fallback / Pre-downloaded State view item
  return (
    <div className="mt-2 p-3 bg-[#111B21] border border-white/5 rounded-xl flex flex-col gap-2 max-w-md">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#202C33] text-indigo-400 border border-white/5 rounded-lg shrink-0">
            {isImage ? <Image className="w-5 h-5" /> : isVideo ? <Video className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-semibold text-slate-200 truncate max-w-[150px] md:max-w-[220px]">{fileName}</h5>
            <p className="text-[10px] text-gray-400 mt-0.5">{formatSize(fileSize)} • {chunkCount} E2EE crypts</p>
          </div>
        </div>

        {downloading ? (
          <div className="flex flex-col items-center gap-1">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            <span className="text-[9px] text-indigo-400 font-bold">{progress}%</span>
          </div>
        ) : (
          <button
            onClick={handleDownloadAndDecrypt}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-105 active:scale-95 rounded-lg transition-transform cursor-pointer"
            title="Download & Decrypt Attachment"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>

      {errorMsg && (
        <span className="text-[10px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {errorMsg}
        </span>
      )}
    </div>
  );
}

// Global emojis list
const EMOJIS = ['❤️', '😂', '👍', '🔥', '👏', '😍', '👋', '🎉', '💡', '🤔', '🔒', '🔐', '🤫', '👀', '😅'];

interface ChatWindowProps {
  currentUser: User;
  recipient: User;
  messages: Message[];
  sharedKey: CryptoKey | null;
  isRecipientTyping: boolean;
  onSendMessage: (text: string, disappearingDuration?: number) => void;
  onSendFile: (fileId: string, name: string, size: number, type: string, chunksCount: number, disappearingDuration?: number) => void;
  onDeleteMessage: (msgId: string) => void;
  onSendTypingSignal: (typing: boolean) => void;
  onOpenSafetyNumber: () => void;
  onBackToSidebar?: () => void;
  onStartCall?: (mediaType: 'audio' | 'video') => void;
}

export default function ChatWindow({
  currentUser,
  recipient,
  messages,
  sharedKey,
  isRecipientTyping,
  onSendMessage,
  onSendFile,
  onDeleteMessage,
  onSendTypingSignal,
  onOpenSafetyNumber,
  onBackToSidebar,
  onStartCall,
}: ChatWindowProps) {
  const [textInput, setTextInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [disappearingDuration, setDisappearingDuration] = useState<number>(0); // 0 means Off/Permanent

  // File uploading tracking states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState('');

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);

  // Drag and drop trigger overlays
  const [dragActive, setDragActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto scroll to latest message
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRecipientTyping]);

  // Audio Recording duration ticker
  useEffect(() => {
    if (isRecording) {
      durationTimerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      setRecordDuration(0);
    }
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [isRecording]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput(e.target.value);
    
    // Send typing broadcast to recipient
    onSendTypingSignal(true);
    
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      onSendTypingSignal(false);
    }, 2000);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !sharedKey) return;
    
    onSendMessage(textInput.trim(), disappearingDuration);
    setTextInput('');
    onSendTypingSignal(false);
    setShowEmojiPicker(false);
  };

  const selectEmoji = (emoji: string) => {
    setTextInput(prev => prev + emoji);
  };

  // Drag and drop attachment routing logic
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleAttachmentUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelectorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleAttachmentUpload(e.target.files[0]);
    }
  };

  // Core E2EE Chunked uploader initiator trigger
  const handleAttachmentUpload = async (file: File) => {
    if (!sharedKey) {
      setUploadError('Chat encryption keyring not synchronized.');
      return;
    }
    
    if (file.size > 1024 * 1024 * 1024) { // 1GB Maximum check
      setUploadError('File exceeds max 1GB transmission limits.');
      return;
    }

    setIsUploading(true);
    setUploadPercent(1);
    setUploadError('');

    try {
      const fileId = await encryptAndUploadFile(file, recipient.username, sharedKey, (percent) => {
        setUploadPercent(percent);
      });

      const totalChunks = Math.ceil(file.size / (1 * 1024 * 1024));
      // Broadcast E2EE file reference to recipient via WebSocket
      onSendFile(fileId, file.name, file.size, file.type, totalChunks, disappearingDuration);
    } catch (err) {
      console.error(err);
      setUploadError('E2EE file chunking failed or node declined connection.');
    } finally {
      setIsUploading(false);
    }
  };

  // Voice Note audio recorder implementation
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const voiceFile = new File([audioBlob], `VoiceNote_${Date.now()}.webm`, { type: 'audio/webm' });
        await handleAttachmentUpload(voiceFile);
        
        // Stop audio hardware recording captures
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Audio recording refused:', err);
      setUploadError('Microphone permission block or audio capture failure.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const DISAPPEARING_OPTIONS = [
    { label: 'Permanent', value: 0 },
    { label: '10 seconds', value: 10 },
    { label: '1 minute', value: 60 },
    { label: '5 minutes', value: 300 },
    { label: '1 hour', value: 3600 },
    { label: '1 day', value: 86400 }
  ];

  return (
    <div id="chat_window" 
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full bg-[#0B0E11] border-r border-white/5 relative"
    >
      {/* File dragging overlay highlight drop target */}
      {dragActive && (
        <div id="drag_backdrop" className="absolute inset-0 bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-500 z-40 flex items-center justify-center">
          <div className="p-6 bg-[#111B21] border border-white/5 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
            <Paperclip className="w-8 h-8 text-indigo-400 animate-bounce" />
            <h3 className="text-sm font-semibold text-slate-100">Drop files ready for E2EE delivery</h3>
            <p className="text-xs text-gray-400">Up to 1GB - Encrypted entirely inside your browser</p>
          </div>
        </div>
      )}

      {/* Upload/E2EE Loading status bar */}
      {isUploading && (
        <div className="absolute top-0 inset-x-0 h-1.5 bg-[#202C33] z-50 overflow-hidden">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300" 
            style={{ width: `${uploadPercent}%` }}
          />
          <div className="absolute right-3 top-3.5 bg-[#111B21] border border-white/5 px-3 py-1.5 rounded-lg text-[10px] text-indigo-400 font-bold z-50 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Chunk E2EE Packing {uploadPercent}%
          </div>
        </div>
      )}

      {/* Top chat view controller header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#202C33] z-30 select-none">
        <div className="flex items-center gap-3">
          {onBackToSidebar && (
            <button 
              onClick={onBackToSidebar} 
              className="p-1.5 hover:bg-[#2A3942] text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div className="relative shrink-0">
            <img
              src={recipient.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
              className="w-10 h-10 rounded-full object-cover border border-slate-850"
              alt={recipient.username}
              referrerPolicy="no-referrer"
            />
            {recipient.isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#202C33]"></span>
            )}
          </div>

          <div>
            <h3 className="text-slate-100 font-semibold text-sm leading-none flex items-center gap-2">
              {recipient.username}
              <span className="text-[10px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 font-bold px-1.5 rounded">E2E Connected</span>
            </h3>
            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[150px] md:max-w-xs">
              {recipient.statusMessage || ' Hey there! encryption active.'}
            </p>
          </div>
        </div>

        {/* Action Header controls */}
        <div className="flex items-center gap-1.5">
          {/* Disappearing timer indicator toggle */}
          <div className="relative">
            <button
              onClick={() => setShowDisappearingMenu(!showDisappearingMenu)}
              className={`p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-[#2A3942] transition-colors flex items-center gap-1 cursor-pointer ${disappearingDuration > 0 ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' : ''}`}
              title="Disappearing Messages"
            >
              <Clock className="w-4.5 h-4.5" />
              {disappearingDuration > 0 && <span className="text-[10px] font-bold">{DISAPPEARING_OPTIONS.find(o => o.value === disappearingDuration)?.label.split(' ')[0]}</span>}
            </button>

            <AnimatePresence>
              {showDisappearingMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-[#111B21] border border-white/5 rounded-xl shadow-2xl overflow-hidden z-50 p-2"
                >
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2.5 py-1.5 border-b border-white/5">
                    Disappearing duration
                  </h4>
                  {DISAPPEARING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setDisappearingDuration(opt.value);
                        setShowDisappearingMenu(false);
                      }}
                      className={`w-full text-left text-xs px-2.5 py-2 hover:bg-[#202C33] rounded-lg transition-colors flex items-center justify-between cursor-pointer ${disappearingDuration === opt.value ? 'text-indigo-400 font-semibold bg-indigo-500/5' : 'text-slate-400'}`}
                    >
                      {opt.label}
                      {opt.value === 0 ? <Infinity className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {onStartCall && (
            <>
              {/* Voice Call */}
              <button
                id="initiate_voice_call_btn"
                onClick={() => onStartCall('audio')}
                className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-[#2A3942] transition-colors cursor-pointer"
                title="Secure E2EE Voice Call"
              >
                <Phone className="w-4.5 h-4.5" />
              </button>

              {/* Video Call */}
              <button
                id="initiate_video_call_btn"
                onClick={() => onStartCall('video')}
                className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-[#2A3942] transition-colors cursor-pointer"
                title="Secure E2EE Video Call"
              >
                <Video className="w-4.5 h-4.5" />
              </button>
            </>
          )}

          <button
            onClick={onOpenSafetyNumber}
            className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-[#2A3942] transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Verify Safety Number Fingerprint"
          >
            <UserCheck className="w-4.5 h-4.5" />
            <span className="hidden md:inline">Verify safety</span>
          </button>
        </div>
      </div>

      {/* Main chat scrolling feed container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* System notice panel */}
        <div className="flex justify-center p-2">
          <div className="bg-[#182229] border border-indigo-500/30 rounded-lg px-4 py-2.5 max-w-md text-center">
            <p className="text-[11px] text-indigo-300 leading-relaxed font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0 font-bold" /> End-to-end encrypted with X25519
            </p>
          </div>
        </div>

        {uploadError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 text-center flex items-center justify-center gap-2 max-w-sm mx-auto">
            <AlertCircle className="w-4 h-4" /> {uploadError}
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender.toLowerCase() === currentUser.username.toLowerCase();
          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
            >
              {/* Message Bubble wrapper */}
              <div className={`max-w-[80%] md:max-w-[70%] p-4 rounded-2xl relative group shadow-lg ${
                isOwn 
                  ? 'bg-indigo-600/90 text-white rounded-br-none' 
                  : 'bg-[#202C33] text-white rounded-bl-none'
              }`}>
                {/* Peer Tag handle if requested */}
                {!isOwn && (
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">
                    {msg.sender}
                  </span>
                )}

                {/* E2EE Payload Contents */}
                {sharedKey ? (
                  msg.fileId ? (
                    <E2EEMediaAttachment 
                      fileId={msg.fileId} 
                      fileName={msg.fileName || 'Attachment'} 
                      fileType={msg.fileType || ''} 
                      fileSize={msg.fileSize || 0}
                      chunkCount={msg.chunkCount || 1} 
                      sharedKey={sharedKey} 
                    />
                  ) : (
                    <p className="text-sm">
                      <DecryptedText encryptedContent={msg.encryptedContent} sharedKey={sharedKey} />
                    </p>
                  )
                ) : (
                  <p className="text-xs text-slate-600 italic">🔐 Communication keychain missing</p>
                )}

                {/* Bubble Footer metrics */}
                <div className="flex items-center justify-end gap-1.5 mt-2 select-none">
                  {msg.disappearingDuration ? (
                    <Clock title="Disappearing timer active" className={`w-3 h-3 shrink-0 ${isOwn ? 'text-indigo-200' : 'text-indigo-400'}`} />
                  ) : null}
                  
                  <span className={`text-[9px] font-mono ${isOwn ? 'text-indigo-200' : 'text-gray-505 text-gray-500'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Message destruction action */}
                  <button
                    onClick={() => onDeleteMessage(msg.id)}
                    className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity cursor-pointer delay-75 ${isOwn ? 'text-indigo-200 hover:text-red-300' : 'text-slate-500 hover:text-red-400'}`}
                    title="Delete Message"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Recipient writing typing loader indicator */}
        {isRecipientTyping && (
          <div className="flex justify-start">
            <div className="bg-[#202C33] border border-white/5 p-3 rounded-2xl rounded-tl-sm text-xs text-indigo-400 font-medium italic animate-pulse flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-100"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-200"></span>
              <span>Secure connection writing...</span>
            </div>
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* Floating Emojis drawer overlay panel */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="absolute bottom-24 left-4 bg-[#111B21] border border-white/5 rounded-2xl shadow-2xl p-3 z-40 max-w-sm"
          >
            <div className="grid grid-cols-5 gap-2.5">
              {EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => selectEmoji(em)}
                  className="p-2 hover:bg-[#202C33] rounded-xl text-lg hover:scale-115 active:scale-95 transition-all text-center cursor-pointer"
                  type="button"
                >
                  {em}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom active chat controller messaging footer form input */}
      <div className="p-4 border-t border-white/5 bg-[#202C33] z-30 select-none">
        {isRecording ? (
          // Audio Voice Recording Interface Mode
          <div className="flex items-center justify-between p-2 bg-red-500/10 border border-red-500/25 rounded-2xl">
            <div className="flex items-center gap-3 px-3">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0"></span>
              <span className="text-xs text-red-400 font-bold uppercase tracking-wider">Audio capture dynamic Web:</span>
              <span className="text-sm font-mono text-slate-100">{formatTime(recordDuration)}</span>
            </div>
            <button
              onClick={stopVoiceRecording}
              className="p-3 bg-red-500 hover:bg-red-400 text-slate-950 font-bold hover:scale-[1.03] active:scale-95 rounded-xl transition-all flex items-center gap-1.5 text-xs uppercase tracking-wider shrink-0 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-slate-950" /> Send voice record
            </button>
          </div>
        ) : (
          // Standard Message inputs
          <form onSubmit={handleSendText} className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-3 bg-[#2A3942] text-slate-400 hover:text-indigo-400 hover:scale-105 active:scale-95 rounded-2xl transition-all shrink-0 cursor-pointer outline-none ${showEmojiPicker ? 'text-indigo-400' : ''}`}
              title="Emoji Palette"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-[#2A3942] text-slate-400 hover:text-indigo-400 hover:scale-105 active:scale-95 rounded-2xl transition-all shrink-0 cursor-pointer outline-none"
              title="Upload file (Up to 1GB E2EE)"
            >
              <Paperclip className="w-5 h-5" />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelectorChange}
              />
            </button>

            <input
              id="chat_message_input"
              type="text"
              value={textInput}
              onChange={handleInputChange}
              placeholder="Send E2EE message..."
              disabled={!sharedKey}
              className="flex-1 bg-[#2A3942] text-sm text-slate-100 rounded-2xl py-3.5 px-5 outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors disabled:opacity-40"
            />

            {textInput.trim() ? (
              <button
                id="send_message_btn"
                type="submit"
                disabled={!sharedKey}
                className="p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-105 active:scale-95 rounded-2xl transition-all shrink-0 cursor-pointer outline-none shadow-md disabled:opacity-40"
              >
                <Send className="w-4.5 h-4.5 fill-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startVoiceRecording}
                disabled={!sharedKey}
                className="p-3 bg-[#2A3942] text-slate-400 hover:text-indigo-400 hover:scale-105 active:scale-95 rounded-2xl transition-all shrink-0 cursor-pointer outline-none disabled:opacity-40"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
