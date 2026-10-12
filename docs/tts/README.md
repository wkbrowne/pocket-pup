# Reading voice

Files for the game's built-in reading voice. Everything runs on the device.

- `voice.onnx`, `voice.json` — Piper voice `en_US-hfc_female-medium` from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices), trained on the Hi-Fi-CAPTAIN corpus (CC BY-NC-SA 4.0: non-commercial use, with credit).
- `ort.wasm.min.js`, `ort-wasm-simd.wasm` — onnxruntime-web 1.17.3 (MIT).
- `phonemizer.js` — phonemizer 1.2.1 (Apache-2.0; includes eSpeak NG, GPL-3.0).
