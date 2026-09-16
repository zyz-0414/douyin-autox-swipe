"use strict";

function createFloatControl(options) {
  options = options || {};
  var onStart = options.onStart || function () {};
  var onStop = options.onStop || function () {};

  var window = floaty.window(
    <frame gravity="center" bg="#CC000000" padding="10">
      <vertical>
        <text id="title" text="抖音自动刷" textColor="#FFFFFF" textSize="14sp"/>
        <text id="status" text="状态：未开始" textColor="#FFEB3B" textSize="12sp" marginTop="4"/>
        <text id="count" text="已刷：0" textColor="#FFFFFF" textSize="12sp"/>
        <text id="countdown" text="倒计时：-" textColor="#FFFFFF" textSize="12sp"/>
        <horizontal marginTop="6">
          <button id="startBtn" text="开始" w="70"/>
          <button id="stopBtn" text="停止" w="70"/>
        </horizontal>
      </vertical>
    </frame>
  );

  window.setPosition(40, 220);
  window.exitOnClose();

  var running = false;

  function setRunningUi(isRunning) {
    running = isRunning;
    ui.run(function () {
      window.startBtn.setEnabled(!isRunning);
      window.stopBtn.setEnabled(isRunning);
    });
  }

  setRunningUi(false);

  window.startBtn.click(function () {
    if (running) return;
    setRunningUi(true);
    ui.run(function () {
      window.status.setText("状态：准备开始");
    });
    onStart();
  });

  window.stopBtn.click(function () {
    if (!running) return;
    onStop();
  });

  // 拖动悬浮窗
  var x = 0;
  var y = 0;
  var windowX = 0;
  var windowY = 0;
  var downTime = 0;
  window.title.setOnTouchListener(function (view, event) {
    switch (event.getAction()) {
      case event.ACTION_DOWN:
        x = event.getRawX();
        y = event.getRawY();
        windowX = window.getX();
        windowY = window.getY();
        downTime = new Date().getTime();
        return true;
      case event.ACTION_MOVE:
        window.setPosition(windowX + (event.getRawX() - x), windowY + (event.getRawY() - y));
        return true;
      case event.ACTION_UP:
        if (new Date().getTime() - downTime < 150) {
          // 短按忽略
        }
        return true;
    }
    return true;
  });

  return {
    setStatus: function (text) {
      ui.run(function () {
        window.status.setText("状态：" + text);
      });
    },
    setCount: function (n) {
      ui.run(function () {
        window.count.setText("已刷：" + n);
      });
    },
    setCountdown: function (sec) {
      ui.run(function () {
        if (sec === null || sec === undefined || sec < 0) {
          window.countdown.setText("倒计时：-");
        } else {
          window.countdown.setText("倒计时：" + Number(sec).toFixed(1) + "s");
        }
      });
    },
    onStopped: function () {
      setRunningUi(false);
    },
    close: function () {
      window.close();
    },
  };
}

module.exports = {
  createFloatControl: createFloatControl,
};
