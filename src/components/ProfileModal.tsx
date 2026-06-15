/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, MessageCircle, AlertCircle, Save, Loader } from 'lucide-react';
import { User as UserType } from '../types';
import { apiRequest } from '../utils/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  onProfileUpdated: (updatedUser: Partial<UserType>) => void;
}

export default function ProfileModal({ isOpen, onClose, currentUser, onProfileUpdated }: ProfileModalProps) {
  const [statusMessage, setStatusMessage] = useState(currentUser.statusMessage || '');
  const [profilePic, setProfilePic] = useState(currentUser.profilePic || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 200 * 1024) {
        setErrorMsg('Avatar image size must be smaller than 200KB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        setProfilePic(reader.result as string);
        setErrorMsg('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await apiRequest('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          profilePic,
          statusMessage,
        })
      });

      if (response.status === 'ok') {
        onProfileUpdated({
          profilePic,
          statusMessage,
        });
        setSuccessMsg('Profile updated securely across keynodes.');
        setTimeout(() => {
          onClose();
          setSuccessMsg('');
        }, 1500);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="profile_modal_overlay" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-[#111B21] border border-white/5 rounded-2xl shadow-2xl p-6 relative"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 p-2 rounded-xl hover:bg-[#202C33] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-6">
              <User className="w-5 h-5 text-indigo-400" /> Identity Credentials
            </h2>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-400 text-center font-medium">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">
              {/* Profile Avatar Center */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group w-24 h-24 rounded-full overflow-hidden border border-slate-700 hover:border-indigo-500/50 transition-colors">
                  <img
                    src={profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                    className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                    alt={currentUser.username}
                    referrerPolicy="no-referrer"
                  />
                  <label className="absolute inset-x-0 bottom-0 bg-[#0B0E11]/80 text-[10px] text-slate-300 py-1 text-center font-medium opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    Change
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
                <div className="text-center">
                  <h3 className="text-md font-semibold text-slate-200">{currentUser.username}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Secure Username Handle</p>
                </div>
              </div>

              {/* Status input */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-indigo-400" /> Custom Status Note
                </label>
                <input
                  id="status_update_input"
                  type="text"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  placeholder="Hey there! All my communication is E2EE."
                  maxLength={100}
                  className="w-full bg-[#202C33] border border-white/5 focus:ring-1 focus:ring-indigo-500/50 text-sm text-slate-200 rounded-xl py-3 px-4 outline-none transition-colors"
                />
              </div>

              {/* Save Trigger */}
              <div className="pt-2">
                <button
                  id="save_profile_btn"
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Applying parameters...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Secure Metadata
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
