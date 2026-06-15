/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, 
  Volume2, Loader2, ShieldCheck, Lock, Maximize2 
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
      <div className="absolute inset-0 flex items-center justify-center bg-[#111B21] border border-white/5 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <video
      id={isLocal ? "local_video_stream" : "remote_video_stream"}
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal} // Always mute local video to prevent audio feedback loop
      className="w-full h-full object-cover rounded-2xl bg-black"
    />
  );
};

export default function CallOverlay({
  status,
  peer,
  isCaller,
  mediaType,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  onMuteToggle,
  onCameraToggle,
  onAnswer,
  onReject,
  onEnd,
}: CallOverlayProps) {
  const [callDuration, setCallDuration] = useState(0);

  // Call duration counter for active calls
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (status === 'active') {
      setCallDuration(0);
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const ringSoundRef = useRef<HTMLAudioElement | null>(null);

  // Play browser-synthesized sounds or local indicators if desired (optional)

  return (
    <div 
      id="secure_call_overlay" 
      className="fixed inset-0 bg-[#0B0E11]/95 text-slate-100 flex flex-col items-center justify-between p-6 z-50 font-sans"
    >
      {/* Encryption Header indicator */}
      <div className="w-full max-w-lg flex items-center justify-between border-b border-white/5 pb-4 mt-4 select-none">
        <div className="flex items-center gap-2 text-indigo-400 font-bold tracking-widest text-[11px] uppercase">
          <Lock className="w-4 h-4" />
          <span>E2EE Peer WebRTC</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-505 border-emerald-500/20 rounded-full font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" /> Peer-to-Peer
        </div>
      </div>

      {/* Main Calling stage */}
      <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center my-6 relative min-h-0">
        
        {/* State 1 & 2: Dialing & Incoming Call screens */}
        {(status === 'dialing' || status === 'incoming') && (
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              {/* Outer pulsing ring elements */}
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping duration-1000 scale-150" />
              <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-pulse duration-1500 scale-125" />
              
              <img 
                src={peer.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
                className="w-28 h-28 rounded-full object-cover border-4 border-indigo-500 relative z-10 shadow-2xl" 
                alt={peer.username}
                referrerPolicy="no-referrer"
              />
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-100">
                {peer.username}
              </h2>
              <p className="text-sm text-indigo-400 font-semibold animate-pulse mt-2 uppercase tracking-wide">
                {status === 'dialing' 
                  ? `Dialing ${mediaType === 'video' ? 'Video' : 'Voice'}...` 
                  : `Incoming ${mediaType === 'video' ? 'Video' : 'Voice'} Call`}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Establish direct secure signaling tunnel
              </p>
            </div>
          </div>
        )}

        {/* State 3: Active Call UI Stage */}
        {status === 'active' && (
          <div className="w-full h-full flex flex-col md:flex-row items-center justify-center relative rounded-2xl overflow-hidden min-h-0">
            {mediaType === 'video' ? (
              // Video streams layout
              <div id="video_calling_grid" className="w-full h-full relative bg-slate-950 rounded-2xl border border-white/5 flex items-center justify-center overflow-hidden">
                {/* Main: Remote Video Stream */}
                <div className="w-full h-full">
                  {isCameraOff && !remoteStream ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111B21] text-gray-500 gap-3">
                      <VideoOff className="w-12 h-12 text-indigo-505 text-indigo-500 animate-pulse" />
                      <span className="text-sm">Remote camera is off</span>
                    </div>
                  ) : (
                    <WebRTCVideo stream={remoteStream} isLocal={false} />
                  )}
                </div>

                {/* Sub: Local Video PIP thumbnail overlay at bottom-right */}
                <div id="canvas_pip" className="absolute bottom-4 right-4 w-28 md:w-44 h-40 md:h-56 border-2 border-indigo-500/50 bg-black rounded-xl overflow-hidden shadow-2xl z-20">
                  {isCameraOff ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#202C33] text-gray-400 text-[10px] gap-1">
                      <VideoOff className="w-5 h-5 text-indigo-400" />
                      <span>Camera Off</span>
                    </div>
                  ) : (
                    <WebRTCVideo stream={localStream} isLocal={true} />
                  )}
                </div>

                {/* Duration widget shown inside active video stream bottom-left */}
                <div className="absolute bottom-4 left-4 bg-[#0B0E11]/80 px-3.5 py-1.5 rounded-lg border border-white/5 backdrop-blur-md text-xs font-mono font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span>{formatDuration(callDuration)}</span>
                </div>
              </div>
            ) : (
              // Voice streams layout - beautiful profile card layout with voice indicators
              <div id="voice_calling_grid" className="flex flex-col items-center justify-center space-y-6 bg-[#111B21]/60 border border-white/5 p-12 rounded-2xl max-w-sm w-full shadow-2xl pb-8">
                <div className="relative">
                  {/* Subtle pulsing rings representing secure voice feed */}
                  <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-ping duration-1500 scale-125" />
                  
                  <img 
                    src={peer.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
                    className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500" 
                    alt={peer.username}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-indigo-600 p-2 rounded-full border border-[#111B21]">
                    <Volume2 className="w-4 h-4 text-white" />
                  </div>
                </div>

                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-100">{peer.username}</h3>
                  <p className="text-xs text-indigo-400 font-semibold mt-1 uppercase tracking-widest">Active Voice Feed</p>
                  <p className="text-sm font-mono text-slate-400 mt-3 flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {formatDuration(callDuration)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* State 4: Ended Call Notification screen */}
        {status === 'ended' && (
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
              <PhoneOff className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-200">Secure connection closed</h2>
              <p className="text-xs text-slate-500 mt-1">
                Cryptographic channels successfully scrubbed
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Buttons Controller Footer */}
      <div className="w-full max-w-lg flex flex-col items-center gap-4 mb-8">
        
        {/* Toggle option for call actions */}
        <div className="flex items-center justify-center gap-6">
          {/* Action A: If Incoming Call, render Accept + Reject triggers */}
          {status === 'incoming' && (
            <div className="flex items-center gap-8">
              {/* Reject */}
              <button
                id="reject_call_btn"
                onClick={onReject}
                className="w-14 h-14 bg-red-650 bg-red-650 hover:bg-red-600 bg-red-605 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-150 shadow-xl cursor-pointer bg-red-600 border border-red-500/20"
                title="Reject Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>

              {/* Accept */}
              <button
                id="accept_call_btn"
                onClick={onAnswer}
                className="w-16 h-16 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-150 shadow-xl cursor-pointer border border-emerald-500/20"
                title="Answer Call"
              >
                <Phone className="w-6 h-6 animate-bounce" />
              </button>
            </div>
          )}

          {/* Action B: If Dialing, show Cancel EndCall trigger only */}
          {status === 'dialing' && (
            <button
              id="cancel_dialing_btn"
              onClick={onEnd}
              className="w-14 h-14 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-150 shadow-xl cursor-pointer"
              title="Cancel Dialing"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          )}

          {/* Action C: If Active, show standard mute icons, video toggles, and End call trigger */}
          {status === 'active' && (
            <div className="flex items-center gap-6">
              {/* Mute Toggle */}
              <button
                id="toggle_mute_btn"
                onClick={onMuteToggle}
                className={`w-12 h-12 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-150 shadow-lg cursor-pointer border ${
                  isMuted 
                    ? 'bg-red-500/20 border-red-500/40 text-red-400' 
                    : 'bg-[#202C33] border-white/5 hover:bg-[#2A3942] text-slate-300'
                }`}
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Video Camera Toggle is only available in Video mode */}
              {mediaType === 'video' && (
                <button
                  id="toggle_camera_btn"
                  onClick={onCameraToggle}
                  className={`w-12 h-12 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-150 shadow-lg cursor-pointer border ${
                    isCameraOff 
                      ? 'bg-red-500/20 border-red-500/40 text-red-400' 
                      : 'bg-[#202C33] border-white/5 hover:bg-[#2A3942] text-slate-300'
                  }`}
                  title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              )}

              {/* End Active call */}
              <button
                id="end_active_call_btn"
                onClick={onEnd}
                className="w-14 h-14 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-150 shadow-xl cursor-pointer"
                title="End Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* Security / Quality notice text inside call controls footer */}
        <p className="text-[10px] text-gray-500 flex items-center gap-1.5 tracking-wide select-none">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Truly end-to-end encrypted with DTLS-SRTP
        </p>
      </div>
    </div>
  );
}
