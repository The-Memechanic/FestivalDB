# FN Jam Track Retrieval

## How to Run

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The application will be available in your browser.

To refresh the complete track catalog, run:

```bash
npm run update-tracks
```

Track previews are generated on demand when a track page is opened. The server
requires FFmpeg with `libopus` support installed to convert the provider's DASH
preview into the audio player format.