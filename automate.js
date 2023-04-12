const fs = require("fs");
var path = require("path");
const creds = require(path.resolve(__dirname, "./cm-automation.json")); // the file saved above
const axios = require("axios");
const XLSX = require("xlsx");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const {
  retry,
  sleep,
  updateProduct,
  updateDataProduct,
  sendSlack,
} = require("./utils");
const nodemailer = require("nodemailer");
const csvParser = require("csv-parser");
const needle = require("needle");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const vanillaPuppeteer = require("puppeteer");
const os = require("node:os");
const readXlsxFile = require("read-excel-file/node");

const defaultViewport = {
  height: 1920,
  width: 1280,
};
const { executablePath } = require("puppeteer");
const { ups } = require("./ups");
const { fedex } = require("./fedex");
const { usps } = require("./usps");
const { alltrackers } = require("./alltrackers");
PROXY_USERNAME = "scraperapi";
PROXY_PASSWORD = "e5d87185d49c8749431089fa73ef4731"; // <-- enter your API_Key here
PROXY_SERVER = "proxy-server.scraperapi.com";
PROXY_SERVER_PORT = "8001";

const cstOptions = {
  timeZone: "CST",
  dateStyle: "medium",
  timeStyle: "long",
};

const checkBlock = async (page) => {
  let block = await page.evaluate(() => {
    let el = document.querySelector("#px-captcha");
    return el ? true : false;
  });
  let [blocked] = await page.$x('//*[contains(text(),"Before we continue")]');
  if (block || blocked) {
    throw new Error("Blocked");
  }
};

async function testAxiosXlsx(url) {
  const options = {
    url,
    responseType: "arraybuffer",
  };
  let axiosResponse = await axios(options);
  const workbook = XLSX.read(axiosResponse.data, { locale: "en-US" });

  let worksheets = workbook.SheetNames.map((sheetName) => {
    return {
      sheetName,
      data: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        raw: false,
        FS: ";",
        RS: "\n",
        dateNF: 'm"/"dd"/"yyyy',
        strip: false,
        blankrows: true,
      }),
    };
  });
  return worksheets[0];
}

const sellerAmazon = async function () {
  const doc = new GoogleSpreadsheet(
    "1DrG1p3is3QqScFgBboIRFrgwb4Gio9T6MbX1D75R9fM"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(4, 1).value = "";
  settingSheet.getCell(4, 2).value = "RUNNING";
  settingSheet.getCell(4, 4).value = "";

  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
    userDataDir: "./user_data",
  });
  const page = await browser.newPage();
  const checkOtp = async () => {
    await settingSheet.loadCells("A1:G20");
    let otp = settingSheet.getCell(4, 1).value;
    let length = 0;
    while (!otp && length != 6) {
      console.log("Waiting OTP", otp);
      await settingSheet.loadCells("A1:G20");
      otp = settingSheet.getCell(4, 1).value;
      if (otp) {
        length = otp.toString().length;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    let otpText = otp.toString();
    console.log("OTP found:", otp);
    settingSheet.getCell(4, 1).value = "OTP Found";
    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await new Promise((r) => setTimeout(r, 2000));
    settingSheet.getCell(4, 1).value = "";
    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await new Promise((r) => setTimeout(r, 2000));
    return otpText;
  };

  const check2fa = async () => {
    let url = await page.url();
    if (url.includes("/ap/mfa")) {
      settingSheet.getCell(4, 2).value = "Need OTP";
      await retry(
        () => Promise.all([settingSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
      await new Promise((r) => setTimeout(r, 2000));
      let otp = await checkOtp();
      await page.type("#auth-mfa-otpcode", otp);
      await page.waitForTimeout(2000);
      await page.click("#auth-mfa-remember-device");
      await page.waitForTimeout(2000);
      await page.click("#auth-signin-button");
      console.log("Clicking login");
      await page.waitForNavigation({
        waitUntil: "networkidle2",
      });
      url = await page.url();
      if (url.includes("/ap/mfa")) {
        settingSheet.getCell(4, 2).value = "Wrong OTP, Stopped";
        await retry(
          () => Promise.all([settingSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://sellercentral.amazon.com/", {
      waitUntil: "networkidle0",
    });
    let url = await page.url();
    console.log(url);
    if (!url.includes("/home")) {
      await page.click('a[href*="https://sellercentral.amazon.com/signin"]');
      await page.waitForTimeout(10000);
      console.log("Trying login");
      let username = settingSheet.getCell(4, 6).value;
      let password = settingSheet.getCell(4, 7).value;
      await page.type("#ap_email", username);
      await page.type("#ap_password", password);
      await page.click("input[name='rememberMe']");

      await page.waitForTimeout(5000);
      console.log("Typing email & username");

      await page.click("#signInSubmit");
      console.log("Clicking login");

      await page.waitForNavigation({
        waitUntil: "networkidle0",
      });
      await check2fa();
      let url = await page.url();
      console.log(url);

      if (url.includes("/authorization/select-account")) {
        await page.waitForTimeout(5000);

        await page.waitForSelector(
          "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(4) > button > div > div.picker-name"
        );
        await page.click(
          "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(1) > button > div > div.picker-name"
        );
        await page.waitForTimeout(5000);
        await page.click(
          "#picker-container > div > div.picker-body > div > div:nth-child(3) > div > div:nth-child(3) > button > div > div"
        );
        await page.waitForTimeout(5000);
        await page.click(
          "#picker-container > div > div.picker-footer > div > button"
        );
      }
    }

    const grabData = async (bpos1, bpos2) => {
      let result = {};
      await page.goto("https://sellercentral.amazon.com/global-picker", {
        waitUntil: "networkidle0",
      });
      // await page.waitForSelector(
      //   "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(4) > button > div > div.picker-name"
      // );
      await page.click(
        `#sc-content-container > div > div.picker-body > div > div > div > div:nth-child(${bpos1})`
      );
      await page.waitForTimeout(10000);
      await page.click(
        `#sc-content-container > div > div.picker-body > div > div:nth-child(3) > div > div:nth-child(${bpos2}) > button > div > div`
      );
      await page.waitForTimeout(10000);
      await page.click("button.picker-switch-accounts-button");
      await page.waitForTimeout(10000);

      await page.waitForFunction("window.location.pathname == '/home'");

      await page.goto(
        "https://sellercentral.amazon.com/business-reports/ref=xx_sitemetric_dnav_xx#/report?id=102%3ADetailSalesTrafficByTime&chartCols=17&columns=0%2F1%2F2%2F3%2F4%2F23%2F24%2F25%2F26%2F29%2F30"
      );
      const finalResponse = await page.waitForResponse(
        (response) =>
          response.url() ===
            "https://sellercentral.amazon.com/business-reports/api" &&
          response
            .request()
            .postData()
            .startsWith('{"operationName":"reportDataQuery"'),
        20
      );
      let responseJson = await finalResponse.json();
      let report_header = responseJson["data"]["getReportData"]["columns"];
      let business_report = responseJson["data"]["getReportData"]["rows"];
      business_report = business_report.reverse().slice(0, 90).reverse();
      console.log(business_report);
      result["data"] = { header: report_header, data: business_report };
      await page.goto(
        "https://sellercentral.amazon.com/feedback-manager/index.html#/",
        {
          waitUntil: "networkidle0",
        }
      );
      let rating = await page.$eval(
        "#sc-content-container > div > my-app > div > div > home > div > feedback-summary > div > div:nth-child(3) > b:nth-child(1)",
        (el) => el.innerText
      );
      result["rating"] = rating;
      console.log("rating:", rating);
      await page.click('kat-tab-header[tab-id="positive"]');
      await page.waitForTimeout(5000);
      let ratings = await page.$$eval(
        "#sc-content-container > div > my-app > div > div > home > div > div.filter-tabs > kat-tabs > kat-tab.tab-selected > feedback-list > kat-table > kat-table-body > kat-table-row",
        (trs) => {
          return trs.map((tr) => {
            let name = "";
            if (tr.querySelector("kat-table-cell:nth-child(1)")) {
              name = tr.querySelector("kat-table-cell:nth-child(1").innerText;
            }
            return name.trim();
          });
        }
      );
      console.log(ratings);
      let today = new Date();
      const checkOccurrence = (array, element) => {
        let counter = 0;
        for (item of array.flat()) {
          if (typeof item === "string") {
            let newItem = item.toLowerCase();
            if (newItem == element) {
              counter++;
            }
          } else {
            if (item == element) {
              counter++;
            }
          }
        }
        console.log(counter);
        return counter;
      };
      let date_today =
        today.getMonth() +
        1 +
        "/" +
        today.getDate() +
        "/" +
        today.getFullYear();
      result["pos_feedback"] = checkOccurrence(ratings, date_today);
      await page.goto(
        "https://sellercentral.amazon.com/performance/detail/customer-service?ref=sp_st_dash_cs_vm",
        {
          waitUntil: "networkidle0",
        }
      );
      let odr = await page.$eval(
        "#odr-giant-metric-percentage > span",
        (el) => el.innerText
      );
      let odr_with_defect = await page.$eval(
        "#odr-metric-order-with-defect > span",
        (el) => el.innerText
      );
      let odr_total = await page.$eval(
        "#odr-total-order-count > span",
        (el) => el.innerText
      );
      result["odr"] = odr;
      result["odr_with_defect"] = odr_with_defect.replace(
        "Orders with a defect: ",
        ""
      );
      result["odr_total"] = odr_total.replace("Total orders: ", "");
      console.log(odr, odr_with_defect, odr_total);

      await page.goto(
        "https://sellercentral.amazon.com/performance/detail/shipping?ref=sp_st_nav_spshp",
        {
          waitUntil: "networkidle0",
        }
      );
      let lsr = await page.$eval(
        "#lsr-metrics-for-time-window-1 > div.a-section.a-spacing-none.a-text-left > div:nth-child(2) > div > span",
        (el) => el.innerText
      );
      let lsr_with_defect = await page.$eval(
        "#late-shipment-orders-shipped-late > b",
        (el) => el.innerText
      );
      let lsr_total = await page.$eval(
        "#late-shipment-order-count > b",
        (el) => el.innerText
      );
      result["lsr"] = lsr;
      result["lsr_with_defect"] = lsr_with_defect;
      result["lsr_total"] = lsr_total;
      console.log(lsr, lsr_with_defect, lsr_total);

      await page.click("#tabs-titles > div:nth-child(2)");
      let cr = await page.$eval(
        "#cr-metrics-for-time-window-0 > div.a-section.a-spacing-none.a-text-left > div > div > span",
        (el) => el.innerText
      );
      let cr_with_defect = await page.$eval(
        "#pre-fulfillment-cancel-rate-cancelled-by-seller > b",
        (el) => el.innerText
      );
      let cr_total = await page.$eval(
        "#pre-fulfillment-cancel-rate-order-count > b",
        (el) => el.innerText
      );
      result["cr"] = cr;
      result["cr_with_defect"] = cr_with_defect;
      result["cr_total"] = cr_total;
      console.log(cr, cr_with_defect, cr_total);

      await page.click("#tabs-titles > div:nth-child(3)");
      let vtr = await page.$eval(
        "#vtr-metrics-for-time-window-0 > div:nth-child(1) > div.a-section.a-spacing-none.a-text-left > div > div > span",
        (el) => el.innerText
      );
      let vtr_with_defect = await page.$eval(
        "#valid-tracking-order-count",
        (el) => el.innerText
      );
      let vtr_total = await page.$eval(
        "#valid-tracking-orders-shipped-without-valid-tracking",
        (el) => el.innerText
      );
      result["vtr"] = vtr;
      result["vtr_with_defect"] = vtr_with_defect.replace(
        "Number of non-exempted shipments: ",
        ""
      );
      result["vtr_total"] = vtr_total.replace(
        "Shipments with valid tracking: ",
        ""
      );
      console.log(vtr, vtr_with_defect, vtr_total);

      await page.click("#tabs-titles > div:nth-child(4)");
      let otdr = await page.$eval(
        "#otd-metrics-for-time-window-0 > div.a-section.a-spacing-none.a-text-left > div > div > span",
        (el) => el.innerText
      );
      let otdr_with_defect = await page.$eval(
        "#on-time-delivery-orders-delivered-late > b",
        (el) => el.innerText
      );
      let otdr_total = await page.$eval(
        "#on-time-delivery-order-count > b",
        (el) => el.innerText
      );
      result["otdr"] = otdr;
      result["otdr_with_defect"] = otdr_with_defect;
      result["otdr_total"] = otdr_total;
      console.log(otdr, otdr_with_defect, otdr_total);
      return result;
    };
    let parseTexint = (text) => {
      if (text && typeof text === "string") {
        if (text.includes(".")) {
          if (text.startsWith(".")) {
            return parseFloat(`0${text}`);
          } else {
            return parseFloat(text);
          }
        } else {
          return parseInt(text);
        }
      } else {
        return text;
      }
    };
    let writeSheet = async (result, id) => {
      let resSheet = doc.sheetsById[id];
      await resSheet.loadCells("A1:AB1000");
      resSheet.getCell(2, 2).value = result["rating"];
      resSheet.getCell(4, 3).value = result["otdr"];
      resSheet.getCell(5, 3).value = result["cr"];
      resSheet.getCell(6, 3).value = result["lsr"];
      resSheet.getCell(
        4,
        5
      ).value = `${result["otdr_with_defect"]} of ${result["otdr_total"]} orders`;
      resSheet.getCell(
        5,
        5
      ).value = `${result["cr_with_defect"]} of ${result["cr_total"]} orders`;
      resSheet.getCell(
        6,
        5
      ).value = `${result["lsr_with_defect"]} of ${result["lsr_total"]} orders`;

      let data = result["data"]["data"];
      let latest_date = new Date(Date.parse(resSheet.getCell(16, 0).value));
      console.log(latest_date);
      let added_row = false;
      for (let n = 0; n < data.length; n++) {
        let row_data = data[n];
        let dateFormat = new Date(parseInt(row_data[0]) * 1000);
        if (
          dateFormat.setHours(0, 0, 0, 0) > latest_date.setHours(0, 0, 0, 0)
        ) {
          added_row = true;
          resSheet.insertDimension(
            "ROWS",
            { startIndex: 16, endIndex: 17 },
            false
          );
          await retry(
            () => Promise.all([resSheet.saveUpdatedCells()]),
            5,
            true,
            10000
          );
          let date_sh =
            dateFormat.getMonth() +
            1 +
            "/" +
            dateFormat.getDate() +
            "/" +
            dateFormat.getFullYear();
          console.log(
            "new data: ",
            date_sh,
            dateFormat.getTime(),
            latest_date.getTime()
          );
          resSheet.getCell(16, 0).value = date_sh.toString();
          resSheet.getCell(16, 1).value = parseTexint(row_data[1]);
          resSheet.getCell(16, 2).value = parseTexint(row_data[2]);
          resSheet.getCell(16, 3).value = parseTexint(row_data[3]);
          resSheet.getCell(16, 4).value = parseTexint(row_data[4]);
          resSheet.getCell(16, 5).value = parseTexint(row_data[23]);
          resSheet.getCell(16, 6).value = parseTexint(row_data[24]);
          resSheet.getCell(16, 7).value = parseTexint(row_data[25]) / 100;
          resSheet.getCell(16, 8).value = parseTexint(row_data[26]) / 100;
          resSheet.getCell(16, 9).value = parseTexint(row_data[29]) / 100;
          resSheet.getCell(16, 10).value = parseTexint(row_data[30]) / 100;
          resSheet.getCell(16, 13).value = parseTexint(row_data[33]);
          resSheet.getCell(16, 14).value = parseTexint(row_data[34]) / 100;
          resSheet.getCell(16, 17).value = row_data[35] - row_data[36];

          if (n % 10 == 0) {
            await retry(
              () => Promise.all([resSheet.saveUpdatedCells()]),
              5,
              true,
              10000
            );
          }
        }
      }
      if (added_row) {
        resSheet.getCell(16, 11).value = parseTexint(
          parseFloat(result["odr"]) / 100
        );
        resSheet.getCell(16, 16).value = parseTexint(
          parseFloat(result["vtr"]) / 100
        );
        resSheet.getCell(16, 17).value = result["pos_feedback"];

        resSheet.getCell(16, 18).value = parseTexint(
          parseFloat(result["lsr"]) / 100
        );
        resSheet.getCell(16, 19).value = parseTexint(
          parseFloat(result["otdr"]) / 100
        );
        resSheet.getCell(16, 20).value = parseTexint(
          parseFloat(result["cr"]) / 100
        );
        resSheet.getCell(16, 26).formula = "=A17";
        resSheet.getCell(16, 27).formula =
          "=VLOOKUP(AA17,A$16:T$57,AB$14,FALSE)";
      }
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
    };
    let result_data = await grabData(1, 3);
    await writeSheet(result_data, "1377907402");

    let result_data_2 = await grabData(4, 2);
    await writeSheet(result_data_2, "1152900177");

    let result_data_3 = await grabData(3, 1);
    await writeSheet(result_data_3, "577275692");

    let result_data_4 = await grabData(4, 2);
    await writeSheet(result_data_4, "1152900177");

    let dateFormat = new Date();

    settingSheet.getCell(4, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(4, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Amazon Aziz Error");
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(4, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(4, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  }
};
const ppcAmazon = async function () {
  const doc = new GoogleSpreadsheet(
    "1DrG1p3is3QqScFgBboIRFrgwb4Gio9T6MbX1D75R9fM"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(4, 1).value = "";
  settingSheet.getCell(4, 2).value = "RUNNING";
  settingSheet.getCell(4, 4).value = "";

  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
    userDataDir: "./user_data",
  });
  const page = await browser.newPage();
  const checkOtp = async () => {
    await settingSheet.loadCells("A1:G20");
    let otp = settingSheet.getCell(4, 1).value;
    let length = 0;
    while (!otp && length != 6) {
      console.log("Waiting OTP", otp);
      await settingSheet.loadCells("A1:G20");
      otp = settingSheet.getCell(4, 1).value;
      if (otp) {
        length = otp.toString().length;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    let otpText = otp.toString();
    console.log("OTP found:", otp);
    settingSheet.getCell(4, 1).value = "OTP Found";
    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await new Promise((r) => setTimeout(r, 2000));
    settingSheet.getCell(4, 1).value = "";
    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await new Promise((r) => setTimeout(r, 2000));
    return otpText;
  };

  const check2fa = async () => {
    let url = await page.url();
    if (url.includes("/ap/mfa")) {
      settingSheet.getCell(4, 2).value = "Need OTP";
      await retry(
        () => Promise.all([settingSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
      await new Promise((r) => setTimeout(r, 2000));
      let otp = await checkOtp();
      await page.type("#auth-mfa-otpcode", otp);
      await page.waitForTimeout(2000);
      await page.click("#auth-mfa-remember-device");
      await page.waitForTimeout(2000);
      await page.click("#auth-signin-button");
      console.log("Clicking login");
      await page.waitForNavigation({
        waitUntil: "networkidle2",
      });
      url = await page.url();
      if (url.includes("/ap/mfa")) {
        settingSheet.getCell(4, 2).value = "Wrong OTP, Stopped";
        await retry(
          () => Promise.all([settingSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://sellercentral.amazon.com/", {
      waitUntil: "networkidle0",
    });
    let url = await page.url();
    console.log(url);
    if (!url.includes("/home")) {
      await page.click('a[href*="https://sellercentral.amazon.com/signin"]');
      await page.waitForTimeout(10000);
      console.log("Trying login");
      let username = settingSheet.getCell(4, 6).value;
      let password = settingSheet.getCell(4, 7).value;
      await page.type("#ap_email", username);
      await page.type("#ap_password", password);
      await page.click("input[name='rememberMe']");

      await page.waitForTimeout(5000);
      console.log("Typing email & username");

      await page.click("#signInSubmit");
      console.log("Clicking login");

      await page.waitForNavigation({
        waitUntil: "networkidle0",
      });
      await check2fa();
      let url = await page.url();
      console.log(url);

      if (url.includes("/authorization/select-account")) {
        await page.waitForTimeout(5000);

        await page.waitForSelector(
          "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(4) > button > div > div.picker-name"
        );
        await page.click(
          "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(1) > button > div > div.picker-name"
        );
        await page.waitForTimeout(5000);
        await page.click(
          "#picker-container > div > div.picker-body > div > div:nth-child(3) > div > div:nth-child(3) > button > div > div"
        );
        await page.waitForTimeout(5000);
        await page.click(
          "#picker-container > div > div.picker-footer > div > button"
        );
      }
    }

    const grabData = async (bpos1, bpos2) => {
      let result = {};
      await page.goto("https://sellercentral.amazon.com/global-picker", {
        waitUntil: "networkidle0",
      });
      // await page.waitForSelector(
      //   "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(4) > button > div > div.picker-name"
      // );
      const elements = await page.$x(
        '//div[@class="picker-name" and contains(., "Syracuse Unlimited")]'
      );
      await elements[0].click();
      // await page.click(
      //   `#sc-content-container > div > div.picker-body > div > div > div > div:nth-child(${bpos1})`
      // );
      await page.waitForTimeout(10000);
      const elements2 = await page.$x(
        '//div[@class="picker-name" and contains(., "United States")]'
      );
      await elements2[0].click();
      // await page.click(
      //   `#sc-content-container > div > div.picker-body > div > div:nth-child(3) > div > div:nth-child(${bpos2}) > button > div > div`
      // );
      await page.waitForTimeout(10000);
      await page.click("button.picker-switch-accounts-button");
      await page.waitForTimeout(10000);

      await page.waitForFunction("window.location.pathname == '/home'");
      let report_url =
        "https://advertising.amazon.com/reports/history/2557b4cc-88bd-4fd5-9a53-d1ea8705a858?entityId=ENTITY390LELNKZ73AU";
      await page.goto(report_url, {
        waitUntil: "networkidle2",
      });
      await page.waitForSelector("#J_Button_NORMAL_ENABLED");
      await page.click("#J_Button_NORMAL_ENABLED");
      await page.waitForTimeout(3000);
      let check_first = async () => {
        let first_result = await page.evaluate(() => {
          let el = document.querySelector(
            "div.ReactTable > div > div.rt-tbody > div:nth-child(1) > div > div:nth-child(1) > div > p"
          );
          return el ? el.innerText : "";
        });
        if (first_result != "Completed") {
          await page.goto(report_url, {
            waitUntil: "networkidle2",
          });
          await check_first();
        }
      };
      await check_first();
      let link = await page.evaluate(() => {
        let el = document.querySelector(
          "div.ReactTable > div > div.rt-tbody > div:nth-child(1) > div > div:nth-child(4) > a"
        );
        return el ? el.getAttribute("href") : "";
      });
      console.log(link);
      let data = await testAxiosXlsx(link);
      let rows = data["data"];
      function formatDate(date) {
        var d = new Date(date),
          month = "" + (d.getMonth() + 1),
          day = "" + d.getDate(),
          year = d.getFullYear();

        if (month.length < 2) month = "0" + month;
        if (day.length < 2) day = "0" + day;

        return [year, month, day].join("-");
      }
      for (let j = 0; j < rows.length; j++) {
        let e = rows[j];
        if (e["7 Day Total Sales "] != "$0.00") {
          let response = await axios.get(
            `https://cheapr.my.id/caproduct/?sku=${e["Advertised SKU"]}`
          );
          let result = response.data.results;
          if (result.length > 0) {
            let ca_data = result[0];
            console.log(e["Date"]);
            console.log(ca_data["sku"]);
            console.log(ca_data["mpn"]);
            console.log(ca_data["make"]);
            console.log(ca_data["model"]);
            console.log(ca_data["asin"]);
            console.log(e["7 Day Total Sales "]);
            let payload = {
              product: ca_data["pk"],
              date: formatDate(Date.parse(e["Date"])),
              price: parseFloat(
                e["7 Day Total Sales "].replace("$", "").replace(",", "")
              ),
              qty: parseInt(e["7 Day Advertised SKU Units (#)"]),
              platform: "Amazon - SU",
            };
            let post_res = await axios.post(
              "https://cheapr.my.id/ppc_order/",
              (data = payload)
            );
            console.log(post_res.data);
          } else {
            console.log(e["Date"]);
            console.log("ca not found");
            console.log(e["Advertised SKU"]);
            console.log(e["7 Day Total Sales "]);
          }
        }
      }
      console.log("DONE");
    };
    let parseTexint = (text) => {
      if (text && typeof text === "string") {
        if (text.includes(".")) {
          if (text.startsWith(".")) {
            return parseFloat(`0${text}`);
          } else {
            return parseFloat(text);
          }
        } else {
          return parseInt(text);
        }
      } else {
        return text;
      }
    };
    let writeSheet = async (result, id) => {
      let resSheet = doc.sheetsById[id];
      await resSheet.loadCells("A1:AB1000");
      resSheet.getCell(2, 2).value = result["rating"];
      resSheet.getCell(4, 3).value = result["otdr"];
      resSheet.getCell(5, 3).value = result["cr"];
      resSheet.getCell(6, 3).value = result["lsr"];
      resSheet.getCell(
        4,
        5
      ).value = `${result["otdr_with_defect"]} of ${result["otdr_total"]} orders`;
      resSheet.getCell(
        5,
        5
      ).value = `${result["cr_with_defect"]} of ${result["cr_total"]} orders`;
      resSheet.getCell(
        6,
        5
      ).value = `${result["lsr_with_defect"]} of ${result["lsr_total"]} orders`;

      let data = result["data"]["data"];
      let latest_date = new Date(Date.parse(resSheet.getCell(16, 0).value));
      console.log(latest_date);
      let added_row = false;
      for (let n = 0; n < data.length; n++) {
        let row_data = data[n];
        let dateFormat = new Date(parseInt(row_data[0]) * 1000);
        if (
          dateFormat.setHours(0, 0, 0, 0) > latest_date.setHours(0, 0, 0, 0)
        ) {
          added_row = true;
          resSheet.insertDimension(
            "ROWS",
            { startIndex: 16, endIndex: 17 },
            false
          );
          await retry(
            () => Promise.all([resSheet.saveUpdatedCells()]),
            5,
            true,
            10000
          );
          let date_sh =
            dateFormat.getMonth() +
            1 +
            "/" +
            dateFormat.getDate() +
            "/" +
            dateFormat.getFullYear();
          console.log(
            "new data: ",
            date_sh,
            dateFormat.getTime(),
            latest_date.getTime()
          );
          resSheet.getCell(16, 0).value = date_sh.toString();
          resSheet.getCell(16, 1).value = parseTexint(row_data[1]);
          resSheet.getCell(16, 2).value = parseTexint(row_data[2]);
          resSheet.getCell(16, 3).value = parseTexint(row_data[3]);
          resSheet.getCell(16, 4).value = parseTexint(row_data[4]);
          resSheet.getCell(16, 5).value = parseTexint(row_data[23]);
          resSheet.getCell(16, 6).value = parseTexint(row_data[24]);
          resSheet.getCell(16, 7).value = parseTexint(row_data[25]) / 100;
          resSheet.getCell(16, 8).value = parseTexint(row_data[26]) / 100;
          resSheet.getCell(16, 9).value = parseTexint(row_data[29]) / 100;
          resSheet.getCell(16, 10).value = parseTexint(row_data[30]) / 100;
          resSheet.getCell(16, 13).value = parseTexint(row_data[33]);
          resSheet.getCell(16, 14).value = parseTexint(row_data[34]) / 100;
          resSheet.getCell(16, 17).value = row_data[35] - row_data[36];

          if (n % 10 == 0) {
            await retry(
              () => Promise.all([resSheet.saveUpdatedCells()]),
              5,
              true,
              10000
            );
          }
        }
      }
      if (added_row) {
        resSheet.getCell(16, 11).value = parseTexint(
          parseFloat(result["odr"]) / 100
        );
        resSheet.getCell(16, 16).value = parseTexint(
          parseFloat(result["vtr"]) / 100
        );
        resSheet.getCell(16, 17).value = result["pos_feedback"];

        resSheet.getCell(16, 18).value = parseTexint(
          parseFloat(result["lsr"]) / 100
        );
        resSheet.getCell(16, 19).value = parseTexint(
          parseFloat(result["otdr"]) / 100
        );
        resSheet.getCell(16, 20).value = parseTexint(
          parseFloat(result["cr"]) / 100
        );
        resSheet.getCell(16, 26).formula = "=A17";
        resSheet.getCell(16, 27).formula =
          "=VLOOKUP(AA17,A$16:T$57,AB$14,FALSE)";
      }
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
    };
    let result_data = await grabData(5, 3);

    let dateFormat = new Date();

    settingSheet.getCell(4, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(4, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Amazon Aziz Error");
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(4, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(4, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  }
};
const sellerAmazonCH = async function () {
  const doc = new GoogleSpreadsheet(
    "1DrG1p3is3QqScFgBboIRFrgwb4Gio9T6MbX1D75R9fM"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    userDataDir: "./user_data_ch",
    executablePath: executablePath(),
  });
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://sellercentral.amazon.com/", {
      waitUntil: "networkidle0",
    });
    let url = await page.url();
    if (!url.includes("/home")) {
      await page.click('a[href*="https://sellercentral.amazon.com/signin"]');
      await page.waitForTimeout(10000);

      await page.type("#ap_email", "clarissasolutions@gmail.com");
      await page.type("#ap_password", "f99c00100");

      await page.waitForTimeout(5000);

      await page.click("#signInSubmit");

      await page.waitForNavigation({
        waitUntil: "networkidle0",
      });
      url = await page.url();
      if (url.includes("/authorization/select-account")) {
        await page.waitForTimeout(5000);

        await page.waitForSelector(
          "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(4) > button > div > div.picker-name"
        );
        await page.click(
          "#picker-container > div > div.picker-body > div > div:nth-child(1) > div > div:nth-child(1) > button > div > div.picker-name"
        );
        await page.waitForTimeout(5000);
        await page.click(
          "#picker-container > div > div.picker-body > div > div:nth-child(3) > div > div:nth-child(3) > button > div > div"
        );
        await page.waitForTimeout(5000);
        await page.click(
          "#picker-container > div > div.picker-footer > div > button"
        );
      } else if (url.includes("/ap/signin")) {
        await page.waitForSelector(
          "#ap-account-switcher-container > div.a-box > div > div > div:nth-child(2) > div:nth-child(3) > div.cvf-widget-form.cvf-widget-form-account-switcher.a-spacing-none > a > div > div > div > div"
        );
        await page.click(
          "#ap-account-switcher-container > div.a-box > div > div > div:nth-child(2) > div:nth-child(3) > div.cvf-widget-form.cvf-widget-form-account-switcher.a-spacing-none > a > div > div > div > div"
        );
        await page.waitForTimeout(5000);
      }
    }

    await page.waitForTimeout(5000);

    await page.waitForFunction("window.location.pathname == '/home'");
    const grabData = async () => {
      let result = {};

      await page.goto(
        "https://sellercentral.amazon.com/business-reports/ref=xx_sitemetric_dnav_xx#/report?id=102%3ADetailSalesTrafficByTime&chartCols=17&columns=0%2F1%2F2%2F3%2F4%2F23%2F24%2F25%2F26%2F29%2F30"
      );
      const finalResponse = await page.waitForResponse(
        (response) =>
          response.url() ===
            "https://sellercentral.amazon.com/business-reports/api" &&
          response
            .request()
            .postData()
            .startsWith('{"operationName":"reportDataQuery"'),
        20
      );
      let responseJson = await finalResponse.json();
      let report_header = responseJson["data"]["getReportData"]["columns"];
      let business_report = responseJson["data"]["getReportData"]["rows"];
      business_report = business_report.reverse().slice(0, 90).reverse();
      console.log(business_report);
      result["data"] = { header: report_header, data: business_report };
      await page.goto(
        "https://sellercentral.amazon.com/feedback-manager/index.html#/",
        {
          waitUntil: "networkidle0",
        }
      );
      let rating = await page.$eval(
        "#sc-content-container > div > my-app > div > div > home > div > feedback-summary > div > div:nth-child(3) > b:nth-child(1)",
        (el) => el.innerText
      );
      result["rating"] = rating;
      console.log("rating:", rating);
      await page.click('kat-tab-header[tab-id="positive"]');
      await page.waitForTimeout(5000);
      let ratings = await page.$$eval(
        "#sc-content-container > div > my-app > div > div > home > div > div.filter-tabs > kat-tabs > kat-tab.tab-selected > feedback-list > kat-table > kat-table-body > kat-table-row",
        (trs) => {
          return trs.map((tr) => {
            let name = "";
            if (tr.querySelector("kat-table-cell:nth-child(1)")) {
              name = tr.querySelector("kat-table-cell:nth-child(1").innerText;
            }
            return name.trim();
          });
        }
      );
      console.log(ratings);
      let today = new Date();
      const checkOccurrence = (array, element) => {
        let counter = 0;
        for (item of array.flat()) {
          if (typeof item === "string") {
            let newItem = item.toLowerCase();
            if (newItem == element) {
              counter++;
            }
          } else {
            if (item == element) {
              counter++;
            }
          }
        }
        console.log(counter);
        return counter;
      };
      let date_today =
        today.getMonth() +
        1 +
        "/" +
        today.getDate() +
        "/" +
        today.getFullYear();
      result["pos_feedback"] = checkOccurrence(ratings, date_today);
      await page.goto(
        "https://sellercentral.amazon.com/performance/detail/customer-service?ref=sp_st_dash_cs_vm",
        {
          waitUntil: "networkidle0",
        }
      );
      let odr = await page.$eval(
        "#odr-giant-metric-percentage > span",
        (el) => el.innerText
      );
      let odr_with_defect = await page.$eval(
        "#odr-metric-order-with-defect > span",
        (el) => el.innerText
      );
      let odr_total = await page.$eval(
        "#odr-total-order-count > span",
        (el) => el.innerText
      );
      result["odr"] = odr;
      result["odr_with_defect"] = odr_with_defect.replace(
        "Orders with a defect: ",
        ""
      );
      result["odr_total"] = odr_total.replace("Total orders: ", "");
      console.log(odr, odr_with_defect, odr_total);

      await page.goto(
        "https://sellercentral.amazon.com/performance/detail/shipping?ref=sp_st_nav_spshp",
        {
          waitUntil: "networkidle0",
        }
      );
      let lsr = await page.$eval(
        "#lsr-metrics-for-time-window-1 > div.a-section.a-spacing-none.a-text-left > div:nth-child(2) > div > span",
        (el) => el.innerText
      );
      let lsr_with_defect = await page.$eval(
        "#late-shipment-orders-shipped-late > b",
        (el) => el.innerText
      );
      let lsr_total = await page.$eval(
        "#late-shipment-order-count > b",
        (el) => el.innerText
      );
      result["lsr"] = lsr;
      result["lsr_with_defect"] = lsr_with_defect;
      result["lsr_total"] = lsr_total;
      console.log(lsr, lsr_with_defect, lsr_total);

      await page.click("#tabs-titles > div:nth-child(2)");
      let cr = await page.$eval(
        "#cr-metrics-for-time-window-0 > div.a-section.a-spacing-none.a-text-left > div > div > span",
        (el) => el.innerText
      );
      let cr_with_defect = await page.$eval(
        "#pre-fulfillment-cancel-rate-cancelled-by-seller > b",
        (el) => el.innerText
      );
      let cr_total = await page.$eval(
        "#pre-fulfillment-cancel-rate-order-count > b",
        (el) => el.innerText
      );
      result["cr"] = cr;
      result["cr_with_defect"] = cr_with_defect;
      result["cr_total"] = cr_total;
      console.log(cr, cr_with_defect, cr_total);

      await page.click("#tabs-titles > div:nth-child(3)");
      let vtr = await page.$eval(
        "#vtr-metrics-for-time-window-0 > div:nth-child(1) > div.a-section.a-spacing-none.a-text-left > div > div > span",
        (el) => el.innerText
      );
      let vtr_with_defect = await page.$eval(
        "#valid-tracking-order-count",
        (el) => el.innerText
      );
      let vtr_total = await page.$eval(
        "#valid-tracking-orders-shipped-without-valid-tracking",
        (el) => el.innerText
      );
      result["vtr"] = vtr;
      result["vtr_with_defect"] = vtr_with_defect.replace(
        "Number of non-exempted shipments: ",
        ""
      );
      result["vtr_total"] = vtr_total.replace(
        "Shipments with valid tracking: ",
        ""
      );
      console.log(vtr, vtr_with_defect, vtr_total);

      await page.click("#tabs-titles > div:nth-child(4)");
      let otdr = await page.$eval(
        "#otd-metrics-for-time-window-0 > div.a-section.a-spacing-none.a-text-left > div > div > span",
        (el) => el.innerText
      );
      let otdr_with_defect = await page.$eval(
        "#on-time-delivery-orders-delivered-late > b",
        (el) => el.innerText
      );
      let otdr_total = await page.$eval(
        "#on-time-delivery-order-count > b",
        (el) => el.innerText
      );
      result["otdr"] = otdr;
      result["otdr_with_defect"] = otdr_with_defect;
      result["otdr_total"] = otdr_total;
      console.log(otdr, otdr_with_defect, otdr_total);
      return result;
    };
    let parseTexint = (text) => {
      if (text && typeof text === "string") {
        if (text.includes(".")) {
          if (text.startsWith(".")) {
            return parseFloat(`0${text}`);
          } else {
            return parseFloat(text);
          }
        } else {
          return parseInt(text);
        }
      } else {
        return text;
      }
    };
    let writeSheet = async (result, id) => {
      let resSheet = doc.sheetsById[id];
      await resSheet.loadCells("A1:AB1000");
      resSheet.getCell(2, 2).value = result["rating"];
      resSheet.getCell(4, 3).value = result["otdr"];
      resSheet.getCell(5, 3).value = result["cr"];
      resSheet.getCell(6, 3).value = result["lsr"];
      resSheet.getCell(
        4,
        5
      ).value = `${result["otdr_with_defect"]} of ${result["otdr_total"]} orders`;
      resSheet.getCell(
        5,
        5
      ).value = `${result["cr_with_defect"]} of ${result["cr_total"]} orders`;
      resSheet.getCell(
        6,
        5
      ).value = `${result["lsr_with_defect"]} of ${result["lsr_total"]} orders`;

      let data = result["data"]["data"];
      let latest_date = new Date(Date.parse(resSheet.getCell(16, 0).value));
      console.log(latest_date);
      let added_row = false;
      for (let n = 0; n < data.length; n++) {
        let row_data = data[n];
        let dateFormat = new Date(parseInt(row_data[0]) * 1000);
        if (
          dateFormat.setHours(0, 0, 0, 0) > latest_date.setHours(0, 0, 0, 0)
        ) {
          added_row = true;
          resSheet.insertDimension(
            "ROWS",
            { startIndex: 16, endIndex: 17 },
            false
          );
          await retry(
            () => Promise.all([resSheet.saveUpdatedCells()]),
            5,
            true,
            10000
          );
          let date_sh =
            dateFormat.getMonth() +
            1 +
            "/" +
            dateFormat.getDate() +
            "/" +
            dateFormat.getFullYear();
          console.log(
            "new data: ",
            date_sh,
            dateFormat.getTime(),
            latest_date.getTime()
          );
          resSheet.getCell(16, 0).value = date_sh.toString();
          resSheet.getCell(16, 1).value = parseTexint(row_data[1]);
          resSheet.getCell(16, 2).value = parseTexint(row_data[2]);
          resSheet.getCell(16, 3).value = parseTexint(row_data[3]);
          resSheet.getCell(16, 4).value = parseTexint(row_data[4]);
          resSheet.getCell(16, 5).value = parseTexint(row_data[23]);
          resSheet.getCell(16, 6).value = parseTexint(row_data[24]);
          resSheet.getCell(16, 7).value = parseTexint(row_data[25]) / 100;
          resSheet.getCell(16, 8).value = parseTexint(row_data[26]) / 100;
          resSheet.getCell(16, 9).value = parseTexint(row_data[29]) / 100;
          resSheet.getCell(16, 10).value = parseTexint(row_data[30]) / 100;
          resSheet.getCell(16, 13).value = parseTexint(row_data[33]);
          resSheet.getCell(16, 14).value = parseTexint(row_data[34]) / 100;
          resSheet.getCell(16, 17).value = row_data[35] - row_data[36];

          if (n % 10 == 0) {
            await retry(
              () => Promise.all([resSheet.saveUpdatedCells()]),
              5,
              true,
              10000
            );
          }
        }
      }
      if (added_row) {
        resSheet.getCell(16, 11).value = parseTexint(
          parseFloat(result["odr"]) / 100
        );
        resSheet.getCell(16, 16).value = parseTexint(
          parseFloat(result["vtr"]) / 100
        );
        resSheet.getCell(16, 17).value = result["pos_feedback"];

        resSheet.getCell(16, 18).value = parseTexint(
          parseFloat(result["lsr"]) / 100
        );
        resSheet.getCell(16, 19).value = parseTexint(
          parseFloat(result["otdr"]) / 100
        );
        resSheet.getCell(16, 20).value = parseTexint(
          parseFloat(result["cr"]) / 100
        );
        resSheet.getCell(16, 26).formula = "=A17";
        resSheet.getCell(16, 27).formula = "=VLOOKUP(Y17,A$16:T$51,Z$14,FALSE)";
      }
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
    };
    let result_data = await grabData();
    await writeSheet(result_data, "577275692");
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Amazon C&H Error");
    await browser.close();
  }
};
const walmart = async function () {
  const doc = new GoogleSpreadsheet(
    "1DrG1p3is3QqScFgBboIRFrgwb4Gio9T6MbX1D75R9fM"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(7, 1).value = "";
  settingSheet.getCell(7, 2).value = "RUNNING";
  settingSheet.getCell(7, 4).value = "";

  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://seller.walmart.com/", {
      waitUntil: "networkidle0",
    });
    let username = settingSheet.getCell(7, 6).value;
    let password = settingSheet.getCell(7, 7).value;

    await page.type('input[data-automation-id="uname"]', username);
    await page.type('input[data-automation-id="pwd"]', password);
    await page.waitForTimeout(2000);

    await page.click('button[data-automation-id="loginBtn"]');

    await page.waitForTimeout(5000);

    await page.waitForFunction("window.location.pathname == '/home'", {
      timeout: 500000,
    });

    const grabData = async () => {
      let result = {};

      let today = new Date();
      let priorDate = new Date(new Date().setDate(today.getDate() - 90));
      let start = `${("0" + (priorDate.getMonth() + 1)).slice(-2)}%2F${(
        "0" + priorDate.getDate()
      ).slice(-2)}%2F${priorDate.getFullYear()}`;
      let end = `${("0" + (today.getMonth() + 1)).slice(-2)}%2F${(
        "0" + today.getDate()
      ).slice(-2)}%2F${today.getFullYear()}`;

      await page.goto(
        `https://seller.walmart.com/partner-analytics/overview?program=ALL&startDate=${start}&endDate=${end}&duration=CUSTOM`
      );

      const finalResponse = await page.waitForResponse(
        (response) =>
          response.url() ===
            "https://seller.walmart.com/api/aurora/financial/getOverviewByDay" &&
          response
            .request()
            .postData()
            .startsWith('{"filter":{"filterBy":{"duration"'),
        20
      );
      let responseJson = await finalResponse.json();
      let business_report = responseJson["data"];
      business_report = business_report.reverse();
      console.log(business_report);
      result["data"] = business_report;
      await page.goto(
        "https://seller.walmart.com/analytics/scorecard/ratings-and-reviews",
        {
          waitUntil: "networkidle0",
        }
      );
      let rating = await page.$eval(
        "body > section > div > section > div > section.wm-gutter > section.wm-rating > p:nth-child(2) > span",
        (el) => el.innerText
      );
      result["rating"] = rating;
      console.log("rating:", rating);

      await page.goto(
        "https://seller.walmart.com/partner-analytics/performance/fulfillment/kpi",
        {
          waitUntil: "networkidle0",
        }
      );
      let getKpi = async (pos, kpi, kpires, val) => {
        await page.click(
          `#subapp-main-0 > div > div:nth-child(1) > div > div > div.bg-white > div > div > div.Grid-module_grid__qkVbd._3yW3_ > div:nth-child(${pos}) > div.mt-16._1bQXZ > div:nth-child(1) > span > div > span`
        );

        await page.click(
          `#subapp-main-0 > div > div:nth-child(1) > div > div > div.bg-white > div > div > div.Grid-module_grid__qkVbd._3yW3_ > div:nth-child(${pos}) > div.mt-16._1bQXZ > div:nth-child(1) > div > div > div > div:nth-child(3) > div > div > div > table > tbody > tr:nth-child(2) > td:nth-child(1)`
        );
        await page.waitForTimeout(3000);
        await page.waitForSelector(
          `#subapp-main-0 > div > div:nth-child(1) > div > div > div.bg-white > div > div > div.Grid-module_grid__qkVbd._3yW3_ > div:nth-child(${pos}) > div.mt-16._1bQXZ > div:nth-child(1) > span > div > span`
        );
        await page.click(
          `#subapp-main-0 > div > div:nth-child(1) > div > div > div.bg-white > div > div > div.Grid-module_grid__qkVbd._3yW3_ > div:nth-child(${pos}) > div.mt-16._1bQXZ > div:nth-child(1) > span > div > span`
        );
        await page.click(
          `#subapp-main-0 > div > div:nth-child(1) > div > div > div.bg-white > div > div > div.Grid-module_grid__qkVbd._3yW3_ > div:nth-child(${pos}) > div.mt-16._1bQXZ > div:nth-child(1) > div > div > div > div:nth-child(3) > div > div > div > table > tbody > tr:nth-child(1) > td:nth-child(1)`
        );
        let jsonResponse = await page.waitForResponse(
          (response) =>
            response.url() ===
              "https://seller.walmart.com/performance/graphql" &&
            response
              .request()
              .postData()
              .startsWith(
                `{"query":"query performance_getKpiSummary($kpiInput: [KpiInputDTO!])`
              ),
          20
        );
        let jsonData = await jsonResponse.json();
        let kpi_data =
          jsonData["data"]["performance_getKpiSummary"][kpires][0][val];
        return kpi_data;
      };
      let percOtd = await getKpi("1", "OTD", "otdKpiResponse", "percOtd");
      let percVtr = await getKpi("2", "VTR", "vtrKpiResponse", "percVtr");
      let percSRR = await getKpi(
        "3",
        "RESPONSIVENESS",
        "responsivenessKpiResponse",
        "percSRR"
      );
      let perRefundRate = await getKpi(
        "4",
        "REFUND",
        "refundKpiResponse",
        "perSellerFaultOverallRate"
      );
      let perCanRate = await getKpi(
        "5",
        "CANCEL",
        "cancelKpiResponse",
        "overallRate"
      );
      result["percOtd"] = percOtd;
      result["percVtr"] = percVtr;
      result["percSRR"] = percSRR;
      result["perRefundRate"] = perRefundRate;
      result["perCanRate"] = perCanRate;

      console.log(percOtd, percVtr, percSRR, perRefundRate, perCanRate);

      return result;
    };
    let writeSheet = async (result, id) => {
      let resSheet = doc.sheetsById[id];
      await resSheet.loadCells("A1:U1000");
      resSheet.getCell(2, 2).value = result["rating"];
      resSheet.getCell(4, 3).value = result["percOtd"] / 100;
      resSheet.getCell(5, 3).value = result["perCanRate"] / 100;
      resSheet.getCell(6, 3).value = result["percVtr"] / 100;
      resSheet.getCell(7, 3).value = result["percSRR"] / 100;
      resSheet.getCell(8, 3).value = result["perRefundRate"] / 100;
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
      let data = result["data"];
      // let parseTexint = (text) => {
      //   if (text) {
      //     if (text.includes(".")) {
      //       if (text.startsWith(".")) {
      //         return parseFloat(`0${text}`);
      //       } else {
      //         return parseFloat(text);
      //       }
      //     } else {
      //       return parseInt(text);
      //     }
      //   } else {
      //     return text;
      //   }
      // };
      for (let n = 0; n < data.length; n++) {
        let row_data = data[n];
        // let dateFormat = new Date(parseInt(row_data[0]));
        // let date_sh =
        //   dateFormat.getDate() +
        //   "/" +
        //   (dateFormat.getMonth() + 1) +
        //   "/" +
        //   dateFormat.getFullYear();
        resSheet.getCell(12 + n, 0).value = row_data["rptDt"];
        resSheet.getCell(12 + n, 1).value = row_data["TotalGMV"];
        resSheet.getCell(12 + n, 2).value = row_data["GMVPercentageChange"];
        resSheet.getCell(12 + n, 3).value =
          row_data["TotalGMVWithoutCommission"];
        resSheet.getCell(12 + n, 4).value = row_data["TotalUnits"];
        resSheet.getCell(12 + n, 5).value = row_data["TotalAuthOrders"];
        resSheet.getCell(12 + n, 6).value = row_data["AUR"];
        if (n % 10 == 0) {
          await retry(
            () => Promise.all([resSheet.saveUpdatedCells()]),
            5,
            true,
            10000
          );
        }
      }
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
    };
    let result_data = await grabData();
    await writeSheet(result_data, "900356943");
    // console.log(result);

    // await page.goto(
    //   "https://communityminerals-f099fc.pipedrive.com/auth/logout",
    //   {
    //     waitUntil: "networkidle0",
    //   }
    // );

    // for (let i = 0; i < result.length; i++) {
    //   newSheet.getCell(i + 4, 0).value = result[i]["name"];
    //   newSheet.getCell(i + 4, 1).value = result[i]["unique"];
    //   newSheet.getCell(i + 4, 2).value = result[i]["serial"];
    //   newSheet.getCell(i + 4, 3).value = result[i]["mailing"];
    //   newSheet.getCell(i + 4, 4).value = result[i]["county"];
    //   newSheet.getCell(i + 4, 5).value = result[i]["id"];
    //   newSheet.getCell(i + 4, 6).value = result[i]["deal"];
    // }
    // console.log("PipeDrive Done");
    // newSheet.getCell(1, 1).value = "OK";
    // let date = new Date();
    // newSheet.getCell(1, 0).value = date.toLocaleString("en-US", cstOptions);
    // await retry(
    //   () => Promise.all([newSheet.saveUpdatedCells()]),
    //   5,
    //   true,
    //   10000
    // );
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(7, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(7, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Walmart Error");
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(7, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(7, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    // await page.goto(
    //   "https://communityminerals-f099fc.pipedrive.com/auth/logout",
    //   {
    //     waitUntil: "networkidle0",
    //   }
    // );
    // newSheet.getCell(1, 1).value = "ERROR";
    // let date = new Date();
    // newSheet.getCell(1, 0).value = date.toLocaleString("en-US", cstOptions);
    // await retry(
    //   () => Promise.all([newSheet.saveUpdatedCells()]),
    //   5,
    //   true,
    //   10000
    // );
    // await retry(
    //   () => Promise.all([newSheet.saveUpdatedCells()]),
    //   5,
    //   true,
    //   10000
    // );
    // await browser.close();
  }
};

const ppcWalmart = async function () {
  const directory = "download";

  fs.readdir(directory, (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join(directory, file), (err) => {
        if (err) throw err;
      });
    }
  });
  const doc = new GoogleSpreadsheet(
    "1DrG1p3is3QqScFgBboIRFrgwb4Gio9T6MbX1D75R9fM"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(7, 1).value = "";
  settingSheet.getCell(7, 2).value = "RUNNING";
  settingSheet.getCell(7, 4).value = "";

  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  const page = await browser.newPage();
  const downloadPath = path.resolve("./download");

  try {
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadPath,
    });
    await page.setViewport({ width: 1024, height: 1600 });
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://seller.walmart.com/", {
      waitUntil: "networkidle0",
    });
    let username = settingSheet.getCell(7, 6).value;
    let password = settingSheet.getCell(7, 7).value;

    await page.type('input[data-automation-id="uname"]', username);
    await page.type('input[data-automation-id="pwd"]', password);
    await page.waitForTimeout(2000);

    await page.click('button[data-automation-id="loginBtn"]');

    await page.waitForTimeout(5000);

    await page.waitForFunction("window.location.pathname == '/home'", {
      timeout: 500000,
    });

    const grabData = async () => {
      await page.goto(`https://advertising.walmart.com/view/home`);
      await page.click('button[data-automation-id="button-login-as-seller"]');
      await page.waitForFunction("window.location.pathname == '/view/home'", {
        timeout: 500000,
      });
      await page.goto(
        `https://advertising.walmart.com/view/report/custom/advertiser/260112`,
        { waitUntil: "networkidle2" }
      );
      const selector = "div.icon-label-container > div.saved-report-name";

      const rect = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const { x, y } = element.getBoundingClientRect();
        return { x, y };
      }, selector);
      if (rect) {
        console.log(rect);

        await page.mouse.click(rect.x, rect.y, { clickCount: 2, delay: 100 });
        await page.click(selector, { clickCount: 2, delay: 100 });
      } else {
        console.error("Element Not Found");
      }
      const finalResponse = await page.waitForResponse(
        (response) =>
          response.url() ===
            "https://advertising.walmart.com/custom-report?advertiserId=260112" &&
          response
            .request()
            .postData()
            .startsWith(
              '{"dataCube":"wpa_daily_summary_by_item_v2","expression":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"apply","operand":{"op":"literal","value":'
            ),
        20
      );
      const finalResponse2 = await page.waitForResponse(
        (response) =>
          response.url() ===
            "https://advertising.walmart.com/custom-report?advertiserId=260112" &&
          response.request().postData().includes("item_id"),
        20
      );
      let responseJson = await finalResponse2.json();
      let data = responseJson["result"]["data"][0]["SPLIT"]["data"];
      let results = [];
      for (let d = 0; d < data.length; d++) {
        let order = data[d];
        if (order["sum_14_day_quantity_total"] != 0) {
          let items = order["SPLIT"]["data"];
          for (let t = 0; t < items.length; t++) {
            let item = items[t];
            if (item["sum_14_day_quantity_total"] != 0) {
              results.push({
                time: order["__time"]["start"],
                item_id: item["item_id"],
                qty: item["sum_14_day_quantity_total"],
                total: item["sum_14_day_revenue_total"],
              });
            }
          }
        }
      }
      console.log(results);
      for (let r = 0; r < results.length; r++) {
        let result = results[r];
        await page.goto(
          `https://seller.walmart.com/items-and-inventory/manage-items?filters=%7B%22itemId%22%3A%7B%22op%22%3A%22contains%22%2C%22value%22%3A%5B%7B%22key%22%3A%22val%22%2C%22value%22%3A%22${result["item_id"]}%22%7D%5D%7D%7D`,
          {
            waitUntil: "networkidle0",
          }
        );
        let [sku] = await page.$x('//div[contains(text(),"SKU: ")]');
        let sku_text = await page.evaluate(
          (sku) => (sku ? sku.innerText : ""),
          sku
        );
        console.log(sku_text);
        if (sku) {
          let response = await axios.get(
            `https://cheapr.my.id/caproduct/?sku=${sku_text
              .replace("SKU: ", "")
              .trim()}`
          );
          let api_data = response.data.results;
          console.log(response.data);
          if (api_data.length > 0) {
            let ca_data = api_data[0];

            let payload = {
              product: ca_data["pk"],
              date: result["time"].slice(0, 10),
              price: result["total"] / result["qty"],
              qty: result["qty"],
              platform: "Walmart",
              order_number: "",
            };
            console.log(payload);

            let post_res = await axios.post(
              "https://cheapr.my.id/ppc_order/",
              (data = payload)
            );
            console.log(post_res.data);
          }
        }
      }
    };
    let writeSheet = async (result, id) => {
      let resSheet = doc.sheetsById[id];
      await resSheet.loadCells("A1:U1000");
      resSheet.getCell(2, 2).value = result["rating"];
      resSheet.getCell(4, 3).value = result["percOtd"] / 100;
      resSheet.getCell(5, 3).value = result["perCanRate"] / 100;
      resSheet.getCell(6, 3).value = result["percVtr"] / 100;
      resSheet.getCell(7, 3).value = result["percSRR"] / 100;
      resSheet.getCell(8, 3).value = result["perRefundRate"] / 100;
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
      let data = result["data"];
      // let parseTexint = (text) => {
      //   if (text) {
      //     if (text.includes(".")) {
      //       if (text.startsWith(".")) {
      //         return parseFloat(`0${text}`);
      //       } else {
      //         return parseFloat(text);
      //       }
      //     } else {
      //       return parseInt(text);
      //     }
      //   } else {
      //     return text;
      //   }
      // };
      for (let n = 0; n < data.length; n++) {
        let row_data = data[n];
        // let dateFormat = new Date(parseInt(row_data[0]));
        // let date_sh =
        //   dateFormat.getDate() +
        //   "/" +
        //   (dateFormat.getMonth() + 1) +
        //   "/" +
        //   dateFormat.getFullYear();
        resSheet.getCell(12 + n, 0).value = row_data["rptDt"];
        resSheet.getCell(12 + n, 1).value = row_data["TotalGMV"];
        resSheet.getCell(12 + n, 2).value = row_data["GMVPercentageChange"];
        resSheet.getCell(12 + n, 3).value =
          row_data["TotalGMVWithoutCommission"];
        resSheet.getCell(12 + n, 4).value = row_data["TotalUnits"];
        resSheet.getCell(12 + n, 5).value = row_data["TotalAuthOrders"];
        resSheet.getCell(12 + n, 6).value = row_data["AUR"];
        if (n % 10 == 0) {
          await retry(
            () => Promise.all([resSheet.saveUpdatedCells()]),
            5,
            true,
            10000
          );
        }
      }
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
    };
    await grabData();

    // for (let i = 0; i < result.length; i++) {
    //   newSheet.getCell(i + 4, 0).value = result[i]["name"];
    //   newSheet.getCell(i + 4, 1).value = result[i]["unique"];
    //   newSheet.getCell(i + 4, 2).value = result[i]["serial"];
    //   newSheet.getCell(i + 4, 3).value = result[i]["mailing"];
    //   newSheet.getCell(i + 4, 4).value = result[i]["county"];
    //   newSheet.getCell(i + 4, 5).value = result[i]["id"];
    //   newSheet.getCell(i + 4, 6).value = result[i]["deal"];
    // }
    // console.log("PipeDrive Done");
    // newSheet.getCell(1, 1).value = "OK";
    // let date = new Date();
    // newSheet.getCell(1, 0).value = date.toLocaleString("en-US", cstOptions);
    // await retry(
    //   () => Promise.all([newSheet.saveUpdatedCells()]),
    //   5,
    //   true,
    //   10000
    // );
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(7, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(7, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    // await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Walmart Error");
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(7, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(7, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    // await page.goto(
    //   "https://communityminerals-f099fc.pipedrive.com/auth/logout",
    //   {
    //     waitUntil: "networkidle0",
    //   }
    // );
    // newSheet.getCell(1, 1).value = "ERROR";
    // let date = new Date();
    // newSheet.getCell(1, 0).value = date.toLocaleString("en-US", cstOptions);
    // await retry(
    //   () => Promise.all([newSheet.saveUpdatedCells()]),
    //   5,
    //   true,
    //   10000
    // );
    // await retry(
    //   () => Promise.all([newSheet.saveUpdatedCells()]),
    //   5,
    //   true,
    //   10000
    // );
    // await browser.close();
  }
};
const commision = async function () {
  const doc = new GoogleSpreadsheet(
    "10t5hyzy-a4qKkJvTVkbizUbAJh2Aicw1mpn5OrU06yA"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
    userDataDir: "./user_data",
  });
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://scanprint.myshopify.com/admin/", {
      waitUntil: "networkidle2",
    });
    let url = await page.url();
    if (!url.includes("/admin")) {
      await page.type("#account_email", "ronpaolodinampo@gmail.com");
      await page.waitForTimeout(2000);
      await page.click('button[type="submit"]');
      await page.type("#account_password", "Morpheus02!");
      await page.waitForTimeout(10000);
      await page.click('button[type="submit"]');
      // await page.type("#account_tfa_code", "");
      await page.waitForTimeout(120000);
    }
    const grabData = async () => {
      let result = [];
      await page.goto(
        "https://scanprint.myshopify.com/admin/orders?inContextTimeframe=last_30_days"
      );
      const finalResponse = await page.waitForResponse(async (response) => {
        return (
          response.url() ===
            "https://scanprint.myshopify.com/admin/internal/web/graphql/core?operation=OrderListData&type=query" &&
          Object.keys(await response.json()).length > 0
        );
      }, 20);
      let responseJson = await finalResponse.json();
      let business_report = responseJson["data"]["ordersList"]["edges"];
      console.log(business_report);
      for (let i = 0; i < business_report.length; i++) {
        let order = {};
        let id = business_report[i]["node"]["id"].replace(
          "gid://shopify/Order/",
          ""
        );
        await page.goto(`https://scanprint.myshopify.com/admin/orders/${id}`, {
          waitUntil: "networkidle2",
        });
        let [subtotal] = await page.$x(
          '//span[contains(text(),"Subtotal")]//parent::span//following-sibling::div/div/div/div/span'
        );
        let sub = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          subtotal
        );
        let [shipping] = await page.$x(
          '//span[contains(text(),"Shipping")]//parent::span//following-sibling::div/div/div/div/span'
        );
        let ship = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          shipping
        );
        let [total] = await page.$x(
          '//span[contains(text(),"Total")]//parent::span//following-sibling::div/div/div/div/span'
        );
        let tot = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          total
        );
        let [refunded] = await page.$x(
          '//span[contains(text(),"Total")]//parent::span//following-sibling::div/div/div/div/span'
        );
        let ref = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          refunded
        );
        let [net_payment] = await page.$x(
          '//span[contains(text(),"Net payment")]//parent::span//following-sibling::div/div/div/div/span'
        );
        let net = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          net_payment
        );
        let order_id = await page.$eval("h1", (el) => el.innerText);
        let [sku_el] = await page.$x('//span[contains(text(),"SKU:")]');
        let sku = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          sku_el
        );
        let [date_text] = await page.$x(
          "//h1//parent::div//parent::div//parent::div//following-sibling::div/div/div/span"
        );
        let date_t = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          date_text
        );
        order["id"] = order_id;
        order["date"] = date_t;
        order["subtotal"] = sub;
        order["shipping"] = ship;
        order["total"] = tot;
        order["refund"] = ref;
        order["net"] = net;
        order["sku"] = sku;
        result.push(order);
      }

      return result;
    };
    let parseTexint = (text) => {
      if (text && typeof text === "string") {
        if (text.includes(".")) {
          if (text.startsWith(".")) {
            return parseFloat(`0${text}`);
          } else {
            return parseFloat(text);
          }
        } else {
          return parseInt(text);
        }
      } else {
        return text;
      }
    };
    let writeSheet = async (result, id) => {
      let resSheet = doc.sheetsById[id];
      await resSheet.loadCells("A1:AB1000");
      resSheet.getCell(2, 2).value = result["rating"];
      resSheet.getCell(4, 3).value = result["otdr"];
      resSheet.getCell(5, 3).value = result["cr"];
      resSheet.getCell(6, 3).value = result["lsr"];
      resSheet.getCell(
        4,
        5
      ).value = `${result["otdr_with_defect"]} of ${result["otdr_total"]} orders`;
      resSheet.getCell(
        5,
        5
      ).value = `${result["cr_with_defect"]} of ${result["cr_total"]} orders`;
      resSheet.getCell(
        6,
        5
      ).value = `${result["lsr_with_defect"]} of ${result["lsr_total"]} orders`;

      let data = result["data"]["data"];
      let latest_date = new Date(Date.parse(resSheet.getCell(16, 0).value));
      console.log(latest_date);
      let added_row = false;
      for (let n = 0; n < data.length; n++) {
        let row_data = data[n];
        let dateFormat = new Date(parseInt(row_data[0]) * 1000);
        if (
          dateFormat.setHours(0, 0, 0, 0) > latest_date.setHours(0, 0, 0, 0)
        ) {
          added_row = true;
          resSheet.insertDimension(
            "ROWS",
            { startIndex: 16, endIndex: 17 },
            false
          );
          await retry(
            () => Promise.all([resSheet.saveUpdatedCells()]),
            5,
            true,
            10000
          );
          let date_sh =
            dateFormat.getMonth() +
            1 +
            "/" +
            dateFormat.getDate() +
            "/" +
            dateFormat.getFullYear();
          console.log(
            "new data: ",
            date_sh,
            dateFormat.getTime(),
            latest_date.getTime()
          );
          resSheet.getCell(16, 0).value = date_sh.toString();
          resSheet.getCell(16, 1).value = parseTexint(row_data[1]);
          resSheet.getCell(16, 2).value = parseTexint(row_data[2]);
          resSheet.getCell(16, 3).value = parseTexint(row_data[3]);
          resSheet.getCell(16, 4).value = parseTexint(row_data[4]);
          resSheet.getCell(16, 5).value = parseTexint(row_data[23]);
          resSheet.getCell(16, 6).value = parseTexint(row_data[24]);
          resSheet.getCell(16, 7).value = parseTexint(row_data[25]) / 100;
          resSheet.getCell(16, 8).value = parseTexint(row_data[26]) / 100;
          resSheet.getCell(16, 9).value = parseTexint(row_data[29]) / 100;
          resSheet.getCell(16, 10).value = parseTexint(row_data[30]) / 100;
          resSheet.getCell(16, 13).value = parseTexint(row_data[33]);
          resSheet.getCell(16, 14).value = parseTexint(row_data[34]) / 100;
          resSheet.getCell(16, 17).value = row_data[35] - row_data[36];

          if (n % 10 == 0) {
            await retry(
              () => Promise.all([resSheet.saveUpdatedCells()]),
              5,
              true,
              10000
            );
          }
        }
      }
      if (added_row) {
        resSheet.getCell(16, 11).value = parseTexint(
          parseFloat(result["odr"]) / 100
        );
        resSheet.getCell(16, 16).value = parseTexint(
          parseFloat(result["vtr"]) / 100
        );
        resSheet.getCell(16, 17).value = result["pos_feedback"];

        resSheet.getCell(16, 18).value = parseTexint(
          parseFloat(result["lsr"]) / 100
        );
        resSheet.getCell(16, 19).value = parseTexint(
          parseFloat(result["otdr"]) / 100
        );
        resSheet.getCell(16, 20).value = parseTexint(
          parseFloat(result["cr"]) / 100
        );
        resSheet.getCell(16, 26).formula = "=A17";
        resSheet.getCell(16, 27).formula = "=VLOOKUP(Y17,A$16:T$51,Z$14,FALSE)";
      }
      await retry(
        () => Promise.all([resSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
    };
    let result_data = await grabData();

    // await writeSheet(result_data, "753769627");
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Amazon Aziz Error");
    await browser.close();
  }
};

const bhphotovideo = async function () {
  const start = new Date();
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(16, 1).value = "";
  settingSheet.getCell(16, 2).value = "RUNNING";

  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );

  puppeteer.use(StealthPlugin());
  let browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  let page = await browser.newPage();
  let results = [];
  let visited = [];

  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://www.bhphotovideo.com/", {
      waitUntil: "networkidle2",
    });
    const checkBlock = async (url) => {
      let block = await page.evaluate(() => {
        let el = document.querySelector("#px-captcha");
        return el ? true : false;
      });
      let [blocked] = await page.$x(
        '//*[contains(text(),"Before we continue")]'
      );
      let h1 = await page.evaluate(() => {
        let el = document.querySelector("h1");
        return el ? true : false;
      });
      if (block || blocked) {
        await browser.close();
        await new Promise((r) => setTimeout(r, 10000));

        browser = await puppeteer.launch({
          headless: false,
          args: ["--no-sandbox"],
          executablePath: executablePath(),
        });
        page = await browser.newPage();
        await page.setJavaScriptEnabled(true);
        await page.setDefaultNavigationTimeout(0);
        await page.goto(url, {
          waitUntil: "networkidle2",
        });
        await checkBlock(url);
      }
    };
    let response = await axios.post(
      "https://cheapr.my.id/get_mpns",
      { site: "B&H" },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    let jsonData = await response.data;
    console.log("B&H", jsonData.length);
    for (let i = 0; i < jsonData.length; i++) {
      await sleep(5000);
      let source = jsonData[i]["mpn"];
      if (source && source in visited) {
        let getdata = results.find((e) => {
          e.source == source;
        });
        let newdata = { ...getdata, idx: i };
        results.push(newdata);
        console.log("Already visited");
        console.log(newdata);
        continue;
      }

      settingSheet.getCell(16, 6).value = i;
      if (i % 20 == 0) {
        await retry(
          () => Promise.all([settingSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
      }
      visited.push(source);
    }
    // bhphotovideocsvWriter
    //   .writeRecords(results)
    //   .then(() => console.log("The CSV file was written successfully"));
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    let dateFormat = new Date();
    settingSheet.getCell(16, 6).value = 0;

    settingSheet.getCell(16, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(16, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("bhphotovideo Error");
    // bhphotovideocsvWriter
    //   .writeRecords(results)
    //   .then(() => console.log("The CSV file was written successfully"));
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);

    let dateFormat = new Date();

    settingSheet.getCell(16, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(16, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
    await new Promise((r) => setTimeout(r, 3000));
    await bhphotovideo();
  }
};

const adorama = async function () {
  const start = new Date();
  const doc = new GoogleSpreadsheet(
    "1FJbWE8ObEqcnJK-1QQ1iLzfOeQFPO891CKwUFJK_kUI"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  let resSheet = doc.sheetsById["1771276982"];
  await resSheet.loadCells("H1:H1500");
  await resSheet.loadCells("AJ1:AJ1500");
  // Create a custom puppeteer-extra instance using `addExtra`,
  // so we could create additional ones with different plugin config.
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(15, 1).value = "";
  settingSheet.getCell(15, 2).value = "RUNNING";
  let first = settingSheet.getCell(15, 6).value;
  let last = settingSheet.getCell(15, 7).value;
  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());

  let browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  let page = await browser.newPage();
  let results = [];
  let visited = [];
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://www.adorama.com/", {
      waitUntil: "networkidle2",
    });
    const checkBlock = async (url) => {
      let block = await page.evaluate(() => {
        let el = document.querySelector("#px-captcha");
        return el ? true : false;
      });
      let [blocked] = await page.$x(
        '//*[contains(text(),"Before we continue")]'
      );
      let h1 = await page.evaluate(() => {
        let el = document.querySelector("h1");
        return el ? true : false;
      });
      if (block || blocked) {
        await browser.close();
        await new Promise((r) => setTimeout(r, 10000));

        browser = await puppeteer.launch({
          headless: false,
          args: ["--no-sandbox"],
          executablePath: executablePath(),
        });
        page = await browser.newPage();
        await page.setJavaScriptEnabled(true);
        await page.setDefaultNavigationTimeout(0);
        await page.goto(url, {
          waitUntil: "networkidle2",
        });
        await checkBlock(url);
      }
    };

    let response = await axios.post(
      "https://cheapr.my.id/get_mpns",
      { site: "Adorama" },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    let jsonData = await response.data;
    console.log("Adorama", jsonData.length);
    for (let i = 0; i < jsonData.length; i++) {
      let source = jsonData[i]["mpn"];
      let data = await get_adorama(page, source);
      await updateProduct(
        "Adorama",
        data["source"],
        data["price"],
        data["in_stock"],
        data["h1"],
        data["link1"]
      );
    }
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    let dateFormat = new Date();
    settingSheet.getCell(15, 6).value = 0;
    settingSheet.getCell(15, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(15, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Adorama Error");
    // AdoramacsvWriter.writeRecords(results).then(() =>
    //   console.log("The CSV file was written successfully")
    // );
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    let dateFormat = new Date();

    settingSheet.getCell(15, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(15, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
    await new Promise((r) => setTimeout(r, 3000));
    await adorama();
  }
};
const barcodesinc = async function () {
  const start = new Date();
  const doc = new GoogleSpreadsheet(
    "1FJbWE8ObEqcnJK-1QQ1iLzfOeQFPO891CKwUFJK_kUI"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  let resSheet = doc.sheetsById["1771276982"];
  await resSheet.loadCells("H1:H1500");
  await resSheet.loadCells("AH1:AH1500");

  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(17, 1).value = "";
  settingSheet.getCell(17, 2).value = "RUNNING";
  let first = settingSheet.getCell(17, 6).value;
  let last = settingSheet.getCell(17, 7).value;
  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());
  let browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  let page = await browser.newPage();
  let results = [];
  let visited = [];
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);

    let response = await axios.post(
      "https://cheapr.my.id/get_mpns",
      { site: "Barcodes Inc" },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    let jsonData = await response.data;
    console.log("Barcodes Inc", jsonData.length);
    for (let i = 0; i < jsonData.length; i++) {
      let source = jsonData[i]["mpn"];
      let data = await get_barcodesinc(page, source);
      settingSheet.getCell(17, 6).value = i;
      await retry(
        () => Promise.all([settingSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
      visited.push(source);
    }
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    let dateFormat = new Date();
    settingSheet.getCell(17, 6).value = 0;
    settingSheet.getCell(17, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(17, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Barcodesinc Error");
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    let dateFormat = new Date();

    settingSheet.getCell(17, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(17, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
    await new Promise((r) => setTimeout(r, 3000));
    await barcodesinc();
  }
};
const get_bhphotovideo = async function (page, source) {
  try {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source;
      await page.goto(
        `https://www.bhphotovideo.com/c/search?q=${text}&sts=ma`,
        {
          waitUntil: "networkidle2",
        }
      );
      await checkBlock(page);
      let products = await page.$$eval(
        'div[data-selenium="miniProductPage"]',
        (trs, text) => {
          return trs.map((tr) => {
            let link = "";
            if (
              tr
                .querySelector(
                  'div > div[data-selenium="miniProductPageDescription"] > div[data-selenium="miniProductPageProductSkuInfo"]'
                )
                .innerText.includes("MFR #") &&
              tr
                .querySelector(
                  'div > div[data-selenium="miniProductPageDescription"] > div[data-selenium="miniProductPageProductSkuInfo"]'
                )
                .innerText.replace(/(\r\n|\n|\r)/gm, "")
                .split("MFR #")[1]
                .trim() ==
                (typeof text == "string" ? text.trim() : text.toString())
            ) {
              link = tr
                .querySelector(
                  'div > div[data-selenium="miniProductPageDescription"] > h3 > a'
                )
                .getAttribute("href");
            }
            return link;
          });
        },
        text
      );
      products = products.filter((link) => {
        return link != "";
      });
      let link1 = "";
      let price = "";
      let h1 = "";
      let in_stock = "";
      if (products.length > 0) {
        link1 = `https://www.bhphotovideo.com${products[0]}`;
        await page.goto(link1, {
          waitUntil: "networkidle2",
        });
        price = await page.evaluate(() => {
          let el = document.querySelector('div[data-selenium="pricingPrice');
          return el ? el.innerText : "";
        });
        in_stock = await page.evaluate(() => {
          let el = document.querySelector('span[data-selenium="stockStatus"]');
          return el ? el.innerText : "";
        });
        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
      }
      let data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      if (price) {
        in_stock = in_stock == "In Stock";
        data["in_stock"] = in_stock;
        return data;
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch {
    let data = await get_bhphotovideo(page, source);
    return data;
  }
};
const get_adorama = async function (page, source) {
  try {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.adorama.com/l/?searchinfo=${text}`, {
        waitUntil: "networkidle2",
      });
      await checkBlock(page);
      let [not_found] = await page.$x(
        '//h1[contains(text(),"Sorry, we didn")]'
      );
      let products = await page.$$eval(
        "#productGridPlaceholder > div > div.item-list.clear.style-is-list > div",
        (trs, text) => {
          return trs.map((tr) => {
            let link = "";
            if (
              tr.querySelector(
                "div.item-details > p.item-ids > i:nth-child(2)"
              ) &&
              tr
                .querySelector("div.item-details > p.item-ids > i:nth-child(2)")
                .innerText.includes("MFR:") &&
              tr
                .querySelector("div.item-details > p.item-ids > i:nth-child(2)")
                .innerText.replace(/(\r\n|\n|\r)/gm, "")
                .replace("MFR:", "")
                .trim() ==
                (typeof text == "string" ? text.trim() : text.toString())
            ) {
              link = tr.querySelector("a").getAttribute("href");
            }
            return link;
          });
        },
        text
      );
      products = products.filter((link) => {
        return link != "";
      });
      let link1 = "";
      let price = "";
      let h1 = "";
      let in_stock = "";
      if (products.length > 0) {
        link1 = products[0];
        await page.goto(link1, {
          waitUntil: "networkidle2",
        });
      }

      let url = await page.url();
      if (!not_found && !url.includes("l/?searchinfo=")) {
        let mpn = await page.evaluate(() => {
          let el = document.querySelector(
            "#product-container > section > div.product-info-container.col1 > div.primary-info-sub.clear.cf > div.prod-id > i:nth-child(2) > span"
          );
          return el ? el.innerText.replace("-", "") : "";
        });
        price = await page.evaluate(() => {
          let el = document.querySelector("strong.your-price");
          return el ? el.innerText : "";
        });
        in_stock = await page.evaluate(() => {
          let el = document.querySelector("div.av-stock");
          return el ? el.innerText : "";
        });
        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1 > span");
          return el ? el.innerText : "";
        });
        link1 = await page.url();

        in_stock = price
          ? in_stock.includes("In Stock") &&
            in_stock.includes("Ships from Manufacturer")
          : true;
        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        if (mpn.includes(text.replace("-", ""))) {
          console.log(data);
          return data;
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch {
    let data = await get_adorama(page, source);
    return data;
  }
};
const get_barcodesinc = async function (page, source) {
  try {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto("https://www.barcodesinc.com/search.htm?PA03770-B615", {
        waitUntil: "networkidle2",
      });
      await checkBlock(page);
      await page.waitForSelector(
        "#global-header > div.search-area > form > input.searchfield"
      );

      await page.evaluate(
        () =>
          (document.querySelector(
            "#global-header > div.search-area > form > input.searchfield"
          ).value = "")
      );
      await page.type(
        "#global-header > div.search-area > form > input.searchfield",
        text
      );
      await page.waitForSelector(
        "#global-header > div.search-area > form > input.searchbutton"
      );

      await page.click(
        "#global-header > div.search-area > form > input.searchbutton"
      );

      await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//p[contains(text(),"We could not find a product to match your search criteria.")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      let url = await page.url();
      if (!not_found) {
        let products = await page.$$eval(
          "#partstable > tbody > tr",
          (trs, text) => {
            return trs.map((tr) => {
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("td:nth-child(2) > span.modelname > a") &&
                tr
                  .querySelector("td:nth-child(2) > span.modelname > a")
                  .innerText.replace(")", "")
                  .split("(")[1] ==
                  (typeof text == "string" ? text.toUpperCase() : text)
              ) {
                objresult["price"] = tr.querySelector("td.pricecell > span")
                  ? tr.querySelector("td.pricecell > span").innerText
                  : "";
                objresult["name"] = tr.querySelector(
                  "td:nth-child(2) > span.modelname > a > b"
                )
                  ? tr.querySelector("td:nth-child(2) > span.modelname > a > b")
                      .innerText
                  : "";
                objresult["link"] = tr.querySelector(
                  "td:nth-child(2) > span.modelname > a"
                )
                  ? tr
                      .querySelector("td:nth-child(2) > span.modelname > a")
                      .getAttribute("href")
                  : "";
                objresult["in_stock"] = tr.querySelector(
                  "td:nth-child(2) > div.search-instock > span.message-instock"
                )
                  ? tr.querySelector(
                      "td:nth-child(2) > div.search-instock > span.message-instock"
                    ).innerText
                  : "";
              }
              return objresult;
            });
          },
          text
        );
        products = products.filter((p) => {
          return p["price"] != "";
        });
        if (products.length > 0) {
          price = products[0]["price"];
          h1 = products[0]["name"];
          link1 = products[0]["link"];
          in_stock = products[0]["in_stock"];
          let data = {
            source: source,
            link: link1,
            title: h1,
            price: price,
            in_stock: in_stock,
          };
          in_stock = price ? in_stock == "In Stock" : true;
          data["in_stock"] = in_stock;
          return data;
        } else {
          price = await page.evaluate(() => {
            let el = document.querySelector(
              "#addtocart-top > div > div:nth-child(1) > div > div.cost.price > span:nth-child(2)"
            );
            return el ? el.innerText : "";
          });
          in_stock = await page.evaluate(() => {
            let el = document.querySelector("div.instock");
            return el ? el.innerText : "";
          });
          h1 = await page.evaluate(() => {
            let el = document.querySelector("h1");
            return el ? el.innerText : "";
          });
          link1 = await page.url();
          let data = {
            source: source,
            link: link1,
            title: h1,
            price: price,
            in_stock: in_stock,
          };
          in_stock = price ? in_stock == "In Stock" : true;
          data["in_stock"] = in_stock;
          if (h1.includes(text) && price) {
            return data;
          } else {
            return null;
          }
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch {
    let data = await get_barcodesinc(page, source);
    return data;
  }
};
const get_provantage = async function (page, source) {
  try {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(
        `https://www.provantage.com/service/searchsvcs?QUERY=${source}&SUBMIT.x=21&SUBMIT.y=23`,
        {
          waitUntil: "networkidle2",
        }
      );

      // await page.evaluate(
      //   () =>
      //     (document.querySelector(
      //       "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(2) > input[type=text]"
      //     ).value = "")
      // );
      // await page.type(
      //   "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(2) > input[type=text]",
      //   text
      // );
      // await page.waitForSelector(
      //   "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(3) > input[type=image]"
      // );

      // await page.click(
      //   "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(3) > input[type=image]"
      // );

      // await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//h3[contains(text(),"Sorry, No Products Were Found Matching Your Query")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      let url = await page.url();
      if (!not_found) {
        let products = await page.$$eval(
          'div[class="BOX5B"]',
          (trs, text) => {
            return trs.map((tr) => {
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("p:nth-child(2)") &&
                tr
                  .querySelector("p:nth-child(2)")
                  .innerText.split("Part#")[1]
                  .trim() ==
                  (typeof text == "string"
                    ? text.toUpperCase()
                    : text.toString())
              ) {
                objresult["name"] = tr.querySelector("p:nth-child(1) > a")
                  ? tr.querySelector("p:nth-child(1) > a").innerText
                  : "";
                objresult["link"] = tr.querySelector("p:nth-child(1) > a")
                  ? tr.querySelector("p:nth-child(1) > a").getAttribute("href")
                  : "";
              }
              return objresult;
            });
          },
          text
        );
        if (products.length > 0) {
          link1 = products[0]["link"];
          await page.goto(`https://www.provantage.com${link1}`, {
            waitUntil: "networkidle2",
          });
        }

        let [price_el] = await page.$x(
          "//td[@id='Gprice']//following-sibling::td[@class='DT1']"
        );
        let price = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          price_el
        );

        let [stock_el] = await page.$x(
          '//div[@class="BOXV"]/div[@class="BTA"][2]/b/nobr/a[@class="BT1"]/div[@class="BT1"]'
        );
        let stock = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          stock_el
        );
        in_stock = stock.includes("IN STOCK");

        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
        link1 = await page.url();
        if (!price) {
          await page.click("div.BOXV > div.BTA > a > div > nobr");
          await page.waitForTimeout(3000);
          let id = await page.evaluate(() => {
            let el = document.querySelector("div.BOXV > script:nth-child(1)");
            return el ? el.innerText.split("'")[1].trim() : "";
          });
          if (id) {
            await page.goto(
              `https://www.provantage.com/service/cartsvcs/f/0/addchk/${id}?REFER=x`,
              {
                waitUntil: "networkidle2",
              }
            );
            price = await page.evaluate(() => {
              let el = document.querySelector("h1.RIGHT");
              return el ? el.innerText.replace("Your Price:", "").trim() : "";
            });
          }
        }
        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        return data;
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch {
    let data = await get_provantage(page, source);
    return data;
  }
};
const get_cdw = async function (page, source) {
  try {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.cdw.com/search/?key=${text}`, {
        waitUntil: "networkidle2",
      });

      // await page.evaluate(
      //   () => (document.querySelector("#search-input").value = "")
      // );
      // await page.type("#search-input", text);
      // await page.waitForSelector("#gh-header-button-search");

      // await page.click("#gh-header-button-search");

      // await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//span[contains(text(),"Uh-Oh! No Results Found.")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      if (!not_found) {
        let [price_el] = await page.$x('//meta[@itemprop="price"]');
        price = await page.evaluate(
          (element) => (element ? element.getAttribute("content") : ""),
          price_el
        );
        let [stock_el] = await page.$x(
          "//span[contains(text(),'Availability:')]//parent::div/span[2]"
        );
        let stock = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          stock_el
        );
        let [mpn_el] = await page.$x('//span[@itemprop="mpn"]');
        let mpn = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          mpn_el
        );
        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
        link1 = await page.url();
        let in_stock = stock.includes("In Stock");
        let clean_source = source.replace("[^0-9a-zA-Z]+", "");
        let clean_mpn = mpn.replace("[^0-9a-zA-Z]+", "");

        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        if (clean_mpn == clean_source) {
          return data;
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch {
    let data = await get_cdw(page, source);
    return data;
  }
};
const get_radwell = async function (page, source) {
  try {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.radwell.com/en-US/Search/?q=${text}`);
      await page.waitForSelector("h1");
      // await page.evaluate(() => (document.querySelector("#q").value = ""));
      // await page.type("#q", text);
      // await page.waitForSelector("#basicsearch > div > button");
      // await page.evaluate(() => {
      //   let el = document.querySelector("#basicsearch > div > button");
      //   el.click();
      // });

      // await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//span[contains(text(),"We couldn\'t find your item. Try refining your search.")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      if (!not_found) {
        let products = await page.$$eval(
          "#searchResults > div",
          (trs, text) => {
            return trs.map((tr) => {
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("div:nth-child(4) > h2") &&
                tr.querySelector("div:nth-child(4) > h2").innerText.trim() ==
                  (typeof text == "string"
                    ? text.toUpperCase()
                    : text.toString())
              ) {
                objresult["name"] = tr.querySelector("div:nth-child(2) > h2")
                  ? tr.querySelector("div:nth-child(2) > h2").innerText
                  : "";
                objresult["link"] = tr.querySelector("div.btnBuyOpt > a")
                  ? tr.querySelector("div.btnBuyOpt > a").getAttribute("href")
                  : "";
              }
              return objresult;
            });
          },
          text
        );
        products = products.filter((p) => {
          return p["link"] != "";
        });
        if (products.length > 0) {
          link1 = products[0]["link"];
          await page.goto(`https://www.radwell.com${link1}`);
          await page.waitForTimeout(3000);
        }
        let [price_el] = await page.$x(
          "//h3[contains(text(),'Surplus Never Used Radwell Packaging')]//parent::div/div/span/span"
        );
        price = await page.evaluate(
          (element) => (element ? element.innerText : ""),
          price_el
        );
        let [stock_el] = await page.$x(
          "//h3[contains(text(),'Surplus Never Used Radwell Packaging')]//parent::div//parent::div/div[5]/div/div[@class='stock instock']"
        );
        let stock = await page.evaluate(
          (element) => (element ? true : false),
          stock_el
        );
        h1 = await page.evaluate(() => {
          let el = document.querySelector("div.productHdr");
          return el ? el.innerText : "";
        });
        link1 = await page.url();
        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: stock,
        };
        if (price) {
          return data;
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch {
    let data = await get_radwell(page, source);
    return data;
  }
};
const allnew = async function () {
  puppeteer.use(StealthPlugin());
  let browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
    executablePath: executablePath(),
  });
  const doc = new GoogleSpreadsheet(
    "1FJbWE8ObEqcnJK-1QQ1iLzfOeQFPO891CKwUFJK_kUI"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  console.log(doc.title);
  const resSheet = doc.sheetsById["1771276982"];
  try {
    let rowCount = resSheet.rowCount;
    console.log(rowCount);
    let start = 1;
    let end = rowCount;
    await resSheet.loadCells(`H${start}:H${end}`);
    await resSheet.loadCells(`AG${start}:AL${end}`);
    for (let i = start; i < end; i++) {
      let source = resSheet.getCellByA1(`H${i}`).value;
      let price = resSheet.getCellByA1(`AG${i}`).value;
      if (source && !price) {
        let message = `Crawling New MPN: ${source} on Row ${i}`;
        let response = await axios.post(
          "https://cheapr.my.id/get_data",
          { mpn: source },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        let jsonData = await response.data;
        resSheet.getCellByA1(`AG2`).value = message;
        await retry(
          () => Promise.all([resSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
        let page = await browser.newPage();
        await page.authenticate({
          username: "cheapr",
          password: "Cheapr2023!",
        });
        await page.goto("https://www.google.com/", {
          waitUntil: "networkidle2",
        });
        console.log("==========================");
        console.log(message);
        console.log("==========================");

        let data = await get_adorama(page, source);
        console.log("Adorama", data);
        updateDataProduct("Adorama", data);
        resSheet.getCellByA1(`AJ${i}`).value = data ? data["price"] : "N/A";
        resSheet.getCellByA1(`AJ${i}`).backgroundColor =
          data && !data["in_stock"]
            ? {
                red: 0.81,
                green: 0.81,
                blue: 0.81,
                alpha: 0.81,
              }
            : {
                red: 1,
                green: 1,
                blue: 1,
                alpha: 1,
              };
        let data2 = await get_bhphotovideo(page, source);
        console.log("B&H", data2);
        updateDataProduct("B&H", data2);
        resSheet.getCellByA1(`AK${i}`).value = data2 ? data2["price"] : "N/A";
        resSheet.getCellByA1(`AK${i}`).backgroundColor =
          data2 && !data2["in_stock"]
            ? {
                red: 0.81,
                green: 0.81,
                blue: 0.81,
                alpha: 0.81,
              }
            : {
                red: 1,
                green: 1,
                blue: 1,
                alpha: 1,
              };
        let data3 = await get_barcodesinc(page, source);
        console.log("Barcodes Inc", data3);
        updateDataProduct("Barcodes Inc", data3);
        resSheet.getCellByA1(`AH${i}`).value = data3 ? data3["price"] : "N/A";
        resSheet.getCellByA1(`AH${i}`).backgroundColor =
          data3 && !data3["in_stock"]
            ? {
                red: 0.81,
                green: 0.81,
                blue: 0.81,
                alpha: 0.81,
              }
            : {
                red: 1,
                green: 1,
                blue: 1,
                alpha: 1,
              };
        let data4 = await get_provantage(page, source);
        console.log("Provantage", data4);
        updateDataProduct("Provantage", data4);
        resSheet.getCellByA1(`AG${i}`).value = data4 ? data4["price"] : "N/A";
        resSheet.getCellByA1(`AG${i}`).backgroundColor =
          data4 && !data4["in_stock"]
            ? {
                red: 0.81,
                green: 0.81,
                blue: 0.81,
                alpha: 0.81,
              }
            : {
                red: 1,
                green: 1,
                blue: 1,
                alpha: 1,
              };
        let data5 = await get_cdw(page, source);
        console.log("CDW", data5);
        updateDataProduct("CDW", data5);
        resSheet.getCellByA1(`AI${i}`).value = data5 ? data5["price"] : "N/A";
        resSheet.getCellByA1(`AI${i}`).backgroundColor =
          data5 && !data5["in_stock"]
            ? {
                red: 0.81,
                green: 0.81,
                blue: 0.81,
                alpha: 0.81,
              }
            : {
                red: 1,
                green: 1,
                blue: 1,
                alpha: 1,
              };
        let data6 = await get_radwell(page, source);
        console.log("Radwell", data6);
        updateDataProduct("Radwell", data6);
        resSheet.getCellByA1(`AL${i}`).value = data6 ? data6["price"] : "N/A";
        resSheet.getCellByA1(`AL${i}`).backgroundColor =
          data6 && !data6["in_stock"]
            ? {
                red: 0.81,
                green: 0.81,
                blue: 0.81,
                alpha: 0.81,
              }
            : {
                red: 1,
                green: 1,
                blue: 1,
                alpha: 1,
              };
        resSheet.getCellByA1(`AG2`).value = "";
        await retry(
          () => Promise.all([resSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
        break;
      }
    }

    console.log("Completed");
    await browser.close();
    await sleep(10000);
    allnew();
  } catch (e) {
    console.log("Error");
    await browser.close();
    await sleep(10000);
    allnew();
  }
};

const checker = async function () {
  const settingDoc = new GoogleSpreadsheet(
    "1wsxgrLmZrg1R7ywLeWgkpKqitZ369OGPTj9ukP__wL0"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsByTitle["Setting"];
  await settingSheet.loadCells("A1:E30");
  settingSheet.getCellByA1("E2").value = "RUNNING";
  settingSheet.getCellByA1("B2").value = "";
  settingSheet.getCellByA1("C2").value = "";
  settingSheet.getCellByA1("D2").value = "";
  settingSheet.clearRows({ start: "A5", end: "E30" });
  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  let resultSheet = settingDoc.sheetsByTitle["Results"];
  await resultSheet.loadCells("A1:F50");

  // for (let r = 2; r < 10; r++) {
  //   let keyword = settingSheet.getCellByA1("A" + r).value;
  //   settingSheet.getCellByA1("C" + r).value = keyword;
  //   console.log(keyword);
  // }

  // await retry(
  //   () => Promise.all([settingSheet.saveUpdatedCells()]),
  //   5,
  //   true,
  //   10000
  // );

  try {
    // let text = "Xerox W110";
    let text = settingSheet.getCellByA1("A2").value;
    puppeteer.use(StealthPlugin());
    let browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
      executablePath: executablePath(),
    });
    let page = await browser.newPage();
    await page.authenticate({
      username: "cheapr",
      password: "Cheapr2023!",
    });
    await page.goto(`https://www.google.com/`, {
      waitUntil: "networkidle2",
    });
    await page.waitForSelector('input[name="q"]');
    // await page.evaluate(
    //   (text) => (document.querySelector('input[name="q"]').value = text),
    //   text
    // );
    await page.type('input[name="q"]', text);

    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle0" });
    let stores = await page.$$eval(
      'div[data-attrid="organic_offers_grid"] > div > div',
      (trs, text) => {
        return trs.map((tr) => {
          let objresult = {
            name: "",
            title: "",
            stock: "",
            link: "",
            price: "",
          };
          objresult["link"] = tr.querySelector("div > a")
            ? tr.querySelector("div > a").getAttribute("href")
            : "";

          objresult["name"] = tr.querySelector(
            "div > a > div > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)"
          )
            ? tr.querySelector(
                "div > a > div > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)"
              ).textContent
            : "";
          objresult["title"] = tr.querySelector(
            "div > a > div > div:nth-child(1) > div:nth-child(2) > div:nth-child(2)"
          )
            ? tr.querySelector(
                "div > a > div > div:nth-child(1) > div:nth-child(2) > div:nth-child(2)"
              ).textContent
            : "";
          objresult["stock"] = tr.querySelector(
            "div > a > div > div:nth-child(1) > div:nth-child(2) > span"
          )
            ? tr.querySelector(
                "div > a > div > div:nth-child(1) > div:nth-child(2) > span"
              ).textContent
            : "";

          objresult["price"] = tr.querySelector(
            "div > a > div > div:nth-child(2) > div > span > span"
          )
            ? tr.querySelector(
                "div > a > div > div:nth-child(2) > div > span > span"
              ).textContent
            : "";
          return objresult;
        });
      },
      text
    );
    stores = stores.filter((obj) => {
      return obj["name"] != "";
    });
    let row = 5;

    for (const store of stores) {
      // console.log(store);
      settingSheet.getCellByA1("A" + row).value = store.name;
      settingSheet.getCellByA1("B" + row).value = store.title;
      settingSheet.getCellByA1("C" + row).value = store.stock;
      settingSheet.getCellByA1("D" + row).value = store.price;
      settingSheet.getCellByA1("E" + row).value = store.link;
      row = row + 1;
    }
    settingSheet.getCellByA1("E2").value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );

    await browser.close();
  } catch (e) {
    console.log(e);
    // await browser.close();
  }
};
const checker2 = async function () {
  const settingDoc = new GoogleSpreadsheet(
    "1wsxgrLmZrg1R7ywLeWgkpKqitZ369OGPTj9ukP__wL0"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsByTitle["Setting"];
  await settingSheet.loadCells("A1:F30");
  settingSheet.getCellByA1("E2").value = "RUNNING";
  settingSheet.getCellByA1("B2").value = "";
  settingSheet.getCellByA1("C2").value = "";
  settingSheet.getCellByA1("D2").value = "";
  settingSheet.clearRows({ start: "A5", end: "F30" });
  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  let resultSheet = settingDoc.sheetsByTitle["Results"];
  await resultSheet.loadCells("A1:F50");

  // for (let r = 2; r < 10; r++) {
  //   let keyword = settingSheet.getCellByA1("A" + r).value;
  //   settingSheet.getCellByA1("C" + r).value = keyword;
  //   console.log(keyword);
  // }

  // await retry(
  //   () => Promise.all([settingSheet.saveUpdatedCells()]),
  //   5,
  //   true,
  //   10000
  // );

  try {
    // let text = "Xerox W110";
    let text = settingSheet.getCellByA1("A2").value;
    puppeteer.use(StealthPlugin());
    let browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
      executablePath: executablePath(),
    });
    let page = await browser.newPage();
    await page.authenticate({
      username: "cheapr",
      password: "Cheapr2023!",
    });
    await page.goto(`https://shopping.google.com/`, {
      waitUntil: "networkidle2",
    });
    await page.waitForSelector('input[name="q"]');
    // await page.evaluate(
    //   (text) => (document.querySelector('input[name="q"]').value = text),
    //   text
    // );
    await page.type('input[name="q"]', text);

    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle0" });
    await page.click('span[title="New items"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });

    let [best] = await page.$x('//div[@class="sh-dp__cont"]');
    if (best) {
      let link1 = await page.evaluate(() => {
        let el = document.querySelector(
          "div.sh-dp__cont > div > div > div:nth-child(2) > div:nth-child(5) > div:nth-child(1) > div > a"
        );
        return el ? el.getAttribute("href") : "";
      });
      await page.goto(`https://www.google.com${link1}`, {
        waitUntil: "networkidle2",
      });
    } else {
      await page.waitForSelector("div.sh-pr__product-results > div");
      let products = await page.$$eval(
        "div.sh-pr__product-results > div",
        (trs) => {
          return trs.map((tr) => {
            let link = "";
            if (
              tr.querySelector(
                "div > div:nth-child(2) > div:nth-child(4) > div > a"
              ) &&
              tr
                .querySelector(
                  "div > div:nth-child(2) > div:nth-child(4) > div > a"
                )
                .innerText.includes("Compare prices")
            ) {
              link = tr
                .querySelector(
                  "div > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div > div > a"
                )
                .getAttribute("href");
            }
            return link;
          });
        }
      );
      console.log("Products found");
      products = products.filter((link) => {
        return link != "";
      });
      console.log(products);
      if (products.length > 0) {
        link1 = products[0];
        console.log(link1);
        await page.goto(`https://www.google.com${link1}`, {
          waitUntil: "networkidle2",
        });
      }
    }
    let low = await page.evaluate(() => {
      let el = document.querySelector(
        "div.sh-pricebar__details-section > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > span"
      );
      return el ? el.textContent : "";
    });
    let high = await page.evaluate(() => {
      let el = document.querySelector(
        "div.sh-pricebar__details-section > div:nth-child(3) > div:nth-child(2) > div:nth-child(2) > span"
      );
      return el ? el.textContent : "";
    });
    let [compare_el] = await page.$x('//a[contains(text(),"Compare price")]');
    let compare = await page.evaluate(
      (element) => (element ? element.getAttribute("href") : ""),
      compare_el
    );
    console.log(low, high);
    if (compare) {
      await page.goto(`https://www.google.com${compare}`, {
        waitUntil: "networkidle2",
      });
      let [new_filter] = await page.$x(
        // '//div[@id="sh-oo__filters-wrapper"]/div/a/span[contains(text(),"New")]'
        '//*[@id="sh-oo__filters-wrapper"]/div/a/span[contains(text(),"New")]'
      );
      if (new_filter) {
        console.log("Clicking New Filter");
        await new_filter.click();
        await page.waitForTimeout(10000);
      }

      let url = await page.url();

      let stores = await page.$$eval(
        "#sh-osd__online-sellers-cont > tr",
        (trs, text) => {
          return trs.map((tr) => {
            let objresult = {
              name: "",
              item: "",
              total: "",
              link: "",
              reputation: "",
              instock: "",
            };
            objresult["item"] = tr.querySelector("td:nth-child(3) > span")
              ? tr.querySelector("td:nth-child(3) > span").textContent
              : "";
            objresult["total"] = tr.querySelector(
              "td:nth-child(4) > div > div:nth-child(1)"
            )
              ? tr.querySelector("td:nth-child(4) > div > div:nth-child(1)")
                  .textContent
              : "";
            objresult["link"] = tr.querySelector("td:nth-child(5) > div > a")
              ? tr
                  .querySelector("td:nth-child(5) > div > a")
                  .getAttribute("href")
              : "";
            objresult["name"] = tr.querySelector(
              "td:nth-child(1) > div:nth-child(1)"
            )
              ? tr.querySelector("td:nth-child(1) > div:nth-child(1)")
                  .textContent
              : "";
            objresult["reputation"] = tr.querySelector(
              "td:nth-child(1) > div:nth-child(2)"
            )
              ? tr.querySelector("td:nth-child(1) > div:nth-child(2)")
                  .textContent
              : "";
            return objresult;
          });
        },
        text
      );
      // filter trusted store
      stores = stores.filter((obj) => {
        return obj["name"] != "" && obj["reputation"].includes("Trusted store");
      });
      console.log("stores found");
      // console.log(stores);

      // get data stock
      for (const store of stores) {
        // go to web store
        await page.goto(`https://www.google.com${store.link}`, {
          waitUntil: ["domcontentloaded", "networkidle2"],
          timeout: 0,
        });

        // check stock with schema or text contain in stock
        let inStock = "No";
        let source = await page.content({ waitUntil: "domcontentloaded" });
        if (
          source.includes("schema.org/InStock") ||
          source.toLowerCase().includes("in stock")
        ) {
          inStock = "Yes";
        }

        console.log(store.name + ":" + inStock);

        // update data stock
        store["instock"] = inStock;
      }

      let row = 5;
      settingSheet.getCellByA1("B2").value = low;
      settingSheet.getCellByA1("C2").value = high;
      settingSheet.getCellByA1("D2").value = url;

      for (const store of stores) {
        // console.log(store);
        settingSheet.getCellByA1("A" + row).value = store.name.replace(
          "Opens in a new window",
          ""
        );
        settingSheet.getCellByA1("B" + row).value = store.item;
        settingSheet.getCellByA1("C" + row).value = store.total;
        settingSheet.getCellByA1("D" + row).value = store.reputation
          .replace(
            "What makes this a trusted store?Customers may expect a positive shopping experience from this store. This includes the offer of fast shipping and easy returns, as well as good user ratings, among other factors. Learn more·",
            ""
          )
          .replace(
            "If anything goes wrong with your order, Google will help make it right.Learn more",
            ""
          );
        settingSheet.getCellByA1("E" + row).value = store.link
          ? "https://www.google.com" + store.link
          : "";

        settingSheet.getCellByA1("F" + row).value = store.instock;

        row = row + 1;
      }
      settingSheet.getCellByA1("E2").value = "COMPLETED";

      await retry(
        () => Promise.all([settingSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );

      // save db
      for (const store of stores) {
        await axios.post(
          "https://cheapr.my.id/gshopping/",
          {
            keyword: text,
            low: low.replace("$", "").replace(",", ""),
            high: high.replace("$", "").replace(",", ""),
            url_gshopping: url,
            store: store.name.replace("Opens in a new window", ""),
            item_price: store.item.replace("$", "").replace(",", ""),
            total_price: store.total.replace("$", "").replace(",", ""),
            in_stock: store.instock == "Yes" ? true : false,
            reputation: store.reputation
              .replace(
                "What makes this a trusted store?Customers may expect a positive shopping experience from this store. This includes the offer of fast shipping and easy returns, as well as good user ratings, among other factors. Learn more·",
                ""
              )
              .replace(
                "If anything goes wrong with your order, Google will help make it right.Learn more",
                ""
              ),
            url_product: store.link
              ? "https://www.google.com" + store.link
              : "",
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    }
    await browser.close();
  } catch (e) {
    console.log(e);
    // await browser.close();
  }
};
const trackings = async function () {
  let response = await axios.get(
    "https://cheapr.my.id/scraping_status/?search=trackings&format=json"
  );
  let result = await response.data.results;
  if (result.length > 0) {
    let data = result[0];
    if (data["status"] != "RUNNING") {
      await axios.patch(`https://cheapr.my.id/scraping_status/${data["pk"]}/`, {
        status: "RUNNING",
      });
      const doc = new GoogleSpreadsheet(
        "15bwn-UH8N7oijGbCzM4DADEMEe3Ygjp3tEbV51gUzYs"
      );
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      console.log(doc.title);
      const resSheet = doc.sheetsById["1523395279"];
      try {
        let rowCount = resSheet.rowCount;
        console.log(rowCount);
        let start = 2;
        let end = rowCount;
        // let end = 200;
        let delivered = { green: 1 };
        let transit = { red: 1, green: 1 };
        let issue = { red: 1, blue: 1 };
        let refunded = { red: 1 };

        await resSheet.loadCells(`AM${start}:AM${end}`);
        await resSheet.loadCells(`U${start}:U${end}`);
        await resSheet.loadCells(`I${start}:I${end}`);

        let tracking_numbers = [];
        for (let i = start; i < end; i++) {
          let cell = resSheet.getCellByA1(`AM${i}`);
          let addr = resSheet.getCellByA1(`U${i}`).value;
          let acell = resSheet.getCellByA1(`I${i}`).value;

          if (typeof acell == "string" && acell.includes("Delivered")) {
            break;
          }
          if (cell != undefined) {
            let source = cell.value;
            let bgcolor = undefined;

            try {
              bgcolor = cell.backgroundColor;
            } catch (e) {}
            let status = () => {
              if (JSON.stringify(bgcolor) == JSON.stringify(delivered)) {
                return "delivered";
              } else if (JSON.stringify(bgcolor) == JSON.stringify(transit)) {
                return "transit";
              } else if (JSON.stringify(bgcolor) == JSON.stringify(issue)) {
                return "issue";
              } else if (JSON.stringify(bgcolor) == JSON.stringify(refunded)) {
                return "refunded";
              } else {
                return "unknown";
              }
            };
            let track_status = status();
            if (
              source &&
              ["transit", "issue", "unknown"].includes(track_status)
            ) {
              let trackings = source
                .toString()
                .trim()
                .split(/\r?\n/)
                .map((e) => e.trim())
                .filter((e) => e != "");
              console.log(trackings, track_status);
              tracking_numbers.push({ idx: i, data: trackings, addr: addr });
            }
          }
        }
        console.log(tracking_numbers.length);
        alltrackers(data["pk"], tracking_numbers);
        console.log("Completed");
      } catch (e) {
        console.log("Error");
        console.log(e);
      }
    }
  }
};
const booktrackings = async function () {
  let response = await axios.get(
    "https://cheapr.my.id/scraping_status/?search=trackings&format=json"
  );
  let result = await response.data.results;
  if (result.length > 0) {
    let data = result[0];
    if (data["status"] != "RUNNING") {
      await axios.patch(`https://cheapr.my.id/scraping_status/${data["pk"]}/`, {
        status: "RUNNING",
      });
      const doc = new GoogleSpreadsheet(
        "17IHgxFyNo5k9Zq6ImTCdDwv4IK5rylY7R3UXKFW2DOE"
      );
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      console.log(doc.title);
      const resSheet = doc.sheetsById["1277865658"];
      try {
        let rowCount = resSheet.rowCount;
        console.log(rowCount);
        let start = 2;
        let end = rowCount;
        // let end = 200;
        let delivered = { green: 1 };
        let transit = { red: 1, green: 1 };
        let issue = { red: 1, blue: 1 };
        let refunded = { red: 1 };
        await resSheet.loadCells(`A${start}:A${end}`);

        await resSheet.loadCells(`T${start}:T${end}`);
        await resSheet.loadCells(`G${start}:G${end}`);

        let tracking_numbers = [];
        for (let i = start; i < end; i++) {
          let cell = resSheet.getCellByA1(`T${i}`);
          let addr = resSheet.getCellByA1(`G${i}`).value;
          let acell = resSheet.getCellByA1(`A${i}`).value;

          if (
            typeof acell == "string" &&
            acell.includes("Delivered (Closed)")
          ) {
            break;
          }
          if (cell != undefined) {
            let source = cell.value;
            let bgcolor = undefined;

            try {
              bgcolor = cell.backgroundColor;
            } catch (e) {}
            let status = () => {
              if (JSON.stringify(bgcolor) == JSON.stringify(delivered)) {
                return "delivered";
              } else if (JSON.stringify(bgcolor) == JSON.stringify(transit)) {
                return "transit";
              } else if (JSON.stringify(bgcolor) == JSON.stringify(issue)) {
                return "issue";
              } else if (JSON.stringify(bgcolor) == JSON.stringify(refunded)) {
                return "refunded";
              } else {
                return "unknown";
              }
            };
            let track_status = status();
            if (
              source &&
              ["transit", "issue", "unknown"].includes(track_status)
            ) {
              let trackings = source
                .toString()
                .trim()
                .split(/\r?\n/)
                .map((e) => e.trim())
                .filter((e) => e != "");
              console.log(trackings, track_status);
              tracking_numbers.push({ idx: i, data: trackings, addr: addr });
            }
          }
        }
        console.log(tracking_numbers.length);
        alltrackers(data["pk"], tracking_numbers);
        console.log("Completed");
      } catch (e) {
        console.log("Error");
        console.log(e);
      }
    }
  }
};
const update_trackings = async function () {
  const doc = new GoogleSpreadsheet(
    "15bwn-UH8N7oijGbCzM4DADEMEe3Ygjp3tEbV51gUzYs"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  console.log(doc.title);
  const resSheet = doc.sheetsById["1523395279"];
  try {
    let rowCount = resSheet.rowCount;
    console.log(rowCount);
    let start = 1;
    let end = rowCount;
    // let end = 200;
    let delivered = { green: 1 };
    let transit = { red: 1, green: 1 };
    let issue = { red: 1, blue: 1 };
    let refunded = { red: 1 };
    let not_started = { red: 1, green: 1, blue: 1 };
    await resSheet.loadCells(`AL${start}:AN${end}`);
    let tracking_numbers = [];
    for (let i = start; i < end; i++) {
      let cell = resSheet.getCellByA1(`AM${i}`);
      if (cell != undefined) {
        let source = cell.value;
        let bgcolor = undefined;

        try {
          bgcolor = cell.backgroundColor;
        } catch (e) {}

        let status = () => {
          if (JSON.stringify(bgcolor) == JSON.stringify(delivered)) {
            return "delivered";
          } else if (JSON.stringify(bgcolor) == JSON.stringify(transit)) {
            return "transit";
          } else if (JSON.stringify(bgcolor) == JSON.stringify(issue)) {
            return "issue";
          } else if (JSON.stringify(bgcolor) == JSON.stringify(refunded)) {
            return "refunded";
          } else {
            return "unknown";
          }
        };
        let track_status = status();
        if (source && ["transit", "issue", "unknown"].includes(track_status)) {
          let trackings = source
            .toString()
            .trim()
            .split(/\r?\n/)
            .map((e) => e.trim())
            .filter((e) => e != "");
          // console.log(trackings, track_status);
          tracking_numbers.push({
            idx: i,
            data: trackings,
            bgcolor: bgcolor,
          });
        }
      }
    }
    console.log(tracking_numbers.length);
    for (let j = 0; j < tracking_numbers.length; j++) {
      let data = tracking_numbers[j]["data"];
      let idx = tracking_numbers[j]["idx"];
      let bgcolor = tracking_numbers[j]["bgcolor"];

      if (data.length == 1) {
        let response = await axios.get(
          `https://cheapr.my.id/tracking/?tracking_number=${data[0]}&format=json`
        );
        let result = await response.data.results;
        if (result.length == 1) {
          let result_data = result[0];
          console.log(result_data);
          let carrier_cell = resSheet.getCellByA1(`AL${idx}`);
          carrier_cell.value = carrier_cell.value
            ? carrier_cell.value
            : result_data["carrier"];
          let eta_cell = resSheet.getCellByA1(`AN${idx}`);
          eta_cell.value = eta_cell.value
            ? eta_cell.value
            : result_data["eta_date"];
          if (result_data["status"] == "D") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(delivered)) {
              let cell = resSheet.getCellByA1(`AM${idx}`);
              cell.backgroundColor = delivered;
              console.log(`AM${idx}`, data[0], "Delivered");
            }
          } else if (result_data["status"] == "I") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(issue)) {
              let cell = resSheet.getCellByA1(`AM${idx}`);
              cell.backgroundColor = issue;
              console.log(`AM${idx}`, data[0], "Issue");
              sendSlack(
                "#tracking-status",
                `ALERT!!!\nIssue found for tracking number ${data[0]} in Cell AM${idx}`
              );
            }
          } else if (result_data["status"] == "T") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(transit)) {
              let cell = resSheet.getCellByA1(`AM${idx}`);
              cell.backgroundColor = transit;
              console.log(`AM${idx}`, data[0], "Transit");
            }
          } else if (result_data["status"] == "N") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(not_started)) {
              let cell = resSheet.getCellByA1(`AM${idx}`);
              cell.backgroundColor = not_started;
              console.log(`AM${idx}`, data[0], "Not Started");
            }
          }
        }
      } else if (data.length > 1) {
        let allstatus = [];
        for (let k = 0; k < data.length; k++) {
          let response = await axios.get(
            `https://cheapr.my.id/tracking/?tracking_number=${data[0]}&format=json`
          );
          let result = await response.data.results;
          if (result.length == 1) {
            let result_data = result[0];
            allstatus.push(result_data["status"]);
          }
        }
        let checker = (arr) => arr.every((v) => v === "D");
        let checker2 = (arr) => arr.some((v) => v === "T");
        let checker3 = (arr) => arr.some((v) => v === "I");

        if (checker(allstatus)) {
          if (JSON.stringify(bgcolor) !== JSON.stringify(delivered)) {
            let cell = resSheet.getCellByA1(`AM${idx}`);
            cell.backgroundColor = delivered;
            console.log(`AM${idx}`, data[0], "Delivered");
          }
        } else if (checker3(allstatus)) {
          if (JSON.stringify(bgcolor) !== JSON.stringify(issue)) {
            let cell = resSheet.getCellByA1(`AM${idx}`);
            cell.backgroundColor = issue;
            console.log(`AM${idx}`, data[0], "Issue");
            sendSlack(
              "#tracking-status",
              `ALERT!!!\nIssue found for tracking number ${data[0]} in Cell AM${idx}`
            );
          }
        } else if (checker2(allstatus)) {
          if (JSON.stringify(bgcolor) !== JSON.stringify(transit)) {
            let cell = resSheet.getCellByA1(`AM${idx}`);
            cell.backgroundColor = transit;
            console.log(`AM${idx}`, data[0], "Transit");
          }
        }
      }
    }
    await retry(
      () => Promise.all([resSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    console.log("Completed");
  } catch (e) {
    console.log("Error");
    console.log(e);
  }
};
const update_booktrackings = async function () {
  const doc = new GoogleSpreadsheet(
    "17IHgxFyNo5k9Zq6ImTCdDwv4IK5rylY7R3UXKFW2DOE"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  console.log(doc.title);
  const resSheet = doc.sheetsById["1277865658"];
  try {
    let rowCount = resSheet.rowCount;
    console.log(rowCount);
    let start = 1;
    let end = rowCount;
    // let end = 200;
    let delivered = { green: 1 };
    let transit = { red: 1, green: 1 };
    let issue = { red: 1, blue: 1 };
    let refunded = { red: 1 };
    let not_started = { red: 1, green: 1, blue: 1 };
    await resSheet.loadCells(`T${start}:T${end}`);
    let tracking_numbers = [];
    for (let i = start; i < end; i++) {
      let cell = resSheet.getCellByA1(`T${i}`);
      if (cell != undefined) {
        let source = cell.value;
        let bgcolor = undefined;

        try {
          bgcolor = cell.backgroundColor;
        } catch (e) {}

        let status = () => {
          if (JSON.stringify(bgcolor) == JSON.stringify(delivered)) {
            return "delivered";
          } else if (JSON.stringify(bgcolor) == JSON.stringify(transit)) {
            return "transit";
          } else if (JSON.stringify(bgcolor) == JSON.stringify(issue)) {
            return "issue";
          } else if (JSON.stringify(bgcolor) == JSON.stringify(refunded)) {
            return "refunded";
          } else {
            return "unknown";
          }
        };
        let track_status = status();
        if (source && ["transit", "issue", "unknown"].includes(track_status)) {
          let trackings = source
            .toString()
            .trim()
            .split(/\r?\n/)
            .map((e) => e.trim())
            .filter((e) => e != "");
          // console.log(trackings, track_status);
          tracking_numbers.push({
            idx: i,
            data: trackings,
            bgcolor: bgcolor,
          });
        }
      }
    }
    console.log(tracking_numbers.length);
    for (let j = 0; j < tracking_numbers.length; j++) {
      let data = tracking_numbers[j]["data"];
      let idx = tracking_numbers[j]["idx"];
      let bgcolor = tracking_numbers[j]["bgcolor"];

      if (data.length == 1) {
        let response = await axios.get(
          `https://cheapr.my.id/tracking/?tracking_number=${data[0]}&format=json`
        );
        let result = await response.data.results;
        if (result.length == 1) {
          let result_data = result[0];
          if (result_data["status"] == "D") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(delivered)) {
              let cell = resSheet.getCellByA1(`T${idx}`);
              cell.backgroundColor = delivered;
              console.log(`T${idx}`, data[0], "Delivered");
            }
          } else if (result_data["status"] == "I") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(issue)) {
              let cell = resSheet.getCellByA1(`T${idx}`);
              cell.backgroundColor = issue;
              console.log(`T${idx}`, data[0], "Issue");
              sendSlack(
                "#tracking-status",
                `ALERT!!!\nIssue found for Book tracking number ${data[0]} in Cell T${idx}`
              );
            }
          } else if (result_data["status"] == "T") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(transit)) {
              let cell = resSheet.getCellByA1(`T${idx}`);
              cell.backgroundColor = transit;
              console.log(`T${idx}`, data[0], "Transit");
            }
          } else if (result_data["status"] == "N") {
            if (JSON.stringify(bgcolor) !== JSON.stringify(not_started)) {
              let cell = resSheet.getCellByA1(`T${idx}`);
              cell.backgroundColor = not_started;
              console.log(`T${idx}`, data[0], "Not Started");
            }
          }
        }
      } else if (data.length > 1) {
        let allstatus = [];
        for (let k = 0; k < data.length; k++) {
          let response = await axios.get(
            `https://cheapr.my.id/tracking/?tracking_number=${data[0]}&format=json`
          );
          let result = await response.data.results;
          if (result.length == 1) {
            let result_data = result[0];
            allstatus.push(result_data["status"]);
          }
        }
        let checker = (arr) => arr.every((v) => v === "D");
        let checker2 = (arr) => arr.some((v) => v === "T");
        let checker3 = (arr) => arr.some((v) => v === "I");

        if (checker(allstatus)) {
          if (JSON.stringify(bgcolor) !== JSON.stringify(delivered)) {
            let cell = resSheet.getCellByA1(`T${idx}`);
            cell.backgroundColor = delivered;
            console.log(`T${idx}`, data[0], "Delivered");
          }
        } else if (checker3(allstatus)) {
          if (JSON.stringify(bgcolor) !== JSON.stringify(issue)) {
            let cell = resSheet.getCellByA1(`T${idx}`);
            cell.backgroundColor = issue;
            console.log(`T${idx}`, data[0], "Issue");
            sendSlack(
              "#tracking-status",
              `ALERT!!!\nIssue found for Book tracking number ${data[0]} in Cell T${idx}`
            );
          }
        } else if (checker2(allstatus)) {
          if (JSON.stringify(bgcolor) !== JSON.stringify(transit)) {
            let cell = resSheet.getCellByA1(`T${idx}`);
            cell.backgroundColor = transit;
            console.log(`T${idx}`, data[0], "Transit");
          }
        }
      }
    }
    await retry(
      () => Promise.all([resSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    console.log("Completed");
  } catch (e) {
    console.log("Error");
    console.log(e);
  }
};
const ebay = async function () {
  const doc = new GoogleSpreadsheet(
    "1DrG1p3is3QqScFgBboIRFrgwb4Gio9T6MbX1D75R9fM"
  );
  // const updateFtcresult = await updateFtc();
  // console.log(updateFtcresult);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  const settingDoc = new GoogleSpreadsheet(
    "1hT5ZP9pDHPrhBwekGGgaQLmDITjPn_8_wvvJ--wPP0g"
  );
  await settingDoc.useServiceAccountAuth(creds);
  await settingDoc.loadInfo(); // loads document properties and worksheets
  console.log(settingDoc.title);

  let settingSheet = settingDoc.sheetsById["0"];
  await settingSheet.loadCells("A1:H40");
  settingSheet.getCell(10, 1).value = "";
  settingSheet.getCell(10, 2).value = "RUNNING";
  settingSheet.getCell(10, 4).value = "";

  await retry(
    () => Promise.all([settingSheet.saveUpdatedCells()]),
    5,
    true,
    10000
  );
  puppeteer.use(StealthPlugin());
  puppeteer.use(
    RecaptchaPlugin({
      provider: { id: "2captcha", token: "e49a37d85049c9d99179375601a90e16" },
      visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    })
  );
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
    userDataDir: "./ebay_data",
  });
  const page = await browser.newPage();
  const checkOtp = async () => {
    await settingSheet.loadCells("A1:G20");
    let otp = settingSheet.getCell(10, 1).value;
    let length = 0;
    while (!otp && length != 6) {
      console.log("Waiting OTP", otp);
      await settingSheet.loadCells("A1:G20");
      otp = settingSheet.getCell(10, 1).value;
      if (otp) {
        length = otp.toString().length;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    let otpText = otp.toString();
    console.log("OTP found:", otp);
    settingSheet.getCell(10, 2).value = "OTP Found";
    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await new Promise((r) => setTimeout(r, 2000));
    settingSheet.getCell(10, 1).value = "";
    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await new Promise((r) => setTimeout(r, 2000));
    return otpText;
  };

  const check2fa = async () => {
    let url = await page.url();
    if (url.includes("acctxs/stepup")) {
      settingSheet.getCell(10, 2).value = "Need OTP";
      await retry(
        () => Promise.all([settingSheet.saveUpdatedCells()]),
        5,
        true,
        10000
      );
      await new Promise((r) => setTimeout(r, 2000));
      await page.click("#smsWithCode-btn");
      let otp = await checkOtp();
      await page.type("#pin-box-0", otp.charAt(0));
      await page.type("#pin-box-1", otp.charAt(1));
      await page.type("#pin-box-2", otp.charAt(2));
      await page.type("#pin-box-3", otp.charAt(3));
      await page.type("#pin-box-4", otp.charAt(4));
      await page.type("#pin-box-5", otp.charAt(5));

      await page.waitForTimeout(2000);
      await page.click("#verify-btn");
      await page.waitForNavigation({
        waitUntil: "networkidle2",
      });
      url = await page.url();
      if (url.includes("acctxs/stepup")) {
        settingSheet.getCell(10, 2).value = "Wrong OTP, Stopped";
        await retry(
          () => Promise.all([settingSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  const checkhcaptcha = async () => {
    let url = await page.url();
    if (url.includes("splashui/captcha")) {
      console.log("Solving recaptcha");
      await page.solveRecaptchas();
      await page.waitForNavigation({
        waitUntil: "networkidle0",
      });
      console.log("Solved");
    }
  };
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://www.ebay.com/signin/", {
      waitUntil: "networkidle0",
    });
    await checkhcaptcha();
    let url = await page.url();
    console.log(url);
    if (url.includes("/signin/")) {
      console.log("Trying login");
      let message = await page.evaluate(() => {
        let el = document.querySelector("#id-first");
        return el ? el.innerText : "";
      });
      console.log(message);
      let username = settingSheet.getCell(10, 6).value;
      let password = settingSheet.getCell(10, 7).value;
      let user_info = await page.evaluate(() => {
        let el = document.querySelector("#user-info");
        return el ? el.innerText : "";
      });
      console.log(user_info);
      if (!user_info.includes(username)) {
        await page.type("#userid", username);
        await page.click("#signin-continue-btn");
        await page.waitForTimeout(10000);
      }
      await checkhcaptcha();
      await page.type("#pass", password);
      await page.click("#sgnBt");
      console.log("Clicking login");

      await page.waitForNavigation({
        waitUntil: "networkidle0",
      });
      await checkhcaptcha();
      await check2fa();
      await page.goto("https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS", {
        waitUntil: "networkidle0",
      });
      let url = await page.url();
      console.log(url);
      if (url.includes("sh/ord/?filter=status:ALL_ORDERS")) {
        await page.waitForTimeout(5000);
        let orders = await page.$$eval(
          "#mod-main-cntr > table > tbody > tr",
          (trs) => {
            return trs.map((tr) => {
              let link = "";
              if (
                tr.querySelector(
                  "td.order-default-cell > div.order-buyer-details > div.order-details > a"
                )
              ) {
                link = tr
                  .querySelector(
                    "td.order-default-cell > div.order-buyer-details > div.order-details > a"
                  )
                  .getAttribute("href");
              }
              return link;
            });
          }
        );
        let noEmptyOrders = orders.filter((str) => str !== "");

        for (let o = 0; o < noEmptyOrders.length; o++) {
          let link = noEmptyOrders[o];
          await page.goto(`https://www.ebay.com${link}`, {
            waitUntil: "domcontentloaded",
          });
          let items = await page.$$eval("#itemInfo > div.item-card", (trs) => {
            return trs.map((tr) => {
              let objresult = { sku: "", qty: "", price: "" };

              objresult["sku"] = tr.querySelector(
                "div.lineItemCardInfo__sku.spaceTop > span:nth-child(2)"
              )
                ? tr.querySelector(
                    "div.lineItemCardInfo__sku.spaceTop > span:nth-child(2)"
                  ).innerText
                : "";
              objresult["qty"] = tr.querySelector("div.quantity__value")
                ? tr.querySelector("div.quantity__value").innerText
                : "";
              objresult["price"] = tr.querySelector("div.soldPrice__value")
                ? tr.querySelector("div.soldPrice__value").innerText
                : "";
              return objresult;
            });
          });
          // let [sold_date] = await page.$x(
          //   '//dt/span[contains(text(),"Date sold")]//parent::*//following-sibling::*'
          // );
          // let date_sold = await page.evaluate(
          //   (element) => (element ? element.textContent : ""),
          //   sold_date
          // );
          let order_number = await page.evaluate(() => {
            let el = document.querySelector(
              "#mainContent > div > div.wrapper > div.side > div:nth-child(1) > div > dl > div:nth-child(1) > dd"
            );
            return el ? el.innerText : "";
          });
          let date_sold = await page.evaluate(() => {
            let el = document.querySelector(
              "#mainContent > div > div.wrapper > div.side > div:nth-child(1) > div > dl > div:nth-child(3) > dd"
            );
            return el ? el.innerText : "";
          });
          console.log("Date Sold:", date_sold);
          let [add_fee] = await page.$x(
            '//*[contains(text(),"Ad Fee Standard")]'
          );
          function formatDate(date) {
            var d = new Date(date),
              month = "" + (d.getMonth() + 1),
              day = "" + d.getDate(),
              year = d.getFullYear();

            if (month.length < 2) month = "0" + month;
            if (day.length < 2) day = "0" + day;

            return [year, month, day].join("-");
          }
          if (add_fee) {
            for (let s = 0; s < items.length; s++) {
              let response = await axios.get(
                `https://cheapr.my.id/caproduct/?sku=${items[s]["sku"]}`
              );
              let result = response.data.results;
              if (result.length > 0) {
                let ca_data = result[0];

                let payload = {
                  product: ca_data["pk"],
                  date: formatDate(Date.parse(date_sold)),
                  price: parseFloat(
                    items[s]["price"].replace("$", "").replace(",", "")
                  ),
                  qty: parseInt(items[s]["qty"]),
                  platform: "Ebay",
                  order_number: order_number,
                };
                let post_res = await axios.post(
                  "https://cheapr.my.id/ppc_order/",
                  (data = payload)
                );
                console.log(post_res.data);
              }
            }
          }
        }
      }
    }

    let dateFormat = new Date();

    settingSheet.getCell(10, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    settingSheet.getCell(10, 2).value = "COMPLETED";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Amazon Aziz Error");
    let dateFormat = new Date();

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    settingSheet.getCell(4, 3).value = dateFormat.toLocaleString("en-US", {
      timeZone: "America/Denver",
    });

    settingSheet.getCell(10, 2).value = "ERROR";

    await retry(
      () => Promise.all([settingSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
    await browser.close();
  }
};
module.exports = {
  sellerAmazon,
  sellerAmazonCH,
  walmart,
  bhphotovideo,
  adorama,
  barcodesinc,
  commision,
  allnew,
  checker,
  checker2,
  trackings,
  booktrackings,
  update_trackings,
  update_booktrackings,
  ebay,
  ppcAmazon,
  ppcWalmart,
};
