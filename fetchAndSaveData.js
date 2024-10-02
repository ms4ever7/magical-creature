"use strict";
const axios = require("axios");
const { startOfDay, subYears, getTime }  = require('date-fns');
const fs = require('fs').promises;
const API_KEY = 'vkCr2iZjkisISvtjSbRkJGla7Gz1PxmJwDM1YOqX3X2ESnTUdwBmEnduapsa2Z8J';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


async function fetchCoinListFromCoinGecko() {
    const options = {
      method: "GET",
      url: "https://api.coingecko.com/api/v3/coins/markets",
      params: {
        vs_currency: "usd",
        per_page: 65,
        page: 1,
        order: 'market_cap_desc',
        sparkline: false
      },
      headers: {
        accept: "application/json",
        "x-cg-demo-api-key": "CG-htW8FZA2s6UML5ozgvrHDwgs",
      },
    };
  
    try {
      const response = await axios.request(options);

      return response.data;
    } catch (err) {
      console.error(`COINGECKO ERROR ${err}`);
      throw err;
    }
}

async function fetchCoinFromBinance(symbol) {
    const endDate = startOfDay(new Date());
    const startDate = subYears(endDate, 1);
  
    const startTime = getTime(startDate);
    const endTime = getTime(endDate);
  
    const options = {
      method: "GET",
      url: "https://api.binance.com/api/v3/klines",
      params: {
        symbol: `${symbol.toUpperCase()}USDT`,
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

async function readBoughtCoins() {
  try {
      const data = await fs.readFile('bought_coins_list.json', 'utf8');
      return JSON.parse(data);
  } catch (error) {
      console.error('Error reading bought_coins_list.json:', error);
      return {};
  }
}

async function fetchAndSaveCoins(coinList) {
    const coinsData = {};
    const notUsedCoins = ["usd", "usdt", "usdc", "dai", "busd", "tusd", "husd", "zusd", "usdp", "usdn", "steth", "bnsol"];
    const boughtCoins = await readBoughtCoins();
  
    for (const coin of coinList) {
      if (Object.keys(coinsData).length >= 120) break;
  
      // Skip stablecoins
      if (notUsedCoins.some(keyword => coin.symbol.toLowerCase().includes(keyword))) {
        console.log(`Skipping potential stablecoin: ${coin.symbol}`);
        continue;
      }
  
      try {
        console.log(`Checking ${coin.symbol} on Binance...`);
        const binanceData = await fetchCoinWithRetry(fetchCoinFromBinance, coin.symbol);
  
        if (binanceData) {
          coinsData[coin.symbol] = {
            id: coin.id,
            symbol: coin.symbol,
            name: coin.name,
            market_cap: coin.market_cap,
            bought: false,
            market_cap_rank: coin.market_cap_rank,
            // ((ATH - Current Price) / ATH) * 100
            ath: coin.ath
          };

          if (boughtCoins[coin.symbol] && boughtCoins[coin.symbol].bought === true) {
            coinsData[coin.symbol].bought = true;
          }
  
          // Write to file after each successful fetch
          await writeCoinsToFile(coinsData);
        } else {
          console.log(`${coin.symbol} not found on Binance, skipping.`);
        }
  
        await delay(1000); // 1 second delay
      } catch (error) {
        console.error(`Error fetching data for ${coin.symbol}: ${error}`);
      }
    }

    // Add all bought coins, including those that weren't fetched from CoinGecko
    for (const [symbol, coin] of Object.entries(boughtCoins)) {
      if (!coinsData[symbol]) {
          coinsData[symbol] = {
              id: coin.id || symbol,  // Use the symbol as id if not provided
              symbol: symbol,
              name: coin.name || symbol,  // Use the symbol as name if not provided
              market_cap: coin.market_cap || null,  // Set to null if not provided
              bought: true
          };
      } else {
          // Ensure the bought status is true for all coins in boughtCoins
          coinsData[symbol].bought = true;
      }
    }

    await writeCoinsToFile(coinsData);
  
    console.log(`Finished. Total coins fetched: ${Object.keys(coinsData).length}`);
    return coinsData;
}

async function writeCoinsToFile(coins) {
    try {
      await fs.writeFile('coins_list.json', JSON.stringify(coins, null, 2));
      console.log('Coins data has been written to coins_list.json');
    } catch (err) {
      console.error('Error writing to file:', err);
    }
}

async function main() {
    try {
        const coinList = await fetchCoinListFromCoinGecko();

        await fetchAndSaveCoins(coinList);
    }
    catch (err) {
        console.error(`Binance error: ${err}`);
    }
}
main();
