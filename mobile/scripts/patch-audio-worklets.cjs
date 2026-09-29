/* Compatibility patch for the project's pinned audio-api/worklets versions.
 * Worklets 0.12.2 exposes runSync(RuntimeJob), not executeSync(RuntimeJob).
 * Both audio calls pass a callable accepting jsi::Runtime& and returning jsi::Value.
 * runSync acquires the runtime lock and returns the callable's result.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const audioRoot = path.join(root, 'node_modules/react-native-audio-api');
const workletsRoot = path.join(root, 'node_modules/react-native-worklets');
const audioVersion = JSON.parse(fs.readFileSync(path.join(audioRoot, 'package.json'), 'utf8')).version;
const workletsVersion = JSON.parse(fs.readFileSync(path.join(workletsRoot, 'package.json'), 'utf8')).version;
if (audioVersion !== '0.13.3' || workletsVersion !== '0.12.2') {
  throw new Error('Audio/Worklets versions changed. Review scripts/patch-audio-worklets.cjs before building.');
}
const header = fs.readFileSync(path.join(workletsRoot, 'Common/cpp/worklets/WorkletRuntime/WorkletRuntime.h'), 'utf8');
if (!header.includes('auto runSync(TJob &&job) const')) {
  throw new Error('Expected WorkletRuntime::runSync(RuntimeJob) API not found.');
}
const filename = path.join(audioRoot, 'common/cpp/audioapi/core/utils/worklets/WorkletsRunner.cpp');
const source = fs.readFileSync(filename, 'utf8');
const before = (source.match(/strongRuntime->executeSync\(/g) || []).length;
const after = (source.match(/strongRuntime->runSync\(/g) || []).length;
if (before === 0 && after === 2) {
  console.log('Audio/Worklets compatibility patch already applied.');
} else if (before === 2 && after === 0) {
  fs.writeFileSync(filename, source.replaceAll('strongRuntime->executeSync(', 'strongRuntime->runSync('));
  console.log('Applied Audio/Worklets compatibility patch (2 calls).');
} else {
  throw new Error('Unexpected WorkletsRunner.cpp contents; refusing to patch automatically.');
}

// iOS 26 renamed the HFP option. A runtime @available check cannot make
// an enum identifier visible to older SDKs; select by compile-time SDK instead.
const sessionFile = path.join(audioRoot, 'ios/audioapi/ios/system/AudioSessionManager.mm');
const sessionSource = fs.readFileSync(sessionFile, 'utf8');
const oldBluetoothLine = '      options |= AVAudioSessionCategoryOptionAllowBluetoothHFP;';
const bluetoothCompat = `#if defined(__IPHONE_OS_VERSION_MAX_ALLOWED) && __IPHONE_OS_VERSION_MAX_ALLOWED >= 260000
      options |= AVAudioSessionCategoryOptionAllowBluetoothHFP;
#else
      options |= AVAudioSessionCategoryOptionAllowBluetooth;
#endif`;
if (sessionSource.includes(bluetoothCompat)) {
  console.log('Audio Bluetooth SDK compatibility patch already applied.');
} else if (sessionSource.split(oldBluetoothLine).length === 2) {
  fs.writeFileSync(sessionFile, sessionSource.replace(oldBluetoothLine, bluetoothCompat));
  console.log('Applied Audio Bluetooth SDK compatibility patch.');
} else {
  throw new Error('Unexpected AudioSessionManager.mm contents; refusing to patch automatically.');
}
