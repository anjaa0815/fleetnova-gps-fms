import React from 'react';
import clixLogo from '../assets/clix-logo.png';

// The CLIX (Information solutions / Systems Engineering Mongolia) logo on a white chip: the logo has dark lettering,
// so it needs a light background on the dark theme. `width` is the width of the logo itself, the chip adds its padding.
const RATIO = 529 / 176;

export default function ClixLogo({ width = 150, padding = 6, style }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-md)',
        padding: `${padding}px`,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
        flexShrink: 0,
        ...style
      }}
    >
      <img src={clixLogo} alt="CLIX Information solutions / Systems Engineering Mongolia" width={width} height={Math.round(width / RATIO)} style={{ display: 'block', width, height: 'auto' }} />
    </div>
  );
}
