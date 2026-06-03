'use client';
import Chip from './Chip';

function ToothChip({ tooth }) {
  if (tooth == null) return null;
  return <Chip label={'Tooth ' + tooth} tone="neutral" />;
}

export default ToothChip;
