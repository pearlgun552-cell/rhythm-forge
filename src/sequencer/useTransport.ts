import { useEffect, useState } from 'react';
import type { TransportSnapshot } from './Sequencer';
import { sequencer } from './transport';

const initialSnapshot: TransportSnapshot = { status: 'stopped', positionBeats: 0 };

export function useTransport(): TransportSnapshot {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  useEffect(() => sequencer.subscribe(setSnapshot), []);
  return snapshot;
}
