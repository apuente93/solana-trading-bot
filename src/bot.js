require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');
const { Connection } = require('@solana/web3.js');

// ================================
// RPC Connection
const rpcUrl = process.env.RPC_URL || 'https://rpc.ankr.com/solana_devnet';
const connection = new Connection(rpcUrl, 'confirmed');

// In-memory holdings (for demonstration purposes)
const holdings = {};
const tradeHistory = {}; // Track buy price and time for profit/loss calculation

// ================================
// Execute a trade using PumpPortal’s Local Trading API.
const executeTrade = async (token, tradeType, amount) => {
  console.log(`Executing ${tradeType} trade for token ${token.name}`);
  try {
    const response = await axios.post(
      'https://pumpportal.fun/local-trading-api/trading-api/trade',
      {
        trade_type: tradeType,
        mint: token.mint,
        amount: amount,
        amountInSol: false,
        slippage: 500,
        priorityFee: 100000,
        private: process.env.WALLET_PRIVATE_KEY,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`Trade executed: ${tradeType} ${amount} for ${token.name}`);
    console.log(`Transaction Hash: ${response.data.tx_hash}`);
    return response.data.tx_hash;
  } catch (error) {
    console.error(`Error executing ${tradeType} trade for ${token.name}: ${JSON.stringify(error, null, 2)}`);
    return null;
  }
};

// ================================
// WebSocket Subscription to PumpPortal’s Data API.
const wsUrl = "wss://pumpportal.fun/api/data";
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log("Connected to PumpPortal Data API.");
  const subscribePayload = { method: "subscribeNewToken" };
  ws.send(JSON.stringify(subscribePayload));
});

ws.on('message', async (data) => {
  try {
    const parsedData = JSON.parse(data);
    if (parsedData.message) {
      console.log("Subscription response:", parsedData.message);
      return;
    }

    const token = parsedData.token || parsedData;
    if (token && token.mint && token.name && token.uri) {
      console.log("New token detected:", token);
      
      const totalSupply = token.vTokensInBondingCurve;
      const devHoldingPercentage = (token.initialBuy / totalSupply) * 100;
      console.log(`Developer holding: ${devHoldingPercentage.toFixed(2)}%`);

      if (devHoldingPercentage <= 3.5) {
        const buyAmount = 0.05;
        console.log(`Token ${token.name} passes dev holdings threshold. Buying ${buyAmount} SOL.`);
        console.log(`Successfully bought ${buyAmount} of ${token.name}.`);
        
        tradeHistory[token.mint] = {
          buyAmount: buyAmount,
          buyTime: Date.now(),
          buyPrice: token.marketCapSol / token.vTokensInBondingCurve,
        };

        setTimeout(async () => {
          const sellAmount = tradeHistory[token.mint].buyAmount;
          const sellPrice = token.marketCapSol / token.vTokensInBondingCurve;
          const profitLoss = ((sellPrice - tradeHistory[token.mint].buyPrice) * sellAmount).toFixed(4);
          console.log(`Token: ${token.name} | Profit/Loss: ${profitLoss} SOL after 30 seconds.`);
          console.log(`Successfully sold ${sellAmount} of ${token.name}.`);
        }, 30000);

      } else {
        console.log(`Token ${token.name} does not pass dev holdings threshold (<= 3.5%). Skipping...`);
      }

    } else {
      console.log("Received message does not match expected token event format:", parsedData);
    }
  } catch (error) {
    console.error("Error processing message from PumpPortal:", JSON.stringify(error, null, 2));
  }
});

ws.on('close', () => {
  console.log("WebSocket connection closed.");
});

ws.on('error', (error) => {
  console.error("WebSocket error:", JSON.stringify(error, null, 2));
});
