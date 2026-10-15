import type { Metadata } from 'next';
import { Game } from '../game';

export const metadata: Metadata = { title: 'Daily · SIXTEEN' };

export default function DailyPage() {
  return <Game mode="daily" />;
}
