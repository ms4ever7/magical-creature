import axios, { AxiosRequestConfig } from "axios";
import { subDays, getTime, subMonths } from 'date-fns';

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


export interface KrakenOHLCData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  vwap: number;
  volume: number;
  count: number;
};


// === CONSTANTS ===
const xMasterKeyApi: string = '$2a$10$XhryB9zgJez6cNJsPU7gG.ktqNYY9eDf8BM6PaprK38Kxe21vvC4G';
const API_KEY: string = 'vkCr2iZjkisISvtjSbRkJGla7Gz1PxmJwDM1YOqX3X2ESnTUdwBmEnduapsa2Z8J';
const TELEGRAM_BOT_TOKEN: string = '8197515634:AAFJ3I59QgGp3tjoZdH48fCdo9lPe_zDyU4';
const TELEGRAM_CHAT_IDS: string[] = ['379623218'];
// const TELEGRAM_CHAT_IDS: string[] = ['379623218', '363337662'];

// === FUNCTIONS ===

export const sendTelegramMessage = async (message: string): Promise<void> => {
  const url: string = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      if (response.ok) {
        console.log(`Message sent to Telegram chat ID ${chatId}`);
      } else {
        const errorText: string = await response.text();
        console.error(`Failed to send message to chat ID ${chatId}:`, errorText);
      }
    } catch (error) {
      console.error(`Error sending message to chat ID ${chatId}:`, error);
    }
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


export const fetchCoinFromKraken = async (symbol: string): Promise<KrakenOHLCData[]> => {
  const endDate: Date = subDays(new Date(), 1);
  const startDate: Date = subMonths(endDate, 6);

  const since: number = Math.floor(getTime(startDate) / 1000);

  const options: AxiosRequestConfig = {
    method: "GET",
    url: "https://api.kraken.com/0/public/OHLC",
    params: {
      pair: `${symbol.toUpperCase()}/USD`, // you control the symbol here
      interval: 1440,
      since,
    },
    headers: {
      accept: "application/json",
    },
  };

  try {
    const response = await axios.request(options);
    const { error, result } = response.data;
    
    if (error && error.length > 0) {
      throw new Error(`Kraken API error: ${error.join(", ")}`);
    }

    const pairKey = Object.keys(result).find((key) => key !== "last");
    if (!pairKey) throw new Error("Invalid Kraken response format");

    return result[pairKey];
  } catch (err) {
    console.error(`Kraken fetching coin - ${symbol} list error: ${err}`);
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