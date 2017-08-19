const express = require('express');
const app = express();
const fs = require('fs');
const pbm = require('../presence-bidding-module');

const accessToken = fs.readFileSync('access-token.txt');
const campaignId = '6093121959566';
const currentDailyCount = 10;
const trafficByHour = require('./traffic.json');
const biddingBands = [
  { upperBound: -0.6, adjustment: 2 },
  { upperBound: -0.4, adjustment: 1 },
  { upperBound: -0.2, adjustment: 0.4 },
  { upperBound: 0.2, adjustment: 0 },
  { upperBound: 0.4, adjustment: -0.3 },
  { upperBound: 0.6, adjustment: -0.7 },
  { upperBound: Infinity, adjustment: -0.99 }
];

const presenceBidding = new pbm();
presenceBidding.init(accessToken, campaignId);
presenceBidding.setCurrentTransactions(currentDailyCount);
presenceBidding.setStandardFreqs(trafficByHour, biddingBands);

app.get('/api/customer-purchase', function (req, res) {
  presenceBidding.customerAction()
  .then(result => res.status(200).send(result))
  .catch(err => res.status(500).send(err));
});

app.get('/trigger', function(req, res) {
  presenceBidding._triggerAdjustment();
  res.end('Requested');
});

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html', {headers:{'count':currentDailyCount}});
});

app.listen(3000, function () {
  console.log('Listening on port 3000!');
});
