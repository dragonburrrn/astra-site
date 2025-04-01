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
    const errors = [];
    if (!first_name) errors.push('Имя обязательно');
    if (!email) errors.push('Email обязателен');
    if (!Array.isArray(services) errors.push('Услуги должны быть массивом');
    if (!specialist) errors.push('Специалист обязателен');
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: errors.join(', ') 
      });
    }

    // 1. Сохраняем пользователя
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        first_name,
        last_name: last_name || null,
        email,
        birth_date: birth_date ? new Date(birth_date).toISOString() : null,
        location: location || null
      })
      .select()
      .single();

    if (userError) throw userError;

    // 2. Сохраняем услуги
    const { error: appointmentsError } = await supabase
      .from('appointments')
      .insert(
        services.map(service_id => ({
          user_id: user.id,
          service_id,
          specialist_id: specialist
        }))
      );

    if (appointmentsError) throw appointmentsError;

    // 3. Отправка в Telegram (с улучшенной обработкой)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const telegramMessage = `
          🚀 <b>Новая заявка</b>
          👤 <b>Имя:</b> ${first_name}${last_name ? ' ' + last_name : ''}
          ✉️ <b>Email:</b> ${email}
          ${birth_date ? `🎂 <b>Дата рождения:</b> ${new Date(birth_date).toLocaleDateString()}\n` : ''}
          ${location ? `📍 <b>Локация:</b> ${location}\n` : ''}
          🛠 <b>Услуги:</b> ${services.join(', ')}
          👩‍⚕️ <b>Специалист:</b> ${specialist}
        `.trim();

        const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: telegramMessage,
            parse_mode: 'HTML'
          })
        });

        const result = await response.json();
        
        if (!result.ok) {
          console.error('Telegram API Error:', result);
          throw new Error(result.description || 'Ошибка Telegram API');
        }

        console.log('Сообщение отправлено в Telegram:', result.result.message_id);
      } catch (tgError) {
        console.error('Ошибка отправки в Telegram:', tgError);
        // Не прерываем выполнение, только логируем
      }
    } else {
      console.warn('Переменные Telegram не настроены, пропускаем отправку');
    }

    return res.status(200).json({ 
      success: true,
      message: 'Спасибо! Мы скоро с вами свяжемся.' 
    });

  } catch (error) {
    console.error('Ошибка обработки:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Ошибка при обработке заявки',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
}
