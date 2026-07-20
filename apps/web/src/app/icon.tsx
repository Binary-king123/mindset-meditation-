// Browser-tab favicon. Rendered as a PNG so every browser accepts it — the
// SVG in /public is the scalable source of the same mark.
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 55%, #22d3ee 100%)',
      }}
    >
      {/* Outer breath ring */}
      <div
        style={{
          position: 'absolute',
          width: 22,
          height: 22,
          borderRadius: 9999,
          border: '1.5px solid rgba(255,255,255,0.55)',
          display: 'flex',
        }}
      />
      {/* Inner ring */}
      <div
        style={{
          position: 'absolute',
          width: 13,
          height: 13,
          borderRadius: 9999,
          border: '1.8px solid rgba(255,255,255,0.9)',
          display: 'flex',
        }}
      />
      {/* Centre */}
      <div
        style={{ width: 5, height: 5, borderRadius: 9999, background: '#fff', display: 'flex' }}
      />
    </div>,
    size,
  );
}
