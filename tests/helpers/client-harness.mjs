import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";
import React from "react";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const repo = fileURLToPath(new URL("../../", import.meta.url));
export const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Render the real client components. Only navigation links, network I/O and the
// isolated code worker are replaced, so races can be released deterministically.
export async function clientHarness(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: options.url ?? "http://localhost/?track=frontend",
  });
  const previous = new Map();
  const globals = {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    HTMLElement: dom.window.HTMLElement,
    KeyboardEvent: dom.window.KeyboardEvent,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  dom.window.scrollTo = () => {};
  const runs = [],
    modules = new Map();
  function load(file) {
    if (file.endsWith(".css"))
      return {
        __esModule: true,
        default: new Proxy({}, { get: (_, key) => String(key) }),
      };
    if (!path.extname(file))
      file = [".ts", ".tsx"]
        .map((extension) => file + extension)
        .find(fs.existsSync);
    if (modules.has(file)) return modules.get(file).exports;
    const mod = new Module(file);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    modules.set(file, mod);
    mod.require = (specifier) => {
      if (specifier === "next/link")
        return {
          __esModule: true,
          default: ({ children, ...props }) =>
            React.createElement("a", props, children),
        };
      if (specifier.endsWith("/runner"))
        return {
          runMission: () => {
            const run = deferred();
            runs.push(run);
            return run.promise;
          },
        };
      if (specifier.startsWith("."))
        return load(path.resolve(path.dirname(file), specifier));
      return require(specifier);
    };
    mod._compile(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      file,
    );
    return mod.exports;
  }
  const { missions, initialProgress } = load(
    path.join(repo, "lib/missions.ts"),
  );
  let stored = options.state ?? {
    version: 1,
    progress: {
      frontend: {
        ...initialProgress(missions[0]),
        code: missions[0].starter + "\n// user work",
        codeSource: "user",
        codeRevision: 1,
      },
    },
  };
  let timestamp = Date.now();
  const receipt = () => ({
    savedAt: new Date(timestamp).toISOString(),
    expiresAt: new Date(timestamp + 2592000000).toISOString(),
  });
  const calls = [],
    events = [];
  previous.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"));
  globalThis.fetch = async (url, request = {}) => {
    const method = request.method ?? "GET";
    calls.push({ url, method, body: request.body });
    if (url === "/api/coach") return Response.json({ available: false });
    if (url === "/api/analytics") {
      if (method === "POST") {
        const batch = JSON.parse(request.body).events;
        events.push(...batch);
        return Response.json({ accepted: batch.length });
      }
      await options.consentGate?.promise;
      if (options.analyticsError) return Response.json({}, { status: 503 });
      return Response.json({
        enabled: !!options.analytics,
        token: options.analytics
          ? "de613f91-b724-40d2-a0a8-8b2702f0a274"
          : null,
        participantCode: null,
      });
    }
    assert.equal(url, "/api/state");
    if (method === "GET")
      return Response.json({
        state: stored,
        ...(stored ? receipt() : { savedAt: null, expiresAt: null }),
      });
    if (method === "DELETE") {
      stored = null;
      return Response.json({ deleted: true });
    }
    assert.equal(method, "POST");
    stored = JSON.parse(request.body);
    timestamp++;
    return Response.json(receipt());
  };
  const { createRoot } = require("react-dom/client");
  const Component = load(
    path.join(repo, options.game ? "app/games/game-lab.tsx" : "app/lab.tsx"),
  ).default;
  let root = createRoot(dom.window.document.getElementById("root"));
  const settle = async (ms = 5) =>
    React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  t.after(async () => {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const render = async () => {
    const url = new URL(dom.window.location.href);
    await React.act(async () =>
      root.render(
        React.createElement(Component, {
          initialTrack: url.searchParams.get("track") ?? undefined,
          initialView: url.searchParams.get("view") ?? undefined,
        }),
      ),
    );
    await settle();
  };
  await render();
  await settle();
  return {
    dom,
    calls,
    events,
    runs,
    settle,
    act: React.act,
    async reload() {
      await React.act(async () => root.unmount());
      root = createRoot(dom.window.document.getElementById("root"));
      await render();
    },
    async history(direction) {
      await React.act(async () => {
        dom.window.history[direction]();
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      await settle();
    },
    get stored() {
      return stored;
    },
    async click(text, within = dom.window.document) {
      const button = [...within.querySelectorAll("button")].find(
        (node) =>
          node.textContent.trim() === text ||
          node.getAttribute("aria-label") === text,
      );
      assert.ok(button, `Missing button: ${text}`);
      assert.equal(button.disabled, false, `Disabled button: ${text}`);
      assert.equal(button.closest("[inert]"), null, `Inert button: ${text}`);
      await React.act(async () => button.click());
      await settle();
    },
    async finishRun(result = { tests: [], preview: null }) {
      assert.ok(runs.length, "No code execution to finish");
      await React.act(async () => runs.at(-1).resolve(result));
      await settle();
    },
  };
}
