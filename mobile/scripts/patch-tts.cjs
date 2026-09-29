const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../node_modules/react-native-tts');
if (require(path.join(root, 'package.json')).version !== '4.1.1') {
  throw new Error('Review TTS compatibility patch for this version.');
}
const file = path.join(root, 'ios/TextToSpeech/TextToSpeech.m');
let source = fs.readFileSync(file, 'utf8');
const count = (source.match(/\(BOOL \*\)/g) || []).length;
if (count !== 0 && count !== 4) throw new Error('Unexpected TTS native signatures.');
source = source.replaceAll('(BOOL *)', '(BOOL)').replaceAll('onWordBoundary != NULL && onWordBoundary', 'onWordBoundary');
fs.writeFileSync(file, source);
console.log('TTS iOS boolean compatibility patch applied.');
