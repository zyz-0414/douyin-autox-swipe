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
  var worker = null;
  var swipedCount = 0;

  function setStatus(text) {
    if (ui && ui.setStatus) ui.setStatus(text);
  }

  function setCount(n) {
    if (ui && ui.setCount) ui.setCount(n);
  }

  function setCountdown(sec) {
    if (ui && ui.setCountdown) ui.setCountdown(sec);
  }

  function sleepInterruptible(totalMs) {
    var left = totalMs;
    while (running && left > 0) {
      var step = Math.min(200, left);
      sleep(step);
      left -= step;
      setCountdown(Math.max(0, left / 1000));
    }
    return running;
  }

  function loop() {
    var failCount = 0;
    swipedCount = 0;
    setCount(0);

    while (running) {
      var stay = randomStaySeconds();
      setStatus("观看中");
      setCountdown(stay);

      if (!sleepInterruptible(Math.floor(stay * 1000))) {
        break;
      }

      if (!running) break;

      setStatus("滑动中");
      setCountdown(0);
      var ok = gesture.swipeUp();
      if (!ok) {
        failCount += 1;
        setStatus("滑动失败 " + failCount + "/" + config.maxSwipeFailures);
        if (failCount >= config.maxSwipeFailures) {
          running = false;
          setStatus("已停止：请回到视频页");
          if (ui && ui.onStopped) ui.onStopped(false);
          worker = null;
          return;
        }
        if (!sleepInterruptible(800)) break;
        continue;
      }

      failCount = 0;
      swipedCount += 1;
      setCount(swipedCount);
    }

    setStatus("已停止");
    setCountdown(0);
    if (ui && ui.onStopped) ui.onStopped(true);
    worker = null;
  }

  return {
    start: function () {
      if (running || worker) return false;
      running = true;
      setStatus("准备开始");
      worker = threads.start(function () {
        loop();
      });
      return true;
    },
    stop: function () {
      running = false;
      setStatus("正在停止...");
    },
    isRunning: function () {
      return !!running;
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
