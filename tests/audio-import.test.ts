import test from "node:test";
import assert from "node:assert/strict";
import {
  importAudioFile,
  getAudioUploadMime,
  MAX_AUDIO_IMPORT_BYTES,
  AUDIO_PEAK_BINS,
} from "../apps/web/src/audio-import.ts";
import type {
  AudioContextAdapter,
  DecodedAudio,
  AudioImportFile,
} from "../apps/web/src/audio-import.ts";

const asset = {
  id: "uploaded",
  name: "track.wav",
  url: "/media/uploaded",
  duration: 0,
  peaks: [],
};
const file = (): AudioImportFile => ({
  name: "track.wav",
  size: 8,
  arrayBuffer: async () => new ArrayBuffer(8),
});
const decoded = (
  channels = [new Float32Array([0.5])],
  duration = 2,
): DecodedAudio => ({
  duration,
  numberOfChannels: channels.length,
  getChannelData: (index) => channels[index],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(buffer: DecodedAudio = decoded()) {
  let creates = 0,
    closes = 0,
    uploads = 0,
    decodes = 0;
  const options = {
    createAudioContext: (): AudioContextAdapter => {
      creates++;
      return {
        decodeAudioData: async () => {
          decodes++;
          return buffer;
        },
        close: async () => {
          closes++;
        },
      };
    },
    uploadFile: async (_file: AudioImportFile) => {
      uploads++;
      return asset;
    },
  };
  return { options, counts: () => ({ creates, closes, uploads, decodes }) };
}

test("production import flow measures stereo right-only peaks and uploads the original file once", async () => {
  const input = file(),
    right = new Float32Array(1400);
  right[1001] = -0.875;
  const h = harness(decoded([new Float32Array(1400), right], 12.5));
  let original: AudioImportFile | undefined;
  const result = await importAudioFile(input, {
    ...h.options,
    uploadFile: async (value) => {
      original = value;
      assert.equal(h.counts().closes, 1);
      return asset;
    },
  });
  assert.equal(original, input);
  assert.equal(result.status, "imported");
  if (result.status !== "imported") return;
  assert.equal(result.asset.duration, 12.5);
  assert.equal(result.asset.peaks.length, AUDIO_PEAK_BINS);
  assert.equal(result.asset.peaks[500], 0.875);
  assert.equal(result.asset.peaks.filter((p) => p !== 0).length, 1);
  assert.equal(result.asset.id, asset.id);
  assert.equal(asset.duration, 0);
  assert.deepEqual(asset.peaks, []);
  assert.deepEqual(h.counts(), {
    creates: 1,
    closes: 1,
    uploads: 0,
    decodes: 1,
  });
});

test("short channel arrays fill their time bins with actual peaks, including a single sample", async () => {
  const h = harness(decoded([new Float32Array([-0.25, 0.75])]));
  const result = await importAudioFile(file(), h.options);
  assert.equal(result.status, "imported");
  if (result.status !== "imported") return;
  assert.deepEqual(result.asset.peaks.slice(0, 350), new Array(350).fill(0.25));
  assert.deepEqual(result.asset.peaks.slice(350), new Array(350).fill(0.75));
  const one = harness(decoded([new Float32Array([-0.5])]));
  const single = await importAudioFile(file(), one.options);
  assert.equal(single.status, "imported");
  if (single.status === "imported")
    assert.deepEqual(single.asset.peaks, new Array(700).fill(0.5));
});

test("invalid files are rejected before reading, decoding, context creation or uploading", async () => {
  for (const patch of [
    { size: 0 },
    { size: -1 },
    { size: NaN },
    { size: 1.5 },
    { size: MAX_AUDIO_IMPORT_BYTES + 1 },
    { name: " " },
  ]) {
    const h = harness();
    let reads = 0;
    await assert.rejects(
      importAudioFile(
        {
          ...file(),
          ...patch,
          arrayBuffer: async () => {
            reads++;
            throw new Error("must not read");
          },
        },
        h.options,
      ),
      /nonempty audio file/,
    );
    assert.equal(reads, 0);
    assert.deepEqual(h.counts(), {
      creates: 0,
      closes: 0,
      uploads: 0,
      decodes: 0,
    });
  }
  const h = harness();
  await assert.rejects(
    importAudioFile(
      { ...file(), arrayBuffer: async () => new ArrayBuffer(0) },
      h.options,
    ),
    /read completely/,
  );
  assert.equal(h.counts().creates, 0);
  assert.equal(h.counts().uploads, 0);
});

test("decode rejection always closes the context and never uploads; close failure cannot mask it", async () => {
  for (const closeFails of [false, true]) {
    const actual = new Error("codec decode failed");
    let closes = 0,
      uploads = 0;
    await assert.rejects(
      importAudioFile(file(), {
        createAudioContext: () => ({
          decodeAudioData: async () => {
            throw actual;
          },
          close: async () => {
            closes++;
            if (closeFails) throw new Error("close failed");
          },
        }),
        uploadFile: async () => {
          uploads++;
          return asset;
        },
      }),
      (error) => error === actual,
    );
    assert.equal(closes, 1);
    assert.equal(uploads, 0);
  }
});

test("successful decoding survives cleanup failure and retains measured metadata", async () => {
  const h = harness();
  const result = await importAudioFile(file(), {
    ...h.options,
    createAudioContext: () => ({
      decodeAudioData: async () => decoded(),
      close: async () => {
        throw new Error("cleanup");
      },
    }),
  });
  assert.equal(result.status, "imported");
  if (result.status === "imported") assert.equal(result.asset.duration, 2);
  assert.equal(h.counts().uploads, 1);
});

test("superseded during decode returns ignored after closing and skips upload", async () => {
  const decode = deferred<DecodedAudio>();
  let current = true,
    closes = 0,
    uploads = 0;
  const started = deferred<void>();
  const pending = importAudioFile(file(), {
    isCurrent: () => current,
    createAudioContext: () => ({
      decodeAudioData: () => {
        started.resolve();
        return decode.promise;
      },
      close: async () => {
        closes++;
      },
    }),
    uploadFile: async () => {
      uploads++;
      return asset;
    },
  });
  await started.promise;
  current = false;
  decode.resolve(decoded());
  assert.deepEqual(await pending, { status: "ignored" });
  assert.equal(closes, 1);
  assert.equal(uploads, 0);
});

test("superseded while upload is pending cannot attach the outdated asset", async () => {
  const upload = deferred<typeof asset>(),
    started = deferred<void>();
  const h = harness();
  let current = true;
  const pending = importAudioFile(file(), {
    ...h.options,
    isCurrent: () => current,
    uploadFile: async () => {
      started.resolve();
      return upload.promise;
    },
  });
  await started.promise;
  current = false;
  upload.resolve(asset);
  assert.deepEqual(await pending, { status: "ignored" });
  assert.equal(h.counts().closes, 1);
});

test("aborted imports are ignored before work and after reading or uploading, including upload rejection", async () => {
  const controller = new AbortController();
  controller.abort();
  const h = harness();
  assert.deepEqual(
    await importAudioFile(file(), { ...h.options, signal: controller.signal }),
    { status: "ignored" },
  );
  assert.equal(h.counts().creates, 0);
  const reading = new AbortController();
  const afterRead = harness();
  assert.deepEqual(
    await importAudioFile(
      {
        ...file(),
        arrayBuffer: async () => {
          reading.abort();
          return new ArrayBuffer(8);
        },
      },
      { ...afterRead.options, signal: reading.signal },
    ),
    { status: "ignored" },
  );
  assert.equal(afterRead.counts().creates, 0);
  const uploading = new AbortController();
  const duringUpload = harness();
  let forwarded: AbortSignal | undefined;
  assert.deepEqual(
    await importAudioFile(file(), {
      ...duringUpload.options,
      signal: uploading.signal,
      uploadFile: async (_file, signal) => {
        forwarded = signal;
        uploading.abort();
        throw new Error("upload aborted");
      },
    }),
    { status: "ignored" },
  );
  assert.equal(forwarded, uploading.signal);
  assert.equal(duringUpload.counts().closes, 1);
});

test("invalid decoded duration, channels, empty arrays and nonfinite samples close without upload", async () => {
  const invalid: DecodedAudio[] = [
    decoded(undefined, 0),
    decoded(undefined, Infinity),
    decoded(undefined, 86400.01),
    decoded([], 1),
    { ...decoded(), numberOfChannels: 1.5 },
    { ...decoded(), numberOfChannels: 33 },
    decoded([new Float32Array()]),
    decoded([new Float32Array([0, NaN])]),
    decoded([new Float32Array([Infinity])]),
  ];
  for (const buffer of invalid) {
    const h = harness(buffer);
    await assert.rejects(importAudioFile(file(), h.options), /decoded audio/);
    assert.equal(h.counts().closes, 1);
    assert.equal(h.counts().uploads, 0);
  }
});

test("missing default browser decoder reports a supported-browser explanation before upload", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "AudioContext",
  );
  let uploads = 0;
  try {
    Object.defineProperty(globalThis, "AudioContext", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    await assert.rejects(
      importAudioFile(file(), {
        uploadFile: async () => {
          uploads++;
          return asset;
        },
      }),
      /browser that supports Web Audio/,
    );
    assert.equal(uploads, 0);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "AudioContext", descriptor);
    else delete (globalThis as any).AudioContext;
  }
});

test("blank-type WAV transport MIME conforms to production offline media inspection", async () => {
  const { inspectAudio } = await import("../apps/server/media.mjs");
  // A complete tiny mono, 16-bit PCM RIFF/WAVE file: 4 real sample frames.
  const bytes = Buffer.alloc(52);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(8, 40);
  [0, 8192, -8192, 0].forEach((sample, index) =>
    bytes.writeInt16LE(sample, 44 + index * 2),
  );
  const name = "SYNTHETIC.WAV",
    mime = getAudioUploadMime({ name, type: "" });
  assert.equal(mime, "audio/wav");
  assert.deepEqual(inspectAudio(bytes, name, mime), {
    ext: "wav",
    mime: "audio/wav",
  });
  assert.throws(
    () => inspectAudio(bytes, name, "application/octet-stream"),
    (error: any) => error.status === 415,
  );
  assert.throws(
    () => inspectAudio(bytes, name, "audio/mp4"),
    (error: any) => error.status === 415,
  );
  const wrongSignature = Buffer.from(bytes);
  wrongSignature.write("NOPE", 0);
  assert.throws(
    () => inspectAudio(wrongSignature, name, mime),
    (error: any) => error.status === 415,
  );
  assert.throws(
    () => inspectAudio(bytes, "misnamed.mp3", mime),
    (error: any) => error.status === 415,
  );
});

test("a monotonic caller scope allows only the newest import to return an attachable result", async () => {
  let sequence = 0;
  const firstDecode = deferred<DecodedAudio>(),
    started = deferred<void>(),
    h = harness();
  const firstSequence = ++sequence;
  const first = importAudioFile(file(), {
    ...h.options,
    isCurrent: () => sequence === firstSequence,
    createAudioContext: () => ({
      decodeAudioData: () => {
        started.resolve();
        return firstDecode.promise;
      },
      close: async () => {},
    }),
  });
  await started.promise;
  const secondSequence = ++sequence;
  const second = await importAudioFile(file(), {
    ...h.options,
    isCurrent: () => sequence === secondSequence,
  });
  firstDecode.resolve(decoded());
  assert.equal(second.status, "imported");
  assert.deepEqual(await first, { status: "ignored" });
  assert.equal(h.counts().uploads, 1);
});

test("upload MIME fallback covers empty browser types without overriding explicit incompatible types", () => {
  assert.equal(
    getAudioUploadMime({ name: "TRACK.WAV", type: "" }),
    "audio/wav",
  );
  assert.equal(getAudioUploadMime({ name: "recording.m4a" }), "audio/mp4");
  assert.equal(
    getAudioUploadMime({
      name: "recording.m4a",
      type: "application/octet-stream",
    }),
    "audio/mp4",
  );
  for (const [extension, mime] of Object.entries({
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/opus",
  }))
    assert.equal(getAudioUploadMime({ name: `file.${extension}` }), mime);
  assert.equal(
    getAudioUploadMime({ name: "track.wav", type: "audio/x-wav" }),
    "audio/x-wav",
  );
  assert.equal(
    getAudioUploadMime({ name: "track.ogg", type: "application/ogg" }),
    "application/ogg",
  );
  assert.equal(
    getAudioUploadMime({ name: "track.m4a", type: "video/mp4" }),
    "audio/mp4",
  );
  assert.equal(
    getAudioUploadMime({ name: "track.wav", type: "video/mp4" }),
    "video/mp4",
  );
  assert.equal(
    getAudioUploadMime({ name: "track.wav", type: "text/plain" }),
    "text/plain",
  );
  assert.equal(
    getAudioUploadMime({ name: "unknown.bin", type: "" }),
    "application/octet-stream",
  );
  assert.equal(
    getAudioUploadMime({ name: "noextension" }),
    "application/octet-stream",
  );
  assert.equal(
    getAudioUploadMime({ name: "track.__proto__" }),
    "application/octet-stream",
  );
  assert.equal(
    getAudioUploadMime({ name: "track.constructor" }),
    "application/octet-stream",
  );
});
