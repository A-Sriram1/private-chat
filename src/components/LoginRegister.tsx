/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, KeyRound, User, Lock, MessageCircleCode, ArrowRight, Loader } from 'lucide-react';
import { apiRequest, setTokenInStorage } from '../utils/api';
import { 
  generateSaltBase64, 
  deriveMasterKey, 
  generateChatKeyPair, 
  exportPublicKey, 
  encryptPrivateKey 
} from '../utils/crypto';

interface LoginRegisterProps {
  onAuthSuccess: (user: any, privateKey: CryptoKey) => void;
}

// Minimal modern default avatars list
const AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80',
];

export default function LoginRegister({ onAuthSuccess }: LoginRegisterProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [statusText, setStatusText] = useState('Hey there! My chats are secure.');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [customAvatar, setCustomAvatar] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 200 * 1024) {
        setErrorMsg('Custom avatar must be smaller than 200KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setCustomAvatar(base64);
        setSelectedAvatar(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('Please supply a valid username and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      if (isRegistering) {
        // 1. Generate local salt and PBKDF2 master key
        const salt = generateSaltBase64();
        const masterKey = await deriveMasterKey(password, salt);

        // 2. Generate E2EE P-256 Key pair
        const keyPair = await generateChatKeyPair();

        // 3. Export Public Key (JWK JSON formatted string)
        const publicKeyStr = await exportPublicKey(keyPair.publicKey);

        // 4. Encrypt Private Key utilizing master PBKDF2 key (AES-GCM)
        const encryptedPrivateKeyStr = await encryptPrivateKey(keyPair.privateKey, masterKey);

        // 5. Send payload to registration endpoint
        const response = await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password, // Sent over TLS to let server store secure bcrypt hash
            salt,
            publicKey: publicKeyStr,
            encryptedPrivateKey: encryptedPrivateKeyStr,
            profilePic: selectedAvatar,
            statusMessage: statusText
          })
        });

        setTokenInStorage(response.token);
        onAuthSuccess(response.user, keyPair.privateKey);
      } else {
        // -- LOGIN PATH --
        const response = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });

        // 1. Recover salt and PBKDF2 derive master key locally using inputted password
        const userSalt = response.user.salt;
        const masterKey = await deriveMasterKey(password, userSalt);

        // 2. Decrypt user's stored private key in-browser
        const decryptedPrivateKey = await import('../utils/crypto').then(m =>
          m.decryptPrivateKey(response.user.encryptedPrivateKey, masterKey)
        );

        setTokenInStorage(response.token);
        onAuthSuccess(response.user, decryptedPrivateKey);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth_container" className="min-h-screen bg-[#0B0E11] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient mesh */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-[#111B21] border border-white/5 rounded-2xl shadow-2xl p-8 relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            Private Chat <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-semibold px-2 py-0.5 rounded-full">E2EE</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2 text-center">
            {isRegistering 
              ? 'Create a secure account. All keys are derived and encrypted locally.' 
              : 'Enter keyspace. Your password decrypts your E2EE keychain in-browser.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 font-medium text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Username</label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                id="username_field"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Secure handle"
                className="w-full bg-[#202C33] border border-white/5 focus:ring-1 focus:ring-indigo-500/50 text-sm text-slate-100 rounded-xl py-3 pl-11 pr-4 outline-none transition-colors"
                maxLength={20}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                id="password_field"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="🔐 Encryption password"
                className="w-full bg-[#202C33] border border-white/5 focus:ring-1 focus:ring-indigo-500/50 text-sm text-slate-100 rounded-xl py-3 pl-11 pr-4 outline-none transition-colors"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Your password yields the decryption key. It is never exposed in plaintext.
            </p>
          </div>

          {isRegistering && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="space-y-4 overflow-hidden"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Status Line</label>
                <input
                  id="status_field"
                  type="text"
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="Tell contacts who you are"
                  className="w-full bg-[#202C33] border border-white/5 focus:ring-1 focus:ring-indigo-500/50 text-sm text-slate-100 rounded-xl py-3 px-4 outline-none transition-colors"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Choose Profile Picture</label>
                <div className="flex items-center gap-3 mb-3">
                  {AVATARS.map((avUrl) => (
                    <button
                      key={avUrl}
                      type="button"
                      onClick={() => setSelectedAvatar(avUrl)}
                      className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${selectedAvatar === avUrl ? 'border-indigo-500 scale-105' : 'border-slate-800 hover:border-slate-700'}`}
                    >
                      <img src={avUrl} className="w-full h-full object-cover" alt="avatar option" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                  <label className="w-10 h-10 rounded-full border border-dashed border-slate-700 hover:border-indigo-500 flex items-center justify-center cursor-pointer text-xs text-slate-400 opacity-80 hover:opacity-100 transition-colors">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                </div>
                {selectedAvatar.startsWith('data:image') && (
                  <div className="flex items-center gap-2 bg-[#202C33] p-2 rounded-xl border border-white/5">
                    <img src={selectedAvatar} className="w-7 h-7 rounded-full object-cover" alt="Custom upload" referrerPolicy="no-referrer" />
                    <span className="text-[10px] text-indigo-400 font-medium">Custom photo uploaded successfully</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <button
            id="auth_submit_btn"
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                {isRegistering ? 'Generating Local Keyrings...' : 'Unlocking Keychain...'}
              </>
            ) : (
              <>
                {isRegistering ? 'Unlock Private Space' : 'Unlock Secure Chats'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/5 text-center">
          <button
            id="toggle_auth_type_btn"
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setErrorMsg('');
            }}
            className="text-xs text-indigo-400 font-medium hover:underline cursor-pointer"
          >
            {isRegistering 
              ? 'Already registered? Log in to your keyspace' 
              : 'New keygen? Register a encrypted account'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
