import puppeteer from "puppeteer";

const PUPPETEER_OPTIONS = {
  headless: true,
  args: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--timeout=30000",
    "--no-first-run",
    "--no-sandbox",
    "--no-zygote",
    "--single-process",
    "--proxy-server='direct://'",
    "--proxy-bypass-list=*",
    "--deterministic-fetch",
  ],
};

const updateProduct = async function (site, mpn, price, in_stock) {
  let dec_price = price
    ? parseFloat(price.replace("$", "").replace(",", "").trim())
    : null;
  const data = { site: site, mpn: mpn, price: dec_price, in_stock: in_stock };

  fetch("https://cheapr.my.id/update_product", {
    method: "POST", // or 'PUT'
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};

const service = async (source) => {
  if (source) {
    // puppeteer.use(StealthPlugin());

    // let browser = await puppeteer.launch({
    //   headless: false,
    //   args: ["--no-sandbox"],
    //   executablePath: executablePath(),
    // });
    let browser = await puppeteer.launch(PUPPETEER_OPTIONS);

    const page = await browser.newPage();
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://www.adorama.com/", {
      waitUntil: "networkidle2",
    });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(`https://www.adorama.com/l/?searchinfo=${text}`, {
      waitUntil: "networkidle2",
    });
    let [not_found] = await page.$x('//h1[contains(text(),"Sorry, we didn")]');
    let [not_available] = await page.$x(
      '//*[contains(text(),"This item is no longer available.")]'
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
      let data = {
        idx: i,
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      if (mpn.includes(text.replace("-", ""))) {
        await updateProduct(
          "Adorama",
          source,
          price,
          !in_stock.includes("In Stock") &&
            !in_stock.includes("Ships from Manufacturer") &&
            price
        );
        return data;
      } else {
        await updateProduct("Adorama", source, null, true);
        return data;
      }
    } else {
      let data = { idx: i, source: source, link: "", title: "", price: "" };
      await updateProduct("Adorama", source, null, true);
      return data;
    }
  }
};

export default service;
