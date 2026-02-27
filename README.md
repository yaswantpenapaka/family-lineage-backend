# 🧬 Family Lineage Management System – Backend

🔗 **Frontend Repository:**  
👉https://github.com/yaswantpenapaka/family_lineage_frontend

---

## 🚀 Overview

This repository contains the backend API for the **Family Lineage Management System**, a full-stack genealogy management platform that dynamically visualizes multi-generational family relationships.

The backend is built using **Node.js, Express.js, and TiDB (MySQL-compatible)** and provides RESTful APIs for managing family members, relationships, and event reminders.

---

## 🏗 Architecture

- **Backend Framework:** Node.js + Express.js
- **Database:** TiDB Cloud (MySQL-compatible)
- **ORM/Driver:** MySQL2 (Promise-based)
- **Image Storage:** Cloudinary
- **Deployment:** Render
- **Authentication Logic:** Role-based access control (ADMIN / MEMBER)
- **Database Design:** Normalized schema using:
  - `persons`
  - `parent_child`
  - `marriages`

---

## 📌 Key Features

✔ RESTful API design  
✔ Role-based profile editing  
✔ Recursive hierarchical family modeling  
✔ Parent-child & marriage relationship handling  
✔ Duplicate prevention via DB constraints  
✔ Upcoming birthday & anniversary computation (3-month rolling window)  
✔ Cloud image upload via Multer + Cloudinary  
✔ Connection pooling for production stability  

---

## 📂 API Endpoints (Sample)

| Method | Endpoint | Description |
|--------|----------|------------|
| GET | `/persons` | Fetch full family data |
| GET | `/persons/:id` | Fetch single profile |
| PUT | `/persons/:id` | Update profile |
| POST | `/add-child/:id` | Add child |
| POST | `/add-father/:id` | Add father |
| POST | `/add-spouse/:id` | Add married partner |
| GET | `/upcoming-events` | Fetch upcoming birthdays/anniversaries |

---

## 🛠 Setup Instructions

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_BACKEND_REPO
cd backend
npm install
