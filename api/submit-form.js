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
    if (!first_name || !email || !services || !specialist) {
      return res.status(400).json({ message: 'Обязательные поля: имя, email, услуги и специалист' });
    }

    // 1. Сохраняем пользователя в таблицу users
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        first_name,
        last_name,
        email,
        birth_date: birth_date ? new Date(birth_date).toISOString() : null,
        location
      })
      .select()
      .single();

    if (userError) throw userError;

    // 2. Сохраняем услуги в таблицу appointments
    const appointmentsData = services.map(service_id => ({
      user_id: user.id,
      service_id,
      specialist_id: specialist,
      created_at: new Date().toISOString()
    }));

    const { error: appointmentsError } = await supabase
      .from('appointments')
      .insert(appointmentsData);

    if (appointmentsError) throw appointmentsError;

    // 3. Получаем названия услуг для Telegram-уведомления
    // (Предполагаем, что у вас есть таблица services с id и name)
    const { data: servicesData } = await supabase
      .from('services')
      .select('name')
      .in('id', services);

    const serviceNames = servicesData.map(s => s.name).join(', ');

    // 4. Отправляем уведомление в Telegram
    const telegramMessage = `
      🚀 *Новый клиент*
      ├ *Имя*: ${first_name} ${last_name}
      ├ *Email*: ${email}
      ├ *Дата рождения*: ${birth_date ? new Date(birth_date).toLocaleDateString() : 'не указана'}
      ├ *Локация*: ${location || 'не указана'}
      ├ *Услуги*: ${serviceNames}
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
      message: 'Ошибка при обработке заявки',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}
