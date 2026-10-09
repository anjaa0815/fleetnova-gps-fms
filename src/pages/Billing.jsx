import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ExternalLink, XCircle, Crown, Clock } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import Loading from '../components/Loading.jsx';
import { billingApi, apiRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

const money = (n) => `₮${Number(n || 0).toLocaleString()}`;
const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');
const box = (extra = {}) => ({ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', ...extra });

const STATE_TEXT = {
  trial: 'Free trial',
  active: 'Active',
  expiring: 'Ends soon',
  grace: 'Ended: renew now',
  expired: 'Ended: read-only'
};
const INVOICE_BADGE = { pending: 'in-progress', paid: 'completed', expired: 'inactive', cancelled: 'cancelled' };

export default function Billing() {
  const { tr } = useT();
  const { setOrganization } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [months, setMonths] = useState(1);
  const [devices, setDevices] = useState(''); // GPS devices to pay for
  const [creating, setCreating] = useState(false);
  const [invoice, setInvoice] = useState(null); // invoice shown in the payment window
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await billingApi.overview();
      setData(res.data);
      // pay for the registered devices unless the customer chose more
      setDevices((d) => (d === '' || Number(d) < res.data.registeredDevices ? String(res.data.registeredDevices) : d));
      setError(null);
    } catch (err) {
      setError(tr(err.message));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => { load(); }, [load]);

  // The server turns a payment into plan time; refresh the organization shown around the app
  const refreshOrganization = useCallback(async () => {
    try {
      const res = await apiRequest('/organization');
      if (res.success) setOrganization(res.data);
    } catch { /* the page still shows the paid invoice */ }
  }, [setOrganization]);

  // While the payment window is open and the invoice is unpaid, ask the server (which asks QPay) every 3 seconds
  useEffect(() => {
    clearInterval(timer.current);
    if (!invoice || invoice.status !== 'pending') return undefined;
    timer.current = setInterval(async () => {
      try {
        const res = await billingApi.getInvoice(invoice._id);
        setInvoice(res.data);
        if (res.data.status !== 'pending') {
          clearInterval(timer.current);
          if (res.data.status === 'paid') { await refreshOrganization(); await load(); }
        }
      } catch { /* try again on the next tick */ }
    }, 3000);
    return () => clearInterval(timer.current);
  }, [invoice, load, refreshOrganization]);

  const pay = async () => {
    // another plan starts today: what is left of the running paid plan is not carried over
    const running = ['basic', 'pro'].includes(data.current.plan) && data.current.planExpiresAt && new Date(data.current.planExpiresAt) > new Date();
    if (running && !window.confirm(tr('Switching plan starts it today; the remaining time of your current plan is not carried over or refunded. Continue?'))) return;
    setCreating(true);
    setError(null);
    try {
      const res = await billingApi.createInvoice('gps', months, Number(devices));
      setInvoice(res.data);
    } catch (err) {
      setError(tr(err.message));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async () => {
    try {
      await billingApi.cancelInvoice(invoice._id);
      setInvoice(null);
      await load();
    } catch (err) {
      setError(tr(err.message));
    }
  };

  const simulate = async () => {
    try {
      const res = await billingApi.simulatePay(invoice._id);
      setInvoice(res.data);
      if (res.data.status === 'paid') { await refreshOrganization(); await load(); }
    } catch (err) {
      setError(tr(err.message));
    }
  };

  const closeWindow = () => {
    setInvoice(null);
    load();
  };

  if (loading) return <Loading message={tr('Loading billing...')} />;
  if (!data) return <div style={box({ backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' })}>{error}</div>;

  const { current, plans, mode } = data;
  const plan = plans[0]; // the per-GPS plan is the only one sold online
  const price = plan.pricePerDevice;
  const devicesCount = Number(devices) || 0;
  const devicesValid = Number.isInteger(devicesCount) && devicesCount >= data.registeredDevices && devicesCount >= 1;
  const total = price * devicesCount * months;
  const stateBad = current.state === 'expired' || current.state === 'grace';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && (
        <div style={box({ backgroundColor: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', display: 'flex', gap: '0.5rem', alignItems: 'center' })}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {mode === 'simulated' && (
        <div style={box({ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24' })}>
          {tr('Test mode: QPay is not configured, so no real payment is made. Use the "Mark as paid (test)" button in the payment window.')}
        </div>
      )}
      {mode === 'disabled' && (
        <div style={box({ backgroundColor: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185' })}>
          {tr('Online payment is not available yet. Please contact the platform administrator to change your plan.')}
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr('Current plan')}</div>
          <strong style={{ fontSize: '1.25rem', color: 'var(--accent-cyan)', textTransform: 'capitalize' }}>{current.plan === 'gps' ? tr('Per GPS device') : tr(current.plan)}</strong>
          {current.plan === 'gps' && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tr('{n} GPS devices paid for', { n: current.deviceLimit })}</div>}
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr('Status')}</div>
          <strong style={{ color: stateBad ? '#fb7185' : current.state === 'expiring' ? '#fbbf24' : 'var(--accent-emerald)' }}>{tr(STATE_TEXT[current.state])}</strong>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{current.plan === 'trial' ? tr('Trial Ends') : tr('Plan active until')}</div>
          <strong>{current.plan === 'trial' ? dateText(current.trialEndsAt) : current.planExpiresAt ? dateText(current.planExpiresAt) : tr('No end date')}</strong>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            <CreditCard size={18} color="var(--primary)" /> {tr('Pay for your GPS devices')}
          </h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            {tr('Period')}
            <select className="form-control" style={{ width: 'auto' }} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {data.months.map((m) => <option key={m} value={m}>{tr('{n} month(s)', { n: m })}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: current.plan === 'gps' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.1rem' }}>{tr('Per GPS device')}</strong>
              {current.plan === 'gps' && <span className="badge badge-active">{tr('Current plan')}</span>}
            </div>
            <div>
              <span style={{ fontSize: '1.6rem', fontWeight: 800 }}>{money(price)}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}> / {tr('GPS')} / {tr('month')}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>{tr('{n} GPS devices registered', { n: data.registeredDevices })}</li>
              {current.plan === 'gps' && <li>{tr('{n} GPS devices paid for', { n: current.deviceLimit })}</li>}
              <li>{tr('Unlimited vehicles')}</li>
              <li>{tr('{n} users', { n: plan.limits.maxUsers })}</li>
              <li>{tr('{e} e-mails and {s} SMS per day', { e: plan.limits.maxEmailsPerDay, s: plan.limits.maxSmsPerDay })}</li>
              <li>{tr('GPS history kept for {n} days', { n: plan.limits.positionRetentionDays })}</li>
            </ul>
            {data.registeredDevices < 1 ? (
              <div style={box({ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' })}>
                {tr('Register at least one GPS device (GPS Devices page) before paying.')}
              </div>
            ) : (
              <>
                <label className="form-label" style={{ marginBottom: 0 }}>{tr('GPS devices to pay for')}</label>
                <input
                  type="number"
                  className="form-control"
                  min={data.registeredDevices}
                  step="1"
                  value={devices}
                  onChange={(e) => setDevices(e.target.value)}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {tr('Your registered devices. Raise it to have room for more devices.')}
                </div>
              </>
            )}
            <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                {devicesCount} × {money(price)} × {tr('{n} month(s)', { n: months })} = <strong style={{ color: 'var(--text-primary)' }}>{money(total)}</strong>
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={mode === 'disabled' || creating || !devicesValid} onClick={pay}>
                {creating ? tr('Creating...') : current.plan === 'gps' ? tr('Renew with QPay') : tr('Pay with QPay')}
              </button>
            </div>
          </div>

          <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Crown size={16} color="#fbbf24" /> Enterprise</strong>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {tr('Unlimited vehicles, users and devices, longest GPS history. The price is agreed with the platform administrator.')}
            </div>
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          {tr('Renewing with the same number of GPS devices adds the period to the end of the running one. With another number, the time left is converted to the new number of devices and the new period comes on top.')}
        </p>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>{tr('Payment history')}</h3>
        {data.invoices.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{tr('No payments yet.')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{tr('Date')}</th><th>{tr('Invoice')}</th><th>{tr('Plan')}</th><th>{tr('Period')}</th><th>{tr('Amount')}</th><th>{tr('Status')}</th><th />
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv._id}>
                    <td>{dateText(inv.paidAt || inv.createdAt)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{inv.senderInvoiceNo}</td>
                    <td style={{ textTransform: 'capitalize' }}>{inv.plan === 'gps' ? tr('{n} GPS', { n: inv.devices }) : inv.plan}</td>
                    <td>{tr('{n} month(s)', { n: inv.months })}</td>
                    <td>{money(inv.amount)}</td>
                    <td><span className={`badge badge-${INVOICE_BADGE[inv.status]}`}>{tr(inv.status)}</span></td>
                    <td>
                      {inv.status === 'pending' && (
                        <button className="btn btn-secondary btn-sm" onClick={async () => { try { const res = await billingApi.getInvoice(inv._id); setInvoice(res.data); } catch (err) { setError(tr(err.message)); } }}>
                          {tr('Continue')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(invoice)} onClose={closeWindow} title={tr('Pay with QPay')} maxWidth="520px">
        {invoice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', alignItems: 'center', textAlign: 'center' }}>
            {invoice.status === 'paid' ? (
              <>
                <CheckCircle2 size={48} color="var(--accent-emerald)" />
                <strong style={{ fontSize: '1.1rem' }}>{tr('Payment received')}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {invoice.plan === 'gps' ? tr('Your {n} GPS devices are paid for.', { n: invoice.devices }) : tr('Your {plan} plan is active.', { plan: invoice.plan })} {tr('A receipt was sent to your e-mail.')}
                </div>
                <button className="btn btn-primary" onClick={closeWindow}>{tr('Close')}</button>
              </>
            ) : invoice.status !== 'pending' ? (
              <>
                <XCircle size={48} color="#fb7185" />
                <div>{tr(invoice.status === 'expired' ? 'This payment request has expired.' : 'This payment request was cancelled.')}</div>
                <button className="btn btn-primary" onClick={closeWindow}>{tr('Close')}</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {invoice.description}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{money(invoice.amount)}</div>

                {invoice.qrImage ? (
                  <img alt="QPay QR" src={`data:image/png;base64,${invoice.qrImage}`} style={{ width: 220, height: 220, background: '#fff', padding: 8, borderRadius: 8 }} />
                ) : (
                  <div style={box({ backgroundColor: 'var(--bg-secondary)', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' })}>{invoice.qrText}</div>
                )}
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {tr('Scan the QR code in your bank app, or pick your bank:')}
                </div>

                {invoice.urls?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
                    {invoice.urls.map((u) => (
                      <a key={u.link} className="btn btn-secondary btn-sm" href={u.link} title={u.description} target="_blank" rel="noopener noreferrer">
                        {u.logo && <img alt="" src={u.logo} style={{ width: 16, height: 16, marginRight: 4, borderRadius: 3 }} />}
                        {u.name}
                      </a>
                    ))}
                  </div>
                )}
                {invoice.shortUrl && (
                  <a href={invoice.shortUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <ExternalLink size={13} /> {tr('Open the QPay page')}
                  </a>
                )}

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} /> {tr('Waiting for the payment... this window updates by itself.')}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {invoice.provider === 'simulated' && (
                    <button className="btn btn-primary btn-sm" onClick={simulate}>{tr('Mark as paid (test)')}</button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={cancel}>{tr('Cancel this request')}</button>
                  <button className="btn btn-secondary btn-sm" onClick={closeWindow}>{tr('Close')}</button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
