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

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
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
});

/* ================= GET PERSON ================= */

app.get("/persons/:id", async (req, res) => {

  const id = req.params.id;

  const [rows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [id]
  );

  if (!rows.length)
    return res.status(404).json({ error: "Not found" });

  res.json(rows[0]);
});

/* ================= GET TREE DATA ================= */

app.get("/persons", async (req, res) => {

  const [persons] = await db.execute("SELECT * FROM persons");
  const [relations] = await db.execute("SELECT * FROM parent_child");
  const [marriages] = await db.execute("SELECT * FROM marriages");

  res.json({ persons, relations, marriages });
});

/* ================= PERMISSION CHECK ================= */

async function canEdit(editorId, targetId) {

  const [editorRows] = await db.execute(
    "SELECT * FROM persons WHERE id=?",
    [editorId]
  );

  if (!editorRows.length) return false;
  const editor = editorRows[0];

  if (editor.role === "ADMIN") return true;
  if (editorId === targetId) return true;

  // parents of editor
  const [parents] = await db.execute(
    "SELECT parent_id FROM parent_child WHERE child_id=?",
    [editorId]
  );

  if (parents.some(p => p.parent_id === targetId))
    return true;

  // children of editor
  const [children] = await db.execute(
    "SELECT child_id FROM parent_child WHERE parent_id=?",
    [editorId]
  );

  if (children.some(c => c.child_id === targetId))
    return true;

  // spouse
  const [spouse] = await db.execute(
    `SELECT * FROM marriages 
     WHERE (person1_id=? AND person2_id=?)
     OR (person1_id=? AND person2_id=?)`,
    [editorId, targetId, targetId, editorId]
  );

  if (spouse.length) return true;

  return false;
}

/* ================= UPDATE PROFILE ================= */

app.put("/persons/:id", upload.single("photo"), async (req, res) => {

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
});

/* ================= ADD FATHER ================= */

app.post("/add-father/:id", async (req, res) => {

  const childId = req.params.id;
  const { firstname, surname, dob } = req.body;

  const fatherId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender) VALUES (?, ?, ?, ?, 'Male')",
    [fatherId, firstname, surname, dob]
  );

  await db.execute(
    "INSERT INTO parent_child VALUES (?, ?)",
    [fatherId, childId]
  );

  res.json({ success: true });
});

/* ================= ADD SIBLING ================= */

app.post("/add-sibling/:id", async (req, res) => {

  const personId = req.params.id;

  const [parents] = await db.execute(
    "SELECT parent_id FROM parent_child WHERE child_id=?",
    [personId]
  );

  if (!parents.length)
    return res.status(400).json({ error: "Parents required" });

  const { firstname, surname, dob, gender } = req.body;
  const siblingId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender) VALUES (?, ?, ?, ?, ?)",
    [siblingId, firstname, surname, dob, gender]
  );

  for (let p of parents) {
    await db.execute(
      "INSERT INTO parent_child VALUES (?, ?)",
      [p.parent_id, siblingId]
    );
  }

  res.json({ success: true });
});

/* ================= ADD SPOUSE ================= */

app.post("/add-spouse/:id", async (req, res) => {

  const personId = req.params.id;

  const { firstname, surname, dob, gender } = req.body;

  const spouseId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender, married) VALUES (?, ?, ?, ?, ?, 1)",
    [spouseId, firstname, surname, dob, gender]
  );

  await db.execute(
    "INSERT INTO marriages VALUES (?, ?, ?, NULL)",
    [uuidv4(), personId, spouseId]
  );

  await db.execute(
    "UPDATE persons SET married=1 WHERE id IN (?, ?)",
    [personId, spouseId]
  );

  res.json({ success: true });
});

/* ================= ADD CHILD ================= */

app.post("/add-child/:id", async (req, res) => {

  const parentId = req.params.id;

  const { firstname, surname, dob, gender } = req.body;
  const childId = uuidv4();

  await db.execute(
    "INSERT INTO persons (id, firstname, surname, dob, gender) VALUES (?, ?, ?, ?, ?)",
    [childId, firstname, surname, dob, gender]
  );

  await db.execute(
    "INSERT INTO parent_child VALUES (?, ?)",
    [parentId, childId]
  );

  // also add spouse as parent if married
  const [marriage] = await db.execute(
    "SELECT * FROM marriages WHERE person1_id=? OR person2_id=?",
    [parentId, parentId]
  );

  if (marriage.length) {
    const m = marriage[0];
    const spouseId =
      m.person1_id === parentId
        ? m.person2_id
        : m.person1_id;

    await db.execute(
      "INSERT INTO parent_child VALUES (?, ?)",
      [spouseId, childId]
    );
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on", PORT)
);
