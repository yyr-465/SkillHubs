import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release, totalmem, version } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { preview } from "vite";
import { createFixture, removeFixture, scanFixture } from "./fixture.ts";

const { values: options } = parseArgs({ options: {
  build: { type: "string", default: "dist" },
  screenshots: { type: "string" },
  synthetic: { type: "boolean" },
  translation: { type: "boolean" },
} });
const repo = fileURLToPath(new URL("../../", import.meta.url));
const pagesBase = "/SkillHubs/";
const exampleFile = fileURLToPath(new URL("example-manifest.json", import.meta.url));
const example = JSON.parse(readFileSync(exampleFile, "utf8"));
const edgeBinary = process.env.SKILLHUB_M1_EDGE ?? join(
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe",
);
const screenshotDir = options.screenshots && resolve(options.screenshots);
const scratch = createFixture();
const profile = join(scratch.directory, "edge-profile");
let edge;
let server;
let socket;

async function until(check, label, timeout = 7_000) {
  const stop = performance.now() + timeout;
  while (performance.now() < stop) {
    const result = await check();
    if (result) return result;
    await delay(30);
  }
  throw new Error(`Timed out while checking ${label}`);
}

async function connect() {
  // The file contains a port opened by this isolated Edge process, not a URL from imported data.
  const port = await until(() => {
    if (edge.exitCode !== null) throw new Error(`Edge exited with ${edge.exitCode}`);
    try {
      return Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/u)[0]);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }, "Edge DevTools port");
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3_000) })
    .catch((error) => { throw error.cause ?? error; });
  const targets = await response.json();
  const endpoint = new URL(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.port, String(port));
  socket = new WebSocket(endpoint);
  await until(() => {
    if (socket.readyState === WebSocket.CLOSED) throw new Error("Edge debugging socket closed during connection");
    return socket.readyState === WebSocket.OPEN;
  }, "Edge debugging socket");

  const pending = new Map();
  const events = [];
  let id = 0;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      if (callback) {
        pending.delete(message.id);
        callback(message);
      }
    } else {
      events.push(message);
    }
  });
  function send(method, params = {}) {
    const request = ++id;
    return new Promise((done, fail) => {
      const deadline = setTimeout(() => {
        pending.delete(request);
        fail(new Error(`No Edge response for ${method}`));
      }, 7_000);
      pending.set(request, ({ error, result }) => {
        clearTimeout(deadline);
        if (error) fail(new Error(`${method}: ${error.message}`));
        else done(result);
      });
      socket.send(JSON.stringify({ id: request, method, params }));
    });
  }
  async function inspect(fn, ...args) {
    const data = await send("Runtime.evaluate", {
      expression: `(${fn})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description ?? data.exceptionDetails.text);
    return data.result.value;
  }
  return { send, inspect, events };
}

// Observe app-visible browser operations, and measure from the actual file input change to a painted summary.
function instrumentPage() {
  window.m1QA = { writes: [], elapsed: null, reads: 0 };
  const watch = (target, names) => {
    for (const name of names) {
      const original = target[name];
      target[name] = function (...args) {
        window.m1QA.writes.push(name);
        return original.apply(this, args);
      };
    }
  };
  watch(Storage.prototype, ["setItem", "removeItem", "clear"]);
  watch(IDBFactory.prototype, ["open", "deleteDatabase"]);
  watch(CacheStorage.prototype, ["open", "delete"]);
  watch(Cache.prototype, ["put", "add", "addAll", "delete"]);
  const blobRead = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function (...args) {
    window.m1QA.reads++;
    return blobRead.apply(this, args);
  };
  document.addEventListener("change", (event) => {
    if (!event.target.matches("input[type=file]") || !event.target.files?.length) return;
    const previous = document.querySelector("#inventory-summary");
    const started = performance.now();
    const observer = new MutationObserver(() => {
      const current = document.querySelector("#inventory-summary");
      if (!current || current === previous) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.m1QA.elapsed = performance.now() - started;
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 2_000);
  }, true);
}

const summaryCounts = () => [...document.querySelectorAll("#inventory-summary dd")].map((el) => Number(el.textContent));
const installationCount = () => document.querySelectorAll("#inventory-installations [id^=installation-]").length;
const allLinks = () => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));

let browserLog = "";
try {
  const buildDir = resolve(repo, options.build);
  server = await preview({
    configFile: false, base: pagesBase, root: repo, build: { outDir: buildDir },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  edge = spawn(edgeBinary, [
    "--headless=new", "--no-first-run", "--disable-background-networking", "--disable-extensions",
    "--disable-breakpad", "--disable-crash-reporter", "--disable-gpu", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  edge.on("error", (error) => { browserLog += error.message + "\n"; });
  edge.stderr.on("data", (data) => { browserLog += data.toString(); });
  const { send, inspect, events } = await connect();
  await send("Page.enable", { enableFileChooserOpenedEvent: true });
  await send("Page.bringToFront");
  await send("DOM.enable");
  await send("Network.enable");
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${instrumentPage})();` });
  const browser = await send("Browser.getVersion");

  async function viewport(width, height) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  }
  async function screenshot(name) {
    if (!screenshotDir) return;
    mkdirSync(screenshotDir, { recursive: true });
    const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const prefix = options.translation ? "translation-" : "";
    writeFileSync(join(screenshotDir, `m1-${prefix}${name}.png`), Buffer.from(shot.data, "base64"));
  }
  async function noHorizontalOverflow() {
    assert.deepEqual(await inspect(() => {
      const title = document.querySelector("#inventory-title");
      const route = title.parentElement.parentElement;
      return [...route.querySelectorAll("section, button, code, select, input:not([hidden])")].flatMap((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 ? [el.textContent.trim().slice(0, 64)] : [];
      });
    }), []);
  }
  async function press(key, code, virtualKey, modifiers) {
    const fields = { key, code, windowsVirtualKeyCode: virtualKey, modifiers };
    if (key === "Enter") {
      await send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", unmodifiedText: "\r", ...fields });
    } else {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...fields });
    }
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...fields });
  }
  async function clickButton(label, keyboard = false) {
    const found = await inspect((text, focusOnly) => {
      const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text);
      if (!button || button.disabled) return false;
      if (focusOnly) button.focus();
      else button.click();
      return true;
    }, label, keyboard);
    assert.equal(found, true, label);
    if (keyboard) await press("Enter", "Enter", 13);
  }
  async function choose(label, path) {
    const start = events.length;
    await clickButton(label, true);
    const event = await until(() => events.slice(start).find((message) => message.method === "Page.fileChooserOpened"), "keyboard file chooser");
    await send("DOM.setFileInputFiles", { files: [path], backendNodeId: event.params.backendNodeId });
  }
  async function search(selector, value) {
    await until(() => inspect((selector) => {
      const input = document.querySelector(selector);
      input?.focus();
      return !!input;
    }, selector), "search input");
    await press("a", "KeyA", 65, 2);
    await press("Backspace", "Backspace", 8);
    if (value) await send("Input.insertText", { text: value });
  }
  async function expectCounts(expected) {
    await until(async () => JSON.stringify(await inspect(summaryCounts)) === JSON.stringify(expected), "overview metrics");
  }
  async function clear() {
    await clickButton("Clear inventory", true);
    assert.deepEqual(await inspect(summaryCounts), []);
    assert.equal(await inspect(() => document.activeElement.textContent.trim()), "Choose inventory file");
  }

  await viewport(1440, 1000);
  await send("Page.navigate", { url: origin + pagesBase + "#/inventory" });
  await until(() => inspect(() => document.querySelector("#inventory-title")?.textContent), "empty inventory");
  assert.deepEqual(await inspect(summaryCounts), []);
  await screenshot("empty-desktop");
  await choose("Choose inventory file", exampleFile);
  await expectCounts([3, 2, 2]);
  await noHorizontalOverflow();
  await screenshot("synthetic-desktop");
  await viewport(390, 844);
  await inspect(() => {
    document.querySelectorAll("#inventory-evidence details").forEach((detail) => { detail.open = true; });
    document.querySelector("#inventory-evidence").scrollIntoView();
  });
  await until(() => inspect(() => !!document.querySelector("#inventory-evidence details button")), "synthetic evidence");
  await noHorizontalOverflow();
  await screenshot("synthetic-narrow");
  await viewport(1440, 1000);
  await clear();

  if (options.synthetic) {
    console.log(JSON.stringify({ edge: browser.product, synthetic: "pass" }));
  } else {
    const requestStart = events.length;
    await inspect(() => { window.m1QA.writes.length = 0; });
    const storageContents = async () => ({
      local: Object.entries(localStorage).sort(),
      session: Object.entries(sessionStorage).sort(),
      indexed: await indexedDB.databases(),
      caches: await caches.keys(),
      cookies: document.cookie,
    });
    const beforeStorage = await inspect(storageContents);
    const groupingRoot = join(scratch.directory, "grouping-root");
    const recoveredFile = join(scratch.directory, "grouping-inventory.json");
    mkdirSync(join(groupingRoot, "SKILL.md"), { recursive: true });
    mkdirSync(join(groupingRoot, "kept"));
    writeFileSync(join(groupingRoot, "kept", "SKILL.md"), "---\nname: Recovered Skill\ndescription: Synthetic sibling package\n---\n");
    const recovered = spawnSync(process.execPath, ["local-agent/scan.ts", "--no-defaults", "--root", groupingRoot,
      "--output", recoveredFile], { cwd: repo, encoding: "utf8", timeout: 20_000, windowsHide: true });
    assert.ifError(recovered.error);
    assert.equal(recovered.status, 0, recovered.stderr);
    await choose("Choose inventory file", recoveredFile);
    await expectCounts([1, 1, 1]);
    assert.equal(await inspect(installationCount), 1);
    assert.match(await inspect(() => {
      const row = document.querySelector("#inventory-installations [id^=installation-]");
      row.scrollIntoView({ block: "center" });
      return row.textContent;
    }), /kept\/SKILL\.md/u);
    await screenshot("recovered-installation");
    await clear();

    const empty = join(scratch.directory, "zero-installations.json");
    writeFileSync(empty, JSON.stringify({ ...example, roots: [example.roots[1]], diagnostics: [], installations: [] }));
    await choose("Choose inventory file", empty);
    await expectCounts([0, 0, 1]);
    assert.match(await inspect(() => document.querySelector("#inventory-installations").textContent), /No valid installations/);
    await screenshot("zero-installations");
    await clear();

    const cliTimes = [];
    const edgeTimes = [];
    let manifest;
    let manifestPath;
    for (let sample = 0; sample < 3; sample++) {
      manifestPath = join(scratch.directory, `inventory-${sample}.json`);
      const result = scanFixture(scratch, manifestPath);
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      cliTimes.push(result.elapsedMs);
      assert.ok(result.elapsedMs <= 5_000);
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      await inspect(() => { window.m1QA.elapsed = null; });
      await choose("Choose inventory file", manifestPath);
      await expectCounts([200, 198, 8]);
      const ms = await until(() => inspect(() => window.m1QA.elapsed), "painted imported overview");
      edgeTimes.push(ms);
      assert.ok(ms <= 1_000);
      if (sample < 2) await clear();
    }
    console.log(JSON.stringify({
      browser: browser.product, node: process.version, windows: `${version()} ${release()}`,
      arch: process.arch, cpu: cpus()[0]?.model, threads: cpus().length, ramGiB: totalmem() / 2 ** 30,
      translationConfigured: !!options.translation,
      cliMs: cliTimes.map(Math.round), edgeMs: edgeTimes.map(Math.round),
    }));

    assert.equal(await inspect(() => document.querySelectorAll("#inventory-coverage > ul > li").length), 10);
    assert.equal(await inspect(() => document.querySelectorAll("#inventory-diagnostics li").length), 5);
    await screenshot("inventory-desktop");
    await press("Tab", "Tab", 9);
    assert.equal(await inspect(() => document.activeElement.textContent.trim()), "Clear inventory");
    const unsupported = join(scratch.directory, "unsupported.json");
    writeFileSync(unsupported, JSON.stringify({ ...example, schemaVersion: 2 }));
    await choose("Choose inventory file", unsupported);
    assert.match(await until(() => inspect(() => document.querySelector("[role=alert]")?.textContent), "version error"), /version/i);
    await expectCounts([200, 198, 8]);
    const tooBig = join(scratch.directory, "oversize.json");
    writeFileSync(tooBig, Buffer.alloc(8 * 1024 * 1024 + 1, 32));
    const readsBefore = await inspect(() => window.m1QA.reads);
    await choose("Choose inventory file", tooBig);
    assert.match(await until(() => inspect(() => document.querySelector("[role=alert]")?.textContent), "file-size error"), /8 MiB/i);
    assert.equal(await inspect(() => window.m1QA.reads), readsBefore);
    await expectCounts([200, 198, 8]);
    await screenshot("invalid-keeps-results");

    assert.equal(await inspect(installationCount), 50);
    await clickButton("Next page", true);
    assert.match(await inspect(() => document.querySelector("#inventory-installations [role=status]").textContent), /51.*100.*200/);
    await search("#inventory-installations input", "skill-199/SKILL.md");
    await until(async () => await inspect(installationCount) === 1, "relative path search");
    assert.match(await inspect(() => document.querySelector("#inventory-installations [id^=installation-]").textContent), /inventory\.example\.invalid/);
    assert.equal(await inspect(() => document.querySelectorAll("#inventory-installations a, #inventory-installations img").length), 0);
    await search("#inventory-installations input", "");
    const codex = manifest.roots.find(({ kind }) => kind === "codex");
    await inspect((id) => {
      const input = document.querySelector("#inventory-installations select");
      input.value = id;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, codex.id);
    assert.equal(await inspect(installationCount), 40);
    assert.equal(await inspect(() => document.querySelectorAll("#inventory-evidence details").length), 3);
    await inspect(() => document.querySelectorAll("#inventory-evidence details").forEach((detail) => { detail.open = true; }));
    const evidence = await until(async () => {
      const groups = await inspect(() => [...document.querySelectorAll("#inventory-evidence details")].map((detail) =>
        [...detail.querySelectorAll("div > ul > li")].filter((node) => node.querySelector("button")).map((node) =>
          [...node.querySelectorAll("code bdi")].map((code) => code.textContent))));
      return groups.every((group) => group.length) && groups;
    }, "expanded evidence members");
    const ordinals = evidence.map((group) => group.map((paths) => {
      assert.ok(paths.length);
      const ordinals = [...new Set(paths.map((path) => Number(/skill-(\d{3})\/skill\.md$/iu.exec(path)?.[1])))];
      assert.equal(ordinals.length, 1);
      return ordinals[0];
    }).sort((a, b) => a - b));
    assert.deepEqual(ordinals[0], [1, 51, 91]);
    assert.deepEqual(ordinals.slice(1).sort((a, b) => a[0] - b[0]), [[1, 51, 91, 126], [156, 176]]);
    await viewport(390, 844);
    for (const [index, group] of evidence.entries()) {
      const [firstPath] = group[0];
      const row = manifest.installations.find(({ locations }) => locations.some(({ relativePath }) => relativePath === firstPath));
      assert.ok(row);
      await inspect((groupIndex) => document.querySelectorAll("#inventory-evidence details")[groupIndex].querySelector("button").focus(), index);
      await press("Enter", "Enter", 13);
      await until(() => inspect((id) => {
        const target = document.activeElement;
        const rect = target.getBoundingClientRect();
        return target.id === "installation-" + id && rect.top < innerHeight && rect.bottom > 0;
      }, row.id), `evidence group ${index + 1} focuses a visible installation`);
    }
    assert.equal(await inspect(() => document.querySelector("#inventory-installations select").value), "");
    await noHorizontalOverflow();
    await screenshot("evidence-focus-narrow");
    await viewport(1440, 1000);
    await clear();

    const requests = events.slice(requestStart).filter(({ method }) => method === "Network.requestWillBeSent").map(({ params }) => params.request.url);
    assert.deepEqual(requests, [], "import / review / clear must not request network resources");
    assert.deepEqual(await inspect(() => window.m1QA.writes), [], "import / review / clear must not use browser storage");
    assert.deepEqual(await inspect(storageContents), beforeStorage, "no inventory state may remain in browser storage");

    await choose("Choose inventory file", manifestPath);
    await expectCounts([200, 198, 8]);
    await inspect(() => { location.hash = "#/"; });
    await until(async () => (await inspect(allLinks)).includes("#/inventory"), "dashboard inventory entry");
    await inspect(() => document.querySelector('a[href="#/inventory"]').click());
    await until(() => inspect(() => document.querySelector("#inventory-title")?.textContent), "inventory re-entry");
    assert.deepEqual(await inspect(summaryCounts), []);
    await choose("Choose inventory file", manifestPath);
    await expectCounts([200, 198, 8]);
    if (!options.translation) {
      const language = (value) => {
        const select = document.querySelector("aside select");
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      };
      await viewport(390, 844);
      await inspect(language, "zh");
      await until(() => inspect(() => document.querySelector("#inventory-title").textContent === "本地 Skills 盘点"), "Chinese inventory");
      assert.deepEqual(await inspect(() => [...document.querySelectorAll("#inventory-summary dt")].map(({ textContent }) => textContent)),
        ["安装位置数", "不同文件内容数", "扫描来源数"]);
      await noHorizontalOverflow();
      await screenshot("inventory-chinese-narrow");
      await inspect(language, "en");
      await viewport(1440, 1000);
    }
    await send("Page.reload");
    await until(async () => (await inspect(() => !!document.querySelector("#inventory-title"))) && (await inspect(summaryCounts)).length === 0, "reload discards inventory");
    assert.equal(await inspect(() => location.pathname + location.hash), pagesBase + "#/inventory");

    await inspect(() => { location.hash = "#/skills"; });
    await until(() => inspect(() => document.body.innerText.includes("Total 8 skills")), "public catalog");
    await search('input[placeholder^="Search skills"]', "Data Sanitizer");
    await until(() => inspect(() => document.body.innerText.includes("Total 1 skills")), "catalog search");
    await inspect(() => [...document.querySelectorAll("h3")].find((el) => el.textContent === "Data Sanitizer").click());
    await until(() => inspect(() => location.hash.includes("/skills/data-sanitizer")), "catalog detail");
    await until(() => inspect(() => document.body.innerText.includes("A checklist for handling untrusted input defensively.")), "catalog Original README");
    assert.equal(await inspect(() => document.body.innerText.includes("Translate to Chinese")), !!options.translation);

    await inspect(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
      location.hash = "#/";
    });
    await until(() => inspect(() => document.body.innerText.includes("Load local Skill folder")), "manual directory control");
    await choose("Load local Skill folder", join(repo, "qa", "fixtures", "local-skill-folder"));
    await until(() => inspect(() => document.body.innerText.includes("Loaded 5 skills from your folder")), "manual folder result");
    await clickButton("Back to sample catalog", true);
    await inspect(() => { location.hash = "#/skills"; });
    await search('input[placeholder^="Search skills"]', "");
    await until(() => inspect(() => document.body.innerText.includes("Total 8 skills")), "restored public catalog");
    console.log(JSON.stringify({ inventory: "pass", networkRequests: requests.length, storageOperations: 0, legacy: "pass" }));
  }
  await send("Browser.close").catch(() => undefined);
} catch (error) {
  console.error(browserLog.split(/\r?\n/u).filter(Boolean).slice(0, 4).join("\n"));
  throw error;
} finally {
  socket?.close();
  if (edge && edge.exitCode === null) {
    edge.kill();
    await until(() => edge.exitCode !== null || edge.signalCode !== null, "Edge shutdown", 3_000).catch(() => undefined);
  }
  await server?.close();
  removeFixture(scratch);
}
