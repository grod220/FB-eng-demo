'use strict';

const rp = require('request-promise');
const cron = require('node-cron');

module.exports = class PresenceBidding {
  constructor() {
    this._originalBids = {};
    this._culmativeTrafficGoal = {};
    this._currentTransactions = 0;
    this._currentBidAdjBand = null;
  }

  init(accessToken, campaignId) {
    this._accessToken = accessToken;
    const allAdsets = this._getAdsets(campaignId);
    allAdsets.then(adsetsArray => adsetsArray.forEach(adsetId => {
      this._getBid(adsetId)
      .then(bid => {
        if (!bid.is_autobid) {
          this._originalBids[adsetId] = bid.bid_amount;
        }
      });
    }));
    cron.schedule('0 0 * * *', function(){
      this._currentTransactions = 0;
      this._currentBidAdjBand = null;
    });
  }

  _getAdsets(campaignId) {
    const dataString = `fields=adsets&access_token=${this._accessToken}`;
    const options = {
      url: `https://graph.facebook.com/v2.10/${campaignId}?${dataString}`,
      method: 'GET'
    };
    return rp(options).then(result => JSON.parse(result).adsets.data)
                      .map(entry => entry.id);
  }

  _getBid(adsetId) {
    const dataString = `fields=bid_amount,is_autobid&access_token=${this._accessToken}`;
    const options = {
      url: `https://graph.facebook.com/v2.10/${adsetId}?${dataString}`,
      method: 'GET'
    };
    return rp(options).then(result => JSON.parse(result));
  }

  setCurrentTransactions(currentDailyCount) {
    this._currentTransactions = currentDailyCount;
  }

  setStandardFreqs(trafficByHour, biddingBands) {
    this._biddingBands = biddingBands;
    const inOrderKeys = Object.keys(trafficByHour)
                            .map(stringNum => Number(stringNum))
                            .sort((a,b) => a - b);
    let total = 0;
    inOrderKeys.forEach(key => {
      total += trafficByHour[key];
      this._culmativeTrafficGoal[key] = total;
    });

    const thisRef = this;
    cron.schedule('*/20 * * * *', function(){
      thisRef._triggerAdjustment();
    });
  }

  _triggerAdjustment() {
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    const currentHourGoal = this._culmativeTrafficGoal[currentHour] - this._culmativeTrafficGoal[currentHour-1];
    const projection = this._culmativeTrafficGoal[currentHour-1] + (currentHourGoal *  (currentMinute / 60));
    const differencePercentage = (this._currentTransactions - projection) / projection;

    console.log('CURRENT', this._currentTransactions);
    console.log('PROJECTION', projection);
    console.log('DIFFERENCE', differencePercentage);

    for (let i = 0; i < this._biddingBands.length; i++) {
      if (differencePercentage < this._biddingBands[i].upperBound) {
        if (this._biddingBands[i].upperBound !== this._currentBidAdjBand) {
          console.log('BIDDING BAND', this._biddingBands[i].upperBound);
          console.log('ADJUSTMENT', this._biddingBands[i].adjustment * 100 +'%');
          this._adjustAllBids(this._biddingBands[i].adjustment);
          this._currentBidAdjBand = this._biddingBands[i].upperBound;
        }
        break;
      }
    }
  }

  _adjustAllBids(percentAdjustment) {
    Object.keys(this._originalBids).forEach(key => {
      const newBid = Math.floor(this._originalBids[key] + (this._originalBids[key] * percentAdjustment));
      console.log('KEY:', key,' OLD BID:', this._originalBids[key],'NEW BID', newBid);
      this._setSingleBid(key, newBid);
    });
  }

  _setSingleBid(adsetId,newAmount) {
    const dataString = `bid_amount=${newAmount}&access_token=${this._accessToken}`;
    const options = {
      url: `https://graph.facebook.com/v2.10/${adsetId}?${dataString}`,
      method: 'POST'
    };
    return rp(options).then(result => JSON.parse(result));
  }

  customerAction() {
    return new Promise((resolve,reject) => {
      this._currentTransactions++;
      if (typeof this._currentTransactions !== 'number' || this._currentTransactions <= 0) {
        reject('Not valid transactions count');
      } else {
        resolve("Success!");
      }
    });
  }
};
