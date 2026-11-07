"use strict";

// Standalone Rhino 1.8.1 test, run from the repository root with Java 11+:
// java -cp "rhino-1.8.1.jar;rhino-tools-1.8.1.jar;rhino-xml-1.8.1.jar" \
//   org.mozilla.javascript.tools.shell.Main -opt 9 tests/rhino-concurrency.js
// Uses real Java threads and locks. Android gestures/views are not exercised.
var Context = org.mozilla.javascript.Context;
var CountDownLatch = java.util.concurrent.CountDownLatch;
var TimeUnit = java.util.concurrent.TimeUnit;
var rootContext = Context.getCurrentContext();
var rootScope = this;
// The debugger callbacks must themselves be compiled without instrumentation.
if (rootContext.getOptimizationLevel() < 0) throw new Error("Run this test with -opt 9");
// A negative control proves that this test detects an absent state lock.
var withoutLock = arguments.length > 0 && String(arguments[0]) === "--without-lock";
var source = String(readFile("core/swipe_runner.js", "UTF-8"));
var lines = source.split(/\r?\n/);
var clearLine = -1;
for (var i = 0; i < lines.length; i++) {
  if (/^\s*currentRun = null;/.test(lines[i])) clearLine = i + 2;
}
if (clearLine < 0) throw new Error("Cannot locate finish's currentRun exchange");

var paused = new CountDownLatch(1);
var release = new CountDownLatch(1);
var driverEntered = new CountDownLatch(1);
var driverDone = new CountDownLatch(1);
var replacementGate = new CountDownLatch(1);
var pausedOnce = new java.util.concurrent.atomic.AtomicBoolean(false);
var workerNumber = new java.util.concurrent.atomic.AtomicInteger(0);
var failures = new java.util.concurrent.ConcurrentLinkedQueue();
var workers = new java.util.concurrent.CopyOnWriteArrayList();

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function awaitLatch(latch, message) {
  check(latch.await(5, TimeUnit.SECONDS), message);
}

// A debugger breakpoint exposes the actual check/clear scheduling boundary
// without changing production source. The fixed runner holds its state lock
// here; the driver must wait until the old worker completes its exchange.
var debuggerHook = new JavaAdapter(org.mozilla.javascript.debug.Debugger, {
  handleCompilationDone: function () {},
  getFrame: function (cx, script) {
    var isRunner = String(script.getSourceName()) === "core/swipe_runner.js";
    return new JavaAdapter(org.mozilla.javascript.debug.DebugFrame, {
      onEnter: function () {},
      onExceptionThrown: function () {},
      onExit: function () {},
      onDebuggerStatement: function () {},
      onLineChange: function (frameContext, line) {
        if (!isRunner || line !== clearLine ||
            String(java.lang.Thread.currentThread().getName()) !== "old-worker" ||
            !pausedOnce.compareAndSet(false, true)) return;
        paused.countDown();
        // An unlocked buggy runner can interrupt this thread from stop().
        // Keep the breakpoint until released, so that interruption does not
        // accidentally skip the stale assignment we are trying to detect.
        var deadline = java.lang.System.nanoTime() + 5000000000;
        while (release.getCount() !== 0) {
          try {
            check(release.await(100, TimeUnit.MILLISECONDS) ||
              java.lang.System.nanoTime() < deadline, "Breakpoint release timed out");
          } catch (e) {
            if (!(e.javaException instanceof java.lang.InterruptedException)) throw e;
          }
        }
      },
    });
  },
});

function configureContext(cx) {
  cx.setOptimizationLevel(-1);
  cx.setGeneratingDebug(true);
  cx.setDebugger(debuggerHook, null);
}
configureContext(rootContext);

function javaThread(name, action) {
  var thread = new java.lang.Thread(new java.lang.Runnable({
    run: function () {
      var cx = Context.enter();
      try {
        configureContext(cx);
        action();
      } catch (e) {
        failures.add(String(e));
      } finally {
        Context.exit();
      }
    },
  }), name);
  thread.setDaemon(true);
  return thread;
}

var threads = {
  lock: function () {
    if (withoutLock) return { lock: function () {}, unlock: function () {} };
    return new java.util.concurrent.locks.ReentrantLock();
  },
  start: function (action) {
    var n = workerNumber.incrementAndGet();
    var thread = javaThread(n === 1 ? "old-worker" : "replacement-worker", function () {
      if (n !== 1) {
        try { awaitLatch(replacementGate, "Replacement gate timed out"); }
        catch (e) {
          if (e.javaException instanceof java.lang.InterruptedException) return;
          throw e;
        }
      }
      action();
    });
    workers.add(thread);
    thread.start();
    return thread;
  },
};
var device = { width: 1080, height: 2400 };
var swipe = function () { return false; };
var sleep = function (ms) { java.lang.Thread.sleep(ms); };
var console = { error: function (error) { failures.add(String(error)); } };
var modules = {};

function loadModule(name) {
  if (modules[name]) return modules[name].exports;
  var module = { exports: {} };
  modules[name] = module;
  var text = String(readFile(name, "UTF-8"));
  var wrapped = rootContext.compileFunction(rootScope,
    "function(require, module, exports) {\n" + text + "\n}", name, 1, null);
  var require = function (request) {
    return loadModule("core/" + String(request).replace(/^\.\//, ""));
  };
  wrapped(require, module, module.exports);
  return module.exports;
}

var config = loadModule("core/config.js");
config.minStay = 0;
config.maxStay = 0;
config.maxSwipeFailures = 1;
var runner = loadModule("core/swipe_runner.js").createSwipeRunner({});
var driver;
try {
  check(runner.start(), "Initial start was rejected");
  awaitLatch(paused, "Old worker did not reach the finish breakpoint");
  driver = javaThread("ui-driver", function () {
    driverEntered.countDown();
    try {
      runner.stop();
      check(runner.start(), "Replacement start was rejected");
    } finally {
      driverDone.countDown();
    }
  });
  driver.start();
  awaitLatch(driverEntered, "Driver did not start");
  // Bounded observation: with the fix, stop waits on the old worker's lock.
  var completedWhilePaused = driverDone.await(150, TimeUnit.MILLISECONDS);
  release.countDown();
  awaitLatch(driverDone, "Driver deadlocked while stopping/restarting");
  workers.get(0).join(5000);
  check(!workers.get(0).isAlive(), "Old worker did not exit");
  check(failures.isEmpty(), "Java-thread errors: " + failures);
  check(workers.size() === 2, "Expected exactly two workers");
  check(runner.isRunning(), "Old finish cleared the replacement run");
  check(!completedWhilePaused, "Stop crossed a partially completed state exchange");
  print("PASS: real Rhino/Java threads preserve the replacement run across finish/stop/start");
} finally {
  release.countDown();
  runner.stop();
  replacementGate.countDown();
  for (var w = 0; w < workers.size(); w++) {
    workers.get(w).interrupt();
    workers.get(w).join(5000);
  }
  if (driver) driver.join(5000);
}
