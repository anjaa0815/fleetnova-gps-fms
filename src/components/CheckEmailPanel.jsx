import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { authApi } from '../services/api.js';
import { describeApiError } from '../utils/apiError.js';
import { useT } from '../i18n/LanguageContext.jsx';

// "Check your inbox" screen with a button to send the confirmation link again
export default function CheckEmailPanel({ email, onBackToLogin }) {
  const { tr } = useT();
  const [state, setState] = useState({ sending: false, message: null, error: false });

  const resend = async () => {
    setState({ sending: true, message: null, error: false });
    try {
      await authApi.resendVerification(email);
      setState({ sending: false, message: tr('If this address is waiting for confirmation, a new link has been sent.'), error: false });
    } catch (err) {
      setState({ sending: false, message: describeApiError(err, tr, 'Failed to send the email'), error: true });
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <MailCheck size={48} color="#34d399" style={{ margin: '0 auto 1rem auto' }} />
      <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>{tr('Check your email')}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        {tr('We sent a confirmation link to {email}. Open it to activate your account.', { email })}
      </p>
      {state.message && (
        <div style={{ padding: '0.7rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', backgroundColor: state.error ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: state.error ? '#fb7185' : '#34d399' }}>
          {state.message}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" disabled={state.sending} onClick={resend}>
          {state.sending ? tr('Sending...') : tr('Resend the link')}
        </button>
        {onBackToLogin && (
          <button className="btn btn-primary" onClick={onBackToLogin}>{tr('Go to sign in')}</button>
        )}
      </div>
    </div>
  );
}
