const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Lấy thông tin từ môi trường GitHub Secrets hoặc file local
const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    try {
        console.log("1. Khởi tạo quyền truy cập...");
        let creds;
        if (process.env.GOOGLE_JSON) {
            creds = JSON.parse(process.env.GOOGLE_JSON);
        } else {
            creds = JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        }

        const auth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Bật trình duyệt tàng hình trên Cloud...");
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("3. Truy cập TopCV...");
        await page.goto('https://www.topcv.vn/viec-lam-it-phan-mem-c10026', { waitUntil: 'networkidle2' });

        // Cuộn trang để kích hoạt nạp dữ liệu (Lazy Load)
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise(r => setTimeout(r, 2000));

        const jobs = await page.evaluate(() => {
            const items = document.querySelectorAll('.job-item-2, .job-item-search-result, [class*="job-item"]');
            return Array.from(items).map(item => ({
                'Tiêu đề': item.querySelector('.title, .job-title, h3')?.innerText.trim(),
                'Công ty': item.querySelector('.company, .company-name')?.innerText.trim(),
                'Địa điểm': item.querySelector('.address, .location')?.innerText.trim(),
                'Ngày quét': new Date().toLocaleString('vi-VN')
            })).filter(j => j['Tiêu đề'] && j['Tiêu đề'].length > 3);
        });

        if (jobs.length > 0) {
            console.log(`4. Thành công! Tìm thấy ${jobs.length} tin. Đang lưu...`);
            await sheet.addRows(jobs);
            console.log("--- HOÀN THÀNH MỸ MÃN! ---");
        } else {
            console.log("GitHub cũng không thấy tin. Có thể cần kiểm tra lại Selector.");
        }
        await browser.close();
    } catch (e) { console.error("Lỗi:", e.message); }
}
startBot();