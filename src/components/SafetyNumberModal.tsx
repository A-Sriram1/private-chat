/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, CheckCircle, ShieldCheck, Copy, Loader2 } from 'lucide-react';
import { User } from '../types';
import { calculateSafetyNumber } from '../utils/crypto';

interface SafetyNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  recipient: User;
}

export default function SafetyNumberModal({ isOpen, onClose, currentUser, recipient }: SafetyNumberModalProps) {
  const [safetyNumber, setSafetyNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    const fetchSafetyNumber = async () => {
      setLoading(true);
      try {
        const num = await calculateSafetyNumber(currentUser.publicKey, recipient.publicKey);
        if (isMounted) {
          setSafetyNumber(num);
        }
      } catch (err) {
        console.error('Error calculating safety number fingerprint:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSafetyNumber();
    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser, recipient]);

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyNumber);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="safety_number_modal_overlay" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 safe-x">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg bg-[#111B21] border border-white/5 rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 relative font-sans max-h-[90dvh] overflow-y-auto safe-bottom"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 p-2 rounded-xl hover:bg-[#202C33] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-indigo-400 mb-4">
              <ShieldCheck className="w-6 h-6" />
              <h2 className="text-lg font-bold text-slate-100">Verify Safety Number</h2>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              To verify that end-to-end encryption is active and secure with <span className="text-slate-200 font-bold">{recipient.username}</span>, compare these numbers with their device. If they match, your communication is 100% secure and free of interception.
            </p>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-500 font-medium tracking-wide">Deriving cryptographic digests...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Fingerprint block */}
                <div className="bg-[#0B0E11] border border-indigo-500/30 p-6 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-1 px-2.5 bg-indigo-500/10 text-indigo-400 border-b border-l border-indigo-500/20 text-[9px] font-bold uppercase tracking-widest rounded-bl-lg">
                    ECDH-P256
                  </div>
                  
                  <div className="font-mono text-base sm:text-xl md:text-2xl text-indigo-400 tracking-[0.15rem] sm:tracking-[0.25rem] font-bold py-2 break-all">
                    {safetyNumber}
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2 font-mono uppercase">
                    Fingerprint verification sequence
                  </p>
                </div>

                {/* Users Comparison side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 p-3 bg-[#202C33] border border-white/5 rounded-xl">
                    <img src={currentUser.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} className="w-8 h-8 rounded-full object-cover shrink-0" alt="Self" referrerPolicy="no-referrer" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-slate-300 truncate">Your Public Key</h4>
                      <p className="text-[9px] text-slate-500 font-mono truncate max-w-[130px]">{currentUser.publicKey}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-[#202C33] border border-white/5 rounded-xl">
                    <img src={recipient.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} className="w-8 h-8 rounded-full object-cover shrink-0" alt="Peer" referrerPolicy="no-referrer" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-slate-300 truncate">{recipient.username}'s Key</h4>
                      <p className="text-[9px] text-slate-500 font-mono truncate max-w-[130px]">{recipient.publicKey}</p>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={handleCopy}
                    className="flex-1 bg-[#2A3942] hover:bg-[#202C33] text-slate-200 font-semibold py-3 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-white/5"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-450" />
                        Fingerprint Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Fingerprint to Clipboard
                      </>
                    )}
                  </button>

                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    Match Checked
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
