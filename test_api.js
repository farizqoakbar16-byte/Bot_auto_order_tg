const axios = require('axios');

const userId = '33597cad-76ea-4a84-a5a9-96b5a9d5cc43'; // dari auto_otp1 config

async function test() {
  try {
    console.log('Testing services/list...');
    const res = await axios.get('https://api.ruangotp.site/api/v2/services/list', {
      headers: {
        'x-user-id': userId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(res.data).slice(0, 500));
  } catch(e) {
    console.error('Error:', e.message);
    if (e.response) {
      console.error('Response status:', e.response.status);
      console.error('Response data:', JSON.stringify(e.response.data).slice(0, 300));
    }
  }
}

test();
