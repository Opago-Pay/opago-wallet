const http = require('http');
http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    console.log('--- DEBUG PAYLOAD ---');
    console.log(body);
    console.log('---------------------');
    res.end('ok');
  });
}).listen(9999, '0.0.0.0', () => console.log('Listening on 9999'));
