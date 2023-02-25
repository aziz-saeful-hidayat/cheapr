const express = require("express"); // Adding Express
const bodyParser = require("body-parser");

var path = require("path");
const cors = require("cors");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const {
  sellerAmazon,
  walmart,
  commision,
  allnew,
  checker,
  checker2,
  trackings,
  update_trackings,
  ebay,
} = require("./automate");
const { adorama } = require("./adorama");
const { barcodesinc } = require("./barcodesinc");
const { bhphotovideo } = require("./bhphotovideo");
const { allnewcluster } = require("./allnewcluster");
const { googleshopping } = require("./googleshopping");
const { gshopping } = require("./gshopping");
const { fedex } = require("./fedex");
const { ups } = require("./ups");
const { bsrcluster } = require("./bsrcluster");

const app = express(); // Initializing Express
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

const csvFTCWriter = createCsvWriter({
  path: "out.csv",
  header: [{ id: "Company_Phone_Number", title: "Company_Phone_Number" }],
});
const oldProxyUrl = process.env.PROXY_SERVER;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36";

app.use(cors());
app.use("/static", express.static(path.join(__dirname, "public")));

app.get("/amazon/", function (req, res) {
  sellerAmazon();
  res.send({ result: "Amazon Automation started" });
});

app.get("/walmart/", function (req, res) {
  walmart();
  res.send({ result: "Walmart Automation started" });
});

app.get("/commision/", function (req, res) {
  commision();
  res.send({ result: "Walmart Automation started" });
});

app.get("/bhphotovideo/", function (req, res) {
  bhphotovideo();
  res.send({ result: "bhphotovideo Automation started" });
});

app.get("/adorama/", function (req, res) {
  adorama();
  res.send({ result: "adorama Automation started" });
});

app.get("/barcodesinc/", function (req, res) {
  barcodesinc();
  res.send({ result: "barcodesinc Automation started" });
});

// Route to return all araticles with a given tag
app.get("/all/", function (req, res) {
  // Retrieve the tag from our URL path
  allnew();
  res.send({ message: "Ok" });
});

app.post("/allnewcluster/", (req, res) => {
  console.log("Got body:", req.body);
  allnewcluster(req.body.data);
  res.send({ message: "Ok" });
});
app.get("/googleshopping/", function (req, res) {
  // Retrieve the tag from our URL path
  googleshopping(["Xerox W110"]);
  res.send({ message: "Ok" });
});
app.get("/gshopping/", function (req, res) {
  // Retrieve the tag from our URL path
  gshopping();
  res.send({ message: "Ok" });
});
app.get("/checker/", function (req, res) {
  // Retrieve the tag from our URL path
  checker();
  res.send({ message: "Ok" });
});
app.get("/checker2/", function (req, res) {
  // Retrieve the tag from our URL path
  checker2();
  res.send({ message: "Ok" });
});

app.get("/fedex/", function (req, res) {
  // Retrieve the tag from our URL path
  fedex();
  res.send({ message: "Ok" });
});
app.get("/ups/", function (req, res) {
  // Retrieve the tag from our URL path
  ups();
  res.send({ message: "Ok" });
});
app.get("/trackings/", function (req, res) {
  // Retrieve the tag from our URL path
  trackings();
  res.send({ message: "Ok" });
});
app.get("/ebay/", function (req, res) {
  ebay();
  res.send({ message: "Ok" });
});

app.get("/update_trackings/", function (req, res) {
  update_trackings();
  res.send({ message: "Ok" });
});

app.get("/bsrcluster/", function (req, res) {
  let zebra_list = [
    "https://www.amazon.com/02000BK08345-Zebra-1476ft-Ribbon-1-inch/dp/B00EPMYDUW/",
    "https://www.amazon.com/02000BK08345-Zebra-1476ft-Ribbon-1-inch/dp/B00EPN2NAI/",
    "https://www.amazon.com/05095GS06407-Thermal-Transfer-Ribbon-Performance/dp/B001PB2FXI/",
    "https://www.amazon.com/05095GS06407-Zebra-244ft-Ribbon-0-5-inch/dp/B0141M03FE/",
    "https://www.amazon.com/05095GS11007-Thermal-Transfer-Ribbon-Performance/dp/B001HOUCS8/",
    "https://www.amazon.com/10008512-ZEBRA-Z-ULT-2000T-WHITE/dp/B017O2FU6K/",
    "https://www.amazon.com/10010051-CASE-Z-Select-Direct-Thermal-Labels/dp/B00540NOHM/",
    "https://www.amazon.com/10010053-2-25in-Direct-Thermal-Z-Select/dp/B00E2TXZZW/",
    "https://www.amazon.com/10015340-Zebra-Z-Select-4000d-Paper/dp/B017O304JM/",
    "https://www.amazon.com/102-801-00200-Desktop-Thermal-Transfer-Monochrome/dp/B00HGUZQHY/",
    "https://www.amazon.com/102-801-00200-Desktop-Thermal-Transfer-Monochrome/dp/B08156GS8C/",
    "https://www.amazon.com/103-801-00200-Thermal-Transfer-Printer-Monochrome/dp/B09QRM8DC6/",
    "https://www.amazon.com/10500-2001-0030-THERMAL-BARCODE-PRINTER-NETWORK/dp/B008O67W08/",
    "https://www.amazon.com/10500-2001-1000-1050020011000-A64E507-203DPI-4-09IN/dp/B000H34Y3O/",
    "https://www.amazon.com/105SL-printer-direct-thermal-transfer/dp/B00308WCQO/",
    "https://www.amazon.com/110PAX4-Printhead-203dpi-G57202-1M-Renewed/dp/B0BT8JR8QH/",
    "https://www.amazon.com/110Xi4-Direct-Thermal-Transfer-Printer/dp/B00FJWE14A/",
    "https://www.amazon.com/110Xi4-Network-Thermal-Printer-116-801-00201/dp/B09T3QVCYK/",
    "https://www.amazon.com/110XiIII-Thermal-Printer-Parallel-Interfaces/dp/B0BVBZNG8G/",
    "https://www.amazon.com/112-701-00200-11270100200-Printer-Monochrome-Thermal/dp/B001APQ2F6/",
    "https://www.amazon.com/112-741-00000-Barcode-Thermal-Printer-200DPI/dp/B00VVS5DDO/",
    "https://www.amazon.com/113-801-00200-Tabletop-Printer-Parallel-Monochrome/dp/B07VWKQ8BS/",
    "https://www.amazon.com/12Pk-5319-Perform-Ribbon-Printers/dp/B0141MLV3M/",
    "https://www.amazon.com/140Xi4-PRINTER-TABLETOP-PARALLEL-INTERNAL/dp/B00NMXA5EI/",
    "https://www.amazon.com/170PAX4-Thermal-Label-Printer/dp/B0044ZMXC0/",
    "https://www.amazon.com/170Xi-III-Thermal-Barcode-170-741-00000-Parallel/dp/B082QNB946/",
    "https://www.amazon.com/170Xi4-Barcode-Printer-172-851-00200-Renewed/dp/B08SGF3Z5P/",
  ];
  bsrcluster("zebra printer");
  res.send({ message: "Ok" });
});
// Making Express listen on port 3000
app.listen(process.env.PORT || 3000, function () {
  console.log(`Running on port 3000.`);
});
