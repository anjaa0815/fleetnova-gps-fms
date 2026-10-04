import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useT } from '../i18n/LanguageContext.jsx';
import L from 'leaflet';
import FitBounds from './FitBounds.jsx';
import { trackingApi } from '../services/api.js';

const POLL_MS = 10000;

// Arrow marker rotated by the vehicle heading; grey when the tracker is offline
const makeIcon = (heading, online) =>
  new L.DivIcon({
    className: 'custom-vehicle-marker',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${online ? '#10b981' : '#64748b'};border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;">
      <div style="transform:rotate(${Math.round(heading || 0)}deg);color:white;font-size:14px;line-height:1;">▲</div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });

const demoIcon = new L.DivIcon({
  className: 'custom-vehicle-marker',
  html: `<div style="background-color:#f59e0b;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.5);color:white;font-size:14px;">🚗</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

// Live positions of the organization's trackers. When no tracker has reported yet, the map shows
// the vehicles at placeholder positions so the page is not empty (clearly labelled as demo).
export default function LiveMap({ vehicles = [] }) {
  const { tr } = useT();
  const [live, setLive] = useState([]);
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let first = true;
    const load = async () => {
      try {
        const res = await trackingApi.live();
        if (cancelled || !res.success) return;
        setLive(res.data);
        if (first && res.data.length > 0) {
          first = false;
          setFitKey((k) => k + 1);
        }
      } catch {
        // keep the last known positions on a transient error
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const hasLive = live.length > 0;
  const onlineCount = live.filter((p) => p.online).length;

  // Улаанбаатар хотын төв координат (эхлэлийн төв)
  const defaultPosition = [47.9188, 106.9176];

  const demoVehicles = useMemo(
    () =>
      vehicles.map((v, index) => ({
        ...v,
        lat: 47.9188 + index * 0.012 - 0.01,
        lng: 106.9176 + index * 0.015 - 0.01
      })),
    [vehicles]
  );

  const fitPoints = hasLive ? live.map((p) => [p.lat, p.lng]) : [];
  const statusColor = hasLive ? (onlineCount > 0 ? 'text-emerald-400' : 'text-slate-400') : 'text-amber-400';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{tr('Live GPS tracking map')}</h2>
          <p className="text-xs text-slate-400">{tr('Vehicles currently active in road traffic')}</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="flex h-3 w-3 relative">
            {onlineCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${hasLive ? (onlineCount > 0 ? 'bg-emerald-500' : 'bg-slate-500') : 'bg-amber-500'}`}></span>
          </span>
          <span className={`text-xs font-medium ${statusColor}`}>
            {hasLive
              ? tr('{online} of {total} trackers online', { online: onlineCount, total: live.length })
              : tr('Demo position (no GPS device connected)')}
          </span>
        </div>
      </div>

      <div style={{ height: '420px', width: '100%', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <MapContainer center={defaultPosition} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          {/* OpenStreetMap үнэгүй хавтан */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={fitPoints} fitKey={fitKey} />

          {hasLive &&
            live.map((p) => (
              <Marker key={p.deviceId} position={[p.lat, p.lng]} icon={makeIcon(p.heading, p.online)}>
                <Popup>
                  <div className="text-slate-900 text-xs">
                    <p className="font-bold text-sm mb-1">{p.vehicle?.registrationNumber || p.name}</p>
                    {p.vehicle && <p><b>{tr('Model:')}</b> {[p.vehicle.brand, p.vehicle.model].filter(Boolean).join(' ')}</p>}
                    <p><b>{tr('Speed:')}</b> {p.speed ?? 0} {tr('km/h')}</p>
                    {p.ignition !== null && p.ignition !== undefined && (
                      <p><b>{tr('Ignition:')}</b> {p.ignition ? tr('On') : tr('Off')}</p>
                    )}
                    <p><b>{tr('Last update:')}</b> {p.timestamp ? new Date(p.timestamp).toLocaleString() : '—'}</p>
                    <p><b>{tr('Status:')}</b> <span className={p.online ? 'text-emerald-600 font-semibold' : 'text-slate-500 font-semibold'}>{p.online ? tr('Online') : tr('Offline')}</span></p>
                  </div>
                </Popup>
              </Marker>
            ))}

          {!hasLive &&
            demoVehicles.map((vehicle, idx) => (
              <Marker key={vehicle.id || vehicle._id || idx} position={[vehicle.lat, vehicle.lng]} icon={demoIcon}>
                <Popup>
                  <div className="text-slate-900 text-xs">
                    <p className="font-bold text-sm mb-1">{vehicle.registrationNumber || vehicle.plateNumber || vehicle.name || tr('Vehicle')}</p>
                    <p><b>{tr('Model:')}</b> {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || vehicle.vehicleType || tr('Unknown')}</p>
                    <p><b>{tr('Driver:')}</b> {vehicle.assignedDriver?.name || tr('Unassigned')}</p>
                    <p><b>{tr('Status:')}</b> {tr(vehicle.status || 'Active')}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}
