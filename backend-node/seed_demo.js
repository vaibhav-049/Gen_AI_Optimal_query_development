const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Ensure we create a fresh database
if (fs.existsSync('./demo.sqlite')) {
    fs.unlinkSync('./demo.sqlite');
}

const db = new sqlite3.Database('./demo.sqlite');

db.serialize(() => {
    // --- 1. Create Tables ---
    console.log("Creating tables...");
    
    db.run(`CREATE TABLE departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT
    )`);

    db.run(`CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER,
        department_id INTEGER,
        enrollment_date DATE,
        FOREIGN KEY (department_id) REFERENCES departments(id)
    )`);

    db.run(`CREATE TABLE courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_name TEXT NOT NULL,
        credits INTEGER,
        department_id INTEGER,
        FOREIGN KEY (department_id) REFERENCES departments(id)
    )`);

    db.run(`CREATE TABLE enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        course_id INTEGER,
        marks INTEGER,
        grade TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (course_id) REFERENCES courses(id)
    )`);

    // --- 2. Insert Dummy Data ---
    console.log("Inserting dummy data...");

    // Departments
    const depts = [
        ['Computer Science', 'Building A'],
        ['Mechanical', 'Building B'],
        ['Electrical', 'Building C']
    ];
    const stmtDept = db.prepare(`INSERT INTO departments (name, location) VALUES (?, ?)`);
    depts.forEach(d => stmtDept.run(d));
    stmtDept.finalize();

    // Students
    const students = [
        ['Alice Sharma', 'alice@test.com', 20, 1, '2025-01-10'],
        ['Bob Verma', 'bob@test.com', 21, 1, '2024-08-15'],
        ['Charlie Gupta', 'charlie@test.com', 22, 2, '2023-09-01'],
        ['David Lee', 'david@test.com', 19, 3, '2025-02-20'],
        ['Eve Patel', 'eve@test.com', 23, 1, '2022-07-11']
    ];
    const stmtStudent = db.prepare(`INSERT INTO students (name, email, age, department_id, enrollment_date) VALUES (?, ?, ?, ?, ?)`);
    students.forEach(s => stmtStudent.run(s));
    stmtStudent.finalize();

    // Courses
    const courses = [
        ['Data Structures', 4, 1],
        ['Algorithms', 4, 1],
        ['Thermodynamics', 3, 2],
        ['Circuits', 3, 3],
        ['Machine Learning', 4, 1]
    ];
    const stmtCourse = db.prepare(`INSERT INTO courses (course_name, credits, department_id) VALUES (?, ?, ?)`);
    courses.forEach(c => stmtCourse.run(c));
    stmtCourse.finalize();

    // Enrollments
    const enrollments = [
        [1, 1, 85, 'A'], // Alice in DS
        [1, 2, 92, 'A+'], // Alice in Algo
        [2, 1, 75, 'B'], // Bob in DS
        [2, 5, 88, 'A'], // Bob in ML
        [3, 3, 60, 'C'], // Charlie in Thermo
        [4, 4, 95, 'A+'], // David in Circuits
        [5, 5, 45, 'F']  // Eve in ML
    ];
    const stmtEnroll = db.prepare(`INSERT INTO enrollments (student_id, course_id, marks, grade) VALUES (?, ?, ?, ?)`);
    enrollments.forEach(e => stmtEnroll.run(e));
    stmtEnroll.finalize();

    console.log("Database demo.sqlite seeded successfully with rich relationships!");
});

db.close();
