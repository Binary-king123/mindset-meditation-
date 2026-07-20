// Social share card, rendered at the edge. Used by every page that doesn't
// supply its own image, so links never unfurl bare.
import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';

export const runtime = 'edge';
export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(160deg, #1a1040 0%, #0d0824 45%, #0b1030 100%)',
        position: 'relative',
      }}
    >
      {/* Aura */}
      <div
        style={{
          position: 'absolute',
          top: -180,
          left: -120,
          width: 700,
          height: 700,
          borderRadius: 9999,
          background: 'radial-gradient(circle, rgba(139,92,246,0.55), rgba(139,92,246,0) 70%)',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -220,
          right: -140,
          width: 720,
          height: 720,
          borderRadius: 9999,
          background: 'radial-gradient(circle, rgba(34,211,238,0.4), rgba(34,211,238,0) 70%)',
          display: 'flex',
        }}
      />

      {/* Breath rings */}
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: 9999,
          border: '1px solid rgba(255,255,255,0.10)',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: 9999,
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 55%, #22d3ee 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.95)',
              display: 'flex',
            }}
          />
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: 'rgba(255,255,255,0.82)', fontWeight: 600 }}>
          {BRAND.name}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: 74,
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: -2,
          lineHeight: 1.1,
        }}
      >
        Transform your mind,
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 74,
          fontWeight: 800,
          letterSpacing: -2,
          lineHeight: 1.1,
          background: 'linear-gradient(90deg, #a78bfa, #22d3ee 60%, #f472b6)',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        transform your life.
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 36,
          fontSize: 26,
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        Guided meditations for sleep, stress &amp; focus
      </div>
    </div>,
    size,
  );
}
