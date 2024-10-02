const fs = require('fs').promises;
const axios = require("axios");
const { startOfDay, subYears, getTime, subDays, addDays }  = require('date-fns');

const FILE_PATH = './coins_list.json';
const BOUGHT_COINS_LIST_PATH = './bought_coins_list.json';

const API_KEY = 'vkCr2iZjkisISvtjSbRkJGla7Gz1PxmJwDM1YOqX3X2ESnTUdwBmEnduapsa2Z8J';
const TELEGRAM_BOT_TOKEN = '8197515634:AAFJ3I59QgGp3tjoZdH48fCdo9lPe_zDyU4';
// const SECRET_KEY = 'XotxP9mQlbMLfbmyxxJfou9qqNZjKKIBaeCHgxIP1dCnwuGZ5e2aY8TF5dduhcI3';

// Utility function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function calculateEMA(data, period) {
  const smoothingFactor = 2 / (period + 1);
  let ema = Number(data[0]);
  const emaResults = [ema];

  // Calculate EMA for remaining periods
  for (let currentIndex = 1; currentIndex < data.length; currentIndex++) {
    let previousEMA = emaResults[emaResults.length - 1];
    let currentPrice = Number(data[currentIndex]);

    let currentEMA = (currentPrice - previousEMA) * smoothingFactor + previousEMA;
    emaResults.push(currentEMA);
  }

  return emaResults;
}

function generateDailyTradingSignals(ema5, ema10, ema50, prices, dates) {
  let signals = [];
  
  // Start from index 49 to ensure we have enough data for our 50-day lookback
  for (let i = 49; i < ema5.length; i++) {
    const currentDate = new Date(dates[i]);
    const currentPrice = prices[i];
    
    // Calculate 28-day high for long breakout
    const highest28Days = Math.max(...prices.slice(Math.max(0, i-27), i+1));
    
    // Calculate 14-day low for short breakout  
    const lowest14Days = Math.min(...prices.slice(Math.max(0, i-13), i+1));
    
    let signal = "hold";
    
    // Long condition: EMA5 >= EMA10 >= EMA50 AND price breaks above 28-day high
    if (
      ema5[i] >= ema10[i] && 
      ema10[i] >= ema50[i] && 
      currentPrice >= highest28Days
    ) {
      signal = 'buy';
    } 
    // Short condition: EMA alignment is broken OR price breaks below 14-day low
    else if (
      (ema5[i] < ema10[i] || ema10[i] < ema50[i]) ||
      currentPrice <= lowest14Days
    ) {
      signal = 'sell';
    }
    
    signals.push({ 
      signal, 
      date: currentDate.toISOString(), 
      price: currentPrice
    });
  }
  
  return signals;
}

async function fetchCoinWithRetry(fetchFunction, ...args) {
  const maxRetries = 5;
  const baseDelay = 300; // 3 seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add a delay before each attempt (except the first one)
      if (attempt > 0) {
        const delayTime = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delayTime / 1000} seconds...`);
        await delay(delayTime);
      }

      return await fetchFunction(...args);
    } catch (error) {
      if (error.response && error.response.status === 429) {
        console.log(`Rate limit hit. Attempt ${attempt + 1} of ${maxRetries}`);
        if (attempt === maxRetries - 1) throw error;
      } else {
        throw error;
      }
    }
  }
}

async function fetchCoinFromBinance(symbol) {
  const endDate = subDays(new Date(), 1);
  const startDate = subYears(endDate, 1);

  const startTime = getTime(startDate);
  const endTime = getTime(endDate);

  const options = {
    method: "GET",
    url: "https://api.binance.com/api/v3/klines",
    params: {
      symbol: `${symbol}USDT`,
      interval: '1d',
      startTime,
      endTime
    },
    headers: {
      accept: "application/json",
      "X-MBX-APIKEY": API_KEY,
    },
  };
  
  try {
    const response = await axios.request(options);
    
    return response.data;
  } catch (err) {
    console.error(`Binance fetching coin list error: ${err}`);
    throw err;
  }
}

function runDataAnalysis(coinsData) {
  const results = [];

  for (const [coinSymbol, coinData] of Object.entries(coinsData)) {
    const analysis = analyzeData(coinData, coinSymbol);
    results.push(...analysis);
  }

  // Sort results by buy date
  results.sort((a, b) => a.buyDate - b.buyDate);
  return results;
}


function analyzeData(coinData, coinSymbol) {
  let shortPeriod = 5;
  let mediumPeriod = 10
  let longPeriod = 50;

  // Extract closing prices and dates
  const closingPrices = coinData.map((priceList) => priceList[4]);

  const dates = coinData.map((priceList) => new Date(priceList[0]).toISOString());

  const shortEMA = calculateEMA(closingPrices, shortPeriod);
  const mediumEMA = calculateEMA(closingPrices, mediumPeriod);
  const longEMA = calculateEMA(closingPrices, longPeriod);

  const dailyTradingSignals = generateDailyTradingSignals(
    shortEMA,
    mediumEMA,
    longEMA,
    closingPrices,
    dates
  );

  const appropriateSignals = dailyTradingSignals.filter(({ signal }) => signal === "buy" || signal === "sell");
  const results = [];

  for (const signal of appropriateSignals) {
    if (signal.signal === "buy") {
      results.push({
        coinSymbol,
        action: 'Buy',
        date: new Date(signal.date),
        price: signal.price
      });

    } else if (signal.signal === "sell") {
      results.push({
        coinSymbol,
        action: 'Sell',
        date: new Date(signal.date),
        price: signal.price
      });
    }
  }

  return results;
}

async function calculatePossibleTrades(transactionsArg) {
  // Read the current bought status
  let coinsDataInJson = {};
  let boughtCoinsDataInJson = {};
  try {
    const data = await fs.readFile(FILE_PATH, 'utf8');
    const boughtData = await fs.readFile(BOUGHT_COINS_LIST_PATH, 'utf8');
    coinsDataInJson = JSON.parse(data);
    boughtCoinsDataInJson = JSON.parse(boughtData);
  } catch (error) {
    console.error('Error reading bought status file:', error);
  }

  const groupedByCoin = {};
  const todayDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const yesterdaysDate = subDays(todayDate, 1);
  console.log('Date is:', yesterdaysDate);

  // Step 1: Group transactions by coin symbol
  transactionsArg.forEach(transaction => {
    const { coinSymbol, action, date, price } = transaction;
    if (!groupedByCoin[coinSymbol]) {
      groupedByCoin[coinSymbol] = [];
    }
    groupedByCoin[coinSymbol].push({
      action,
      date: new Date(date),
      price: parseFloat(price)
    });
  });

  const results = [];

  // Step 2: Process transactions for each coin
  for (const coinSymbol in groupedByCoin) {
    const transactions = groupedByCoin[coinSymbol].sort((a, b) => b.date - a.date); // Sort in descending order (most recent first)

    const isBought = boughtCoinsDataInJson[coinSymbol.toLowerCase()]?.bought || false;

    if (!isBought) {
      const yesterdayBuy = transactions.find(t => {
        return t.action === 'Buy' && t.date >= yesterdaysDate
      });

      if (yesterdayBuy) {
        results.push({
          coinSymbol,
          date: yesterdayBuy.date,
          price: yesterdayBuy.price,
          action: 'Buy',
          marketCapRank: coinsDataInJson[coinSymbol.toLowerCase()].market_cap_rank,
          marketCap: coinsDataInJson[coinSymbol.toLowerCase()].market_cap
        });

        coinsDataInJson[coinSymbol.toLowerCase()].bought = true;

        boughtCoinsDataInJson[coinSymbol.toLowerCase()] = {
          ...coinsDataInJson[coinSymbol.toLowerCase()],
          bought: true
        };
      }

    } else {
      // If t he coin is already bought, look for a sell signal
      const latestSell = transactions.find(t => t.action === 'Sell' && t.date >= yesterdaysDate);

      if (latestSell) {
        results.push({
          coinSymbol,
          date: latestSell.date,
          price: latestSell.price,
          action: 'Sell',
          marketCapRank: coinsDataInJson[coinSymbol.toLowerCase()].market_cap_rank,
          marketCap: coinsDataInJson[coinSymbol.toLowerCase()].market_cap
        });
        // Update bought status
        coinsDataInJson[coinSymbol.toLowerCase()].bought = false;

        // Remove from bought_coins_list.json
        delete boughtCoinsDataInJson[coinSymbol.toLowerCase()];
      }
    } 
  }

  await fs.writeFile(FILE_PATH, JSON.stringify(coinsDataInJson, null, 2));

  await fs.writeFile(BOUGHT_COINS_LIST_PATH, JSON.stringify(boughtCoinsDataInJson, null, 2));

  return results;
}

async function sendTelegramMessage(message) {
  const TELEGRAM_CHAT_ID = '379623218';
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML' // Allows basic HTML formatting
      })
    });
    
    if (response.ok) {
      console.log('Message sent to Telegram successfully');
    } else {
      console.error('Failed to send message to Telegram:', await response.text());
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
  }
}

function formatTradingMessage(possibleTrades) {
  if (possibleTrades.length === 0) {
    return '🛌 <b>Trading Update</b>\n\nNothing to buy today, chill :)';
  }
  
  let message = '📊 <b>Trading Signals Today</b>\n\n';
  
  possibleTrades.forEach((trade, index) => {
    const emoji = trade.action === 'Buy' ? '🟢' : '🔴';
    message += `${emoji} <b>${trade.coinSymbol}</b>\n`;
    message += `Action: ${trade.action.toUpperCase()}\n`;
    message += `Price: ${trade.price}\n`;
    message += `Market Cap Rank: #${trade.marketCapRank}\n`;
    message += `Market Cap: ${trade.marketCap.toLocaleString()}\n`;
    message += `Date: ${new Date(trade.date).toLocaleDateString()}\n\n`;
  });
  
  return message;
}

async function main() {
  try {
    const data = await fs.readFile(FILE_PATH, 'utf8');
    const jsonData = JSON.parse(data);
    const coinsList =  Object.values(jsonData).map(coin => coin.symbol.toUpperCase());
    
    const coinsData = {};

    for (const coin of coinsList) {
      try {
        console.log(`Fetching data for ${coin}...`);
        const data = await fetchCoinWithRetry(fetchCoinFromBinance, coin);
        coinsData[coin] = data;

        await delay(2000); // 2 second delay
      } catch (error) {
        console.error(`Error fetching data for ${coin}: ${error}`);
      }
    }

    const dataAnalized = runDataAnalysis(coinsData);

    const possibleTrades = await calculatePossibleTrades(dataAnalized);

    sendTelegramMessage(formatTradingMessage(possibleTrades));
    console.log('Coin to buy/sell today:', possibleTrades.length ? possibleTrades : 'Nothing to buy today, chill :)');
  } catch (err) {
    console.error(`Main Error ${err}`);
  }
}

main();