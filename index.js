require('dotenv').config();
const fetch = require('node-fetch');
const { send } = require('micro');

const wordableAPI = {
  shouldBlock: false,
  callsLeft: 0,

  async call(url = '/words/?random=true') {
    const response = await fetch(`https://wordsapiv1.p.mashape.com${url}`, {
      method: 'GET',
      headers: {
        'X-Mashape-Key': process.env.API_KEY,
        'X-Mashape-Host': 'wordsapiv1.p.mashape.com',
      },
      mode: 'cors',
      cache: 'no-cache',
    });
    const { headers, status } = await response;
    const json = await response.json();

    this.updateLimits({ response });

    return { headers, status, json };
  },

  async updateLimits({ buffer = 50, response } = {}) {
    console.log('update limits called');
    try {
      const { headers } = response || await this.call();
      const remaining = headers.get('X-Ratelimit-Requests-Remaining');
      const callsLeft = Number.parseInt(remaining, 10) - Number.parseInt(buffer, 10);
      const shouldBlock = callsLeft <= buffer;

      this.shouldBlock = shouldBlock;
      this.callsLeft = callsLeft;
    } catch (err) {
      console.error(err);
    }
  },
};

// NOTE: This is an async call, but its ok for a request to come before
// this updateLimits call, because the .call() method also updates limits.
// Set a timeout to check the limit again in 30 minutes (48 wasted calls per day).
// Still better than tying a setTimeout to the request, which effectively
// enables a built-in denial of service just by calling a maxed out API.
setInterval(() => wordableAPI.updateLimits({ buffer: 250 }), 1000 * 60 * 30);

const micro = async (req, res) => {
  // TODO: set to my wordable URL (once I figure out where to put this thing).
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8080');
  try {
    if (wordableAPI.shouldBlock) {
      res.setHeader('Retry-After', '120');

      return send(res, 429, 'API Limit Exceeded');
    }

    const { json, status } = await wordableAPI.call(req.url);

    return send(res, status, json);
  } catch (err) {
    return console.error(err);
  }
};

module.exports = micro;
