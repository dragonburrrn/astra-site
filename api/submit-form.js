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

    // Валидация с проверкой массива services
    if (!first_name || !email) {
      return res.status(400).json({ 
        success: false,
        message: 'Имя и email обязательны' 
      });
    }

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо выбрать хотя бы одну услугу'
      });
    }

    if (!specialist) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать специалиста'
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

    // 2. Подготовка данных для appointments
    const appointmentsToInsert = services
      .filter(service => service) // Фильтрация null/undefined
      .map(service_id => ({
        user_id: user.id,
        service_id,
        specialist_id: specialist
      }));

    if (appointmentsToInsert.length === 0) {
      throw new Error('Нет валидных услуг для сохранения');
    }

    // 3. Сохраняем услуги
    const { error: appointmentsError } = await supabase
      .from('appointments')
      .insert(appointmentsToInsert);

    if (appointmentsError) throw appointmentsError;

    // 4. Формируем сообщение для Telegram
    const telegramMessage = `
      🚀 Новый клиент
      Имя: ${first_name}${last_name ? ' ' + last_name : ''}
      Email: ${email}
      ${birth_date ? `Дата рождения: ${new Date(birth_date).toLocaleDateString()}\n` : ''}
      ${location ? `Локация: ${location}\n` : ''}
      Услуги: ${services.join(', ')}
      Специалист: ${specialist}
    `.trim();

    // 5. Отправляем в Telegram
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const telegramResponse = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: telegramMessage
          })
        });

        const telegramResult = await telegramResponse.json();
        if (!telegramResult.ok) {
          console.error('Ошибка Telegram:', telegramResult);
        }
      } catch (tgError) {
        console.error('Ошибка отправки в Telegram:', tgError);
      }
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
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        stack: error.stack 
      })
    });
  }
}
