use rusqlite::{Connection, Result, params};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use dirs;

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String, // "user" or "assistant"
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub memory_content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path();
        
        // Ensure the directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to create database directory: {}", e))
                )
            })?;
        }

        let conn = Connection::open(&db_path)?;
        let database = Database { conn };
        database.initialize_tables()?;
        Ok(database)
    }

    fn get_db_path() -> PathBuf {
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("project-r");
        path.push("sessions.db");
        path
    }

    fn initialize_tables(&self) -> Result<()> {
        // Create sessions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // Create messages table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        // Create users table for memory storage
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                memory_content TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // Create index for better query performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
            [],
        )?;

        Ok(())
    }

    pub fn create_session(&self, id: &str, title: &str) -> Result<()> {
        let now = Utc::now();
        self.conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, now.to_rfc3339(), now.to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn get_all_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        )?;

        let session_iter = stmt.query_map([], |row| {
            let created_at_str: String = row.get(2)?;
            let updated_at_str: String = row.get(3)?;
            
            Ok(Session {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(2, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(3, "updated_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;

        let mut sessions = Vec::new();
        for session in session_iter {
            sessions.push(session?);
        }
        Ok(sessions)
    }

    pub fn get_session_messages(&self, session_id: &str) -> Result<Vec<Message>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, role, content, created_at FROM messages 
             WHERE session_id = ?1 ORDER BY created_at ASC"
        )?;

        let message_iter = stmt.query_map([session_id], |row| {
            let created_at_str: String = row.get(4)?;
            
            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(4, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;

        let mut messages = Vec::new();
        for message in message_iter {
            messages.push(message?);
        }
        Ok(messages)
    }

    pub fn add_message(&self, session_id: &str, role: &str, content: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        
        self.conn.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, role, content, now.to_rfc3339()],
        )?;

        // Update session's updated_at timestamp
        self.conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![now.to_rfc3339(), session_id],
        )?;

        Ok(id)
    }

    pub fn update_session_title(&self, session_id: &str, title: &str) -> Result<()> {
        let now = Utc::now();
        self.conn.execute(
            "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now.to_rfc3339(), session_id],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        // Delete messages first (foreign key constraint)
        self.conn.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            params![session_id],
        )?;

        // Delete session
        self.conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![session_id],
        )?;

        Ok(())
    }

    // Memory management methods
    pub fn get_or_create_user(&self, user_id: &str) -> Result<User> {
        // Try to get existing user
        match self.get_user(user_id) {
            Ok(user) => Ok(user),
            Err(_) => {
                // Create new user if doesn't exist
                let now = Utc::now();
                self.conn.execute(
                    "INSERT INTO users (id, memory_content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![user_id, "", now.to_rfc3339(), now.to_rfc3339()],
                )?;
                self.get_user(user_id)
            }
        }
    }

    pub fn get_user(&self, user_id: &str) -> Result<User> {
        let mut stmt = self.conn.prepare(
            "SELECT id, memory_content, created_at, updated_at FROM users WHERE id = ?1"
        )?;

        let user = stmt.query_row([user_id], |row| {
            let created_at_str: String = row.get(2)?;
            let updated_at_str: String = row.get(3)?;
            
            Ok(User {
                id: row.get(0)?,
                memory_content: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(2, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(3, "updated_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;

        Ok(user)
    }

    pub fn append_to_memory(&self, user_id: &str, content: &str) -> Result<()> {
        let now = Utc::now();
        
        // Get current memory content
        let current_user = self.get_or_create_user(user_id)?;
        
        // Append new content with proper formatting
        let new_memory_content = if current_user.memory_content.is_empty() {
            format!("{}\n", content)
        } else {
            format!("{}\n{}\n", current_user.memory_content, content)
        };
        
        self.conn.execute(
            "UPDATE users SET memory_content = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_memory_content, now.to_rfc3339(), user_id],
        )?;

        Ok(())
    }

    pub fn get_memory_content(&self, user_id: &str) -> Result<String> {
        let user = self.get_or_create_user(user_id)?;
        Ok(user.memory_content)
    }
}