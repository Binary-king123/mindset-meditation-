// iOS home-screen icon. Same mark, larger, no transparency (iOS ignores it).
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 55%, #22d3ee 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 122,
          height: 122,
          borderRadius: 9999,
          border: '6px solid rgba(255,255,255,0.5)',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 74,
          height: 74,
          borderRadius: 9999,
          border: '7px solid rgba(255,255,255,0.85)',
          display: 'flex',
        }}
      />
      <div
        style={{ width: 30, height: 30, borderRadius: 9999, background: '#fff', display: 'flex' }}
      />
    </div>,
    size,
  );
}
