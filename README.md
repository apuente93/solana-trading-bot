# Solana Trading Bot

This project is an automated trading bot built to trade Solana-based tokens listed on Pump.fun. The bot automatically scans for new token launches, applies filters to determine the best tokens to buy, and executes trades programmatically using the Pump.fun API.

## Features
- **Automated Token Discovery:** The bot automatically fetches new tokens from Pump.fun and filters them based on market cap, wallet distribution, volume, and other customizable criteria.
- **Trade Execution:** The bot places buy and sell orders using the Pump.fun trading API. It is configured to buy tokens that meet predefined conditions and sell 50% of holdings once a "King of the Hill" price point is reached.
- **Fee Calculation:** The bot considers Pump.fun’s 0.5% trading fee for each transaction and logs this information for later use in statistics and profit calculations.
- **Environment Variables:** API keys and sensitive data are securely stored in environment variables, ensuring the project remains secure when hosted on GitHub.

## Getting Started

### Prerequisites
- **Node.js**: Ensure you have Node.js installed. You can download it [here](https://nodejs.org/).
- **Pump.fun API Key**: You’ll need an API key from Pump.fun to interact with their API. You can generate a free key [here](https://docs.api-pump.fun/general/getting-started) and add it to your `.env` file.

### Installation
1. Clone the repository:
    ```bash
    git clone https://github.com/your-username/solana-trading-bot.git
    cd solana-trading-bot
    ```
2. Install dependencies
    ```bash
    npm install
    ```
3. Set up environment variables: Create a .env file in the root directory with the following content:
    ```
    PUMP_FUN_API_KEY=your_api_key_here
    PUMP_FUN_API_BASE_URL=https://api.pumpapi.fun/api
    ```
4. Run the bot:
    ```
    node src/bot.js
    ```
    
### How It Works
- The bot fetches new token launches from Pump.fun and filters them based on:
  - Market cap between 10k and 20k SOL.
  - Wallet distribution (no wallet holding more than 3%).
  - Active trading volume (at least 10 wallets involved).
  - Telegram linked to the token.
  - Unique token names.
  
- If a token meets the criteria, the bot places a buy order using the Pump.fun API. After buying, it monitors the token's price to determine when to sell 50% of the holdings.

### Future Development
- **UI/UX Dashboard**: A dashboard will be developed to display trade statistics, ROI, and transaction history.
- **Backtesting**: Implement backtesting to test the algorithm on historical data before running it live.
- **Advanced Risk Management**: Include features such as automated stop-losses and take-profit strategies.

## Tech Stack
- **Backend**: Node.js with Axios for API calls.
- **Environment Management**: dotenv for environment variables.
- **API**: Pump.fun API for trade execution and token metadata.

## Contributing
Contributions are welcome! Feel free to submit a pull request or open an issue if you encounter any bugs or want to propose new features.

### License
This project is licensed under the MIT License.
