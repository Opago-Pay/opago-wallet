const https = require('https');

https.get('https://test.governikus-eid.de/AusweisAuskunft/WebServiceRequesterServlet', (res) => {
  console.log("Status Code:", res.statusCode);
  console.log("Headers:", res.headers);
  
  // Follow redirect if 302
  if (res.statusCode === 302 && res.headers.location) {
      console.log("Redirecting to:", res.headers.location);
      // Try fetching the redirected URL to see if it gives XML or HTML
      https.get(res.headers.location, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => {
              console.log("Response from redirect:");
              console.log(data.substring(0, 500) + "...");
          });
      });
  } else {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => console.log("Data:", data));
  }
}).on('error', (e) => {
  console.error(e);
});
