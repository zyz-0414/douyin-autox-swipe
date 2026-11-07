"use strict";

// Execute the real project modules; only Android/AutoX native boundaries are faked.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");

function createHarness(options = {}) {
  const workers = [];
  const timers = [];
  const errors = [];
  const toasts = [];
  const swipes = [];
  const cache = new Map();
  let activeWorker = null;
  let sleepCount = 0;
  let exitCount = 0;
  let windowClosed = false;

  function view() {
    let clickHandler;
    return {
      enabled: true,
      text: "",
      setEnabled(value) { this.enabled = value; },
      setText(value) { this.text = value; },
      setOnTouchListener(handler) { this.touch = handler; },
      click(handler) {
        if (handler) clickHandler = handler;
        else if (this.enabled && clickHandler) clickHandler();
      },
    };
  }

  const window = {
    startBtn: view(), stopBtn: view(), closeBtn: view(), dragBar: view(),
    title: view(), status: view(), count: view(), countdown: view(),
    x: 0, y: 0,
    setPosition(x, y) { this.x = x; this.y = y; },
    getX() { return this.x; },
    getY() { return this.y; },
    close() { windowClosed = true; },
  };

  const sandbox = {
    auto: { service: options.accessibility === false ? null : {} },
    app: { startActivity() {} },
    device: { width: 1080, height: 2400 },
    toast(message) { toasts.push(String(message)); },
    console: { error(error) { errors.push(error); } },
    floaty: {
      checkPermission() { return true; },
      window() { return window; },
    },
    ui: { run(fn) { fn(); } },
    threads: {
      // Node schedules the deterministic interleavings on one thread.
      // Real Java-thread coverage lives in rhino-concurrency.js.
      lock() { return { lock() {}, unlock() {} }; },
      start(fn) {
        if (options.startError) throw options.startError;
        const worker = { fn, interrupted: false, interrupt() { this.interrupted = true; } };
        workers.push(worker);
        if (options.startImmediately) runWorker(workers.length - 1);
        return worker;
      },
    },
    sleep(ms) {
      sleepCount += 1;
      if (activeWorker && activeWorker.interrupted) throw new Error("ScriptInterruptedException");
      if (options.onSleep) options.onSleep(harness, ms, sleepCount);
      if (sleepCount > 2000) throw new Error("Test worker did not stop");
    },
    swipe(...args) {
      swipes.push(args);
      return options.onSwipe ? options.onSwipe(harness) : true;
    },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    setInterval() { return 1; },
    exit() { exitCount += 1; },
  };
  const context = vm.createContext(sandbox);

  function load(relativePath) {
    const filename = path.resolve(root, relativePath);
    if (cache.has(filename)) return cache.get(filename).exports;
    let source = fs.readFileSync(filename, "utf8");
    if (filename === path.join(root, "ui/float_control.js")) {
      // Rhino accepts XML layouts; Node does not. Substitute only this native layout.
      source = source.replace(/<frame\b[\s\S]*?<\/frame>/, "null");
    }
    const module = { exports: {} };
    cache.set(filename, module);
    const wrapped = vm.runInContext("(function(require, module, exports) {\n" + source + "\n})", context, { filename });
    wrapped((request) => load(path.relative(root, path.resolve(path.dirname(filename), request))), module, module.exports);
    return module.exports;
  }

  function runWorker(index = 0) {
    const previous = activeWorker;
    activeWorker = workers[index];
    try { activeWorker.fn(); }
    finally { activeWorker = previous; }
  }

  const harness = {
    window, workers, errors, toasts, swipes, sandbox, options, load, runWorker,
    runMain() { load("main.js"); },
    runTimers() { for (const timer of timers.splice(0)) timer.fn(); },
    get exitCount() { return exitCount; },
    get windowClosed() { return windowClosed; },
  };
  return harness;
}

module.exports = { createHarness };
