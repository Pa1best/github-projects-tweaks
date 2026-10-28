// Shared between the content script and the popup.
const GPE_DEFAULTS = {
  columnWidth: 80,   // board column width, percent of GitHub's 350px
  compactHeader: true,
  showNames: true,
  quickAssign: true,
};

function gpeLoadSettings() {
  return chrome.storage.sync.get(GPE_DEFAULTS);
}

function gpeSaveSettings(patch) {
  return chrome.storage.sync.set(patch);
}
