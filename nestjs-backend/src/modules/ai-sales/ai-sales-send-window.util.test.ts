import {
  checkSendWindow,
  resolveSendWindowDays,
  shouldBypassSendWindow,
} from './ai-sales-send-window.util';

const baseSettings = {
  enforceSendWindow: true,
  sendWindowStartHour: 9,
  sendWindowEndHour: 17,
  sendOnWeekends: false,
  sendWindowDaysJson: [1, 2, 3, 4, 5],
  allowAdminManualSendAnytime: true,
  ignoreWindowOnManualSend: true,
  allowTestEmailOutsideWindow: true,
};

if (resolveSendWindowDays(baseSettings).join(',') !== '1,2,3,4,5') {
  throw new Error('expected weekdays Mon-Fri');
}

if (!shouldBypassSendWindow(baseSettings, { manual: true })) {
  throw new Error('manual send should bypass window by default');
}

if (!shouldBypassSendWindow(baseSettings, { test: true })) {
  throw new Error('test email should bypass window by default');
}

if (shouldBypassSendWindow(baseSettings, { automatic: true })) {
  throw new Error('automatic send should not bypass window');
}

const disabled = { ...baseSettings, enforceSendWindow: false };
const check = checkSendWindow(disabled);
if (!check.allowed) {
  throw new Error('disabled window should always allow');
}

console.log('ai-sales-send-window tests OK');
