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

#[derive(Debug, Serialize, Deserialize)]
pub struct PracticeSheet {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub is_completed: bool,
    pub is_redo_ready: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PracticeQuestion {
    pub id: String,
    pub practice_sheet_id: String,
    pub question_text: String,
    pub options: Vec<String>,
    pub correct_answer: String,
    pub question_order: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PracticeAttempt {
    pub id: String,
    pub practice_sheet_id: String,
    pub user_answers: Vec<String>,
    pub score: i32,
    pub total_questions: i32,
    pub completed_at: DateTime<Utc>,
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

        // Create practice_sheets table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS practice_sheets (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                is_completed BOOLEAN NOT NULL DEFAULT 0,
                is_redo_ready BOOLEAN NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        // Create practice_questions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS practice_questions (
                id TEXT PRIMARY KEY,
                practice_sheet_id TEXT NOT NULL,
                question_text TEXT NOT NULL,
                options TEXT NOT NULL,
                correct_answer TEXT NOT NULL,
                question_order INTEGER NOT NULL,
                FOREIGN KEY(practice_sheet_id) REFERENCES practice_sheets(id)
            )",
            [],
        )?;

        // Create practice_attempts table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS practice_attempts (
                id TEXT PRIMARY KEY,
                practice_sheet_id TEXT NOT NULL,
                user_answers TEXT NOT NULL,
                score INTEGER NOT NULL,
                total_questions INTEGER NOT NULL,
                completed_at TEXT NOT NULL,
                FOREIGN KEY(practice_sheet_id) REFERENCES practice_sheets(id)
            )",
            [],
        )?;

        // Create index for better query performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_practice_questions_sheet_id ON practice_questions(practice_sheet_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_practice_attempts_sheet_id ON practice_attempts(practice_sheet_id)",
            [],
        )?;

        // Handle schema migrations for existing databases
        self.migrate_database_schema()?;
        self.fix_user_datetime_data()?;

        Ok(())
    }

    fn migrate_database_schema(&self) -> Result<()> {
        // Check if practice_sheets table has the new columns
        let mut has_is_completed = false;
        let mut has_is_redo_ready = false;
        
        // Get table info to check for columns
        let mut stmt = self.conn.prepare("PRAGMA table_info(practice_sheets)")?;
        let column_info = stmt.query_map([], |row| {
            let column_name: String = row.get(1)?;
            Ok(column_name)
        })?;
        
        for column_result in column_info {
            if let Ok(column_name) = column_result {
                if column_name == "is_completed" {
                    has_is_completed = true;
                }
                if column_name == "is_redo_ready" {
                    has_is_redo_ready = true;
                }
            }
        }
        
        // Add missing columns if they don't exist
        if !has_is_completed {
            self.conn.execute(
                "ALTER TABLE practice_sheets ADD COLUMN is_completed BOOLEAN NOT NULL DEFAULT 0",
                [],
            )?;
        }
        
        if !has_is_redo_ready {
            self.conn.execute(
                "ALTER TABLE practice_sheets ADD COLUMN is_redo_ready BOOLEAN NOT NULL DEFAULT 0",
                [],
            )?;
        }
        
        Ok(())
    }

    fn fix_user_datetime_data(&self) -> Result<()> {
        // Check if users table exists and has data that needs fixing
        let mut stmt = self.conn.prepare("SELECT id, created_at, updated_at FROM users")?;
        let user_rows: Vec<(String, String, String)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        
        let now = Utc::now().to_rfc3339();
        
        for (user_id, created_at_str, updated_at_str) in user_rows {
            let mut needs_update = false;
            let mut new_created_at = created_at_str.clone();
            let mut new_updated_at = updated_at_str.clone();
            
            // Check if created_at is valid RFC3339
            if DateTime::parse_from_rfc3339(&created_at_str).is_err() {
                new_created_at = now.clone();
                needs_update = true;
            }
            
            // Check if updated_at is valid RFC3339
            if DateTime::parse_from_rfc3339(&updated_at_str).is_err() {
                new_updated_at = now.clone();
                needs_update = true;
            }
            
            if needs_update {
                self.conn.execute(
                    "UPDATE users SET created_at = ?1, updated_at = ?2 WHERE id = ?3",
                    params![new_created_at, new_updated_at, user_id],
                )?;
            }
        }
        
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
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Create new user only if doesn't exist
                let now = Utc::now();
                self.conn.execute(
                    "INSERT INTO users (id, memory_content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![user_id, "", now.to_rfc3339(), now.to_rfc3339()],
                )?;
                self.get_user(user_id)
            }
            Err(e) => Err(e), // Pass through other errors
        }
    }

    pub fn get_user(&self, user_id: &str) -> Result<User> {
        let mut stmt = self.conn.prepare(
            "SELECT id, memory_content, created_at, updated_at FROM users WHERE id = ?1"
        )?;

        let user = stmt.query_row([user_id], |row| {
            let created_at_str: String = row.get(2)?;
            let updated_at_str: String = row.get(3)?;
            
            // Try to parse datetime strings, use current time as fallback for invalid data
            let now = Utc::now();
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or(now);
            let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or(now);
            
            Ok(User {
                id: row.get(0)?,
                memory_content: row.get(1)?,
                created_at,
                updated_at,
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

    // Practice sheet management methods
    pub fn create_practice_sheet(&self, session_id: &str, title: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        
        self.conn.execute(
            "INSERT INTO practice_sheets (id, session_id, title, is_completed, is_redo_ready, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, session_id, title, false, false, now.to_rfc3339()],
        )?;
        
        Ok(id)
    }

    pub fn add_practice_question(
        &self,
        practice_sheet_id: &str,
        question_text: &str,
        options: &Vec<String>,
        correct_answer: &str,
        question_order: i32,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let options_json = serde_json::to_string(options)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        
        self.conn.execute(
            "INSERT INTO practice_questions (id, practice_sheet_id, question_text, options, correct_answer, question_order) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, practice_sheet_id, question_text, options_json, correct_answer, question_order],
        )?;
        
        Ok(id)
    }

    pub fn get_all_practice_sheets(&self) -> Result<Vec<PracticeSheet>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, title, is_completed, is_redo_ready, created_at FROM practice_sheets ORDER BY created_at DESC"
        )?;

        let sheet_iter = stmt.query_map([], |row| {
            let created_at_str: String = row.get(5)?;
            
            Ok(PracticeSheet {
                id: row.get(0)?,
                session_id: row.get(1)?,
                title: row.get(2)?,
                is_completed: row.get(3)?,
                is_redo_ready: row.get(4)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(5, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;

        let mut sheets = Vec::new();
        for sheet in sheet_iter {
            sheets.push(sheet?);
        }
        Ok(sheets)
    }

    pub fn get_practice_sheet_questions(&self, practice_sheet_id: &str) -> Result<Vec<PracticeQuestion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, practice_sheet_id, question_text, options, correct_answer, question_order 
             FROM practice_questions WHERE practice_sheet_id = ?1 ORDER BY question_order ASC"
        )?;

        let question_iter = stmt.query_map([practice_sheet_id], |row| {
            let options_json: String = row.get(3)?;
            let options: Vec<String> = serde_json::from_str(&options_json)
                .map_err(|_| rusqlite::Error::InvalidColumnType(3, "options".to_string(), rusqlite::types::Type::Text))?;
            
            Ok(PracticeQuestion {
                id: row.get(0)?,
                practice_sheet_id: row.get(1)?,
                question_text: row.get(2)?,
                options,
                correct_answer: row.get(4)?,
                question_order: row.get(5)?,
            })
        })?;

        let mut questions = Vec::new();
        for question in question_iter {
            questions.push(question?);
        }
        Ok(questions)
    }

    // Practice attempt management methods
    pub fn create_practice_attempt(
        &self,
        practice_sheet_id: &str,
        user_answers: &Vec<String>,
        score: i32,
        total_questions: i32,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        let answers_json = serde_json::to_string(user_answers)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        
        self.conn.execute(
            "INSERT INTO practice_attempts (id, practice_sheet_id, user_answers, score, total_questions, completed_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, practice_sheet_id, answers_json, score, total_questions, now.to_rfc3339()],
        )?;
        
        Ok(id)
    }

    pub fn mark_practice_sheet_completed(&self, practice_sheet_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sheets SET is_completed = ?1 WHERE id = ?2",
            params![true, practice_sheet_id],
        )?;
        Ok(())
    }

    pub fn mark_practice_sheet_redo_ready(&self, practice_sheet_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sheets SET is_redo_ready = ?1 WHERE id = ?2",
            params![true, practice_sheet_id],
        )?;
        Ok(())
    }

    pub fn get_practice_attempt(&self, practice_sheet_id: &str) -> Result<Option<PracticeAttempt>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, practice_sheet_id, user_answers, score, total_questions, completed_at 
             FROM practice_attempts WHERE practice_sheet_id = ?1 ORDER BY completed_at DESC LIMIT 1"
        )?;

        let attempt = stmt.query_row([practice_sheet_id], |row| {
            let completed_at_str: String = row.get(5)?;
            let answers_json: String = row.get(2)?;
            let user_answers: Vec<String> = serde_json::from_str(&answers_json)
                .map_err(|_| rusqlite::Error::InvalidColumnType(2, "user_answers".to_string(), rusqlite::types::Type::Text))?;
            
            Ok(PracticeAttempt {
                id: row.get(0)?,
                practice_sheet_id: row.get(1)?,
                user_answers,
                score: row.get(3)?,
                total_questions: row.get(4)?,
                completed_at: DateTime::parse_from_rfc3339(&completed_at_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(5, "completed_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        });

        match attempt {
            Ok(a) => Ok(Some(a)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn replace_practice_sheet_questions(
        &self,
        practice_sheet_id: &str,
        new_questions: &Vec<crate::practice_sheet::QuizQuestion>,
    ) -> Result<()> {
        // Start transaction
        let tx = self.conn.unchecked_transaction()?;
        
        // Delete existing questions
        tx.execute(
            "DELETE FROM practice_questions WHERE practice_sheet_id = ?1",
            params![practice_sheet_id],
        )?;
        
        // Add new questions
        for (index, question) in new_questions.iter().enumerate() {
            let id = uuid::Uuid::new_v4().to_string();
            let options_json = serde_json::to_string(&question.options)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
            
            tx.execute(
                "INSERT INTO practice_questions (id, practice_sheet_id, question_text, options, correct_answer, question_order) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, practice_sheet_id, question.question_text, options_json, question.correct_answer, (index + 1) as i32],
            )?;
        }
        
        // Commit transaction
        tx.commit()?;
        Ok(())
    }

    // Helper function to update or insert practice sheet results in memory
    fn update_practice_sheet_in_memory(&self, user_id: &str, sheet_title: &str, new_content: &str) -> Result<()> {
        let current_user = self.get_or_create_user(user_id)?;
        let full_memory = current_user.memory_content;
        
        // Check if this practice sheet already exists in memory
        let sheet_marker = format!("Practice Sheet: {}", sheet_title);
        
        if let Some(start_pos) = full_memory.find(&sheet_marker) {
            // Find the end of this practice sheet entry
            let after_start = &full_memory[start_pos..];
            
            // Look for the next "Practice Sheet:" or "Session name:" or end of string
            let end_pos = if let Some(next_sheet_pos) = after_start[1..].find("Practice Sheet: ") {
                start_pos + 1 + next_sheet_pos
            } else if let Some(next_session_pos) = after_start[1..].find("Session name: ") {
                start_pos + 1 + next_session_pos
            } else {
                full_memory.len()
            };
            
            // Replace the existing entry
            let updated_memory = format!(
                "{}{}{}",
                &full_memory[..start_pos],
                new_content,
                if end_pos < full_memory.len() { 
                    format!("\n{}", &full_memory[end_pos..])
                } else { 
                    String::new() 
                }
            );
            
            let now = Utc::now();
            self.conn.execute(
                "UPDATE users SET memory_content = ?1, updated_at = ?2 WHERE id = ?3",
                params![updated_memory.trim(), now.to_rfc3339(), user_id],
            )?;
        } else {
            // Practice sheet doesn't exist in memory, append it
            self.append_to_memory(user_id, new_content)?;
        }
        
        Ok(())
    }

    // Memory storage for practice results
    pub fn store_practice_results_to_memory(
        &self,
        practice_sheet_id: &str,
        user_id: &str,
    ) -> Result<()> {
        // Get practice sheet info
        let mut stmt = self.conn.prepare(
            "SELECT title FROM practice_sheets WHERE id = ?1"
        )?;
        let sheet_title: String = stmt.query_row([practice_sheet_id], |row| {
            Ok(row.get(0)?)
        })?;

        // Get the practice attempt
        let attempt = self.get_practice_attempt(practice_sheet_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;

        // Get the questions and correct answers
        let questions = self.get_practice_sheet_questions(practice_sheet_id)?;

        // Format the results for memory
        let mut memory_content = format!(
            "Practice Sheet: {}\nDate: {}\nScore: {}/{}\n",
            sheet_title,
            attempt.completed_at.format("%Y-%m-%d %H:%M:%S"),
            attempt.score,
            attempt.total_questions
        );

        // Add incorrect answers details
        let mut has_incorrect = false;
        for (index, question) in questions.iter().enumerate() {
            if index < attempt.user_answers.len() {
                let user_answer = &attempt.user_answers[index];
                if user_answer != &question.correct_answer {
                    if !has_incorrect {
                        memory_content.push_str("Incorrect Answers:\n");
                        has_incorrect = true;
                    }
                    memory_content.push_str(&format!(
                        "- Question: {}\n  Your answer: {}\n  Correct answer: {}\n",
                        question.question_text,
                        user_answer,
                        question.correct_answer
                    ));
                }
            }
        }

        if !has_incorrect {
            memory_content.push_str("Perfect score! All answers correct.\n");
        }

        memory_content.push_str("Redo Available: Yes\n");

        // Update or insert practice sheet results in memory
        self.update_practice_sheet_in_memory(user_id, &sheet_title, &memory_content)?;

        Ok(())
    }

    pub fn get_practice_sheet_title(&self, practice_sheet_id: &str) -> Result<String> {
        let mut stmt = self.conn.prepare("SELECT title FROM practice_sheets WHERE id = ?1")?;
        let title: String = stmt.query_row([practice_sheet_id], |row| {
            Ok(row.get(0)?)
        })?;
        Ok(title)
    }

    // Get practice sheet specific memory content for redo generation
    pub fn get_practice_sheet_specific_memory(&self, practice_sheet_id: &str, user_id: &str) -> Result<String> {
        // Get the practice sheet title to identify it in memory
        let sheet_title = self.get_practice_sheet_title(practice_sheet_id)?;
        
        // Get full memory content
        let full_memory = self.get_memory_content(user_id)?;
        
        // Extract only the section related to this specific practice sheet
        let mut specific_memory = String::new();
        let lines: Vec<&str> = full_memory.lines().collect();
        let mut in_target_section = false;
        let mut current_section_lines = Vec::new();
        
        for line in lines {
            if line.starts_with("Practice Sheet: ") {
                // If we were collecting a previous section, save it if it matches our target
                if in_target_section && !current_section_lines.is_empty() {
                    specific_memory = current_section_lines.join("\n");
                    break;
                }
                
                // Start new section
                current_section_lines.clear();
                in_target_section = line == format!("Practice Sheet: {}", sheet_title);
                current_section_lines.push(line);
            } else if in_target_section {
                current_section_lines.push(line);
                // Stop collecting when we reach the end marker
                if line == "Redo Available: Yes" {
                    specific_memory = current_section_lines.join("\n");
                    break;
                }
            }
        }
        
        // If we didn't find the specific practice sheet, fall back to getting it directly from database
        if specific_memory.is_empty() {
            println!("Warning: Could not find specific memory for practice sheet '{}', generating from database", sheet_title);
            return self.get_practice_sheet_memory_from_database(practice_sheet_id);
        }
        
        Ok(specific_memory)
    }

    // Generate practice sheet memory content directly from database (fallback)
    fn get_practice_sheet_memory_from_database(&self, practice_sheet_id: &str) -> Result<String> {
        // Get practice sheet info
        let mut stmt = self.conn.prepare(
            "SELECT title FROM practice_sheets WHERE id = ?1"
        )?;
        let sheet_title: String = stmt.query_row([practice_sheet_id], |row| {
            Ok(row.get(0)?)
        })?;

        // Get the practice attempt
        let attempt = self.get_practice_attempt(practice_sheet_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;

        // Get the questions and correct answers
        let questions = self.get_practice_sheet_questions(practice_sheet_id)?;

        // Format the results for memory (same logic as store_practice_results_to_memory)
        let mut memory_content = format!(
            "Practice Sheet: {}\nDate: {}\nScore: {}/{}\n",
            sheet_title,
            attempt.completed_at.format("%Y-%m-%d %H:%M:%S"),
            attempt.score,
            attempt.total_questions
        );

        // Add incorrect answers details
        let mut has_incorrect = false;
        for (index, question) in questions.iter().enumerate() {
            if index < attempt.user_answers.len() {
                let user_answer = &attempt.user_answers[index];
                if user_answer != &question.correct_answer {
                    if !has_incorrect {
                        memory_content.push_str("Incorrect Answers:\n");
                        has_incorrect = true;
                    }
                    memory_content.push_str(&format!(
                        "- Question: {}\n  Your answer: {}\n  Correct answer: {}\n",
                        question.question_text,
                        user_answer,
                        question.correct_answer
                    ));
                }
            }
        }

        if !has_incorrect {
            memory_content.push_str("Perfect score! All answers correct.\n");
        }

        memory_content.push_str("Redo Available: Yes");

        Ok(memory_content)
    }

}