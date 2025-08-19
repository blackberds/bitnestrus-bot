module.exports = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  port: process.env.PORT || 3000,
  adminSecret: process.env.ADMIN_SECRET,
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  },
  
  encryptionKey: process.env.ENCRYPTION_KEY || '***...ENCRYPTION_KEY...***',
  bscRpc: process.env.BSC_RPC,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  operatorUsername: process.env.OPERATOR_USERNAME,
  contractAddress: process.env.CONTRACT_ADDRESS,
  contractAbiPath: process.env.CONTRACT_ABI_PATH,
  yookassaSecret: process.env.YOOKASSA_WEBHOOK_SECRET,
  cryptobotSecret: process.env.CRYPTOBOT_WEBHOOK_SECRET,
  poolContractAddress: process.env.CONTRACT_ADDRESS,
  defaultReferralCode: '***...defaultReferralCode...***', // Дефолтный реферальный код
  bitnestApiUrl: '***...bitnestApiUrl...***',
  bitnestWebsiteUrl: '***...bitnestWebsiteUrl...***',
  rpcUrl: "***...rpcUrl...***",
  adminTelegramChatId: "***...adminTelegramChatId...***",
  defaultLinks: {
    presentation_link: '***...presentation_link...***',
    video_link: '***...video_link...***',
    official_link: '***...official_link...***'
  }
};
