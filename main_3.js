import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import express from 'express';
import fs from 'fs/promises';
import winston from 'winston';
import bodyParser from 'body-parser';

// Cấu hình logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
const app = express();
const PORT = process.env.PORT || 3000;
let mStart = new Date().toString();

// Biến lưu trữ socialUrl
let socialUrl = '';

async function checkForCaptcha(page) {
    try {
        // Các selector phổ biến của CAPTCHA
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'div.recaptcha',
            'div.g-recaptcha',
            'div.h-captcha',
            'div#captcha',
            'div.captcha',
            'img[alt="CAPTCHA"]',
            'img[alt="captcha"]',
            'div[class*="captcha"]',
            'div[class*="Captcha"]',
            'div[class*="CAPTCHA"]'
        ];

        for (const selector of captchaSelectors) {
            const captchaElement = await page.$(selector);
            if (captchaElement) {
                const isVisible = await captchaElement.isIntersectingViewport();
                if (isVisible) {
                    console.log('Phát hiện CAPTCHA với selector:', selector);
                    return true;
                }
            }
        }
        
        // Kiểm tra các selector CAPTCHA trực tiếp
        const captchaElementSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'div.g-recaptcha',
            'div.h-captcha',
            '#captcha',
            'div.captcha',
            'img[alt="CAPTCHA"]',
            'img[alt="captcha"]'
        ];
        
        for (const selector of captchaElementSelectors) {
            const elements = await page.$$(selector);
            for (const element of elements) {
                try {
                    const isVisible = await element.isIntersectingViewport();
                    if (isVisible) {
                        console.log(`Phát hiện CAPTCHA với selector: ${selector}`);
                        return true;
                    }
                } catch (error) {
                    // Bỏ qua nếu không thể kiểm tra visibility
                }
            }
        }
        
        // Chỉ kiểm tra từ khóa khi không tìm thấy element CAPTCHA
        const content = await page.content();
        const captchaKeywords = [
            'I\'m not a robot',
            'I am not a robot',
            'recaptcha',
            'hcaptcha'
        ];
        
        // Chỉ trả về true nếu tìm thấy ít nhất 2 từ khóa để tránh dương tính giả
        const foundKeywords = captchaKeywords.filter(keyword => content.includes(keyword));
        if (foundKeywords.length >= 2) {
            console.log(`Phát hiện từ khóa CAPTCHA: ${foundKeywords.join(', ')}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.log('Lỗi khi kiểm tra CAPTCHA:', error.message);
        return false;
    }
}

// Hàm xử lý khi phát hiện CAPTCHA
async function handleCaptcha(page) {
    console.log('Đang xử lý CAPTCHA...');
    
    try {
        // Chụp ảnh màn hình khi phát hiện CAPTCHA
        await page.screenshot({ path: 'captcha_detected.png' });
        console.log('Đã lưu ảnh CAPTCHA vào captcha_detected.png');
        
        // Thử giải quyết CAPTCHA tự động nếu có thể
        try {
            await page.solveRecaptchas();
            console.log('Đã thử giải quyết CAPTCHA tự động');
            
            // Chờ 5 giây để xem CAPTCHA có được giải quyết không
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Kiểm tra lại xem CAPTCHA còn không
            const stillHasCaptcha = await checkForCaptcha(page);
            if (!stillHasCaptcha) {
                console.log('CAPTCHA đã được giải quyết thành công!');
                return true;
            }
        } catch (error) {
            console.log('Không thể giải quyết CAPTCHA tự động:', error.message);
        }
        
        // Nếu không thể giải quyết tự động, yêu cầu người dùng nhập thủ công
        console.log('Vui lòng giải quyết CAPTCHA thủ công trong 2 phút...');
        
        // Đợi tối đa 2 phút để người dùng giải quyết CAPTCHA
        const maxWaitTime = 2 * 60 * 1000; // 2 phút
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Kiểm tra mỗi 5 giây
            
            const stillHasCaptcha = await checkForCaptcha(page);
            if (!stillHasCaptcha) {
                console.log('Người dùng đã giải quyết xong CAPTCHA!');
                return true;
            }
            
            console.log('Vẫn đang chờ giải quyết CAPTCHA...');
        }
        
        console.log('Hết thởi gian chờ giải quyết CAPTCHA');
        return false;
    } catch (error) {
        console.log('Lỗi khi xử lý CAPTCHA:', error.message);
        return false;
    }
}

// Hàm di chuyển chuột ngẫu nhiên
async function moveMouseRandomly(page) {
    try {
        const viewport = await page.viewport();
        const width = viewport.width;
        const height = viewport.height;
        
        // Tạo 3-5 điểm di chuyển ngẫu nhiên
        const steps = Math.floor(Math.random() * 3) + 3;
        let lastX = Math.floor(Math.random() * width);
        let lastY = Math.floor(Math.random() * height);
        
        for (let i = 0; i < steps; i++) {
            const x = Math.floor(Math.random() * width);
            const y = Math.floor(Math.random() * height);
            
            // Di chuyển chuột đến vị trí mới với các bước mượt mà
            await page.mouse.move(x, y, { 
                steps: 10 + Math.floor(Math.random() * 10) // Số bước ngẫu nhiên từ 10-20
            });
            
            // Thời gian chờ ngẫu nhiên giữa các lần di chuyển
            const delay = 100 + Math.random() * 400; // 100-500ms
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Kiểm tra CAPTCHA sau khi di chuyển chuột
            await checkAndHandleCaptcha(page);
        }
        
        return { x: lastX, y: lastY };
    } catch (error) {
        console.log('Lỗi khi di chuyển chuột:', error.message);
        return null;
    }
}

// Add stealth plugin and use defaults (all tricks to hide puppeteer)
puppeteer.use(StealthPlugin());

// Configure Puppeteer to use system Chrome
const chromePaths = require('chrome-paths');
const chromePath = chromePaths.chrome || process.env.CHROME_PATH;

if (chromePath) {
    process.env.CHROME_PATH = chromePath;
    process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
}

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add recaptcha plugin and provide it your 2captcha token
// 2captcha is the recommended provider with the best success rate
puppeteer.use(
  RecaptchaPlugin({
    provider: {
      id: '2captcha',
      token: '077798c64a2e77a12f1c95c5d436f380' // Using the provided 2CAPTCHA API KEY
    }
  })
);

const cookies = [
    {
        "domain": ".appleid.apple.com",
        "expirationDate": 1757604706.70112,
        "hostOnly": false,
        "httpOnly": true,
        "name": "DES6ccef4b227be290da8c601cea4fddbeff",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "HSARMTKNSRVXWFlaPx39Wbw/Nk5wB10MPxriKRAj7Wlj3DLTyTMj0T8em6xftt/FqSFhOJF7QERq17743lkDr1slzamLkuaRQrXaBOwiHuJ1BmH9PDWHKv01+gUCazRqQqxLeU3iQ0mpyzUaH05WNUKA79MUlrBcKzxYCT3aCwikq4CaDUW2Uc/l3uZyi2i3TuAnC1tuakaFSRVX"
    },
    {
        "domain": ".appleid.apple.com",
        "expirationDate": 1757162276.870097,
        "hostOnly": false,
        "httpOnly": true,
        "name": "DES64b891443705b9cf0528806b03b364246",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "HSARMTKNSRVXWFlaJN9uyMlOJAxSkRtK8q549Rh73wrmVw1C2/EUIUBQSfpUJpr1pgJIe94zxX0U6oOy5BvPrdT5CwRWERmGhI3FYlwJj0RDKOeFX38Cm6pHJ1WIpIuWkQzcaIWSbqv60C804cz/KOQwj4j4HLV1OFY5TS2uXJA8VyucE1X/Vt2pxApjglOEsMqCVQ==SRVX"
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1786548241.855001,
        "hostOnly": false,
        "httpOnly": true,
        "name": "acn01",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "SV3lYV9aoQ+d9wPDTPgag+E8Y/otGKUKxHe7cyH9AAqcnecWz2k="
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1770564362,
        "hostOnly": false,
        "httpOnly": false,
        "name": "pltvcid",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "undefined"
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1786546279.505757,
        "hostOnly": false,
        "httpOnly": true,
        "name": "dssid2",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "ac2d8282-abad-40c1-81e4-b228c0eba71c"
    },
    {
        "domain": ".apple.com",
        "hostOnly": false,
        "httpOnly": true,
        "name": "dslang",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": true,
        "storeId": null,
        "value": "US-EN"
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1786546279.505789,
        "hostOnly": false,
        "httpOnly": true,
        "name": "dssf",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "1"
    },
    {
        "domain": ".apple.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "geo",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "US"
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1789572366.087056,
        "hostOnly": false,
        "httpOnly": false,
        "name": "itspod",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "10"
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1770564362,
        "hostOnly": false,
        "httpOnly": false,
        "name": "pldfltcid",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "95ce8597bcf64e4dbe0cc4708d9a59fc010"
    },
    {
        "domain": ".apple.com",
        "expirationDate": 1757341124,
        "hostOnly": false,
        "httpOnly": false,
        "name": "POD",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "vn~vi"
    },
    {
        "domain": ".apple.com",
        "hostOnly": false,
        "httpOnly": true,
        "name": "site",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": true,
        "storeId": null,
        "value": "USA"
    }
];



// Hàm kiểm tra và xử lý CAPTCHA nếu có
async function checkAndHandleCaptcha(page) {
    const hasCaptcha = await checkForCaptcha(page);
    if (hasCaptcha) {
        console.log('Phát hiện CAPTCHA, đang xử lý...');
        const captchaSolved = await handleCaptcha(page);
        if (!captchaSolved) {
            throw new Error('Không thể giải quyết CAPTCHA');
        }
    }
}

// Hàm chạy tự động
async function runAutomation() {
    console.log('Starting automation...');
    console.log('Puppeteer executable path:', process.env.NODE_ENV == 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath());
    
    let browser;
    try {
    // Launch the browser with proxy configuration
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-notifications',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-skip-list',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-features=IsolateOrigins,site-per-process',
          '--proxy-server=http://us-free-proxy.g-w.info:59781'
        ]
      });
    
      const page = await browser.newPage();
    
      // Proxy authentication
      await page.authenticate({
        username: 'user3proxyserver',
        password: 'huccuAn_oc7o87hubhjYY'
      });
    
      await page.goto('https://api.ipify.org?format=json', { waitUntil: 'networkidle2' });
    
    // Thiết lập timeout cho page
    const timeout = 15000; // Page-level timeout
    page.setDefaultTimeout(timeout);

    console.log('Setting cookies...');
    try {
        // The `sameSite` property has been removed from the cookies as it was null which is not a valid value.
        await page.setCookie(...cookies.map(c => ({...c, sameSite: c.sameSite === null ? undefined : c.sameSite})));
        console.log('Cookies set successfully');
    } catch (error) {
        console.error('Error setting cookies:', error);
    }

    console.log('Setting viewport...');
    await page.setViewport({
        width: 736,
        height: 694
    });

    console.log('Navigating to eBay sign-in page...');
    try {
        const response = await page.goto('https://www.ebay.com/signin/?sgn=reg&siteid=0', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        console.log(`Page loaded with status: ${response.status()}`);
    } catch (error) {
        console.error('Error navigating to eBay:', error);
        throw error;
    }

    console.log('Looking for and solving reCAPTCHAs...');
    try {
        const { captchas, solutions, solved, error } = await page.solveRecaptchas();
        console.log(`Solved ${solved.length} captchas.`);
    } catch (err) {
        console.error("Error solving captchas:", err);
    }
    
    // The rest of your script...
    // Note: The locators below are very specific and might break if eBay changes its layout.
    // Consider using more robust selectors if you encounter issues.

    try {
        console.log('Continuing with Apple sign-in...');

        console.log('Waiting 5 seconds for page to load after first click...');
        await moveMouseRandomly(page);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await moveMouseRandomly(page);
        const appleButtonSelectors = [
            'div > div > div:nth-of-type(3) span > span',
            '#signin_appl_btn span > span',
            '::-p-text(Continue with Apple)'
        ];
        
        // Tìm và click vào nút đăng nhập Apple
        let appleButtonFound = false;
        for (const selector of appleButtonSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.click(selector);
                appleButtonFound = true;
                console.log('Clicked Apple sign-in button with selector:', selector);
                break;
            } catch (error) {
                console.log(`Selector not found: ${selector}`);
            }
        }
        
        if (!appleButtonFound) {
            throw new Error('Could not find Apple sign-in button with any selector');
        }

        console.log('Entering password...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await moveMouseRandomly(page);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await moveMouseRandomly(page);
        // Định nghĩa các selector có thể có cho trường mật khẩu
        const passwordSelectors = [
            '#password_text_field',
            'input[type="password"]',
            '::-p-aria(Password)'
        ];
        
        // Tìm và điền mật khẩu
        let passwordFieldFound = false;
        for (const selector of passwordSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.type(selector, 'Nancyhd1');
                passwordFieldFound = true;
                console.log('Filled password field with selector:', selector);
                break;
            } catch (error) {
                console.log(`Password field not found with selector: ${selector}`);
            }
        }
        
        if (!passwordFieldFound) {
            throw new Error('Could not find password field with any selector');
        }

        console.log('Clicking Sign In...');
        // Định nghĩa các selector có thể có cho nút đăng nhập
        const signInButtonSelectors = [
            '#signInBtn',
            '#sign-in',
            '.btn--primary',
            'button[type="submit"]',
            'button:has-text("Sign In")',
            'button:contains("Sign In")',
            'button#signin_ggl_btn',
            'button#signin_btn',
            'button.btn--primary',
            'button.btn--large',
            'button.btn--fluid',
            'button[data-testid="signin-button"]',
            'button[data-test-id="signin-button"]',
            'button[data-test="signin-button"]',
            'button[data-testid="sign-in-button"]',
            'button[data-test-id="sign-in-button"]',
            'button[data-test="sign-in-button"]',
            'button[class*="signin"]',
            'button[class*="sign-in"]',
            'button[class*="SignIn"]',
            'button[class*="Sign-in"]',
            'a[href*="signin"][role="button"]',
            'a[href*="sign-in"][role="button"]',
            'a[class*="signin"]',
            'a[class*="sign-in"]',
            'a[class*="SignIn"]',
            'a[class*="Sign-in"]',
            'input[type="submit"][value="Sign In"]',
            'input[type="submit"][value="Sign-in"]',
            'input[type="submit"][value*="Sign"][value*="In"]'
        ];
        
        // Tìm và click vào nút đăng nhập
        let signInButtonFound = false;
        for (const selector of signInButtonSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 4000 });
                await page.click(selector);
                signInButtonFound = true;
                console.log('Clicked sign-in button with selector:', selector);
                
                // Thêm delay 3 giây sau khi click lần đầu
                console.log('Waiting 3 seconds for page to load after first click...');
                await moveMouseRandomly(page);
                await new Promise(resolve => setTimeout(resolve, 1000));
                await moveMouseRandomly(page);
                
                // Thử click lại nút đăng nhập nếu vẫn hiển thị
                console.log('Đang kiểm tra xem nút đăng nhập có vẫn hiển thị không cho click lại...');
                
                // Chờ nút Continue hiển thị
                console.log('Waiting for Continue button to appear...');
                try {
                    // Chờ tối đa 10 giây cho nút Continue xuất hiện
                    await page.waitForSelector('button.button-primary.nav-action .overflow-text:has-text("Continue")', { 
                        timeout: 8000,
                        visible: true 
                    });
                    
                    // Click nút Continue
                    await page.click('button.button-primary.nav-action');
                    console.log('Clicked Continue button with specific selector');
                    continue;
                } catch (error) {
                    console.log('Specific Continue button not found, trying other selectors...');
                }
                
                // Nếu không tìm thấy bằng selector cụ thể, thử các selector khác
                const continueButtonSelectors = [
                    // Selector chính xác dựa trên HTML
                    'button.button-primary.nav-action',
                    'div.primary-button-group > button.button-primary',
                    
                    // Selector phụ trợ
                    'button[class*="button-primary"][class*="nav-action"]',
                    'button:has(> .overflow-text:has-text("Continue"))',
                    'div.overflow-text:has-text("Continue")',
                    'div:has(> div.overflow-text:has-text("Continue"))',
                    'button:has-text("Continue")',
                    'div:has-text("Continue")',
                ];
                
                // Thử click bằng JavaScript nếu không tìm thấy bằng cách thông thường
                const tryClickWithJS = async (selector) => {
                    return await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            element.click();
                            return true;
                        }
                        return false;
                    }, selector);
                };
                
                let continueButtonFound = false;
                for (const continueSelector of continueButtonSelectors) {
                    try {
                        await page.waitForSelector(continueSelector, { timeout: 5000 });
                        
                        // Thử click bằng JavaScript
                        const clicked = await page.evaluate((selector) => {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.click();
                                console.log('Successfully clicked using JavaScript');
                                return true;
                            }
                            return false;
                        }, continueSelector);
                        
                        // Nếu click JS không thành công, thử click bình thường
                        if (!clicked) {
                            await page.click(continueSelector);
                            console.log('Clicked using normal click');
                        }
                        
                        continueButtonFound = true;
                        console.log('Successfully clicked Continue button with selector:', continueSelector);
                        break;
                    } catch (error) {
                        console.log(`Continue button not found with selector: ${continueSelector}`);
                    }
                }
                
                if (!continueButtonFound) {
                    console.log('Could not find any Continue button to click');
                } else {
                    // Chờ 10 giây cho trang load xong
                    console.log('Waiting 10 seconds before filling email...');
                    await moveMouseRandomly(page);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await moveMouseRandomly(page);
                    
                    // Tạo email ngẫu nhiên
                    const randomString = Math.random().toString(36).substring(2, 10);
                    const randomEmail = `test${randomString}@gmail.com`;
                    
                    // Điền email vào trường input nếu có
                    try {
                        // Kiểm tra xem có trường email không
                        const emailField = await page.$('input#email');
                        if (emailField) {
                            await page.type('input#email', randomEmail, { delay: 100 });
                            console.log('Filled random email:', randomEmail);
                            
                            // Chờ 1 giây rồi click nút Continue
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // Thử click nút Continue với các selector ưu tiên
                            const continueSelectors = [
                                'button#link_success_btn',
                                'button[type="submit"]',
                                'button:has-text("Continue")',
                                'button.button-primary',
                                'button.primary',
                                'button.btn--primary',
                                'button.continue'
                            ];
                            
                            for (const selector of continueSelectors) {
                                const button = await page.$(selector);
                                if (button) {
                                    const isVisible = await button.isVisible();
                                    if (isVisible) {
                                        await button.click();
                                        console.log('Đã click nút Continue với selector:', selector);
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        break;
                                    }
                                }
                            }
                        } else {
                            console.log('No email field found, skipping email input step');
                        }
                    } catch (error) {
                        console.log('Error during email input or continue click:', error.message);
                    }
                }
                
                try {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Tăng thời gian chờ lên 10s
                    // Cập nhật biến toàn cục socialUrl với URL hiện tại của trang
                    socialUrl = page.url();
                    const sleep = ms => new Promise(r => setTimeout(r, ms));
                    
                    if (socialUrl.includes("socialreg")) {
                        const totalRequests = 85;
                        for (let i = 0; i < totalRequests; i++) {
                            try {
                                const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
                                const response = await fetch(`${serverUrl}/process-url`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({ url: socialUrl })
                                });
                                const result = await response.json();
                                console.log(`Result ${i + 1}/${totalRequests}:`, result);
                                
                                if (result.success) {
                                    const email = result.email || 'unknown';
                                    // Cập nhật socialUrl toàn cục nếu có redirectUrl mới
                                    if (result.redirectUrl) {
                                        socialUrl = result.redirectUrl;
                                    }
                                    const filePath = `${email}.txt`;
                                    await fs.promises.writeFile(filePath, socialUrl);
                                    console.log(`Successfully saved URL to ${filePath}`);
                                }
                                
                                await sleep(10000); // delay 10 giây giữa các request
                            } catch (error) {
                                console.error(`Error on request ${i + 1}:`, error.message);
                            }
                        }
                        
                        // Tự động gửi request đến chính server
                        try {
                            const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
                            const response = await fetch(serverUrl, {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                                }
                            });
                            console.log('Tự động gửi request đến server, status:', response.status);
                        } catch (error) {
                            console.error('Lỗi khi gửi request tự động:', error.message);
                        }
                        
                        // Tạo thời gian chờ ngẫu nhiên từ 500s đến 800s (khoảng 8-13 phút)
                        const randomDelay = Math.floor(Math.random() * (800000 - 500000 + 1)) + 500000;
                        console.log(`Chờ ${randomDelay/1000} giây trước khi chạy lại...`);
                        await sleep(randomDelay);
                    }
                } catch (error) {
                    console.error('Lỗi khi lưu URL vào file:', error.message);
                }
                
                await browser.close();
                process.exit(0);
                
                break;
            } catch (error) {
                console.log(`Sign-in button not found with selector: ${selector}`);
            }
        }
        
        if (!signInButtonFound) {
            throw new Error('Could not find sign-in button with any selector');
        }
        
        // ... (the rest of your automation script)
        
    } catch (error) {
        console.error('An error occurred during the automation steps after captcha solving:', error);
    }


    } catch (error) {
        console.error('Error in automation:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Hàm khởi tạo trình duyệt
async function startBrowser() {
    try {
        logger.info('Đang khởi tạo trình duyệt...');
        // Thêm code khởi tạo trình duyệt nếu cần
        logger.info('Trình duyệt đã sẵn sàng');
    } catch (error) {
        logger.error('Lỗi khi khởi tạo trình duyệt:', error);
    }
}

// Hàm tải lại trang
async function pageReload() {
    try {
        logger.info('Đang tải lại trang...');
        // Thêm code tải lại trang nếu cần
        logger.info('Đã tải lại trang');
    } catch (error) {
        logger.error('Lỗi khi tải lại trang:', error);
    }
}

// Hàm cập nhật trạng thái
async function updateStatus() {
    try {
        const now = new Date();
        const uptime = Math.floor((now - new Date(mStart)) / 1000);
        logger.info(`Trạng thái: Đang hoạt động | Uptime: ${Math.floor(uptime / 60)} phút`);
    } catch (error) {
        logger.error('Lỗi khi cập nhật trạng thái:', error);
    }
}

// Hàm chạy lặp lại liên tục
async function runLoop() {
    let runCount = 0;
    while (true) {
        runCount++;
        const startTime = new Date();
        console.log(`\n=== Bắt đầu lần chạy thứ ${runCount} lúc ${startTime.toLocaleString()} ===`);
        
        try {
            await runAutomation();
        } catch (error) {
            console.error('Lỗi trong quá trình chạy tự động:', error);
        }
        
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000; // tính bằng giây
        
        console.log(`\nHoàn thành lần chạy thứ ${runCount} trong ${duration.toFixed(2)} giây`);
        console.log('Chuẩn bị chạy lại...');
    }
}

// Bắt đầu chạy vòng lặp
runLoop().catch(err => {
    console.error('Fatal error in main loop:', err);
    process.exit(1);
});

// Thêm Express server


// API endpoint để xử lý URL từ client
app.post('/process-url', express.json(), async (req, res) => {
    let browser;
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'Thiếu tham số URL' });
        }

        console.log('Nhận được yêu cầu xử lý URL:', url);
        
        // Khởi tạo trình duyệt ẩn danh
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Đặt kích thước viewport giống trình duyệt thật
        await page.setViewport({
            width: 1366,
            height: 768,
            deviceScaleFactor: 1,
            hasTouch: false,
            isLandscape: false,
            isMobile: false,
        });
        
        // Mở URL
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Xóa tất cả ảnh cũ trước khi lưu ảnh mới
        const files = await fs.readdir('.');
        const oldScreenshots = files.filter(file => file.startsWith('screenshot-') && file.endsWith('.png'));
        
        // Xóa từng ảnh cũ
        for (const file of oldScreenshots) {
            try {
                await fs.unlink(`./${file}`);
                console.log(`Đã xóa ảnh cũ: ${file}`);
            } catch (err) {
                console.error(`Lỗi khi xóa ảnh cũ ${file}:`, err);
            }
        }
        
        // Chụp ảnh màn hình mới
        const screenshotPath = `screenshot-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info(`Đã lưu ảnh chụp màn hình mới: ${screenshotPath}`);
        
        // Lấy HTML của trang
        const htmlContent = await page.content();
        
        // Lưu HTML vào file
        const htmlPath = `page-${Date.now()}.html`;
        await fs.promises.writeFile(htmlPath, htmlContent);
        logger.info(`Đã lưu nội dung HTML vào: ${htmlPath}`);
        
        // Trả về kết quả thành công
        res.json({
            success: true,
            message: 'Xử lý URL thành công',
            email: `user${Date.now()}`,
            redirectUrl: url,
            screenshot: screenshotPath,
            htmlFile: htmlPath
        });
    } catch (error) {
        logger.error('Lỗi khi xử lý URL:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi xử lý URL',
            error: error.message 
        });
    }
});

// API endpoint để cập nhật socialUrl
app.post('/update-url', express.json(), (req, res) => {
    const { url } = req.body;
    if (url) {
        socialUrl = url;
        console.log('Đã cập nhật socialUrl:', socialUrl);
        res.json({ success: true, message: 'Cập nhật URL thành công' });
    } else {
        res.status(400).json({ success: false, message: 'Thiếu tham số URL' });
    }
});

// Trang chủ hiển thị ảnh chụp màn hình
app.get('/', async (req, res) => {
    try {
        // Tìm file ảnh mới nhất
        const files = await fs.readdir('.');
        const screenshotFiles = files
            .filter(file => file.startsWith('screenshot-') && file.endsWith('.png'))
            .sort()
            .reverse();

        if (screenshotFiles.length > 0) {
            const latestScreenshot = screenshotFiles[0];
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Xem ảnh chụp màn hình</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .container { max-width: 1200px; margin: 0 auto; }
                        .screenshot { max-width: 100%; border: 1px solid #ddd; margin-bottom: 20px; }
                        .info { background: #f5f5f5; padding: 10px; margin-bottom: 20px; }
                        a { color: #0066cc; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Ảnh chụp màn hình mới nhất</h1>
                        <div class="info">
                            <p><strong>URL hiện tại:</strong> ${socialUrl || 'Chưa có URL'}</p>
                            <p><strong>Thời gian:</strong> ${new Date().toLocaleString()}</p>
                            <p><a href="/screenshots">Xem tất cả ảnh</a></p>
                        </div>
                        <div class="screenshot-container">
                            <img src="/screenshot/${latestScreenshot}" class="screenshot" alt="Screenshot" />
                        </div>
                    </div>
                </body>
                </html>
            `;
            res.send(html);
        } else if (socialUrl) {
            res.redirect(socialUrl);
        } else {
            res.send('Chưa có ảnh chụp màn hình nào. Vui lòng chờ...');
        }
    } catch (error) {
        res.status(500).send('Lỗi khi tải ảnh chụp màn hình: ' + error.message);
    }
});

// Endpoint để xem tất cả ảnh chụp màn hình
app.get('/screenshots', async (req, res) => {
    try {
        const files = await fs.readdir('.');
        const screenshotFiles = files
            .filter(file => file.startsWith('screenshot-') && file.endsWith('.png'))
            .sort()
            .reverse();

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tất cả ảnh chụp màn hình</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .container { max-width: 1200px; margin: 0 auto; }
                    .screenshot { max-width: 100%; border: 1px solid #ddd; margin-bottom: 20px; }
                    .screenshot-item { margin-bottom: 40px; padding: 10px; border-bottom: 1px solid #eee; }
                    .info { background: #f5f5f5; padding: 10px; margin-bottom: 10px; }
                    a { color: #0066cc; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Tất cả ảnh chụp màn hình</h1>
                    <p><a href="/">← Quay lại</a></p>
        `;

        if (screenshotFiles.length === 0) {
            html += '<p>Chưa có ảnh chụp màn hình nào.</p>';
        } else {
            for (const file of screenshotFiles) {
                html += `
                    <div class="screenshot-item">
                        <div class="info">
                            <p><strong>File:</strong> ${file}</p>
                            <p><a href="/screenshot/${file}" target="_blank">Xem ảnh gốc</a></p>
                        </div>
                        <img src="/screenshot/${file}" class="screenshot" alt="Screenshot" />
                    </div>
                `;
            }
        }

        html += `
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (error) {
        res.status(500).send('Lỗi khi tải danh sách ảnh: ' + error.message);
    }
});

// Endpoint để phục vụ file ảnh
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.get('/screenshot/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = `./${filename}`;
    
    res.sendFile(filePath, { root: __dirname }, (err) => {
        if (err) {
            res.status(404).send('Không tìm thấy ảnh');
        }
    });
});

// Khởi động server
app.listen(PORT, () => {
    logger.info(`Server đang chạy trên cổng ${PORT}`);
    logger.info(`Truy cập: http://localhost:${PORT}`);
    
    // Start browser and intervals after server starts
    startBrowser();
    
    // Set up intervals
    setInterval(async () => {
        await pageReload();
    }, 30*60*1000);
    
    setInterval(async () => {
        await updateStatus();
    }, 60000);
});
