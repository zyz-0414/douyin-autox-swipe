"use strict";

function createFloatControl(options) {
  options = options || {};
  var onStart = options.onStart || function () {};
  var onStop = options.onStop || function () {};
  var onClose = options.onClose || function () {};

  // 使用 floaty.window，且不启用 "ui" Activity 模式：
  // 1) 避免打开空白 ScriptExecuteActivity 白屏
  // 2) 避免关闭 Activity 时 Rhino Context 已销毁导致崩溃
  var window = floaty.window(
    <frame bg="#CC111111" padding="12">
      <vertical>
        <horizontal id="dragBar" w="*">
          <text id="title" text="抖音自动刷" textColor="#FFFFFF" textSize="14sp" layout_weight="1"/>
          <button id="closeBtn" text="关闭" w="58" h="36"/>
        </horizontal>
        <text id="dragHint" text="按住上方标题可拖动" textColor="#B0BEC5" textSize="11sp" marginTop="2"/>
        <text id="status" text="状态：未开始" textColor="#FFEB3B" textSize="12sp" marginTop="6"/>
        <text id="count" text="已刷：0" textColor="#FFFFFF" textSize="12sp"/>
        <text id="countdown" text="倒计时：-" textColor="#FFFFFF" textSize="12sp"/>
        <horizontal marginTop="8">
          <button id="startBtn" text="开始" w="72" h="40"/>
          <button id="stopBtn" text="停止" w="72" h="40"/>
        </horizontal>
      </vertical>
    </frame>
  );

  window.setPosition(40, 220);
  // 不要 exitOnClose：关闭窗口后由业务侧统一延迟 exit，避免引擎销毁竞态。

  var running = false;
  var closed = false;

  function safeUi(fn) {
    if (closed) return;
    try {
      ui.run(fn);
    } catch (e) {
      try {
        fn();
      } catch (e2) {}
    }
  }

  function setRunningUi(isRunning) {
    running = !!isRunning;
    safeUi(function () {
      try {
        window.startBtn.setEnabled(!isRunning);
        window.stopBtn.setEnabled(isRunning);
      } catch (e) {}
    });
  }

  setRunningUi(false);

  var touchX = 0;
  var touchY = 0;
  var startX = 0;
  var startY = 0;
  window.dragBar.setOnTouchListener(function (view, event) {
    switch (event.getAction()) {
      case event.ACTION_DOWN:
        touchX = event.getRawX();
        touchY = event.getRawY();
        startX = window.getX();
        startY = window.getY();
        return true;
      case event.ACTION_MOVE:
        window.setPosition(
          startX + (event.getRawX() - touchX),
          startY + (event.getRawY() - touchY)
        );
        return true;
      case event.ACTION_UP:
        return true;
    }
    return true;
  });

  window.startBtn.click(function () {
    if (running || closed) return;
    setRunningUi(true);
    safeUi(function () {
      try {
        window.status.setText("状态：准备开始");
      } catch (e) {}
    });
    try {
      onStart();
    } catch (e2) {
      setRunningUi(false);
      toast("启动失败：" + e2);
    }
  });

  window.stopBtn.click(function () {
    if (!running || closed) return;
    try {
      onStop();
    } catch (e) {}
  });

  window.closeBtn.click(function () {
    if (closed) return;
    closed = true;
    try {
      onStop();
    } catch (e) {}
    try {
      onClose();
    } catch (e2) {}
    // 窗口关闭交给外部 shutdown/close，避免这里同步 exit 触发 Context 异常。
  });

  return {
    setStatus: function (text) {
      safeUi(function () {
        try {
          window.status.setText("状态：" + text);
        } catch (e) {}
      });
    },
    setCount: function (n) {
      safeUi(function () {
        try {
          window.count.setText("已刷：" + n);
        } catch (e) {}
      });
    },
    setCountdown: function (sec) {
      safeUi(function () {
        try {
          if (sec === null || sec === undefined || sec < 0) {
            window.countdown.setText("倒计时：-");
          } else {
            window.countdown.setText("倒计时：" + Number(sec).toFixed(1) + "s");
          }
        } catch (e) {}
      });
    },
    onStopped: function () {
      setRunningUi(false);
    },
    close: function () {
      closed = true;
      try {
        window.close();
      } catch (e) {}
    },
  };
}

module.exports = {
  createFloatControl: createFloatControl,
};
