// Required for Tailwind CSS v3 to process globals.css (was missing — utilities
// weren't being generated, so the app rendered unstyled).
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
