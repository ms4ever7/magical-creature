// === CONFIG ===
const fs = require('fs').promises;
const axios = require("axios");
const { subYears, getTime, subDays }  = require('date-fns');

const FILE_PATH = './coins_list.json';
const BOUGHT_COINS_LIST_PATH = './bought_coins_list.json';

const API_KEY = 'vkCr2iZjkisISvtjSbRkJGla7Gz1PxmJwDM1YOqX3X2ESnTUdwBmEnduapsa2Z8J';
const TELEGRAM_BOT_TOKEN = '8197515634:AAFJ3I59QgGp3tjoZdH48fCdo9lPe_zDyU4';

// === UTILS ===
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function calculateEMA(data, period) {
  const smoothingFactor = 2 / (period + 1);
  let ema = Number(data[0]);
  const emaResults = [ema];

  for (let i = 1; i < data.length; i++) {
    const price = Number(data[i]);
    ema = (price - emaResults[i - 1]) * smoothingFactor + emaResults[i - 1];
    emaResults.push(ema);
  }

  return emaResults;
}

function generateDailyTargetPositions(ema5, ema10, ema50, prices, dates) {
  let targetPositions = [];
  let lastBreakoutDirection = 'none';
  
  for (let i = 49; i < ema5.length; i++) {
    const currentPrice = prices[i];

    const highest28Days = Math.max(...prices.slice(Math.max(0, i - 28), i));
    const lowest14Days = Math.min(...prices.slice(Math.max(0, i - 14), i));

     // Перевірка на новий breakout
    if (currentPrice >= highest28Days) {
      lastBreakoutDirection = 'up';
    } else if (currentPrice <= lowest14Days) {
      lastBreakoutDirection = 'down';
    }

    // Логіка targetPosition (1 — позиція, 0 — поза позицією)
    const signalComponents = [
      ema5[i] >= ema10[i] ? 1 : 0,
      ema10[i] >= ema50[i] ? 1 : 0,
      lastBreakoutDirection === 'up' ? 1 : 0
    ];

    const finalSignal = Math.min(...signalComponents); // 1 або 0

    targetPositions.push({
      targetPosition: finalSignal,
      date: new Date(dates[i]),
      price: currentPrice
    });
  }
  
  return targetPositions;
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

  const targetPositions = generateDailyTargetPositions(
    shortEMA,
    mediumEMA,
    longEMA,
    closingPrices,
    dates
  );

  // Повертаємо список з позиціями (targetPosition 0/1)
  return targetPositions.map(({targetPosition, date, price}) => ({
    coinSymbol,
    targetPosition,
    date,
    price
  }));
}

async function calculatePossibleTrades(signals) {
  let coinsDataInJson = {};
  let boughtCoinsDataInJson = {};

  try {
    const data = await fs.readFile(FILE_PATH, 'utf8');
    const boughtData = await fs.readFile(BOUGHT_COINS_LIST_PATH, 'utf8');
    coinsDataInJson = JSON.parse(data);
    boughtCoinsDataInJson = JSON.parse(boughtData);
  } catch (error) {
    console.error('Error reading files:', error);
    return {};
  }

  const changes = {};
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  for (const signal of signals) {
    const signalDate = new Date(signal.date);

    signalDate.setHours(0, 0, 0, 0);
    if (signalDate.getTime() !== yesterday.getTime()) continue;

    const coin = signal.coinSymbol.toLowerCase();
    const isBought = Boolean(boughtCoinsDataInJson[coin]);
    const target = signal.targetPosition;

    if (target === 1 && !isBought) {
      changes[coin] = 1;

      coinsDataInJson[coin].bought = true;

      boughtCoinsDataInJson[coin] = {
        ...coinsDataInJson[coin],
        bought: true
      };
    } else if (target === 0 && isBought) {
      changes[coin] = 0;

      coinsDataInJson[coin].bought = false;
      // Remove from bought_coins_list.json
      delete boughtCoinsDataInJson[coin];
    }
  }

  //TODO: move file writing to different module
  // move 0 and 1 for each item to different json file so that you have target and another command to write that you bought smth
  await fs.writeFile(FILE_PATH, JSON.stringify(coinsDataInJson, null, 2));

  await fs.writeFile(BOUGHT_COINS_LIST_PATH, JSON.stringify(boughtCoinsDataInJson, null, 2));
  return changes;
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
        parse_mode: 'HTML'
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

function formatTradingMessage(changes) {
  const coins = Object.keys(changes);
  
  if (coins.length === 0) {
    return '🛌 <b>Trading Update</b>\n\nNothing to buy or sell today, chill :)';
  }

  let message = '📊 <b>Trading Signals Today</b>\n\n';

  coins.forEach(coin => {
    const signal = changes[coin];
    const emoji = signal === 1 ? '🟢' : '🔴';
    const action = signal === 1 ? '1' : '0';
    message += `${emoji} <b>${coin.toUpperCase()}</b> — ${action}\n`;
  });

  return message;
}

async function main() {
  try {
    const data = await fs.readFile(FILE_PATH, 'utf8');
    const jsonData = JSON.parse(data);
    const coinsList = Object.values(jsonData).map(coin => coin.symbol.toUpperCase());
    
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
  } catch (err) {
    console.error(`Main Error ${err}`);
  }
}

main();