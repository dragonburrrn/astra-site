import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Метод не поддерживается' });
  }

  try {
    const { first_name, last_name, email, birth_date, location, services, specialist } = req.body;
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// Инициализация SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { first_name, last_name, email, birth_date, location, services, specialist } = req.body;

    // Валидация данных
    if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist) {
      throw new Error('Все поля обязательны для заполнения');
    }

    // 1. Сохраняем данные в Supabase
    const { data: user, error: supabaseError } = await supabase
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

    if (supabaseError) throw supabaseError;

    // 2. Сохраняем информацию о выбранных услугах
    const { error: servicesError } = await supabase
      .from('user_services')
      .insert(
        services.map(service_id => ({
          user_id: user.id,
          service_id,
          specialist_id: specialist
        }))
      );

    if (servicesError) throw servicesError;

    // 3. Отправляем письмо администратору
    const adminMsg = {
      to: process.env.SENDGRID_TO_EMAIL,
      from: process.env.SENDGRID_FROM_EMAIL,
      replyTo: email, // Ответы пойдут клиенту
      subject: '🔥 Новая заявка на астрологический разбор',
      html: `
        <h2>Новый клиент запросил консультацию</h2>
        <p><strong>Имя:</strong> ${first_name} ${last_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Дата рождения:</strong> ${new Date(birth_date).toLocaleDateString()}</p>
        <p><strong>Место рождения:</strong> ${location}</p>
        <p><strong>Выбранный специалист ID:</strong> ${specialist}</p>
        <p><strong>Запрошенные услуги:</strong> ${services.join(', ')}</p>
        <p><strong>Время заявки:</strong> ${new Date().toLocaleString()}</p>
        <br>
        <p>Не забудьте связаться с клиентом в течение 24 часов!</p>
      `,
    };

    // 4. Отправляем подтверждение клиенту
    const clientMsg = {
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Ваша заявка принята',
      html: `
        <h2>Спасибо за вашу заявку, ${first_name}!</h2>
        <p>Мы получили ваш запрос на астрологический разбор и свяжемся с вами в ближайшее время.</p>
        <p><strong>Детали заявки:</strong></p>
        <ul>
          <li>Дата: ${new Date().toLocaleDateString()}</li>
          <li>Услуги: ${services.join(', ')}</li>
        </ul>
        <p>С уважением,<br>Команда Astra</p>
      `,
    };

    await Promise.all([
      sgMail.send(adminMsg),
      sgMail.send(clientMsg)
    ]);

    return res.status(200).json({ 
      success: true,
      message: 'Спасибо! Ваша заявка принята. Мы свяжемся с вами в ближайшее время.' 
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.response?.body?.errors?.[0]?.message || 
              error.message || 
              'Произошла ошибка при обработке формы' 
    });
  }
}
    // Валидация
    if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist) {
      return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
    }

    // Проверка/создание пользователя
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      const { data: newUser, error: newUserError } = await supabase
        .from('users')
        .insert([{ 
          first_name, 
          last_name, 
          email, 
          birth_date, 
          location 
        }])
        .select()
        .single();
      
      if (newUserError) throw newUserError;
      user = newUser;
    }

    // Создание записей на услуги
    for (const service_id of services) {
      const { error: appointmentError } = await supabase
        .from('appointments')
        .insert([{
          user_id: user.id,
          service_id: parseInt(service_id),
          specialist_id: parseInt(specialist)
        }]);
      
      if (appointmentError) throw appointmentError;
    }

    return res.status(200).json({ 
      message: 'Спасибо! Ваша заявка принята. Мы свяжемся с вами в ближайшее время.' 
    });

  } catch (error) {
    console.error('Ошибка:', error);
    return res.status(500).json({ 
      message: error.message || 'Произошла ошибка при обработке формы' 
    });
  }
}
