import { createClient } from '@supabase/supabase-js';

// Подключение к Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey);

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL и Key обязательны!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async (req, res) => {
    if (req.method === 'POST') {
        console.log('Получены данные:', req.body);

        const { first_name, last_name, email, birth_date, location, services, specialist, agree } = req.body;

        // Проверка обязательных полей
        if (!first_name || !last_name || !email || !birth_date || !location || !services || !specialist || !agree) {
            return res.status(400).json({ message: 'Все поля обязательны для заполнения.' });
        }

        try {
            // Преобразуем services и specialist в числа
            const servicesArray = Array.isArray(services) 
                ? services.map(service => parseInt(service, 10))
                : [parseInt(services, 10)];
            const specialistId = parseInt(specialist, 10);

            // Проверяем, что services и specialist являются числами
            if (servicesArray.some(isNaN) || isNaN(specialistId)) {
                return res.status(400).json({ message: 'Неверный формат данных для услуг или специалиста.' });
            }

            // Проверяем согласие на обработку данных
            if (agree !== 'on') {
                return res.status(400).json({ message: 'Необходимо дать согласие на обработку персональных данных.' });
            }

            // Проверяем, существует ли пользователь с таким email
            const { data: existingUser, error: existingUserError } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .single();

            if (existingUserError && existingUserError.code !== 'PGRST116') {
                console.error('Ошибка при проверке пользователя:', existingUserError);
                throw existingUserError;
            }

            let user;
            if (existingUser) {
                // Пользователь существует, обновляем его данные
                const { data: updatedUser, error: updateError } = await supabase
                    .from('users')
                    .update({ first_name, last_name, birth_date, location })
                    .eq('id', existingUser.id)
                    .select()
                    .single();

                if (updateError) throw updateError;
                user = updatedUser;
            } else {
                // Пользователь не существует, создаем новую запись
                const { data: newUser, error: insertError } = await supabase
                    .from('users')
                    .insert([{ first_name, last_name, email, birth_date, location }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                user = newUser;
            }

            // Проверяем, что services является массивом
            if (!servicesArray || servicesArray.length === 0) {
                return res.status(400).json({ message: 'Не выбрано ни одной услуги.' });
            }

            // Сохраняем записи на услуги
            for (const service_id of servicesArray) {
                const { error: appointmentError } = await supabase
                    .from('appointments')
                    .insert([{ 
                        user_id: user.id, 
                        service_id, 
                        specialist_id: specialistId,
                        status: 'pending'
                    }]);

                if (appointmentError) throw appointmentError;
            }

            // Отправляем успешный ответ
            res.status(200).json({ 
                success: true,
                message: 'Спасибо за вашу заявку! Мы свяжемся с вами в ближайшее время.' 
            });
        } catch (error) {
            console.error('Ошибка:', error);
            res.status(500).json({ 
                success: false,
                message: 'Произошла ошибка при обработке формы.' 
            });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).json({ message: `Метод ${req.method} не поддерживается` });
    }
};
