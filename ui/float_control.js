"use strict";

function createFloatControl(options) {
  options = options || {};
  var onStart = options.onStart || function () {};
  var onStop = options.onStop || function () {};
  var onClose = options.onClose || function () {};

  var window = floaty.rawWindow(
    <frame id="root" bg="#CC111111" padding="10">
      <vertical>
        <horizontal>
          <text id="title" text="抖音自动刷" textColor="#FFFFFF" textSize="14sp" layout_weight="1"/>
          <text id="closeBtn" text="关闭" textColor="#FF8A80" textSize="13sp" paddingLeft="8" paddingRight="4"/>
        </horizontal>
        <text id="dragHint" text="按住这里拖动" textColor="#B0BEC5" textSize="11sp" marginTop="2"/>
        <text id="status" text="状态：未开始" textColor="#FFEB3B" textSize="12sp" marginTop="6"/>
        <text id="count" text="已刷：0" textColor="#FFFFFF" textSize="12sp"/>
        <text id="countdown" text="倒计时：-" textColor="#FFFFFF" textSize="12sp"/>
        <horizontal marginTop="8">
          <button id="startBtn" text="开始" w="72"/>
          <button id="stopBtn" text="停止" w="72"/>
        </horizontal>
      </vertical>
    </frame>
  );

  window.setPosition(40, 220);
  window.setTouchable(true);

  var running = false;
  var closed = false;

  function setRunningUi(isRunning) {
    running = isRunning;
    ui.run(function () {
      try {
        window.startBtn.setEnabled(!isRunning);
        window.stopBtn.setEnabled(isRunning);
      } catch (e) {}
    });
  }

  setRunningUi(false);

  function enableDrag(view) {
    var x = 0;
    var y = 0;
    var windowX = 0;
    var windowY = 0;
    var moved = false;

    view.setOnTouchListener(function (v, event) {
      switch (event.getAction()) {
        case event.ACTION_DOWN:
          x = event.getRawX();
          y = event.getRawY();
          windowX = window.getX();
          windowY = window.getY();
          moved = false;
          return true;
        case event.ACTION_MOVE:
          var dx = event.getRawX() - x;
          var dy = event.getRawY() - y;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            moved = true;
            window.setPosition(windowX + dx, windowY + dy);
          }
          return true;
        case event.ACTION_UP:
          return true;
      }
      return true;
    });
  }

  // 标题和提示条都可拖动，避免只能点很小一块
  enableDrag(window.title);
  enableDrag(window.dragHint);
  enableDrag(window.status);
  enableDrag(window.count);
  enableDrag(window.countdown);

  window.startBtn.click(function () {
    if (running || closed) return;
    setRunningUi(true);
    ui.run(function () {
      window.status.setText("状态：准备开始");
    });
    onStart();
  });

  window.stopBtn.click(function () {
    if (!running || closed) return;
    onStop();
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
    try {
      window.close();
    } catch (e3) {}
    // 结束整个脚本
    exit();
  });

  return {
    setStatus: function (text) {
      ui.run(function () {
        try {
          window.status.setText("状态：" + text);
        } catch (e) {}
      });
    },
    setCount: function (n) {
      ui.run(function () {
        try {
          window.count.setText("已刷：" + n);
        } catch (e) {}
      });
    },
    setCountdown: function (sec) {
      ui.run(function () {
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
