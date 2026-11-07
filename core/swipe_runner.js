"use strict";

var config = require("./config.js");
var gesture = require("./gesture.js");

function randomStaySeconds() {
  var min = config.minStay;
  var max = config.maxStay;
  var value = min + Math.random() * (max - min);
  return Math.round(value * 10) / 10;
}

function createSwipeRunner(ui) {
  // 每次启动使用独立对象。旧线程退出时不能清理新一轮的状态。
  var currentRun = null;
  var displayedRun = null;
  var stateLock = threads.lock();

  // AutoX 的工作线程是真正的 Java 线程；身份比较和状态交换必须原子完成。
  // 临界区只读写内存，不调用 UI、启动线程或中断线程，避免互相等待。
  function withState(fn) {
    stateLock.lock();
    try { return fn(); }
    finally { stateLock.unlock(); }
  }

  function alive(run) {
    return withState(function () { return currentRun === run && !run.cancelled; });
  }

  function activeGuard(run) {
    return function () { return alive(run); };
  }

  function setStatus(run, text) {
    if (!alive(run)) return;
    try {
      if (ui && ui.setStatus) ui.setStatus(text, activeGuard(run));
    } catch (e) {}
  }

  function setCount(run, n) {
    if (!alive(run)) return;
    try {
      if (ui && ui.setCount) ui.setCount(n, activeGuard(run));
    } catch (e) {}
  }

  function setCountdown(run, sec) {
    if (!alive(run)) return;
    try {
      if (ui && ui.setCountdown) ui.setCountdown(sec, activeGuard(run));
    } catch (e) {}
  }

  function sleepInterruptible(run, totalMs) {
    var left = totalMs;
    while (alive(run) && left > 0) {
      var step = Math.min(200, left);
      sleep(step);
      left -= step;
      setCountdown(run, Math.max(0, left / 1000));
    }
    return alive(run);
  }

  function finish(run, statusText) {
    var finished = withState(function () {
      if (currentRun !== run) return false;
      currentRun = null;
      return true;
    });
    if (!finished) return;
    var shouldUpdate = function () {
      return withState(function () { return displayedRun === run && currentRun === null; });
    };
    // 三项收尾互相独立；一项 UI 更新失败也必须尝试恢复按钮。
    try {
      if (ui && ui.setStatus) ui.setStatus(statusText || "已停止", shouldUpdate);
    } catch (e) {}
    try {
      if (ui && ui.setCountdown) ui.setCountdown(0, shouldUpdate);
    } catch (e2) {}
    try {
      if (ui && ui.onStopped) ui.onStopped(shouldUpdate);
    } catch (e3) {}
  }

  function interrupt(run) {
    var thread = withState(function () { return run.thread; });
    try {
      if (thread && thread.interrupt) thread.interrupt();
    } catch (e) {}
  }

  function loop(run) {
    var failCount = 0;

    while (alive(run)) {
      var stay = randomStaySeconds();
      setStatus(run, "观看中");
      setCountdown(run, stay);

      if (!sleepInterruptible(run, Math.floor(stay * 1000))) {
        break;
      }

      if (!alive(run)) break;

      setStatus(run, "滑动中");
      setCountdown(run, 0);
      if (!alive(run)) break;
      var ok = false;
      try {
        ok = gesture.swipeUp();
      } catch (e) {
        ok = false;
      }
      // 原生手势可能在停止后才返回（中断也可能被手势层转为 false）。
      if (!alive(run)) break;
      if (!ok) {
        failCount += 1;
        setStatus(run, "滑动失败 " + failCount + "/" + config.maxSwipeFailures);
        if (failCount >= config.maxSwipeFailures) {
          return "已停止：请回到视频页";
        }
        if (!sleepInterruptible(run, 800)) break;
        continue;
      }

      failCount = 0;
      var count = withState(function () {
        if (currentRun !== run || run.cancelled) return null;
        run.count += 1;
        return run.count;
      });
      if (count === null) break;
      setCount(run, count);
    }

    return "已停止";
  }

  return {
    start: function () {
      var run = { cancelled: false, thread: null, count: 0 };
      var started = withState(function () {
        if (currentRun) return false;
        currentRun = run;
        displayedRun = run;
        return true;
      });
      if (!started) return false;
      setCount(run, 0);
      setCountdown(run, null);
      setStatus(run, "准备开始");
      try {
        var thread = threads.start(function () {
          var statusText = "已停止";
          try {
            statusText = loop(run);
          } catch (e) {
            if (alive(run)) {
              statusText = "已停止：运行异常";
              try { console.error(e); } catch (logError) {}
            }
          } finally {
            finish(run, statusText);
          }
        });
        // stop 可能发生在线程已创建、但 threads.start 尚未返回时。
        var cancelled = withState(function () {
          run.thread = thread;
          return run.cancelled;
        });
        if (cancelled) interrupt(run);
      } catch (e) {
        finish(run, "启动失败");
        throw e;
      }
      return true;
    },
    stop: function () {
      var run = withState(function () {
        var active = currentRun;
        if (active) active.cancelled = true;
        return active;
      });
      if (!run) return;
      // 在调用者线程恢复控件，不依赖已中断线程执行 ui.run。
      finish(run, "已停止");
      interrupt(run);
    },
    isRunning: function () {
      return withState(function () { return currentRun !== null && !currentRun.cancelled; });
    },
    getCount: function () {
      return withState(function () { return displayedRun ? displayedRun.count : 0; });
    },
  };
}

module.exports = {
  createSwipeRunner: createSwipeRunner,
  randomStaySeconds: randomStaySeconds,
};
