#!/bin/bash

# Скрипт для сброса и применения всех миграций в Railway PostgreSQL

echo "🔄 Подключение к Railway PostgreSQL..."

# Подключаемся к базе данных и выполняем команды
railway connect Postgres <<EOF
-- Удаляем все таблицы
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Создаём расширение pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Выходим
\q
EOF

echo "✅ База данных очищена и расширение pg_trgm создано"
echo "🚀 Применяем миграции..."

# Применяем все миграции
railway run npx prisma migrate deploy

echo "✅ Все миграции применены!"
