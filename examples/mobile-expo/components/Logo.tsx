/**
 * FortressAuth - Logo Component for React Native
 * SVG logo rendered using react-native-svg.
 */

import type React from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

interface LogoProps {
  width?: number;
  height?: number;
}

export const Logo: React.FC<LogoProps> = ({ width = 64, height = 64 }) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#1e3a5f" stopOpacity={1} />
          <Stop offset="100%" stopColor="#0d1b2a" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="towerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#3d5a80" stopOpacity={1} />
          <Stop offset="100%" stopColor="#1e3a5f" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#4ecdc4" stopOpacity={1} />
          <Stop offset="100%" stopColor="#44a08d" stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {/* Main Shield Shape */}
      <Path
        d="M50 5 L90 20 L90 45 Q90 75 50 95 Q10 75 10 45 L10 20 Z"
        fill="url(#shieldGrad)"
        stroke="#4ecdc4"
        strokeWidth={2}
      />

      {/* Shield Inner Border */}
      <Path
        d="M50 12 L82 24 L82 44 Q82 70 50 87 Q18 70 18 44 L18 24 Z"
        fill="none"
        stroke="#4ecdc4"
        strokeWidth={0.5}
        opacity={0.4}
      />

      {/* FA Monogram */}
      <G id="faMonogram">
        {/* Letter F */}
        <Rect x={28} y={32} width={10} height={32} fill="url(#towerGrad)" rx={1} />
        <Rect x={38} y={32} width={14} height={8} fill="url(#towerGrad)" rx={1} />
        <Rect x={38} y={46} width={10} height={6} fill="url(#towerGrad)" rx={1} />

        {/* Arrow Slits on F */}
        <Rect x={31} y={44} width={3} height={6} fill="#0d1b2a" rx={0.5} />
        <Rect x={31} y={54} width={3} height={6} fill="#0d1b2a" rx={0.5} />

        {/* Letter A - Upright */}
        <Polygon points="56,64 62,64 62,32 56,32" fill="url(#towerGrad)" />
        <Polygon points="68,64 74,64 74,32 68,32" fill="url(#towerGrad)" />
        <Rect x={56} y={32} width={18} height={8} fill="url(#towerGrad)" rx={1} />
        <Rect x={62} y={48} width={6} height={6} fill="url(#towerGrad)" rx={0.5} />

        {/* Arrow Slits on A */}
        <Rect x={57.5} y={44} width={3} height={6} fill="#0d1b2a" rx={0.5} />
        <Rect x={57.5} y={54} width={3} height={6} fill="#0d1b2a" rx={0.5} />
        <Rect x={69.5} y={44} width={3} height={6} fill="#0d1b2a" rx={0.5} />
        <Rect x={69.5} y={54} width={3} height={6} fill="#0d1b2a" rx={0.5} />
      </G>

      {/* Keyhole */}
      <G id="keyhole" transform="translate(50, 74)">
        <Circle cx={0} cy={-4} r={3} fill="#4ecdc4" />
        <Rect x={-1.5} y={-4} width={3} height={6} fill="#4ecdc4" />
      </G>
    </Svg>
  );
};

export default Logo;
