const sgMail = require('@sendgrid/mail');
const { createClient } = require('@supabase/supabase-js');

// Инициализация SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Инициализация Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { first_name, last_name, email, birth_date, location, services, specialist } = req.body;

    // Валидация данных
    if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist) {
      return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
    }

    // 1. Сохраняем/обновляем пользователя в Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert(
        {
          first_name,
          last_name,
          email,
          birth_date: new Date(birth_date).toISOString(),
          location
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (userError) throw userError;

    // 2. Сохраняем записи о услугах
    const { error: servicesError } = await supabase
      .from('user_services')
      .insert(
        services.map(service_id => ({
          user_id: user.id,
          service_id: parseInt(service_id),
          specialist_id: parseInt(specialist)
        }))
      );

    if (servicesError) throw servicesError;

    // 3. Отправляем письмо администратору
    const adminEmail = {
      to: process.env.SENDGRID_TO_EMAIL,
      from: process.env.SENDGRID_FROM_EMAIL,
      replyTo: email,
      subject: '🔥 Новая заявка на астрологический разбор',
      html: `
        <h2>Новая заявка</h2>
        <p><strong>Имя:</strong> ${first_name} ${last_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Дата рождения:</strong> ${new Date(birth_date).toLocaleDateString()}</p>
        <p><strong>Место рождения:</strong> ${location}</p>
        <p><strong>Услуги:</strong> ${services.join(', ')}</p>
        <p><strong>Специалист ID:</strong> ${specialist}</p>
        <p><strong>Время заявки:</strong> ${new Date().toLocaleString()}</p>
      `
    };

    // 4. Отправляем подтверждение клиенту
    const clientEmail = {
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Ваша заявка принята',
      html: `
        <h2>Спасибо, ${first_name}!</h2>
        <p>Ваша заявка на астрологический разбор получена.</p>
        <p><strong>Детали:</strong></p>
        <ul>
          <li>Дата: ${new Date().toLocaleDateString()}</li>
          <li>Услуги: ${services.join(', ')}</li>
        </ul>
        <p>Мы свяжемся с вами в течение 24 часов.</p>
      `
    };

    // Отправка обоих писем параллельно
    await Promise.all([
      sgMail.send(adminEmail),
      sgMail.send(clientEmail)
    ]);

    return res.status(200).json({ 
      success: true,
      message: 'Спасибо! Ваша заявка принята.' 
    });

  } catch (error) {
    console.error('Ошибка:', error);
    return res.status(500).json({ 
      success: false,
      message: error.response?.body?.errors?.[0]?.message || 
              error.message || 
              'Ошибка при обработке формы'
    });
  }
};
