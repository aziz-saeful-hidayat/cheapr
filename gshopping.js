const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const { updateProduct } = require("./utils");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox"],
  executablePath: executablePath(),
};

const site_name = "B&H";

const gshopping = async () => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: 1,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    retryLimit: 10,
    retryDelay: 30000,
    timeout: 1000000,
  });
  cluster.on("taskerror", (err, data, willRetry) => {
    if (willRetry) {
      console.warn(
        `Encountered an error while crawling ${data}. ${err.message}\nThis job will be retried`
      );
    } else {
      console.error(`Failed to crawl ${data}: ${err.message}`);
    }
  });
  await cluster.task(async ({ page, data: source }) => {
    console.log(source);
    const settingDoc = new GoogleSpreadsheet(
      "1wflU8sh6HyJL6aiGwIpmP_PcyT93F8iFNdQLdWY2QtQ"
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

    try {
      //   let text = "Xerox W110";
      let text = settingSheet.getCellByA1("A2").value;
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
        stores = stores.filter((obj) => {
          return obj["name"] != "";
        });
        console.log("stores found");
        console.log(stores);

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

          row = row + 1;
        }
        settingSheet.getCellByA1("E2").value = "COMPLETED";

        await retry(
          () => Promise.all([settingSheet.saveUpdatedCells()]),
          5,
          true,
          10000
        );
      }
      await browser.close();
    } catch (e) {
      console.log(e);
      // await browser.close();
    }
  });

  cluster.queue();

  //   let response = await axios.post(
  //     "http://103.49.239.195/get_mpns",
  //     { site: site_name },
  //     {
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //     }
  //   );
  //   let jsonData = await response.data;
  //   console.log(site_name, jsonData.length);
  //   for (let i = 0; i < jsonData.length; i++) {
  //     let source = jsonData[i]["mpn"];
  //     cluster.queue(source);
  //   }
  // many more pages

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  gshopping,
};
