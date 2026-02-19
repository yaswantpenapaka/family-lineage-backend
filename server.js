require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

app.use(cors());
app.use(express.json());

/* Database connection */

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true }
});

/* Cloudinary config */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "family_profiles"
  }
});

const upload = multer({ storage });

/* LOGIN */

app.post("/login", async (req, res) => {

  const { firstname, surname, privateKey } = req.body;

  if (privateKey !== process.env.PRIVATE_KEY)
    return res.status(401).json({ error: "Invalid private key" });

  const [rows] = await db.execute(
    "SELECT * FROM persons WHERE firstname=? AND surname=?",
    [firstname, surname]
  );

  if (rows.length === 0)
    return res.status(404).json({ error: "User not found" });

  res.json(rows[0]);
});

/* CREATE PROFILE */

app.post("/persons", upload.single("photo"), async (req, res) => {

  const id = uuidv4();

  const {
    firstname,
    surname,
    dob,
    father_id,
    mother_id,
    spouse_id,
    created_by
  } = req.body;

  const photo = req.file ? req.file.path : null;

  await db.execute(
    `INSERT INTO persons 
     (id, firstname, surname, dob, profile_pic, father_id, mother_id, spouse_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, firstname, surname, dob, photo, father_id, mother_id, spouse_id, created_by]
  );

  res.json({ message: "Profile created", id });
});

/* GET ALL PERSONS */

app.get("/persons", async (req, res) => {

  const [rows] = await db.execute("SELECT * FROM persons");

  res.json(rows);
});

/* GET SINGLE PERSON */

app.get("/persons/:id", async (req, res) => {

  const [rows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [req.params.id]
  );

  res.json(rows[0]);
});

/* UPDATE PROFILE */

app.put("/persons/:id", upload.single("photo"), async (req, res) => {

  const { firstname, surname, dob, instagram } = req.body;

  let photo = req.file ? req.file.path : null;

  if (photo)
    await db.execute(
      `UPDATE persons SET firstname=?, surname=?, dob=?, instagram=?, profile_pic=? WHERE id=?`,
      [firstname, surname, dob, instagram, photo, req.params.id]
    );
  else
    await db.execute(
      `UPDATE persons SET firstname=?, surname=?, dob=?, instagram=? WHERE id=?`,
      [firstname, surname, dob, instagram, req.params.id]
    );

  res.json({ message: "Updated" });
});

/* START SERVER */

app.listen(process.env.PORT, () =>
  console.log("Server running on port", process.env.PORT)
);