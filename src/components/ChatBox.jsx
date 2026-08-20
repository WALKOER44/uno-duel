import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { EMOTES } from '../engine/constants.js';
import { EMOTE_PIXEL_MAP } from '../engine/pixels.js';
import PixelEmote from './fx/PixelEmote.jsx';

export default function ChatBox({ compact = false }) {
  const { view, sendChatMessage, sendEmote } = useGame();
  const { prefs, setPref } = useSettings();
  const [text, setText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [open, setOpen] = useState(!compact);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [view.chat.history.length]);

  if (!open) {
    return (
      <button type="button" className="chat-show-btn" onClick={() => setOpen(true)}>
        💬
      </button>
    );
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    sendChatMessage(t);
    setText('');
  }

  function pickEmote(e) {
    sendEmote(e);
    setShowPicker(false);
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <strong>💬 Chat</strong>
        <button type="button" className="chat-toggle-btn" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <div className="chat-messages" ref={messagesRef} aria-live="polite">
        {view.chat.history.map((m) => (
          <div key={m.id} className={`chat-msg ${m.sender === view.auth.username ? 'mine' : ''}`}>
            <span className="chat-avatar">{m.avatar}</span>
            <div className="chat-body">
              <span className="chat-name">{m.sender}</span>
              {m.kind === 'emote' ? (
                <span className="chat-emote">
                  <PixelEmote name={EMOTE_PIXEL_MAP[m.emote] || 'joy'} size={3} />
                </span>
              ) : (
                <span className="chat-text">{m.text}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="text-input"
          type="text"
          maxLength={160}
          placeholder="Ketik pesan..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          ref={inputRef}
        />
        <button type="button" className="chat-send-btn" onClick={send}>
          ➤
        </button>
      </div>
      <div className="chat-emote-row">
        <button type="button" className="emote-toggle-btn" onClick={() => setShowPicker((s) => !s)}>
          😊 Emote
        </button>
        {showPicker && (
          <div className="emote-grid">
            {EMOTES.map((e) => (
              <button key={e.e} type="button" className="emote-btn" onClick={() => pickEmote(e.e)}>
                <PixelEmote name={EMOTE_PIXEL_MAP[e.e] || 'joy'} size={2} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}