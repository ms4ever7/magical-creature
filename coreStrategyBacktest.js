import axios from "axios";
import { startOfDay, subYears, getTime, format }  from 'date-fns';
import Table from 'cli-table3';
import { fetchCoinFromBinance } from "./gateway";

const API_KEY = 'vkCr2iZjkisISvtjSbRkJGla7Gz1PxmJwDM1YOqX3X2ESnTUdwBmEnduapsa2Z8J';

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

  // We start from index 99 to ensure we have enough data for our 100-day lookback
  for (let i = 49; i < ema5.length; i++) {
    const currentDate = new Date(dates[i]);
    const currentPrice = prices[i];
    
    highest28Days = Math.max(...prices.slice(i-27, i+1));
    
    lowest14Days = Math.min(...prices.slice(Math.max(0, i-13), i+1));

    let signal = "hold";

    // Check the EMA 50/100 strategy or Breakout strategy to be in the market
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
    
    signals.push({ signal, date: currentDate.toISOString(), price: currentPrice });
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

function multiCoinBacktest(coinsData) {
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
  const longEMA = calculateEMA(closingPrices, longPeriod);

  const dailyTradingSignals = generateDailyTradingSignals(
    shortEMA,
    mediumPeriod,
    longEMA,
    closingPrices,
    dates
  );

  
  const appropriateSignals = dailyTradingSignals.filter(({ signal }) => signal === "buy" || signal === "sell");

  return analyzeProfitLoss(appropriateSignals, coinSymbol);;
}

function analyzeProfitLoss(tradingSignals, coinSymbol) {
  const results = [];

  for (const signal of tradingSignals) {
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

function calculateProfitLoss(transactions) {
  const groupedByCoin = {};

  // Step 1: Group transactions by coin symbol
  transactions.forEach(transaction => {
    const { coinSymbol, action, date, price } = transaction;

    if (!groupedByCoin[coinSymbol]) {
      groupedByCoin[coinSymbol] = [];
    }

    groupedByCoin[coinSymbol].push({
      action,
      date: new Date(date),
      price: parseFloat(price),
    });
  });

  const results = [];
  let totalProfitLoss = 0;

  // Step 2: Calculate profit/loss for each coin
  for (const coinSymbol in groupedByCoin) {
    const transactions = groupedByCoin[coinSymbol].sort((a, b) => a.date - b.date);
    let lowestBuy = null;

    for (const transaction of transactions) {
      if (transaction.action === 'Buy') {
        // Only allow a buy if there is no existing buy being tracked
        if (!lowestBuy) {
          const investmentAmount = 100; 
          const buyPrice = transaction.price;
          const quantity = investmentAmount / buyPrice; // Quantity bought for $100

          lowestBuy = { price: buyPrice, date: transaction.date, quantity, investmentAmount };
          results.push({
            coinSymbol,
            date: transaction.date,
            price: buyPrice,
            action: 'Buy',
          });
        }
      } else if (transaction.action === 'Sell' && lowestBuy) {
        // Calculate profit/loss based on the quantity bought
        const sellPrice = transaction.price;
        const profitLoss = (sellPrice - lowestBuy.price) * lowestBuy.quantity; // Profit/Loss in $
        const finalValue = lowestBuy.investmentAmount + profitLoss; // Final value after selling

        const profitLossDollar = finalValue - 100; // Profit/Loss based on initial $100
        const profitLossPercent = (profitLossDollar / 100) * 100; // Profit/Loss in percentage

        results.push({
          coinSymbol,
          date: transaction.date,
          price: sellPrice,
          action: 'Sell',
          profitLoss: profitLossDollar,
          profitLossPercent,
        });

        totalProfitLoss += profitLossDollar;

        // Reset lowestBuy after a sell to look for the next buy
        lowestBuy = null;
      }
    }
  }

  return { results, totalProfitLoss };
}

// Function to get coins with buy signals from yesterday
function getCoinsToBuyFromYesterday(allResults) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = format(yesterday, 'yyyy-MM-dd');

  return allResults
    .filter(result => 
      format(result.date, 'yyyy-MM-dd') === yesterdayString && 
      result.action === 'BUY'
    )
    .map(result => ({
      symbol: result.coinSymbol,
      currentPrice: result.price  // Assuming the price in the result is the current price
    }));
}

function generateResultTable(results, totalProfitLoss) {
  const table = new Table({
    head: ['Coin Symbol', 'Buy/Sell Date', 'Buy/Sell Price', 'Action', 'Profit/Loss ($)', 'Profit/Loss (%)'],
    colAligns: ['left', 'center', 'center', 'right', 'right', 'right']
  });

  results.forEach(result => {
    const profitLossDisplay = result.profitLoss !== undefined ? result.profitLoss.toFixed(2) : '';
    const profitLossPercentDisplay = result.profitLossPercent !== undefined ? result.profitLossPercent.toFixed(2) : ''; // Show the correct percentage

    table.push([
      result.coinSymbol.toUpperCase(),
      format(result.date, 'yyyy-MM-dd'),
      result.price.toFixed(8),
      result.action,
      profitLossDisplay,
      profitLossPercentDisplay,
    ]);
  });

  const coinsToBuy = getCoinsToBuyFromYesterday(results);

  console.log(table.toString());
  console.log(`\nTotal Profit/Loss: ${totalProfitLoss > 0 ? '+' : ''}${totalProfitLoss.toFixed(2)}$`);
  console.log('Coin to buy today:', coinsToBuy.length ? coinsToBuy.split(', ') : 'Nothing to buy today, chill :)');
}

async function main() {
  try {
    const data = await getCoinsList();
    const jsonData = JSON.parse(data);
    const coinsList =  Object.values(jsonData).map(coin => coin.symbol.toUpperCase()).slice(0,3);

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

    const backtestResults = multiCoinBacktest(coinsData);
    // Execution
    const { results, totalProfitLoss } = calculateProfitLoss(backtestResults);
    generateResultTable(results, totalProfitLoss);
  } catch (err) {
    console.error(`Main Error ${err}`);
  }
}

main();