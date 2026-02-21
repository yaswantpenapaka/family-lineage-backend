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

/* ---------------- DATABASE ---------------- */

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true },
  connectionLimit: 10
});

/* ---------------- CLOUDINARY ---------------- */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "family_profiles",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

/* ---------------- LOGIN ---------------- */

app.post("/login", async (req, res) => {
  try {
    const { firstname, surname, privateKey } = req.body;

    if (privateKey !== process.env.PRIVATE_KEY)
      return res.status(401).json({ error: "Invalid private key" });

    const [rows] = await db.execute(
      "SELECT * FROM persons WHERE firstname=? AND surname=?",
      [firstname, surname]
    );

    if (!rows.length)
      return res.status(404).json({ error: "User not found" });

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

/* ---------------- GET PERSONS ---------------- */

app.get("/persons", async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM persons");
  res.json(rows);
});

app.get("/persons/:id", async (req, res) => {
  const [rows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [req.params.id]
  );
  if (!rows.length)
    return res.status(404).json({ error: "Not found" });

  res.json(rows[0]);
});

/* ---------------- PERMISSION CHECK ---------------- */

async function canEdit(editorId, targetId) {

  const [editRows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [editorId]
  );

  if (!editRows.length) return false;

  const editor = editRows[0];

  if (editor.role === "ADMIN") return true;

  const [targetRows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [targetId]
  );

  if (!targetRows.length) return false;

  const target = targetRows[0];

  if (editor.id === target.id) return true;

  if (target.id === editor.father_id ||
      target.id === editor.mother_id) return true;

  if (target.id === editor.spouse_id) return true;

  if (target.father_id === editor.id ||
      target.mother_id === editor.id) return true;

  return false;
}

/* ---------------- UPDATE PROFILE ---------------- */

app.put("/persons/:id", upload.single("photo"), async (req, res) => {

  try {

    const editorId = req.headers["userid"];
    const targetId = req.params.id;

    if (!(await canEdit(editorId, targetId)))
      return res.status(403).json({ error: "Permission denied" });

    const {
      firstname,
      surname,
      dob,
      gender,
      instagram,
      anniversary,
      married
    } = req.body;

    const photo = req.file ? req.file.path : null;

    await db.execute(
      `UPDATE persons SET
        firstname = COALESCE(?, firstname),
        surname = COALESCE(?, surname),
        dob = COALESCE(?, dob),
        gender = COALESCE(?, gender),
        instagram = COALESCE(?, instagram),
        anniversary = COALESCE(?, anniversary),
        married = COALESCE(?, married),
        profile_pic = COALESCE(?, profile_pic)
      WHERE id=?`,
      [
        firstname || null,
        surname || null,
        dob || null,
        gender || null,
        instagram || null,
        anniversary || null,
        married || null,
        photo,
        targetId
      ]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

/* ---------------- ADD FATHER ---------------- */

app.post("/add-father/:id", async (req, res) => {

  const childId = req.params.id;
  const { firstname, surname, dob } = req.body;

  const fatherId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender) VALUES (?, ?, ?, ?, 'Male')",
    [fatherId, firstname, surname, dob]
  );

  await db.execute(
    "UPDATE persons SET father_id=? WHERE id=?",
    [fatherId, childId]
  );

  res.json({ success: true });
});

/* ---------------- ADD MOTHER ---------------- */

app.post("/add-mother/:id", async (req, res) => {

  const childId = req.params.id;
  const { firstname, surname, dob } = req.body;

  const motherId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender) VALUES (?, ?, ?, ?, 'Female')",
    [motherId, firstname, surname, dob]
  );

  await db.execute(
    "UPDATE persons SET mother_id=? WHERE id=?",
    [motherId, childId]
  );

  res.json({ success: true });
});

/* ---------------- ADD SPOUSE ---------------- */

app.post("/add-spouse/:id", async (req, res) => {

  const personId = req.params.id;

  const [rows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [personId]
  );

  const person = rows[0];

  if (person.married == 1)
    return res.status(400).json({ error: "Already married" });

  const { firstname, surname, dob, gender } = req.body;

  const spouseId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender, married) VALUES (?, ?, ?, ?, ?, 1)",
    [spouseId, firstname, surname, dob, gender]
  );

  await db.execute(
    "UPDATE persons SET spouse_id=?, married=1 WHERE id=?",
    [spouseId, personId]
  );

  await db.execute(
    "UPDATE persons SET spouse_id=?, married=1 WHERE id=?",
    [personId, spouseId]
  );

  res.json({ success: true });
});

/* ---------------- ADD CHILD ---------------- */

app.post("/add-child/:id", async (req, res) => {

  const parentId = req.params.id;

  const [rows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [parentId]
  );

  const parent = rows[0];

  if (parent.married != 1)
    return res.status(400).json({ error: "Must be married to add child" });

  const { firstname, surname, dob, gender } = req.body;

  const childId = uuidv4();

  let father_id = null;
  let mother_id = null;

  if (parent.gender === "Male") {
    father_id = parent.id;
    mother_id = parent.spouse_id;
  } else {
    mother_id = parent.id;
    father_id = parent.spouse_id;
  }

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender, father_id, mother_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [childId, firstname, surname, dob, gender, father_id, mother_id]
  );

  res.json({ success: true });
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
