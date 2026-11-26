import { createServer } from "node:http";
import {
  existsSync,
  statSync,
  writeFileSync,
  unlinkSync,
  lstatSync,
} from "node:fs";
import { resolve, join, extname, basename, sep, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDemoDocument,
  ensurePaths,
  validateDocument,
  analyzeDocument,
} from "../../packages/core/src/index.ts";
import { openStore, transaction, hash, token, uid } from "./storage.mjs";
import {
  HttpError,
  readJson,
  readBody,
  AUDIO_LIMIT,
  inspectAudio,
  streamFile,
} from "./media.mjs";
import {
  isLoopback,
  sameSecret,
  requestAuthority,
  checkWriteOrigin,
  readSession,
  setSession,
  clearSession,
  requireEditor,
  requireReader,
} from "./auth.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const now = () => new Date().toISOString();
const text = (value, name, max = 120) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpError(400, `${name} must contain 1–${max} characters.`);
  return value.trim();
};
const expectedVersion = (value) => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new HttpError(400, "expectedVersion must be a positive integer.");
  return value;
};

export function createApp(options = {}) {
  const dataDir = resolve(
    options.dataDir ?? process.env.DATA_DIR ?? join(root, ".data"),
  );
  const ownerPassword =
    options.ownerPassword ?? process.env.OWNER_PASSWORD ?? "";
  if (
    typeof ownerPassword !== "string" ||
    (ownerPassword && !ownerPassword.trim())
  )
    throw new Error("OWNER_PASSWORD must not be whitespace.");
  const allowLocalBootstrap = options.allowLocalBootstrap ?? !ownerPassword;
  const staticDir = resolve(options.staticDir ?? join(root, "dist/web"));
  const db = openStore(dataDir);
  const failures = new Map();

  function getProject(id) {
    const row = db.prepare("SELECT * FROM routines WHERE id = ?").get(id);
    if (!row) throw new HttpError(404, "Project not found.");
    return row;
  }
  function revisionFor(row, revisionNumber) {
    const revision =
      revisionNumber == null
        ? db
            .prepare("SELECT * FROM revisions WHERE id = ?")
            .get(row.published_revision_id ?? "")
        : db
            .prepare(
              "SELECT * FROM revisions WHERE routine_id = ? AND revision_number = ?",
            )
            .get(row.id, revisionNumber);
    if (!revision) throw new HttpError(404, "Published revision not found.");
    return revision;
  }
  function projectRecord(row, role = "editor") {
    const published = row.published_revision_id ? revisionFor(row) : null;
    if (role === "viewer") {
      if (!published) throw new HttpError(404, "No published plan yet.");
      return {
        id: row.id,
        document: JSON.parse(published.document),
        version: published.draft_version,
        publishedRevision: published.revision_number,
        updatedAt: published.created_at,
        role,
      };
    }
    return {
      id: row.id,
      document: JSON.parse(row.document),
      version: row.version,
      publishedRevision: published?.revision_number ?? null,
      updatedAt: row.updated_at,
      role,
    };
  }
  function summary(row, role = "editor") {
    const record = projectRecord(row, role);
    return {
      id: row.id,
      title: record.document.title,
      dancerCount: record.document.dancers.length,
      formationCount: record.document.formations.length,
      updatedAt: record.updatedAt,
      publishedRevision: record.publishedRevision,
    };
  }
  function assertVersion(row, version) {
    expectedVersion(version);
    if (row.version !== version)
      throw new HttpError(
        409,
        "A newer draft exists. Keep your local changes and reload before saving.",
        { version: row.version },
      );
  }
  function documentErrors(document, projectId) {
    if (!document || typeof document !== "object" || Array.isArray(document))
      return ["document must be an object."];
    if (document.id !== projectId)
      return ["document.id must match the project."];
    let errors;
    try {
      errors = validateDocument(document);
    } catch {
      return ["Document structure is invalid."];
    }
    if (!Array.isArray(errors)) return ["Document validator failed."];
    if (
      typeof document.title !== "string" ||
      !document.title.trim() ||
      document.title.length > 120
    )
      errors.push("Project title must contain 1–120 characters.");
    if (document.audio) {
      const audio = document.audio;
      const asset =
        typeof audio.id === "string"
          ? db
              .prepare("SELECT * FROM assets WHERE id = ? AND routine_id = ?")
              .get(audio.id, projectId)
          : null;
      if (!asset || audio.url !== `/api/media/${audio.id}`)
        errors.push(
          "Audio must reference an uploaded asset belonging to this project.",
        );
      else {
        const filePath = join(dataDir, "media", asset.stored_name);
        if (
          !existsSync(filePath) ||
          !statSync(filePath).isFile() ||
          statSync(filePath).size !== asset.bytes
        )
          errors.push(
            "The persisted audio file is missing or damaged. Upload it again.",
          );
      }
      if (
        !Number.isFinite(audio.duration) ||
        audio.duration < 0 ||
        audio.duration > 600
      )
        errors.push("Audio duration must be between 0 and 600 seconds.");
      if (
        !Array.isArray(audio.peaks) ||
        audio.peaks.length > 10000 ||
        audio.peaks.some((p) => !Number.isFinite(p) || p < 0 || p > 1)
      )
        errors.push(
          "Audio peaks must be a bounded array of values from 0 to 1.",
        );
      if (typeof audio.name !== "string" || audio.name.length > 255)
        errors.push("Audio name is invalid.");
    }
    return errors;
  }
  function insertProject(title, blank = false) {
    const id = uid();
    let document = createDemoDocument(id);
    document.title = title || "Untitled routine";
    if (blank) {
      document.formations = document.formations.slice(0, 2);
      document.paths = {};
      document = ensurePaths(document);
    }
    const timestamp = now();
    db.prepare(
      "INSERT INTO routines (id,title,document,version,updated_at) VALUES (?,?,?,1,?)",
    ).run(id, document.title, JSON.stringify(document), timestamp);
    return getProject(id);
  }
  if (!db.prepare("SELECT id FROM routines LIMIT 1").get())
    insertProject("Synthetic rehearsal demo");

  function noteRecord(note) {
    return {
      id: note.id,
      projectId: note.routine_id,
      revision: note.revision_number ?? null,
      beat: note.tick,
      ...(note.dancer_id ? { dancerId: note.dancer_id } : {}),
      author: note.display_name,
      body: note.text,
      createdAt: note.created_at,
    };
  }
  function send(res, status, value) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  }

  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
    try {
      const authority = requestAuthority(req);
      if (!ownerPassword && !isLoopback(authority.hostname))
        throw new HttpError(
          403,
          "Passwordless prototype access requires a loopback Host.",
        );
      if (
        !ownerPassword &&
        ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip"].some(
          (key) => req.headers[key],
        )
      )
        throw new HttpError(403, "Forwarded access requires OWNER_PASSWORD.");
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
        checkWriteOrigin(req);
      if (req.method === "OPTIONS")
        throw new HttpError(405, "Cross-origin API access is not enabled.");
      const session = readSession(req, db);

      if (path === "/api/health" && req.method === "GET") {
        send(res, 200, { ok: true });
        return;
      }
      if (path === "/api/bootstrap" && req.method === "GET") {
        let active = session;
        let accessToken;
        if (
          !active &&
          !req.headers.authorization &&
          allowLocalBootstrap &&
          !ownerPassword &&
          isLoopback(req.socket.remoteAddress) &&
          isLoopback(authority.hostname)
        ) {
          checkWriteOrigin(req);
          const issued = setSession(res, db, {
            role: "editor",
            actorId: "owner",
            displayName: "Editor",
          });
          accessToken = issued.accessToken;
          active = { role: "editor" };
        }
        if (!active) {
          send(res, 200, { role: "guest", projects: [] });
          return;
        }
        const rows =
          active.role === "editor"
            ? db
                .prepare("SELECT * FROM routines ORDER BY updated_at DESC")
                .all()
            : db
                .prepare(
                  "SELECT * FROM routines WHERE id = ? AND published_revision_id IS NOT NULL",
                )
                .all(active.routine_id);
        send(res, 200, {
          role: active.role,
          projects: rows.map((r) => summary(r, active.role)),
          ...(accessToken ? { accessToken } : {}),
        });
        return;
      }
      if (path === "/api/session" && req.method === "POST") {
        const key = req.socket.remoteAddress || "unknown";
        const previous = failures.get(key);
        if (previous && previous.until > Date.now() && previous.count >= 10)
          throw new HttpError(
            429,
            "Too many sign-in attempts. Try again in one minute.",
          );
        const body = await readJson(req);
        if (
          !ownerPassword ||
          typeof body.password !== "string" ||
          body.password.length > 1024 ||
          !sameSecret(body.password, ownerPassword)
        ) {
          if (failures.size > 128) failures.clear();
          failures.set(key, {
            count: previous?.until > Date.now() ? previous.count + 1 : 1,
            until:
              previous?.until > Date.now()
                ? previous.until
                : Date.now() + 60000,
          });
          throw new HttpError(401, "Invalid password.");
        }
        failures.delete(key);
        const issued = setSession(res, db, {
          role: "editor",
          actorId: "owner",
          displayName: "Editor",
        });
        send(res, 200, { role: "editor", accessToken: issued.accessToken });
        return;
      }
      if (path === "/api/session" && req.method === "DELETE") {
        if (req.headers.authorization && session && session.role === "editor")
          db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
            hash(req.headers.authorization.slice(7)),
          );
        clearSession(req, res, db);
        send(res, 200, { ok: true });
        return;
      }
      if (path === "/api/projects" && req.method === "POST") {
        requireEditor(session);
        const body = await readJson(req);
        requireEditor(readSession(req, db));
        const row = insertProject(
          body.title === undefined
            ? "Untitled routine"
            : text(body.title, "Title"),
          body.blank === true,
        );
        send(res, 201, projectRecord(row));
        return;
      }
      const projectMatch =
        /^\/api\/projects\/([A-Za-z0-9_-]+)(?:\/(publish|share|notes|ack|audio))?$/.exec(
          path,
        );
      if (projectMatch) {
        const [, id, action] = projectMatch;
        // Check capability before checking existence to avoid leaking private project IDs.
        requireReader(session, id);
        const row = getProject(id);
        if (!action && req.method === "GET") {
          send(res, 200, projectRecord(row, session.role));
          return;
        }
        if (!action && req.method === "PUT") {
          requireEditor(session);
          const body = await readJson(req);
          requireEditor(readSession(req, db));
          const updated = transaction(db, () => {
            const latest = getProject(id);
            assertVersion(latest, body.expectedVersion);
            const errors = documentErrors(body.document, id);
            if (errors.length)
              throw new HttpError(422, "Document validation failed.", errors);
            db.prepare(
              "UPDATE routines SET title=?, document=?, version=version+1, updated_at=? WHERE id=? AND version=?",
            ).run(
              body.document.title.trim(),
              JSON.stringify(body.document),
              now(),
              id,
              body.expectedVersion,
            );
            return getProject(id);
          });
          send(res, 200, projectRecord(updated));
          return;
        }
        if (action === "publish" && req.method === "POST") {
          requireEditor(session);
          const body = await readJson(req);
          requireEditor(readSession(req, db));
          const result = transaction(db, () => {
            const latest = getProject(id);
            assertVersion(latest, body.expectedVersion);
            const document = JSON.parse(latest.document);
            const errors = documentErrors(document, id);
            if (errors.length)
              throw new HttpError(422, "Document validation failed.", errors);
            const warnings = analyzeDocument(document);
            const blockers = warnings.filter(
              (w) => !["clearance", "speed"].includes(w.type),
            );
            if (blockers.length)
              throw new HttpError(
                422,
                "Fix invalid paths, timing, or stage boundaries before publishing.",
                blockers,
              );
            if (warnings.length && body.reviewedWarnings !== true)
              throw new HttpError(
                422,
                "Review the model warnings before publishing this choreography.",
                warnings,
              );
            let revision = db
              .prepare(
                "SELECT * FROM revisions WHERE routine_id = ? AND draft_version = ?",
              )
              .get(id, latest.version);
            if (!revision) {
              const next = db
                .prepare(
                  "SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM revisions WHERE routine_id=?",
                )
                .get(id).n;
              const revisionId = uid();
              db.prepare("INSERT INTO revisions VALUES (?,?,?,?,?,?,?)").run(
                revisionId,
                id,
                next,
                latest.version,
                latest.document,
                now(),
                warnings.length
                  ? JSON.stringify({ reviewed: true, warnings })
                  : null,
              );
              revision = db
                .prepare("SELECT * FROM revisions WHERE id = ?")
                .get(revisionId);
            }
            db.prepare(
              "UPDATE routines SET published_revision_id=? WHERE id=?",
            ).run(revision.id, id);
            return {
              revision: revision.revision_number,
              project: projectRecord(getProject(id)),
            };
          });
          send(res, 200, result);
          return;
        }
        if (action === "share" && req.method === "POST") {
          requireEditor(session);
          if (!row.published_revision_id)
            throw new HttpError(
              409,
              "Publish a revision explicitly before creating a rehearsal link.",
            );
          const secret = token();
          db.prepare("INSERT INTO shares VALUES (?,?,?,?,?,?,NULL)").run(
            uid(),
            id,
            hash(secret),
            "Unverified rehearsal link",
            now(),
            new Date(Date.now() + 30 * 86400000).toISOString(),
          );
          send(res, 201, { token: secret, path: `/?share=${secret}` });
          return;
        }
        if (action === "share" && req.method === "DELETE") {
          requireEditor(session);
          db.prepare(
            "UPDATE shares SET revoked_at=? WHERE routine_id=? AND revoked_at IS NULL",
          ).run(now(), id);
          send(res, 200, { ok: true });
          return;
        }
        if (action === "notes" && req.method === "GET") {
          const notes = db
            .prepare(
              `SELECT c.*, r.revision_number FROM comments c LEFT JOIN revisions r ON r.id=c.revision_id
            WHERE c.routine_id=? ${session.role === "viewer" ? "AND c.revision_id IS NOT NULL" : ""} ORDER BY c.created_at,c.id`,
            )
            .all(id)
            .map(noteRecord);
          send(res, 200, { notes });
          return;
        }
        if (action === "notes" && req.method === "POST") {
          const body = await readJson(req);
          requireReader(readSession(req, db), id);
          const content = text(body.body, "Comment", 2000);
          const author = text(body.author, "Author", 80);
          let revision = null;
          if (
            body.revision != null &&
            (!Number.isSafeInteger(body.revision) || body.revision < 1)
          )
            throw new HttpError(400, "Invalid revision.");
          if (session.role === "viewer") {
            revision = revisionFor(row, body.revision ?? undefined);
          } else if (body.revision != null) {
            revision = revisionFor(row, body.revision);
          }
          const document = JSON.parse(revision?.document ?? row.document);
          if (
            !Number.isFinite(body.beat) ||
            body.beat < 0 ||
            body.beat > document.totalBeats
          )
            throw new HttpError(400, "Comment beat is outside the routine.");
          if (
            body.dancerId != null &&
            !document.dancers.some((d) => d.id === body.dancerId)
          )
            throw new HttpError(
              400,
              "Comment dancer does not exist in this revision.",
            );
          const noteId = uid();
          db.prepare("INSERT INTO comments VALUES (?,?,?,?,?,?,?,?,?,?)").run(
            noteId,
            id,
            revision?.id ?? null,
            session.actor_id,
            session.role === "viewer" ? `${author} (unverified link)` : author,
            body.beat,
            body.dancerId ?? null,
            null,
            content,
            now(),
          );
          const note = db
            .prepare(
              "SELECT c.*,r.revision_number FROM comments c LEFT JOIN revisions r ON r.id=c.revision_id WHERE c.id=?",
            )
            .get(noteId);
          send(res, 201, noteRecord(note));
          return;
        }
        if (action === "ack" && req.method === "PUT") {
          const body = await readJson(req);
          requireReader(readSession(req, db), id);
          if (!Number.isSafeInteger(body.revision) || body.revision < 1)
            throw new HttpError(
              400,
              "A published revision number is required.",
            );
          const revision = revisionFor(row, body.revision);
          const name = text(body.displayName, "Display name", 80);
          const identity = `${session.actor_id}:${hash(name.toLocaleLowerCase("en-US"))}`;
          db.prepare(
            "INSERT OR IGNORE INTO acknowledgments VALUES (?,?,?,?)",
          ).run(revision.id, identity, name, now());
          send(res, 200, { ok: true });
          return;
        }
        if (action === "ack" && req.method === "GET") {
          requireEditor(session);
          const acknowledgments = db
            .prepare(
              `SELECT r.revision_number AS revision,a.display_name AS displayName,a.created_at AS createdAt
            FROM acknowledgments a JOIN revisions r ON r.id=a.revision_id WHERE r.routine_id=? ORDER BY a.created_at`,
            )
            .all(id);
          send(res, 200, { acknowledgments });
          return;
        }
        if (action === "audio" && req.method === "POST") {
          requireEditor(session);
          const name = text(
            url.searchParams.get("name"),
            "Audio filename",
            255,
          );
          if (basename(name) !== name || /[\x00-\x1f\\/:]/.test(name))
            throw new HttpError(400, "Invalid audio filename.");
          const data = await readBody(req, AUDIO_LIMIT);
          requireEditor(readSession(req, db));
          const format = inspectAudio(data, name, req.headers["content-type"]);
          const assetId = uid();
          const storedName = `${assetId}.${format.ext}`;
          const filePath = join(dataDir, "media", storedName);
          writeFileSync(filePath, data, { flag: "wx" });
          try {
            db.prepare("INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)").run(
              assetId,
              id,
              name,
              format.mime,
              data.length,
              hash(data),
              storedName,
              now(),
            );
          } catch (error) {
            unlinkSync(filePath);
            throw error;
          }
          send(res, 201, {
            id: assetId,
            name,
            url: `/api/media/${assetId}`,
            duration: 0,
            peaks: [],
          });
          return;
        }
        throw new HttpError(405, "Method not allowed.");
      }
      const mediaMatch = /^\/api\/media\/([A-Za-z0-9_-]+)$/.exec(path);
      if (mediaMatch && ["GET", "HEAD"].includes(req.method)) {
        if (!session)
          throw new HttpError(401, "Sign-in or rehearsal link required.");
        const asset = db
          .prepare("SELECT * FROM assets WHERE id=?")
          .get(mediaMatch[1]);
        if (!asset) throw new HttpError(404, "Audio not found.");
        requireReader(session, asset.routine_id);
        if (session.role === "viewer") {
          const published = revisionFor(getProject(asset.routine_id));
          const publishedAsset = JSON.parse(published.document).audio?.id;
          if (publishedAsset !== asset.id)
            throw new HttpError(
              403,
              "This audio is not part of the current published plan.",
            );
        }
        const filePath = join(dataDir, "media", asset.stored_name);
        if (!existsSync(filePath))
          throw new HttpError(404, "Audio file is unavailable.");
        streamFile(req, res, filePath, asset.bytes, asset.mime);
        return;
      }
      if (path.startsWith("/api/"))
        throw new HttpError(404, "API endpoint not found.");
      if (!["GET", "HEAD"].includes(req.method))
        throw new HttpError(405, "Method not allowed.");
      let decoded;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        throw new HttpError(400, "Malformed path.");
      }
      if (
        /[\x00\\:]/.test(decoded) ||
        decoded.split("/").some((part) => part.startsWith("."))
      )
        throw new HttpError(404, "Not found.");
      const candidate = resolve(staticDir, `.${decoded}`);
      if (candidate !== staticDir && !candidate.startsWith(staticDir + sep))
        throw new HttpError(404, "Not found.");
      const file =
        existsSync(candidate) && statSync(candidate).isFile()
          ? candidate
          : join(staticDir, "index.html");
      if (!existsSync(file))
        throw new HttpError(
          404,
          "Web build is unavailable. Run npm run build or the development server.",
        );
      let inspected = staticDir;
      for (const part of ["", ...relative(staticDir, file).split(sep)]) {
        inspected = join(inspected, part);
        if (lstatSync(inspected).isSymbolicLink())
          throw new HttpError(404, "Not found.");
      }
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
          ".json": "application/json",
        }[extname(file)] ?? "application/octet-stream";
      streamFile(req, res, file, statSync(file).size, mime);
      return;
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error("Request failed:", error);
      send(res, status, {
        error: status === 500 ? "Internal server error." : error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let closed = false;
  return {
    server,
    close: async () => {
      if (closed) return;
      closed = true;
      if (server.listening)
        await new Promise((resolveClose, reject) =>
          server.close((error) => (error ? reject(error) : resolveClose())),
        );
      db.close();
    },
  };
}
