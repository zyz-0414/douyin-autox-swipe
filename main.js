"use strict";

// 本项目只使用悬浮窗，不需要 ScriptExecuteActivity 的 UI 页面。
// 保留 "ui" 模式会导致打开后白屏，并在关闭 Activity 时触发
// "No Context associated with current Thread"。

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

var runner = null;
var uiBridge = null;
var exiting = false;

function safeStopRunner() {
  try {
    if (runner) runner.stop();
  } catch (e) {}
}

function shutdown(reason) {
  if (exiting) return;
  exiting = true;
  safeStopRunner();
  try {
    if (uiBridge && uiBridge.close) uiBridge.close();
  } catch (e) {}
  if (reason) {
    try {
      toast(reason);
    } catch (e2) {}
  }
  // 延迟 exit，避开 Activity/引擎销毁时的 Rhino Context 竞态。
  setTimeout(function () {
    try {
      exit();
    } catch (e3) {}
  }, 120);
}

function initialize() {
  // 悬浮窗权限未开时给出明确提示，避免“看起来没反应”。
  try {
    if (typeof floaty !== "undefined" && floaty.checkPermission && !floaty.checkPermission()) {
      toast("请先开启悬浮窗权限，授权后重新运行脚本");
      try {
        floaty.requestPermission();
      } catch (e) {}
      // 请求权限只打开系统设置；此时不能在 UI 线程创建悬浮窗。
      // 不创建窗口或保活定时器，让本次脚本自然结束。
      return;
    }
  } catch (e) {}

  uiBridge = floatControl.createFloatControl({
    onStart: function () {
      if (exiting) return;
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
      return runner.start();
    },
    onStop: function () {
      safeStopRunner();
    },
    onClose: function () {
      shutdown("已关闭");
    },
  });

  uiBridge.setStatus(auto.service ? "未开始" : "请开启无障碍权限");
  uiBridge.setCount(0);
  uiBridge.setCountdown(null);
  ensureAccessibility();

  // 无界面脚本需要保持进程，直到用户点关闭。
  setInterval(function () {}, 1000);
}

try {
  initialize();
} catch (e) {
  toast("启动失败：" + e);
  console.error(e);
  throw e;
}
