<p align="center">
  <img src="website/public/logo.png" alt="Koto" width="120" />
</p>

<h1 align="center">Koto</h1>

<p align="center">
  Speech-to-text dictation. Local. Private. Fast.
</p>

<p align="center">
  <a href="https://github.com/gangula-karthik/Kotoba/releases">Download</a>
</p>

---

Koto is a lightweight desktop dictation app that transcribes your speech locally using [Whisper.cpp](https://github.com/ggerganov/whisper.cpp). No cloud, no API keys — everything runs on your machine.

## Built With

- [Electron](https://www.electronjs.org/) — Desktop runtime
- [React](https://react.dev/) — UI framework
- [Vite](https://vite.dev/) — Build tool
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [shadcn/ui](https://ui.shadcn.com/) — Component library
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Local speech-to-text (C++ native addon)
- [Silero VAD](https://github.com/snakers4/silero-vad) — Voice activity detection

## Platforms

- macOS (arm64)
- Windows
- Linux

## Development

```bash
npm install
npm run electron:dev
```

## Build

```bash
npm run electron:build
```

## License

Open source.
