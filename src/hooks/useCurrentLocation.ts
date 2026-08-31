import { useCallback, useState } from 'react';
import type { Place } from '../types';

type State = {
  place: Place | null;
  loading: boolean;
  error: string | null;
};

const INITIAL: State = { place: null, loading: false, error: null };

/** 端末の現在地を出発地として取得する */
export function useCurrentLocation() {
  const [state, setState] = useState<State>(INITIAL);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ place: null, loading: false, error: 'この端末では現在地を取得できません' });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          loading: false,
          error: null,
          place: {
            id: 'current-location',
            name: '現在地',
            address: '端末の位置情報',
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? '位置情報の利用が許可されていません'
            : '現在地を取得できませんでした';
        setState({ place: null, loading: false, error: message });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const clear = useCallback(() => setState(INITIAL), []);

  return { ...state, request, clear };
}
