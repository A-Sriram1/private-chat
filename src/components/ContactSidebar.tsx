/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Search, UserPlus, LogOut, CheckCheck, Check, Settings2, Plus, MessageCircle } from 'lucide-react';
import { User, ChatSession } from '../types';

interface ContactSidebarProps {
  currentUser: User;
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  onSelectSession: (session: ChatSession) => void;
  allUsers: User[];
  onStartNewChat: (user: User) => void;
  onLogout: () => void;
  onOpenProfile: () => void;
}

export default function ContactSidebar({
  currentUser,
  sessions,
  activeSession,
  onSelectSession,
  allUsers,
  onStartNewChat,
  onLogout,
  onOpenProfile,
}: ContactSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);

  // Filter conversations
  const filteredSessions = sessions.filter(
    (s) => s.recipient.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter possible raw users for new chat initiator (exclude current user and active session recipients)
  const activeUsernames = new Set(sessions.map((s) => s.recipient.username.toLowerCase()));
  activeUsernames.add(currentUser.username.toLowerCase());
  
  const contactCandidates = allUsers.filter(
    (u) => 
      !activeUsernames.has(u.username.toLowerCase()) &&
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="contact_sidebar" className="w-80 md:w-96 border-r border-white/5 bg-[#111B21] flex flex-col h-full font-sans select-none shrink-0">
      {/* Top Header - User profile */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#202C33]">
        <div className="flex items-center gap-3">
          <button 
            type="button" 
            onClick={onOpenProfile} 
            className="relative w-10 h-10 rounded-full overflow-hidden border border-indigo-500/30 group cursor-pointer"
          >
            <img 
               src={currentUser.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
              alt={currentUser.username} 
              referrerPolicy="no-referrer"
            />
          </button>
          <div>
            <h3 className="text-slate-100 font-semibold text-sm leading-none flex items-center gap-1.5">
              {currentUser.username}
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-[130px] md:max-w-[180px]">
              {currentUser.statusMessage || "🔒 E2EE Active"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddContact(!showAddContact)}
            title="Start New Chat"
            className={`p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-[#2A3942] transition-colors cursor-pointer ${showAddContact ? 'bg-[#2A3942] text-indigo-400' : ''}`}
          >
            <UserPlus className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenProfile}
            title="Profile Settings"
            className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            <Settings2 className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            title="Secure Logout"
            className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Directory add search slide-down */}
      {showAddContact && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-b border-white/5 bg-[#111B21] overflow-hidden"
        >
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-indigo-400" /> Start E2EE Connection
            </h4>
            
            {contactCandidates.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No new contacts discovered on public keyserver network. Invite folders or try registering another participant.
              </p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {contactCandidates.map((user) => (
                  <button
                    key={user.username}
                    onClick={() => {
                      onStartNewChat(user);
                      setShowAddContact(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#202C33] text-left transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={user.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                        className="w-8 h-8 rounded-full object-cover"
                        alt={user.username}
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <h5 className="text-sm font-semibold text-slate-200 group-hover:text-indigo-400">{user.username}</h5>
                        <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{user.statusMessage || 'Available'}</p>
                      </div>
                    </div>
                    <div className="p-1 px-2.5 bg-indigo-550/10 text-indigo-400 border border-indigo-500/25 rounded-md text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Secure
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Search Input Box */}
      <div className="p-3 bg-[#111B21]">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <input
            id="chat_search_input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search secure chats"
            className="w-full bg-[#202C33] text-sm text-slate-200 rounded-lg py-2.5 pl-10 pr-4 outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Sessions lists */}
      <div className="flex-1 overflow-y-auto space-y-1 bg-[#111B21]">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 py-2">
          Secure Conversations ({filteredSessions.length})
        </h4>

        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-slate-500">No secure sessions found.</p>
            <p className="text-xs text-slate-600 mt-2">
              Use the user directory icon on the top right to start a private encrypted conversation.
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = activeSession?.recipient.username.toLowerCase() === session.recipient.username.toLowerCase();
            return (
              <button
                key={session.recipient.username}
                onClick={() => onSelectSession(session)}
                className={`w-full flex items-center gap-3 p-4 text-left transition-all relative group cursor-pointer rounded-none border-b border-white/5 ${
                  isActive 
                    ? 'bg-[#2A3942] text-slate-100 border-l-4 border-indigo-505 border-l-indigo-505 border-l-indigo-500' 
                    : 'hover:bg-[#202C33] text-slate-450 text-gray-400 hover:text-slate-200'
                }`}
              >
                {/* Profile Pic with Online Bubble status */}
                <div className="relative shrink-0">
                  <img
                    src={session.recipient.profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                    className="w-12 h-12 rounded-full object-cover border border-slate-800"
                    alt={session.recipient.username}
                    referrerPolicy="no-referrer"
                  />
                  {session.recipient.isOnline && (
                    <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-950"></span>
                  )}
                </div>

                {/* Conversation Details */}
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex justify-between items-baseline">
                    <h4 className="text-sm font-medium text-slate-100 truncate group-hover:text-indigo-400 transition-colors">
                      {session.recipient.username}
                    </h4>
                    {session.latestMessage && (
                      <span className="text-[10px] text-gray-400">
                        {new Date(session.latestMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center mt-1">
                    {session.isTyping ? (
                      <p className="text-xs text-emerald-500 font-medium italic animate-pulse">
                        typing secure message...
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 truncate max-w-[140px] md:max-w-[200px]">
                        {session.latestMessage?.fileId ? (
                          <span className="italic">📁 Attachment sent (E2EE)</span>
                        ) : session.latestMessage ? (
                          <span>🔐 Ciphered transmission</span>
                        ) : (
                          <span className="text-slate-600">No transmissions yet</span>
                        )}
                      </p>
                    )}

                    {/* Checkmark or Unread Badge status */}
                    {session.unreadCount > 0 ? (
                      <span className="bg-indigo-600 text-slate-100 text-[10px] font-bold px-1.5 py-0.5 min-w-4 rounded-full text-center">
                        {session.unreadCount}
                      </span>
                    ) : session.latestMessage && session.latestMessage.sender === currentUser.username ? (
                      <span className="text-slate-600 shrink-0">
                        {session.latestMessage.readStatus === 'read' ? (
                          <CheckCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Check className="w-4 h-4 text-slate-500" />
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
