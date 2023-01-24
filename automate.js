var path = require("path");
const creds = require(path.resolve(__dirname, "./cm-automation.json")); // the file saved above
const axios = require("axios");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { retry, sleep } = require("./utils");
const nodemailer = require("nodemailer");
const csvParser = require("csv-parser");
const needle = require("needle");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const vanillaPuppeteer = require("puppeteer");
const os = require("node:os");
const defaultViewport = {
  height: 1920,
  width: 1280,
};
const { executablePath } = require("puppeteer");
PROXY_USERNAME = "scraperapi";
PROXY_PASSWORD = "e5d87185d49c8749431089fa73ef4731"; // <-- enter your API_Key here
PROXY_SERVER = "proxy-server.scraperapi.com";
PROXY_SERVER_PORT = "8001";

const cstOptions = {
  timeZone: "CST",
  dateStyle: "medium",
  timeStyle: "long",
};

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
  await settingSheet.loadCells("A1:G20");
  settingSheet.getCell(4, 1).value = "";
  settingSheet.getCell(4, 2).value = "STARTING";
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
    // userDataDir: "./user_data",
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

      await page.type("#ap_email", "azizsaefulhidayat@gmail.com");
      await page.type("#ap_password", "@212543fulh");
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
        resSheet.getCell(16, 27).formula = "=VLOOKUP(Y17,A$16:T$51,Z$14,FALSE)";
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

    let result_data_2 = await grabData(3, 2);
    await writeSheet(result_data_2, "1152900177");

    let result_data_3 = await grabData(4, 3);
    await writeSheet(result_data_3, "753769627");

    let dateFormat = new Date();

    settingSheet.getCell(4, 2).value = "COMPLETED";
    settingSheet.getCell(4, 3).value = dateFormat;

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

    settingSheet.getCell(4, 2).value = "ERROR";
    settingSheet.getCell(4, 3).value = dateFormat;
    settingSheet.getCell(4, 4).value = e;

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
    await page.type(
      'input[data-automation-id="uname"]',
      "catherinedanila00@outlook.com"
    );
    await page.type('input[data-automation-id="pwd"]', "Walmart01*");

    await page.click('button[data-automation-id="loginBtn"]');

    await page.waitForNavigation({
      waitUntil: "networkidle0",
    });
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

    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Walmart Error");
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
      let result = {};
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
        let id = business_report[i]["node"]["id"].replace(
          "gid://shopify/Order/",
          ""
        );
        await page.goto(`https://scanprint.myshopify.com/admin/orders/${id}`, {
          waitUntil: "networkidle2",
        });
      }

      result["data"] = business_report;

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
  const bhphotovideocsvWriter = createCsvWriter({
    path: "bhphotovideo.csv",
    header: [
      { id: "idx", title: "idx" },
      { id: "source", title: "MPN from Gsheet" },
      { id: "title", title: "Title" },
      { id: "price", title: "Price" },
      { id: "link", title: "Link" },
    ],
  });

  const doc = new GoogleSpreadsheet(
    "1FJbWE8ObEqcnJK-1QQ1iLzfOeQFPO891CKwUFJK_kUI"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  let resSheet = doc.sheetsById["1771276982"];
  await resSheet.loadCells("H1:H1500");
  puppeteer.use(StealthPlugin());
  let browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  let page = await browser.newPage();
  await page.setViewport(Object.assign({}, defaultViewport));
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
      if (block) {
        await browser.close();
        browser = await puppeteer.launch({
          headless: false,
          args: ["--no-sandbox"],
          executablePath: executablePath(),
        });
        page = await browser.newPage();
        await page.goto(url, {
          waitUntil: "networkidle2",
        });
        await checkBlock(url);
      }
    };
    for (let i = 0; i < 1500; i++) {
      let source = resSheet.getCell(4 + i, 7).value;
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
      if (source) {
        let text = typeof source == "string" ? source.trim() : source;
        await page.goto(
          `https://www.bhphotovideo.com/c/search?q=${text}&sts=ma`,
          {
            waitUntil: "networkidle2",
          }
        );
        await checkBlock(
          `https://www.bhphotovideo.com/c/search?q=${text}&sts=ma`
        );
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
                  .innerText.includes(
                    typeof text == "string" ? text.toUpperCase() : text
                  )
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
        if (products.length > 0) {
          link1 = `https://www.bhphotovideo.com${products[0]}`;
          await page.goto(link1, {
            waitUntil: "networkidle2",
          });
          await checkBlock(link1);
          price = await page.evaluate(() => {
            let el = document.querySelector('div[data-selenium="pricingPrice');
            return el ? el.innerText : "";
          });

          h1 = await page.evaluate(() => {
            let el = document.querySelector("h1");
            return el ? el.innerText : "";
          });
        }
        let data = {
          idx: i,
          source: source,
          link: link1,
          title: h1,
          price: price,
        };
        results.push(data);
        console.log(data);
      } else {
        let data = { idx: i, source: source, link: "", title: "", price: "" };
        results.push(data);
        console.log(data);
      }
      visited.push(source);
    }
    bhphotovideocsvWriter
      .writeRecords(results)
      .then(() => console.log("The CSV file was written successfully"));
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    browser.close();
  } catch (e) {
    console.log(e);
    console.log("bhphotovideo Error");
    bhphotovideocsvWriter
      .writeRecords(results)
      .then(() => console.log("The CSV file was written successfully"));
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
    browser.close();
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
  await resSheet.loadCells("H1:H833");
  await resSheet.loadCells("AJ1:AJ833");
  // Create a custom puppeteer-extra instance using `addExtra`,
  // so we could create additional ones with different plugin config.
  puppeteer.use(StealthPlugin());

  let browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    headless: false,
    args: [
      "--no-sandbox",
      `--proxy-server=http://${PROXY_SERVER}:${PROXY_SERVER_PORT}`,
    ],
    executablePath: executablePath(),
  });
  let page = await browser.newPage();
  await page.authenticate({
    username: PROXY_USERNAME,
    password: PROXY_PASSWORD,
  });
  await page.setViewport(Object.assign({}, defaultViewport));
  let results = [];
  let visited = [];
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://www.adorama.com/", {
      waitUntil: "networkidle2",
    });
    // await page.screenshot({
    //   path: `public/adorama/home.png`,
    // });
    const checkBlock = async (url) => {
      let block = await page.evaluate(() => {
        let el = document.querySelector("#px-captcha");
        return el ? true : false;
      });
      let h1 = await page.evaluate(() => {
        let el = document.querySelector("h1");
        return el ? true : false;
      });
      if (h1 && block) {
        await browser.close();
        browser = await puppeteer.launch({
          headless: false,
          args: ["--no-sandbox"],
          executablePath: executablePath(),
        });
        page = await browser.newPage();
        await page.goto(url, {
          waitUntil: "networkidle2",
        });
        await checkBlock(url);
      }
    };
    for (let i = 0; i < 833; i++) {
      let source = resSheet.getCell(4 + i, 7).value;
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
      if (source) {
        let text = typeof source == "string" ? source.trim() : source;
        await page.goto(`https://www.adorama.com/l/?searchinfo=${text}`, {
          waitUntil: "networkidle2",
        });
        await page.screenshot({
          path: `public/adorama/${text}.png`,
        });
        await checkBlock(`https://www.adorama.com/l/?searchinfo=${text}`);
        let [not_found] = await page.$x(
          '//h1[contains(text(),"Sorry, we didn")]'
        );
        let [not_available] = await page.$x(
          '//*[contains(text(),"This item is no longer available.")]'
        );
        let link1 = "";
        let price = "";
        let h1 = "";
        if (!not_found) {
          let products = await page.$$eval(
            "#productGridPlaceholder > div",
            (trs, text) => {
              return trs.map((tr) => {
                let objresult = { name: "", price: "", link: "" };
                if (
                  tr.querySelector(
                    "div > div > div.item-details > p > i:nth-child(2) > span"
                  ) &&
                  tr
                    .querySelector(
                      "div > div > div.item-details > p > i:nth-child(2) > span"
                    )
                    .innerText.includes(
                      typeof text == "string" ? text.toUpperCase() : text
                    )
                ) {
                  objresult["price"] = tr.querySelector(
                    "div > div > div.item-actions > div > strong"
                  )
                    ? tr.querySelector(
                        "div > div > div.item-actions > div > strong"
                      ).innerText
                    : "";
                  objresult["name"] = tr.querySelector(
                    "div > div > div.item-details > h2 > a"
                  )
                    ? tr.querySelector("div > div > div.item-details > h2 > a")
                        .innerText
                    : "";
                  objresult["link"] = tr.querySelector(
                    "div > div > div.item-details > h2 > a"
                  )
                    ? tr
                        .querySelector("div > div > div.item-details > h2 > a")
                        .getAttribute("href")
                    : "";
                }
                return objresult;
              });
            },
            text
          );
          if (products.length > 0) {
            price = products[0]["price"];

            h1 = products[0]["name"];
            link1 = products[0]["link1"];
            let data = {
              idx: i,
              source: source,
              link: link1,
              title: h1,
              price: price,
            };

            results.push(data);
            console.log(data);
            resSheet.getCell(4 + i, 35).value = price
              ? parseFloat(price.replace("$", "").replace(",", ""))
              : "N/A";
          } else {
            price = await page.evaluate(() => {
              let el = document.querySelector("strong.your-price");
              return el ? el.innerText : "";
            });

            h1 = await page.evaluate(() => {
              let el = document.querySelector("h1 > span");
              return el ? el.innerText : "";
            });
            link1 = await page.url();
            let data = {
              idx: i,
              source: source,
              link: link1,
              title: h1,
              price: price,
            };
            results.push(data);
            if (not_available) {
              resSheet.getCell(4 + i, 35).backgroundColor = {
                red: 0.85,
                green: 0.85,
                blue: 0.85,
                alpha: 1.0,
              };
            }
            console.log(data);
            resSheet.getCell(4 + i, 35).value = price
              ? parseFloat(price.replace("$", "").replace(",", ""))
              : "N/A";
          }
        } else {
          let data = { idx: i, source: source, link: "", title: "", price: "" };
          results.push(data);
          resSheet.getCell(4 + i, 35).value = "N/A";
          console.log(data);
        }
      }
      visited.push(source);
      if (i % 20 == 0) {
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
    // AdoramacsvWriter.writeRecords(results).then(() =>
    //   console.log("The CSV file was written successfully")
    // );
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
  } catch (e) {
    console.log(e);
    console.log("Adorama Error");
    // AdoramacsvWriter.writeRecords(results).then(() =>
    //   console.log("The CSV file was written successfully")
    // );
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
  }
};

const barcodesinc = async function () {
  const start = new Date();
  const BarcodesinccsvWriter = createCsvWriter({
    path: "barcodesinc.csv",
    header: [
      { id: "idx", title: "idx" },
      { id: "source", title: "MPN from Gsheet" },
      { id: "title", title: "Title" },
      { id: "price", title: "Price" },
      { id: "link", title: "Link" },
    ],
  });

  const doc = new GoogleSpreadsheet(
    "1FJbWE8ObEqcnJK-1QQ1iLzfOeQFPO891CKwUFJK_kUI"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);
  let resSheet = doc.sheetsById["1771276982"];
  await resSheet.loadCells("H1:H1500");
  puppeteer.use(StealthPlugin());
  let browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
  });
  let page = await browser.newPage();
  await page.setViewport(Object.assign({}, defaultViewport));

  let results = [];
  let visited = [];
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://www.barcodesinc.com/", {
      waitUntil: "networkidle2",
    });
    const checkBlock = async (url) => {
      let block = await page.evaluate(() => {
        let el = document.querySelector("#px-captcha");
        return el ? true : false;
      });
      if (block) {
        await browser.close();
        browser = await puppeteer.launch({
          headless: false,
          args: ["--no-sandbox"],
          executablePath: executablePath(),
        });
        page = await browser.newPage();
        await page.goto(url, {
          waitUntil: "networkidle2",
        });
        await checkBlock(url);
      }
    };
    for (let i = 0; i < 1500; i++) {
      let source = resSheet.getCell(4 + i, 7).value;
      if (source) {
        if (source in visited) {
          let getdata = results.find((e) => {
            e.source == source;
          });
          let newdata = { ...getdata, idx: i };
          results.push(newdata);
          console.log("Already visited");
          console.log(newdata);
        } else {
          let text = typeof source == "string" ? source.trim() : source;
          await page.goto(
            `https://www.barcodesinc.com/search.htm?search=${text}-B615&v=1`,
            {
              waitUntil: "networkidle2",
            }
          );

          await checkBlock(
            `https://www.barcodesinc.com/search.htm?search=${text}-B615&v=1`
          );
          let [not_found] = await page.$x(
            '//p[contains(text(),"We could not find a product to match your search criteria.")]'
          );
          let link1 = "";
          let price = "";
          let h1 = "";
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
                      .innerText.includes(
                        typeof text == "string" ? text.toUpperCase() : text
                      )
                  ) {
                    objresult["price"] = tr.querySelector("td.pricecell > span")
                      ? tr.querySelector("td.pricecell > span").innerText
                      : "";
                    objresult["name"] = tr.querySelector(
                      "td:nth-child(2) > span.modelname > a > b"
                    )
                      ? tr.querySelector(
                          "td:nth-child(2) > span.modelname > a > b"
                        ).innerText
                      : "";
                    objresult["link"] = tr.querySelector(
                      "td:nth-child(2) > span.modelname > a"
                    )
                      ? tr
                          .querySelector("td:nth-child(2) > span.modelname > a")
                          .getAttribute("href")
                      : "";
                  }
                  return objresult;
                });
              },
              text
            );
            if (products.length > 0) {
              price = products[0]["price"];

              h1 = products[0]["name"];
              link1 = products[0]["link1"];
              let data = {
                idx: i,
                source: source,
                link: link1,
                title: h1,
                price: price,
              };
              results.push(data);
              console.log(data);
            } else {
              price = await page.evaluate(() => {
                let el = document.querySelector(
                  "#addtocart-top > div > div:nth-child(1) > div > div.cost.price > span:nth-child(2)"
                );
                return el ? el.innerText : "";
              });

              h1 = await page.evaluate(() => {
                let el = document.querySelector("h1");
                return el ? el.innerText : "";
              });
              link1 = await page.url();
              let data = {
                idx: i,
                source: source,
                link: link1,
                title: h1,
                price: price,
              };
              results.push(data);
              console.log(data);
            }
          } else {
            let data = {
              idx: i,
              source: source,
              link: "",
              title: "",
              price: "",
            };
            results.push(data);
            console.log(data);
          }
        }
      }
      visited.push(source);
    }
    BarcodesinccsvWriter.writeRecords(results).then(() =>
      console.log("The CSV file was written successfully")
    );
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
  } catch (e) {
    console.log(e);
    console.log("Barcodesinc Error");
    BarcodesinccsvWriter.writeRecords(results).then(() =>
      console.log("The CSV file was written successfully")
    );
    const end = new Date();
    console.log("start: ", start);
    console.log("end: ", end);
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
};
