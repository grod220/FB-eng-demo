const rp = require('request-promise');
const cron = require('node-cron');

module.exports = {
  init,
  setStandardFreqs,
  customerAction,
  setCurrentTransactions,
  triggerAdjustment
};

let accessToken;
const originalBids = {};
const culmativeTrafficGoal = {};
let currentTransactions = 0;
let currentBidAdjBand;
let biddingBands;

cron.schedule('0 0 * * *', function(){
  currentTransactions = 0;
  currentBidAdjBand = null;
});

function init(accessTok, campaignId) {
  accessToken = accessTok;
  const allAdsets = getAdsets(accessToken, campaignId);
  allAdsets.then(adsetsArray => adsetsArray.forEach(adsetId => {
    getBid(accessToken,adsetId)
    .then(bid => {
      if (!bid.is_autobid) {
        originalBids[adsetId] = bid.bid_amount;
      }
    });
  }));
}

function getAdsets(accessToken, campaignId) {
  var dataString = `fields=adsets&access_token=${accessToken}`;
  var options = {
    url: `https://graph.facebook.com/v2.10/${campaignId}?${dataString}`,
    method: 'GET'
  };
  return rp(options).then(result => JSON.parse(result).adsets.data)
                    .map(entry => entry.id);
}

function getBid(accessToken, adsetId) {
  var dataString = `fields=bid_amount,is_autobid&access_token=${accessToken}`;
  var options = {
    url: `https://graph.facebook.com/v2.10/${adsetId}?${dataString}`,
    method: 'GET'
  };
  return rp(options).then(result => JSON.parse(result));
}

function setStandardFreqs(trafficByHour, userBiddingBands) {
  biddingBands = userBiddingBands;
  let inOrderKeys = Object.keys(trafficByHour)
                          .map(stringNum => Number(stringNum))
                          .sort((a,b) => a - b);
  let total = 0;
  inOrderKeys.forEach(key => {
    total += trafficByHour[key];
    culmativeTrafficGoal[key] = total;
  });
  cron.schedule('*/20 * * * *', function(){
    triggerAdjustment();
  });
}

function triggerAdjustment() {
  const currentHour = new Date().getHours();
  const currentMinute = new Date().getMinutes();
  const currentHourGoal = culmativeTrafficGoal[currentHour] - culmativeTrafficGoal[currentHour-1];
  const projection = culmativeTrafficGoal[currentHour-1] + (currentHourGoal *  (currentMinute / 60));
  const differencePercentage = (currentTransactions - projection) / projection;

  console.log('CURRENT', currentTransactions);
  console.log('PROJECTION', projection);
  console.log('DIFFERENCE', differencePercentage);

  for (let i=0; i<biddingBands.length; i++) {
    if (differencePercentage < biddingBands[i].upperBound) {
      if (biddingBands[i].upperBound !== currentBidAdjBand) {
        console.log('BIDDING BAND', biddingBands[i].upperBound);
        console.log('ADJUSTMENT', biddingBands[i].adjustment + '00%');
        adjustAllBids(accessToken,biddingBands[i].adjustment);
        currentBidAdjBand = biddingBands[i].upperBound;
      }
      break;
    }
  }
}

function setCurrentTransactions(currentDailyCount) {
  currentTransactions = currentDailyCount;
}

function adjustAllBids(accessToken,percentAdjustment) {
  Object.keys(originalBids).forEach(key => {
    const newBid = Math.floor(originalBids[key] + (originalBids[key] * percentAdjustment));
    console.log('OLD BID', originalBids[key]);
    console.log('NEW BID', newBid);
    setSingleBid(accessToken,key,newBid);
  });
}

function setSingleBid(accessToken,adsetId,newAmount) {
  var dataString = `bid_amount=${newAmount}&access_token=${accessToken}`;
  var options = {
    url: `https://graph.facebook.com/v2.10/${adsetId}?${dataString}`,
    method: 'POST'
  };
  return rp(options).then(result => JSON.parse(result));
}

function customerAction() {
  return new Promise((resolve,reject) => {
      currentTransactions++;
      if (typeof currentTransactions !== 'number' || currentTransactions <= 0) {
        reject('Not valid transactions count');
      } else {
        resolve("Success!");
      }
  });
}
