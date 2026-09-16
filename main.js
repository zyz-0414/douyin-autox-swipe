"use strict";

var floatControl = require("./ui/float_control.js");
var swipeRunner = require("./core/swipe_runner.js");

function ensureAccessibility() {
  if (auto.service) return true;
  toast("请先开启无障碍权限");
  try {
    app.startActivity({
      action: "android.settings.ACCESSIBILITY_SETTINGS",
    });
  } catch (e) {}
  return false;
}

// 保持脚本运行，避免主线程退出导致悬浮窗消失
function keepAlive() {
  setInterval(function () {}, 1000);
}

var runner = null;

var uiBridge = floatControl.createFloatControl({
  onStart: function () {
    if (!ensureAccessibility()) {
      uiBridge.setStatus("请开启无障碍权限");
      uiBridge.onStopped();
      return;
    }
    if (!runner) {
      runner = swipeRunner.createSwipeRunner(uiBridge);
    }
    if (runner.isRunning()) {
      toast("已在运行中");
      return;
    }
    toast("开始自动刷视频：请确保已在抖音视频页");
    runner.start();
  },
  onStop: function () {
    if (runner) runner.stop();
  },
  onClose: function () {
    if (runner) runner.stop();
    toast("已关闭");
  },
});

uiBridge.setStatus(auto.service ? "未开始" : "请开启无障碍权限");
uiBridge.setCount(0);
uiBridge.setCountdown(null);
ensureAccessibility();
keepAlive();
