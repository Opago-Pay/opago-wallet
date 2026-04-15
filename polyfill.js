import 'react-native-get-random-values';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

if (typeof global.crypto !== 'object') {
  global.crypto = {};
}

// Ensure globalThis.crypto maps perfectly immediately
if (typeof globalThis !== 'undefined') {
  globalThis.crypto = global.crypto;
}
