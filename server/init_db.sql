-- Script de inicialização do banco de dados PostgreSQL
-- Execute como usuário postgres (sem senha)

-- Conecte-se ao PostgreSQL
psql -U postgres

-- Criar banco de dados
CREATE DATABASE rat_db;

-- Conectar ao banco rat_db
\c rat_db

-- As tabelas serão criadas automaticamente pelo SQLAlchemy
