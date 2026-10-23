const columnWidth = document.getElementById('columnWidth');
const columnWidthValue = document.getElementById('columnWidthValue');
const compactHeader = document.getElementById('compactHeader');
const showNames = document.getElementById('showNames');
const status = document.getElementById('status');

gpeLoadSettings().then(settings => {
  columnWidth.value = settings.columnWidth;
  columnWidthValue.textContent = `${settings.columnWidth}%`;
  compactHeader.checked = settings.compactHeader;
  showNames.checked = settings.showNames;
});

columnWidth.addEventListener('input', () => {
  columnWidthValue.textContent = `${columnWidth.value}%`;
  gpeSaveSettings({ columnWidth: Number(columnWidth.value) });
});

compactHeader.addEventListener('change', () => gpeSaveSettings({ compactHeader: compactHeader.checked }));
showNames.addEventListener('change', () => gpeSaveSettings({ showNames: showNames.checked }));

document.getElementById('clearCache').addEventListener('click', async () => {
  await chrome.storage.local.remove('gpeNames');
  status.textContent = 'Name cache cleared. Reload the project page.';
});
