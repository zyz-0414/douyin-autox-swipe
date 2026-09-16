"use strict";

var config = require("./config.js");

function getScreenSize() {
  var width = device.width || 1080;
  var height = device.height || 2400;
  return { width: width, height: height };
}

/**
 * 执行一次上滑。成功返回 true，失败返回 false。
 */
function swipeUp() {
  var size = getScreenSize();
  var x = Math.floor(size.width * config.xRatio);
  var y1 = Math.floor(size.height * config.startYRatio);
  var y2 = Math.floor(size.height * config.endYRatio);
  try {
    var ok = swipe(x, y1, x, y2, config.swipeDurationMs);
    return !!ok;
  } catch (e) {
    return false;
  }
}

module.exports = {
  swipeUp: swipeUp,
  getScreenSize: getScreenSize,
};
