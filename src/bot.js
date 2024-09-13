require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');
const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Function to get token supply. Don't need this since all pump.fun supplies are 1000000000
// const getTokenSupply = async (tokenMint) => {
//     try {
//         const mintPublicKey = new PublicKey(tokenMint);
//         const tokenSupplyInfo = await connection.getTokenSupply(mintPublicKey);

//         const tokenSupply = tokenSupplyInfo.value.uiAmount;
//         console.log(`Token Supply: ${tokenSupply}`);
//         return tokenSupply;
//     } catch (error) {
//         console.error("Error fetching token supply:", error);
//         return null;
//     }
// };

// Helper function to get token holders with retry and delay
const getTokenHoldersWithOwners = async (tokenMint, retries = 5, delay = 10000) => {
    try {
        const mintPublicKey = new PublicKey(tokenMint);
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const largestAccounts = await connection.getTokenLargestAccounts(mintPublicKey, 'finalized');

                if (largestAccounts.value.length > 0) {
                    // Fetch owner (account) for each token account
                    const holderDistribution = await Promise.all(
                        largestAccounts.value.map(async (accountInfo) => {
                            const tokenAccountAddress = new PublicKey(accountInfo.address);

                            // Fetch the account details to find the owner (account)
                            const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccountAddress);

                            const ownerAccount = tokenAccountInfo.value.data.parsed.info.owner;
                            return {
                                tokenAccount: tokenAccountAddress.toBase58(),
                                ownerAccount: ownerAccount,
                                balance: accountInfo.uiAmount,
                            };
                        })
                    );

                    console.log("Holder Distribution with Owners: ", holderDistribution);
                    return holderDistribution;
                }

                console.log(`Attempt ${attempt}: No token holders found yet. Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Delay before retry

            } catch (error) {
                console.error(`Attempt ${attempt} failed with error: ${error.message}. Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Delay before retry
            }
        }

        console.error("Max retries reached. No token holders found.");
        return null;

    } catch (error) {
        console.error("Error fetching token holders:", error);
        return null;
    }
};

// Updated token criteria check with retry logic
const checkTokenCriteria = async (token) => {
    try {
        // Fetch token holders (distribution), resolve owner accounts with retry logic
        const holders = await getTokenHoldersWithOwners(token.Mint, 5, 10000);
        if (!holders) return false;

        // Bonding curve address (exclude this from the check)
        const bondingCurveOwner = token.BondingCurve;

        // Check for wallet holding more than 4%, excluding the bonding curve owner account
        const totalSupply = 1000000000; // Fixed supply of 1 billion
        const hasLargeHolder = holders.some(holder => {
            if (holder.ownerAccount === bondingCurveOwner) {
                return false;  // Exclude bonding curve account
            }
            return (holder.balance / totalSupply) * 100 > 4;
        });

        if (hasLargeHolder) {
            console.log("Token has a large holder (> 4%)");
            return false;
        }

        console.log("Token meets the criteria");
        return true;
    } catch (error) {
        console.error("Error checking token criteria:", error);
        return false;
    }
};

// Helper function to check if the token has linked social accounts
async function checkTokenSocials(token) {
    try {
        const metadata = await axios.get(token.Uri);
        const { twitter, telegram, website } = metadata.data;

        console.log("checkTokenSocials response: ", metadata.data)

        // Ensure the token has valid social links (Telegram or Twitter)
        if (telegram && twitter && website) {
            return true;
        }

        return false;
    } catch (error) {
        console.error("Error fetching token metadata:", error);
        return false;
    }
}

// Function to execute a trade on Pump.fun
async function executeTrade(token, tradeType, amount) {
    console.log(`Executing ${tradeType} trade for token: ${token.Name}`);
    try {
        const response = await axios.post('https://rpc.api-pump.fun/trade', {
            trade_type: tradeType,
            mint: token.Mint,
            amount: amount,
            amountInSol: false,
            slippage: 500,
            priorityFee: 100000,
            private: process.env.WALLET_PRIVATE_KEY
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.PUMP_FUN_API_KEY
            }
        });

        console.log(`Trade executed: ${tradeType} ${amount} for token ${token.name}`);
        console.log(`Transaction Hash: ${response.data.tx_hash}`);

        const fee = amount * 0.005;
        console.log(`Fee (0.5%) for this trade: ${fee}`);

        return response.data.tx_hash;
    } catch (error) {
        console.error(`Error executing ${tradeType} trade for ${token.name}:`, error);
        return null;
    }
}

// Function to handle King of the Hill (sell 50% of holdings when price reaches the peak)
async function checkKingOfTheHill(token) {
    try {
        const kothResponse = await axios.get(`https://rpc.api-pump.fun/king-of-the-hill/${token.mint}`);
        const isAtPeak = kothResponse.data.isAtKingOfTheHill;

        if (isAtPeak) {
            const amountToSell = token.holdings * 0.5;
            await executeTrade(token, "sell", amountToSell);
        }
    } catch (error) {
        console.error("Error checking King of the Hill:", error);
    }
}

// Connect to WebSocket to get new tokens
const ws = new WebSocket('wss://rpc.api-pump.fun/ws');

ws.on('open', function open() {
    console.log("WebSocket connection opened. Subscribing to new token events...");
    const subscribePayload = {
        method: "subscribeNewPools", // Subscribe to new token pools
        params: []
    };
    ws.send(JSON.stringify(subscribePayload));
});

ws.on('message', async function message(data) {

    const parsedData = JSON.parse(data);
    if (parsedData) {
        console.log("New token detected:", parsedData);
        
        // Check if token meets all criteria
        const isEligible = await checkTokenCriteria(parsedData);
        const hasSocials = await checkTokenSocials(parsedData);

        if (isEligible && hasSocials) {
            const buyAmount = 0.01; // Example buy amount in SOL
            await executeTrade(parsedData, "buy", buyAmount);

            // Monitor for King of the Hill and sell 50% when reached
            setInterval(() => checkKingOfTheHill(token), 60000); // Check every minute
        } else {
            console.log(`Token ${parsedData.Name} does not meet the criteria.`);
        }
    }
});

ws.on('close', () => {
    console.log("WebSocket connection closed.");
});

ws.on('error', (error) => {
    console.error("WebSocket error:", error);
});
