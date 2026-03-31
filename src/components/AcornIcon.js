import React from 'react';

export default function AcornIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#7c6ff7" />
      <path d="M10 11h8a5 5 0 0 1 0 10h-4v4H10V11Z" fill="#fff" />
      <circle cx="26" cy="25" r="3" fill="#4ade80" />
    </svg>
  );
}
