import axios from 'axios';

let botToken: string | null = null;
let chatId: string | null = null;

export function configureTelegram(token: string, chat: string) {
  botToken = token;
  chatId = chat;
}

export async function sendTelegramNotification(message: string): Promise<boolean> {
  if (!botToken || !chatId) return false;

  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
    return true;
  } catch (error) {
    console.error('[Telegram] Send error:', error);
    return false;
  }
}

// Predefined notification templates
export async function notifyDeploySuccess(siteName: string, duration: number) {
  await sendTelegramNotification(
    `✅ <b>Деплой успешен</b>\nСайт: ${siteName}\nДлительность: ${duration}с`
  );
}

export async function notifyDeployFailed(siteName: string, error: string) {
  await sendTelegramNotification(
    `❌ <b>Деплой провалился</b>\nСайт: ${siteName}\nОшибка: ${error}`
  );
}

export async function notifySiteDown(siteName: string, domain: string) {
  await sendTelegramNotification(
    `⚠️ <b>Сайт недоступен</b>\nСайт: ${siteName}\nДомен: ${domain}`
  );
}

export async function notifyPanic(switched: number) {
  await sendTelegramNotification(
    `🚨 <b>ПАНИКА!</b>\nПереключено сайтов: ${switched}`
  );
}
