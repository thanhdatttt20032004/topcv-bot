const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    let browser;
    try {
        console.log("1. Xác thực Google Sheets...");
        let creds = process.env.GOOGLE_JSON ? JSON.parse(process.env.GOOGLE_JSON) : JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: creds.private_key.replace(/\\n/g, '\n'),
        });
        await doc.loadInfo();
        console.log("--- KẾT NỐI SHEET THÀNH CÔNG: " + doc.title);
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Khởi động trình duyệt...");
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();

        // Tối ưu: Chặn tải ảnh và CSS để load cực nhanh
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log("3. Truy cập TopCV...");
        await page.goto('https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026', { 
            waitUntil: 'domcontentloaded', // Chỉ đợi HTML xong là quét luôn
            timeout: 30000 
        });

        console.log("4. Đang bóc tách dữ liệu...");
        const jobs = await page.evaluate(() => {
            const results = [];
            // Tìm các thẻ chứa tiêu đề công việc (cấu trúc bền vững nhất của TopCV)
            const titles = document.querySelectorAll('.job-title, h3.title, a.title');
            
            titles.forEach(el => {
                const container = el.closest('div[class*="job"]') || el.parentElement.parentElement;
                const company = container.querySelector('.company, .company-name')?.innerText.trim() || 'Farmers Market check';
                const address = container.querySelector('.address, .location')?.innerText.trim() || 'Hồ Chí Minh';
                
                if (el.innerText.trim().length > 5) {
                    results.push({
                        'Tiêu đề': el.innerText.trim(),
                        'Công ty': company,
                        'Địa điểm': address,
                        'Ngày quét': new Date().toLocaleString('vi-VN')
                    });
                }
            });
            return results;
        });

        if (jobs.length > 0) {
            console.log(`5. THÀNH CÔNG! Tìm thấy ${jobs.length} tin. Đang lưu...`);
            await sheet.addRows(jobs);
            console.log("--- DỮ LIỆU ĐÃ VỀ SHEET ---");
        } else {
            console.log("Cảnh báo: Không tìm thấy tin. Đang chụp ảnh debug...");
            await page.screenshot({ path: 'debug.png', fullPage: true });
        }

    } catch (error) {
        console.error("Lỗi rồi Đạt ơi:", error.message);
    } finally {
        if (browser) await browser.close();
    }
}

startBot();
