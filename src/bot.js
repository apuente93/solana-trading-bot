require('dotenv').config();
const fs = require('fs'); // ✅ File system for writing CSV logs
const path = './trades.csv'; // ✅ File path for the trade log
const axios = require('axios');
const WebSocket = require('ws');
const { Connection } = require('@solana/web3.js');
const BigNumber = require('bignumber.js'); // ✅ Precision library


// ================================
// RPC Connection
const rpcUrl = process.env.RPC_URL || 'https://rpc.ankr.com/solana_devnet';
const connection = new Connection(rpcUrl, 'confirmed');

// In-memory trade tracking (Simulation Mode)
const tradeHistory = {}; // Track buy price, time, and live price updates

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

    // ✅ Log system messages
    if (parsedData.message) {
      console.log(`ℹ️ System Message: ` + parsedData.message);
      return;
    }

    // ✅ Process token creation events (New token listings)
    if (parsedData.txType === "create") {
      console.log(`🚀 New token detected: ${parsedData.name} (${parsedData.mint})`);

      const totalSupply = new BigNumber(parsedData.vTokensInBondingCurve);
      const devHoldingPercentage = new BigNumber(parsedData.initialBuy).dividedBy(totalSupply).times(100);
      console.log(`Developer holding: ${devHoldingPercentage.toFixed(2)}%`);

      if (devHoldingPercentage.lte(3.5)) {
        const buyAmount = new BigNumber(0.05); // Buying 0.05 SOL worth
        console.log(`✅ Token ${parsedData.name} passes dev holdings threshold. Simulating buy of ${buyAmount.toFixed(2)} SOL.`);

        // ✅ Correct formula for price calculation
        if (parsedData.vTokensInBondingCurve > 0) {
          var buyPrice = new BigNumber(parsedData.vSolInBondingCurve).dividedBy(parsedData.vTokensInBondingCurve);
        } else {
          //console.log(`⚠️ Warning: Skipping ${parsedData.name}, invalid bonding curve.`);
          return;
        }

        logTrade("BUY", parsedData.name, parsedData.mint, buyAmount, buyPrice, 0, 0, 0); // Sell price, profitLoss, percentageGain = 0 at buy time

        // ✅ Store trade details for later profit/loss calculation
        tradeHistory[parsedData.mint] = {
          name: parsedData.name,
          buyAmount: buyAmount,
          buyTime: Date.now(),
          buyPrice: buyPrice,
          latestPrice: buyPrice, // Set initial price
        };

        //console.log(`🔹 Stored Buy Price for ${parsedData.name}: ${buyPrice.toFixed(10)} SOL`);

        // ✅ Subscribe to real-time price updates for this token (Add small delay to avoid race condition)
        console.log(`📡 Subscribing to real-time price updates for ${parsedData.name}`);

        ws.send(JSON.stringify({
          method: 'subscribeTokenTrade',
          keys: [parsedData.mint],
        }));

        // ✅ Log calculation details before performing profit/loss calculation
        setTimeout(async () => {
          const token = tradeHistory[parsedData.mint];

          if (!token) {
            console.log(`⚠️ Token ${parsedData.name} was removed from tracking. Skipping sell.`);
            return;
          }

          //console.log(`🔍 Debugging Calculation for: ${token.name}`);
          //console.log(`➡️ Buy Price: ${token.buyPrice.toFixed(10)} SOL`);
          //console.log(`➡️ Latest Price: ${token.latestPrice.toFixed(10)} SOL`);
          //console.log(`➡️ Buy Amount: ${token.buyAmount.toFixed(6)} SOL`);

          // ✅ Check for invalid values
          if (token.buyPrice.isNaN() || token.latestPrice.isNaN()) {
            console.log(`❌ Error: Invalid buyPrice or latestPrice for ${token.name}`);
            return;
          }

          const profitLoss = new BigNumber(token.latestPrice).minus(token.buyPrice).times(token.buyAmount);
          const percentageGain = new BigNumber(token.latestPrice).minus(token.buyPrice).dividedBy(token.buyPrice).times(100);

          console.log(`💰 Token: ${token.name} | Simulated Profit/Loss: ${profitLoss} SOL (${percentageGain}% gain/loss) after 30 seconds.`);
          //console.log(`🔄 Simulating sell of ${token.buyAmount.toFixed(6)} SOL for ${token.name}.`);
          logTrade("SELL", token.name, token.mint, token.buyAmount, token.buyPrice, token.latestPrice, profitLoss, percentageGain);

          // ✅ Unsubscribe from trade updates after selling
          ws.send(JSON.stringify({
            method: 'unsubscribeTokenTrade',
            keys: [parsedData.mint],
          }));

          delete tradeHistory[parsedData.mint]; // Remove from tracking after selling
        }, 30000);

      } else {
        console.log(`❌ Token ${parsedData.name} does not pass dev holdings threshold (<= 3.5%). Skipping...`);
      }
    }

    // ✅ Process real-time token trades (price updates)
    if (parsedData.txType === "buy" || parsedData.txType === "sell") {
      const tokenMint = parsedData.mint;

      if (tradeHistory[tokenMint]) {
        if (parsedData.vSolInBondingCurve > 0 && parsedData.vTokensInBondingCurve > 0) {
          const newPrice = new BigNumber(parsedData.vSolInBondingCurve).dividedBy(parsedData.vTokensInBondingCurve);
          tradeHistory[tokenMint].latestPrice = newPrice;

          //console.log(`📊 Updated price for ${tradeHistory[tokenMint].name}: ${newPrice.toFixed(10)} SOL`);
        } else {
          //console.log(`⚠️ Warning: Skipping price update for ${tradeHistory[tokenMint].name} due to invalid market data.`);
        }
      }
    }

  } catch (error) {
    console.error('⚠️ Error processing WebSocket message:', error.message);
  }
});

ws.on('close', () => {
  //console.log("WebSocket connection closed.");
});

ws.on('error', (error) => {
  console.error("WebSocket error:", JSON.stringify(error, null, 2));
});

// ✅ Function to log trades to CSV
function logTrade(type, name, mint, solAmount, buyPrice, sellPrice, profitLoss, percentageGain) {
  const timestamp = new Date().toISOString(); // Current time in readable format
  const row = `${timestamp},${type},${name},${mint},${solAmount.toFixed(6)},${buyPrice.toFixed(10)},${sellPrice.toFixed(10)},${profitLoss.toFixed(10)},${percentageGain.toFixed(2)}%\n`;

  // ✅ If file does not exist, create with headers
  if (!fs.existsSync(path)) {
      const headers = "Timestamp,Type,Token Name,Mint Address,SOL Amount,Buy Price (SOL),Sell Price (SOL),Profit/Loss (SOL),% Gain/Loss\n";
      fs.writeFileSync(path, headers, 'utf8');
  }

  // ✅ Append trade log to the file
  fs.appendFileSync(path, row, 'utf8');
}