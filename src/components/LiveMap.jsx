import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet-ийн үндсэн маркер дүрсийг тохируулах
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Машины тусгай ногоон/цэнхэр маркер үүсгэх
const vehicleIcon = new L.DivIcon({
  className: 'custom-vehicle-marker',
  html: `<div style="background-color: #3b82f6; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); color: white; font-size: 14px;">🚗</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

export default function LiveMap({ vehicles = [] }) {
  // Улаанбаатар хотын төв координат (эхлэлийн төв)
  const defaultPosition = [47.9188, 106.9176];

  // Хэрэв координатууд ирээгүй бол демо координатууд оноох
  const mappedVehicles = vehicles.map((v, index) => ({
    ...v,
    lat: v.lat || 47.9188 + (index * 0.012) - 0.01,
    lng: v.lng || 106.9176 + (index * 0.015) - 0.01,
    speed: v.speed || Math.floor(Math.random() * 40 + 20),
  }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Бодит цагийн GPS газрын зураг (Live Tracking)</h2>
          <p className="text-xs text-slate-400">Идэвхтэй замын хөдөлгөөнд оролцож буй тээврийн хэрэгслүүд</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-emerald-400 font-medium">Шууд холбогдсон</span>
        </div>
      </div>

      <div style={{ height: '420px', width: '100%', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <MapContainer
          center={defaultPosition}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          {/* OpenStreetMap үнэгүй хавтан */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {mappedVehicles.map((vehicle, idx) => (
            <Marker
              key={vehicle.id || vehicle._id || idx}
              position={[vehicle.lat, vehicle.lng]}
              icon={vehicleIcon}
            >
              <Popup>
                <div className="text-slate-900 text-xs">
                  <p className="font-bold text-sm mb-1">{vehicle.plateNumber || vehicle.name || 'Тээврийн хэрэгсэл'}</p>
                  <p><b>Загвар:</b> {vehicle.model || vehicle.type || 'Тодорхойгүй'}</p>
                  <p><b>Жолооч:</b> {vehicle.driver || 'Оноогоогүй'}</p>
                  <p><b>Хурд:</b> {vehicle.speed} км/цаг</p>
                  <p><b>Төлөв:</b> <span className="text-emerald-600 font-semibold">{vehicle.status || 'Идэвхтэй'}</span></p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}