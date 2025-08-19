# BitnestRus Bot

ℹ️ Important

The code published in this repository is for informational purposes only.
This is not the complete bot code, but only the main modules and functions that demonstrate:

-   🔐 Security of seed phrases and private data storage (encryption, database management).
-   💸 How to work with USDT and BNB transactions on the BSC blockchain.
-   ⚙️ Error handling logic and transparency of user interaction.

This way, you can be sure that:
-   user data is not transferred to third parties;


🤖 **BitnestRus Bot** is a Telegram bot for working with crypto wallets
and the USDT/BNB liquidity pool.
It includes integration with the BSC blockchain, an affiliate program, and
automatic user notifications.

## 🚀 Features

-   💼 Creation and storage of crypto wallets (with encrypted
    seed phrase).\
-   🌊 Sending USDT to the liquidity pool via a smart contract.\
-   👥 Multi-level referral program (up to 17 levels).\
-   🎁 Automatic raffles among investors.
-   📊 Real-time analytics and notifications.

## 🔐 Security

-   Seed phrases are stored in encrypted form (AES-256).
- User data is not shared with third parties.
- All transactions are signed locally.
- For more details, see [Privacy Policy](./PRIVACY.md).

## ⚙️ Technologies

- [Node.js](https://nodejs.org/)
- [Telegraf](https://telegraf.js.org/) (Telegram Bot API)
- [ethers.js](https://docs.ethers.org/) (working with blockchain)
- MySQL (data storage)

## 📌 Code example

Fragment of the function for transferring USDT to the pool (file
[`pancake.js`](./src/services/pancake.js)):

``` js
async function sendToPool(userId, amount) {
  // Get the user's wallet
  const [wallets] = await connection.execute(
    `SELECT w.*, u.telegram_id 
     FROM wallets w
     JOIN users u ON w.user_id = u.id
     WHERE w.user_id = ?`,
    [userId]
  );
  if (!wallets.length) throw new Error(‘WALLET_NOT_FOUND’);

  // Connect the USDT contract
  const usdtContract = new ethers.Contract(USDT_CONFIG.address, USDT_CONFIG.abi, wallet);

  // Transfer USDT to the pool
  const tx = await usdtContract.transfer(config.poolContractAddress, amountWei, { gasLimit: 150000 });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(‘TRANSACTION_FAILED’);

  return tx.hash;
}
```

## 📥 Installation

``` bash
git clone https://github.com/username/bitnestrus-bot.git
cd bitnestrus-bot
npm install
```

Create a `.env` file:

``` env
TELEGRAM_TOKEN=your_telegram_token
BSC_RPC_URL=https://bsc-dataseed.binance.org/
POOL_CONTRACT_ADDRESS=0x...
ENCRYPTION_KEY=your_32_bytes_key
```

Launch:

``` bash
node bot.js
```

## 📄 Documents

-   [Privacy Policy (RU)](./PRIVACY.md)\
-   [Privacy Policy (EN)](./PRIVACY_EN.md)


private keys are not stored in plain text;

all transactions are performed securely and transparently.

👉 The full version of the bot, including closed modules, tokens, and private keys, is not published for security reasons.
