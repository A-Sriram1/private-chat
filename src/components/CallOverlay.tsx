/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Volume2, Loader2, ShieldCheck, Lock
} from 'lucide-react';
import { User } from '../types';

interface CallOverlayProps {
  status: 'dialing' | 'incoming' | 'active' | 'ended';
  peer: User;
  isCaller: boolean;
  mediaType: 'audio' | 'video';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  onMuteToggle: () => void;
  onCameraToggle: () => void;
  onAnswer: () => void;
  onReject: () => void;
  onEnd: () => void;
}

const WebRTCVideo = ({ stream, isLocal }: { stream: MediaStream | null; isLocal?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  if (!stream) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#111B21]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }
  return (
    <video
      id={isLocal ? 'local_video_stream' : 'remote_video_stream'}
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      className="w-full h-full object-cover bg-black"
    />
  );
};

export default function CallOverlay({
  status, peer, isCaller, mediaType,
  localStream, remoteStream,
  isMuted, isCameraOff,
  onMuteToggle, onCameraToggle,
  onAnswer, onReject, onEnd,
}: CallOverlayProps) {
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (status === 'active') {
      setCallDuration(0);
      timer = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [status]);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const AVATAR = peer.profilePic ||
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

  return (
    <motion.div
      id="secure_call_overlay"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex flex-col font-sans overflow-hidden select-none safe-x"
      style={{
        background:
          mediaType === 'video' && status === 'active'
            ? '#000'
            : 'linear-gradient(160deg,#0d1b22 0%,#0b141a 60%,#0d2137 100%)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5 pb-3 shrink-0 safe-top">
        <div className="flex items-center gap-2 text-emerald-400/80 text-xs font-semibold tracking-widest uppercase">
          <Lock className="w-3.5 h-3.5" />
          <span>End-to-End Encrypted</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full font-semibold">
          <ShieldCheck className="w-3 h-3" /> Peer-to-Peer
        </div>
      </div>

      {/* Main stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 px-4">

        {/* Dialing / Incoming */}
        {(status === 'dialing' || status === 'incoming') && (
          <div className="flex flex-col items-center text-center gap-6">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-32 h-32 sm:w-44 sm:h-44 rounded-full bg-emerald-500/10 animate-ping" />
              <span className="absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-emerald-500/15 animate-pulse" />
              <img src={AVATAR} alt={peer.username} referrerPolicy="no-referrer"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-emerald-500/60 shadow-2xl relative z-10" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{peer.username}</h2>
              <p className="text-sm text-emerald-400 font-medium mt-2 animate-pulse">
                {status === 'dialing'
                  ? `${mediaType === 'video' ? 'Video' : 'Voice'} calling...`
                  : `Incoming ${mediaType === 'video' ? 'video' : 'voice'} call`}
              </p>
            </div>
          </div>
        )}

        {/* Active — video */}
        {status === 'active' && mediaType === 'video' && (
          <div className="w-full h-full absolute inset-0 overflow-hidden">
            <div className="w-full h-full">
              {remoteStream
                ? <WebRTCVideo stream={remoteStream} isLocal={false} />
                : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#111B21] gap-3">
                    <img src={AVATAR} alt={peer.username} referrerPolicy="no-referrer"
                      className="w-24 h-24 rounded-full object-cover border-2 border-white/20" />
                    <p className="text-slate-400 text-sm">{peer.username}</p>
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  </div>
                )}
            </div>
            {/* Local PIP */}
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-24 h-32 sm:w-32 sm:h-44 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black z-20">
              {isCameraOff
                ? <div className="w-full h-full bg-[#202C33] flex flex-col items-center justify-center gap-1">
                    <VideoOff className="w-5 h-5 text-slate-400" />
                    <span className="text-[10px] text-slate-500">Camera off</span>
                  </div>
                : <WebRTCVideo stream={localStream} isLocal />}
            </div>
            {/* Duration */}
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-mono text-white flex items-center gap-1.5 z-20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {fmt(callDuration)}
            </div>
          </div>
        )}

        {/* Active — audio */}
        {status === 'active' && mediaType === 'audio' && (
          <div className="flex flex-col items-center text-center gap-6">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-pulse scale-125" />
              <img src={AVATAR} alt={peer.username} referrerPolicy="no-referrer"
                className="w-28 h-28 rounded-full object-cover border-2 border-emerald-500/50 relative z-10 shadow-2xl" />
              <div className="absolute -bottom-1 -right-1 bg-emerald-600 p-2 rounded-full border-2 border-[#0b141a] z-20">
                <Volume2 className="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{peer.username}</h2>
              <p className="text-xs text-emerald-400 font-semibold mt-1 uppercase tracking-widest">Voice call active</p>
              <p className="text-lg font-mono text-slate-300 mt-3 flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {fmt(callDuration)}
              </p>
            </div>
          </div>
        )}

        {/* Ended */}
        {status === 'ended' && (
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
              <PhoneOff className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Call ended</h2>
              <p className="text-xs text-slate-500 mt-1">Secure connection closed</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls footer */}
      <div className="shrink-0 flex flex-col items-center gap-3 sm:gap-4 pb-8 sm:pb-14 pt-4 px-4 sm:px-6 safe-bottom">

        {/* Incoming: accept + reject */}
        {status === 'incoming' && (
          <div className="flex items-center justify-center gap-12 sm:gap-20">
            <div className="flex flex-col items-center gap-2">
              <button id="reject_call_btn" onClick={onReject}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-xl active:scale-95 transition-all cursor-pointer border border-red-400/20">
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <span className="text-[11px] text-slate-400">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button id="accept_call_btn" onClick={onAnswer}
                className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center shadow-xl active:scale-95 transition-all cursor-pointer border border-emerald-400/20 animate-bounce">
                <Phone className="w-6 h-6 text-white" />
              </button>
              <span className="text-[11px] text-slate-400">Accept</span>
            </div>
          </div>
        )}

        {/* Dialing: cancel */}
        {status === 'dialing' && (
          <div className="flex flex-col items-center gap-2">
            <button id="cancel_dialing_btn" onClick={onEnd}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-xl active:scale-95 transition-all cursor-pointer">
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
            <span className="text-[11px] text-slate-400">Cancel</span>
          </div>
        )}

        {/* Active: controls */}
        {status === 'active' && (
          <div className="flex items-end justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <button id="toggle_mute_btn" onClick={onMuteToggle}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg cursor-pointer border ${
                  isMuted
                    ? 'bg-white text-slate-900 border-white/30'
                    : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
                }`}>
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <span className="text-[11px] text-slate-400">{isMuted ? 'Unmute' : 'Mute'}</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button id="end_active_call_btn" onClick={onEnd}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-2xl active:scale-95 transition-all cursor-pointer border border-red-400/20">
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <span className="text-[11px] text-slate-400">End call</span>
            </div>

            {mediaType === 'video' && (
              <div className="flex flex-col items-center gap-2">
                <button id="toggle_camera_btn" onClick={onCameraToggle}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg cursor-pointer border ${
                    isCameraOff
                      ? 'bg-white text-slate-900 border-white/30'
                      : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
                  }`}>
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
                <span className="text-[11px] text-slate-400">Camera</span>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-600 flex items-center gap-1.5 mt-1 select-none">
          <ShieldCheck className="w-3 h-3 text-emerald-700 shrink-0" />
          DTLS-SRTP encrypted · peer-to-peer WebRTC
        </p>
      </div>
    </motion.div>
  );
}
