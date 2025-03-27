import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // Set CORS headers
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

    // Validate data
    if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist) {
      return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
    }

    // 1. Save user data to Supabase
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

    // 2. Save service information
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

    // 3. Send email to admin
    const adminMsg = {
      to: process.env.SENDGRID_TO_EMAIL,
      from: process.env.SENDGRID_FROM_EMAIL,
      replyTo: email,
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

    // 4. Send confirmation to client
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
