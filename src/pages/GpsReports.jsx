import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download, ArrowLeft, Printer } from 'lucide-react';
import Loading from '../components/Loading.jsx';
import PrintHeader from '../components/PrintHeader.jsx';
import { gpsReportApi, vehicleApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const dateInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const startOfDay = (value) => new Date(`${value}T00:00:00`);
const endOfDay = (value) => new Date(`${value}T23:59:59.999`);

const PRESETS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: 'Last 7 days', days: 6 },
  { id: '30d', label: 'Last 30 days', days: 29 }
];

const panel = { padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' };

export default function GpsReports() {
  const { tr, lang } = useT();
  const today = dateInput(new Date());
  const [from, setFrom] = useState(dateInput(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(today);
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const duration = (minutes) => {
    const total = Math.round(minutes || 0);
    return tr('{h} h {m} min', { h: Math.floor(total / 60), m: total % 60 });
  };

  const params = useMemo(
    () => new URLSearchParams({ from: startOfDay(from).toISOString(), to: endOfDay(to).toISOString(), ...(vehicleId ? { vehicleId } : {}) }).toString(),
    [from, to, vehicleId]
  );

  useEffect(() => {
    vehicleApi.getAll('limit=500').then((res) => setVehicles(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    gpsReportApi
      .get(params)
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(tr(err.message || 'Failed to load the report'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const applyPreset = (preset) => {
    setFrom(dateInput(new Date(Date.now() - preset.days * 86400000)));
    setTo(today);
  };

  const download = async (type) => {
    try {
      const query = new URLSearchParams(params);
      if (type !== 'vehicles') query.set('type', type);
      await gpsReportApi.downloadCsv(query.toString(), `gps-${type}-${from}_${to}.csv`, lang);
    } catch (err) {
      alert(tr(err.message || 'Failed to export'));
    }
  };

  const summary = data?.summary;
  const maxDaily = Math.max(1, ...(data?.daily || []).map((d) => d.distanceKm));
  const selectedVehicle = vehicleId ? data?.vehicles?.[0] : null;

  const card = (label, value, sub) => (
    <div style={panel}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PrintHeader
        title={tr('GPS Reports')}
        lines={[
          `${tr('From Date')}: ${from} — ${tr('To Date')}: ${to}`,
          selectedVehicle ? `${tr('Vehicle')}: ${selectedVehicle.registrationNumber}` : null
        ]}
      />
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr('GPS Reports')}</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr('Distance, trips, stops, idling, speeding and fuel from the vehicles’ GPS trackers')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {vehicleId && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => download('trips')}><Download size={14} /> {tr('Trips CSV')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => download('stops')}><Download size={14} /> {tr('Stops CSV')}</button>
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}><Printer size={14} /> {tr('Print')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => download('vehicles')}><Download size={14} /> {tr('Export CSV')}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card no-print" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {PRESETS.map((p) => (
            <button key={p.id} className="btn btn-secondary btn-sm" onClick={() => applyPreset(p)}>{tr(p.label)}</button>
          ))}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{tr('From Date')}</label>
          <input type="date" className="form-control" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{tr('To Date')}</label>
          <input type="date" className="form-control" min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '220px' }}>
          <label className="form-label">{tr('Vehicle')}</label>
          <select className="form-control" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">{tr('All vehicles')}</option>
            {vehicles.map((v) => (
              <option key={v._id} value={v._id}>{v.registrationNumber} ({v.brand} {v.model})</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.85rem' }}>{error}</div>}

      {loading && !data ? (
        <Loading message={tr('Generating report table...')} />
      ) : (
        summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', opacity: loading ? 0.5 : 1 }}>
              {card(tr('Distance'), `${summary.distanceKm} ${tr('km')}`, tr('{n} trips', { n: summary.tripCount }))}
              {card(tr('Driving time'), duration(summary.drivingMin))}
              {card(tr('Stopped'), duration(summary.stopMin), `${tr('Idling')}: ${duration(summary.idleMin)}`)}
              {card(tr('Max speed'), `${summary.maxSpeed} ${tr('km/h')}`)}
              {card(tr('Speeding alerts'), summary.speedingAlerts, `${tr('Geofence alerts')}: ${summary.geofenceAlerts}`)}
              {card(tr('Fuel purchased'), `${summary.fuelLiters} L`, summary.kmPerLiter ? `${summary.kmPerLiter} ${tr('km/L')}` : '—')}
            </div>

            {/* Daily distance */}
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>
                <ClipboardList size={18} color="var(--primary)" /> {tr('Distance per day')}
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '160px', overflowX: 'auto' }}>
                {data.daily.map((d) => (
                  <div key={d.date} title={`${d.date}: ${d.distanceKm} km`} style={{ flex: '1 0 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{d.distanceKm > 0 ? Math.round(d.distanceKm) : ''}</div>
                    <div style={{ width: '100%', maxWidth: '36px', height: `${Math.max((d.distanceKm / maxDaily) * 120, d.distanceKm > 0 ? 3 : 1)}px`, backgroundColor: d.distanceKm > 0 ? 'var(--primary)' : 'var(--border-subtle)', borderRadius: '3px 3px 0 0' }} />
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>{d.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle table / single vehicle detail */}
            {selectedVehicle ? (
              <>
                <button className="btn btn-secondary btn-sm no-print" style={{ alignSelf: 'flex-start' }} onClick={() => setVehicleId('')}>
                  <ArrowLeft size={14} /> {tr('All vehicles')}
                </button>
                <div className="card">
                  <h3 className="card-title" style={{ marginBottom: '1rem' }}>{selectedVehicle.registrationNumber} · {tr('Trips')} ({data.trips?.length || 0})</h3>
                  {data.trips?.length ? (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead><tr><th>{tr('Start')}</th><th>{tr('End')}</th><th>{tr('Distance')}</th><th>{tr('Duration')}</th><th>{tr('Max speed')}</th><th>{tr('Avg speed')}</th></tr></thead>
                        <tbody>
                          {data.trips.map((t) => (
                            <tr key={t.start}>
                              <td>{new Date(t.start).toLocaleString()}</td>
                              <td>{new Date(t.end).toLocaleString()}</td>
                              <td>{t.distanceKm} {tr('km')}</td>
                              <td>{duration(t.durationMin)}</td>
                              <td>{t.maxSpeed} {tr('km/h')}</td>
                              <td>{t.avgSpeed} {tr('km/h')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{tr('No trips in this period.')}</div>
                  )}
                </div>
                <div className="card">
                  <h3 className="card-title" style={{ marginBottom: '1rem' }}>{tr('Stops')} ({data.stops?.length || 0})</h3>
                  {data.stops?.length ? (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead><tr><th>{tr('Start')}</th><th>{tr('End')}</th><th>{tr('Duration')}</th><th>{tr('Engine')}</th><th>{tr('Location')}</th></tr></thead>
                        <tbody>
                          {data.stops.map((s) => (
                            <tr key={s.start}>
                              <td>{new Date(s.start).toLocaleString()}</td>
                              <td>{new Date(s.end).toLocaleString()}</td>
                              <td>{duration(s.durationMin)}</td>
                              <td>{s.ignition === null ? '—' : s.idle ? tr('Idling (engine on)') : tr('Engine off')}</td>
                              <td>
                                <a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>
                                  {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{tr('No stops in this period.')}</div>
                  )}
                </div>
              </>
            ) : (
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '1rem' }}>{tr('Vehicles')} ({data.vehicles.length})</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{tr('Vehicle')}</th><th>{tr('Distance')}</th><th>{tr('Trips')}</th><th>{tr('Driving time')}</th>
                        <th>{tr('Stopped')}</th><th>{tr('Idling')}</th><th>{tr('Max speed')}</th><th>{tr('Speeding alerts')}</th><th>{tr('Fuel purchased')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.vehicles.map((v) => (
                        <tr key={v.vehicleId} onClick={() => setVehicleId(v.vehicleId)} style={{ cursor: 'pointer' }}>
                          <td><strong>{v.registrationNumber}</strong><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.brand} {v.model}</div></td>
                          <td>{v.distanceKm} {tr('km')}</td>
                          <td>{v.tripCount}</td>
                          <td>{duration(v.drivingMin)}</td>
                          <td>{duration(v.stopMin)}</td>
                          <td>{duration(v.idleMin)}</td>
                          <td>{v.maxSpeed} {tr('km/h')}</td>
                          <td>{v.speedingAlerts}</td>
                          <td>{v.fuelLiters} L{v.kmPerLiter ? ` · ${v.kmPerLiter} ${tr('km/L')}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="no-print" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                  {tr('Click a vehicle to see its trips and stops. Vehicles without a tracker show no distance.')}
                </p>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
