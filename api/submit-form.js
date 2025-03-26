// pages/api/submit-astrology.js
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

    // Валидация обязательных полей
    if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist) {
      return res.status(400).json({ message: 'Все поля обязательны для заполнения.' });
    }

    // Преобразование типов
    const servicesArray = services.map(service => parseInt(service, 10));
    const specialistId = parseInt(specialist, 10);

    if (servicesArray.some(isNaN) || isNaN(specialistId)) {
      return res.status(400).json({ message: 'Неверный формат данных для услуг или специалиста.' });
    }

    // Проверка/создание пользователя
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    let user;
    if (existingUser) {
      // Обновляем существующего пользователя
      const { data: updatedUser } = await supabase
        .from('users')
        .update({ first_name, last_name, birth_date, location })
        .eq('id', existingUser.id)
        .select()
        .single();
      user = updatedUser;
    } else {
      // Создаем нового пользователя
      const { data: newUser } = await supabase
        .from('users')
        .insert([{ first_name, last_name, email, birth_date, location }])
        .select()
        .single();
      user = newUser;
    }

    // Создаем записи на услуги
    for (const service_id of servicesArray) {
      await supabase
        .from('appointments')
        .insert([{ user_id: user.id, service_id, specialist_id: specialistId }]);
    }

    return res.status(200).json({ message: 'Спасибо за вашу заявку! Мы свяжемся с вами в ближайшее время.' });
    
  } catch (error) {
    console.error('Ошибка:', error);
    return res.status(500).json({ message: 'Произошла ошибка при обработке формы.' });
  }
}
