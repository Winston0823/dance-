import { createReadStream } from "node:fs";

export const AUDIO_LIMIT = 30 * 1024 * 1024;
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function readBody(req, limit = 2 * 1024 * 1024) {
  if (Number(req.headers["content-length"]) > limit)
    throw new HttpError(413, "Request exceeds size limit.");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request exceeds size limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  if (
    req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "Content-Type must be application/json.");
  const body = await readBody(req);
  try {
    const value = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "Expected a JSON object.");
  }
}

export function inspectAudio(data, name, contentType) {
  const ext = name.toLowerCase().split(".").pop();
  const mime = contentType?.split(";")[0].toLowerCase();
  const ascii = (a, b) => data.toString("ascii", a, b);
  if (
    ext === "wav" &&
    ["audio/wav", "audio/x-wav", "audio/wave"].includes(mime) &&
    data.length >= 44 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WAVE"
  ) {
    return { ext: "wav", mime: "audio/wav" };
  }
  if (
    ext === "mp3" &&
    ["audio/mpeg", "audio/mp3"].includes(mime) &&
    data.length >= 10 &&
    (ascii(0, 3) === "ID3" || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0))
  ) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (
    ["m4a", "mp4"].includes(ext) &&
    ["audio/mp4", "audio/x-m4a"].includes(mime) &&
    data.length >= 24 &&
    ascii(4, 8) === "ftyp" &&
    /M4A |isom|mp4[12]|M4B /.test(ascii(8, Math.min(data.length, 64)))
  ) {
    return { ext: "m4a", mime: "audio/mp4" };
  }
  if (
    ["ogg", "oga", "opus"].includes(ext) &&
    ["audio/ogg", "audio/opus", "application/ogg"].includes(mime) &&
    data.length >= 32 &&
    ascii(0, 4) === "OggS" &&
    (data.includes(Buffer.from("OpusHead")) ||
      data.includes(Buffer.from("vorbis")))
  ) {
    return { ext: "ogg", mime: "audio/ogg" };
  }
  throw new HttpError(
    415,
    "Audio must have matching MP3, M4A, WAV, or Ogg filename, MIME type, and file signature.",
  );
}

export function streamFile(req, res, filePath, size, mime, extraHeaders = {}) {
  const headers = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Content-Length": size,
    ...extraHeaders,
  };
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, {
        ...headers,
        "Content-Range": `bytes */${size}`,
        "Content-Length": 0,
      });
      res.end();
      return;
    }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
    }
    end = Math.min(end, size - 1);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= size
    ) {
      res.writeHead(416, {
        ...headers,
        "Content-Range": `bytes */${size}`,
        "Content-Length": 0,
      });
      res.end();
      return;
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = end - start + 1;
  }
  res.writeHead(status, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(filePath, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
