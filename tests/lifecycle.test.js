"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHarness } = require("./helpers/autox-harness.js");

test("stop before worker entry restores Start and allows another run", () => {
  const h = createHarness();
  h.runMain();
  h.window.startBtn.click();
  h.window.stopBtn.click();
  h.runWorker();
  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
  assert.match(h.window.status.text, /已停止/);
  h.window.startBtn.click();
  assert.equal(h.workers.length, 2);
});

test("stop during countdown restores controls without any swipe", () => {
  const h = createHarness({ onSleep(h) { h.window.stopBtn.click(); } });
  h.runMain();
  h.window.startBtn.click();
  h.runWorker();
  assert.equal(h.swipes.length, 0);
  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
  assert.match(h.window.countdown.text, /-|0\.0s/);
});

test("stopping during a swipe does not count a cancelled result", () => {
  const h = createHarness({ onSwipe(h) { h.window.stopBtn.click(); return true; } });
  h.runMain();
  h.window.startBtn.click();
  h.runWorker();
  assert.equal(h.swipes.length, 1);
  assert.equal(h.window.count.text, "已刷：0");
  assert.equal(h.window.startBtn.enabled, true);
});

test("unexpected worker error restores controls and reports failure", () => {
  const h = createHarness({ onSleep() { throw new Error("native sleep failed"); } });
  h.runMain();
  h.window.startBtn.click();
  h.runWorker();
  assert.equal(h.window.startBtn.enabled, true);
  assert.match(h.window.status.text, /异常|失败/);
  assert.equal(h.errors.length, 1);
});

test("thread creation failure can be retried", () => {
  const h = createHarness({ startError: new Error("cannot create thread") });
  h.runMain();
  h.window.startBtn.click();
  assert.equal(h.window.startBtn.enabled, true);
  h.options.startError = null;
  h.window.startBtn.click();
  assert.equal(h.workers.length, 1);
});

test("a worker that finishes before threads.start returns can restart", () => {
  const h = createHarness({ startImmediately: true, onSwipe() { return false; } });
  h.load("core/config.js").minStay = 0;
  h.load("core/config.js").maxStay = 0;
  h.runMain();
  h.window.startBtn.click();
  assert.equal(h.swipes.length, 3);
  h.window.startBtn.click();
  assert.equal(h.workers.length, 2);
});

test("three consecutive failed gestures stop and allow a fresh run", () => {
  const h = createHarness({ onSwipe() { return false; } });
  h.load("core/config.js").minStay = 0;
  h.load("core/config.js").maxStay = 0;
  h.runMain();
  h.window.startBtn.click();
  h.runWorker();
  assert.equal(h.swipes.length, 3);
  assert.equal(h.window.count.text, "已刷：0");
  assert.equal(h.window.startBtn.enabled, true);
  assert.match(h.window.status.text, /请回到视频页/);
  h.window.startBtn.click();
  assert.equal(h.workers.length, 2);
});

test("successful swipe resets consecutive failure count", () => {
  const results = [false, false, true, false, false, false];
  const h = createHarness({ onSwipe(h) { return results[h.swipes.length - 1]; } });
  h.load("core/config.js").minStay = 0;
  h.load("core/config.js").maxStay = 0;
  h.runMain();
  h.window.startBtn.click();
  h.runWorker();
  assert.equal(h.swipes.length, 6);
  assert.equal(h.window.count.text, "已刷：1");
});

test("stale worker cleanup cannot stop or clear a restarted run", () => {
  const h = createHarness();
  const runner = h.load("core/swipe_runner.js").createSwipeRunner({});
  assert.equal(runner.start(), true);
  assert.equal(runner.start(), false);
  runner.stop();
  runner.stop();
  assert.equal(runner.start(), true);
  h.runWorker(0);
  assert.equal(runner.isRunning(), true);
  assert.equal(runner.start(), false);
  assert.equal(h.workers.length, 2);
  runner.stop();
  h.runWorker(1);
  assert.equal(h.swipes.length, 0);
});

test("stop restores controls immediately without waiting for the worker", () => {
  const h = createHarness();
  h.runMain();
  h.window.startBtn.click();
  h.window.stopBtn.click();
  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.window.stopBtn.enabled, false);
  h.window.startBtn.click();
  h.runWorker(0);
  assert.equal(h.window.startBtn.enabled, false);
  assert.equal(h.window.stopBtn.enabled, true);
  assert.equal(h.workers.length, 2);
});

test("stop while thread creation is returning interrupts the old thread only", () => {
  const h = createHarness();
  const runner = h.load("core/swipe_runner.js").createSwipeRunner({});
  const start = h.sandbox.threads.start;
  h.sandbox.threads.start = function (fn) {
    const thread = start(fn);
    runner.stop();
    return thread;
  };
  runner.start();
  assert.equal(h.workers[0].interrupted, true);
  h.sandbox.threads.start = start;
  assert.equal(runner.start(), true);
  h.runWorker(0);
  assert.equal(h.workers[1].interrupted, false);
  assert.equal(runner.isRunning(), true);
});

test("queued updates from a stopped worker cannot overwrite a fresh run", () => {
  const queued = [];
  let runUi;
  const h = createHarness({ onSleep(h) {
    h.sandbox.ui.run = runUi;
    h.window.stopBtn.click();
    h.window.startBtn.click();
  } });
  h.runMain();
  h.window.startBtn.click();
  runUi = h.sandbox.ui.run;
  // An interrupted ui.run may already have posted its callback to Android's queue.
  h.sandbox.ui.run = (fn) => queued.push(fn);
  h.runWorker();
  assert.ok(queued.length > 0);
  for (const fn of queued) fn();
  assert.equal(h.window.status.text, "状态：准备开始");
  assert.equal(h.window.countdown.text, "倒计时：-");
  assert.equal(h.window.startBtn.enabled, false);
  assert.equal(h.workers.length, 2);
});

test("queued completion from a finished run cannot disable a fresh run", () => {
  const h = createHarness({ onSwipe() { return false; } });
  h.load("core/config.js").minStay = 0;
  h.load("core/config.js").maxStay = 0;
  let bridge;
  const floatControl = h.load("ui/float_control.js");
  const createControl = floatControl.createFloatControl;
  floatControl.createFloatControl = (options) => {
    bridge = createControl(options);
    return bridge;
  };
  h.runMain();
  h.window.startBtn.click();
  const queued = [];
  const runUi = h.sandbox.ui.run;
  h.sandbox.ui.run = (fn) => queued.push(fn);
  h.runWorker();
  h.sandbox.ui.run = runUi;
  // Restore controls before the abandoned background completion callback arrives.
  bridge.onStopped();
  h.window.startBtn.click();
  for (const fn of queued) fn();
  assert.equal(h.window.startBtn.enabled, false);
  assert.equal(h.window.stopBtn.enabled, true);
  assert.equal(h.window.count.text, "已刷：0");
  assert.equal(h.window.status.text, "状态：准备开始");
});

test("close during a run closes the window and exits exactly once", () => {
  const h = createHarness({ onSleep(h) { h.window.closeBtn.click(); } });
  h.runMain();
  h.window.startBtn.click();
  h.runWorker();
  h.window.closeBtn.click();
  h.runTimers();
  assert.equal(h.windowClosed, true);
  assert.equal(h.exitCount, 1);
  assert.equal(h.swipes.length, 0);
});

test("missing accessibility permission leaves Start available", () => {
  const h = createHarness({ accessibility: false });
  h.runMain();
  h.window.startBtn.click();
  assert.equal(h.window.startBtn.enabled, true);
  assert.equal(h.workers.length, 0);
  h.sandbox.auto.service = {};
  h.window.startBtn.click();
  assert.equal(h.workers.length, 1);
});
