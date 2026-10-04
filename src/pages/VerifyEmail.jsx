import React, { useEffect, useState } from 'react';
import { MailCheck, MailX, Loader2 } from 'lucide-react';
import { authApi } from '../services/api.js';
import { describeApiError } from '../utils/apiError.js';
import { useT } from '../i18n/LanguageContext.jsx';

// Landing page of the link in the confirmation email (?verify=<token>)
export default function VerifyEmail({ token, onDone }) {
  const { tr } = useT();
  const [state, setState] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    let cancelled = false;
    authApi
      .verifyEmail(token)
      .then(() => !cancelled && setState({ status: 'ok', message: '' }))
      .catch((err) => !cancelled && setState({ status: 'error', message: describeApiError(err, tr, 'This confirmation link is invalid or has expired.') }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const Icon = state.status === 'ok' ? MailCheck : state.status === 'error' ? MailX : Loader2;
  const color = state.status === 'ok' ? '#34d399' : state.status === 'error' ? '#fb7185' : 'var(--accent-cyan)';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '2.25rem 2rem' }}>
        <Icon size={48} color={color} style={{ margin: '0 auto 1rem auto' }} className={state.status === 'loading' ? 'spin' : undefined} />
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {state.status === 'ok' && tr('Email address confirmed')}
          {state.status === 'error' && tr('Confirmation failed')}
          {state.status === 'loading' && tr('Confirming your email address...')}
        </h2>
        {state.status === 'ok' && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{tr('Your account is active. You can sign in now.')}</p>}
        {state.status === 'error' && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{state.message}</p>}
        {state.status !== 'loading' && (
          <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={onDone}>
            {tr('Go to sign in')}
          </button>
        )}
      </div>
    </div>
  );
}
