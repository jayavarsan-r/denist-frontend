'use client';

export default function TopBar({ children, style }) {
  return <div style={{ paddingTop: 56, ...style }}>{children}</div>;
}
