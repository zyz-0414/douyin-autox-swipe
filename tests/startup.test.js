"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHarness } = require("./helpers/autox-harness.js");

test("missing overlay permission opens settings without creating a window or keepalive", () => {
  const h = createHarness();
  let requested = 0;
  let windows = 0;
  let intervals = 0;
  h.sandbox.floaty.checkPermission = () => false;
  h.sandbox.floaty.requestPermission = () => { requested += 1; };
  h.sandbox.floaty.window = () => { windows += 1; return h.window; };
  h.sandbox.setInterval = () => { intervals += 1; };

  h.runMain();

  assert.equal(requested, 1);
  assert.equal(windows, 0);
  assert.equal(intervals, 0);
  assert.ok(h.toasts.some((text) => /悬浮窗权限.*重新运行/.test(text)));
});

test("a rejected start restores the start button and reports failure", () => {
  const h = createHarness();
  h.load("ui/float_control.js").createFloatControl({ onStart: () => false });

  h.window.startBtn.click();

  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
  assert.match(h.window.status.text, /启动失败/);
});

test("a thrown start reports failure and allows retry", () => {
  const h = createHarness();
  h.load("ui/float_control.js").createFloatControl({
    onStart() { throw new Error("thread unavailable"); },
  });

  h.window.startBtn.click();

  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
  assert.match(h.window.status.text, /启动失败.*thread unavailable/);
});

test("an undefined start return preserves existing callbacks", () => {
  const h = createHarness();
  h.load("ui/float_control.js").createFloatControl({ onStart() {} });
  h.window.startBtn.click();
  assert.equal(h.window.startBtn.enabled, false);
  assert.equal(h.window.stopBtn.enabled, true);
});

test("a denied accessibility start retains its specific permission message", () => {
  const h = createHarness({ accessibility: false });
  h.runMain();
  h.window.startBtn.click();
  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
  assert.equal(h.window.status.text, "状态：请开启无障碍权限");
});

test("UI callbacks discard updates whose run is stale when the UI executes", () => {
  const h = createHarness();
  const bridge = h.load("ui/float_control.js").createFloatControl();
  bridge.setStatus("new status");
  bridge.setCount(5);
  bridge.setCountdown(8);
  h.window.startBtn.click();
  const before = [h.window.status.text, h.window.count.text, h.window.countdown.text];
  const queue = [];
  h.sandbox.ui.run = (fn) => { queue.push(fn); };
  let current = true;
  const guard = () => current;
  bridge.setStatus("stale", guard);
  bridge.setCount(1, guard);
  bridge.setCountdown(1, guard);
  bridge.onStopped(guard);
  current = false;
  h.sandbox.ui.run = (fn) => fn();
  for (const fn of queue) fn();

  assert.deepEqual([h.window.status.text, h.window.count.text, h.window.countdown.text], before);
  assert.equal(h.window.startBtn.enabled, false);
  assert.equal(h.window.stopBtn.enabled, true);
});

test("closing the window discards already queued UI callbacks", () => {
  const h = createHarness();
  const bridge = h.load("ui/float_control.js").createFloatControl();
  bridge.setCount(5);
  const queue = [];
  h.sandbox.ui.run = (fn) => { queue.push(fn); };
  bridge.setCount(1);
  bridge.close();
  for (const fn of queue) fn();
  assert.equal(h.window.count.text, "已刷：5");
  assert.equal(h.windowClosed, true);
});

test("onStopped accepts legacy non-function arguments", () => {
  const h = createHarness();
  const bridge = h.load("ui/float_control.js").createFloatControl();
  h.window.startBtn.click();
  bridge.onStopped(true);
  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
});

test("failed synchronous UI updates are posted instead of touching views on the worker", () => {
  const h = createHarness();
  const bridge = h.load("ui/float_control.js").createFloatControl();
  bridge.setCount(5);
  const queue = [];
  h.sandbox.ui.run = () => { throw new Error("worker interrupted"); };
  h.sandbox.ui.post = (fn) => { queue.push(fn); };

  bridge.setCount(1);

  assert.equal(h.window.count.text, "已刷：5");
  assert.equal(queue.length, 1);
  queue.shift()();
  assert.equal(h.window.count.text, "已刷：1");
});

test("posted fallback updates are discarded after the window closes", () => {
  const h = createHarness();
  const bridge = h.load("ui/float_control.js").createFloatControl();
  bridge.setCount(5);
  const queue = [];
  h.sandbox.ui.run = () => { throw new Error("worker interrupted"); };
  h.sandbox.ui.post = (fn) => { queue.push(fn); };
  bridge.setCount(1);
  bridge.close();

  for (const fn of queue) fn();

  assert.equal(h.window.count.text, "已刷：5");
});

test("posted fallback updates are discarded when their run becomes stale", () => {
  const h = createHarness();
  const bridge = h.load("ui/float_control.js").createFloatControl();
  bridge.setCount(5);
  const queue = [];
  h.sandbox.ui.run = () => { throw new Error("worker interrupted"); };
  h.sandbox.ui.post = (fn) => { queue.push(fn); };
  let current = true;
  bridge.setCount(1, () => current);
  current = false;

  for (const fn of queue) fn();

  assert.equal(h.window.count.text, "已刷：5");
});
