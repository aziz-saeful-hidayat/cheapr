const express = require("express"); // Adding Express
var path = require("path");
const creds = require(path.resolve(__dirname, "./cm-automation.json")); // the file saved above
const { GoogleSpreadsheet } = require("google-spreadsheet");
const jsdom = require("jsdom");
const axios = require("axios");
const cors = require("cors");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const randomUseragent = require("random-useragent");
const proxyChain = require("proxy-chain");
const csvParser = require("csv-parser");
const needle = require("needle");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");
const {
  sellerAmazon,
  walmart,
  sellerAmazonCH,
  bhphotovideo,
  adorama,
  barcodesinc,
  commision,
} = require("./automate");
const { checkip, checkdomain, checkMX } = require("./utils");
const { binance } = require("./scripts/binance");

const app = express(); // Initializing Express

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

app.get("/amazon_ch/", function (req, res) {
  sellerAmazonCH();
  res.send({ result: "Amazon CH Automation started" });
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
// Making Express listen on port 7000
app.listen(process.env.PORT || 3000, function () {
  console.log(`Running on port 3000.`);
});
