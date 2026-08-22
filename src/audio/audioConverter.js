// lamejs is an older CommonJS package — Vite/Rollup's CJS interop can
// land its exports on the default export OR flatten them directly onto
// the module namespace depending on the exact build, and that can differ
// between dev and a production build. Checking for Mp3Encoder in both
// spots handles either shape without needing to guess which one applies.
import * as lamejsModule from "lamejs";
const lamejs = lamejsModule.Mp3Encoder ? lamejsModule : lamejsModule.default;

import { getAudioContext, acquireSlot, releaseSlot } from "./waveform.js";

const MP3_BITRATE_KBPS = 192;
// lamejs encodes in fixed-size sample blocks — this is the size its own
// examples/docs use. Yielding back to the event loop between blocks (see
// the `await` in the encode loop below) keeps a long track from freezing
// the UI while it encodes.
const SAMPLES_PER_BLOCK = 1152;

function floatTo16BitPCM(floatSamples) {
  const out = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

async function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Converts one audio file to MP3 bytes — source format doesn't matter
// beyond "something Chromium's Web Audio can decode" (ogg, wav, flac,
// m4a/aac, opus, webm — see CONVERTIBLE_EXTENSIONS in main.js for the
// exact list Disc offers in the file picker). Doesn't write anything to
// disk itself — just hands back the encoded bytes plus the source
// track's duration, so the caller can report progress and decide where
// the result goes.
export async function convertToMp3(filePath, { onBlockProgress } = {}) {
  if (!window.disc) throw new Error("Not running inside Disc");
  if (!lamejs?.Mp3Encoder) {
    throw new Error(
      "MP3 encoder didn't load correctly — try running npm install again and rebuilding."
    );
  }

  await acquireSlot();
  let audioBuffer;
  try {
    const bytes = await window.disc.readAudioFile(filePath);
    if (!bytes) throw new Error("Couldn't read the file");
    const ctx = getAudioContext();
    // decodeAudioData detaches/consumes the buffer it's given, so slice()
    // a fresh copy — the same pattern already used for waveform decoding.
    audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
  } finally {
    releaseSlot();
  }

  const channels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const left16 = floatTo16BitPCM(audioBuffer.getChannelData(0));
  const right16 = channels === 2 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;

  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, MP3_BITRATE_KBPS);
  const mp3Chunks = [];
  const totalSamples = left16.length;

  for (let i = 0; i < totalSamples; i += SAMPLES_PER_BLOCK) {
    const leftBlock = left16.subarray(i, i + SAMPLES_PER_BLOCK);
    const chunk = right16
      ? encoder.encodeBuffer(leftBlock, right16.subarray(i, i + SAMPLES_PER_BLOCK))
      : encoder.encodeBuffer(leftBlock);
    if (chunk.length > 0) mp3Chunks.push(chunk);

    if (i % (SAMPLES_PER_BLOCK * 40) === 0) {
      onBlockProgress?.(i / totalSamples);
      await yieldToUI();
    }
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) mp3Chunks.push(finalChunk);

  const totalLength = mp3Chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return { mp3Bytes: result, durationSeconds: audioBuffer.duration };
}
