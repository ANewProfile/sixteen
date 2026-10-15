import type { Metadata } from 'next';
import { Game } from '../game';

export const metadata: Metadata = { title: 'Infinite · SIXTEEN' };

export default function InfinitePage() {
  return <Game mode="infinite" />;
}
