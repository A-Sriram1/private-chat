/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Paperclip, Send, Mic, Square, Download, Image, Video, FileText, 
  Lock, ShieldCheck, Trash2, Clock, Smile, Infinity, ChevronLeft, 
  UserCheck, Loader2, Volume2, AlertCircle, Phone, Reply,
  CheckCheck, Check, X, VideoIcon
} from 'lucide-react';

import { User, Message } from '../types';
import { decryptText } from '../utils/crypto';
import { downloadAndDecryptFile, encryptAndUploadFile } from '../utils/api';

// ── Decryption wrapper ────────────────────────────────────────────────────────
function DecryptedText({ encryptedContent, sharedKey }: { encryptedContent: string; sharedKey: CryptoKey }) {
  const [text, setText] = useState<string>('');
  const [isFailed, setIsFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = JSON.parse(encryptedContent);
        const plaintext = await decryptText(payload, sharedKey);
        if (active) setText(plaintext);
      } catch {
        if (active) { setIsFailed(true); setText('⚠️ Decryption failed'); }
      }
    })();
    return () => { active = false; };
  }, [encryptedContent, sharedKey]);

  if (!text && !isFailed) return <span className="inline-flex items-center gap-1 text-slate-500 text-xs"><Loader2 className="w-3 h-3 animate-spin" /></span>;

  return (
    <span className={isFailed ? 'text-red-400 font-mono text-xs italic' : 'text-slate-100 whitespace-pre-wrap break-words'}>
      {text}
    </span>
  );
}

// ── E2EE Media Attachment ────────────────────────────────────────────────────
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

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true); setErrorMsg(''); setProgress(1);
    try {
      const blob = await downloadAndDecryptFile(fileId, chunkCount, fileType, sharedKey, setProgress);
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      const isInline = fileType.startsWith('image/') || fileType.startsWith('video/') || fileType.startsWith('audio/');
      if (!isInline) {
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } catch (err: any) {
      setErrorMsg('Download failed. Please try again.');
    } finally { setDownloading(false); }
  };

  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  const isAudio = fileType.startsWith('audio/') || fileName.endsWith('.webm');

  if (blobUrl) {
    if (isImage) return <div className="mt-1 rounded-xl overflow-hidden max-w-xs border border-white/10"><img src={blobUrl} className="max-h-64 w-auto object-cover rounded-xl" alt={fileName} /></div>;
    if (isVideo) return <div className="mt-1 rounded-xl overflow-hidden max-w-xs bg-black border border-white/10"><video src={blobUrl} controls className="max-h-64 w-full" /></div>;
    if (isAudio) return <div className="mt-1 p-2 bg-[#1a2730] border border-white/10 rounded-xl flex items-center gap-2 max-w-xs"><Volume2 className="w-4 h-4 text-emerald-400 shrink-0" /><audio src={blobUrl} controls className="w-full h-8" /></div>;
  }

  return (
    <div className="mt-1 p-3 bg-[#1a2730] border border-white/10 rounded-xl max-w-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#202C33] text-emerald-400 rounded-lg shrink-0">
            {isImage ? <Image className="w-5 h-5" /> : isVideo ? <Video className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">{fileName}</p>
            <p className="text-[10px] text-slate-500">{formatSize(fileSize)}</p>
          </div>
        </div>
        {downloading ? (
          <div className="flex flex-col items-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /><span className="text-[9px] text-emerald-400 mt-0.5">{progress}%</span></div>
        ) : (
          <button onClick={handleDownload} className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all hover:scale-105" title="Download & Decrypt">
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
      {errorMsg && <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errorMsg}</p>}
    </div>
  );
}

// ── Emoji quick-reactions bar ────────────────────────────────────────────────
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EMOJI_PICKER_LIST = ['❤️','😂','👍','🔥','👏','😍','👋','🎉','💡','🤔','🙏','😮','😢','😅','💪','🎯','✅','🚀','🔒','🤫'];

// ── Types ───────────────────────────────────────────────────────────────────
interface ChatWindowProps {
  currentUser: User;
  recipient: User;
  messages: Message[];
  sharedKey: CryptoKey | null;
  isRecipientTyping: boolean;
  onSendMessage: (text: string, disappearingDuration?: number, replyToId?: string) => void;
  onSendFile: (fileId: string, name: string, size: number, type: string, chunksCount: number, disappearingDuration?: number) => void;
  onDeleteMessage: (msgId: string) => void;
  onReactToMessage: (msgId: string, emoji: string) => void;
  onSendTypingSignal: (typing: boolean) => void;
  onOpenSafetyNumber: () => void;
  onBackToSidebar?: () => void;
  onStartCall?: (mediaType: 'audio' | 'video') => void;
}

// ── Disappearing options ─────────────────────────────────────────────────────
const DISAPPEARING_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '10 sec', value: 10 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '1 hour', value: 3600 },
  { label: '1 day', value: 86400 },
];

// ── Main Component ───────────────────────────────────────────────────────────
export default function ChatWindow({
  currentUser, recipient, messages, sharedKey, isRecipientTyping,
  onSendMessage, onSendFile, onDeleteMessage, onReactToMessage,
  onSendTypingSignal, onOpenSafetyNumber, onBackToSidebar, onStartCall,
}: ChatWindowProps) {
  const [textInput, setTextInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [disappearingDuration, setDisappearingDuration] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null); // msgId

  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isRecipientTyping]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      durationTimerRef.current = setInterval(() => setRecordDuration(p => p + 1), 1000);
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      setRecordDuration(0);
    }
    return () => { if (durationTimerRef.current) clearInterval(durationTimerRef.current); };
  }, [isRecording]);

  // Close pickers on outside click
  useEffect(() => {
    const handler = () => { setShowEmojiPicker(false); setShowDisappearingMenu(false); setShowReactionPicker(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput(e.target.value);
    onSendTypingSignal(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => onSendTypingSignal(false), 2000);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !sharedKey) return;
    onSendMessage(textInput.trim(), disappearingDuration, replyTo?.id);
    setTextInput('');
    setReplyTo(null);
    onSendTypingSignal(false);
    setShowEmojiPicker(false);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) await handleAttachmentUpload(e.dataTransfer.files[0]);
  };
  const handleFileSelectorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) await handleAttachmentUpload(e.target.files[0]);
  };

  const handleAttachmentUpload = async (file: File) => {
    if (!sharedKey) { setUploadError('Encryption key not ready.'); return; }
    if (file.size > 1024 * 1024 * 1024) { setUploadError('File exceeds 1GB limit.'); return; }
    setIsUploading(true); setUploadPercent(1); setUploadError('');
    try {
      const fileId = await encryptAndUploadFile(file, recipient.username, sharedKey, setUploadPercent);
      const totalChunks = Math.ceil(file.size / (1 * 1024 * 1024));
      onSendFile(fileId, file.name, file.size, file.type, totalChunks, disappearingDuration);
    } catch { setUploadError('Upload failed. Please try again.'); }
    finally { setIsUploading(false); }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data?.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAttachmentUpload(new File([blob], `Voice_${Date.now()}.webm`, { type: 'audio/webm' }));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      setIsRecording(true);
    } catch { setUploadError('Microphone permission denied.'); }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const getReplyPreview = (id: string) => messages.find(m => m.id === id);

  return (
    <div
      id="chat_window"
      onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
      className="flex-1 flex flex-col h-full bg-[#0B141A] relative"
      style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(37,99,235,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.03) 0%, transparent 50%)' }}
    >
      {/* Drag overlay */}
      {dragActive && (
        <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-sm border-2 border-dashed border-emerald-500 z-50 flex items-center justify-center">
          <div className="bg-[#111B21] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
            <Paperclip className="w-8 h-8 text-emerald-400 animate-bounce" />
            <p className="text-sm font-semibold text-slate-100">Drop to send (E2EE encrypted)</p>
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {isUploading && (
        <div className="absolute top-0 inset-x-0 h-1 bg-[#202C33] z-40">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${uploadPercent}%` }} />
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-[#202C33] z-30 select-none">
        <div className="flex items-center gap-3">
          {onBackToSidebar && (
            <button onClick={onBackToSidebar} className="p-1.5 hover:bg-[#2A3942] text-slate-400 rounded-lg cursor-pointer">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="relative shrink-0">
            <img
              src={recipient.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
              className="w-10 h-10 rounded-full object-cover"
              alt={recipient.username} referrerPolicy="no-referrer"
            />
            {recipient.isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#202C33]" />}
          </div>
          <div>
            <h3 className="text-slate-100 font-semibold text-sm leading-none">{recipient.username}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isRecipientTyping
                ? <span className="text-emerald-400 font-medium">typing...</span>
                : recipient.isOnline ? 'online' : (recipient.lastSeen ? `last seen ${new Date(recipient.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'offline')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onStartCall && (
            <>
              <button onClick={() => onStartCall('audio')} className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-[#2A3942] transition-colors cursor-pointer" title="Voice Call">
                <Phone className="w-5 h-5" />
              </button>
              <button onClick={() => onStartCall('video')} className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-[#2A3942] transition-colors cursor-pointer" title="Video Call">
                <VideoIcon className="w-5 h-5" />
              </button>
            </>
          )}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setShowDisappearingMenu(p => !p); setShowEmojiPicker(false); }}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${disappearingDuration > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-[#2A3942]'}`}
              title="Disappearing messages"
            >
              <Clock className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showDisappearingMenu && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 mt-2 w-40 bg-[#233138] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-3 py-2 border-b border-white/5">Auto-delete</p>
                  {DISAPPEARING_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => { setDisappearingDuration(o.value); setShowDisappearingMenu(false); }}
                      className={`w-full text-left text-xs px-3 py-2.5 hover:bg-white/5 flex items-center justify-between cursor-pointer ${disappearingDuration === o.value ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
                      {o.label}
                      {o.value === 0 ? <Infinity className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={onOpenSafetyNumber} className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#2A3942] transition-colors cursor-pointer" title="Verify">
            <ShieldCheck className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Messages feed ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {/* E2EE notice */}
        <div className="flex justify-center mb-4">
          <div className="bg-[#182229]/80 border border-emerald-500/20 rounded-xl px-4 py-2 text-center max-w-xs">
            <p className="text-[11px] text-emerald-400/80 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" /> Messages are end-to-end encrypted
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
          const replyMsg = msg.replyToId ? getReplyPreview(msg.replyToId) : null;
          const totalReactions = msg.reactions ? Object.entries(msg.reactions) : [];

          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative`}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => { setHoveredMsgId(null); }}
            >
              {/* Avatar for received messages */}
              {!isOwn && (
                <img
                  src={recipient.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                  className="w-7 h-7 rounded-full object-cover shrink-0 mt-auto mr-2 mb-5"
                  alt="" referrerPolicy="no-referrer"
                />
              )}

              <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[78%] md:max-w-[65%]`}>
                {/* Hover action bar */}
                <AnimatePresence>
                  {hoveredMsgId === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`flex items-center gap-1 mb-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* React button */}
                      <div className="relative">
                        <button
                          onClick={() => setShowReactionPicker(p => p === msg.id ? null : msg.id)}
                          className="p-1.5 bg-[#233138] border border-white/10 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-[#2A3942] cursor-pointer text-xs"
                          title="React"
                        >
                          <Smile className="w-3.5 h-3.5" />
                        </button>
                        <AnimatePresence>
                          {showReactionPicker === msg.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8, y: 5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className={`absolute bottom-8 ${isOwn ? 'right-0' : 'left-0'} bg-[#233138] border border-white/10 rounded-2xl p-1.5 flex gap-1 shadow-2xl z-50`}
                            >
                              {QUICK_REACTIONS.map(em => (
                                <button key={em}
                                  onClick={() => { onReactToMessage(msg.id, em); setShowReactionPicker(null); }}
                                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl text-lg cursor-pointer transition-transform hover:scale-125"
                                >
                                  {em}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      {/* Reply */}
                      <button
                        onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                        className="p-1.5 bg-[#233138] border border-white/10 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-[#2A3942] cursor-pointer"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => onDeleteMessage(msg.id)}
                        className="p-1.5 bg-[#233138] border border-white/10 rounded-lg text-slate-400 hover:text-red-400 hover:bg-[#2A3942] cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bubble */}
                <div className={`px-3 py-2.5 rounded-2xl shadow relative ${isOwn ? 'bg-[#005C4B] rounded-tr-sm' : 'bg-[#202C33] rounded-tl-sm'}`}>
                  {/* Reply preview */}
                  {replyMsg && (
                    <div className={`mb-2 px-2 py-1.5 rounded-xl border-l-4 ${isOwn ? 'border-emerald-400/60 bg-[#004035]' : 'border-slate-400/40 bg-[#1a2730]'}`}>
                      <p className="text-[10px] text-slate-400 font-semibold mb-0.5">{replyMsg.sender}</p>
                      {sharedKey && !replyMsg.fileId ? (
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">
                          <DecryptedText encryptedContent={replyMsg.encryptedContent} sharedKey={sharedKey} />
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 italic">📁 Attachment</p>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  {sharedKey ? (
                    msg.fileId ? (
                      <E2EEMediaAttachment fileId={msg.fileId} fileName={msg.fileName || 'file'} fileType={msg.fileType || ''} fileSize={msg.fileSize || 0} chunkCount={msg.chunkCount || 1} sharedKey={sharedKey} />
                    ) : (
                      <p className="text-sm leading-relaxed">
                        <DecryptedText encryptedContent={msg.encryptedContent} sharedKey={sharedKey} />
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-slate-600 italic">🔐 Keychain missing</p>
                  )}

                  {/* Timestamp + ticks */}
                  <div className={`flex items-center gap-1 justify-end mt-1 select-none`}>
                    {msg.disappearingDuration ? <Clock className={`w-2.5 h-2.5 ${isOwn ? 'text-emerald-300/60' : 'text-slate-500'}`} /> : null}
                    <span className={`text-[10px] font-mono ${isOwn ? 'text-emerald-200/60' : 'text-slate-500'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isOwn && (
                      msg.readStatus === 'read'
                        ? <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                        : msg.readStatus === 'delivered'
                          ? <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
                          : <Check className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Reactions row */}
                {totalReactions.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {totalReactions.map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => onReactToMessage(msg.id, emoji)}
                        className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border cursor-pointer transition-all hover:scale-110 ${
                          users.includes(currentUser.username)
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-[#202C33] border-white/10 text-slate-300'
                        }`}
                        title={users.join(', ')}
                      >
                        {emoji} <span className="text-[10px] ml-0.5">{users.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isRecipientTyping && (
          <div className="flex items-end gap-2">
            <img src={recipient.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
              className="w-7 h-7 rounded-full object-cover shrink-0" alt="" referrerPolicy="no-referrer" />
            <div className="bg-[#202C33] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* ── Reply preview bar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {replyTo && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-[#1a2730] px-4 py-2 flex items-center gap-3">
            <div className="flex-1 border-l-4 border-emerald-500 pl-2">
              <p className="text-[10px] text-emerald-400 font-semibold">{replyTo.sender}</p>
              {sharedKey && !replyTo.fileId ? (
                <p className="text-xs text-slate-400 truncate max-w-xs">
                  <DecryptedText encryptedContent={replyTo.encryptedContent} sharedKey={sharedKey} />
                </p>
              ) : <p className="text-xs text-slate-500 italic">📁 Attachment</p>}
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Emoji picker ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="absolute bottom-20 left-4 bg-[#233138] border border-white/10 rounded-2xl shadow-2xl p-3 z-40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-5 gap-1.5">
              {EMOJI_PICKER_LIST.map(em => (
                <button key={em} onClick={() => setTextInput(p => p + em)}
                  className="p-2 hover:bg-white/10 rounded-xl text-lg hover:scale-125 active:scale-95 transition-all cursor-pointer">
                  {em}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input footer ───────────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-white/5 bg-[#202C33] z-30">
        {isRecording ? (
          <div className="flex items-center justify-between p-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <div className="flex items-center gap-3 px-2">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-400 font-bold">Recording</span>
              <span className="text-sm font-mono text-slate-100">{fmt(recordDuration)}</span>
            </div>
            <button onClick={stopVoiceRecording} className="px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <Square className="w-3.5 h-3.5 fill-white" /> Send
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendText} className="flex items-center gap-2">
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(p => !p); setShowDisappearingMenu(false); }}
              className="p-2.5 bg-[#2A3942] text-slate-400 hover:text-yellow-400 rounded-xl transition-all cursor-pointer shrink-0">
              <Smile className="w-5 h-5" />
            </button>

            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="p-2.5 bg-[#2A3942] text-slate-400 hover:text-emerald-400 rounded-xl transition-all cursor-pointer shrink-0">
              <Paperclip className="w-5 h-5" />
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelectorChange} />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={textInput}
              onChange={handleInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { handleSendText(e as any); } }}
              placeholder={sharedKey ? "Type a message..." : "Connecting..."}
              disabled={!sharedKey}
              className="flex-1 bg-[#2A3942] text-sm text-slate-100 rounded-2xl py-3 px-4 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500/50 transition-colors disabled:opacity-40"
            />

            {textInput.trim() ? (
              <button type="submit" disabled={!sharedKey}
                className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-all hover:scale-105 cursor-pointer shrink-0 disabled:opacity-40 shadow-lg">
                <Send className="w-4.5 h-4.5" />
              </button>
            ) : (
              <button type="button" onClick={startVoiceRecording} disabled={!sharedKey}
                className="p-2.5 bg-[#2A3942] text-slate-400 hover:text-emerald-400 rounded-xl transition-all cursor-pointer shrink-0 disabled:opacity-40">
                <Mic className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
