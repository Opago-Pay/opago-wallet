const fs = require('fs');
let code = fs.readFileSync('node_modules/buffer-layout/lib/Layout.js', 'utf8');

const methods = [
  'readUIntLE', 'readUIntBE', 'readUInt8', 'readUInt16LE', 'readUInt16BE', 'readUInt32LE', 'readUInt32BE', 
  'readBigUInt64LE', 'readBigUInt64BE', 'readIntLE', 'readIntBE', 'readInt8', 'readInt16LE', 'readInt16BE', 
  'readInt32LE', 'readInt32BE', 'readBigInt64LE', 'readBigInt64BE', 'readFloatLE', 'readFloatBE', 'readDoubleLE', 'readDoubleBE'
];

methods.forEach(m => {
  const regex = new RegExp('b\\.' + m, 'g');
  const replacement = `(typeof b.${m} === 'function' ? b : require('buffer').Buffer.from(b)).${m}`;
  code = code.replace(regex, replacement);
});

fs.writeFileSync('node_modules/buffer-layout/lib/Layout.js', code);
