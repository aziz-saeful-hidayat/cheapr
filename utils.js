const axios = require("axios");
const fs = require("fs");
const csvParser = require("csv-parser");
const needle = require("needle");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const jsdom = require("jsdom");
const dns = require("dns");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const async = require("async");

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(promiseFactory, retryCount, first, delay) {
  try {
    if (!first) {
      await sleep(delay);
    }
    return await promiseFactory();
  } catch (error) {
    if (retryCount <= 0) {
      throw error;
    }
    return await retry(promiseFactory, retryCount - 1, false, delay);
  }
}

const checkNomorobo = async (phoneNumber) => {
  const raw = phoneNumber.toString();
  const onlyNum = raw.replace(/\D/g, "");
  const last = onlyNum.slice(-4, onlyNum.length);
  const middle = onlyNum.slice(-7, -4);
  const first = onlyNum.slice(-10, -7);
  const phone = `${first}-${middle}-${last}`;
  try {
    const response = await axios.get(`https://nomorobo.com/lookup/${phone}`);
    console.log("nomorobo", phoneNumber.trim()), "flagged";
    if (response.status == 200) {
      return "Y";
    } else {
      return "N";
    }
  } catch (e) {
    return "N";
  }
};

const checkYoumail = async (phoneNumber) => {
  const raw = phoneNumber.toString();
  const onlyNum = raw.replace(/\D/g, "");
  const url = `https://directory.youmail.com/phone?phoneNumber=${onlyNum}`;
  try {
    const res = await axios.get(url);
    if (res.status == 200) {
      const contain = res.data.includes("Spam Calls Detected");
      if (contain) {
        console.log(res.status, "youmail", phoneNumber, "spam");
        return "Y";
      } else {
        return "N";
      }
    } else {
      return "N";
    }
  } catch (e) {
    return "N";
  }
};

const checkFtc = async (phone) => {
  const results = [];
  return new Promise(function (resolve, reject) {
    fs.createReadStream("out.csv")
      .pipe(csvParser())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", () => {
        let phoneNumber = phone
          .toString()
          .replace("(", "")
          .replace(")", "")
          .replace("-", "")
          .replace(" ", "")
          .trim();
        const found = results.find((e) => {
          return e.Company_Phone_Number === phoneNumber;
        });
        if (found) {
          console.log("ftc", phone.trim(), "flagged");
          resolve("Y");
        } else {
          resolve("N");
        }
      });
  });
};

const updateFtc = async () => {
  const csvFTCWriter = createCsvWriter({
    path: "out.csv",
    header: [{ id: "Company_Phone_Number", title: "Company_Phone_Number" }],
  });
  const forLoopLink = async (_) => {
    console.log("Start");
    let result = [];
    const response = await axios.get(
      "https://www.ftc.gov/policy-notices/open-government/data-sets/do-not-call-data"
    );
    if (response.status == 200) {
      const dom = new jsdom.JSDOM(response.data);
      dom.window.document.querySelectorAll("a").forEach((link) => {
        if (link.href.includes(".csv")) {
          result.push(link.href);
        }
      });
    }
    return result;
  };
  const getCsv = async (url) => {
    const results = [];
    return new Promise(function (resolve, reject) {
      needle
        .get(`https://www.ftc.gov${url}`)
        .pipe(csvParser())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          resolve(results);
        });
    });
  };
  const forLoopCsv = async (result) => {
    console.log("Start");
    let numbers = [];
    return new Promise(async function (resolve, reject) {
      for (let index = 0; index < result.length; index++) {
        const link = result[index];
        const data = await getCsv(link);
        numbers.push(...data);
      }
      resolve(numbers);
    });
  };
  const writeCsv = async (csvresult) => {
    return new Promise(async function (resolve, reject) {
      try {
        csvFTCWriter.writeRecords(csvresult).then(() => {
          console.log("The CSV file was written successfully");
          console.log("End");
          resolve(true);
        });
      } catch {
        resolve(false);
      }
    });
  };

  const links = await forLoopLink();
  const csvresult = await forLoopCsv(links);
  const result = await writeCsv(csvresult);
  return result;
};

const updateFlagged = async (list) => {
  const csvFlaggedWriter = createCsvWriter({
    path: "flagged.csv",
    header: [
      { id: "phone", title: "phone" },
      { id: "provider", title: "provider" },
    ],
  });
  const writeCsv = async (csvresult) => {
    return new Promise(async function (resolve, reject) {
      csvFlaggedWriter.writeRecords(csvresult).then(() => {
        console.log("The CSV file was written successfully");
        console.log("End");
        resolve(true);
      });
    });
  };
  const checkFlagged = async (list) => {
    let results = [];
    return new Promise(function (resolve, reject) {
      try {
        fs.createReadStream("flagged.csv")
          .pipe(csvParser())
          .on("data", (data) => {
            console.log(data);
            if (data.phone) {
              results.push(data);
            }
          })
          .on("end", () => {
            console.log("From CSV");
            console.log(results);
            let newFlagged = [];
            console.log("CSV file successfully processed");
            for (let index = 0; index < list.length; index++) {
              let phone = list[index];
              console.log(phone);
              let found = results.find((e) => {
                return e.phone === phone.phone && e.provider === phone.provider;
              });
              if (!found) {
                newFlagged.push(phone);
              }
            }
            console.log("New FLagged");
            console.log(newFlagged);
            const newlist = results.concat(newFlagged);
            writeCsv(newlist);
            console.log("New List");
            console.log(newlist);
            resolve(newFlagged);
          });
      } catch (err) {
        console.log(err);
        resolve(list);
      }
    });
  };

  const newFlagged = await checkFlagged(list);
  return newFlagged;
};

const checkip = async (ip, list) => {
  return new Promise(function (resolve, reject) {
    const options = {
      family: 4,
    };
    let counter = 0;
    const resolveip = (domain, callback) => {
      let reverseip = ip.split(".").reverse().join(".");
      let ipcheck = `${reverseip}.${domain}`;
      dns.resolve(ipcheck, "A", (err, records) => {
        console.log(ipcheck, records);
        if (records != undefined) {
          counter++;
        }
        callback();
      });
    };
    async
      .each(list, resolveip)
      .then(() => {
        resolve(counter);
      })
      .catch((err) => {
        console.log(err);
        resolve(counter);
      });
  });
};

const checkdomain = async (domain, list) => {
  return new Promise(function (resolve, reject) {
    const options = {
      family: 4,
    };
    let counter = 0;

    dns.lookup(domain, options, (err, address, family) => {
      const resolveip = (domain, callback) => {
        let reverseip = address.split(".").reverse().join(".");
        let ipcheck = `${reverseip}.${domain}`;
        dns.resolve(ipcheck, "A", (err, records) => {
          console.log(ipcheck, records);
          if (records != undefined) {
            counter++;
          }
          callback();
        });
      };
      async
        .each(list, resolveip)
        .then(() => {
          resolve(counter);
        })
        .catch((err) => {
          console.log(err);
          resolve(counter);
        });
      // list.forEach((val, idx) => {
      //   let reverseip = address.split(".").reverse().join(".");
      //   let ipcheck = `${reverseip}.${val}`;
      //   dns.resolve(ipcheck, "A", (err, records) => {
      //     if (records != undefined) {
      //       counter++;
      //     }
      //   });
      // });
      // resolve(counter);
    });
  });
};

const checkMX = async (domain) => {
  const res = await axios.get(
    `https://mxtoolbox.com/api/v1/Lookup?command=mx&argument=${domain}&resultIndex=1&disableRhsbl=true&format=2`,
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,id;q=0.8,ms;q=0.7",
        "content-type": "application/json; charset=utf-8",
        "sec-ch-ua":
          '"Chromium";v="104", " Not A;Brand";v="99", "Google Chrome";v="104"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        tempauthorization: "27eea1cd-e644-4b7b-bebe-38010f55dab3",
        "x-requested-with": "XMLHttpRequest",
        cookie:
          'HttpOnly; _ga=GA1.2.1049324654.1662517954; _gid=GA1.2.953632136.1662517954; _vwo_uuid_v2=DB4BF909E37DB75E1577C7334595FAD37|1a93a704ddb4e7b8e269af972b54616c; _vis_opt_s=1%7C; _vis_opt_test_cookie=1; _vwo_uuid=DB4BF909E37DB75E1577C7334595FAD37; _vwo_ds=3%241662517953%3A26.49627534%3A%3A; HttpOnly; MxVisitorUID=3eca3b57-be74-40c6-8f85-8a8e3d6d1e8a; _mxt_u={"UserId":"00000000-0000-0000-0000-000000000000","UserName":null,"FirstName":null,"IsAdmin":false,"IsMasquerade":false,"IsPaidUser":false,"IsLoggedIn":false,"MxVisitorUid":"3eca3b57-be74-40c6-8f85-8a8e3d6d1e8a","TempAuthKey":"27eea1cd-e644-4b7b-bebe-38010f55dab3","IsPastDue":false,"BouncedEmailOn":null,"NumDomainHealthMonitors":0,"NumDisabledMonitors":0,"XID":null,"AGID":"00000000-0000-0000-0000-000000000000","Membership":{"MemberType":"Anonymous"},"CognitoSub":"00000000-0000-0000-0000-000000000000","HasBetaAccess":false,"IsOnTrial":false}; _mxt_s=anon; _cioanonid=b3e7fd5c-0706-676a-a0fb-ad8a11f6a05d; ki_r=; _gaexp=GAX1.2.jWd5dpuiTS2jp2pXmMyuYA.19292.2; _mx_vtc=AB-591=Variation; _gat=1; ki_t=1662517955749%3B1662517955749%3B1662552320276%3B1%3B6; _vwo_sn=34234%3A5',
        Referer:
          "https://mxtoolbox.com/SuperTool.aspx?action=mx%3acommunityminerals.com&run=toolpage",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      body: null,
      method: "GET",
    }
  );
  if (res) {
    if (res.data.HTML_Value) {
      if (res.data.HTML_Value.includes("Status Problem")) {
        console.log(res.data.CommandArgument, true);
        return true;
      } else {
        console.log(res.data.CommandArgument, false);
        return false;
      }
    } else {
      console.log(domain, "error");
      return "error";
    }
  }
};

const puppeteerXpathText = async (url, xpath) => {
  if (url) {
    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-position=0,0",
      "--ignore-certifcate-errors",
      "--ignore-certifcate-errors-spki-list",
      '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"',
    ];

    const options = {
      args,
      headless: true,
      ignoreHTTPSErrors: true,
      userDataDir: "./tmp",
    };

    puppeteer.use(StealthPlugin());
    const tryit = async () => {
      return new Promise(async function (resolve, reject) {
        puppeteer
          .launch({ headless: false, args: ["--no-sandbox"] })
          .then(async function (browser) {
            const page = await browser.newPage();
            await page.setViewport({
              width: 1920 + Math.floor(Math.random() * 100),
              height: 3000 + Math.floor(Math.random() * 100),
              deviceScaleFactor: 1,
              hasTouch: false,
              isLandscape: false,
              isMobile: false,
            });
            await page.setJavaScriptEnabled(true);
            await page.setDefaultNavigationTimeout(0);
            await page.goto(url);
            await page.waitForXPath(xpath);
            let [element] = await page.$x(xpath);
            let result = await page.evaluate(
              (element) => element.textContent,
              element
            );
            browser.close();
            resolve(result);
          })
          .catch((err) => {
            console.log(err);
            resolve(0);
          });
      });
    };
    const response = await tryit();
    return response;
  }
};

module.exports = {
  checkNomorobo,
  checkYoumail,
  checkFtc,
  updateFtc,
  updateFlagged,
  checkip,
  checkdomain,
  checkMX,
  puppeteerXpathText,
  retry,
  sleep,
};
