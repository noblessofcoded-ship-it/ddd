import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { boundsOf } from '../lib/geo';
import type { LatLng, Place, RankedParking } from '../types';

type Props = {
  /** 目的地。地図から指定する途中では未確定なので null を許す */
  destination: Place | null;
  origin: Place | null;
  lots: RankedParking[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 指定すると地図のクリックで地点を選べるようになる */
  onPick?: (point: LatLng) => void;
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

export function MapView({ destination, origin, lots, selectedId, onSelect, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // onSelect の再生成でマーカーを貼り直さずに済むよう ref 経由で呼ぶ
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      onPickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

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

    // 地点指定中はマーカーがクリックを飲み込まないようにする。
    // 地点が 1 つだけだとそれが地図の中心に来るため、一番押したい場所が
    // マーカーに塞がれて地図のクリックが発火しなくなる。
    const interactive = !onPick;

    if (destination) {
      L.marker(destination, { icon: pinIcon('destination', '目'), zIndexOffset: 500, interactive })
        .bindTooltip(destination.name, { direction: 'top' })
        .addTo(layer);
    }

    if (origin) {
      L.marker(origin, { icon: pinIcon('origin', '出'), zIndexOffset: 400, interactive })
        .bindTooltip(origin.name, { direction: 'top' })
        .addTo(layer);
    }

    lots.forEach((lot, index) => {
      const isSelected = lot.id === selectedId;
      const marker = L.marker(lot, {
        icon: pinIcon(isSelected ? 'parking-selected' : 'parking', String(index + 1)),
        zIndexOffset: isSelected ? 300 : 0,
        interactive,
      })
        .bindTooltip(`${lot.name}（徒歩${lot.walkMinutes}分）`, { direction: 'top' })
        .addTo(layer);
      marker.on('click', () => onSelectRef.current(lot.id));
    });

    const selected = lots.find((lot) => lot.id === selectedId);
    if (selected && destination) {
      L.polyline([selected, destination], {
        // 地図の上でも差し色は使わない。墨の破線で歩く区間を示す
        color: '#1c1b18',
        weight: 2,
        opacity: 0.75,
        dashArray: '2 5',
        lineCap: 'round',
        interactive,
      }).addTo(layer);
    }

    const bounds = boundsOf([
      ...(destination ? [destination] : []),
      ...(origin ? [origin] : []),
      ...lots,
    ]);
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } else {
      // 目的地も出発地も無い状態（地図から指定する場合）は日本全体を映す
      map.setView([36.2048, 138.2529], 5);
    }
  }, [destination, origin, lots, selectedId, onPick]);

  return (
    <div
      className={`map ${onPick ? 'map--picking' : ''}`}
      ref={containerRef}
      role="application"
      aria-label="地図"
    />
  );
}
