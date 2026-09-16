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
  var running = false;
  var stopping = false;
  var worker = null;
  var swipedCount = 0;

  function alive() {
    return running && !stopping;
  }

  function setStatus(text) {
    if (stopping) return;
    try {
      if (ui && ui.setStatus) ui.setStatus(text);
    } catch (e) {}
  }

  function setCount(n) {
    if (stopping) return;
    try {
      if (ui && ui.setCount) ui.setCount(n);
    } catch (e) {}
  }

  function setCountdown(sec) {
    if (stopping) return;
    try {
      if (ui && ui.setCountdown) ui.setCountdown(sec);
    } catch (e) {}
  }

  function sleepInterruptible(totalMs) {
    var left = totalMs;
    while (alive() && left > 0) {
      var step = Math.min(200, left);
      sleep(step);
      left -= step;
      setCountdown(Math.max(0, left / 1000));
    }
    return alive();
  }

  function finish(statusText) {
    running = false;
    if (!stopping) {
      setStatus(statusText || "已停止");
      setCountdown(0);
      try {
        if (ui && ui.onStopped) ui.onStopped(true);
      } catch (e) {}
    }
    worker = null;
  }

  function loop() {
    var failCount = 0;
    swipedCount = 0;
    setCount(0);

    while (alive()) {
      var stay = randomStaySeconds();
      setStatus("观看中");
      setCountdown(stay);

      if (!sleepInterruptible(Math.floor(stay * 1000))) {
        break;
      }

      if (!alive()) break;

      setStatus("滑动中");
      setCountdown(0);
      var ok = false;
      try {
        ok = gesture.swipeUp();
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        failCount += 1;
        setStatus("滑动失败 " + failCount + "/" + config.maxSwipeFailures);
        if (failCount >= config.maxSwipeFailures) {
          finish("已停止：请回到视频页");
          return;
        }
        if (!sleepInterruptible(800)) break;
        continue;
      }

      failCount = 0;
      swipedCount += 1;
      setCount(swipedCount);
    }

    finish(stopping ? "已停止" : "已停止");
  }

  return {
    start: function () {
      if (running || worker) return false;
      running = true;
      stopping = false;
      setStatus("准备开始");
      worker = threads.start(function () {
        try {
          loop();
        } catch (e) {
          // 关闭脚本时线程可能被中断，忽略收尾异常。
          worker = null;
          running = false;
        }
      });
      return true;
    },
    stop: function () {
      stopping = true;
      running = false;
      setStatus("正在停止...");
      try {
        if (worker && worker.interrupt) worker.interrupt();
      } catch (e) {}
    },
    isRunning: function () {
      return !!running && !stopping;
    },
    getCount: function () {
      return swipedCount;
    },
  };
}

module.exports = {
  createSwipeRunner: createSwipeRunner,
  randomStaySeconds: randomStaySeconds,
};
