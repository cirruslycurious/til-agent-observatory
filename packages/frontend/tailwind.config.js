/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tactical theme semantic tokens
        background: 'hsl(var(--background))',
        'background-elevated': 'hsl(var(--background-elevated))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        border: 'hsl(var(--border))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow: 'hsl(var(--primary-glow))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          glow: 'hsl(var(--accent-glow))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          glow: 'hsl(var(--success-glow))',
        },
        role: {
          worker: 'hsl(var(--role-worker))',
          manager: 'hsl(var(--role-manager))',
          system: 'hsl(var(--role-system))',
          evaluator: 'hsl(var(--role-evaluator))',
        },
        // Legacy compatibility
        ink: 'var(--ink)',
        slate: 'var(--slate)',
        panel: 'var(--panel)',
        mutedfg: 'var(--muted-foreground)',
        amber: 'var(--amber)',
        emerald: 'var(--emerald)',
        iris: 'var(--iris)',
        steel: 'var(--steel)',
        sky: 'var(--sky)',
        'agent-manager': 'hsl(var(--agent-manager))',
        'agent-worker': 'hsl(var(--agent-worker))',
        'agent-evaluator': 'hsl(var(--agent-evaluator))',
        'agent-system': 'hsl(var(--agent-system))',
      },
      boxShadow: {
        tactical: '0 8px 24px rgba(0,0,0,0.35)',
      },
      fontFamily: {
        display: ['"Inter Tight"', 'Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
