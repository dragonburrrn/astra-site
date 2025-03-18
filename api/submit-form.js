import { createClient } from '@supabase/supabase-js';

// Подключение к Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async (req, res) => {
    if (req.method === 'POST') {
        console.log('Получены данные:', req.body); // Логируем входящие данные

        const { first_name, last_name, email, phone, birth_date, location, services, specialist } = req.body;

        try {
            // Сохраняем данные пользователя
            console.log('Вставляем данные пользователя:', { first_name, last_name, email, phone, birth_date, location });
            const { data: user, error: userError } = await supabase
                .from('astra_users')
                .insert([{ first_name, last_name, email, phone, birth_date, location }], { returning: 'representation' })
                .single();

            if (userError) {
                console.error('Ошибка при вставке пользователя:', userError);
                throw userError;
            }

            console.log('Пользователь успешно создан:', user);

            // Сохраняем записи на услуги
            for (const service_id of services) {
                console.log('Вставляем запись на услугу:', { user_id: user.id, service_id, specialist_id: specialist });
                const { error: appointmentError } = await supabase
                    .from('astra_appointments')
                    .insert([{ user_id: user.id, service_id, specialist_id: specialist }]);

                if (appointmentError) {
                    console.error('Ошибка при вставке записи:', appointmentError);
                    throw appointmentError;
                }
            }

            // Отправляем успешный ответ
            res.status(200).json({ message: 'Спасибо за вашу заявку! Мы свяжемся с вами в ближайшее время.' });
        } catch (error) {
            console.error('Ошибка:', error);
            res.status(500).json({ message: 'Произошла ошибка при обработке формы.' });
        }
    } else {
        res.status(405).json({ message: 'Метод не поддерживается' });
    }
};
