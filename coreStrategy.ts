import {
  getCoinsList,
  getBoughtCoinsList,
  updateBoughtCoinsList,
  fetchCoinFromBinance,
  sendTelegramMessage,
  BinanceKlineData,
  CoinsDataMap
} from './gateway.ts';


interface TargetPosition {
  targetPosition: number;
  date: Date;
  price: number;
}

interface AnalysisResult {
  coinSymbol: string;
  targetPosition: number;
  date: Date;
  price: number;
}

interface PossibleTrades {
  [coin: string]: number;
}

// === UTILS ===
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function calculateEMA(data: number[], period: number): number[] {
  const smoothingFactor = 2 / (period + 1);
  let ema = Number(data[0]);
  const emaResults: number[] = [ema];

  for (let i = 1; i < data.length; i++) {
    const price = Number(data[i]);
    ema = (price - emaResults[i - 1]) * smoothingFactor + emaResults[i - 1];
    emaResults.push(ema);
  }

  return emaResults;
}

function generateDailyTargetPositions(
  ema5: number[], 
  ema10: number[], 
  ema50: number[], 
  prices: number[], 
  dates: string[]
): TargetPosition[] {
  const targetPositions: TargetPosition[] = [];
  let lastBreakoutDirection: 'up' | 'down' | 'none' = 'none';
  
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
    const signalComponents: number[] = [
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

async function fetchCoinWithRetry<T extends any[], R>(
  fetchFunction: (...args: T) => Promise<R>, 
  ...args: T
): Promise<R> {
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
    } catch (error: any) {
      if (error.response && error.response.status === 429) {
        console.log(`Rate limit hit. Attempt ${attempt + 1} of ${maxRetries}`);
        if (attempt === maxRetries - 1) throw error;
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Max retries exceeded');
}

function runDataAnalysis(coinsData: { [coinSymbol: string]: BinanceKlineData[] }): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  for (const [coinSymbol, coinData] of Object.entries(coinsData)) {
    const analysis = analyzeData(coinData, coinSymbol);
    results.push(...analysis);
  }

  // Sort results by buy date
  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  return results;
}

function analyzeData(coinData: BinanceKlineData[], coinSymbol: string): AnalysisResult[] {
  const shortPeriod = 5;
  const mediumPeriod = 10;
  const longPeriod = 50;

  // Extract closing prices and dates
  const closingPrices: number[] = coinData.map((priceList) => Number(priceList[4]));
  const dates: string[] = coinData.map((priceList) => new Date(priceList[0]).toISOString());

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
  return targetPositions.map(({ targetPosition, date, price }) => ({
    coinSymbol,
    targetPosition,
    date,
    price
  }));
}

async function calculatePossibleTrades(signals: AnalysisResult[]): Promise<PossibleTrades> {
  let coinsDataInJson: CoinsDataMap = {};
  let boughtCoinsDataInJson: CoinsDataMap = {};

  try {
    coinsDataInJson = await getCoinsList();
    boughtCoinsDataInJson = await getBoughtCoinsList();
  } catch (error) {
    console.error('Error reading files:', error);
    return {};
  }

  const changes: PossibleTrades = {};
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

      boughtCoinsDataInJson[coin] = {
        ...coinsDataInJson[coin],
        bought: true
      };

      await updateBoughtCoinsList(boughtCoinsDataInJson);
    } else if (target === 0 && isBought) {
      changes[coin] = 0;

      delete boughtCoinsDataInJson[coin];
      await updateBoughtCoinsList(boughtCoinsDataInJson);
    }
  }

  return changes;
}

function formatTradingMessage(changes: PossibleTrades): string {
  const coins = Object.keys(changes);
  
  if (coins.length === 0) {
    return '🛌 Nothing to buy or sell today, chill :)';
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

async function main(): Promise<void> {
  try {
    const jsonData: CoinsDataMap = await getCoinsList();
    const coinsList: string[] = Object.values(jsonData).map(coin => coin.symbol.toUpperCase());
    
    const coinsData: { [coinSymbol: string]: BinanceKlineData[] } = {};

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

    const dataAnalyzed = runDataAnalysis(coinsData);

    const possibleTrades = await calculatePossibleTrades(dataAnalyzed);

    await sendTelegramMessage(formatTradingMessage(possibleTrades));
  } catch (err) {
    console.error(`Main Error ${err}`);
  }
}

main();