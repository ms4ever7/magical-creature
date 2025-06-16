import axios, { AxiosRequestConfig } from "axios";
import { subDays, subYears, getTime } from 'date-fns';

// === TYPES ===
interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: {
    times: number;
    currency: string;
    percentage: number;
  } | null;
  last_updated: string;
}

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  market_cap: number | null;
  bought: boolean;
  market_cap_rank?: number;
  ath?: number;
  [key: string]: any;
}

export interface CoinsDataMap {
  [symbol: string]: CoinData;
}

interface JsonBinResponse {
  record: any;
  metadata: {
    id: string;
    createdAt: string;
    private: boolean;
  };
}

// Binance Klines data format: [timestamp, open, high, low, close, volume, closeTime, quoteVolume, count, takerBuyVolume, takerBuyQuoteVolume, ignore]
export type BinanceKlineData = [
  number,  // Open time
  string,  // Open price
  string,  // High price
  string,  // Low price
  string,  // Close price
  string,  // Volume
  number,  // Close time
  string,  // Quote asset volume
  number,  // Number of trades
  string,  // Taker buy base asset volume
  string,  // Taker buy quote asset volume
  string   // Ignore
];

// === CONSTANTS ===
const xMasterKeyApi: string = '$2a$10$XhryB9zgJez6cNJsPU7gG.ktqNYY9eDf8BM6PaprK38Kxe21vvC4G';
const API_KEY: string = 'vkCr2iZjkisISvtjSbRkJGla7Gz1PxmJwDM1YOqX3X2ESnTUdwBmEnduapsa2Z8J';
const TELEGRAM_BOT_TOKEN: string = '8197515634:AAFJ3I59QgGp3tjoZdH48fCdo9lPe_zDyU4';
const TELEGRAM_CHAT_ID: string = '379623218';

// === FUNCTIONS ===
export const sendTelegramMessage = async (message: string): Promise<void> => {
  const url: string = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
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
      const errorText: string = await response.text();
      console.error('Failed to send message to Telegram:', errorText);
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
  }
};

export const fetchCoinListFromCoinGecko = async (): Promise<CoinGeckoMarketData[]> => {
  const options: AxiosRequestConfig = {
    method: "GET",
    url: "https://api.coingecko.com/api/v3/coins/markets",
    params: {
      vs_currency: "usd",
      per_page: 50,
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
    const response = await axios.request<CoinGeckoMarketData[]>(options);
    return response.data;
  } catch (err) {
    console.error(`COINGECKO ERROR ${err}`);
    throw err;
  }
};

export const fetchCoinFromBinance = async (symbol: string): Promise<BinanceKlineData[]> => {
  const endDate: Date = subDays(new Date(), 1);
  const startDate: Date = subYears(endDate, 1);

  const startTime: number = getTime(startDate);
  const endTime: number = getTime(endDate);

  const options: AxiosRequestConfig = {
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
    const response = await axios.request<BinanceKlineData[]>(options);
    return response.data;
  } catch (err) {
    console.error(`Binance fetching coin list error: ${err}`);
    throw err;
  }
};

export const updateCoinsList = async (signalData: CoinsDataMap): Promise<CoinsDataMap> => {
  const response = await fetch('https://api.jsonbin.io/v3/b/684fbe8e8561e97a50250686', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': xMasterKeyApi
    },
    body: JSON.stringify(signalData)
  });

  const data: JsonBinResponse = await response.json();
  return data.record;
};

export const updateBoughtCoinsList = async (signalData: CoinsDataMap): Promise<CoinsDataMap> => {
  const response = await fetch('https://api.jsonbin.io/v3/b/684fbeaf8a456b7966aee337', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': xMasterKeyApi
    },
    body: JSON.stringify(signalData)
  });

  const data: JsonBinResponse = await response.json();
  return data.record;
};

export const getCoinsList = async (): Promise<CoinsDataMap> => {
  const response = await fetch('https://api.jsonbin.io/v3/b/684fbe8e8561e97a50250686/latest', {
    headers: { 'X-Master-Key': xMasterKeyApi },
  });
  
  const data: JsonBinResponse = await response.json();
  return data.record;
};

export const getBoughtCoinsList = async (): Promise<CoinsDataMap> => {
  const response = await fetch('https://api.jsonbin.io/v3/b/684fbeaf8a456b7966aee337/latest', {
    headers: { 'X-Master-Key': xMasterKeyApi },
  });
  
  const data: JsonBinResponse = await response.json();
  return data.record;
};