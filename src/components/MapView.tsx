import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { boundsOf } from '../lib/geo';
import type { Place, RankedParking } from '../types';

type Props = {
  destination: Place;
  origin: Place | null;
  lots: RankedParking[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function pinIcon(variant: 'destination' | 'origin' | 'parking' | 'parking-selected', label: string) {
  return L.divIcon({
    className: '',
    html: `<span class="pin pin--${variant}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function MapView({ destination, origin, lots, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // onSelect の再生成でマーカーを貼り直さずに済むよう ref 経由で呼ぶ
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    L.marker(destination, { icon: pinIcon('destination', '目') , zIndexOffset: 500 })
      .bindTooltip(destination.name, { direction: 'top' })
      .addTo(layer);

    if (origin) {
      L.marker(origin, { icon: pinIcon('origin', '出'), zIndexOffset: 400 })
        .bindTooltip(origin.name, { direction: 'top' })
        .addTo(layer);
    }

    lots.forEach((lot, index) => {
      const isSelected = lot.id === selectedId;
      const marker = L.marker(lot, {
        icon: pinIcon(isSelected ? 'parking-selected' : 'parking', String(index + 1)),
        zIndexOffset: isSelected ? 300 : 0,
      })
        .bindTooltip(`${lot.name}（徒歩${lot.walkMinutes}分）`, { direction: 'top' })
        .addTo(layer);
      marker.on('click', () => onSelectRef.current(lot.id));
    });

    const selected = lots.find((lot) => lot.id === selectedId);
    if (selected) {
      L.polyline([selected, destination], {
        color: '#2563eb',
        weight: 3,
        dashArray: '6 6',
      }).addTo(layer);
    }

    const bounds = boundsOf([destination, ...(origin ? [origin] : []), ...lots]);
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [destination, origin, lots, selectedId]);

  return <div className="map" ref={containerRef} role="application" aria-label="地図" />;
}
