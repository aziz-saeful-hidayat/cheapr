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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.get("/booktrackings/", function (req, res) {
  // Retrieve the tag from our URL path
  booktrackings();
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
app.get("/update_booktrackings/", function (req, res) {
  update_booktrackings();
  res.send({ message: "Ok" });
});
app.get("/bsrcluster/:keyword", function (req, res) {
  if (req.keyword) {
    console.log(req.keyword);
    bsrcluster(req.keyword);
  }
  res.send({ message: "Ok" });
});

app.post("/bsr/", function (req, res) {
  const keyword = req.body.keyword;
  if (keyword) {
    console.log(keyword);
    bsrcluster(keyword);
  }
  res.send({ message: "Ok" });
});
// Making Express listen on port 3000
app.listen(process.env.PORT || 3000, function () {
  console.log(`Running on port 3000.`);
});
