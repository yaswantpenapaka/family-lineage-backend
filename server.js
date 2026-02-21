require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

/* Middleware */

app.use(cors());
app.use(express.json());

/* Database Connection */

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true
  },
  connectionLimit: 10
});

/* Cloudinary Config */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* Multer Storage */

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "family_profiles",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

/* Health Check Route */

app.get("/", (req, res) => {
  res.json({ status: "Family Lineage API Running" });
});

/* LOGIN */

app.post("/login", async (req, res) => {
  try {
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

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* CREATE PROFILE */

app.post("/persons", upload.single("photo"), async (req, res) => {
  try {
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

    if (!firstname || !surname || !dob)
      return res.status(400).json({
        error: "firstname, surname and dob required"
      });

    const photo = req.file ? req.file.path : null;

    await db.execute(
      `INSERT INTO persons 
      (id, firstname, surname, dob, profile_pic, father_id, mother_id, spouse_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        firstname,
        surname,
        dob,
        photo,
        father_id || null,
        mother_id || null,
        spouse_id || null,
        created_by || null
      ]
    );

    res.json({
      success: true,
      message: "Profile created",
      id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Insert failed" });
  }
});

/* GET ALL PERSONS */

app.get("/persons", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM persons");
    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET SINGLE PERSON */

app.get("/persons/:id", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM persons WHERE id=?",
      [req.params.id]
    );

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* UPDATE PERSON */
app.put("/persons/:id", async (req, res) => {

  try {

    const {
      firstname,
      surname,
      dob,
      gender,
      instagram,
      anniversary,
      profile_pic
    } = req.body;

    await db.execute(
      `UPDATE persons SET
       firstname = ?,
       surname = ?,
       dob = ?,
       gender = ?,
       instagram = ?,
       anniversary = ?,
       profile_pic = ?
       WHERE id = ?`,
      [
        firstname,
        surname,
        dob,
        gender,
        instagram,
        anniversary,
        profile_pic,
        req.params.id
      ]
    );

    res.json({ success: true });

  } catch (err) {

    console.error(err);

    res.status(500).json({ error: err.message });

  }

});

/* SERVER START */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
