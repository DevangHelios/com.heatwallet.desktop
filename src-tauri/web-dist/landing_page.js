// const EXTENSION_ID = 'phkmoimaekcpmnmdeaeplbdakjegppfp' /* local version */
const EXTENSION_ID = '$WEB_BROWSER_EXTENSION_ID' /* webstore version */
const queryParameters = window.location.search;

window.onload = function () {
  determineUserAgent()  
}

window.addEventListener('DOMContentLoaded', function () {
  updateWebLinksWithOriginalParams()
})

/**
 * Runs on startup, detects if useragent is one of either: Ios, Android or other
 */
 function determineUserAgent() {
  if (navigator.userAgent.match(/iPhone|iPad|iPod/i) != null) {
    showFlavour('ios')
  }
  else if (navigator.userAgent.match(/Android/i) != null) {
    showFlavour('android')
  }
  else {
    showFlavour('desktop')
    initializeBrowserExtension()
  }
}

/**
 * Build urls to the webversion that include the queryparams
 */
function updateWebLinksWithOriginalParams() {
  const link = '$WEB_BROWSER_WEB_WALLET_URL' + queryParameters
  const anchors = document.querySelectorAll('.web-link')
  anchors.forEach((anchor) => anchor.href = link)
}

/**
 * Allows to show either one of the various landing pages.
 * @param id {desktop|ios|android}
 */
function showFlavour(id) {
  document.querySelector('#desktop').classList.remove('hidden-element-show')
  document.querySelector('#ios').classList.remove('hidden-element-show')
  document.querySelector('#android').classList.remove('hidden-element-show')
  document.querySelector('#'+id).classList.add('hidden-element-show')
}

/**
 * Send the original url parameters to the extension. If the extension is installed
 * we will receive a non null response, and we know the extension has dealt with it.
 * If we receive a null response (no extension exists) a timer is set to retry sending
 * the message.
 * This way 
 */
function initializeBrowserExtension() {
  if (typeof chrome == 'object' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(EXTENSION_ID, {queryParameters}, response => {
      if (chrome.runtime.lastError) {
        //console.log(chrome.runtime.lastError)
      }
      if (!response) {
        setTimeout(() => initializeBrowserExtension(), 2000);
        return;
      }
    });
  }
}

