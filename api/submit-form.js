import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { first_name, last_name, email, birth_date, location, services, specialist } = req.body;

    // Валидация
    if (!first_name || !email) {
      return res.status(400).json({ message: 'Имя и email обязательны' });
    }

    // 1. Сохраняем в Supabase
    const { data: user, error: dbError } = await supabase
      .from('users')
      .insert({
        first_name,
        last_name,
        email,
        birth_date: birth_date ? new Date(birth_date).toISOString() : null,
        location,
        services,
        specialist
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 2. Отправляем уведомление в ваш Telegram
    const telegramMessage = `
      🚀 *Новый клиент*
      ├ *Имя*: ${first_name} ${last_name}
      ├ *Email*: ${email}
      ├ *Дата рождения*: ${birth_date ? new Date(birth_date).toLocaleDateString() : 'не указана'}
      ├ *Локация*: ${location || 'не указана'}
      ├ *Услуги*: ${services.join(', ')}
      └ *Специалист*: ${specialist}
    `.replace(/^ +/gm, '');

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_YOUR_CHAT_ID,
          text: telegramMessage,
          parse_mode: 'Markdown'
        })
      }
    );

    const result = await telegramResponse.json();
    if (!result.ok) throw new Error('Telegram send failed');

    return res.status(200).json({ 
      success: true,
      message: 'Спасибо! Мы скоро с вами свяжемся.' 
    });

  } catch (error) {
    console.error('Ошибка:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Ошибка при обработке заявки'
    });
  }
}
