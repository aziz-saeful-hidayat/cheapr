var path = require("path");
const creds = require(path.resolve(__dirname, "../cm-automation.json")); // the file saved above
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { retry } = require("../utils");
const nodemailer = require("nodemailer");
const csvParser = require("csv-parser");
const needle = require("needle");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const cstOptions = {
  timeZone: "CST",
  dateStyle: "medium",
  timeStyle: "long",
};
const binance = async function () {
  const doc = new GoogleSpreadsheet(
    "1GJC1BIfNqDDmvCvMsjTFWx6ocQNcOC4vMSnTsBDFv2U"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  const newSheet = doc.sheetsById["0"];
  console.log(newSheet.rowCount);
  await newSheet.loadCells("A1:D1000");
  newSheet.getCell(0, 1).value = "RUNNING";
  await retry(() => Promise.all([newSheet.saveUpdatedCells()]), 5, true, 10000);
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    for (let i = 0; i < 10; i++) {
      let source = newSheet.getCell(i + 1, 0).value;
      const check = async (link) => {
        await retry(
          () =>
            Promise.all([
              page.goto(link, {
                waitUntil: "networkidle0",
              }),
              page.waitForXPath('//script[@id="__APP_DATA"]'),
            ]),
          5,
          true,
          10000
        );
        let [element] = await page.$x('//script[@id="__APP_DATA"]');
        console.log(element);

        let result = await page.evaluate(
          (element) => element.textContent,
          element
        );
        let price =
          JSON.parse(result)["routeProps"]["6cff"]["SSRSelectCrypto"][
            "quotation"
          ];
        return price;
      };
      if (source) {
        let res = await check(source);
        console.log(source, res);
        if (res) {
          newSheet.getCell(i + 1, 1).value = res;
          console.log(source, res);
        }
        await retry(
          () => Promise.all([newSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
      }
    }
    console.log("Binance Done");
    newSheet.getCell(0, 1).value = "OK";
    let date = new Date();
    newSheet.getCell(0, 2).value = date.toLocaleString("en-US", cstOptions);
    await retry(
      () => Promise.all([newSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Binance Error");
    newSheet.getCell(0, 1).value = "ERROR";
    let date = new Date();
    newSheet.getCell(0, 2).value = date.toLocaleString("en-US", cstOptions);
    await retry(
      () => Promise.all([newSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  }
};

module.exports = {
  binance,
};
