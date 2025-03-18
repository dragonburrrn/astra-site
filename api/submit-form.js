import { createClient } from '@supabase/supabase-js';

// Подключение к Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('Supabase URL:', supabaseUrl); // Логируем URL
console.log('Supabase Key:', supabaseKey); // Логируем ключ

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL и Key обязательны!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async (req, res) => {
    if (req.method === 'POST') {
        console.log('Получены данные:', req.body); // Логируем входящие данные

        const { first_name, last_name, email, phone, birth_date, location, services, specialist } = req.body;

        if (!first_name || !last_name || !email || !phone || !birth_date || !location || !services || !specialist) {
            return res.status(400).json({ message: 'Все поля обязательны для заполнения.' });
        }

        try {
            // Проверяем, существует ли пользователь с таким email
            const { data: existingUser, error: existingUserError } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .single();

            if (existingUserError && existingUserError.code !== 'PGRST116') { // Игнорируем ошибку "No rows found"
                console.error('Ошибка при проверке пользователя:', existingUserError);
                throw existingUserError;
            }

            let user;
            if (existingUser) {
                // Пользователь существует, обновляем его данные
                console.log('Пользователь уже существует, обновляем данные:', existingUser);
                const { data: updatedUser, error: updateError } = await supabase
                    .from('users')
                    .update({ first_name, last_name, phone, birth_date, location })
                    .eq('id', existingUser.id)
                    .select()
                    .single();

                if (updateError) {
                    console.error('Ошибка при обновлении пользователя:', updateError);
                    throw updateError;
                }

                user = updatedUser;
            } else {
                // Пользователь не существует, создаем новую запись
                console.log('Вставляем данные пользователя:', { first_name, last_name, email, phone, birth_date, location });
                const { data: newUser, error: insertError } = await supabase
                    .from('users')
                    .insert([{ first_name, last_name, email, phone, birth_date, location }])
                    .select()
                    .single();

                if (insertError) {
                    console.error('Ошибка при вставке пользователя:', insertError);
                    throw insertError;
                }

                user = newUser;
            }

            console.log('Пользователь успешно создан/обновлен:', user);

            // Проверяем, что services является массивом
            if (!services || !Array.isArray(services) || services.length === 0) {
                return res.status(400).json({ message: 'Не выбрано ни одной услуги.' });
            }

            // Сохраняем записи на услуги
            for (const service_id of services) {
                console.log('Вставляем запись на услугу:', { user_id: user.id, service_id, specialist_id: specialist });
                const { error: appointmentError } = await supabase
                    .from('appointments')
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
