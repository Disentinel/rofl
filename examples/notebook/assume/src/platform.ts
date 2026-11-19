let _isWindows = false;
if (typeof process !== 'undefined') { _isWindows = process.platform === 'win32'; }
export const isWindows = _isWindows;
export const isWeb = typeof process === 'undefined';
