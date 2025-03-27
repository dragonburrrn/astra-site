import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// Инициализация SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Конфигурация уведомлений
const NOTIFICATION_CONFIG = {
  adminEmail: 'your@domain.com', // Замените на ваш email
  fromEmail: 'noreply@yourdomain.com', // Верифицированный email в SendGrid
  adminNotificationTemplate: `
    <h2>🔥 Новая заявка на консультацию</h2>
    <p><strong>ID заявки:</strong> {{orderId}}</p>
    <p><strong>Дата и время:</strong> {{currentDate}}</p>
    <h3>Данные клиента:</h3>
    <p><strong>Имя:</strong> {{firstName}} {{lastName}}</p>
    <p><strong>Email:</strong> <a href="mailto:{{email}}">{{email}}</a></p>
    <p><strong>Дата рождения:</strong> {{birthDate}}</p>
    <p><strong>Место рождения:</strong> {{location}}</p>
    <h3>Детали заявки:</h3>
    <p><strong>Специалист:</strong> {{specialistId}}</p>
    <p><strong>Услуги:</strong> {{services}}</p>
    <p><strong>Ссылка в админку:</strong> <a href="{{adminLink}}">Перейти к заявке</a></p>
  `,
  clientNotificationTemplate: `
    <h2>Спасибо за вашу заявку, {{firstName}}!</h2>
    <p>Мы получили ваш запрос и свяжемся с вами в ближайшее время.</p>
    <h3>Детали заявки:</h3>
    <ul>
      <li><strong>Номер заявки:</strong> {{orderId}}</li>
      <li><strong>Дата:</strong> {{currentDate}}</li>
      <li><strong>Услуги:</strong> {{services}}</li>
    </ul>
    <p>Если у вас есть вопросы, ответьте на это письмо.</p>
  `
};

export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { first_name, last_name, email, birth_date, location, services, specialist } = req.body;

    // Валидация данных
    if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist) {
      return res.status(400).json({ 
        success: false,
        message: 'Все поля обязательны для заполнения' 
      });
    }

    // 1. Создаем запись о пользователе
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        first_name,
        last_name,
        email,
        birth_date: new Date(birth_date).toISOString(),
        location
      })
      .select()
      .single();

    if (userError) throw userError;

    // 2. Создаем записи о назначениях
    const appointmentsData = services.map(service_id => ({
      user_id: user.id,
      service_id,
      specialist_id: specialist,
      status: 'new',
      created_at: new Date().toISOString()
    }));

    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .insert(appointmentsData)
      .select();

    if (appointmentsError) throw appointmentsError;

    // Генерируем ID заявки (можно использовать первый appointment ID)
    const orderId = appointments[0].id;
    const currentDate = new Date().toLocaleString();
    const adminLink = `${process.env.ADMIN_PANEL_URL}/orders/${orderId}`;

    // 3. Подготовка данных для писем
    const emailData = {
      orderId,
      firstName: first_name,
      lastName: last_name,
      email,
      birthDate: new Date(birth_date).toLocaleDateString(),
      location,
      specialistId: specialist,
      services: services.join(', '),
      currentDate,
      adminLink
    };

    // 4. Отправка уведомления администратору
    const adminMsg = {
      to: NOTIFICATION_CONFIG.adminEmail,
      from: NOTIFICATION_CONFIG.fromEmail,
      replyTo: email,
      subject: `Новая заявка #${orderId} от ${first_name} ${last_name}`,
      html: renderTemplate(NOTIFICATION_CONFIG.adminNotificationTemplate, emailData),
      mail_settings: {
        sandbox_mode: {
          enable: process.env.NODE_ENV === 'test' // Включить для тестов
        }
      }
    };

    // 5. Отправка подтверждения клиенту
    const clientMsg = {
      to: email,
      from: NOTIFICATION_CONFIG.fromEmail,
      subject: `Ваша заявка #${orderId} принята`,
      html: renderTemplate(NOTIFICATION_CONFIG.clientNotificationTemplate, emailData)
    };

    // 6. Отправка писем с обработкой ошибок
    const [adminResult, clientResult] = await Promise.allSettled([
      sgMail.send(adminMsg),
      sgMail.send(clientMsg)
    ]);

    // Логирование результатов
    logEmailResult(adminResult, 'Admin notification');
    logEmailResult(clientResult, 'Client confirmation');

    return res.status(200).json({ 
      success: true,
      orderId,
      message: 'Заявка успешно создана. Проверьте вашу почту для подтверждения.' 
    });

  } catch (error) {
    console.error('Ошибка обработки заявки:', error);
    
    // Отправка уведомления об ошибке администратору
    sendErrorNotification(error, req.body);

    return res.status(500).json({ 
      success: false,
      message: 'Произошла ошибка при обработке заявки',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
}

// Вспомогательные функции

function renderTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
}

function logEmailResult(result, emailType) {
  if (result.status === 'fulfilled') {
    console.log(`${emailType} sent successfully`, result.value[0].headers);
  } else {
    console.error(`Error sending ${emailType}:`, result.reason);
    if (result.reason.response) {
      console.error('SendGrid response:', result.reason.response.body);
    }
  }
}

async function sendErrorNotification(error, formData) {
  try {
    await sgMail.send({
      to: NOTIFICATION_CONFIG.adminEmail,
      from: NOTIFICATION_CONFIG.fromEmail,
      subject: '🚨 Ошибка при обработке заявки',
      html: `
        <h2>Произошла ошибка при обработке заявки</h2>
        <p><strong>Ошибка:</strong> ${error.message}</p>
        <p><strong>Время:</strong> ${new Date().toLocaleString()}</p>
        <h3>Данные формы:</h3>
        <pre>${JSON.stringify(formData, null, 2)}</pre>
      `
    });
  } catch (emailError) {
    console.error('Не удалось отправить уведомление об ошибке:', emailError);
  }
}
