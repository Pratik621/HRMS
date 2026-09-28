import React from 'react';
import { Clock3, Timer } from 'lucide-react';

export default function BreakTypeIcon({ type }) {
  const Icon = type === 'lunch_break' ? Clock3 : Timer;
  return <Icon size="1em" strokeWidth={1.8} aria-hidden="true" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} />;
}
