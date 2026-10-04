import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Sparkles, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { aiApi } from '../services/api.js';

const SUGGESTED_PROMPTS = [
  "Give me today's fleet summary",
  "Which vehicles need maintenance?",
  "Analyze fuel expenses",
  "Show overdue maintenance",
  "Show upcoming document expiries",
  "Summarize this month's expenses",
  "Which vehicles have high operating costs?"
];

export default function FleetAIChat({ isDrawer = false, onClose }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: "👋 Hello! I am **FleetAI**, your intelligent FLEETNOVA fleet operations co-pilot. I analyze real-time database records for all vehicles, drivers, trips, fuel metrics, and scheduled maintenance.\n\nHow can I help optimize your fleet operations today?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      sender: 'user',
      text: prompt,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await aiApi.chat(prompt);
      if (res.success && res.message) {
        const aiMsg = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: res.message,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        throw new Error(res.message || 'No response generated');
      }
    } catch (err) {
      console.error('FleetAI chat error:', err);
      setError(err.message || 'Unable to communicate with FleetAI server.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'ai',
        text: "Chat cleared. Ready for your next fleet analysis query.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setError(null);
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.sender === 'user');
    if (lastUserMsg) {
      handleSend(lastUserMsg.text);
    }
  };

  // Basic markdown bold/bullet formatter for AI output
  const renderFormattedText = (text) => {
    return text.split('\n').map((line, idx) => {
      let content = line;
      // Replace **text** with strong
      const parts = content.split(/(\*\*.*?\*\*)/g);
      return (
        <div key={idx} style={{ marginBottom: line.trim() === '' ? '0.5rem' : '0.2rem' }}>
          {parts.map((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={i} style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</strong>;
            }
            if (p.startsWith('###')) {
              return <span key={i} style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{p.replace(/#/g, '')}</span>;
            }
            return p;
          })}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-card)',
        borderRadius: isDrawer ? '0' : 'var(--radius-lg)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(15, 21, 35, 0.85)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}
          >
            <Bot size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              FleetAI Assistant
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(6, 182, 212, 0.15)',
                  color: 'var(--accent-cyan)',
                  border: '1px solid rgba(6, 182, 212, 0.3)'
                }}
              >
                Gemini Powered
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Read-only operations analyst with live MongoDB context
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={handleClear}
            className="btn btn-secondary btn-sm"
            title="Clear Chat"
            style={{ padding: '0.35rem' }}
          >
            <Trash2 size={16} />
          </button>
          {isDrawer && onClose && (
            <button
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.35rem' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Suggested Prompts Banner */}
      <div
        style={{
          padding: '0.65rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(10, 13, 20, 0.5)',
          whiteSpace: 'nowrap'
        }}
      >
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Sparkles size={14} color="var(--accent-cyan)" /> Suggestions:
        </span>
        {SUGGESTED_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            disabled={loading}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9999px',
              padding: '0.2rem 0.65rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: m.sender === 'user' ? 'row-reverse' : 'row',
              gap: '0.75rem',
              alignItems: 'flex-start',
              maxWidth: '88%',
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: m.sender === 'user' ? 'var(--primary)' : 'rgba(6, 182, 212, 0.15)',
                color: m.sender === 'user' ? '#fff' : 'var(--accent-cyan)',
                border: m.sender === 'user' ? 'none' : '1px solid rgba(6, 182, 212, 0.3)'
              }}
            >
              {m.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div
              style={{
                backgroundColor: m.sender === 'user' ? 'var(--primary)' : 'var(--bg-secondary)',
                color: m.sender === 'user' ? '#ffffff' : 'var(--text-secondary)',
                padding: '0.85rem 1.15rem',
                borderRadius: 'var(--radius-lg)',
                borderTopRightRadius: m.sender === 'user' ? '2px' : 'var(--radius-lg)',
                borderTopLeftRadius: m.sender === 'ai' ? '2px' : 'var(--radius-lg)',
                border: m.sender === 'user' ? 'none' : '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                fontSize: '0.875rem',
                lineHeight: '1.5'
              }}
            >
              <div>{renderFormattedText(m.text)}</div>
              <div
                style={{
                  fontSize: '0.65rem',
                  opacity: 0.65,
                  marginTop: '0.4rem',
                  textAlign: 'right'
                }}
              >
                {m.time}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                color: 'var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Bot size={16} />
            </div>
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '0.65rem 1rem',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.825rem',
                color: 'var(--text-muted)'
              }}
            >
              <div className="spinner" style={{ width: '16px', height: '16px' }}></div>
              FleetAI is analyzing real-time fleet data...
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            <button
              onClick={handleRetry}
              className="btn btn-danger btn-sm"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
            >
              <RotateCcw size={12} /> Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '1rem',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(15, 21, 35, 0.95)'
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{ display: 'flex', gap: '0.5rem' }}
        >
          <input
            type="text"
            className="form-control"
            placeholder="Ask FleetAI about vehicles, expenses, fuel, or maintenance..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!input.trim() || loading}
            style={{ padding: '0.65rem 1rem' }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
