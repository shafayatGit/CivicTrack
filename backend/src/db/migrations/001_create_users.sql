-- Create database
CREATE DATABASE IF NOT EXISTS civictrack;

USE civictrack;

-- Users table
CREATE TABLE
  IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM ('user', 'stuff', 'admin') NOT NULL DEFAULT 'user',
    phone VARCHAR(20) DEFAULT NULL,
    profile_image VARCHAR(500) DEFAULT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )