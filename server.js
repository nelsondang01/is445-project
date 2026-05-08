const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("./db");

const app = express();
const upload = multer({ dest: "uploads/" });

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  res.render("index");
});

app.get("/customers", async (req, res) => {

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM customer"
  );

  res.render("customers", {
    customers: [],
    count: countResult.rows[0].count,
    message: "",
    search: {}
  });

});

app.post("/customers/search", async (req, res) => {

  const {
    cusId,
    cusFname,
    cusLname,
    cusState,
    cusSalesYTD,
    cusSalesPrev
  } = req.body;

  let sql = "SELECT * FROM customer WHERE 1=1";

  let values = [];

  if (cusId) {
    values.push(cusId);
    sql += ` AND cusId = $${values.length}`;
  }

  if (cusFname) {
    values.push(`%${cusFname}%`);
    sql += ` AND LOWER(cusFname) LIKE LOWER($${values.length})`;
  }

  if (cusLname) {
    values.push(`%${cusLname}%`);
    sql += ` AND LOWER(cusLname) LIKE LOWER($${values.length})`;
  }

  if (cusState) {
    values.push(cusState);
    sql += ` AND LOWER(cusState) = LOWER($${values.length})`;
  }

  if (cusSalesYTD) {
    values.push(cusSalesYTD);
    sql += ` AND cusSalesYTD = $${values.length}`;
  }

  if (cusSalesPrev) {
    values.push(cusSalesPrev);
    sql += ` AND cusSalesPrev = $${values.length}`;
  }

  sql += " ORDER BY cusId";

  const customersResult = await pool.query(sql, values);

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM customer"
  );

  res.render("customers", {
    customers: customersResult.rows,
    count: countResult.rows[0].count,
    message:
      customersResult.rows.length === 0
        ? "No records were found."
        : "",
    search: req.body
  });

});

app.get("/customers/edit/:id", async (req, res) => {

  const result = await pool.query(
    "SELECT * FROM customer WHERE cusId = $1",
    [req.params.id]
  );

  res.render("editCustomer", {
    customer: result.rows[0],
    message: ""
  });

});

app.post("/customers/edit/:id", async (req, res) => {

  const {
    cusFname,
    cusLname,
    cusState,
    cusSalesYTD,
    cusSalesPrev
  } = req.body;

  if (!cusFname || !cusLname) {

    return res.render("editCustomer", {

      customer: {
        cusid: req.params.id,
        cusfname: cusFname,
        cuslname: cusLname,
        cusstate: cusState,
        cussalesytd: cusSalesYTD,
        cussalesprev: cusSalesPrev
      },

      message: "First name and last name are required."

    });

  }

  await pool.query(

    `UPDATE customer
     SET cusFname = $1,
         cusLname = $2,
         cusState = $3,
         cusSalesYTD = $4,
         cusSalesPrev = $5
     WHERE cusId = $6`,

    [
      cusFname,
      cusLname,
      cusState,
      cusSalesYTD || 0,
      cusSalesPrev || 0,
      req.params.id
    ]

  );

  const result = await pool.query(
    "SELECT * FROM customer WHERE cusId = $1",
    [req.params.id]
  );

  res.render("editCustomer", {
    customer: result.rows[0],
    message: "Customer updated successfully."
  });

});

app.get("/import", async (req, res) => {

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM customer"
  );

  res.render("import", {
    count: countResult.rows[0].count,
    message: "",
    summary: null
  });

});

app.post("/import", upload.single("customerFile"), async (req, res) => {

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM customer"
  );

  if (!req.file) {

    return res.render("import", {
      count: countResult.rows[0].count,
      message: "Please choose a file.",
      summary: null
    });

  }

  const fileData = fs.readFileSync(
    req.file.path,
    "utf8"
  );

  const lines = fileData.trim().split("\n");

  let processed = 0;
  let inserted = 0;
  let notInserted = 0;
  let errors = [];

  for (let line of lines) {

    processed++;

    const [
      cusId,
      cusFname,
      cusLname,
      cusState,
      cusSalesYTD,
      cusSalesPrev
    ] = line.split(",");

    try {

      await pool.query(

        `INSERT INTO customer
         (cusId,
          cusFname,
          cusLname,
          cusState,
          cusSalesYTD,
          cusSalesPrev)

         VALUES ($1, $2, $3, $4, $5, $6)`,

        [
          cusId,
          cusFname,
          cusLname,
          cusState,
          cusSalesYTD,
          cusSalesPrev
        ]

      );

      inserted++;

    } catch (err) {

      notInserted++;

      errors.push(
        `Customer ID ${cusId}: ${err.message}`
      );

    }

  }

  fs.unlinkSync(req.file.path);

  const newCountResult = await pool.query(
    "SELECT COUNT(*) FROM customer"
  );

  res.render("import", {

    count: newCountResult.rows[0].count,

    message: "Import completed.",

    summary: {
      processed,
      inserted,
      notInserted,
      errors
    }

  });

});

app.get("/export", async (req, res) => {

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM customer"
  );

  res.render("export", {
    count: countResult.rows[0].count
  });

});

app.get("/export/download", async (req, res) => {

  const filename =
    req.query.filename || "export.txt";

  try {

    const result = await pool.query(`

      SELECT
        cusId,
        cusFname,
        cusLname,
        cusState,
        cusSalesYTD::numeric AS cusSalesYTD,
        cusSalesPrev::numeric AS cusSalesPrev

      FROM customer

      ORDER BY cusId

    `);

    let data = "";

    result.rows.forEach(customer => {

      data +=
        `${customer.cusid},` +
        `${customer.cusfname},` +
        `${customer.cuslname},` +
        `${customer.cusstate},` +
        `${customer.cussalesytd},` +
        `${customer.cussalesprev}\n`;

    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}`
    );

    res.setHeader(
      "Content-Type",
      "text/plain"
    );

    res.send(data);

  } catch (err) {

    console.log(err);

    res.send("Export error");

  }

});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});