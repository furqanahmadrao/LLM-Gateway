import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds (Requirements 1.1, 1.2, 1.3)
        background: {
          DEFAULT: '#0A0A0A',
          secondary: '#111111',
        },
        panel: {
          DEFAULT: '#121212',
          hover: '#1A1A1A',
        },
        
        // Accent colors (Requirement 1.5)
        accent: {
          DEFAULT: '#FFA348',
          hover: '#FFB366',
          muted: 'rgba(255, 163, 72, 0.15)',
        },
        
        // LIVE indicator colors (Requirement 1.4)
        live: {
          DEFAULT: '#32FF89',
          bg: 'rgba(50, 255, 137, 0.2)',
          border: 'rgba(50, 255, 137, 0.3)',
        },
        
        // Text colors (Requirement 1.6)
        text: {
          primary: 'rgba(255, 255, 255, 0.9)',
          secondary: 'rgba(255, 255, 255, 0.5)',
          muted: 'rgba(255, 255, 255, 0.4)',
        },
        
        // Border colors (Requirement 1.7)
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.1)',
          subtle: 'rgba(255, 255, 255, 0.06)',
        },
        
        // Status colors
        status: {
          success: '#32FF89',
          error: '#FF4D4D',
          warning: '#FFB020',
        },
      },
      
      // Border radius (Requirements 6.1)
      borderRadius: {
        card: '8px',
        button: '6px',
        badge: '9999px',
      },
      
      // Typography (Requirements 5.1-5.7)
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Large metric values (Requirement 5.7)
        metric: ['32px', { lineHeight: '1', fontWeight: '600' }],
        'metric-sm': ['28px', { lineHeight: '1', fontWeight: '600' }],
        // Section headings (Requirement 5.6)
        heading: ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-lg': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        // Body text (Requirement 5.5)
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        // Small labels (Requirement 5.4)
        label: ['11px', { lineHeight: '1.4', letterSpacing: '0.05em', fontWeight: '500' }],
        // Metadata (Requirement 5.4)
        small: ['10px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      
      // Spacing (Requirement 6.1 - 8px base unit)
      spacing: {
        '4.5': '18px',
        '5.5': '22px',
      },
      
      // Box shadow for LIVE glow effect
      boxShadow: {
        'live-glow': '0 0 6px rgba(50, 255, 137, 0.6)',
      },
      
      // Animation for LIVE pulse
      animation: {
        'pulse-live': 'pulse-live 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
