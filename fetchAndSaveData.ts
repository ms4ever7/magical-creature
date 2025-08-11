import { 
  fetchCoinFromKraken, 
  fetchCoinListFromCoinGecko, 
  updateCoinsList, 
  getBoughtCoinsList 
} from "./gateway.ts";

// === TYPES ===
interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap: number;
  market_cap_rank: number;
  ath: number;
}

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  market_cap: number | null;
  bought: boolean;
  market_cap_rank?: number;
  ath?: number;
}

interface CoinsDataMap {
  [symbol: string]: CoinData;
}

interface BoughtCoinsMap {
  [symbol: string]: {
    id?: string;
    symbol?: string;
    name?: string;
    market_cap?: number | null;
    bought: boolean;
    [key: string]: any;
  };
}

// === UTILS ===
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchCoinWithRetry<T extends any[], R>(
  fetchFunction: (...args: T) => Promise<R>, 
  ...args: T
): Promise<R> {
  const maxRetries: number = 5;
  const baseDelay: number = 3000; // 3 seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add a delay before each attempt (except the first one)
      if (attempt > 0) {
        const delayTime: number = baseDelay * Math.pow(2, attempt - 1);
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
  
  // This should never be reached due to the throw in the loop, but TypeScript needs it
  throw new Error('Max retries exceeded');
}

async function fetchAndSaveCoins(coinList: CoinGeckoCoin[]): Promise<CoinsDataMap> {
  const coinsData: CoinsDataMap = {};
  const notUsedCoins: string[] = [
    "wbtc", "usd", "usdt", "usdc", "dai", "busd", "tusd", 
    "husd", "zusd", "usdp", "usdn", "steth", "bnsol", "wbeth", "weeth", "weth", "usds", "cbbtc"
  ];
  const boughtCoins: BoughtCoinsMap = await getBoughtCoinsList();

  for (const coin of coinList) {
    if (Object.keys(coinsData).length >= 20) break;

    // Skip stablecoins
    if (notUsedCoins.some((keyword: string) => coin.symbol.toLowerCase().includes(keyword))) {
      console.log(`Skipping potential stablecoin: ${coin.symbol}`);
      continue;
    }

    try {
      console.log(`Checking ${coin.symbol} on Binance...`);
      const binanceData: any = await fetchCoinWithRetry(fetchCoinFromKraken, coin.symbol);

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
        await updateCoinsList(coinsData);
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

  await updateCoinsList(coinsData);

  console.log(`Finished. Total coins fetched: ${Object.keys(coinsData).length}`);
  return coinsData;
}

async function main(): Promise<void> {
  try {
    const coinList: CoinGeckoCoin[] = await fetchCoinListFromCoinGecko();

    await fetchAndSaveCoins(coinList);
  } catch (err) {
    console.error(`Binance error: ${err}`);
  }
}

main();