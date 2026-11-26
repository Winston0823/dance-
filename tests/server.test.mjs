import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";
import { createApp } from "../apps/server/server.mjs";

async function fixture(options = {}) {
  const dataDir =
    options.dataDir ?? mkdtempSync(join(tmpdir(), "danceform-server-"));
  const app = createApp({ dataDir, ...options });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (
    path,
    { method = "GET", token, cookie, json, data, headers = {} } = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : data,
    });
    const value = response.headers
      .get("Content-Type")
      ?.includes("application/json")
      ? await response.json()
      : await response.arrayBuffer();
    return { status: response.status, value, headers: response.headers };
  };
  return {
    app,
    base,
    dataDir,
    request,
    cleanup: async () => {
      await app.close();
      if (!options.dataDir) rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function localEditor(f) {
  const response = await f.request("/api/bootstrap");
  assert.equal(response.status, 200);
  assert.equal(response.value.role, "editor");
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  return {
    token: response.value.accessToken,
    id: response.value.projects[0].id,
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
}

async function publish(f, editor, version = 1) {
  const response = await f.request(`/api/projects/${editor.id}/publish`, {
    method: "POST",
    token: editor.token,
    json: { expectedVersion: version, reviewedWarnings: true },
  });
  assert.equal(response.status, 200, JSON.stringify(response.value));
  return response.value;
}

test("durable autosave uses optimistic versions and published snapshots stay frozen", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "danceform-persist-"));
  let f = await fixture({ dataDir });
  try {
    const editor = await localEditor(f);
    const project = await f.request(`/api/projects/${editor.id}`, {
      token: editor.token,
    });
    assert.equal(project.status, 200);
    const document = structuredClone(project.value.document);
    document.title = "Saved rehearsal";
    const save = await f.request(`/api/projects/${editor.id}`, {
      method: "PUT",
      token: editor.token,
      json: { document, expectedVersion: 1 },
    });
    assert.equal(save.status, 200, JSON.stringify(save.value));
    assert.equal(save.value.version, 2);
    const stale = await f.request(`/api/projects/${editor.id}`, {
      method: "PUT",
      token: editor.token,
      json: { document, expectedVersion: 1 },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.value.details.version, 2);
    const wrongId = await f.request(`/api/projects/${editor.id}`, {
      method: "PUT",
      token: editor.token,
      json: { document: { ...document, id: "different" }, expectedVersion: 2 },
    });
    assert.equal(wrongId.status, 422);
    const first = await publish(f, editor, 2);
    const repeated = await publish(f, editor, 2);
    assert.equal(first.revision, 1);
    assert.equal(repeated.revision, first.revision);
    const link = await f.request(`/api/projects/${editor.id}/share`, {
      method: "POST",
      token: editor.token,
    });
    assert.equal(link.status, 201);
    const draft = structuredClone(document);
    draft.title = "Private next draft";
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          method: "PUT",
          token: editor.token,
          json: { document: draft, expectedVersion: 2 },
        })
      ).status,
      200,
    );
    const frozen = await f.request(`/api/projects/${editor.id}`, {
      token: link.value.token,
      cookie: editor.cookie,
    });
    assert.equal(
      frozen.value.role,
      "viewer",
      "bearer link must override an editor cookie",
    );
    assert.equal(frozen.value.document.title, "Saved rehearsal");
    assert.equal(frozen.value.version, 2);
    await f.app.close();
    f = await fixture({ dataDir });
    const restored = await f.request(`/api/projects/${editor.id}`, {
      token: editor.token,
    });
    assert.equal(restored.value.document.title, "Private next draft");
    assert.equal(restored.value.version, 3);
    const restoredPublished = await f.request(`/api/projects/${editor.id}`, {
      token: link.value.token,
    });
    assert.equal(restoredPublished.value.document.title, "Saved rehearsal");
  } finally {
    await f.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("reader capabilities cannot leak drafts or mutate projects and revocation is immediate", async () => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    const noPublish = await f.request(`/api/projects/${editor.id}/share`, {
      method: "POST",
      token: editor.token,
    });
    assert.equal(noPublish.status, 409);
    const guest = await f.request(`/api/projects/${editor.id}`);
    assert.equal(guest.status, 401);
    await publish(f, editor);
    const share = (
      await f.request(`/api/projects/${editor.id}/share`, {
        method: "POST",
        token: editor.token,
      })
    ).value;
    const second = await f.request("/api/projects", {
      method: "POST",
      token: editor.token,
      json: { title: "Other private project" },
    });
    assert.equal(second.status, 201);
    assert.equal(
      (
        await f.request(`/api/projects/${second.value.id}`, {
          token: share.token,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          method: "PUT",
          token: share.token,
          json: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/publish`, {
          method: "POST",
          token: share.token,
          json: { expectedVersion: 1 },
        })
      ).status,
      403,
    );
    const bootstrap = await f.request("/api/bootstrap", {
      token: share.token,
      cookie: editor.cookie,
    });
    assert.equal(bootstrap.value.role, "viewer");
    assert.equal(bootstrap.value.projects.length, 1);
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          token: "invalid",
          cookie: editor.cookie,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/share`, {
          method: "DELETE",
          token: editor.token,
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request(`/api/projects/${editor.id}`, { token: share.token }))
        .status,
      401,
    );
    assert.equal(
      (await f.request("/api/bootstrap", { token: share.token })).value.role,
      "guest",
    );
  } finally {
    await f.cleanup();
  }
});

test("publish gates explicit model review and blocks malformed paths and stage-boundary errors", async () => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    const project = (
      await f.request(`/api/projects/${editor.id}`, { token: editor.token })
    ).value;
    const unreviewed = await f.request(`/api/projects/${editor.id}/publish`, {
      method: "POST",
      token: editor.token,
      json: { expectedVersion: 1 },
    });
    assert.equal(unreviewed.status, 422);
    assert.ok(
      unreviewed.value.details.some((w) =>
        ["clearance", "speed"].includes(w.type),
      ),
    );
    const missingPaths = structuredClone(project.document);
    missingPaths.paths = {};
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          method: "PUT",
          token: editor.token,
          json: { document: missingPaths, expectedVersion: 1 },
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          method: "PUT",
          token: editor.token,
          json: { document: null, expectedVersion: 1 },
        })
      ).status,
      422,
    );
    const boundary = structuredClone(project.document);
    // A valid path data structure can still cross the stage boundary between its endpoints.
    const destination = boundary.formations[1];
    const dancerId = boundary.dancers[0].id;
    const savedPath = boundary.paths[destination.id][dancerId];
    savedPath.points = [
      savedPath.points[0],
      { t: 0.5, x: 100, y: 100 },
      savedPath.points.at(-1),
    ];
    const save = await f.request(`/api/projects/${editor.id}`, {
      method: "PUT",
      token: editor.token,
      json: { document: boundary, expectedVersion: 1 },
    });
    assert.equal(save.status, 200, JSON.stringify(save.value));
    const blocked = await f.request(`/api/projects/${editor.id}/publish`, {
      method: "POST",
      token: editor.token,
      json: { expectedVersion: 2, reviewedWarnings: true },
    });
    assert.equal(blocked.status, 422);
    assert.ok(blocked.value.details.some((w) => w.type === "boundary"));
    const stale = await f.request(`/api/projects/${editor.id}/publish`, {
      method: "POST",
      token: editor.token,
      json: { expectedVersion: 1, reviewedWarnings: true },
    });
    assert.equal(stale.status, 409);
  } finally {
    await f.cleanup();
  }
});

test("notes are revision anchored and acknowledgments require explicit capability action", async () => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/notes`, {
          method: "POST",
          token: editor.token,
          json: { beat: 8, author: "Teacher", body: "Private draft note" },
        })
      ).status,
      201,
    );
    await publish(f, editor);
    const share = (
      await f.request(`/api/projects/${editor.id}/share`, {
        method: "POST",
        token: editor.token,
      })
    ).value;
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/notes`, {
          token: share.token,
        })
      ).value.notes.length,
      0,
    );
    const comment = await f.request(`/api/projects/${editor.id}/notes`, {
      method: "POST",
      token: share.token,
      json: {
        beat: 12,
        author: "Alex",
        body: "Can we rehearse this entrance?",
        revision: 1,
      },
    });
    assert.equal(comment.status, 201, JSON.stringify(comment.value));
    assert.equal(comment.value.revision, 1);
    assert.match(comment.value.author, /unverified/i);
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/notes`, {
          method: "POST",
          token: share.token,
          json: {
            beat: 12,
            dancerId: "missing",
            author: "Alex",
            body: "Bad anchor",
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/notes`, {
          method: "POST",
          token: share.token,
          json: { beat: 9999, author: "Alex", body: "Bad beat" },
        })
      ).status,
      400,
    );
    let acks = await f.request(`/api/projects/${editor.id}/ack`, {
      token: editor.token,
    });
    assert.equal(acks.value.acknowledgments.length, 0);
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.request(`/api/projects/${editor.id}/ack`, {
            method: "PUT",
            token: share.token,
            json: { revision: 1, displayName: "Alex" },
          })
        ).status,
        200,
      );
    acks = await f.request(`/api/projects/${editor.id}/ack`, {
      token: editor.token,
    });
    assert.equal(acks.value.acknowledgments.length, 1);
    assert.equal(acks.value.acknowledgments[0].revision, 1);
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/ack`, {
          token: share.token,
        })
      ).status,
      403,
    );
  } finally {
    await f.cleanup();
  }
});

test("real audio is immutable, checked, private until publication, and range streamed", async () => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    await publish(f, editor);
    const share = (
      await f.request(`/api/projects/${editor.id}/share`, {
        method: "POST",
        token: editor.token,
      })
    ).value;
    const bad = await f.request(
      `/api/projects/${editor.id}/audio?name=song.mp3`,
      {
        method: "POST",
        token: editor.token,
        data: Buffer.from("not music"),
        headers: { "Content-Type": "audio/mpeg" },
      },
    );
    assert.equal(bad.status, 415);
    const wav = Buffer.alloc(64);
    wav.write("RIFF");
    wav.writeUInt32LE(56, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(20, 40);
    const uploaded = await f.request(
      `/api/projects/${editor.id}/audio?name=practice.wav`,
      {
        method: "POST",
        token: editor.token,
        data: wav,
        headers: { "Content-Type": "audio/wav" },
      },
    );
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.value));
    assert.equal(uploaded.value.duration, 0);
    assert.deepEqual(uploaded.value.peaks, []);
    assert.equal((await f.request(uploaded.value.url)).status, 401);
    assert.equal(
      (await f.request(uploaded.value.url, { token: share.token })).status,
      403,
    );
    const range = await f.request(uploaded.value.url, {
      token: editor.token,
      headers: { Range: "bytes=0-3" },
    });
    assert.equal(range.status, 206);
    assert.equal(Buffer.from(range.value).toString(), "RIFF");
    assert.equal(range.headers.get("Content-Range"), "bytes 0-3/64");
    assert.equal(
      (
        await f.request(uploaded.value.url, {
          token: editor.token,
          headers: { Range: "bytes=100-200" },
        })
      ).status,
      416,
    );
    const project = (
      await f.request(`/api/projects/${editor.id}`, { token: editor.token })
    ).value;
    project.document.audio = {
      ...uploaded.value,
      duration: 0.00125,
      peaks: [0, 0.2],
    };
    const save = await f.request(`/api/projects/${editor.id}`, {
      method: "PUT",
      token: editor.token,
      json: { document: project.document, expectedVersion: project.version },
    });
    assert.equal(save.status, 200);
    await publish(f, editor, save.value.version);
    const full = await f.request(uploaded.value.url, { token: share.token });
    assert.equal(full.status, 200);
    assert.deepEqual(Buffer.from(full.value), wav);
  } finally {
    await f.cleanup();
  }
});

test("password mode disables local bootstrap, rejects CSRF, and logout invalidates credentials", async () => {
  const f = await fixture({ ownerPassword: "test-owner-password" });
  try {
    assert.equal((await f.request("/api/bootstrap")).value.role, "guest");
    assert.equal(
      (
        await f.request("/api/session", {
          method: "POST",
          json: { password: "wrong" },
        })
      ).status,
      401,
    );
    const login = await f.request("/api/session", {
      method: "POST",
      json: { password: "test-owner-password" },
    });
    assert.equal(login.status, 200);
    const token = login.value.accessToken;
    assert.equal(
      (
        await f.request("/api/projects", {
          method: "POST",
          token,
          json: {},
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request("/api/projects", {
          method: "POST",
          token,
          json: {},
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await f.request("/api/bootstrap", { token })).value.role,
      "editor",
    );
    assert.equal(
      (await f.request("/api/session", { method: "DELETE", token })).status,
      200,
    );
    assert.equal(
      (await f.request("/api/bootstrap", { token })).value.role,
      "guest",
    );
  } finally {
    await f.cleanup();
  }
});

test("entry point refuses an external bind without an owner password", () => {
  const child = spawnSync(process.execPath, ["apps/server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOST: "0.0.0.0", OWNER_PASSWORD: "" },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Refusing external binding/);
  const blankPassword = spawnSync(process.execPath, ["apps/server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOST: "0.0.0.0", OWNER_PASSWORD: "   " },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.notEqual(blankPassword.status, 0);
  assert.match(blankPassword.stderr, /Refusing external binding/);
});

test("host authority, forwarding, CSRF, JSON and static traversal inputs fail closed", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "danceform-hostile-"));
  const staticDir = join(dataDir, "public");
  mkdirSync(staticDir);
  writeFileSync(join(staticDir, "index.html"), "<h1>DanceForm test</h1>");
  writeFileSync(join(staticDir, ".env"), "SECRET-DO-NOT-SERVE");
  writeFileSync(join(dataDir, "private.txt"), "PRIVATE-SENTINEL");
  const f = await fixture({ dataDir, staticDir });
  const rawGet = (headers) =>
    new Promise((resolveResponse, reject) => {
      const req = httpRequest(f.base + "/api/bootstrap", { headers }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolveResponse({
            status: res.statusCode,
            headers: res.headers,
            value: JSON.parse(Buffer.concat(chunks)),
          }),
        );
      });
      req.on("error", reject);
      req.end();
    });
  try {
    const editor = await localEditor(f);
    const rebound = await rawGet({ Host: "attacker.example" });
    assert.equal(rebound.status, 403);
    assert.equal(rebound.headers["set-cookie"], undefined);
    assert.equal((await rawGet({ Host: "attacker@localhost" })).status, 400);
    assert.equal(
      (await rawGet({ Host: "localhost", "X-Forwarded-For": "203.0.113.10" }))
        .status,
      403,
    );
    assert.equal(
      (
        await f.request("/api/projects", {
          method: "POST",
          cookie: editor.cookie,
          json: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request("/api/projects", {
          method: "POST",
          token: editor.token,
          data: "{}",
          headers: { "Content-Type": "application/json-evil" },
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await f.request("/api/projects", {
          method: "POST",
          token: editor.token,
          data: "{",
          headers: { "Content-Type": "application/json" },
        })
      ).status,
      400,
    );
    for (const path of [
      "/.env",
      "/%2e%2e%5cprivate.txt",
      "/%00",
      "/bad%encoding",
    ]) {
      const response = await f.request(path);
      assert.ok(
        [400, 404].includes(response.status),
        `${path}: ${response.status}`,
      );
      assert.doesNotMatch(
        JSON.stringify(response.value),
        /PRIVATE-SENTINEL|SECRET-DO-NOT-SERVE/,
      );
    }
    const staticResponse = await f.request("/");
    assert.equal(staticResponse.status, 200);
    assert.match(
      Buffer.from(staticResponse.value).toString(),
      /DanceForm test/,
    );
  } finally {
    await f.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("audio ownership, stale replacement, removal and physical-file loss are enforced", async () => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    const upload = async (name) => {
      const mp3 = Buffer.from(
        "ID3\x04\x00\x00\x00\x00\x00\x00synthetic-header-fixture",
      );
      return (
        await f.request(`/api/projects/${editor.id}/audio?name=${name}`, {
          method: "POST",
          token: editor.token,
          data: mp3,
          headers: { "Content-Type": "audio/mpeg" },
        })
      ).value;
    };
    const first = await upload("first.mp3");
    let project = (
      await f.request(`/api/projects/${editor.id}`, { token: editor.token })
    ).value;
    const save = async (document) => {
      const saved = await f.request(`/api/projects/${editor.id}`, {
        method: "PUT",
        token: editor.token,
        json: { document, expectedVersion: project.version },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.value));
      project = saved.value;
    };
    project.document.audio = first;
    await save(project.document);
    await publish(f, editor, project.version);
    const share = (
      await f.request(`/api/projects/${editor.id}/share`, {
        method: "POST",
        token: editor.token,
      })
    ).value;
    const other = (
      await f.request("/api/projects", {
        method: "POST",
        token: editor.token,
        json: { title: "Other" },
      })
    ).value;
    const crossProject = structuredClone(other.document);
    crossProject.audio = first;
    assert.equal(
      (
        await f.request(`/api/projects/${other.id}`, {
          method: "PUT",
          token: editor.token,
          json: { document: crossProject, expectedVersion: 1 },
        })
      ).status,
      422,
    );
    const external = structuredClone(project.document);
    external.audio.url = "https://attacker.example/track.mp3";
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          method: "PUT",
          token: editor.token,
          json: { document: external, expectedVersion: project.version },
        })
      ).status,
      422,
    );
    const second = await upload("replacement.mp3");
    project.document.audio = second;
    await save(project.document);
    assert.equal(
      (await f.request(first.url, { token: share.token })).status,
      200,
      "current published audio survives a private draft replacement",
    );
    assert.equal(
      (await f.request(second.url, { token: share.token })).status,
      403,
      "replacement remains private until published",
    );
    await publish(f, editor, project.version);
    assert.equal(
      (await f.request(first.url, { token: share.token })).status,
      403,
      "reader cannot newly fetch superseded audio",
    );
    assert.equal(
      (await f.request(second.url, { token: share.token })).status,
      200,
    );
    delete project.document.audio;
    await save(project.document);
    await publish(f, editor, project.version);
    assert.equal(
      (await f.request(second.url, { token: share.token })).status,
      403,
      "removed audio is no longer reader-accessible",
    );
    assert.equal(
      (await f.request(first.url, { token: editor.token })).status,
      200,
      "historical media stays immutable for editor",
    );
    const missing = await upload("missing.mp3");
    const missingFile = readdirSync(join(f.dataDir, "media")).find((name) =>
      name.startsWith(missing.id),
    );
    unlinkSync(join(f.dataDir, "media", missingFile));
    project.document.audio = missing;
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}`, {
          method: "PUT",
          token: editor.token,
          json: {
            document: project.document,
            expectedVersion: project.version,
          },
        })
      ).status,
      422,
    );
  } finally {
    await f.cleanup();
  }
});

test("declared upload limits and a capability revoked while its body arrives are rejected", async () => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    const rawResponse = (path, headers, startBody) => {
      let req;
      const result = new Promise((resolveResponse, reject) => {
        req = httpRequest(f.base + path, { method: "POST", headers }, (res) => {
          res.resume();
          res.on("end", () => resolveResponse(res.statusCode));
        });
        req.on("error", reject);
        req.flushHeaders();
        if (startBody) req.write(startBody);
      });
      return {
        result,
        get request() {
          return req;
        },
      };
    };
    const tooLarge = rawResponse(
      `/api/projects/${editor.id}/audio?name=large.mp3`,
      {
        Authorization: `Bearer ${editor.token}`,
        "Content-Type": "audio/mpeg",
        "Content-Length": 30 * 1024 * 1024 + 1,
      },
    );
    assert.equal(await tooLarge.result, 413);
    tooLarge.request.destroy();
    await publish(f, editor);
    const share = (
      await f.request(`/api/projects/${editor.id}/share`, {
        method: "POST",
        token: editor.token,
      })
    ).value;
    const body = JSON.stringify({
      beat: 8,
      author: "Late reader",
      body: "Must not commit after revocation",
      revision: 1,
    });
    const pending = rawResponse(
      `/api/projects/${editor.id}/notes`,
      {
        Authorization: `Bearer ${share.token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      body.slice(0, 10),
    );
    assert.equal(
      (
        await f.request(`/api/projects/${editor.id}/share`, {
          method: "DELETE",
          token: editor.token,
        })
      ).status,
      200,
    );
    pending.request.end(body.slice(10));
    assert.equal(await pending.result, 401);
    const notes = await f.request(`/api/projects/${editor.id}/notes`, {
      token: editor.token,
    });
    assert.equal(notes.value.notes.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("observed local demo API timings are reported without a capacity claim", async (t) => {
  const f = await fixture();
  try {
    const editor = await localEditor(f);
    let project = (
      await f.request(`/api/projects/${editor.id}`, { token: editor.token })
    ).value;
    const observations = { read: [], autosave: [], publish: [] };
    for (let index = 0; index < 12; index++) {
      let start = performance.now();
      assert.equal(
        (await f.request(`/api/projects/${editor.id}`, { token: editor.token }))
          .status,
        200,
      );
      observations.read.push(performance.now() - start);
      start = performance.now();
      const saved = await f.request(`/api/projects/${editor.id}`, {
        method: "PUT",
        token: editor.token,
        json: { document: project.document, expectedVersion: project.version },
      });
      assert.equal(saved.status, 200);
      project = saved.value;
      observations.autosave.push(performance.now() - start);
      start = performance.now();
      await publish(f, editor, project.version);
      observations.publish.push(performance.now() - start);
    }
    const measured = Object.fromEntries(
      Object.entries(observations).map(([key, samples]) => {
        samples.sort((a, b) => a - b);
        return [
          key,
          {
            n: samples.length,
            medianMs: +samples[6].toFixed(2),
            p95Ms: +samples[11].toFixed(2),
          },
        ];
      }),
    );
    t.diagnostic(
      `Local single-client synthetic ${project.document.dancers.length}-dancer/${project.document.formations.length}-formation demo, Node ${process.version}: ${JSON.stringify(measured)}`,
    );
  } finally {
    await f.cleanup();
  }
});
