let _idCounter = Date.now();
const _callbacks = {};

/**
 * Sends javascript to the sandbox for evaluation
 * Returns a Promise which resolves the output of execting the code in the sandbox
 * @param {Script} code
 * @returns {Promise}
 */
window.postToSandbox = function postToSandbox(code) {
  return new Promise(function (resolve, reject) {
    const id = _idCounter++;
    _callbacks[id] = {
      resolve,
      reject,
    };
    const message = {
      code,
      id,
    };
    document
      .getElementById("sandbox-frame")
      .contentWindow.postMessage(message, "*");
  });
};

window.addEventListener("message", function (event) {
  const { result, error, id } = event.data;
  if (_callbacks[id]) {
    const { resolve, reject } = _callbacks[id];
    delete _callbacks[id];
    if (error) {
      reject(error);
    } else {
      resolve(result);
    }
  }
});

window.addEventListener("beforeunload", function (event) {
  event.returnValue = "Do you want to close this page?";
})